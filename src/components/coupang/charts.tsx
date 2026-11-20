'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { compactWon, percent, won } from './format';

export interface ColumnDatum {
  key: string;
  label: string;
  value: number;
  /** 연한 색으로 표시 (진행 중인 달) */
  soft?: boolean;
  /** 툴팁에 보여줄 추가 줄 */
  lines?: string[];
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ColumnDatum }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 font-semibold text-foreground">{d.label}</div>
      <div className="flex items-center gap-2 text-foreground">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: d.soft ? 'var(--series-1-soft)' : 'var(--series-1)' }}
        />
        수익 {won(d.value)}
      </div>
      {d.lines?.map((l) => (
        <div key={l} className="mt-0.5 text-muted-foreground">
          {l}
        </div>
      ))}
    </div>
  );
}

export function RevenueColumns({ data, height = 220 }: { data: ColumnDatum[]; height?: number }) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeWidth={1} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: 'hsl(var(--border))' }}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis
            tickFormatter={compactWon}
            width={44}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            allowDecimals={false}
          />
          <Tooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.6 }} content={<ChartTooltip />} />
          <Bar dataKey="value" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.soft ? 'var(--series-1-soft)' : 'var(--series-1)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 수익 비중 막대 (표 안에 쓰는 얇은 막대) */
export function ShareBar({ value }: { value: number | null }) {
  const w = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block">
        <div className="h-full rounded-full" style={{ width: `${w}%`, background: 'var(--series-1)' }} />
      </div>
      <span className="w-14 text-right tabular-nums">{percent(value, 1)}</span>
    </div>
  );
}
