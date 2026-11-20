'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DetailRow, GroupRow, MonthReport, MonthSummary } from '@/lib/coupang/types';
import { RevenueColumns, ShareBar, type ColumnDatum } from './charts';
import { count, monthLabel, percent, shortDate, signedPercent, weekday, won } from './format';

const PASSWORD_KEY = 'coupang-dashboard-password';

function currentMonthKst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' })
    .format(new Date())
    .slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function readPassword(): string {
  try {
    return sessionStorage.getItem(PASSWORD_KEY) ?? '';
  } catch {
    return '';
  }
}

function savePassword(v: string) {
  try {
    sessionStorage.setItem(PASSWORD_KEY, v);
  } catch {
    /* 저장 불가 — 이번 화면에서만 사용 */
  }
}

type LoadState =
  | { kind: 'idle' | 'loading' }
  | { kind: 'ready'; report: MonthReport }
  | { kind: 'error'; message: string; needPassword?: boolean };

export function CoupangDashboard() {
  const maxMonth = useMemo(currentMonthKst, []);
  const [month, setMonth] = useState(maxMonth);
  const [trendMonths, setTrendMonths] = useState(6);
  const [password, setPassword] = useState('');
  const [state, setState] = useState<LoadState>({ kind: 'idle' });
  const [lastReport, setLastReport] = useState<MonthReport | null>(null);

  const load = useCallback(
    async (refresh = false, pw = password) => {
      setState({ kind: 'loading' });
      try {
        const qs = new URLSearchParams({ month, months: String(trendMonths) });
        if (refresh) qs.set('refresh', '1');
        const res = await fetch(`/api/coupang/report?${qs}`, {
          headers: pw ? { 'x-dashboard-password': pw } : {},
          cache: 'no-store',
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setState({ kind: 'error', message: body.error ?? `오류 (HTTP ${res.status})`, needPassword: body.needPassword });
          return;
        }
        setLastReport(body as MonthReport);
        setState({ kind: 'ready', report: body as MonthReport });
      } catch (e) {
        setState({ kind: 'error', message: `서버에 연결하지 못했습니다: ${(e as Error).message}` });
      }
    },
    [month, trendMonths, password],
  );

  useEffect(() => {
    const pw = readPassword();
    if (pw) setPassword(pw);
    // 비밀번호를 읽은 뒤 첫 조회
    void load(false, pw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, trendMonths]);

  const report = state.kind === 'ready' ? state.report : lastReport?.month === month ? lastReport : null;
  const loading = state.kind === 'loading';

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Coupang Partners</p>
          <h1 className="text-2xl font-bold tracking-tight">수익률 리포트</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            실적 상세 리포트를 바탕으로 수익률(수익 ÷ 주문금액)과 월별 증감을 계산합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border bg-card">
            <button
              type="button"
              className="px-3 py-2 text-sm hover:bg-muted disabled:opacity-40"
              onClick={() => setMonth(shiftMonth(month, -1))}
              aria-label="이전 달"
              disabled={loading}
            >
              ‹
            </button>
            <input
              type="month"
              value={month}
              max={maxMonth}
              onChange={(e) => e.target.value && e.target.value <= maxMonth && setMonth(e.target.value)}
              className="w-[9.5rem] bg-transparent px-1 py-2 text-center text-sm font-medium outline-none"
              aria-label="조회 월"
            />
            <button
              type="button"
              className="px-3 py-2 text-sm hover:bg-muted disabled:opacity-40"
              onClick={() => setMonth(shiftMonth(month, 1))}
              aria-label="다음 달"
              disabled={loading || month >= maxMonth}
            >
              ›
            </button>
          </div>
          <select
            value={trendMonths}
            onChange={(e) => setTrendMonths(Number(e.target.value))}
            className="rounded-lg border bg-card px-3 py-2 text-sm"
            aria-label="추이 기간"
            disabled={loading}
          >
            <option value={3}>최근 3개월</option>
            <option value={6}>최근 6개월</option>
            <option value={12}>최근 12개월</option>
          </select>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? '불러오는 중…' : '새로고침'}
          </button>
        </div>
      </header>

      {state.kind === 'error' && state.needPassword ? (
        <PasswordForm
          message={password ? '비밀번호가 맞지 않습니다.' : undefined}
          onSubmit={(pw) => {
            setPassword(pw);
            savePassword(pw);
            void load(false, pw);
          }}
        />
      ) : null}

      {state.kind === 'error' && !state.needPassword ? <Notice tone="error">{state.message}</Notice> : null}

      {!report && loading ? <Skeleton /> : null}

      {report ? <ReportView report={report} /> : null}
    </main>
  );
}

function PasswordForm({ onSubmit, message }: { onSubmit: (pw: string) => void; message?: string }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="mx-auto mt-10 max-w-sm rounded-xl border bg-card p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (value) onSubmit(value);
      }}
    >
      <h2 className="text-lg font-semibold">비밀번호 입력</h2>
      <p className="mt-1 text-sm text-muted-foreground">이 리포트는 비밀번호로 보호되어 있습니다.</p>
      {message ? <p className="mt-2 text-sm" style={{ color: 'var(--bad)' }}>{message}</p> : null}
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="mt-4 w-full rounded-lg border bg-background px-3 py-2 text-sm"
        autoFocus
      />
      <button type="submit" className="mt-3 w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground">
        확인
      </button>
    </form>
  );
}

function Notice({ tone, children }: { tone: 'warn' | 'error'; children: React.ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className="mb-4 rounded-lg border px-4 py-3 text-sm"
      style={
        tone === 'error'
          ? { borderColor: 'var(--bad)', color: 'var(--bad)' }
          : { background: 'var(--warn-bg)', borderColor: 'var(--warn-border)', color: 'var(--warn-text)' }
      }
    >
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl border bg-card" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ReportView({ report }: { report: MonthReport }) {
  const t = report.totals;
  const current = report.trend[report.trend.length - 1];
  const previous = report.trend.length > 1 ? report.trend[report.trend.length - 2] : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          조회 기간 {report.start} ~ {report.end}
          {report.isCurrentMonth ? ` (${report.daysInMonth}일 중 ${report.elapsedDays}일 경과)` : ''}
        </span>
        <span>
          데이터 기준 {new Date(report.meta.fetchedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
          {report.meta.fromCache ? ' · 저장된 데이터' : ''}
        </span>
        <span>
          API 호출 {report.meta.apiCallsLastHour}/{report.meta.apiCallLimit}회 (최근 1시간)
        </span>
      </div>

      {report.meta.warnings.map((w) => (
        <Notice key={w} tone="warn">
          {w}
        </Notice>
      ))}

      {/* KPI */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3" aria-label="핵심 지표">
        <Stat
          label={`${monthLabel(report.month)} 순수익`}
          value={won(t.netCommission)}
          hint={
            report.projection
              ? `월말 예상 ${won(report.projection.commission)} (하루 평균 ${won(report.projection.dailyCommission)})`
              : `취소 전 수익 ${won(t.orderCommission)}`
          }
        />
        <Stat
          label="월 수익률 (수익 ÷ 주문금액)"
          value={percent(t.rate)}
          hint={`취소 전 ${percent(t.grossRate)} · 주문 ${won(t.orderGmv)} 기준`}
          emphasis
        />
        <Stat
          label="순 주문금액"
          value={won(t.netGmv)}
          hint={`주문 ${won(t.orderGmv)} · 취소 ${won(Math.abs(t.cancelGmv))} (취소율 ${percent(t.cancelRate, 1)})`}
        />
        <Stat
          label="전환율 (주문 ÷ 클릭)"
          value={percent(t.conversion)}
          hint={`클릭 ${count(t.clicks)} · 주문 ${count(t.orders)} · 취소 ${count(t.cancels)}`}
        />
        <Stat
          label="클릭당 수익"
          value={won(t.epc, 1)}
          hint={`주문 1건 평균 ${won(t.aov)}`}
        />
        <Stat
          label="전월 대비 수익"
          value={signedPercent(current?.commissionGrowth)}
          delta={current?.commissionGrowth ?? null}
          hint={
            !previous || previous.missing
              ? '비교할 지난 달 데이터 없음'
              : previous.commission === 0
                ? '지난 달 수익이 0원이라 증감률을 계산할 수 없습니다'
                : current?.partial && current.projectedGrowth !== null
                  ? `지난 달 ${won(previous.commission)} · 월말 예상 기준 ${signedPercent(current.projectedGrowth)}`
                  : `지난 달 ${won(previous.commission)}`
          }
        />
      </section>

      <TrendSection trend={report.trend} />

      <DetailTabs report={report} />

      <Formulas />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  delta,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  emphasis?: boolean;
}) {
  const color =
    delta === undefined || delta === null || delta === 0 ? undefined : delta > 0 ? 'var(--good)' : 'var(--bad)';
  return (
    <div className={`rounded-xl border bg-card p-4 ${emphasis ? 'ring-2 ring-primary' : ''}`}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight" style={color ? { color } : undefined}>
        {delta !== undefined && delta !== null && delta !== 0 ? (delta > 0 ? '▲ ' : '▼ ') : ''}
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function Growth({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">-</span>;
  const color = value > 0 ? 'var(--good)' : value < 0 ? 'var(--bad)' : undefined;
  return (
    <span className="tabular-nums" style={color ? { color } : undefined}>
      {value > 0 ? '▲' : value < 0 ? '▼' : ''} {signedPercent(value)}
    </span>
  );
}

function Card({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-end justify-between gap-2 px-4 pt-4 sm:px-5">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      <div className="px-4 pb-4 pt-3 sm:px-5">{children}</div>
    </section>
  );
}

const th = 'whitespace-nowrap px-2 py-2 text-xs font-medium text-muted-foreground';
const td = 'whitespace-nowrap px-2 py-2 tabular-nums';

function TrendSection({ trend }: { trend: MonthSummary[] }) {
  const data: ColumnDatum[] = trend.map((m) => ({
    key: m.month,
    label: `${Number(m.month.slice(5, 7))}월`,
    value: m.commission,
    soft: m.partial,
    lines: [
      `수익률 ${percent(m.rate)}`,
      `주문금액 ${won(m.gmv)}`,
      ...(m.partial && m.projectedCommission !== null ? [`월말 예상 ${won(m.projectedCommission)}`] : []),
    ],
  }));
  const rows = [...trend].reverse();

  return (
    <Card title="월별 수익률 추이" subtitle="월별 순수익 · 진행 중인 달은 연한 색 (월말 전 실적)">
      <RevenueColumns data={data} />
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-right">
              <th className={`${th} text-left`}>월</th>
              <th className={th}>수익</th>
              <th className={th}>월 수익률</th>
              <th className={th}>전월 대비 수익</th>
              <th className={th}>주문금액</th>
              <th className={th}>클릭</th>
              <th className={th}>주문</th>
              <th className={th}>전환율</th>
              <th className={th}>클릭당 수익</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.month} className="border-b last:border-0 text-right">
                <td className={`${td} text-left font-medium`}>
                  {monthLabel(m.month)}
                  {m.partial ? <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">진행 중</span> : null}
                  {m.missing ? <span className="ml-1.5 text-[10px] text-muted-foreground">(조회 실패)</span> : null}
                </td>
                <td className={`${td} font-semibold`}>
                  {won(m.commission)}
                  {m.partial && m.projectedCommission !== null ? (
                    <div className="text-[11px] font-normal text-muted-foreground">예상 {won(m.projectedCommission)}</div>
                  ) : null}
                </td>
                <td className={`${td} font-semibold`}>{percent(m.rate)}</td>
                <td className={td}>
                  <Growth value={m.commissionGrowth} />
                  {m.partial && m.projectedGrowth !== null ? (
                    <div className="text-[11px] text-muted-foreground">예상 기준 {signedPercent(m.projectedGrowth)}</div>
                  ) : null}
                </td>
                <td className={td}>{won(m.gmv)}</td>
                <td className={td}>{count(m.clicks)}</td>
                <td className={td}>{count(m.orders)}</td>
                <td className={td}>{percent(m.conversion)}</td>
                <td className={td}>{won(m.epc, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

type Tab = 'details' | 'category' | 'product' | 'daily';

function DetailTabs({ report }: { report: MonthReport }) {
  const [tab, setTab] = useState<Tab>('details');
  const tabs: Array<[Tab, string]> = [
    ['details', `실적 상세 (${report.details.length})`],
    ['category', '카테고리별'],
    ['product', '상품별'],
    ['daily', '일별'],
  ];
  return (
    <Card
      title={`${monthLabel(report.month)} 실적`}
      subtitle="수익률 = 수익 ÷ 주문금액 · 수익 비중 = 항목 수익 ÷ 이번 달 순수익"
      actions={
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="tablist">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === key ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {tab === 'details' ? <DetailTable rows={report.details} report={report} /> : null}
      {tab === 'category' ? <GroupTable rows={report.byCategory} label="카테고리" report={report} /> : null}
      {tab === 'product' ? <GroupTable rows={report.byProduct} label="상품" report={report} /> : null}
      {tab === 'daily' ? <DailyView report={report} /> : null}
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{children}</p>;
}

function DetailTable({ rows, report }: { rows: DetailRow[]; report: MonthReport }) {
  if (!rows.length) return <Empty>이 기간에 주문·취소 내역이 없습니다.</Empty>;
  const t = report.totals;
  const sumQty = rows.reduce((a, r) => a + r.quantity, 0);
  const sumGmv = t.orderGmv + t.cancelGmv;
  const sumCommission = t.orderCommission + t.cancelCommission;
  return (
    <>
      {/* 모바일: 카드 목록 */}
      <ul className="divide-y sm:hidden">
        {rows.map((r, i) => (
          <li key={`m-${r.type}-${r.orderId}-${r.productId}-${i}`} className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium" title={r.productName}>
                  {r.productName}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <TypeBadge type={r.type} />
                  <span>
                    {shortDate(r.date)}({weekday(r.date)}) · {r.categoryName} · {count(r.quantity)}개
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-semibold tabular-nums" style={r.commission < 0 ? { color: 'var(--bad)' } : undefined}>
                  {won(r.commission)}
                </div>
                <div className="text-[11px] text-muted-foreground">수익률 {percent(r.rate)}</div>
              </div>
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>주문금액 {won(r.gmv)}</span>
              <span>수익 비중 {percent(r.share, 1)}</span>
            </div>
          </li>
        ))}
        <li className="flex items-center justify-between py-3 text-sm font-semibold">
          <span>합계 (주문 − 취소)</span>
          <span className="text-right tabular-nums">
            {won(sumCommission)}
            <span className="block text-[11px] font-normal text-muted-foreground">
              {won(sumGmv)} · 수익률 {percent(rateOf(sumCommission, sumGmv))}
            </span>
          </span>
        </li>
      </ul>

    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-right">
            <th className={`${th} text-left`}>날짜</th>
            <th className={`${th} text-left`}>구분</th>
            <th className={`${th} text-left`}>상품</th>
            <th className={th}>수량</th>
            <th className={th}>주문금액</th>
            <th className={th}>수익</th>
            <th className={th}>수익률</th>
            <th className={th}>쿠팡 수수료율</th>
            <th className={th}>수익 비중</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.type}-${r.orderId}-${r.productId}-${i}`} className="border-b last:border-0 text-right">
              <td className={`${td} text-left`}>
                {shortDate(r.date)} <span className="text-muted-foreground">({weekday(r.date)})</span>
                {r.type === 'cancel' && r.orderDate !== r.date ? (
                  <div className="text-[11px] text-muted-foreground">주문 {shortDate(r.orderDate)}</div>
                ) : null}
              </td>
              <td className={`${td} text-left`}>
                <TypeBadge type={r.type} />
              </td>
              <td className="min-w-[14rem] max-w-[22rem] px-2 py-2 text-left">
                <div className="truncate" title={r.productName}>
                  {r.productName}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {r.categoryName}
                  {r.subId ? ` · ${r.subId}` : ''}
                </div>
              </td>
              <td className={td}>{count(r.quantity)}</td>
              <td className={td}>{won(r.gmv)}</td>
              <td className={`${td} font-semibold`} style={r.commission < 0 ? { color: 'var(--bad)' } : undefined}>
                {won(r.commission)}
              </td>
              <td className={`${td} font-semibold`}>{percent(r.rate)}</td>
              <td className={`${td} text-muted-foreground`}>
                {r.apiRateType && r.apiRateType !== 'PERCENTAGE' ? r.apiRateType : percent(r.apiRate)}
              </td>
              <td className={td}>
                <ShareBar value={r.share} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 text-right font-semibold">
            <td className={`${td} text-left`} colSpan={3}>
              합계 (주문 − 취소)
            </td>
            <td className={td}>{count(sumQty)}</td>
            <td className={td}>{won(sumGmv)}</td>
            <td className={td}>{won(sumCommission)}</td>
            <td className={td}>{percent(rateOf(sumCommission, sumGmv))}</td>
            <td className={td} />
            <td className={td}>
              <ShareBar value={rateOf(sumCommission, t.netCommission)} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
    </>
  );
}

function TypeBadge({ type }: { type: DetailRow['type'] }) {
  return type === 'order' ? (
    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-foreground">주문</span>
  ) : (
    <span className="rounded px-1.5 py-0.5 text-[11px]" style={{ color: 'var(--bad)', border: '1px solid var(--bad)' }}>
      취소
    </span>
  );
}

function rateOf(a: number, b: number): number | null {
  return b ? (a / b) * 100 : null;
}

function GroupTable({ rows, label, report }: { rows: GroupRow[]; label: string; report: MonthReport }) {
  if (!rows.length) return <Empty>이 기간에 주문·취소 내역이 없습니다.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-right">
            <th className={`${th} text-left`}>{label}</th>
            <th className={th}>수익</th>
            <th className={th}>수익률</th>
            <th className={th}>수익 비중</th>
            <th className={th}>주문금액</th>
            <th className={th}>주문</th>
            <th className={th}>수량</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.key} className="border-b last:border-0 text-right">
              <td className="min-w-[9rem] max-w-[24rem] px-2 py-2 text-left">
                <div className="truncate" title={g.name}>
                  {g.name}
                </div>
              </td>
              <td className={`${td} font-semibold`}>{won(g.commission)}</td>
              <td className={`${td} font-semibold`}>{percent(g.rate)}</td>
              <td className={td}>
                <ShareBar value={g.share} />
              </td>
              <td className={td}>{won(g.gmv)}</td>
              <td className={td}>{count(g.orders)}</td>
              <td className={td}>{count(g.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted-foreground">
        이번 달 순수익 {won(report.totals.netCommission)} 기준. 취소된 주문은 해당 항목에서 차감됩니다.
      </p>
    </div>
  );
}

function DailyView({ report }: { report: MonthReport }) {
  const [activeOnly, setActiveOnly] = useState(true);
  const data: ColumnDatum[] = report.daily.map((d) => ({
    key: d.date,
    label: `${Number(d.date.slice(8, 10))}일`,
    value: d.netCommission,
    lines: [`클릭 ${count(d.clicks)} · 주문 ${count(d.orders)}`, `수익률 ${percent(d.rate)}`],
  }));
  const rows = [...report.daily].reverse().filter((d) => !activeOnly || d.clicks || d.orders || d.cancels || d.netCommission);
  return (
    <div>
      <RevenueColumns data={data} height={180} />
      <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
        클릭·주문이 있는 날만 보기
      </label>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-right">
              <th className={`${th} text-left`}>날짜</th>
              <th className={th}>수익</th>
              <th className={th}>수익률</th>
              <th className={th}>전환율</th>
              <th className={th}>클릭</th>
              <th className={th}>주문</th>
              <th className={th}>취소</th>
              <th className={th}>주문금액</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.date} className="border-b last:border-0 text-right">
                <td className={`${td} text-left`}>
                  {shortDate(d.date)} <span className="text-muted-foreground">({weekday(d.date)})</span>
                </td>
                <td className={`${td} font-semibold`}>{won(d.netCommission)}</td>
                <td className={td}>{percent(d.rate)}</td>
                <td className={td}>{percent(d.conversion)}</td>
                <td className={td}>{count(d.clicks)}</td>
                <td className={td}>{count(d.orders)}</td>
                <td className={td}>{count(d.cancels)}</td>
                <td className={td}>{won(d.netGmv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <Empty>이 기간에 클릭·주문이 없습니다.</Empty> : null}
      </div>
    </div>
  );
}

function Formulas() {
  const items: Array<[string, string]> = [
    ['월 수익률', '순수익 ÷ 순주문금액 × 100 (취소 반영 후 실제로 받은 수수료 비율)'],
    ['취소 전 수익률', '주문 수익 ÷ 주문금액 × 100'],
    ['전환율', '주문수 ÷ 클릭수 × 100'],
    ['클릭당 수익', '순수익 ÷ 클릭수'],
    ['수익 비중', '항목(상품·카테고리·주문) 수익 ÷ 이번 달 순수익 × 100'],
    ['전월 대비', '(이번 달 수익 − 지난 달 수익) ÷ 지난 달 수익 × 100'],
    ['월말 예상', '이번 달 순수익 ÷ 경과 일수 × 이번 달 일수'],
  ];
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <h2 className="text-base font-semibold">계산 기준</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {items.map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <dt className="w-24 shrink-0 font-medium">{k}</dt>
            <dd className="text-muted-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        쿠팡 파트너스 Open API 리포트(일별 수익·주문·취소) 기준이며, 실제 정산 금액과는 최종 확정 시점에 따라 다를 수 있습니다.
      </p>
    </section>
  );
}
