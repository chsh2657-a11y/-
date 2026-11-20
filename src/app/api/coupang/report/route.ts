import crypto from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { RateGuardError } from '@/lib/coupang/cache';
import { CoupangApiError } from '@/lib/coupang/client';
import { isMonthKey } from '@/lib/coupang/dates';
import { buildMonthReport, ReportRequestError } from '@/lib/coupang/report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** DASHBOARD_PASSWORD 가 설정된 경우에만 비밀번호 확인 */
function authorized(req: NextRequest): boolean {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return true;
  const given = req.headers.get('x-dashboard-password') ?? '';
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function error(status: number, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return error(401, '비밀번호가 필요합니다.', { needPassword: true });

  const params = req.nextUrl.searchParams;
  const month = params.get('month') ?? undefined;
  if (month !== undefined && !isMonthKey(month)) return error(400, 'month 는 YYYY-MM 형식이어야 합니다.');
  const months = Number(params.get('months') ?? 6);

  try {
    const report = await buildMonthReport({
      month,
      trendMonths: Number.isFinite(months) ? months : 6,
      refresh: params.get('refresh') === '1',
    });
    return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof RateGuardError) {
      return error(429, e.message, { retryAfterSec: e.retryAfterSec });
    }
    if (e instanceof ReportRequestError) return error(e.status, e.message);
    if (e instanceof CoupangApiError) return error(e.status, e.message, { code: e.code });
    console.error('[coupang report]', e);
    return error(500, '리포트를 만드는 중 오류가 발생했습니다.');
  }
}
