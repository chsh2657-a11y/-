import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '쿠팡 파트너스 수익률 리포트',
  description: '쿠팡 파트너스 Open API 실적을 바탕으로 수익률, 전환율, 월별 증감률을 계산합니다.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
