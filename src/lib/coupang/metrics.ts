// 수익률 계산 (순수 함수 — API 호출 없음)
//
//   수익률      = 순수익 ÷ 순주문금액 × 100          (취소 반영 후 실제 수수료율)
//   취소 전 수익률 = 주문 수익 ÷ 주문금액 × 100
//   전환율      = 주문수 ÷ 클릭수 × 100
//   클릭당 수익  = 순수익 ÷ 클릭수
//   취소율      = 취소금액 ÷ 주문금액 × 100
//   수익 비중    = 항목 수익 ÷ 전체 순수익 × 100
//   전월 대비    = (이번 달 - 지난 달) ÷ 지난 달 × 100
//   월말 예상    = 순수익 ÷ 경과 일수 × 해당 월 일수

import { eachDay } from './dates';
import type {
  CancelRow,
  CommissionRow,
  DailyRow,
  DetailRow,
  GroupRow,
  MonthSummary,
  OrderRow,
  Totals,
} from './types';

/** a ÷ b × 100, 분모가 0 이면 null */
export function pct(a: number, b: number): number | null {
  return b ? (a / b) * 100 : null;
}

/** 증감률 %, 이전 값이 0 이면 null */
export function growth(current: number, previous: number): number | null {
  return previous ? ((current - previous) / Math.abs(previous)) * 100 : null;
}

const sum = <T>(rows: T[], pick: (r: T) => number) => rows.reduce((acc, r) => acc + pick(r), 0);

/** 부동소수 오차 정리 (원 단위 이하 0.001 반올림) */
const clean = (n: number) => Math.round(n * 1000) / 1000;

export function computeTotals(commission: CommissionRow[], orders: OrderRow[], cancels: CancelRow[]): Totals {
  const clicks = sum(commission, (r) => r.click);
  const orderCount = sum(commission, (r) => r.order);
  const cancelCount = sum(commission, (r) => r.cancel);
  const netGmv = clean(sum(commission, (r) => r.gmv));
  const netCommission = clean(sum(commission, (r) => r.commission));

  const orderGmv = clean(sum(orders, (r) => r.gmv));
  const cancelGmv = clean(sum(cancels, (r) => r.gmv));
  const orderCommission = clean(sum(orders, (r) => r.commission));
  const cancelCommission = clean(sum(cancels, (r) => r.commission));

  return {
    clicks,
    orders: orderCount,
    cancels: cancelCount,
    orderGmv,
    cancelGmv,
    netGmv,
    orderCommission,
    cancelCommission,
    netCommission,
    rate: pct(netCommission, netGmv),
    grossRate: pct(orderCommission, orderGmv),
    conversion: pct(orderCount, clicks),
    epc: clicks ? netCommission / clicks : null,
    cancelRate: pct(Math.abs(cancelGmv), orderGmv),
    aov: orderCount ? orderGmv / orderCount : null,
  };
}

/** 일별 요약 (start~end 모든 날짜, 데이터 없는 날은 0) */
export function computeDaily(commission: CommissionRow[], start: string, end: string): DailyRow[] {
  const byDate = new Map<string, DailyRow>();
  for (const date of eachDay(start, end)) {
    byDate.set(date, {
      date,
      clicks: 0,
      orders: 0,
      cancels: 0,
      netGmv: 0,
      netCommission: 0,
      rate: null,
      conversion: null,
    });
  }
  for (const r of commission) {
    const row = byDate.get(r.date);
    if (!row) continue;
    row.clicks += r.click;
    row.orders += r.order;
    row.cancels += r.cancel;
    row.netGmv += r.gmv;
    row.netCommission += r.commission;
  }
  return [...byDate.values()].map((row) => ({
    ...row,
    netGmv: clean(row.netGmv),
    netCommission: clean(row.netCommission),
    rate: pct(row.netCommission, row.netGmv),
    conversion: pct(row.orders, row.clicks),
  }));
}

/** 실적 상세: 주문 + 취소 내역 (최신순) 과 각 행의 수익률 / 수익 비중 */
export function computeDetails(orders: OrderRow[], cancels: CancelRow[], netCommission: number): DetailRow[] {
  const toDetail = (r: OrderRow, type: DetailRow['type'], orderDate: string): DetailRow => ({
    type,
    date: r.date,
    orderDate,
    orderId: r.orderId,
    productId: r.productId,
    productName: r.productName,
    categoryName: r.categoryName,
    subId: r.subId,
    quantity: r.quantity,
    gmv: r.gmv,
    commission: r.commission,
    rate: pct(r.commission, r.gmv),
    apiRate: r.commissionRate,
    apiRateType: r.commissionRateType,
    share: pct(r.commission, netCommission),
  });
  const rows = [
    ...orders.map((r) => toDetail(r, 'order', r.date)),
    ...cancels.map((r) => toDetail(r, 'cancel', r.orderDate)),
  ];
  return rows.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.orderId.localeCompare(b.orderId) ||
      (a.type === b.type ? 0 : a.type === 'order' ? -1 : 1) ||
      b.commission - a.commission,
  );
}

/** 카테고리별 / 상품별 묶음 (주문 - 취소), 수익 큰 순 */
export function computeGroups(
  orders: OrderRow[],
  cancels: CancelRow[],
  netCommission: number,
  by: 'category' | 'product',
): GroupRow[] {
  const groups = new Map<string, GroupRow & { orderIds: Set<string> }>();
  const add = (r: OrderRow, isCancel: boolean) => {
    const key = by === 'category' ? r.categoryName : r.productId || r.productName;
    const name = by === 'category' ? r.categoryName : r.productName;
    let g = groups.get(key);
    if (!g) {
      g = { key, name, orders: 0, quantity: 0, gmv: 0, commission: 0, rate: null, share: null, orderIds: new Set() };
      groups.set(key, g);
    }
    if (!isCancel) g.orderIds.add(r.orderId);
    g.quantity += r.quantity;
    g.gmv += r.gmv;
    g.commission += r.commission;
  };
  orders.forEach((r) => add(r, false));
  cancels.forEach((r) => add(r, true));

  return [...groups.values()]
    .map(({ orderIds, ...g }) => ({
      ...g,
      orders: orderIds.size,
      gmv: clean(g.gmv),
      commission: clean(g.commission),
      rate: pct(g.commission, g.gmv),
      share: pct(g.commission, netCommission),
    }))
    .sort((a, b) => b.commission - a.commission || b.gmv - a.gmv);
}

/** 진행 중인 달의 월말 예상치 (일평균 × 월 일수) */
export function computeProjection(totals: Totals, elapsedDays: number, daysInMonth: number) {
  if (elapsedDays <= 0) return null;
  const dailyCommission = totals.netCommission / elapsedDays;
  return {
    dailyCommission,
    commission: dailyCommission * daysInMonth,
    gmv: (totals.netGmv / elapsedDays) * daysInMonth,
  };
}

export interface MonthInput {
  month: string;
  commission: CommissionRow[] | null; // null = 가져오지 못함
  partial: boolean;
  elapsedDays: number;
  daysInMonth: number;
}

/** 월별 요약 + 전월 대비 증감률 (오래된 달 → 최근 달 순서로 입력) */
export function computeTrend(months: MonthInput[]): MonthSummary[] {
  const out: MonthSummary[] = [];
  months.forEach((m, i) => {
    const rows = m.commission ?? [];
    const clicks = sum(rows, (r) => r.click);
    const orders = sum(rows, (r) => r.order);
    const cancels = sum(rows, (r) => r.cancel);
    const gmv = clean(sum(rows, (r) => r.gmv));
    const commission = clean(sum(rows, (r) => r.commission));
    // 비교할 지난 달 (이번 달이나 지난 달 데이터를 못 가져왔으면 비교하지 않음)
    const prev = i > 0 && !out[i - 1].missing && m.commission !== null ? out[i - 1] : null;
    const projectedCommission =
      m.partial && m.elapsedDays > 0 ? (commission / m.elapsedDays) * m.daysInMonth : null;

    out.push({
      month: m.month,
      clicks,
      orders,
      cancels,
      gmv,
      commission,
      rate: pct(commission, gmv),
      conversion: pct(orders, clicks),
      epc: clicks ? commission / clicks : null,
      commissionGrowth: prev ? growth(commission, prev.commission) : null,
      gmvGrowth: prev ? growth(gmv, prev.gmv) : null,
      partial: m.partial,
      projectedCommission,
      projectedGrowth: prev && projectedCommission !== null ? growth(projectedCommission, prev.commission) : null,
      missing: m.commission === null ? true : undefined,
    });
  });
  return out;
}

/** 일별 요약 합계 vs 주문/취소 상세 합계 (차이가 크면 상세 데이터 누락 가능성) */
export function reconcile(commission: CommissionRow[], orders: OrderRow[], cancels: CancelRow[]) {
  const summaryCommission = clean(sum(commission, (r) => r.commission));
  const detailCommission = clean(sum(orders, (r) => r.commission) + sum(cancels, (r) => r.commission));
  return { summaryCommission, detailCommission, diff: clean(summaryCommission - detailCommission) };
}
