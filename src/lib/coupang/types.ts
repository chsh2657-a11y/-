// 쿠팡 파트너스 Open API 리포트 응답 타입 (정규화 후)

export type ReportKind = 'commission' | 'orders' | 'cancels';

/** /reports/commission — 일별 수익 요약 (주문 - 취소가 반영된 순수익) */
export interface CommissionRow {
  date: string; // 'YYYY-MM-DD'
  trackingCode: string;
  subId: string;
  commission: number;
  gmv: number;
  order: number;
  cancel: number;
  click: number;
}

/** /reports/orders — 주문 상세 (상품 단위) */
export interface OrderRow {
  date: string; // 주문일 'YYYY-MM-DD'
  trackingCode: string;
  subId: string;
  orderId: string;
  productId: string;
  productName: string;
  categoryName: string;
  quantity: number;
  gmv: number;
  /** 쿠팡이 내려주는 수수료율 (%) */
  commissionRate: number;
  commissionRateType: string;
  commission: number;
}

/** /reports/cancels — 취소 상세. quantity/gmv/commission 은 음수 */
export interface CancelRow extends OrderRow {
  /** 원 주문일 'YYYY-MM-DD' (date 는 취소일) */
  orderDate: string;
}

// ---- 화면에 내려주는 계산 결과 ----

export interface Totals {
  clicks: number;
  orders: number;
  cancels: number;
  /** 취소 전 주문금액 */
  orderGmv: number;
  /** 취소 금액 (음수) */
  cancelGmv: number;
  /** 순 주문금액 (주문 - 취소) */
  netGmv: number;
  orderCommission: number;
  cancelCommission: number;
  /** 순수익 (주문 수익 - 취소 수익) */
  netCommission: number;
  /** 수익률 % = 순수익 ÷ 순주문금액 × 100 */
  rate: number | null;
  /** 취소 전 수익률 % = 주문 수익 ÷ 주문금액 × 100 */
  grossRate: number | null;
  /** 전환율 % = 주문수 ÷ 클릭수 × 100 */
  conversion: number | null;
  /** 클릭당 수익 (원) */
  epc: number | null;
  /** 취소율 % = 취소금액 ÷ 주문금액 × 100 */
  cancelRate: number | null;
  /** 객단가 (주문 1건당 주문금액) */
  aov: number | null;
}

export interface DailyRow {
  date: string;
  clicks: number;
  orders: number;
  cancels: number;
  netGmv: number;
  netCommission: number;
  rate: number | null;
  conversion: number | null;
}

export interface DetailRow {
  type: 'order' | 'cancel';
  date: string;
  orderDate: string;
  orderId: string;
  productId: string;
  productName: string;
  categoryName: string;
  subId: string;
  quantity: number;
  gmv: number;
  commission: number;
  /** 계산 수익률 % = 수익 ÷ 주문금액 × 100 */
  rate: number | null;
  /** 쿠팡 제공 수수료율 % */
  apiRate: number;
  apiRateType: string;
  /** 이번 달 순수익 대비 비중 % */
  share: number | null;
}

export interface GroupRow {
  key: string;
  name: string;
  orders: number;
  quantity: number;
  gmv: number;
  commission: number;
  rate: number | null;
  share: number | null;
}

export interface MonthSummary {
  month: string;
  clicks: number;
  orders: number;
  cancels: number;
  gmv: number;
  commission: number;
  rate: number | null;
  conversion: number | null;
  epc: number | null;
  /** 전월 대비 수익 증감률 % */
  commissionGrowth: number | null;
  /** 전월 대비 주문금액 증감률 % */
  gmvGrowth: number | null;
  /** 진행 중인 달 (아직 월말 전) */
  partial: boolean;
  /** 진행 중인 달의 월말 예상 수익 */
  projectedCommission: number | null;
  /** 예상 수익 기준 전월 대비 증감률 % */
  projectedGrowth: number | null;
  /** 데이터를 가져오지 못한 달 */
  missing?: boolean;
}

export interface MonthReport {
  month: string;
  start: string;
  end: string;
  daysInMonth: number;
  elapsedDays: number;
  isCurrentMonth: boolean;
  totals: Totals;
  /** 진행 중인 달이면 일평균 기준 월말 예상치 */
  projection: { commission: number; gmv: number; dailyCommission: number } | null;
  daily: DailyRow[];
  details: DetailRow[];
  byCategory: GroupRow[];
  byProduct: GroupRow[];
  trend: MonthSummary[];
  reconciliation: {
    summaryCommission: number;
    detailCommission: number;
    diff: number;
  };
  meta: {
    fetchedAt: string;
    fromCache: boolean;
    stale: boolean;
    warnings: string[];
    apiCallsLastHour: number;
    apiCallLimit: number;
  };
}
