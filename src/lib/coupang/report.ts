// 서버 전용: 한 달치 리포트를 모아서 수익률을 계산합니다.

import { apiCallsLastHour, callLimitPerHour, RateGuardError } from './cache';
import { getCancelReport, getCommissionReport, getOrderReport, type ReportResult } from './client';
import { addDays, monthRange, shiftMonth, todayKst } from './dates';
import {
  computeDaily,
  computeDetails,
  computeGroups,
  computeProjection,
  computeTotals,
  computeTrend,
  reconcile,
  type MonthInput,
} from './metrics';
import type { CommissionRow, MonthReport } from './types';

const PAST_TTL_MS = 24 * 60 * 60 * 1000;

function recentTtlMs(): number {
  const minutes = Number(process.env.COUPANG_CACHE_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 30) * 60 * 1000;
}

/** 최근 3일 이내 데이터는 아직 바뀔 수 있으니 짧게, 그 이전 달은 24시간 캐시 */
function ttlFor(end: string, today: string): number {
  return end >= addDays(today, -3) ? recentTtlMs() : PAST_TTL_MS;
}

export class ReportRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function buildMonthReport(params: {
  month?: string;
  trendMonths?: number;
  refresh?: boolean;
}): Promise<MonthReport> {
  const today = todayKst();
  const month = params.month ?? today.slice(0, 7);
  const range = monthRange(month, today);
  if (!range) throw new ReportRequestError('미래 달은 조회할 수 없습니다.', 400);

  const trendMonths = Math.min(12, Math.max(1, Math.floor(params.trendMonths ?? 6)));
  const warnings: string[] = [];
  const results: ReportResult<unknown>[] = [];
  const track = <T>(r: ReportResult<T>) => {
    results.push(r as ReportResult<unknown>);
    if (r.stale && r.error) warnings.push(`최신 데이터를 가져오지 못해 저장된 데이터를 표시합니다: ${r.error}`);
    return r;
  };

  // 1) 선택한 달 — 일별 수익 요약 + 주문 상세 + 취소 상세 (순서대로 호출해 순간 호출량을 줄임)
  const opts = { ttlMs: ttlFor(range.end, today), force: params.refresh };
  const commission = track(await getCommissionReport(range.start, range.end, opts));
  const orders = track(await getOrderReport(range.start, range.end, opts));
  const cancels = track(await getCancelReport(range.start, range.end, opts));

  // 2) 월별 추이 — 이전 달들은 일별 요약만 조회 (실패한 달은 건너뜀)
  const trendInputs: MonthInput[] = [];
  for (let i = trendMonths - 1; i >= 1; i--) {
    const m = shiftMonth(month, -i);
    const r = monthRange(m, today)!;
    let rows: CommissionRow[] | null = null;
    try {
      rows = track(await getCommissionReport(r.start, r.end, { ttlMs: ttlFor(r.end, today) })).rows;
    } catch (e) {
      warnings.push(
        e instanceof RateGuardError
          ? `${m} 월 데이터는 호출 한도 보호로 건너뛰었습니다. 잠시 후 다시 시도하세요.`
          : `${m} 월 데이터를 가져오지 못했습니다: ${(e as Error).message}`,
      );
    }
    trendInputs.push({ month: m, commission: rows, partial: false, elapsedDays: r.elapsedDays, daysInMonth: r.daysInMonth });
  }
  trendInputs.push({
    month,
    commission: commission.rows,
    partial: range.isCurrentMonth,
    elapsedDays: range.elapsedDays,
    daysInMonth: range.daysInMonth,
  });

  // 3) 계산
  const totals = computeTotals(commission.rows, cancels.rows);
  const recon = reconcile(commission.rows, orders.rows, cancels.rows);
  if (recon.dates.length) {
    const fmt = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
    const list = recon.dates
      .map((d) => `${Number(d.date.slice(5, 7))}/${Number(d.date.slice(8, 10))} ${d.diff > 0 ? '+' : ''}${fmt(d.diff)}`)
      .join(', ');
    warnings.push(
      `쿠팡 주문 상세 리포트에 아직 반영되지 않은 실적이 있습니다 (${list}). ` +
        `수익·수익률 합계는 일별 요약 기준(${fmt(recon.summaryCommission)})이고, ` +
        `실적 상세·카테고리·상품별 표에는 상세가 반영된 ${fmt(recon.detailCommission)}만 표시됩니다. ` +
        '상세가 반영되면 새로고침 시 자동으로 채워집니다.',
    );
  }

  const oldestFetch = Math.min(...results.map((r) => r.fetchedAt));
  return {
    month,
    start: range.start,
    end: range.end,
    daysInMonth: range.daysInMonth,
    elapsedDays: range.elapsedDays,
    isCurrentMonth: range.isCurrentMonth,
    totals,
    projection: range.isCurrentMonth ? computeProjection(totals, range.elapsedDays, range.daysInMonth) : null,
    daily: computeDaily(commission.rows, range.start, range.end),
    details: computeDetails(orders.rows, cancels.rows, totals.netCommission),
    byCategory: computeGroups(orders.rows, cancels.rows, totals.netCommission, 'category'),
    byProduct: computeGroups(orders.rows, cancels.rows, totals.netCommission, 'product'),
    trend: computeTrend(trendInputs),
    reconciliation: recon,
    meta: {
      fetchedAt: new Date(Number.isFinite(oldestFetch) ? oldestFetch : Date.now()).toISOString(),
      fromCache: results.every((r) => r.fromCache),
      stale: results.some((r) => r.stale),
      warnings: [...new Set(warnings)],
      apiCallsLastHour: await apiCallsLastHour(),
      apiCallLimit: callLimitPerHour(),
    },
  };
}
