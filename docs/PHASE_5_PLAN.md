# Phase 5 실행 계획과 소유자 커밋 게이트

5A의 산출물은 제품 감사, [화면·상호작용 설계](PRODUCT_POLISH_DESIGN.md), 이후 단계의 실험 계획, 테스트 CI다. 다음 표에서 소유자가 한 단계를 요청할 때마다 해당 행에서 멈춘다. 앱·테스트·프로젝트 데이터는 5A 변경 대상 밖이다.

## 출발점

감사 시 `feature/product-polish`의 HEAD는 `c0559e2d130971b68e47bafd24d777da544ff8df`였고 작업 트리는 깨끗했다. 로컬 추적 참조도 같은 커밋을 가리켰다. `git show --name-only c0559e2`에서 Phase 4 테스트와 구현이 함께 들어간 것을 확인했다. 과거 RED/GREEN 기록은 실행 증거로 보존한다. 제출용 선행 테스트 커밋은 아래 세 가지 신규 동작에서 확보한다.

| 조사한 경계 | 이미 동작하는 것 | 다음에 필요한 것 |
|---|---|---|
| `App`, `Dashboard`, `Content`, `Direction`, `Narrative` | 최근 저장순 목록, 프로젝트 생성, 단일 소재·고정 사실 편집, 후보 비교와 승인·오래된 원본 안내 | 자유 입력의 원본과 추출 검토본, 작업 흐름 전체의 진도, 긴 글의 비교·읽기 밀도 |
| `copy`, `studioWorkflowCopy`, `scenarioCopy`, `worldBibleCopy`, `verificationCopy`, `semanticReviewCopy` 및 컴포넌트의 직접 문자열 | 일부 문구와 서식 함수가 기능별로 모여 있다. `index.html`은 en, Dashboard 날짜는 시스템 기본 로캘이다. | 한국어 기본 설정, 영문 전환, 한국어·영어 메시지 키 및 접근성 문구 동기화, 편집 중 전환 |
| `scenarioWorkflow.importProject`, `App` 가져오기, `useProjects`, `storage` | 크기 제한, 스키마·참조 검사, 충돌 ID 사본 생성, 단일 트랜잭션 저장 토큰, 저장 실패 시 복구, JSON·Markdown·SVG 출력 | 같은 ID에 안전하게 복원하는 선택지, 사전 비교와 복원 중 경쟁 쓰기 검증 |
| `ScenarioCanvas`, `NodeInspector`, `AtlasMap`, `AtlasSheet` | React/SVG DAG, 장 그룹·키보드·줌, 경로별 진행 검증, 시드 기반 지도와 계층·범례·척도 | 라벨 중첩 해결, 엔딩 증거 경로 선택, 확대 단계별 지도 세부 표현 |
| `WorldBible`, `VerificationAgent`, `verificationHistory`, `SemanticReview` | 동일 정본 ID, 관계·영향, 결정적 도구 영수증, 수리 비교와 재검사, 유료 요청별 동의 | 기록 간 이동 후 문맥 복원, 증거의 읽기 순서, 현재·과거의 시각적 구분 |
| `backend/app/{main,narrative,scenario,provider,semantic_review}.py` | 서버 전용 어댑터, 유효성 검사와 구조화된 실패, 예산·사용량·도구 영수증, `/health`와 `/api/generation` | 텍스트 추출 전용 계약과 명시적 로컬 대안, 실제 관측치에 한정한 운영 화면 |
| Git과 의존성 | 고정 `backend/requirements.txt`, `frontend/package-lock.json`, Python 3.13, Node 24+, Windows 시작 스크립트 회귀 | 감사 시작 시 추적 중인 GitHub Actions 워크플로가 없었다. 5A에서 테스트와 빌드 게이트를 연다. |

## 세 규칙의 테스트 계약

### A · 5B — 자유 입력 원문을 보존하고 검토한 소재만 반영한다

현재 `Content.tsx`는 한 번에 한 분류의 소재를 입력·저장하고 `project.editContent`로 정본 버전을 올린다. 자연어 묶음을 붙여 넣은 뒤 제공자 실패에서 이어가는 추출 작업본은 없다. 사용자는 키가 없거나 분석이 실패해도 원래 문장과 기존 작품을 보존한 채 작업을 계속할 수 있어야 한다.

- **진입점·입력** — 기존 소재와 고정 사실이 있는 프로젝트의 Content Studio. 한국어 제목·라벨·목록, 알 수 없는 표제, 개행·공백이 섞인 원문을 입력한다. `frontend/src/contentIntake.test.tsx`(예정)에서 DOM과 저장소를 관찰하고, 전송 계약 검사는 `backend/tests/test_content_extraction.py`(예정)에서 한다. 파일명은 계획이다.
- **관찰할 값** — 서버가 미설정이면 수동 편집과 로컬 정리가 가능하고 생성 POST는 0회다. 명시적으로 요청한 추출 1회가 시간 초과·불량 응답이면 원문·기존 정본·승인을 보존하고 로컬 정리를 제시한다. 출처는 ‘규칙으로 정리’다. 헤더 없는 모호한 문장은 검토 대기로 남는다. 편집한 행만 선택·수락하면 한 번에 추가되고, 거절·만료면 정본 쓰기 0회이고 승인은 그대로다. 분리된 로컬 초안과 작업 영수증(실행 ID·방법·결과)은 다시 열 수 있다. 새 모델 요청을 묵시적으로 시작하지 않는다.
- **RED** — 실제 App/Content 엔트리에서 자유 입력 → 초안 검토 동작 또는 실패 후 원문/로컬 정리 동작이 없다. 테스트가 수집된 뒤 이 동작의 부재로 실패해야 한다. 없는 모듈을 import해 수집을 깨는 것은 증거에서 제외한다. 실패 응답·잘못된 분류·오래된 응답은 fake fetch 및 주입한 mock provider, 저장은 fake IndexedDB를 쓴다.
- **GREEN** — 기존 소재 편집기 옆에 프로젝트별 원문/분리된 초안·검토를 연결하고, 유효성 검사와 revision/token을 통과한 선택행만 기존 저장 흐름에 추가한다. 서버 측 추출 경계는 기존 provider, 용량·확인·시간 제한과 구조 검증을 재사용한다. 짧은 지원 문법과 출처 계약은 [제품 설계](PRODUCT_POLISH_DESIGN.md)에 있다.
- **커밋** — RED `test(content): specify lossless intake and reviewed fallback` → GREEN `feat(content): preserve source drafts and apply reviewed extraction`.

### B · 5C — 언어 전환은 편집 입력·저장 토큰·승인을 보존한다

현재 편집 입력은 React 상태에 있고 뷰 일부의 key는 프로젝트 ID와 editorEpoch를 사용한다. 인터페이스 언어 설정은 없다. 한국어 작가가 영어 메뉴로 전환해도 쓰던 대사와 승인된 서사·검증 기록을 그대로 사용할 수 있어야 한다.

- **진입점·입력** — `frontend/src/interfaceLocale.test.tsx`(예정). 설정이 없는 새 프로필에서 한국어로 시작한다. 기존 승인과 검증 이력이 있는 프로젝트에서 저장하지 않은 한영 혼합 대사를 입력하고 UI를 영어, 다시 한국어로 전환한다. 접근 가능한 버튼 이름·페이지 lang·날짜 로캘이 바뀌고, 선택·원문·커서/포커스 복귀가 유지된다. 재열었을 때 선택 언어가 남고 새 프로젝트에도 적용된다.
- **경계 단언** — 전환 전후 Project 전체, revision·versions·validation/approval·지문과 IndexedDB 행의 token/savedAt이 동일하다. UI 언어를 이유로 번역·생성 요청을 보내지 않는다. 앱 재실행에는 언어 설정의 지속성만 요구한다. 미저장 일반 편집기의 새로고침 복구는 별개다.
- **RED/GREEN** — 현재 UI에서 언어 전환을 수행할 수 없어 동작 단언이 실패할 것으로 예상한다. `App` 루트에 개인 설정·타입화된 2개 메시지 사전을 연결하고 `copy` 계열, 직접 문자열과 날짜/접근성 출력에 공급한다. 도메인 함수와 편집기 key를 보존한다. 저장 실패는 세션 설정으로 처리한다. 로컬 저장소·날짜·가짜 IndexedDB와 차단된 생성 전송으로 검증한다.
- **회귀 전환** — 5C GREEN에서 기존 영어 접근성 이름을 단언하는 테스트의 준비 단계에만 명시적 영어 선호를 지정한다. 실제 단언은 유지한다. 별도 빈 프로필로 첫 실행 한국어, 영어 전환과 메시지/인자 키 일치를 검사한다. 전역 테스트 설정은 기본 언어를 강제하지 않는다.
- **커밋** — RED `test(locale): protect editor drafts and project receipts on language switch` → GREEN `feat(locale): add Korean-first interface preferences outside projects`.

### C · 5D — 동일 ID 복원은 미리 본 저장본에만 원자적으로 적용한다

잘못된 파일을 거절하고 충돌 ID를 새 사본으로 가져오는 기능과 저장 토큰 경쟁 검사는 이미 있다. 현재 `App.tsx`의 충돌 선택은 사본 생성 또는 취소다. 기존 프로젝트 ID로 특정 백업을 되돌리는 검토·저장 절차가 없다.

- **진입점·입력** — `frontend/src/projectRestore.test.tsx`(예정), 필요 시 기존 `storage.test.ts`에 복원 트랜잭션 경계를 추가한다. Dashboard에서 같은 ID의 구버전 정본 JSON을 열어 **복원 / 사본 / 취소**를 구분한다. 작업 전후 제목·리비전·변경되는 승인, 복구본을 비교한다. 미리보기 후 두 번째 탭에서 같은 의미 리비전으로 저장 토큰만 바꾼 뒤 첫 탭에서 복원을 확인한다.
- **경계 단언** — 첫 탭이 최신 저장을 덮지 않고 다시 비교하도록 안내한다. 취소·불량 파일·할당량 실패·중간 쓰기 오류는 원래 프로젝트와 복구 이력을 보존한다. 성공은 한 트랜잭션에서 검토한 직전본과 복원본을 보존하고 다시 열 수 있다. 동일한 프로젝트·엔티티 ID와 연결을 유지한다. 외부 파일이 주장한 검증/승인·준비된 수리로 현재 승인이나 실행 권한을 얻을 수 없다. 정상적인 사본 가져오기 동작도 유지한다.
- **RED/GREEN** — 기존 가져오기만 가능한 상태에서 **동일 프로젝트 복원 미리보기**와 낡은 미리보기 거절을 사용자 진입점에서 단언한다. 새 RED를 기존 CAS 단위 테스트로 대체하지 않는다. GREEN은 `App`, `scenarioWorkflow.importProject`, `useProjects`, `storage`와 기존 검증/승인 경계를 재사용한다. 파일은 합성본, 두 탭은 격리 DB에 대한 두 연결, 실패는 트랜잭션 abort로 재현한다. 모델은 관여하지 않는다.
- **복원 리비전** — 파일 revision을 현재 시계로 되감지 않는다. 복원을 새 변경으로 저장하고 현재 저장 토큰과 새 리비전을 발급한다. 검증 전 출처·승인 상태를 명시하고, 이전 검사·제안은 역사적 기록으로만 열어 본다. 재검증과 적절한 소유자 승인 후 현재성을 표시한다.
- **커밋** — RED `test(recovery): reject same-id restores after a competing save` → GREEN `feat(recovery): restore reviewed backups with atomic conflict protection`.

## 정지점과 증거

| 단계 | 허용 작업 | 종료 시 필요한 관측 |
|---|---|---|
| 5A | 계획·설계·테스트 CI와 로컬 기준선 | 이 문서, 설계, 워크플로 검사, 리뷰 및 회귀 결과. 구현 테스트 작성은 다음 요청부터다. |
| 5B RED | 그룹 A 테스트와 합성 fixture만 | `npm.cmd --prefix frontend test -- contentIntake.test.tsx`, `.\.venv\Scripts\python -m pytest -q backend/tests/test_content_extraction.py`. 의도한 단언·종료 코드 제시 후 소유자 테스트 커밋 대기 |
| 5B GREEN | 확인된 A 테스트 커밋 위에 A만 구현 | 같은 단언·전체 회귀 통과 후 소유자 구현 커밋 대기 |
| 5C RED | B 테스트만 | `npm.cmd --prefix frontend test -- interfaceLocale.test.tsx`, 수집된 편집 중 전환 실패, 소유자 테스트 커밋 대기 |
| 5C GREEN | B 설정·번역 경계만 | 동일 테스트·전체 회귀 후 소유자 구현 커밋 대기 |
| 5D RED | C 테스트만 | `npm.cmd --prefix frontend test -- projectRestore.test.tsx`, 동일 ID 복원 흐름에서 의도한 실패, 소유자 테스트 커밋 대기 |
| 5D GREEN | C 복원·복구 경계만 | 동시 수정·취소·실패 보존과 전체 회귀 후 소유자 구현 커밋 대기 |
| 5E | 승인된 시각 체계와 8개 화면 적용 | 실제 뷰포트·키보드·장문·지도/그래프의 근거를 수집한다. 새 행동/결함은 같은 소유자 RED/GREEN 정지점을 별도로 거친다. |
| 5F | 독립 서브에이전트 최종 리뷰, 실제 지적 수정, 재검증, PR 준비 | 검토 대상 SHA·지적·수정 diff·소유자의 수정 커밋 SHA·재검증·해결 여부. 소유자가 PR을 열어 일반 merge commit으로 병합한다. |

5B의 소유자 RED 커밋 `81bef2ff5a867cfb1ce09962bec74e54da624ee1`에는 신규 테스트 파일 두 개만 있다. 같은 단언 10개에서 GREEN을 관측했다. 구현 커밋 SHA와 5C 착수는 소유자 확인 뒤 기록한다. [Phase 5B 보고서](PHASE_5B_REPORT.md)

각 RED는 테스트만 담은 diff·실제 실패를 보고한 후 **정지**한다. `git show --stat <owner-test-sha>`와 해당 테스트 diff를 확인하고 같은 실패를 재현한 뒤에만 GREEN에 착수한다. 각 GREEN도 구현 및 전체 회귀를 보고한 후 **정지**한다. 다음 그룹 전 소유자 구현 커밋을 확인한다. 두 SHA와 부모 관계, 실제 명령·단언·결과를 [증거 원장](TDD_EVIDENCE.md)에 기록한다. 예정된 실패는 RED 관측으로 집계하지 않는다. 커밋 분리와 제출용 이력을 유지하고 squash·이력 재작성은 사용하지 않는다.

## CI와 제출 인수 기준

풀 리퀘스트의 base가 main이거나 main 또는 feature/product-polish에 push되면 파일 경로와 무관하게 검사한다. Windows의 시작 스크립트 검사까지 포함한 전체 테스트와 계약 검사가 먼저다. 성공 시에만 빌드한다. 마지막 `WORLDWEAVER required`가 각 선행 작업의 성공 여부를 확인한다. 소유자는 첫 실제 실행 후 main의 branch rules에 이 검사를 필수로 선택하고 PR 및 최신 결과를 요구한다. RED가 빌드를 건너뛰고 필수 검사를 실패시키는 실행 링크, 대응 GREEN 성공 링크, 두 SHA 및 일반 merge commit을 보관한다. 원격 설정·실행은 로컬 결과와 따로 확인한다.

Phase 6에서는 승인된 main의 **동일 SHA**와 성공한 필수 검사를 전제로 Docker 이미지 빌드 → 해당 이미지 digest 배포 → 서비스 health·버전/SHA 확인으로 이어간다. 실패·중단·누락된 작업에서는 배포를 막고 실제 실패 차단과 재배포 기록을 남긴다. 5A에는 배포 작업·시크릿·Docker 설정이 없다. Phase 7 릴리스 감사는 별도 요청이다.

## 5A 로컬 실행 기록

Windows, Python 3.13.1, Node 24.13.0, npm 11.21.2에서 확인했다. 시작과 종료 시점의 제품 소스·테스트·잠금 파일은 동일하다.

| 실제 검사 | 결과 |
|---|---|
| `.\.venv\Scripts\python -m pytest -q` | **296 통과**, 기존 Starlette/AnyIO deprecation 경고 1개 |
| `npm.cmd --prefix frontend test -- --reporter=dot` | **36개 파일, 167 통과** |
| `npm.cmd --prefix frontend run check:types`, `npm.cmd --prefix frontend run typecheck`, `npm.cmd --prefix frontend run build` | 모두 종료 0. JS 624.78 kB, gzip 188.32 kB, 기존 Vite 청크 크기 경고 |
| CI의 실제 Python 스키마 단계 | 정본 Draft 4 및 후보·시나리오·수정·의미 분석의 전송 스키마 4개 Draft 2020-12 모두 통과 |
| 의존성 | 격리 디렉터리에서 잠금 파일만 복사해 `npm ci --offline --no-audit --no-fund` 성공. 기존 venv에서 Windows에 적용되는 Python 고정 버전 32개 모두 일치, `pip check` 성공. 별도 빈 환경의 ensurepip 및 pip 임시 디렉터리 쓰기가 Windows 권한으로 실패해 Python 신규 설치의 완료는 미확인 |
| 워크플로 | actionlint 1.7.12로 `actionlint .github/workflows/test.yml` 통과. YAML에서 읽은 PR/push 대상, 의존 관계, 최소 권한을 확인했다. 최종 Python 게이트 본문에 성공·실패·건너뜀·취소를 조합한 16가지를 넣어 두 작업 모두 성공인 한 가지에서만 종료 0을 확인했다. `git diff --check` 통과 |

독립 서브에이전트가 기존 테스트·설계·CI를 읽고 지적한 사항을 반영했다. 복원은 미리보기의 **저장 토큰**을 사용한다. 분리된 원문/운영 기록은 거절 후에도 보존한다. 동일 문구의 인용은 정확한 문구와 등장 순번으로 매칭한다. 기존 영어 접근성 회귀는 명시적인 로캘 fixture에서 유지한다. 검토 결과는 설계·CI 수준의 증거이며 5F 코드 수정 커밋의 SHA는 소유자가 실제 커밋한 뒤 기록한다.

호스팅된 테스트 VM에서만 설치 후 Python·Node 프로세스의 외부 HTTP(S)용 TCP 80/443을 방화벽으로 차단한다. 로컬 PC의 방화벽은 변경하지 않았다. 라이브 공급자 호출/크레딧 사용 0, 소유자 프로젝트·IndexedDB·자격 증명은 변경하지 않았다. 원격 Actions·방화벽 적용·Linux runner 빌드·main 보호 설정은 실제 push 이후 확인할 항목이다.
