# 쿠팡 파트너스 수익률 리포트

쿠팡 파트너스 Open API 의 실적 리포트(일별 수익 · 주문 상세 · 취소 상세)를 가져와서
**수익률(수익 ÷ 주문금액)**, **월 수익률**, **전월 대비 증감률** 등을 계산해 보여주는 Next.js 앱입니다.

화면 주소: `/coupang` (루트 `/` 로 들어가면 자동 이동)

## 보여주는 것

| 항목 | 계산식 |
|---|---|
| 월 수익률 | 순수익 ÷ 순주문금액 × 100 (취소 반영 후 실제로 받은 수수료 비율) |
| 취소 전 수익률 | 주문 수익 ÷ 주문금액 × 100 |
| 행별 수익률 (실적 상세) | 그 주문(상품)의 수익 ÷ 주문금액 × 100 |
| 수익 비중 | 항목(상품·카테고리·주문) 수익 ÷ 이번 달 순수익 × 100 |
| 전환율 | 주문수 ÷ 클릭수 × 100 |
| 클릭당 수익 | 순수익 ÷ 클릭수 |
| 취소율 | 취소금액 ÷ 주문금액 × 100 |
| 전월 대비 | (이번 달 수익 − 지난 달 수익) ÷ 지난 달 수익 × 100 |
| 월말 예상 | 이번 달 순수익 ÷ 경과 일수 × 이번 달 일수 |

화면 구성

- 핵심 지표 카드: 순수익, 월 수익률, 순 주문금액, 전환율, 클릭당 수익, 전월 대비 수익
- 월별 수익률 추이 (최근 3 / 6 / 12개월): 차트 + 월별 표
- 선택한 달의 실적: 실적 상세(주문·취소 내역별 수익률/비중), 카테고리별, 상품별, 일별

## 실행 방법

1. 키 설정 — `.env.example` 을 `.env.local` 로 복사한 뒤 값을 채웁니다.

   ```
   COUPANG_ACCESS_KEY=발급받은 Access Key
   COUPANG_SECRET_KEY=발급받은 Secret Key
   ```

   `.env.local` 은 `.gitignore` 에 들어 있어 커밋되지 않습니다. 키는 서버(API 라우트)에서만 사용하고 브라우저로 보내지 않습니다.

2. 설치 및 실행

   ```bash
   npm install
   npm run dev
   ```

   브라우저에서 http://localhost:3000/coupang 을 엽니다.

## API 호출 보호 (중요)

쿠팡 파트너스 Open API 는 짧은 시간에 많이 호출하면 API 사용이 일시 정지될 수 있습니다. 그래서

- 응답을 `.cache/coupang/` 에 저장합니다. 이번 달(최근 3일 포함) 데이터는 30분, 지난 달 데이터는 24시간 동안 다시 호출하지 않습니다.
- 최근 1시간 호출 수가 `COUPANG_MAX_CALLS_PER_HOUR` (기본 20회) 에 도달하면 더 호출하지 않고, 저장된 데이터가 있으면 그것을 보여줍니다.
- 처음 열 때 호출 수: 선택한 달 3회(일별 수익·주문·취소) + 추이용 이전 달마다 1회. 6개월 추이면 최초 8회, 이후에는 캐시를 사용합니다.
- **새로고침** 버튼은 선택한 달 데이터만 다시 가져옵니다(3회).

쿠팡 API 제약: 한 번에 조회할 수 있는 기간은 최대 30일이라 월 단위로 나눠서 조회합니다.

## 선택 설정 (`.env.local`)

| 변수 | 설명 | 기본값 |
|---|---|---|
| `DASHBOARD_PASSWORD` | 설정하면 화면에서 비밀번호를 입력해야 리포트가 보입니다. 외부에 배포할 때 꼭 설정하세요. | 없음 |
| `COUPANG_MAX_CALLS_PER_HOUR` | 1시간당 쿠팡 API 최대 호출 수 | 20 |
| `COUPANG_CACHE_MINUTES` | 이번 달 데이터 캐시 유지 시간(분) | 30 |
| `COUPANG_CACHE_DIR` | 캐시 저장 폴더 | `./.cache/coupang` |

### Firebase App Hosting 에 배포할 때

키를 시크릿으로 등록한 뒤 `apphosting.yaml` 의 `env` 에 추가합니다.

```bash
firebase apphosting:secrets:set coupang-access-key
```

```bash
firebase apphosting:secrets:set coupang-secret-key
```

```yaml
  - variable: COUPANG_ACCESS_KEY
    secret: coupang-access-key
  - variable: COUPANG_SECRET_KEY
    secret: coupang-secret-key
```

## 코드 구조

| 파일 | 역할 |
|---|---|
| `src/lib/coupang/client.ts` | HMAC 서명, 리포트 API 호출, 페이지 처리, 캐시 경유 조회 |
| `src/lib/coupang/cache.ts` | 응답 캐시, 시간당 호출 수 제한 |
| `src/lib/coupang/metrics.ts` | 수익률·전환율·증감률 등 계산 (순수 함수) |
| `src/lib/coupang/report.ts` | 한 달치 데이터를 모아 계산 결과 생성 |
| `src/app/api/coupang/report/route.ts` | `GET /api/coupang/report?month=YYYY-MM&months=6&refresh=1` |
| `src/components/coupang/*` | 대시보드 화면 |

수치는 쿠팡 파트너스 Open API 리포트 기준이며, 실제 정산 금액은 최종 확정 시점에 따라 다를 수 있습니다.
