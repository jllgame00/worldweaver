# WORLDWEAVER

**From scattered ideas to a living world.**

WORLDWEAVER(가칭)는 흩어진 게임 아이디어를 이야기와 지도 위에서 함께 편집하는 내러티브 설계 도구다. 인디 개발자, 게임·내러티브 디자이너, 소규모 팀과 학생이 주요 사용자다. 장기 목표는 창작자가 이야기와 세계 설정을 연결해 편집할 수 있는 공개 서비스다. 「오픈소스 SW 개발방법 및 도구」 HW6의 요구사항은 최소 검증 기준으로 삼는다. 승인된 이야기에서 분기와 퀘스트를 설계하고, 시나리오 장소를 연결하는 대륙과 이동로를 생성·편집해 같은 프로젝트에 저장할 수 있다.

예를 들어 플레이어가 수문에서 증언을 모은 뒤 명부를 공개할지 봉인할지 고른다고 하자. 설계자는 각 결말이 벌어지는 장소를 지도에서 확인하고, 공개 장소로 가는 유일한 도로를 지웠을 때 어느 분기가 막히는지 확인할 수 있어야 한다. 이 동작이 제품의 핵심 목표다. [합성 예시 프로젝트](docs/examples/salt-census.json)

## 지금 사용할 수 있는 기능

**World Bible**에서 인물·세력·장소·퀘스트와 고정 사실을 같은 정본 ID로 찾고, 관련 장면과 지도 경로를 따라갈 수 있다. **Verification Agent → Run Quick Check**는 키 없이 참조, 승인 출처, 실제로 가능한 엔딩과 물리적 여정을 검사한다. 수리는 원래 값과 영향 범위를 확인하고 격리 사본에서 검증한 뒤 수락하거나 거절한다. 현재 설계와 과거 보고서를 구별해 프로젝트 JSON과 Markdown으로 내보낼 수 있다.

기존 **잊혀진 달**을 열고 먼저 JSON을 백업한다. 실제 프로젝트 검토와 수리 실험용 합성 복사본 가져오기, 선택형 ChatKHU 1회 검토를 순서대로 안내한다. [소유자 확인 절차](docs/VERIFICATION_AGENT.md) · [Phase 4 결과와 미검증 범위](docs/PHASE_4_REPORT.md)

1. **Projects**에서 제목을 입력해 새 프로젝트를 만든다.
2. **Content Studio**에서 한국어 또는 영어 소재를 하나 이상 입력한다. 필수, 선택, 제외로 분류하고 보호할 사실을 따로 고정한다.
3. 제공자가 제안한 세 방향의 갈등, 결말, 소재 반영 근거를 비교한다. 저장된 후보의 출처는 개발용 mock과 실연동으로 구분해 표시한다. 후보를 골라 이야기 필드를 편집한 뒤 고정 사실과 내용을 검토해 승인한다.
4. 브라우저의 IndexedDB에 저장된 프로젝트를 같은 브라우저 프로필과 주소에서 다시 연다. 소재 변경 후 기존 후보와 이야기는 재검토가 필요한 상태로 남는다.

5. **Scenario Studio**에서 승인된 이야기의 분량, 장 수, 분기, 퀘스트 비중, 결말과 추가 지시를 정하고 **Generate scenario**를 한 번 누른다. 제안을 확인하고 **Accept proposal**을 누르면 초안이 저장된다.
6. 그래프에서 사건이나 연결선을 선택해 오른쪽 편집기에서 수정한다. **Outline**으로 전환하면 키보드로 같은 항목을 편집할 수 있다. **Revise selected node / quest / chapter**는 선택한 대상의 전후 비교를 열며, 채택하기 전까지 저장된 내용이 유지된다.
7. **Validate scenario**에서 결말까지의 경로와 지적 사항을 확인한다. 고정 사실과 선택의 결과를 검토하고 확인란을 선택한 뒤 **Approve scenario**를 누른다. **Saved locally**가 나타나면 같은 주소에서 다시 열 수 있다.
8. **Export project JSON**은 프로젝트 전체를, **Export scenario Markdown**은 읽기용 설계서를 저장한다. **Projects → Import project JSON**으로 복구한다. 같은 ID가 있으면 별도 사본 생성을 확인한다. 가져온 시나리오는 로컬에서 다시 검증하고 승인한다.

소유자는 ChatKHU에서 생성한 실제 시나리오 그래프를 확인했다. 기존 프로젝트의 최종 승인과 백업은 아래 절차로 확인한다. 초기 인증·미완성 응답·서버 설정 조사 기록은 Phase 2.1 보고서에 있다. [Phase 2.1 검증 보고서](docs/PHASE_2_1_REPORT.md)

## World Atlas에서 기존 프로젝트 확인하기

**이미 채택한 시나리오의 승인 버튼이 잠겨 있을 때** 기존 프로필과 주소에서 페이지를 새로고침한다. **Scenario Studio → Validate scenario**를 한 번 누르고 승인 영역에서 **Validation passed**를 확인한다. 검토 확인란을 선택한 뒤 **Approve scenario**를 누른다. 이전 버전에서 저장한 미승인 프로젝트나 가져온 JSON은 이 로컬 검사가 한 번 필요하다. 이 검사는 무료이며 기존 내러티브와 시나리오를 사용한다. 차단 항목이 있으면 표시된 규칙과 장면을 확인하고 수정 후 같은 버튼으로 다시 검증한다. **Retry save**는 저장만 재시도한다. 승인 후 **World Atlas → Generate continent**를 사용할 수 있다.

1. 평소 쓰던 브라우저 프로필에서 `http://127.0.0.1:5173`을 열고 **Projects → Open**으로 기존 프로젝트를 선택한다. 먼저 **Export project JSON**으로 백업한다.
2. **Scenario Studio**에서 실제 승인 상태를 확인한다. 아직 제안이면 검토·채택하고 **Validate scenario → Approve scenario**를 마친다. 이미 승인한 내러티브나 시나리오는 그대로 사용한다.
3. **World Atlas → Geography requirements**에서 장소, 지상·지하 관계, 필수 여정을 읽는다. 이름과 시드(예: `42`)를 확인하고 **Generate continent**를 누른다. 이 과정에는 API 키가 필요 없으며 유료 요청은 0회다.
4. **Layers**에서 수계, 지형, 영토, 이동로, 시나리오 여정을 켜고 끈다. 지도나 **Atlas index**에서 장소를 선택하고 검사기의 장면 이름을 눌러 시나리오로 이동한다. 장면의 **Show location on atlas**로 돌아온다.
5. 잠기지 않은 장소의 **Column / Row**를 인접한 육지로 바꾸고 **Save location → Revalidate world**를 누른다. 문제가 생기면 표시된 장소 또는 경로를 확인해 수정하거나 **Undo atlas edit**로 복구한다. 강제 조건이 남으면 작업본으로 보존된다.
6. **Approve world**로 승인한 뒤 **Export saved project JSON**, **Export SVG**, **Export atlas Markdown**을 저장한다. 같은 주소에서 새로고침하고 프로젝트를 다시 열어 **Approved world**, 변경한 장소와 경로를 확인한다.

[지도 생성·편집 안내](docs/WORLD_GENERATION.md) · [지도 출력 예시](docs/examples/atlas-preview.png) · [Phase 3 검증 결과](docs/PHASE_3_REPORT.md)

## 로컬에서 실행

Windows에 Python 3.13과 Node.js 24 이상(npm 포함)을 설치한다. 저장소 루트에서 PowerShell을 열고 다음을 실행한다. 처음 실행하거나 의존성이 바뀌었을 때는 `setup.ps1`을 먼저 실행한다.

```powershell
.\scripts\setup.ps1
.\scripts\start-dev.ps1
```

설정 스크립트는 로컬 `.venv`를 준비하고 고정된 Python 의존성과 프런트엔드 잠금 파일의 패키지를 설치한다. 실행 스크립트는 FastAPI와 Vite를 루프백에서 시작한다. 준비 안내가 나오면 `http://127.0.0.1:5173`을 연다. `Ctrl+C`로 이 터미널에서 시작한 두 서버를 종료한다. 8000 또는 5173 포트를 이미 쓰고 있으면 해당 서버를 원래 터미널에서 종료한 뒤 다시 실행한다.

계정이나 키 없이 동작을 확인하려면 실행할 터미널에서 `$env:WORLDWEAVER_PROVIDER = 'mock'`을 지정한다. 상태 조회는 생성 요청을 보내지 않는다.

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod http://127.0.0.1:5173/api/generation | Select-Object mode, provider, model, available
```

배포 형태를 로컬에서 확인하려면 `npm.cmd --prefix frontend run build` 후 백엔드를 다시 시작하고 `http://127.0.0.1:8000`을 연다. 포트가 다르면 브라우저 저장소도 각각 별도로 열린다.

### 로컬 프로젝트 다시 열기

- 소재와 고정 사실을 입력한 뒤 **Add fragment**, **Pin fact**, 또는 **Save changes**를 누르고 **Saved locally**를 확인한다. 입력란에 남겨 둔 미제출 텍스트는 저장되지 않는다. 새로고침하거나 서버를 재시작한 뒤 **Projects → Open**에서 다시 연다.
- 목록이 비어 있으면 프로젝트를 입력할 때 사용한 브라우저 프로필에서 `Ctrl+H`로 방문 기록을 열고 당시 주소를 확인한다. `http://localhost:5173`, `http://127.0.0.1:5173`, `http://127.0.0.1:8000`은 각각 다른 저장소를 사용한다. 이전에 다른 Vite 포트를 사용한 기록이 있으면 `npm.cmd --prefix frontend run dev -- --port 5174`처럼 당시 포트를 명시해 그 주소를 연다. 개발 서버는 포트가 이미 사용 중이면 오류를 표시한다.
- Chrome 또는 Edge에서 해당 주소를 연 채 `F12`를 누른다. **Application → Storage → IndexedDB → worldweaver-v1 → projects**로 이동해 `Value` 셀의 `project`를 펼친다. `userContent`가 12개이고 `canonicalFacts`가 3개인 레코드가 있는지 확인한다. 기존 자료를 보존하려면 **Clear site data**, **Delete database**, 레코드 삭제 기능은 사용하지 않는다.
- 개발 서버의 **Projects**에서 **잊혀진 달**을 누르면 소재 12개와 고정 사실 3개를 갖춘 새 프로젝트가 저장되고 열린다. 클릭할 때마다 새 ID를 사용하므로 같은 제목으로 저장한 기존 프로젝트도 다시 열 수 있다.

## 승인된 이야기의 인물·세력과 시나리오 참조 확인

기존 승인 이야기를 그대로 사용할 수 있다. **Narrative → Canonical entities**에서 정해 둔 인물 이름·역할, 세력 이름·목표, 아이템, 선택, 플래그를 먼저 등록할 수 있다. 이미 등록된 ID는 다음 생성에서 그대로 사용한다. 등록을 생략하면 시나리오가 필요한 새 개체를 같은 요청 안에서 제안한다.

1. 아래 절차로 같은 PowerShell과 브라우저 프로필을 사용해 **잊혀진 달**을 연다. 기존의 승인된 이야기를 선택한다.
2. **Scenario Studio**에서 표준 3장·분기·복수 결말과 표시된 예산을 확인한 후 **Generate scenario**를 한 번 누른다.
3. **Proposal entities**에서 기존 개체와 추가 개체, 소속 세력, 사용처와 조건을 확인한다. **Accept proposal**을 누르면 개체와 그래프가 함께 저장된다. **Validate scenario**에서 결말 경로를 확인하고 검토 후 **Approve scenario**를 누른다. 새로고침 후 같은 프로젝트에서 ID와 승인 상태를 다시 확인한다.
4. 거절될 경우 **Proposal findings**에서 유형별 목록을 펼쳐 문제 ID와 필드 경로를 확인한다. **Relink rejected references**가 열리면 올바른 대상 ID를 선택한다. 빠진 인물·세력·상태 개체가 있으면 **Add entity to proposal**로 선언할 수 있다. **Check corrections without generation**은 로컬 검증만 실행한다. 통과하면 다시 제안을 검토하고 채택한다. 복구 가능한 거절 원본은 같은 브라우저의 별도 진단 저장소에 남는다.

소유자가 보고한 최근 시도는 출력 5,528토큰, 추론 0으로 응답을 받았고 진행 검사에서 세 결말이 모두 막혔다. Phase 2.3 검증 절차는 다음과 같다. [이전 참조 오류 분석](docs/PHASE_2_2_REPORT.md)

### 분기와 결말 검증 및 거절 초안 복구

1. 기존 프로젝트를 저장한 프로필과 주소를 사용한다. 인증에 성공했던 PowerShell에서 `.\.venv\Scripts\python.exe -m scripts.chatkhu check`로 모델과 한도를 확인하고 `.\scripts\start-dev.ps1`을 실행한다.
2. **Projects → Open → 잊혀진 달**에서 이미 승인한 이야기를 확인한다. **Scenario Studio**에서 `standard`, 3장, `branching`, `multiple`을 선택한다. 모델은 `gpt-6.2-sol`, API는 `responses`, 시간은 120초, 일반 출력은 6,000, 시나리오 출력은 12,000토큰, 최대 시도는 1회다. 예산을 승인한 소유자가 **Generate scenario**를 한 번 누른다.
3. 진행 오류가 나오면 **Rejected proposal editor**에서 **Blocked at**의 장면, 도달 경로, 퀘스트의 현재·필요 상태를 읽는다. **Technical details**에서 연결·대상 ID와 조건 경로를 확인한다. 가령 반출 허가가 `active`인데 출구가 `completed`를 요구한다면, 먼저 도장을 얻는 사건이 같은 경로에서 실제로 실행되는지 확인한다. 의도에 맞게 해당 사건의 효과, 퀘스트의 목표 조건 또는 연결을 편집한다.
4. **Revalidate edited proposal**로 결정론적 검사를 다시 실행한다. 로컬 백엔드가 실행 중이면 모델 호출과 크레딧 사용은 0이다. 수정 전후를 검토하고 **Accept proposal**을 누르면 초안으로 저장된다. **Validate scenario**에서 결말별 경로를 확인하고, 고정 사실과 장소 이동을 검토한 후 **Approve scenario**를 누른다. 새로고침 후 같은 프로젝트를 다시 열어 승인 상태와 편집 내용이 보이는지 확인한다.
5. 거절 원본은 명시적으로 폐기할 때까지 보관한다. 작업 중인 수정은 현재 화면에 있으므로 이동 전에 재검증하고 채택한다. **Rejected scenario file → Export original rejected graph**는 창작 내용이 포함된 진단 파일을 저장한다. **Open rejected scenario file**은 같은 프로젝트·리비전에서 원본을 복원한다. 사이트 저장소를 사용할 수 없다는 안내가 뜨면 탭을 닫기 전에 파일을 저장한다. [Phase 2.3 결과와 한계](docs/PHASE_2_3_REPORT.md)

## ChatKHU 제공자 설정과 시나리오 생성 확인

백엔드와 CLI는 저장소 루트의 UTF-8 `.env`를 읽는다. BOM을 지원한다. 현재 프로세스에 같은 변수가 있으면 빈 값도 파일보다 우선한다. 아래 절차는 파일을 수정하지 않는다. [환경 변수 예시](.env.example)

1. 기존 개발 서버를 실행한 터미널에서 `Ctrl+C`로 종료하고 저장소 루트에서 PowerShell을 연다. 처음 설치한 경우 `.\scripts\setup.ps1`을 실행한다.
2. 아래 값을 **서버를 시작할 PowerShell**에 지정한다. 전체 시나리오 12,000토큰은 표준 3장 분기 검증용 선택값이다. 별도 설정이 없으면 전체 시나리오도 기본 출력 한도를 사용한다. 두 출력 한도의 허용 범위는 각각 128~16,000 정수이며 시간 제한은 0초 초과 120초 이하다.

```powershell
$env:WORLDWEAVER_PROVIDER = 'chatkhu'
$env:CHATKHU_MODEL = 'gpt-6.2-sol'
$env:CHATKHU_API = 'responses'
$env:WORLDWEAVER_TIMEOUT_SECONDS = '120'
$env:WORLDWEAVER_MAX_OUTPUT_TOKENS = '6000'
$env:WORLDWEAVER_SCENARIO_MAX_OUTPUT_TOKENS = '12000'
$env:WORLDWEAVER_LIVE_MAX_ATTEMPTS = '1'
.\.venv\Scripts\python.exe -m scripts.chatkhu check
```

3. `check`는 오프라인으로 실제 설정과 파일을 덮어쓴 변수 **이름**을 보여 준다. `CHATKHU_API_KEY` 충돌이 있고 루트 파일의 키를 사용할 경우에만 `Remove-Item Env:CHATKHU_API_KEY -ErrorAction SilentlyContinue`를 실행한다. 현재 셸의 키가 의도한 키라면 유지한다. 키를 화면에 출력할 필요가 없다.
4. 같은 셸에서 아래 두 명령을 차례로 실행한다. `preflight`가 실패하면 오류를 해결한 뒤 진행한다. 이 명령은 선택한 키로 `GET /models/?type=llm`을 한 번 호출해 모델 권한을 확인한다. 서버 시작 자체는 오프라인 설정 검사만 수행한다. [ChatKHU 모델 조회](https://docs.mindlogic.ai/docs/khu/api-gateway/getting-started/models)

```powershell
.\.venv\Scripts\python.exe -m scripts.chatkhu preflight
.\scripts\start-dev.ps1
```

5. 기존 **잊혀진 달**을 저장한 브라우저 프로필과 동일한 주소에서 **Projects → Open**으로 연다. 예전에 사용한 주소가 `http://127.0.0.1:5173`이면 그대로 사용한다. `localhost`는 별도 IndexedDB를 사용한다. 승인된 이야기가 있으면 그대로 연다.
6. **Scenario Studio**에서 표준 3장과 분기를 선택하고 제공자·모델·요청 1회·토큰·시간을 확인한다. 비용을 승인한 경우에만 **Generate scenario**를 한 번 누른다. 성공하면 제안에서 분기와 퀘스트를 검토한 뒤 **Accept proposal → Validate scenario → Approve scenario** 순서로 진행하고 저장 후 다시 연다. 실패하면 오류 사유와 표시된 사용량을 확인하고 재요청 여부를 직접 결정한다.

401은 키 인증, 403은 권한, 402는 잔액 또는 요청 예약 크레딧을 확인한다. 인증에 성공해도 제공자가 이번 시나리오를 시간과 출력 한도 안에서 완성할지는 별도 확인이 필요하다. 출력 한도는 추론을 포함하며 크레딧 금액과 단위가 다르다. `credits`로 현재 잔액을 별도로 조회할 수 있다. [ChatKHU Responses API](https://docs.mindlogic.ai/docs/khu/api-gateway/reference/responses-api) · [크레딧 조회](https://docs.mindlogic.ai/docs/khu/api-gateway/reference/credits) · [Phase 2.1 검증 보고서](docs/PHASE_2_1_REPORT.md)

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

런타임 에이전트는 서사 생성, 시나리오 구성, 세계 생성, 검증을 분담한다. 현재 시나리오 생성의 모델 호출은 한 번이며, 진행 오류 수정에는 설계자의 편집과 명시적 채택이 필요하다. 개발용 저장소 스킬은 향후 코딩 에이전트가 테스트와 검증 절차를 따르도록 안내한다. [런타임 흐름](docs/AGENT_WORKFLOW.md) · [개발 규칙](AGENTS.md)

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
