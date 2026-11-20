const intFmt = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

/** 28,872원 */
export function won(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  const v = digits ? n.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : intFmt.format(Math.round(n));
  return `${v}원`;
}

const compactFmt = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });

/** 차트 축용: 2.25만, 7,500 */
export function compactWon(n: number): string {
  const a = Math.abs(n);
  if (a >= 100_000_000) return `${compactFmt.format(n / 100_000_000)}억`;
  if (a >= 10_000) return `${compactFmt.format(n / 10_000)}만`;
  return intFmt.format(n);
}

export function count(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  return intFmt.format(n);
}

/** 3.00% */
export function percent(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  return `${v.toFixed(digits)}%`;
}

/** +12.3% / -5.0% */
export function signedPercent(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${Math.abs(v).toFixed(digits)}%`;
}

/** '2026-11-05' → '11.05' */
export function shortDate(d: string): string {
  return d.length >= 10 ? `${d.slice(5, 7)}.${d.slice(8, 10)}` : d;
}

/** '2026-11' → '2026년 11월' */
export function monthLabel(m: string): string {
  return `${m.slice(0, 4)}년 ${Number(m.slice(5, 7))}월`;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export function weekday(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
}
