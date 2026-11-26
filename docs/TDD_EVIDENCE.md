# Implementation TDD evidence

Phase 0의 설계 검증은 [Phase 0 보고서](PHASE_0_REPORT.md)에 기록했다. 아래는 Phase 1 구현 증거다.

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
