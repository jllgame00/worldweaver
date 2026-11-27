# Implementation TDD evidence

Phase 0의 설계 검증은 [Phase 0 보고서](PHASE_0_REPORT.md)에 기록했다.

## Phase 5D · restore after a competing save

Clean start on `feature/product-polish` at `34aad6d7552dc033e8fb945a6dcaa7e9736998ce`. Its parent is the separate 5C GREEN commit `ae5979a362ce5e46b9a9192b07f1ba7c9eaaa422`. The RED commit added only `frontend/src/projectRestore.test.tsx`. Its assertions stayed unchanged.

| Command | Observation |
|---|---|
| `npm.cmd --prefix frontend test -- projectRestore.test.tsx --reporter=verbose` before changes | Exit 1. Six UI cases could not find the restore review dialog. The second D2 case reached its token-only competing save, then found an undefined storage restore function. Four invalid-file cases already passed. |
| Same command after implementation | Exit 0. All original 11 passed, including stale denial at both boundaries, explicit confirmation, rollback, previous JSON after reopening, duplicate and cancellation. |
| Full pytest / Vitest / typecheck / build | 313 Python tests, 204 frontend tests in 43 files, generated types, strict TypeScript and Vite passed. Eight implementation-stage regressions are in `projectRestoreEdges.test.tsx`. |

The tests used production persistence functions on isolated fake IndexedDB connections and jsdom. Live provider calls and cost were zero. The 5D GREEN commit is pending the owner. [Case results, limits and reproduction](PHASE_5D_REPORT.md)

## Phase 5B owner test commit

`feature/product-polish` started clean at `81bef2ff5a867cfb1ce09962bec74e54da624ee1`, parent `2bd184b6fc18438c3a15366e8fe92ce0375f07d4`. `git diff HEAD^ HEAD --name-status` showed only two added test files. Both files and their assertions remained unchanged through GREEN.

| Focused command | Observed before implementation | Observed after implementation |
|---|---|---|
| `npm.cmd --prefix frontend test -- contentIntake.test.tsx --reporter=verbose` | Exit 1, six collected B1–B4 cases reach Content Studio and fail to find the Paste ideas tab | Exit 0, six pass. Timeout, no credentials, invalid response, rejection, selective acceptance and a newer saved revision |
| `.\.venv\Scripts\python -m pytest -q backend/tests/test_content_extraction.py --tb=short` | Exit 1, four 405 responses. A valid quote expected 200. Malformed JSON, invalid category and nonexistent citation occurrence expected 502 | Exit 0, four pass with a provider mock. Detachment and invalid-output rejection |

Post-GREEN coverage added 13 backend and two frontend cases. Full regression passed 313 pytest and 175 Vitest. Type synchronization, strict TypeScript, Vite build, canonical and five transport schemas, actionlint and Git whitespace checks passed. The compiled integration used jsdom, fake IndexedDB and one real loopback request to the development mock. Native Chrome access was declined. Live provider requests and credit use stayed at zero. [Exact test names and limitations](PHASE_5B_REPORT.md)

The owner's separate 5B GREEN commit is `0a9cc291a1a8df71b6a52542d3a8505db92e2272`, directly after the verified 5B RED commit.

## Phase 5C owner test commit

The clean `feature/product-polish` branch started at `16f8ae67550cd342627c12cb7615b31a319dabb8`. Its parent is the 5B GREEN commit. `git diff HEAD^ HEAD --name-status` showed only the new `frontend/src/interfaceLocale.test.tsx`.

`npm.cmd --prefix frontend test -- interfaceLocale.test.tsx --reporter=verbose` collected six cases and exited 1 before implementation. C1 expected `프로젝트` and received `Projects`. C2, C3, C4 and both C5 cases stopped at the absent language combobox. With the committed tests intact, the six passed and executed their project, draft, approval, receipt and persistence assertions. The owner has yet to create the 5C GREEN commit. [Exact test names and results](PHASE_5C_REPORT.md)

Post-GREEN tests covered an invalid stored locale, an open reviewed intake proposal, an unknown API diagnostic, and Atlas viewport and export persistence. Full runs passed 313 pytest and 185 Vitest tests. Strict TypeScript, generated types, Vite build, schema checks and actionlint passed. The compiled jsdom check used an isolated fake IndexedDB and a real loopback FastAPI mock server. Provider requests stayed at zero.

## Phase 2.2 · Canonical entity references

All generation below used deterministic or mocked providers. RED results were observed before their corresponding behavior was implemented. Commands used the repository venv and the frontend npm workspace.

| Criterion and command | RED observed | GREEN observed |
|---|---|---|
| Full generation and Korean fixture, `python -m pytest -q backend/tests/test_scenario_entities.py` | 5 failed, 2 passed. The structured declaration fixture returned 502 at the root rather than 200. Four adversarial cases received generic contract rejection. Subsequent duplicate-name cases (`-k duplicate_declarations`) initially passed through as 200 in all 8 cases. | Final 19 passed, including the Korean two-ending fixture, exact typed aliases, same-type duplicate names, NFC-equivalent Korean names, conflicting IDs, wrong-domain/unknown refs, canonical and new locations, and a rejected response containing four distinct field paths. |
| Domain and import checks, `python -m pytest -q backend/tests/test_typed_references.py`, `npm.cmd --prefix frontend test -- typedReferences.test.ts` | 9 pytest and 2 Vitest failures. The declared inventory was rejected, an undeclared key could pass, and affiliation/quest condition errors lacked individual field paths. Additional import path tests failed on a generic project error. | All seven term kinds exercised. Old namespace collisions stay readable and deterministically become unique IDs on a reviewed replacement. Input API and JSON importer identify the field. |
| Atomic client acceptance, `npm.cmd --prefix frontend test -- scenarioAcceptance.test.ts` | First 2 cases failed. New legitimate cast refs were rejected and a duplicate declaration was ignored. Individual REDs subsequently demonstrated a missing reference repair operation, proposed location replacement, undeclared keys when the declaration block was absent, and generic import errors. | 6 passed. Covers declined/stale boundaries with existing workflow tests, duplicate/overwrite protection, no mutation of the original, single deterministic repair check, JSON export/import and IndexedDB reopen. |
| Owner review, `npm.cmd --prefix frontend test -- ScenarioStudio.test.tsx ScenarioEditor.test.tsx` | 3 failed, 12 passed in the first UI run. Missing entity preview, guidance for prose-only projects, and a flag field that accepted arbitrary text. A separate grouped-findings test failed before the UI change. | 17 passed. Two additional integration regressions exercised reopening findings and failed generation → typed relink → validation → separate acceptance. |
| Manual registration, `npm.cmd --prefix frontend test -- NarrativeRegistry.test.tsx` | Individual REDs for missing Entity name control in the approved narrative and in a detached repair draft. | 2 passed. The original story/approval survives registration, and missing cast can be registered within a repair without changing the saved project. |
| Compatibility and error transport, `python -m pytest -q backend/tests/test_registry_schema.py` | Declared item failed Draft 4 validation. Detached repair test lacked fieldPath. Two wire dependency tests failed due to absent findings for unresolvable chapter/quest links. | 5 passed, including an additional regression for generating the first inventory from an approved project with empty cast, factions and graph. The two prior compact-link tests also passed with their original error codes. |

Final `python -m pytest -q` passed **243** tests (one existing Starlette/AnyIO deprecation). `npm.cmd --prefix frontend test` passed **57** across 10 files. Strict TypeScript, Vite build, generated types, canonical Draft 4, both transport schemas, exact legacy JSON round trip and `git diff --check` passed. Built UI + actual loopback FastAPI with mock generation passed scenario create/revise/validate (HTTP 200), approval/reopen in jsdom/fake IndexedDB. A separate assembled Phase 1 mock integration also passed. A fresh Edge renderer probe returned `spawn EPERM`. No successful rendered browser or live-provider result is claimed. [Phase 2.2 report](PHASE_2_2_REPORT.md)

## Phase 2.1 · Scenario generation reliability

Initial full backend run with the existing Phase 2 worktree: 163 passed. The following RED results preceded their corresponding fixes. All provider calls used mocked boundaries.

| Focused command (repository venv) | Observed RED | Observed GREEN |
|---|---|---|
| `python -m pytest -q backend/tests/test_environment.py scripts/test_chatkhu.py -k "safe_configuration_error or offline_check or full_scenario_output_limit or preflight"` | 16 failed on field-level errors, effective settings, scenario cap and auth-only command. One subsequent assertion failed before the CLI showed safe model/API labels. | 16 passed and the additional assertion passed. Covers process/file conflict names, invalid ranges, authentication denial, model entitlement and no generation. |
| `python -m pytest -q backend/tests/test_chatkhu_provider.py::test_gateway_reports_only_allowlisted_incomplete_metadata backend/tests/test_scenario.py::test_failed_live_response_preserves_valid_scenario backend/tests/test_live_provider.py::test_live_errors_are_safe_and_nonmutating` | 12 failed, 13 passed. Exhaustion and filtering collapsed into one failure and lost numeric receipts. Separate scoped-cap tests observed the base 5,000 instead of 12,000 on both adapters. | Focused checks passed, including receipts, scenario-only cap and preservation of approved work. |
| `python -m pytest -q backend/tests/test_scenario.py -k standard_compact_proposal` | Both fixtures failed on redundant edge aliases. A separate guarded branch check exposed missing quest guards. A null-reward assertion detected an invented reward. | Both language fixtures pass canonical validation. Guard/effect tests exercise feasible endings and preservation of explicit and absent rewards. |
| `python -m pytest -q backend/tests/test_scenario_reliability.py` | Five failures on configuration, authentication or incomplete-response diagnostics. A subsequent cap-change test initially returned 422 instead of 409. | Six passed, including rejection before provider dispatch when the reviewed cap changes. |
| `npm.cmd --prefix frontend test -- ScenarioStudio.test.tsx -t "shows the live scenario budget"` | Missing one-request budget. | Passed, including numeric reasoning usage, single dispatch and persistence of the approved scenario and design revision after failure. |

Final checks: `python -m pytest -q` 209 passed (one existing dependency deprecation). `npm.cmd --prefix frontend test` 42 passed. `npm.cmd --prefix frontend run build` passed generated types, strict TypeScript and Vite. Both strict provider schemas, canonical Draft 4 and exact example round trip passed independent schema checks. Built frontend + loopback mock API returned HTTP 200 for scenario generation, targeted revision and validation, and reopened the approved design via jsdom/fake IndexedDB. [Owner report](PHASE_2_1_REPORT.md)

## Phase 2 · Windows 실행과 시나리오 재열기

| 항목 | 실행과 관찰 |
|---|---|
| 실행 스크립트 RED → GREEN | `.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider scripts/test_dev_startup.py -q --tb=line`. RED 종료 1, 수집한 2개 모두 실패. 스크립트가 없어 점유 포트와 기존 디렉터리 보호 안내를 받을 수 없었다. 임시 디렉터리 권한 문제를 고친 뒤 이 RED를 기록했다. GREEN 종료 0, 2개 통과. 프런트엔드 디렉터리에서 호출해 8000 포트 충돌 및 식별 불가한 `.venv`·기존 `.env`의 보존을 검증했다. |
| ChatKHU CLI 진단 RED → GREEN | `python -m pytest -p no:cacheprovider scripts/test_chatkhu.py -k 401 -q --tb=line`. 주입한 401 응답에서 기존 오류는 키 확인만 안내해 RED 종료 1, 1개 실패, 17개 제외. 셸 우선순위와 값을 표시하지 않는 확인·해제 명령을 안내한 뒤 GREEN 종료 0, 1개 통과, 17개 제외. 응답 본문을 읽거나 실제 Gateway에 접속하지 않았다. |
| 환경/CLI 회귀 | `python -m pytest -p no:cacheprovider backend/tests/test_environment.py scripts/test_chatkhu.py scripts/test_dev_startup.py -q --tb=line` 종료 0, 28개 통과. 합성 BOM 파일과 다른 작업 디렉터리에서 셸·파일 우선순위, 빈 값·공백·줄바꿈·비ASCII 키 거부를 검증했다. 키 거부 5개는 기존 동작 확인이다. 이 실행에서 캐시 플러그인을 명시적으로 끈 탓에 pytest가 `cache_dir` 설정 경고 1개를 냈다. |
| 설치와 종료 | Windows PowerShell, Python 3.13.1, Node 24.13.0. 격리된 저장소 복사본에서 기존 고정 의존성이 있는 venv로 `scripts/setup.ps1`을 실행해 종료 0, npm 잠금 파일 설치 및 기존 `.env` 보존을 확인했다. 빈 venv 설치는 Python의 `ensurepip`가 전용 임시 디렉터리에 쓰지 못해 WinError 5로 중단됐다. 이 환경에서는 작업 공간 안으로 TMP를 옮겨도 같은 제한이 있었다. |
| CLI 파일 경로 RED → GREEN | `python -m pytest scripts/test_chatkhu.py -k script-from-frontend -q --tb=line`. 프런트엔드 디렉터리에서 CLI 파일 경로를 지정한 실제 자식 프로세스가 백엔드 모듈을 찾지 못해 RED 종료 1, 1개 실패. 스크립트로 실행할 때 저장소 루트에서 공통 로더를 찾게 한 뒤 비어 있는 셸 키에 대해 정해진 오류를 받아 GREEN 종료 0, 1개 통과, 18개 제외. `python -m pytest backend/tests/test_environment.py scripts/test_chatkhu.py scripts/test_dev_startup.py -q --tb=line` 종료 0, 29개 통과, 실제 Gateway 요청 0건. |
| 포트와 종료 | 8000·5173에 기존 프로세스가 있어 그대로 두고, 격리된 복사본의 포트만 바꿔 실행했다. 최초 시도에서 Ctrl+C 뒤 프로세스 트리 종료가 권한 오류로 실패했다. Vite의 시작 시 얻은 프로세스 핸들을 보관하고 Uvicorn을 포그라운드에서 실행하도록 고쳤다. 재검증에서 `15173/api/generation`은 mock, `18183/health`는 ok였다. Ctrl+C 이후 두 포트의 LISTEN이 사라졌고 원래 포트의 PID 두 개는 유지됐다. |
| 배포용 번들과 실제 로컬 API | `npm.cmd --prefix frontend run build` 종료 0. 별도 루프백 포트 18182에서 mock FastAPI로 번들을 제공했다. `node .scratch/browser/phase2-compiled.mjs` 종료 0. jsdom·fake-indexeddb에서 합성 승인 서사를 가져와 9개 노드 제안을 생성·수락하고 Enter로 첫 노드를 선택했다. 해당 노드의 수정 제안을 수락하고 노드 ID 전체와 고정 사실 보존을 확인했다. 생성·수정·검증은 실제 루프백 HTTP 200이었다. 검증과 검토 체크 후 승인하고 앱을 다시 마운트해 같은 승인과 노드 전체를 확인했다. 검증용 18182 서버도 종료했다. |
| 실제 브라우저와 보안 | 브라우저 연결 호스트가 응답하지 않았고 Chrome 창 제어는 권한을 받지 못했다. 실제 브라우저 렌더링·디스크 IndexedDB와 사람의 서사 평가는 미검증이다. 루트·셸 키의 일치 여부만 비교해 다른 값임을 확인했다. 당시 401의 직접 원인은 미확정이다. 추적 파일, 제외되지 않은 새 파일과 빌드 자산 100개를 점검한 시점에 실제 키 일치 파일 0개였다. 루트 `.env`는 미추적·제외 상태였다. 실연동 요청 0건. |

## 로컬 프로젝트 복원과 개발 샘플

`npm.cmd --prefix frontend test -- src/App.test.tsx src/devProxy.test.ts -t 'development sample|new browser origin'`으로 구현 전후를 검증했다.

| 사례 | 관찰한 RED와 GREEN |
|---|---|
| Vite 재시작 시 출처 유지 | 포트를 점유한 상태에서 RED는 Vite가 다음 포트로 이동해 시작했다. GREEN은 해당 포트 오류를 반환했다. 테스트는 실제 루프백 서버를 사용한다. |
| 잊혀진 달 생성과 재열기 | RED는 샘플 버튼을 찾지 못했다. GREEN은 정본 스키마를 통과한 12개 소재의 분류와 원문, 고정 사실 3개, 같은 제목의 기존 레코드 보존을 검사했다. 새로 마운트한 앱에서 두 프로젝트가 목록에 나타나고 새 샘플을 다시 열었다. jsdom과 fake-indexeddb를 사용했다. |

RED 종료 1 및 2개 실패, GREEN 종료 0 및 2개 통과. 최종 `npm.cmd --prefix frontend test` 22개, `python -m pytest backend/tests scripts -q --tb=line` 113개 통과. `npm.cmd --prefix frontend run build`에서 정본 타입 검사와 번들 빌드가 통과했다. 생성된 번들에서 샘플 제목과 고정 사실 원문이 빠진 것을 확인했다.

별도의 로컬 통합 점검에서는 실제 Vite와 mock FastAPI를 임시 포트에서 종료 후 다시 시작했다. jsdom에서 같은 프런트엔드 주소와 fake-indexeddb 저장소를 재사용해 새로고침과 재시작 뒤 동일한 레코드를 열었다. 다른 호스트를 별도 저장소로 모델링했을 때는 목록이 비었다. HTTP는 mock 상태 조회 GET 네 건이었다. 실제 Chrome은 접근 승인이 없어 소유자의 원본 레코드는 미확인이다. [읽기 전용 확인 절차](../README.md#로컬-프로젝트-다시-열기)

## Phase 1.5-C · ChatKHU Gateway

기준은 `522d067` 위의 미커밋 Phase 1.5 작업 트리다. 생성 테스트는 가짜 HTTP만 사용했다.

| 사례 | 관찰한 RED와 GREEN |
|---|---|
| Gateway의 두 경로, 구조·참조, 인증·크레딧·속도, 이전 상태 보존 | `python -m pytest backend/tests/test_chatkhu_provider.py -q --tb=line` · RED 종료 1, 12개 실패와 직접 OpenAI 1개 통과. ChatKHU 선택이 구성 파서에서 거부됐다. 두 SDK 경로와 키를 분리한 뒤 같은 명령 종료 0, 당시 13개 통과. |
| 별도 키, 생략된 토큰 메타데이터, 중복 JSON | 같은 서버 테스트에서 `-k shared_credential`, `-k without_total`, `-k duplicate_json_member`를 각각 실행했다. RED는 각 1개 실패였다. Gateway가 같은 키를 허용했고, 선택적 토큰 항목이 없을 때 측정치를 버렸으며, 중복 키가 고정 사실 충돌을 숨겼다. 보완 후 서버 전체 17개 통과. |
| 진단 CLI | `python -m pytest -q -p no:cacheprovider scripts/test_chatkhu.py::test_module_requires_an_environment_key` · RED 1개 실패, GREEN 1개 통과. 고정 경로 조회와 텍스트 추정 테스트를 추가했다. `-k 'safe_authorized or http_failures'`는 User-Agent 및 안전한 HTTP 진단 누락으로 RED 4개 실패, GREEN 6개 통과. `-k shared_openai`는 같은 키를 보낸 RED 1개 실패, 차단 후 GREEN 1개 통과. |
| UI 제공자 선택 | `frontend`에서 `npm.cmd test -- src/App.test.tsx -t 'refreshes ChatKHU Gateway'` · RED 종료 1 및 2개 실패. Gateway 상태가 표시되지 않았다. 같은 명령 GREEN 종료 0 및 2개 통과. 같은 모델의 제공자를 바꿔도 새 설정을 확인하고 다음 생성 클릭을 기다린다. |
| 최종 회귀 | `python -m pytest backend/tests scripts -q --tb=line` 종료 0 및 105개 통과. `npm.cmd --prefix frontend test`에서 17개 통과, strict 타입 검사와 생산 빌드도 통과. 정본·전송 메타스키마 및 합성 예시 왕복 검사 통과. |

생성을 동반하지 않는 공식 `GET /models/?type=llm`와 `GET /credits/` 실조회는 각각 401이었다. 계정의 모델 접근과 잔액, 실제 생성은 미검증이다. [Phase 1.5-C 보고](PHASE_1_5_REPORT.md)

### 로컬 생성 핫픽스

| 사례 | 관찰한 RED와 GREEN |
|---|---|
| Vite 프록시 | `frontend`에서 `npm test -- src/devProxy.test.ts` · RED 종료 1, 3개 실패. 두 로컬 호스트의 `Host`가 업스트림 포트로 바뀌었고 비루프백 소켓을 전달했다. 같은 명령 GREEN 종료 0, 3개 통과. Vite와 가짜 HTTP 업스트림을 루프백 임시 포트에서 사용했다. |
| 루트 dotenv와 우선순위 | `python -m pytest backend/tests/test_environment.py -q --tb=line` · RED 종료 1, 3개 실패. 파일의 제공자, CLI 키, 검증 도구 예산을 읽지 못했다. 같은 명령 GREEN 종료 0, 3개 통과. BOM이 있는 합성 파일을 사용해 작업 디렉터리와 무관한 조회, 명시적 변수와 빈 키의 우선순위, 프로세스 환경 미변경을 확인했다. |
| 최종 회귀 | `python -m pytest backend/tests scripts -q --tb=line` 113개, `npm test` 20개 통과. 타입 검사와 Vite 빌드가 통과했다. 백엔드 테스트에서 두 로컬 호스트는 가짜 제공자로 성공하고 외부 주소, 다른 Origin, 위조 전달 헤더는 거부됐다. |

실행 중인 서버에는 생성 확인 헤더가 없는 빈 요청만 보냈다. 수정 전 Vite를 거친 로컬 요청이 `403 live_local_only`였고 수정 후 두 호스트가 `409 generation_configuration_changed`로 다음 검사까지 도달했다. 외부 `Origin`과 위조 `X-Forwarded-For`는 계속 403이다. ChatKHU 호출은 0건이다.

## Phase 1.5 · OpenAI 제공자

기준선은 `522d067`, Windows 및 Python 3.13.1이다. 서버 테스트는 공식 SDK를 `httpx.MockTransport`에 연결한다.

- 서버 RED · `python -m pytest backend/tests/test_live_provider.py -q --tb=line`에서 종료 1 및 17개 실패. 정상 제안과 오류별 코드 대신 미구현 제공자 오류가 반환됐다. OpenAI 구성은 거부됐고 모드 조회 엔드포인트가 없었다.
- 화면 RED · `frontend`에서 `npm.cmd test -- src/App.test.tsx -t 'unavailable live configuration|confirm the configured provider|saved live batch|historical mock provenance|saved batch with no generation run'` 종료 1, 실패 5개, 제외 6개. 실연동 상태와 이전 생성 출처를 표시할 수 없었다.
- 서버 GREEN · 위 서버 명령에서 종료 0 및 17개 통과. Responses 요청, 공급자 전송·정본·도메인 검증, 오류별 거부 및 원본 보존을 확인했다.
- 화면 GREEN · 같은 화면 명령에서 종료 0, 5개 통과, 6개 제외. 모드·구성 상태와 저장된 후보 출처를 표시했다.
- 서버 검토 회귀 RED/GREEN · `python -m pytest backend/tests/test_live_provider.py -k 'invalid_configuration or invalid_live_only or expected_generation or blocks_concurrent or environment_proxies or invalid_provider_usage' -q --tb=line`에서 RED 종료 1 및 8개 실패, GREEN 종료 0 및 8개 통과. 잘못된 구성에서 헬스 유지, 오래된 모드/모델 요청의 공급자 호출 차단, 완료 직후 중복 거부, SDK의 리디렉션·환경 프록시 차단, 잘못된 토큰 수와 가짜 모델 메타데이터 필터를 확인했다.
- 화면 검토 회귀 RED/GREEN · `frontend`에서 `npm.cmd test -- src/App.test.tsx -t 'changed generation configuration|different generation mode'` 명령은 종료 1 및 실패 2개에서 종료 0 및 통과 2개로 바뀌었다. 구성이 달라진 응답에서 자동 재요청하지 않으며 현재 모드와 다른 결과를 저장하지 않는다.
- 검증 도구 RED/GREEN · `python -m pytest scripts/test_verify_live.py::test_candidate_post_carries_explicit_live_generation_opt_in -q --tb=line -p no:cacheprovider`에서 모드와 모델 확인 헤더가 없어 종료 1을 관찰했다. 수정 후 같은 사례는 전체 검증 도구 테스트 8개에 포함되어 통과했다. 건수 및 비용 추정 한도는 모의 응답으로 테스트했다.
- 최종 회귀 · `python -m pytest backend/tests scripts/test_verify_live.py -q --tb=line` 종료 0 및 70개 통과. 고정 의존성을 `.scratch/phase15-python`에 설치하고 pytest 캐시는 비활성화했다. `npm.cmd --prefix frontend test` 종료 0 및 15개 통과. 정본·전송 메타스키마 검사, 타입 검사, 빌드, 로컬 FastAPI 연결도 통과했다. 실제 공급자 응답과 브라우저는 별도 상태다. [Phase 1.5 검증](PHASE_1_5_REPORT.md)

## Phase 1 · Narrative Engine

기준 커밋 `42ed0cd`, Windows, Python 3.13.1. 테스트는 서비스 경계의 합성 Project와 테스트용 mock 제공자를 사용한다.

| 사례 | 단계 | 명령과 실제 결과 |
|---|---|---|
| N1 · 후보 2·3·4개와 원본 보존 | RED | `python -m pytest backend/tests/test_narrative.py -k 'n1 or n2 or n3' -q --tb=line` · 종료 1, 13개 실패 중 N1 3개. 잘못된 후보 수에서 `candidate_count` 대신 `unimplemented`, 유효한 3개 응답에서도 제안을 반환하지 않았다. |
| N2 · 고정 사실·소재 처리 | RED | 같은 실행에서 N2 4개 실패. 고정 사실 조회가 실행되지 않았고, 소재 누락·제외 위반 및 고정 사실 충돌에서 해당 오류 코드를 반환하지 않았다. |
| N3 · 형식·참조·제공자 오류와 보존 | RED | 같은 실행에서 N3 6개 실패. 손상 JSON, 필드 오류, 잘못된 소재 ID, 고정 사실 변경 시도 및 할당량 오류가 각각 예상 오류 코드 대신 `unimplemented`로 끝났다. |
| N4 · 타임아웃 및 제한된 재시도 | RED | `python -m pytest backend/tests/test_narrative.py -k n4 -q --tb=line` · 종료 1, 2개 실패. `provider_unavailable`과 `provider_timeout` 대신 미구현 오류를 반환했다. |

두 RED 실행에서 pytest 캐시 디렉터리 권한 경고가 별도로 발생했다. 테스트는 수집 및 실행됐고 어설션 결과로 실패했다.

| 사례 | 단계 | 명령과 실제 결과 |
|---|---|---|
| N1–N3 | GREEN | RED와 같은 명령과 어설션으로 종료 0, 13개 통과, 2개 제외. 정본 스키마로 후보를 검사하고 소재·사실 참조와 보존 조건을 적용했다. |
| N4 | GREEN | RED와 같은 명령으로 종료 0, 2개 통과, 13개 제외. 시간 초과와 일시적 서비스 실패에 한 번만 재시도했다. |
| 백엔드 회귀 | GREEN | `python -m pytest backend/tests -q --tb=line` · 종료 0, 25개 통과. Phase 0 예시 직렬화 왕복, 버전과 참조 거부, 헬스, 정상·실패 API 및 요청 크기 상한 포함. |

GREEN과 회귀에는 저장소 안에 설치한 고정 의존성을 사용했다. 이 세션에서 `PYTHONPATH`는 `.scratch/python`, `PYTEST_ADDOPTS`는 `-p no:cacheprovider`로 설정했다.

코드 검토 후 중복 후보, 같은 소재의 필수·제외 동시 지정과 끊어진 장소 경로 참조를 회귀 테스트에 추가했다. `python -m pytest backend/tests -k 'identical_stories or include_exclude_conflict or route_reference' -q --tb=line`에서 RED 종료 1 및 3개 실패를 관찰했다. 각 입력이 거부되지 않은 것이 원인이었다. 수정 후 같은 명령 종료 0 및 3개 통과, 전체 백엔드 회귀는 종료 0 및 29개 통과였다.

필드별 오류를 위한 `python -m pytest backend/tests/test_api.py -k identifies_the_field -q --tb=line`은 처음에 종료 1, API 응답에 필드 위치가 없어 2개 실패했다. 정본 스키마에서 나온 위치만 안전하게 반환한 뒤 종료 0 및 2개 통과했다. `python -m pytest backend/tests/test_narrative.py -k 'same_label or include_exclude_conflict' -q --tb=line`은 다른 범주의 동명 소재를 잘못 거부해 RED에서 종료 1 및 1개 실패, 범주를 함께 비교한 뒤 종료 0 및 2개 통과였다. 최종 백엔드 회귀는 종료 0 및 32개 통과였다.

프런트엔드 선택·편집 테스트는 `frontend`에서 먼저 실행했다. 제공자 응답은 테스트에서 제어했다.

| 사례 | 명령과 실제 결과 |
|---|---|
| 후보 선택 RED | `node node_modules/vitest/vitest.mjs run src/App.test.tsx -t 'chooses the requested direction' --reporter=dot` · 종료 1, 실패 1개, 제외 2개. 후보 선택 뒤 이야기 제목 입력을 찾지 못했다. |
| 선택 GREEN 및 이야기 편집 RED | `node node_modules/vitest/vitest.mjs run src/App.test.tsx --reporter=dot` · 종료 1, 선택·오래된 응답 폐기 2개 통과, 편집 1개 실패. 이전 읽기 전용 상태에서 줄거리 편집이 불가능했다. |
| 이야기 편집 GREEN | 같은 명령 종료 0, 3개 통과. 출처 후보를 보존하며 한국어 편집 내용과 승인 상태를 저장하고 다시 열었다. |
| 프런트엔드 회귀 | `node node_modules/vitest/vitest.mjs run` · 종료 0, 2개 파일 8개 통과. 재생성 교체 거절, 취소 후 늦은 응답, 임시 편집 보존, 다른 탭 쓰기 충돌, Phase 0 합성 예시 왕복을 포함한다. |

각 동작을 실행한 시점에 단계, 테스트 ID, 요구사항, 환경, 제공자 모드, 테스트 이름과 기준 리비전을 기록한다. 출력은 민감한 내용을 제거한 뒤 보존한다.

| 단계 | 기록할 증거 |
|---|---|
| RED | 명령, 종료 코드, 실패 어설션과 그 실패가 미구현 동작을 입증하는 이유 |
| GREEN | 최소 구현 변경, 같은 명령, 종료 코드와 통과 수 |
| REFACTOR | 변경 사항 또는 생략 이유, 영향을 받는 테스트 명령과 실제 결과 |
| 예외 | 누락된 증거, 미검증 환경, 남은 위험과 별도 실연동 결과 |

실행 전인 사례는 계획 단계로 유지한다. [TDD 계획](TDD_PLAN.md)

## Phase 2 · Scenario service and deterministic progression

All commands below used the repository Windows virtual environment. Synthetic mock data and intercepted HTTP exercised the provider boundary. No credential access, external generation, retries or paid calls were required.

| Case | Pre-implementation observation | Subsequent verification |
|---|---|---|
| S1–S3, generation, scope, live-client guard | `.venv/Scripts/python -m pytest backend/tests/test_scenario.py -q --tb=line` exited 1. All 11 collected cases received HTTP 405 at the absent endpoints. Inputs covered a wrong endpoint type, a disconnected cycle, infeasible history, mandatory reachability, reachable endings, structured conditions, revision scope, stale approval, provider failure and the local-request guard. | After endpoint and graph implementation, the same test file passed all 20 then-collected cases, exit 0. |
| Duplicate edges, contradictory terms, stale source, quest prerequisite | `-k additional` on the same file before endpoint implementation exited 1, four HTTP 405 failures. | Included in the 20-case GREEN run. |
| Malformed response, scope injection, dangling alias and explicit fact conflict | `-k "atomic or bounded"` exited 1 with four HTTP 405 failures. The deterministic budget case already passed and is characterization. | All four adverse provider cases returned typed errors, one call and no proposal. |
| Revision conflict, unreachable secondary ending, historical revision and both gateway formats | `-k "scoped_revision or unreachable_ending_is_error or stale_source or gateway_schema"` exited 1. Reported revision conflict returned 502 instead of 422, an unreachable ending incorrectly passed, and replacing the historical source returned 422. Both fake gateway requests already passed their strict wire checks. | The scenario suite then passed 25 cases, exit 0. Both ChatKHU paths consumed a synthetic usage receipt. |
| Output bounds and minimized revision context | `-k "oversize_graph or revision_context"` exited 1. A 33-node proposal reached graph validation and the revision input lacked neighbor context. | Bounds now run at the provider-output boundary. The test observes adjacent nodes and the absence of unrelated actors and optional input. Backend and script suite passed 147 cases, exit 0. |
| Project references, geographic review boundary, incomplete quests, chapter ownership | `-k "wrong_base or pending_geography"` exited 1 (two failures), `-k "unfinished_quest or rejoining"` exited 1 (unfinished quest incorrectly unlocked its successor, feasible-state merge already passed), `-k approval_needs_chapter` exited 1 (chapterless node incorrectly passed). | `.venv/Scripts/python -m pytest backend/tests scripts -q --tb=line -p no:cacheprovider` exited 0 with 152 passed and one existing Starlette/AnyIO deprecation warning. |

The synthetic Salt Census snapshot has revision 5. With the `n-private` prerequisite on its gate transition, the checked dead-end witness is `n-start → n-gate`. The rejoining-branch example still has two reachable endings yet reports the infeasible `n-start → n-gate → n-choose` history. Quest failure conditions take precedence over completion when leaving a quest node. Empty completion succeeds, unsatisfied completion leaves the quest active, and prerequisites require a completed quest. Graph validation checks up to 2,048 feasible states. Editorial consistency and physical travel remain separate reviews.

## Phase 2 · Scenario editor

The editor tests mount the React component in jsdom with the Salt Census fixture and in-memory save callbacks. Provider calls, native browser input and actual IndexedDB persistence are outside these checks.

| Behavior | Observed RED | GREEN and regression |
|---|---|---|
| Open a quest finding, edit its objective, follow a branch to an ending, confirm dependent deletion | In `frontend`, `npm.cmd test -- ScenarioEditor.test.tsx` exited 1. Three tests were collected. The inspector link and Outline button were missing. | The same command passed all three cases, exit 0. |
| Keep an unsaved draft on storage rejection and preserve unrelated state during quest deletion | From the repository root, `npm.cmd --prefix frontend test -- ScenarioEditor.test.tsx` exited 1 with two failures and four passes. The failed save dropped the new node form. Deletion cleared a flag whose key matched a quest ID. | The same command passed six tests, exit 0. A rejected save retains the form. Quest cleanup uses both state kind and key. |
| Filter visible graph nodes and review the deletion impact | The same command exited 1 with two failures and six passes. The graph had no persistent filter rail and the deletion preview omitted the linked record IDs. | Eight tests passed, exit 0. The preview compares a copy after applying the same deletion used by the commit. |
| Choose a typed state reference | The same command exited 1 with one failure and ten passes. A quest condition offered a free-text key and had no record selector. | Eleven tests passed, exit 0. The suite also checks pointer release, keyboard movement, a chapter reorder, node creation and progression cycle rejection. |

The editor refactor and focus-restoration type fix passed the strict TypeScript check. The complete frontend suite (`npm.cmd --prefix frontend test`) passed 40 tests in 7 files, exit 0.

Three final regressions captured new REDs. `-k separating_geography` failed with a 502 on the proposed third place, `-k world_route_requires` failed because a map route accepted a scenario-only location, and `-k korean_scenario` failed because the mock omitted the supplied location name. The final `.venv/Scripts/python -m pytest backend/tests scripts -q --tb=line` exited 0 with 155 passed. The existing Starlette warning and a sandbox pytest cache-write warning remained. The Korean synthetic project preserved its supplied place name and used Korean choice labels. A successful mock HTTP test for each configured gateway path checked provider-specific strict schema, endpoint, payload and usage receipt.

## Phase 2 · Portable scenario and Studio integration

Initial branch main, HEAD 9c12143e9b8279a6429972eed81b7066e2e9dcf9, clean worktree. Full test directories initially passed 113 pytest and 22 Vitest tests. An initial root pytest discovery failed with WinError 5 on pre-existing inaccessible pytest-cache-files directories. pytest.ini now points discovery at both test directories and caches in ignored scratch.

| Case | Actual first execution | Verification |
|---|---|---|
| Draft and editor layout persistence | `npm.cmd --prefix frontend test -- scenario.test.ts` exited 1. The current Project validator rejected the new metadata, expected true and got false. | Same test exited 0 after extending Draft 4, restoring negative canvas x and positive y through simulated IndexedDB. |
| Version, edit and interchange workflow | `npm.cmd --prefix frontend test -- scenarioWorkflow.test.ts` exited 1 with three missing public operations. | Same suite passed the original cases after implementation. Historical source data and stable IDs survived a narrative change. |
| Targeted proposal receipt | Same command exited 1. Applying a proposal without a passing check_scenario receipt unexpectedly succeeded. | After enforcing the receipt the same test passed, then rejected an injected change to a second node. |
| Future geography | Same command exited 1 on import of two canonical places separated by a third proposed place. | GREEN validated the via ID, exported its name in Markdown and rejected a missing via target. |
| Manual source reconciliation | Same command exited 1, missing reconcileSource. | The same six-test suite passed after implementing explicit review and draft rebasing without graph replacement. |
| Requested ending and side quest scope | `.venv/Scripts/python -m pytest -q backend/tests/test_scenario.py -k explicit_scope --tb=line` exited 1. Both providers ignoring a discrete control returned 200. | Same command passed both tests after enforcing the chosen ending count category and presence/absence of side quests. |
| Integration characterization | Additional cases after implementation exercised missing start, duplicate ID, self-loop, non-playable back-reference, regeneration with historical findings and App-level reject/accept, undo/redo, approval and reopen. | These cases passed initially. The App test used jsdom, stubbed HTTP and fake IndexedDB. The separate compiled-bundle check below used actual loopback HTTP. |

Final integrated run: `.venv/Scripts/python -m pytest -q --tb=line` passed **163**, one existing Starlette deprecation warning. `npm.cmd --prefix frontend test` passed **41** in seven files. `npm.cmd --prefix frontend run typecheck`, `npm.cmd --prefix frontend run build`, Draft4Validator.check_schema plus the canonical example round trip all exited 0. The rebuilt app completed the compiled jsdom smoke with mock FastAPI at 18182 (9 nodes, generation/revision/validation HTTP 200, approval restored). The owning process stopped its server. Live Scenario Studio verification is PENDING.

## Phase 2.3 progression reliability

Starting worktree: main at 9c12143e9b8279a6429972eed81b7066e2e9dcf9 with the earlier phases uncommitted. Baseline: 243 pytest, 57 Vitest passed. All provider boundaries below used deterministic local substitutes.

| Behavior and command | Observed RED | Observed GREEN |
|---|---|---|
| `python -m pytest -q backend/tests/test_scenario_progression.py` | Initial lifecycle run: 10 failed, 1 passed. An objective earned on a later step did not settle its active quest. Blocked alternatives lacked guard and witness evidence. | Later-node and edge effects, terminal/failure order, optional paths, circular prerequisites and exclusive routes passed. |
| `python -m pytest -q backend/tests/test_scenario_progression.py -k "distinct_problems or invalid_explicit_write"` | Two failures: same-node independent blockers acquired a shared cause, and one invalid write appeared twice. | Both passed. Attribution needs a unique cause; one invalid write produces one root. |
| `python -m pytest -q backend/tests/test_progression_campaign.py` | Provider instructions lacked the executable wire example; valid late acquisition returned HTTP 502. | 10 tests passed, exercising 5 expected-valid and 6 intentionally invalid designs. Count includes both sides of paired fixture tests. |
| `python -m pytest -q backend/tests/test_progression_recovery.py backend/tests/test_progression_finding_schema.py` | Rejected graph missing from recovery; canonical finding rejected the new guard evidence. | Detached repair yielded two ending witnesses; canonical schema accepted structured evidence and rejected a malformed producer list. |
| `npm.cmd --prefix frontend test -- progressionFindings.test.tsx rejectedStorage.test.ts` | No root-cause heading; storage overwrote or failed to round-trip the original. Additional RED: Inspect button missing for the blocked edge. | Independent errors and severities survive grouping; links select the blocked edge. Restore, competing writes, stale/cross-project files and separate project export passed with fake IndexedDB. |
| `npm.cmd --prefix frontend test -- ScenarioStudio.test.tsx` | Detached graph editor and field-level review absent. A reference correction exposing a progression failure could not continue in the editor. | Owner edits, local validation, before/after review, reject, accept and original retention passed. App test observed one mock generation and three deterministic checks. |

Full regression: `.\.venv\Scripts\python.exe -m pytest -q` passed 273, one existing Starlette/AnyIO deprecation warning. `npm.cmd --prefix frontend test -- --reporter=dot` passed 62 in 12 files. Strict TypeScript, generated type consistency, Vite production build, Draft 4 canonical schema, both scenario transport schemas, and sample JSON round trip passed. Integration over an actual loopback listener reproduced the 502, checked the unedited graph (2 states), then rechecked a detached edit (18 states, 3 endings, one fixture-provider invocation in total). The compiled application in jsdom generated, revised, approved and reopened a nine-node project via mock FastAPI and fake IndexedDB. The separate Narrative Studio loopback integration passed. Browser access host unavailable. Live model calls and credit use: zero. [Campaign and owner verification](PHASE_2_3_REPORT.md)

Two focused follow-ups used the same fixtures. `python -m pytest -q backend/tests/test_progression_campaign.py -k korean_gate` failed because the suggested edit omitted the missing state and value. It passed after the suggestion named the required flag and its exact value when no source exists. `npm.cmd --prefix frontend test -- progressionFindings.test.tsx` failed when verbose guard details were shown before expansion, then passed with the human-readable current and required values visible and the full diagnostic under Technical details. `git diff --check` exited 0, and the untracked files passed a separate trailing-whitespace scan.

## Phase 3 · procedural atlas

The initial clean main tree at 116b8ce passed 273 pytest and 62 Vitest tests. These checks used deterministic data and mocked provider boundaries. No owner browser profile or data export was supplied.

| Check / focused command | Observed RED | Observed GREEN |
|---|---|---|
| `python -m pytest -q backend/tests/test_world_contract.py` | Draft 4 rejected the versioned World with physical settings. | New atlas structure accepted; invalid scale remains invalid. Existing v1 sample loads. |
| `npm.cmd --prefix frontend test -- atlasTerrain.test.ts` | Seed 37 placed major river outlets just 3 grid steps apart in the standard map. | Spaced catchments pass the minimum-separation regression alongside downhill, drainage, coverage, replay and corrupt-grid checks. |
| `npm.cmd --prefix frontend test -- atlasCampaign.test.ts atlasIslandPorts.test.ts` | Six compound placement inputs each missed a hard condition; island crossing had zero transfer ports. | Constructive candidate selection and coastal transfer sites satisfy the same fixtures. The original compound seed 74874 is retained. |
| `npm.cmd --prefix frontend test -- atlasBoundary.test.ts atlasWorkflow.test.ts` | Generated terrain ID collided with the story, oversized input was accepted, vertical descent used the horizontal 50 km scale, readable export omitted drainage, and accepted advisories had no open record. | Bounds and ID allocation, 0.05 km descent, exported drainage and canonical findings are covered. Approval of unchanged draft preserves its world stage version. |
| `npm.cmd --prefix frontend test -- AtlasStudio.test.tsx atlasPlan.test.tsx` | Application had no Atlas navigation. Requirement editing lacked a control. Reopening a damaged river still showed an approval label. | Zero-live generation and cross-view navigation work. Owner requirements can be edited, and damaged physical data reopens for review with approval disabled. |
| `npm.cmd --prefix frontend test -- atlasRecovery.test.tsx -t "cartographic rename"` | Editing a scenario-owned underground site left a world-only key in the placement. Accepting displayed “Atlas references conflict with this project” and the commit callback was never called. | The placement serializer keeps only applicable fields. The edit is accepted with the original scenario unchanged and the new map label on its original ID. |
| `npm.cmd --prefix frontend test -- AtlasMap.test.tsx` | An oversized 129-cell row still rendered a chart. | Oversized and ragged data fail the renderer guard. Zoom, pan, layers, selection and self-contained SVG are exercised separately. |
| `python -m pytest -q backend/tests/test_atlas_integration.py` | An approved routed scenario location with its physical endpoint removed passed the backend project boundary. | The valid project passes and both client and server reject foreign or unplaced endpoints. Mock loopback also validates three endings on the intact project. |

Recovery tests cover same-project competing tabs, conflict while adopting, storage failure, undo/redo across reconciliation, invalid placement, failed/cancelled generation and locked locations. Simulated IndexedDB and jsdom cover restoration, editing and selection. The compiled Vite app ran against loopback mock FastAPI, generated/revised a nine-node scenario, approved it, generated and approved the atlas, then reopened the stored world. The atlas added zero HTTP POSTs. The independent Narrative Studio loopback integration passed. QtSVG rendered the standalone SVG export. Chromium launch was denied; real browser performance and owner data remain separate gates. [Campaign inputs and metrics](ATLAS_CAMPAIGN.md) · [Final regression counts and commands](PHASE_3_REPORT.md)

## Phase 3 approval hotfix · local validation and semantic changes

The starting HEAD was main at 116b8ce with the Phase 3 work still in the working tree. Reproduction used a stored synthetic Phase 2 graph and fake IndexedDB. The owner's database and network trace were unavailable. The validate endpoint checks the submitted project and returns valid, complete, findings and ending paths. Saving the receipt rotates the IndexedDB token. Neither that save nor the approval flag increments the scenario or project revision.

| Acceptance case | RED before the fix | GREEN |
|---|---|---|
| Validate while detached recovery is loading | Enabled Validate button dispatched zero requests when the diagnostic read remained pending. | The click sends exactly one validation request independently of that read. |
| Validate → save layout or reload → approve | After a confirmed pass, Auto-layout disabled approval with unchanged scenario version. Saving and reopening also lost the pass. | The run ID is tied atomically to the local project record. The checkbox survives a layout save; after reopening, the owner can review and approve without revalidation. A portable copy starts without local trust. |
| Invalid or incomplete check | A failed check of an already-approved graph left approved=true. A generic missing-check hint did not explain stale state. | A failed/incomplete result withdraws approval. The author sees the rule/count or incomplete exploration. Atlas reports the missing scenario approval. Saving a failed receipt can be retried without another POST. |
| No-op edits and layout history | Saving identical design fields advanced scenario version 1 to 2. Undoing a layout after a failed check restored approved=true. A semantic mutation flagged layout-only was accepted. | Identical edits preserve the design. Layout operations accept positions only, and layout history never restores old approval. |
| Actual source inputs | Changing a locked fact under unchanged version counters retained local validation trust. | The same save clears the marker. Genuine semantic edits require a new check; local approval still requires current source and editorial review. |

The initial five purpose-specific cases in `npm.cmd --prefix frontend test -- scenarioApproval.test.tsx --reporter=verbose` failed (exit 1). Further focused REDs included `-t "unchanged design fields|undoing a layout"` (2), `-t "incorrectly marked"` (1), and `-t "source fact changes"` (1). The final suite passed all 11 hotfix cases and 125 Vitest tests in 25 files (exit 0). The existing accepted-proposal integration also passed.

Full pytest passed 275 with the existing Starlette/AnyIO deprecation warning. Strict TypeScript and the Vite production build passed, with the existing chunk size warning. Draft 4 canonical schema, legacy sample and Python snapshot, both scenario transport schemas, and Git whitespace checks passed. The Korean 3-chapter atlas HTTP fixture preserved 3 reachable endings in 18 states and rejected both damaged placements.

A compiled Vite app running in jsdom against loopback mock FastAPI accepted a nine-node proposal, validated it, saved layout (project 7 → 8, scenario version 3), reopened, explicitly approved, and generated a continent. The HTTP trace contained one mock scenario generation, one mock revision and one deterministic validation. Atlas added no POSTs. The independent Narrative Studio loopback integration passed. Verification servers were stopped. Paid calls and credits consumed were zero. Native browser UI and the owner's specific failed click remain unverified.

### Owner export investigation · prologue visit prerequisites

Reproduced with the supplied 299,764-byte export on a byte-identical, ignored working copy. The owner export, creative prose and canonical IDs were excluded from regression fixtures. Draft 4 and the Python ProjectSnapshot accepted it. The current Vite server on 5173 served five source maps matching the local hotfix. The owner observed a validation POST returning 200. Submitting the working copy to that same endpoint returned valid=false, complete=true, zero explored states and zero ending paths. The source narrative was approved and current (narrative 2, content 2). Project revision 9 / scenario version 4 had 16 unresolved deterministic checks, including the latest at base 9. There were 12 blocking findings, three warnings and two informational findings in the last check. Two prior-visit guards on the prologue required a later quest scene and an ending before the first scene could be entered.

Replayed import, validation and editorial acknowledgement with the compiled app, jsdom, a separate fake IndexedDB and actual loopback HTTP. The saved local check pointed to the unresolved run. Ticking review left approval disabled. In the working copy, using the ordinary node inspector to uncheck the two prior visits and save advanced the project to 10 and scenario to 5. The same validator returned valid=true, complete=true, 31 states and all three endings. Explicit review and approval enabled local generation; the resulting continent had zero blocking geographical findings. Compared the source facts, narrative, graph, quests, layout and entity data across the edit. The original file hash matched after the run. The file does not establish when or how the two guards were authored.

The approval summary previously returned its first matching condition. The focused Vitest case `scenarioApproval.test.tsx -t "both missing starting"` failed before implementation because checking was blocked and the outstanding editorial requirement was hidden. It passed after listing simultaneous reasons and naming the prologue and both required scenes. A separate backend test `test_prologue_requiring_later_quest_and_ending_blocks_every_route` uses public synthetic identities and exercises both the failure and the repaired traversal. It passed against the existing validator. The validation rules are unchanged. Native Chromium launch returned spawn EPERM. The sandbox run provides DOM, simulated-storage and real HTTP evidence; it did not access the owner's browser profile.

Full regression for the owner-export investigation passed 276 pytest cases and 126 Vitest cases in 25 files. Strict TypeScript, the Vite production build, canonical and transport schema checks, and git diff --check passed. No paid requests were made.

## Phase 4 · cross-domain verification

Start was clean on `main` at `e3605f38a49f7e8824b3d92a4e953df58afd8b1a`. The baseline commands were `.venv/Scripts/python -m pytest -q` (276 passed, one Starlette warning), `npm.cmd --prefix frontend test` (126 passed, 25 files) and `npm.cmd --prefix frontend run build` (generated type check, strict tsc and Vite passed). The three repository development skills supplied the TDD, narrative and geography procedures. All automated provider transport was mock or intercepted locally.

Commands below use the repository root for Python and `frontend` for npm. RED means the named behavior failed with exit 1 before its implementation. GREEN means the same behavior passed with exit 0. Follow-up integration tests are identified separately.

| Behavior | Command | Observed RED → GREEN |
|---|---|---|
| A1/A4 actual plan, receipts, interruption, unavailable progression | `npm.cmd test -- src/verificationEngine.test.ts` | Four collected tests initially found no registered engine function. The first four passed after implementation. Additional failures caught incorrect approval on drafts, claiming a scoped pass after global traversal failed, accepting malformed transition evidence and missing the dispatch-start event. |
| A4 feasible transitions with stale upstream data | `.venv/Scripts/python -m pytest -q backend/tests/test_verification_progression.py` | Exploration yielded zero states despite a playable graph. The verification-specific invocation of the same explorer returned actual feasible transitions. The existing approval endpoint retained its gate. |
| A2/A3/A8 shared IDs and impact | `npm.cmd test -- --run src/WorldBible.test.tsx --reporter=dot` | Four missing behaviors included resolved location lookup, keyboard relationship list, deletion protection and explicit fact editing. All four passed. Further REDs caught a missing quest/parent chapter link, colliding legacy item IDs and direct source-editor deletion. |
| A2/A5 scoped history and suggested relationship | `npm.cmd test -- --run src/worldBibleHistory.test.tsx --reporter=dot` | Missing current evidence, then missing suggested edge. Two passed using current and historical inputs and distinct targeted receipt scopes. |
| A5 semantic contract and bounded SDK path | `.venv/Scripts/python -m pytest -q backend/tests/test_semantic_review.py -x` | New route returned 405 instead of 200. Initial nine contract cases passed after implementation. Later RED for an explicitly co-cited relationship returned 502 instead of 200. |
| A5 budget, cancellation and wrong-type/unknown citations | `npm.cmd test -- semanticReview.test.ts SemanticReview.test.tsx` | A malformed cap of 1601 was accepted, cancellation saved no receipt, and an unsupported relationship endpoint was accepted. The focused tests passed with the existing provider mock boundary. A subsequent lost-response case saved zero audits before the fix. It now records failed, with dispatch and token usage unknown. |
| A6 route correction and safe atomic scalar edits | `npm.cmd test -- --reporter=dot src/verificationRepair.test.ts` | Collected route test failed with “Repair simulation unavailable”. GREEN corrected detached distance, retained the approved scenario, rejected stale/original-value mismatch, missing companion edits and a forbidden fact write. |
| A6 physical route reconstruction | `npm.cmd test -- verificationRoute.test.ts` | Damaged road expected a detour but received undefined. The same tests passed with corridor reconstruction against the original geography, including preserved identity and explicit travel mode. |
| A6/A7 history and reservation | `npm.cmd test -- --reporter=dot src/verificationHistory.test.ts` | The canonical validator initially rejected a valid report. Reserving a repair initially had no implementation. Two requests are now retained across reopen and the third is refused. Subsequent REDs found an accepted dangling proposal source and an accepted receipt-free “verified” report. Both are rejected. |
| A8 normal UI | `npm.cmd test -- --reporter=dot src/verificationWorkspace.test.tsx` | Workspace had no Verification Agent navigation. GREEN opened a project with unavailable provider, ran Quick Check and reopened its report. Follow-up UI regression exercised rejection, simulation, explicit acceptance, backup and saved-design revalidation. |
| Final approval and fingerprint | `npm.cmd test -- --reporter=dot src/verificationApproval.test.ts` | Missing confirmation operation. GREEN requires a fresh full invocation, preserves approval across a canvas move and detects same-revision altered creative content. |
| A4 incompatible structured rules | `npm.cmd test -- --reporter=dot src/verificationEngine.test.ts -t "mutually exclusive"` | After correcting an obsolete test helper, the intended assertion found no source conflict for simultaneous inside/outside rules. GREEN identified the shared site and region. |
| Editing across studios | `npm.cmd test -- --reporter=dot src/verifiedNarrative.test.tsx` | The open Narrative Studio retained “Original” after an accepted external correction. GREEN renders the canonical correction and preserves an unsaved local draft with saving blocked if its source changed. The selector uses the existing “Save narrative edits” label. |

The first full parallel frontend run had 156 passing and eight failing tests, including five-second timeouts and UI checks before controls were ready. The larger jsdom suite was contending with other regression processes. The repository now caps DOM workers at four. No timeouts were extended and no product assertions were removed. Final `npm.cmd --prefix frontend test -- --reporter=dot` passed **167 tests in 36 files**. Final pytest passed **296 tests** with one existing Starlette deprecation warning. Strict TypeScript, generated type synchronization, production build, canonical Draft 4, narrative/scenario/revision/semantic transport schema checks and `git diff --check` passed.

The 44-case deterministic campaign and its replay used real loopback HTTP with zero model requests. A separate compiled Vite + jsdom + simulated IndexedDB run imported a disposable synthetic design, displayed the graph, found an invalid route distance, simulated and reopened the pending comparison, accepted once, issued a post-write full check and generated three download actions. Six real validation POSTs returned 200, with no generation POST. Python ProjectSnapshot accepted the resulting full JSON with two reports and the recorded decision. The independent atlas loopback exercise passed with 18 states, three ending witnesses and one development-mock scenario generation. No individual RED is claimed for the campaign driver, every fixture row, documentation or the compiled smoke. Native Edge launch returned spawn EPERM and the in-app browser host was unavailable. [Case observations](VERIFICATION_CAMPAIGN.md) · [Review gate](PHASE_4_REPORT.md)
