// 날짜 유틸 — 쿠팡 파트너스 리포트는 한국 시간(KST) 기준 날짜를 사용합니다.

const KST_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 오늘 날짜 (KST), 'YYYY-MM-DD' */
export function todayKst(now: Date = new Date()): string {
  return KST_FORMAT.format(now);
}

/** 'YYYY-MM' 형식 검사 */
export function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** month 에서 delta 개월 이동한 'YYYY-MM' */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' 에 days 일을 더한 날짜 */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export interface MonthRange {
  month: string;
  /** 조회 시작일 'YYYY-MM-DD' */
  start: string;
  /** 조회 종료일 'YYYY-MM-DD' (이번 달이면 오늘) */
  end: string;
  daysInMonth: number;
  /** 집계된 일수 (이번 달이면 오늘까지의 일수) */
  elapsedDays: number;
  isCurrentMonth: boolean;
}

/** month 의 조회 구간. 미래 달이면 null */
export function monthRange(month: string, today: string = todayKst()): MonthRange | null {
  const currentMonth = today.slice(0, 7);
  if (month > currentMonth) return null;
  const total = daysInMonth(month);
  const isCurrentMonth = month === currentMonth;
  const lastDay = isCurrentMonth ? Number(today.slice(8, 10)) : total;
  return {
    month,
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, '0')}`,
    daysInMonth: total,
    elapsedDays: lastDay,
    isCurrentMonth,
  };
}

/** start~end (포함) 의 모든 날짜 */
export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 'YYYY-MM-DD' → 'YYYYMMDD' (쿠팡 API 형식) */
export function toApiDate(date: string): string {
  return date.replaceAll('-', '');
}

/** 'YYYYMMDD' → 'YYYY-MM-DD' */
export function fromApiDate(value: string): string {
  const v = String(value ?? '');
  if (/^\d{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  return v;
}
