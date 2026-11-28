# Agent A · 제품 정확성 및 신뢰성 독립 감사

네이티브 실행 식별자는 `/root/correctness`다. 검토 기준은 `feature/final-agent-review`의 `50e2a7c02b9c6b7472440850af2617afffcbbf53`이다. 에이전트는 추적 파일을 수정하지 않았다. 합성 프로젝트와 무시된 경로의 테스트만 사용했다.

## A-01 · High · 확인된 저장 경합

- **위치** — `ScenarioStudio.tsx:289,336–391`에서 응답을 프로젝트 ID와 설계 리비전만으로 검사하고 요청 시작 당시 프로젝트를 바탕으로 저장본을 만든다. `useProjects.ts:45–52`는 그 저장본에 현재 저장 토큰을 사용한다. `App.tsx:23–26`은 화면을 떠나도 열었던 스튜디오를 숨긴 채 유지한다. `VerificationAgent.tsx:134–148`과 `verificationHistory.ts:51–55`에서 Quick Check는 설계 리비전을 유지하며 기록을 저장한다. [Scenario Studio](../frontend/src/ScenarioStudio.tsx#L289) · [저장](../frontend/src/useProjects.ts#L45) · [화면](../frontend/src/App.tsx#L23) · [검증 기록](../frontend/src/verificationHistory.ts#L51)
- **실패 시나리오** — 시나리오 검증 요청을 시작한 뒤 Verification Agent에서 Quick Check를 실행한다. Quick Check가 IndexedDB에 저장된 다음 앞선 시나리오 응답이 오면 두 저장이 같은 설계 리비전을 사용한다. 늦은 응답은 이미 저장된 검증 이력이 없는 과거 스냅샷을 최신 토큰으로 덮어쓴다.
- **재현 증거** — `npm.cmd --prefix frontend test -- --config .scratch/phase-7a-correctness.config.ts --reporter=dot`는 종료 코드 1이었다. 직접 제어한 두 응답으로 재현했고 임시 테스트 2건 중 이 사례만 실패했다. 먼저 Quick Check 이력 1건이 IndexedDB에 저장되고 리비전이 5인 것을 확인했다. 시나리오 응답을 풀자 `scenarioCheckRunId`가 저장됐고 리비전은 여전히 5였지만 `verificationHistory`가 `undefined`로 바뀌었다. 임시 테스트 `frontend/.scratch/phase-7a-correctness.probe.tsx:53`에서 `expected undefined to deeply equal [ { …(9) } ]`를 확인했다.
- **영향** — 같은 탭의 화면 전환 중 이미 저장됐다고 표시된 검증 이력과 증거가 유실될 수 있다. 이번 실험에서 확인한 유실은 새 Quick Check 기록이다.
- **수정 및 회귀 제안** — 시나리오 응답을 저장하기 직전에 최신 스냅샷을 읽고 검사 대상 설계가 여전히 일치하는지 확인한다. 일치하면 시나리오 검사에 속한 변경만 최신 스냅샷에 반영하고 검증 이력과 실행 기록을 보존한다. 설계가 바뀌었으면 오래된 응답으로 저장하지 않는다. 회귀에서는 시나리오 응답을 보류하고 Quick Check 저장을 확인한 뒤 응답을 완료한다. 후속 읽기에서 시나리오 검사 ID와 이전 Quick Check의 이력 및 양쪽 실행 기록이 남아 있어야 한다.
- **신뢰도** — 높음. 합성 API 응답으로 실제 앱과 테스트용 IndexedDB 경로에서 재현했다. 운영 데이터, 다른 탭, Atlas의 유사한 저장 경로는 별개다.

## A-02 · Medium · 테스트 준비 상태 확인 누락

- **위치** — `ScenarioStudio.test.tsx:109–112`의 통합 사례는 검증 버튼 클릭 뒤 곧바로 검토 체크박스와 승인 버튼을 누른다. `ScenarioStudio.tsx:771–779`에서 승인 버튼은 DOM에 남아 있지만 검증 저장과 검토 동의 전까지 비활성 상태다. [통합 테스트](../frontend/src/ScenarioStudio.test.tsx#L109) · [승인 버튼](../frontend/src/ScenarioStudio.tsx#L771)
- **재현과 영향** — A-01과 같은 명령의 대조 테스트는 통과했다. 응답을 보류한 동안 승인 버튼을 쿼리할 수 있었지만 비활성이었고 저장된 시나리오 검사 ID도 없었다. 응답 완료와 검사 ID 저장, 검토 동의가 끝난 뒤에는 버튼이 활성화됐고 승인도 저장됐다. 통합 테스트가 `findByRole`의 성공을 준비 완료로 해석하면 정상적으로 차단된 동작을 먼저 누를 수 있다.
- **수정 및 회귀 제안** — 기존 승인 및 영속화 단언을 유지하고 검증 저장 확인이나 버튼 활성화를 기다린 뒤 클릭한다. 지연 응답에서 버튼이 비활성이고 저장 뒤 활성인 대조를 유지한다.
- **신뢰도** — 준비 상태 차이는 높음. 과거 다른 위치에서 발생한 `ScenarioStudio` 실패의 원인까지 일치하는지는 확인하지 못했다. Phase 6A의 `Generation settings` 탐색 실패는 프로젝트 열기 이후 비동기 탐색을 기다리도록 이미 수정됐다. [TDD 원장](TDD_EVIDENCE.md)

## A-03 · Medium · 기존 UI 테스트의 간헐 실패

- **위치와 증거** — 기준 C의 `verificationWorkspace.test.tsx:32`는 Quick Check, 거절 저장, 시뮬레이션, 채택 후 재검증을 한 5초 테스트에서 수행한다. Phase 6C-R1 계측에서 최종 재검증 전에 4.252–4.805초가 걸렸고 단독 계측에서도 제한을 넘겼다. `publicExample.test.tsx:25`는 두 사본 생성, 저장, 편집, Blob 내보내기를 한 테스트에서 실행한다. Phase 6C-R1의 기본 병렬 실행에서 제한을 넘겼다. 기준 A의 호스팅 로그에서는 두 사례가 각각 2.318초와 2.053초에 통과했다. [기준 C의 검증 테스트](https://github.com/jllgame00/worldweaver/blob/50e2a7c02b9c6b7472440850af2617afffcbbf53/frontend/src/verificationWorkspace.test.tsx#L32) · [예제 테스트](../frontend/src/publicExample.test.tsx#L25) · [TDD 원장](TDD_EVIDENCE.md)
- **영향과 제안** — 간헐적으로 로컬 회귀나 CI가 중단될 수 있다. 준비 시점을 측정하고 IndexedDB 완료나 UI 활성화가 필요할 때 명시적으로 기다린다. 독립적으로 확인 가능한 계약을 분리하더라도 기존 통합 동작과 단언을 유지한다.
- **신뢰도와 회귀** — 기존 시간 초과 관측은 높음. `publicExample`의 병목 위치, 실제 브라우저 데이터 경합 또는 단일 근본 원인은 미확인이다. 이 관측만으로 결정론적 제품 RED를 제안하지 않는다.

## 나머지 검토 범위

- `ProjectSnapshot.model_validate` 및 `validate_graph(..., verification=True)`로 저장소 두 합성 예제를 확인했다. 문서 예제는 6상태·결말 증인 경로 2개, 공개 예제는 10상태·경로 2개였다. 각 프롤로그에 결말 선행 조건을 추가한 제어 입력은 `blocked_start`와 경로 0개를 반환했다. [그래프 검증](../backend/app/scenario_validation.py#L39)
- 후보 파싱과 채택의 스키마·커버리지 검사, 별도 승인 절차, 시나리오 제안의 버전과 허용 필드 검사를 추적했다. Atlas는 제약과 통행 표면을 검사하며 World Bible 편집은 저장 전 참조를 다시 확인한다. 검증 수리는 원래 값, 동반 수정, 허용 필드를 검사하고 재검증한다. 전체 조합은 미검증이다. [후보](../backend/app/narrative.py#L35) · [시나리오](../frontend/src/scenarioWorkflow.ts#L123) · [Atlas](../frontend/src/atlasWorkflow.ts#L105) · [세계관](../frontend/src/worldBibleEdits.ts#L68) · [수리](../frontend/src/verificationRepair.ts#L120)
- 가져오기와 복원은 초기 검증, 트랜잭션 안의 토큰 비교, 이전 저장본 보관, 복원 뒤 로컬 승인 제거를 사용한다. 언어 전환은 UI 환경설정을 갱신한다. A-01의 원인은 같은 탭의 비동기 저장본 선택이다. [가져오기](../frontend/src/ProjectImport.tsx#L46) · [저장소](../frontend/src/storage.ts#L95) · [백업](../frontend/src/backupProject.ts#L17) · [언어 설정](../frontend/src/locale.tsx#L29)

운영 브라우저의 실제 IndexedDB, 전체 지리 조합, 유료 생성 품질은 확인하지 않았다. 에이전트의 우선순위 제안은 A-01이다.
