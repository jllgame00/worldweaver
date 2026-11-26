# PHASE 1.5 RESULT

## Phase 1.5-C · 로컬 생성 핫픽스

소유자가 ChatKHU 모델 조회와 잔액 조회 성공, `gpt-6.2-sol` 사용 가능을 확인했다. 로컬 생성 클릭 시의 오류는 `backend/app/main.py`의 `unavailable()`이 반환한 `403 live_local_only`였다. Vite 8의 기존 문자열 프록시 설정이 `Host`를 `127.0.0.1:8000`으로 바꿨으며 브라우저의 `Origin`은 `localhost:5173` 또는 `127.0.0.1:5173`의 출처를 유지했다. 백엔드의 동일 출처 비교에서 불일치가 발생했다.

Vite 프록시를 서로 같은 브라우저 `Host`와 `Origin`을 유지하는 설정으로 바꿨다. Vite는 루프백에 바인딩하고 프록시에서도 실제 소켓 주소를 확인한다. 전달 헤더를 합성하지 않으며 백엔드는 임의 전달 헤더와 외부 출처를 계속 거부한다. 같은 설정에서 백엔드와 Python CLI가 저장소 루트 `.env`를 읽고 프로세스 변수를 우선한다. 소유자의 `.env`, IndexedDB, 정본 파일과 제공자 경로는 기존대로 유지했다.

소유자 로컬 서버에 생성 확인 헤더가 없는 빈 POST를 재생했다. 수정 전 두 로컬 호스트의 요청은 403, 수정 후 두 요청은 생성 확인 헤더를 검사하는 409였다. 외부 Origin과 위조 전달 헤더는 403을 반환했다. 실제 생성 호출과 크레딧 소비는 0건이다. Python 113개, Vitest 20개, 타입 검사, Vite 빌드와 `git diff --check`가 통과했다. [재시작 안내](../README.md#로컬-생성-핫픽스-재시작) · [TDD 기록](TDD_EVIDENCE.md)

## Phase 1.5-C · ChatKHU Gateway

**PARTIAL · 구현과 로컬 회귀 검증 완료. 실제 생성 PENDING.** `522d067` 위의 기존 Phase 1.5 작업 트리에서 ChatKHU를 우선 제공자로 추가했다. 직접 OpenAI와 개발용 mock도 선택할 수 있다.

### 연동 계약

- 공식 OpenAI SDK를 사용해 `https://factchat-cloud.mindlogic.ai/v1/gateway`의 `/responses/` 또는 `/chat/completions/`를 명시한 설정으로 호출한다. 두 경로에서 같은 파생 JSON Schema를 엄격히 적용하고 정본 Draft 4 및 도메인 검사로 다시 검증한다. 중복 JSON 필드로 고정 사실 충돌을 숨기는 응답도 거부한다. [Gateway 개요](https://docs.mindlogic.ai/docs/khu/api-gateway/getting-started/overview) · [SDK 연동](https://docs.mindlogic.ai/docs/khu/api-gateway/integrations/openai-sdk)
- Gateway 문서에는 `gpt-6.1-sol`의 Responses 경로가 명시돼 있고, OpenAI의 모델 문서에는 Structured Outputs가 지원된다고 명시돼 있다. 이 ID로 만든 가짜 HTTP 요청이 정본을 통과했다. 실제 계정의 모델 권한과 해당 Gateway 응답은 별도로 확인한다. 웹 채팅에서 보이는 이름은 API 권한의 근거로 사용하지 않는다. [Gateway 모델](https://docs.mindlogic.ai/docs/khu/api-gateway/getting-started/models) · [Gateway Responses](https://docs.mindlogic.ai/docs/khu/api-gateway/reference/responses-api) · [모델 기능](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
- `CHATKHU_API_KEY`는 고정 Gateway HTTPS 호스트에만 사용한다. 직접 OpenAI 설정과 분리하고 같은 키를 양쪽에 지정하면 구성을 거부한다. SDK 리디렉션, 환경 프록시, 자체 재시도는 비활성화한다. 브라우저가 확인한 제공자·API·모델을 서버 설정과 대조한 뒤에만 호출한다. [Gateway 인증](https://docs.mindlogic.ai/docs/khu/api-gateway/getting-started/authentication)
- 게이트웨이 인증 실패, 402 크레딧 부족, 403 접근 거부, 429 속도 제한을 각각 처리한다. 기존 시간·출력 상한과 한 번의 기본 시도를 유지한다. 일시 오류 재시도는 기존 최대 두 시도 범위에서만 설정할 수 있다. 실패 시 선택한 제공자의 오류를 표시하고 이전 후보와 승인본을 보존한다. [Gateway 오류](https://docs.mindlogic.ai/docs/khu/api-gateway/reference/errors)

### 조회, 비용 추정과 다음 실검증

`python -m scripts.chatkhu models`는 공식 `GET /models/?type=llm`에서 계정에 열린 API 모델을 조회한다. `python -m scripts.chatkhu credits`는 `GET /credits/`의 총 잔액을 출력한다. 현 환경의 인증된 GET 두 건은 모두 **HTTP 401**이었다. 키, 응답 원문, 잔액 수치는 로그에 남기지 않았다. 실제 계정의 모델 목록과 잔액은 확인하지 못했다.

`python -m scripts.chatkhu estimate --model gpt-6.1-sol --input-tokens 1000 --output-tokens 6000`은 계정의 모델 권한을 조회하고 공개 ChatKHU 텍스트 단가로 예상 크레딧을 계산한다. 텍스트 단가가 확인된 `gpt-6.1-sol`만 지원하며, 계정별 실청구·예약액은 별도다. 공식 `/estimate/`는 이미지·비디오·음악 범위다. [크레딧 조회](https://docs.mindlogic.ai/docs/khu/api-gateway/reference/credits) · [공개 단가](https://docs.mindlogic.ai/docs/khu/baze/product/model-credits) · [견적 API](https://docs.mindlogic.ai/docs/khu/api-gateway/reference/estimate)

실제 검증은 활성 Gateway 키로 조회가 성공하고 소유자가 모델과 크레딧 예산을 승인한 뒤 진행한다. 첫 시도는 합성 입력 한 건과 한 번의 시도로 시작해 모델, 구조·참조 검사, 설계 보존, 사용량과 비용 내역을 검토한다. 이번 생성 요청은 **0건**이다. [소유자 설정 절차](../README.md)

### 회귀 검증

Python 105개와 Vitest 17개가 통과했다. 생성 어댑터와 조회 도구 검증은 가짜 HTTP를 사용했다. strict TypeScript, Vite 생산 빌드, 정본·전송 스키마 및 기존 합성 예시 왕복도 통과했다. 루프백에서는 기존 jsdom 통합 2개와 빌드 제공 검사가 통과했다. 키 없는 ChatKHU 서버의 헬스는 200, 제공자 상태는 비활성, 생성은 503이었다. 검증 서버를 모두 종료했고 실제 브라우저는 이번에 재검증하지 않았다. 선행 RED는 [TDD 기록](TDD_EVIDENCE.md)에 있다.

`main`과 로컬 `origin/main`은 `522d067`이며, 기존 작업과 이번 변경은 미스테이징 상태다. `git diff --check`를 통과했다. Phase 2는 시작하지 않았다.

## Phase 1.5 · 직접 OpenAI 기록

**PARTIAL · OpenAI 제공자 구현과 자동 검증 완료. 실제 API 응답 검증 PENDING.** Phase 1 편집 및 저장 흐름을 유지했다.

## 구현과 모델

- 시작 시 `D:\univ\3-1\OpenSW\HW6`의 `main`과 로컬 `origin/main`이 `522d067`에 있었고 작업 트리는 깨끗했다. 기존 프로젝트, 정본 스키마와 저장소 스킬을 유지했다.
- 공식 Python SDK `openai==2.26.0`과 Responses API를 사용한다. 기본 모델 ID인 `gpt-6.2-sol`의 Responses와 Structured Outputs 지원을 공식 문서에서 확인했다. `WORLDWEAVER_MODEL`로 교체할 수 있으며 설정한 계정의 모델 접근 권한은 실제 호출 검증 대상이다. [공식 모델 문서](https://developers.openai.com/api/docs/models/gpt-6.2-sol) · [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)
- 전송 스키마는 정본 Draft 4의 후보 하위 스키마를 풀어 쓴 닫힌 객체다. 정확히 세 후보와 고정 사실 충돌 목록을 요구한다. 문자열 길이 제약 `minLength`는 정본에 그대로 두고 전송 스키마에서 생략했다. 전송 구조, 정본 후보 구조, 참조와 기존 도메인 규칙을 순서대로 검사한다. [Structured Outputs 가이드](https://developers.openai.com/api/docs/guides/structured-outputs)
- 프롬프트는 사용자가 고른 장르와 언어에 맞춰 각 방향의 동기, 압박, 선택, 결과가 달라지도록 요청한다. 필수 소재는 이야기 사건과 이해관계에 통합할 근거를 요구하고 제외 소재는 사용하지 않도록 한다. 보고된 고정 사실 충돌과 형식·참조 오류는 제안을 거부한다. 잠긴 사실과 기존 승인 이야기 변경은 작성자의 기존 편집·승인 흐름에 남아 있다.
- UI는 현재 제공자와 저장된 후보의 출처를 각각 표시한다. 구성 확인, 키 누락, 생성 중, 검증 실패, 완료 상태를 구분한다. 후보 요청의 `X-Worldweaver-Generation`에 확인된 모드와 모델을 넣어 서버 설정 전환 시 사용자의 창작 자료가 뜻하지 않게 전송되는 일을 막는다.

## 한도와 개인정보

- 로컬 라이브 서버는 루프백, 프록시 미사용, 단일 워커로 실행한다. JSON 요청, 현재 모드와 모델 확인을 요구하고 공개 호스트·외부 Origin·프록시 전달 헤더를 거부한다. 프로세스당 한 건을 처리하며 같은 프로젝트 리비전의 완료 직후 반복을 차단한다.
- 라이브 기본값은 총 타임아웃 90초, 전송할 창작 입력 32,768바이트, 시도당 출력 토큰 6,000개, 한 번의 시도다. 두 번으로 설정하면 일시적 장애 또는 타임아웃 한 번에만 재시도하며 총 시간은 두 시도에 배분된다. SDK의 자체 재시도와 리디렉션, 환경 프록시를 끈다. 429, 인증 오류, 불완전 응답과 거절을 각각 처리한다. 자격 증명이 없거나 라이브 한도 설정이 잘못됐으면 헬스를 유지하며 생성만 막는다.
- OpenAI에 보내는 프로젝트 데이터는 창작 소재와 고정 사실이다. `store=false`를 지정하고 앱은 원시 프롬프트·응답을 로그에 남기지 않는다. 공급자의 악용 모니터링 보존과 프롬프트 캐시 정책은 별개다. [OpenAI 데이터 제어](https://developers.openai.com/api/docs/guides/your-data)
- `AgentRun`의 기존 토큰·시간 필드와 검증 기록을 사용한다. 이름과 모델은 안전한 메타데이터로, 유효한 입력·캐시 입력·출력 토큰은 사용량 기록으로 돌려준다. 타임아웃 또는 취소된 요청은 응답 사용량이 없어도 청구될 수 있다. 이 로컬 기록과 캠페인 추정액은 공급자 청구 내역과 대조해야 한다.

## TDD와 회귀 결과

| 확인 | 실제 결과 |
|---|---|
| 서버 SDK 경계 | 초기 RED 17개, 해당 테스트 GREEN 17개. 검토 뒤 모드와 모델 바인딩, 환경 프록시·리디렉션, 완료 직후 중복, 잘못된 설정 및 메타데이터 RED 8개와 해당 GREEN 8개를 관찰했다. |
| 전체 Python | `python -m pytest backend/tests scripts/test_verify_live.py -q --tb=line` · 70개 통과. 기존 32개를 보존했다. FastAPI, 고정 사실과 이전 프로젝트 보존, 실연동 차단, 연결 종료 시 요청 취소, 캠페인 한도를 확인했다. Starlette/AnyIO 사용 중단 예정 경고 1개가 있다. |
| 프런트엔드 | 초기 상태·출처 RED 5개와 보완 RED 2개 후 GREEN. `npm.cmd --prefix frontend test` 15개 통과. `npm.cmd --prefix frontend run typecheck` 및 `npm.cmd --prefix frontend run build` 통과. |
| 스키마 | 정본 Draft 4 메타스키마, 파생 스키마 메타검사, Phase 0 합성 예시의 정본 왕복 및 세 후보의 전송 계약 검사를 통과했다. |
| 로컬 통합 | 루프백 FastAPI와 jsdom 2개 통과. mock 제안·편집·승인·재열기, 오류 시 승인본 보존, 키 없는 라이브 구성의 생성 차단과 편집 지속을 확인했다. 빌드된 HTML·JavaScript·CSS 제공 점검도 통과했다. |
| 실제 브라우저 | 정상 Playwright 실행에서 Chrome이 `spawn EPERM`으로 시작되지 않았다. 실제 렌더링과 스크린샷은 미검증이다. 검증 서버는 모두 종료했다. |

선행 RED 및 명령은 [TDD 기록](TDD_EVIDENCE.md)에 있다. 로컬 통합 증거는 Git이 제외하는 `.scratch/phase15-verification/phase15-integration.config.mjs`와 `.scratch/browser/compiled-smoke.mjs`로 재실행했다. Python 고정 의존성은 이 환경의 저장소 내부 `.scratch/phase15-python`에 설치하고 `PYTHONPATH`로 검증했다.

## 실응답과 서사 평가

소유자의 지출 승인이 없어 실제 OpenAI 요청은 0건이다. 지연, 토큰, 청구액 및 실제 서사 품질은 측정하지 않았다. API 접근 또는 HW6 실연동 요건은 실제 성공 응답을 받아 처리한 후 확인한다.

`python -m scripts.verify_live --dry-run`에서 서로 다른 다크 판타지 액션 RPG, SF 탐사, 인물 중심 현대 미스터리 합성 입력을 점검했다. 한국어·영어 소재 12개, 고정 사실 3개, 제외 항목 3개가 정본을 통과했다. `--execute`는 소유자가 승인한 비용 추정 예산과 최대 세 건의 호출 한도를 요구한다. 허용된 모델과 한 번의 시도를 확인하고 판정 및 안전한 사용량만 출력한다. 이 도구는 구조 검증용이다. 실제 작품의 선택과 결과, 장르 적합성, 소재 반영 및 사실 충돌은 승인된 요청에서 생성된 본문을 편집 화면에서 사람이 평가해야 한다. 본문을 열기 위해 새 호출을 사용할 때도 별도 예산을 확보한다. [환경 변수 예시](../.env.example)

## 공개 운영과 다음 단계

공개 운영 전에는 사용자 인증·권한, 여러 워커에 걸친 사용자별 요청·중복·동시성 제한, 하드 지출 차단과 사용량 대조, 공급자 오류·비용 모니터링, 창작 내용 전송과 보존에 대한 안내·동의가 필요하다. 이번 구현은 로컬 단일 워커에 한도를 둔다.

`main`과 로컬 `origin/main`은 `522d067`이다. 작업 트리에 수정 19개, 미추적 8개가 있고 스테이징된 변경은 없다. `git diff --check`는 종료 0이며 Git은 LF→CRLF 안내를 표시했다. 미추적 파일을 포함해 범위와 대표 자격 증명 패턴을 확인했다. Phase 2 착수는 별도 요청을 기다린다.
