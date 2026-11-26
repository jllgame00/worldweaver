# Implementation TDD evidence

Phase 0의 설계 검증은 [Phase 0 보고서](PHASE_0_REPORT.md)에 기록했다. 아래는 Phase 1, Phase 1.5, Phase 1.5-C의 구현 증거다.

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
