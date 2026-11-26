# WORLDWEAVER

**From scattered ideas to a living world.**

WORLDWEAVER(가칭)는 흩어진 게임 아이디어를 이야기와 지도 위에서 함께 편집하는 내러티브 설계 도구다. 인디 개발자, 게임·내러티브 디자이너, 소규모 팀과 학생이 주요 사용자다. 장기 목표는 창작자가 이야기와 세계 설정을 연결해 편집할 수 있는 공개 서비스다. 「오픈소스 SW 개발방법 및 도구」 HW6의 요구사항은 최소 검증 기준으로 삼는다. 현재 이야기 초안을 작성하고 브라우저에 저장할 수 있으며, **Phase 1.5-C**에서 ChatKHU Gateway를 제공자로 선택할 수 있다. 실제 생성 검증은 대기 중이다.

예를 들어 플레이어가 수문에서 증언을 모은 뒤 명부를 공개할지 봉인할지 고른다고 하자. 설계자는 각 결말이 벌어지는 장소를 지도에서 확인하고, 공개 장소로 가는 유일한 도로를 지웠을 때 어느 분기가 막히는지 확인할 수 있어야 한다. 이 동작이 제품의 핵심 목표다. [합성 예시 프로젝트](docs/examples/salt-census.json)

## 지금 사용할 수 있는 기능

1. **Projects**에서 제목을 입력해 새 프로젝트를 만든다.
2. **Content Studio**에서 한국어 또는 영어 소재를 하나 이상 입력한다. 필수, 선택, 제외로 분류하고 보호할 사실을 따로 고정한다.
3. 제공자가 제안한 세 방향의 갈등, 결말, 소재 반영 근거를 비교한다. 저장된 후보의 출처는 개발용 mock과 실연동으로 구분해 표시한다. 후보를 골라 이야기 필드를 편집한 뒤 고정 사실과 내용을 검토해 승인한다.
4. 브라우저의 IndexedDB에 저장된 프로젝트를 같은 브라우저 프로필과 주소에서 다시 연다. 소재 변경 후 기존 후보와 이야기는 재검토가 필요한 상태로 남는다.

분기 그래프, 세계 지도, JSON 교환과 Markdown 내보내기는 이후 단계에서 다룬다.

## 로컬에서 실행

Python 3.13, Node.js 24 및 npm이 필요하다. 저장소 루트에서 PowerShell로 다음을 실행한다.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm.cmd --prefix frontend ci
```

백엔드와 프런트엔드는 각각 별도 터미널에서 실행한다. 개발 화면은 `http://127.0.0.1:5173`, 백엔드 헬스는 `http://127.0.0.1:8000/health`에서 확인한다.

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-proxy-headers
npm.cmd --prefix frontend run dev
```

배포 형태를 로컬에서 확인하려면 `npm.cmd --prefix frontend run build` 후 백엔드를 다시 시작하고 `http://127.0.0.1:8000`을 연다. 포트가 다르면 브라우저 저장소도 각각 별도로 열린다.

### 로컬 프로젝트 다시 열기

- 소재와 고정 사실을 입력한 뒤 **Add fragment**, **Pin fact**, 또는 **Save changes**를 누르고 **Saved locally**를 확인한다. 입력란에 남겨 둔 미제출 텍스트는 저장되지 않는다. 새로고침하거나 서버를 재시작한 뒤 **Projects → Open**에서 다시 연다.
- 목록이 비어 있으면 프로젝트를 입력할 때 사용한 브라우저 프로필에서 `Ctrl+H`로 방문 기록을 열고 당시 주소를 확인한다. `http://localhost:5173`, `http://127.0.0.1:5173`, `http://127.0.0.1:8000`은 각각 다른 저장소를 사용한다. 이전에 다른 Vite 포트를 사용한 기록이 있으면 `npm.cmd --prefix frontend run dev -- --port 5174`처럼 당시 포트를 명시해 그 주소를 연다. 개발 서버는 포트가 이미 사용 중이면 오류를 표시한다.
- Chrome 또는 Edge에서 해당 주소를 연 채 `F12`를 누른다. **Application → Storage → IndexedDB → worldweaver-v1 → projects**로 이동해 `Value` 셀의 `project`를 펼친다. `userContent`가 12개이고 `canonicalFacts`가 3개인 레코드가 있는지 확인한다. 기존 자료를 보존하려면 **Clear site data**, **Delete database**, 레코드 삭제 기능은 사용하지 않는다.
- 개발 서버의 **Projects**에서 **잊혀진 달**을 누르면 소재 12개와 고정 사실 3개를 갖춘 새 프로젝트가 저장되고 열린다. 클릭할 때마다 새 ID를 사용하므로 같은 제목으로 저장한 기존 프로젝트도 다시 열 수 있다.

## ChatKHU 제공자 설정

백엔드와 Python CLI는 저장소 루트의 `.env`를 읽는다. 셸이나 VS Code가 프로세스에 직접 지정한 환경 변수가 같은 이름의 파일 값보다 우선하며, 빈 값도 우선한다. `.env.example`은 변수 목록이다. 기존 루트 `.env`에 ChatKHU 설정이 있으면 그대로 사용한다. 키를 현재 PowerShell에 직접 지정할 때는 아래 방식으로 입력할 수 있다. [ChatKHU 인증](https://docs.mindlogic.ai/docs/khu/api-gateway/getting-started/authentication) · [환경 변수 예시](.env.example)

```powershell
# Optional when the key is already in the root .env
$env:CHATKHU_API_KEY = [System.Net.NetworkCredential]::new('', (Read-Host 'ChatKHU Gateway API key' -AsSecureString)).Password
.\.venv\Scripts\python.exe -m scripts.chatkhu models
.\.venv\Scripts\python.exe -m scripts.chatkhu credits
```

`models`는 공식 `GET /models/?type=llm`이 반환한 계정별 텍스트 모델 ID를 보여 준다. `credits`는 `GET /credits/`에서 총 잔액을 읽는다. 웹 채팅 화면의 모델과 API 모델의 권한은 다를 수 있다. 401이면 Gateway에서 키의 활성 상태와 소속을 확인한다. [모델 조회](https://docs.mindlogic.ai/docs/khu/api-gateway/getting-started/models) · [크레딧 조회](https://docs.mindlogic.ai/docs/khu/api-gateway/reference/credits)

아래 견적은 예시 입력 1,000토큰과 최대 출력 6,000토큰을 기준으로 한다. 도구는 `/models/`에서 `gpt-6.1-sol`의 사용 가능 여부를 확인하고 공개 ChatKHU 단가로 텍스트 크레딧을 추정한다. 실제 차감액은 계정 단가와 캐시 등에 따라 달라진다. 공식 `/estimate/`의 지원 범위는 이미지·비디오·음악이다. [공개 모델 단가](https://docs.mindlogic.ai/docs/khu/baze/product/model-credits) · [견적 API](https://docs.mindlogic.ai/docs/khu/api-gateway/reference/estimate)

```powershell
.\.venv\Scripts\python.exe -m scripts.chatkhu estimate --model gpt-6.1-sol --input-tokens 1000 --output-tokens 6000
```

목록에서 모델을 확인하고 모델과 크레딧 예산을 승인한 뒤, 같은 PowerShell에서 제공자를 선택해 백엔드를 재시작한다. 아래 `gpt-6.1-sol`은 공식 문서가 Responses API와 구조화 출력을 지원한다고 명시한 모델의 설정 예시다. Chat Completions가 필요한 모델은 해당 모델의 `json_schema` 지원을 확인하고 `CHATKHU_API=chat_completions`로 명시한다. [ChatKHU Responses API](https://docs.mindlogic.ai/docs/khu/api-gateway/reference/responses-api) · [OpenAI 모델 기능](https://developers.openai.com/api/docs/models/gpt-6.1-sol)

```powershell
$env:WORLDWEAVER_PROVIDER = 'chatkhu'
$env:CHATKHU_MODEL = 'gpt-6.1-sol'
$env:CHATKHU_API = 'responses'
$env:WORLDWEAVER_LIVE_MAX_ATTEMPTS = '1'
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-proxy-headers
```

브라우저는 상태를 조회해 ChatKHU Gateway와 모델을 표시한다. 직접 API로 실행할 때는 확인한 설정을 `X-Worldweaver-Generation: chatkhu:responses:gpt-6.1-sol`처럼 보낸다. Gateway의 402는 잔액 또는 해당 요청의 예약 크레딧 부족으로 표시한다. 키는 Gateway HTTPS 호스트에만 전달하고, 생성이 실패하면 명시적 오류를 반환한다.

### 로컬 생성 핫픽스 재시작

1. 백엔드와 프런트엔드를 실행 중인 터미널에서 각각 `Ctrl+C`를 누른다.
2. 백엔드 터미널에서 저장소 루트로 이동해 의존성을 설치하고 서버를 시작한다.

```powershell
Set-Location 'D:\univ\3-1\OpenSW\HW6'
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-proxy-headers
```

3. 별도 프런트엔드 터미널에서 Vite를 다시 시작한다.

```powershell
Set-Location 'D:\univ\3-1\OpenSW\HW6'
npm.cmd --prefix frontend run dev
```

기존 브라우저 프로필에서 이전과 같은 호스트명과 포트로 새로고침한다. `http://localhost:5173`과 `http://127.0.0.1:5173` 모두 생성 요청을 전달할 수 있으며, IndexedDB는 두 주소를 서로 다른 출처로 취급한다. 루트 `.env`의 값으로 실행하려면 같은 이름에 지정된 프로세스 환경 변수를 확인한다.

## 직접 OpenAI 및 개발용 mock 설정

서버는 기본적으로 `WORLDWEAVER_PROVIDER=mock`으로 실행한다. 이 모드는 결정론적 개발·자동 검증 전용이며 API 키가 필요 없다. 실연동을 선택하려면 서버 프로세스 환경에 아래 값을 설정한 뒤 서버를 재시작한다. `OPENAI_API_KEY`는 소유자가 서버 환경에 직접 주입한다. 예시 파일은 설정 목록이며 자동 로딩하지 않는다. [환경 변수 예시](.env.example)

```powershell
$env:WORLDWEAVER_PROVIDER = 'openai'
$env:WORLDWEAVER_MODEL = 'gpt-6.2-sol'
$env:WORLDWEAVER_TIMEOUT_SECONDS = '90'
$env:WORLDWEAVER_MAX_INPUT_BYTES = '32768'
$env:WORLDWEAVER_MAX_OUTPUT_TOKENS = '6000'
$env:WORLDWEAVER_LIVE_MAX_ATTEMPTS = '1'
```

기본 OpenAI 모델은 Responses API와 Structured Outputs를 지원하는 `gpt-6.2-sol`이다. 키가 비어 있거나 제한 설정이 잘못됐으면 편집과 헬스는 유지되고 생성은 비활성화된다. 실연동 실패는 오류로 표시한다. 라이브 요청은 프록시 없이 루프백에서만 받고 프로세스당 하나씩 처리한다. 선택적으로 최대 두 번의 시도를 설정할 수 있으며 출력 토큰 상한은 호출마다 적용된다. [공식 모델 문서](https://developers.openai.com/api/docs/models/gpt-6.2-sol)

직접 API를 사용할 때는 `GET /api/generation`에서 현재 모드와 모델을 확인하고 `POST /api/candidates`에 `X-Worldweaver-Generation: live:gpt-6.2-sol`처럼 확인한 두 값을 함께 보낸다. 서버 설정이 바뀌면 화면이 상태를 다시 확인하고 다음 생성은 사용자가 시작한다.

실연동 시 소재와 고정 사실을 OpenAI에 전송한다. 앱은 요청에서 `store=false`를 사용하며, 계정의 공급자 보존 정책은 별도로 확인해야 한다. 공개 운영 전에는 사용자 인증, 사용자별 속도 제한, 지출 차단과 개인정보 안내가 필요하다. [OpenAI 데이터 제어](https://developers.openai.com/api/docs/guides/your-data) · [Phase 1.5 보고서](docs/PHASE_1_5_REPORT.md)

## 기술과 검증 계획

React·TypeScript·Vite 프런트엔드와 FastAPI·Pydantic 백엔드를 사용한다. 정본은 버전이 있는 하나의 Project다. 서버는 제공자 응답을 정본 스키마로 검사하고 현재 프로젝트 리비전에 대한 제안으로 반환한다. 프로젝트와 제공자 설정은 각각 브라우저와 서버에서 관리한다. [아키텍처](docs/ARCHITECTURE.md) · [데이터 계약](docs/DATA_SCHEMA.md)

런타임 에이전트는 서사 생성, 시나리오 구성, 세계 생성, 검증을 분담한다. 자동 복구는 최대 두 번이며 중요한 서사 변경에는 사용자 승인이 필요하다. 개발용 저장소 스킬은 향후 코딩 에이전트가 테스트와 검증 절차를 따르도록 안내한다. [런타임 흐름](docs/AGENT_WORKFLOW.md) · [개발 규칙](AGENTS.md)

검증에는 pytest와 Vitest를 사용한다. 일반 CI는 mock을 사용하도록 설계했으며, CI 구성과 배포는 후속 단계에서 진행한다. [TDD 계획](docs/TDD_PLAN.md) · [CI/CD 계획](docs/DEVOPS_PLAN.md)

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests scripts
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend run build
.\.venv\Scripts\python.exe -m scripts.verify_live --dry-run
```

오프라인 점검은 합성 입력 세 개를 검증한다. `scripts.verify_live --execute`는 직접 OpenAI용 기존 검증 도구다. 소유자가 비용과 호출 횟수를 승인한 경우에만 서버의 시도 한도를 1로 설정하고, 검증 프로세스에 `WORLDWEAVER_LIVE_VERIFY_MAX_CALLS`와 `WORLDWEAVER_LIVE_VERIFY_BUDGET_USD`를 설정해 실행한다. 최대 세 건이며 사전 확보액은 요금 추정치다.

## 현재 열어볼 수 있는 자료

별도 API 키 없이 mock으로 실행할 수 있으며, 설계 문서와 합성 예시도 확인할 수 있다.

| 확인할 내용 | 문서 |
|---|---|
| 제품 범위, 합격 기준, 9개 화면 스케치 | [제품 명세](docs/PRODUCT_SPEC.md) · [UX 설계](docs/UX_DESIGN.md) |
| 단계별 작업과 다음 단계 진입 조건 | [로드맵](PLANS.md) |
| 과제 요구사항, TDD 증거 현황 | [HW6 대응표](docs/HW6_REQUIREMENTS_MATRIX.md) · [TDD 기록](docs/TDD_EVIDENCE.md) |
| 설계 검증 결과와 보류 사항 | [Phase 0 보고서](docs/PHASE_0_REPORT.md) |
| Narrative Engine 구현과 실행 검증 | [Phase 1 보고서](docs/PHASE_1_REPORT.md) |
| ChatKHU·OpenAI 어댑터와 실연동 검증 상태 | [Phase 1.5 보고서](docs/PHASE_1_5_REPORT.md) |
