// 서버 전용: 쿠팡 파트너스 Open API 리포트 호출
// 키는 환경변수(COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY)에서만 읽고 브라우저로 보내지 않습니다.

import crypto from 'node:crypto';
import { readCache, reserveApiCall, writeCache } from './cache';
import { fromApiDate, toApiDate } from './dates';
import type { CancelRow, CommissionRow, OrderRow, ReportKind } from './types';

const DOMAIN = 'https://api-gateway.coupang.com';
const REPORT_PATH = '/v2/providers/affiliate_open_api/apis/openapi/v1/reports/';

/** 쿠팡 API 는 시작~종료일 차이가 30일을 넘으면 거부합니다 */
export const MAX_RANGE_DAYS = 30;
/** 한 페이지 결과가 이 건수 이상이면 다음 페이지가 있는지 확인합니다 */
const PAGE_PROBE_THRESHOLD = 100;
const MAX_PAGES = 20;

export class CoupangApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'CoupangApiError';
  }
}

function getKeys(): { accessKey: string; secretKey: string } {
  const accessKey = process.env.COUPANG_ACCESS_KEY?.trim();
  const secretKey = process.env.COUPANG_SECRET_KEY?.trim();
  if (!accessKey || !secretKey) {
    throw new CoupangApiError(
      '쿠팡 파트너스 API 키가 설정되지 않았습니다. .env.local 에 COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY 를 넣어주세요.',
      500,
      'NO_KEYS',
    );
  }
  return { accessKey, secretKey };
}

/** 서명용 시각 (GMT) 'yyMMddTHHmmssZ' */
export function signedDate(now: Date = new Date()): string {
  const iso = now.toISOString(); // 2026-11-20T02:01:10.123Z
  return `${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
}

/** CEA HmacSHA256 Authorization 헤더 */
export function buildAuthorization(
  method: string,
  pathname: string,
  query: string,
  accessKey: string,
  secretKey: string,
  now: Date = new Date(),
): string {
  const datetime = signedDate(now);
  const message = `${datetime}${method}${pathname}${query}`;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

/** 주문번호는 Number 정밀도(2^53)를 넘을 수 있어 문자열로 파싱 */
function parseBody(text: string): { rCode?: string; rMessage?: string; data?: unknown } {
  const safe = text.replace(/"(orderId|productId)"\s*:\s*(-?\d+)/g, '"$1":"$2"');
  return JSON.parse(safe);
}

async function requestPage(kind: ReportKind, start: string, end: string, page: number): Promise<unknown[]> {
  const { accessKey, secretKey } = getKeys();
  await reserveApiCall();

  const pathname = `${REPORT_PATH}${kind}`;
  const query = `startDate=${toApiDate(start)}&endDate=${toApiDate(end)}${page > 0 ? `&page=${page}` : ''}`;
  let res: Response;
  try {
    res = await fetch(`${DOMAIN}${pathname}?${query}`, {
      method: 'GET',
      headers: {
        Authorization: buildAuthorization('GET', pathname, query, accessKey, secretKey),
        'Content-Type': 'application/json;charset=UTF-8',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new CoupangApiError(`쿠팡 API 에 연결하지 못했습니다: ${(e as Error).message}`, 502, 'NETWORK');
  }

  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new CoupangApiError(
      '쿠팡 API 인증에 실패했습니다. Access Key / Secret Key 를 확인하세요.',
      502,
      `HTTP_${res.status}`,
    );
  }
  if (res.status === 429) {
    throw new CoupangApiError('쿠팡 API 호출 한도를 초과했습니다. 잠시 후 다시 시도하세요.', 429, 'HTTP_429');
  }
  if (!res.ok) {
    throw new CoupangApiError(`쿠팡 API 오류 (HTTP ${res.status}): ${text.slice(0, 200)}`, 502, `HTTP_${res.status}`);
  }

  let body: ReturnType<typeof parseBody>;
  try {
    body = parseBody(text);
  } catch {
    throw new CoupangApiError('쿠팡 API 응답을 해석하지 못했습니다.', 502, 'BAD_JSON');
  }
  if (String(body.rCode) !== '0') {
    throw new CoupangApiError(`쿠팡 API 오류 (${body.rCode}): ${body.rMessage ?? ''}`.trim(), 502, String(body.rCode));
  }
  return Array.isArray(body.data) ? body.data : [];
}

async function fetchAllPages(kind: ReportKind, start: string, end: string): Promise<unknown[]> {
  const all: unknown[] = [];
  let firstPageSize = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await requestPage(kind, start, end, page);
    if (page === 0) firstPageSize = rows.length;
    all.push(...rows);
    if (rows.length === 0 || rows.length < PAGE_PROBE_THRESHOLD || rows.length < firstPageSize) break;
  }
  return all;
}

// ---- 정규화 ----

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

type Raw = Record<string, unknown>;

function toCommissionRow(r: Raw): CommissionRow {
  return {
    date: fromApiDate(str(r.date)),
    trackingCode: str(r.trackingCode),
    subId: str(r.subId),
    commission: num(r.commission),
    gmv: num(r.gmv),
    order: num(r.order),
    cancel: num(r.cancel),
    click: num(r.click),
  };
}

function toOrderRow(r: Raw): OrderRow {
  return {
    date: fromApiDate(str(r.date)),
    trackingCode: str(r.trackingCode),
    subId: str(r.subId),
    orderId: str(r.orderId),
    productId: str(r.productId),
    productName: str(r.productName),
    categoryName: str(r.categoryName) || '기타',
    quantity: num(r.quantity),
    gmv: num(r.gmv),
    commissionRate: num(r.commissionRate),
    commissionRateType: str(r.commissionRateType),
    commission: num(r.commission),
  };
}

function toCancelRow(r: Raw): CancelRow {
  const base = toOrderRow(r);
  return { ...base, orderDate: fromApiDate(str(r.orderDate)) || base.date };
}

// ---- 캐시를 거치는 조회 ----

export interface ReportResult<T> {
  rows: T[];
  fetchedAt: number;
  fromCache: boolean;
  /** API 호출에 실패해 예전 캐시를 대신 사용한 경우 */
  stale: boolean;
  error?: string;
}

export interface ReportOptions {
  /** 캐시 유효 시간 (ms) */
  ttlMs: number;
  /** true 면 캐시를 무시하고 새로 조회 */
  force?: boolean;
}

async function cachedReport<T>(
  kind: ReportKind,
  start: string,
  end: string,
  opts: ReportOptions,
  normalize: (r: Raw) => T,
): Promise<ReportResult<T>> {
  const key = `${kind}_${toApiDate(start)}_${toApiDate(end)}`;
  const cached = await readCache<T[]>(key);
  if (cached && !opts.force && Date.now() - cached.savedAt < opts.ttlMs) {
    return { rows: cached.data, fetchedAt: cached.savedAt, fromCache: true, stale: false };
  }
  try {
    const raw = await fetchAllPages(kind, start, end);
    const rows = raw.map((r) => normalize(r as Raw));
    const entry = await writeCache(key, rows);
    return { rows, fetchedAt: entry.savedAt, fromCache: false, stale: false };
  } catch (e) {
    if (cached) {
      return {
        rows: cached.data,
        fetchedAt: cached.savedAt,
        fromCache: true,
        stale: true,
        error: (e as Error).message,
      };
    }
    throw e;
  }
}

export function getCommissionReport(start: string, end: string, opts: ReportOptions) {
  return cachedReport('commission', start, end, opts, toCommissionRow);
}

export function getOrderReport(start: string, end: string, opts: ReportOptions) {
  return cachedReport('orders', start, end, opts, toOrderRow);
}

export function getCancelReport(start: string, end: string, opts: ReportOptions) {
  return cachedReport('cancels', start, end, opts, toCancelRow);
}
