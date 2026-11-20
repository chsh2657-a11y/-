// 서버 전용: 쿠팡 API 응답 캐시 + 시간당 호출 수 제한
//
// 쿠팡 파트너스 Open API 는 짧은 시간에 많이 호출하면 API 사용이 일시 정지될 수 있습니다.
// 그래서 (1) 응답을 파일로 캐시하고 (2) 최근 1시간 호출 수가 한도를 넘으면 호출하지 않습니다.
// 파일에 쓸 수 없는 환경이면 메모리에만 저장합니다.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const HOUR_MS = 60 * 60 * 1000;
const CALL_LOG_FILE = 'api-calls.json';

const memoryCache = new Map<string, CacheEntry<unknown>>();
let memoryCallLog: number[] = [];
let fsUsable = true;

export interface CacheEntry<T> {
  savedAt: number;
  data: T;
}

export class RateGuardError extends Error {
  constructor(
    public readonly retryAfterSec: number,
    public readonly limit: number,
  ) {
    super(
      `쿠팡 API 보호를 위해 최근 1시간 호출 한도(${limit}회)에 도달했습니다. ` +
        `약 ${Math.ceil(retryAfterSec / 60)}분 후 다시 시도하세요.`,
    );
    this.name = 'RateGuardError';
  }
}

function cacheDir(): string {
  return process.env.COUPANG_CACHE_DIR?.trim() || path.join(process.cwd(), '.cache', 'coupang');
}

export function callLimitPerHour(): number {
  const n = Number(process.env.COUPANG_MAX_CALLS_PER_HOUR);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
}

function fileFor(key: string): string {
  return path.join(cacheDir(), `${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
}

async function readJson<T>(file: string): Promise<T | null> {
  if (!fsUsable) return null;
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  if (!fsUsable) return;
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value), 'utf8');
    await fs.rename(tmp, file);
  } catch {
    // 읽기 전용 파일시스템 등 — 메모리 캐시만 사용
    fsUsable = false;
  }
}

export async function readCache<T>(key: string): Promise<CacheEntry<T> | null> {
  const mem = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (mem) return mem;
  const disk = await readJson<CacheEntry<T>>(fileFor(key));
  if (disk && typeof disk.savedAt === 'number') {
    memoryCache.set(key, disk);
    return disk;
  }
  return null;
}

export async function writeCache<T>(key: string, data: T): Promise<CacheEntry<T>> {
  const entry: CacheEntry<T> = { savedAt: Date.now(), data };
  memoryCache.set(key, entry);
  await writeJson(fileFor(key), entry);
  return entry;
}

// ---- 호출 수 제한 ----

// 동시에 들어온 요청이 한도를 함께 넘지 않도록 예약을 직렬화
let lock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.catch(() => undefined);
  return run;
}

async function loadCallLog(): Promise<number[]> {
  const disk = await readJson<number[]>(path.join(cacheDir(), CALL_LOG_FILE));
  const merged = new Set<number>([...memoryCallLog, ...(Array.isArray(disk) ? disk : [])]);
  const cutoff = Date.now() - HOUR_MS;
  return [...merged].filter((t) => typeof t === 'number' && t > cutoff).sort((a, b) => a - b);
}

/** 쿠팡 API 1회 호출 권한을 예약합니다. 한도 초과 시 RateGuardError */
export function reserveApiCall(): Promise<void> {
  return withLock(async () => {
    const limit = callLimitPerHour();
    const log = await loadCallLog();
    if (log.length >= limit) {
      const retryAfterSec = Math.max(1, Math.ceil((log[0] + HOUR_MS - Date.now()) / 1000));
      throw new RateGuardError(retryAfterSec, limit);
    }
    log.push(Date.now());
    memoryCallLog = log;
    await writeJson(path.join(cacheDir(), CALL_LOG_FILE), log);
  });
}

export async function apiCallsLastHour(): Promise<number> {
  return (await loadCallLog()).length;
}
