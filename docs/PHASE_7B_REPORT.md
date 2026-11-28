# Phase 7B · 시나리오 검사 기록 저장

**PHASE_7B_READY_FOR_OWNER_REVIEW** — A-01 로컬 GREEN. 최종 기본 Vitest 전체 실행은 48파일 242건으로 두 번 연속 통과했다. 오너 GREEN 커밋과 배포 전 단계다.

## 재현과 수정

`feature/final-agent-review`의 HEAD와 원격 추적 브랜치는 오너 RED `2c12785ffe18794cfe23ef1b66ffc83724c67218`이었다. 부모는 복구 C `50e2a7c02b9c6b7472440850af2617afffcbbf53`다. RED의 유일한 파일은 `frontend/src/verificationWorkspace.test.tsx`였다. 시작 시 미커밋 상태였던 7A 문서 여섯 개와 증거 원장을 보존했다.

수정 전 `npm.cmd --prefix frontend test -- src/verificationWorkspace.test.tsx -t 'preserves both saved checks'`가 1건 실패했다(종료 1, 필터 제외 2건). 87행의 `toContain(report.runId)`에서 저장 목록에 실행이 한 건만 남아 있었다. 시나리오 요청 중 Quick Check 저장이 먼저 완료돼도 설계 리비전은 유지된다. 늦은 응답은 요청 당시 프로젝트에 결과를 붙인 뒤 현재 저장 토큰으로 IndexedDB에 썼다. 토큰 검사는 성공했고 이미 저장된 Quick Check 실행과 보고서는 사라졌다.

- `ScenarioStudio.tsx`는 응답 본문을 읽은 후 현재 프로젝트를 한 번 가져온다. ID·리비전을 대조하고, 검증 중 객체가 교체됐다면 기존 `sameScenarioInputs`로 검사 대상 설계를 대조한다. 최신 프로젝트에 검사 실행과 소속 finding을 반영하며, 무효 판정 시 시나리오 승인을 해제한다. HTTP 오류가 유효한 실패 실행을 동반한 경우에도 최신 실행 목록에 추가한다. 최신 객체를 읽은 시점부터 저장 시작까지 비동기 대기가 없다.
- `useProjects.ts`는 저장이 거절된 초안의 참조를 보관한다. 뒤늦은 요청이 초안의 재시도·다운로드 기회를 지울 수 없으며, 일시적 저장 오류에서는 같은 초안으로 재시도한다. 다른 연결의 경쟁 쓰기는 기존 IndexedDB 트랜잭션이 토큰으로 판정한다. 충돌 시 승자의 저장본을 유지하고 재열기와 초안 다운로드를 제공한다.
- 하나의 시나리오 요청에는 컨트롤러 하나와 완료 Promise 하나가 대응한다. 새 검사는 새 실행 ID를 받는다. 실패한 저장의 재시도에는 기존 초안과 같은 ID를 사용한다. 기존 프로젝트 검증이 중복 ID를 차단하고 검증 이력의 보존 한도·참조 정책은 기존 기록 함수가 적용한다. 가져오기·복원·저장 형식의 변경은 없다.

다른 쓰기가 아직 진행 중이면 현재 스냅샷을 사용할 수 없어 시나리오 화면이 재검사를 안내한다. 먼저 시작한 쓰기가 완료됐고 설계가 같으면 늦은 결과도 저장할 수 있다. 취소된 요청은 본문을 읽은 뒤에도 저장 전에 중단한다. 저장 실패 초안이나 탭 간 충돌을 해소한 뒤에는 사용자가 현재 설계에서 다시 검사할 수 있다.

## 독립 검토

7A의 정확성 검토자 `/root/correctness`에게 네이티브 후속 작업으로 실제 두 구현 파일의 diff를 다시 검토하도록 했다. 검토자는 성공·오류 응답의 저장 기준, 응답에서 commit까지의 순서, 다른 탭 토큰 충돌, 중복 ID 및 실패 초안 재시도를 추적했고 차단할 사항이 없다고 회신했다. 무효 판정 후 승인 취소와 Quick Check 보존, 저장 거절 후 늦은 응답이 초안을 밀어내는 경우를 보강하라는 의견을 반영했다. 검토자는 읽기 전용으로 작업했고 아래 테스트는 코디네이터가 실행했다.

## 로컬 회귀와 비동기 UI

원래 RED 테스트 파일은 HEAD와 Git diff가 없다. 같은 명령의 수정 후 집중 실행 3회에서 각각 1건 통과, 이름 필터 제외 2건, 종료 0을 확인했다. Vitest 실행 시간은 3.22초, 3.11초, 3.17초였다. 이 테스트는 저장 완료 후 새 IndexedDB 연결로 두 실행의 참조를 검사한다.

`scenarioApproval.test.tsx`의 보충 검사는 원래 RED 이후의 경계 증거다. Quick Check 이후의 무효 판정에서 시나리오 승인을 해제했다. 앱 재열기 뒤에도 이전 이력·실행과 새 미해결 실행·finding이 같은 리비전에 있었다. 다른 작업에서 콘텐츠 편집이 먼저 완료되면 늦은 결과를 폐기했고, 콘텐츠 저장이 거절된 경우에는 초안을 재시도해 편집을 복구했다. 독립 IndexedDB 연결이 먼저 쓴 경우에는 승자의 토큰과 프로젝트가 재열기 후에도 일치했다. 저장 재시도에서는 검사 호출과 저장 실행이 각각 한 건이었다. 무효 판정 사례를 추가하기 전의 집중 실행은 해당 파일 16건 통과였다.

기본 구성은 jsdom과 저장소에 설정된 워커 최대 2개다. A-02 통합 사례에서 이전에는 버튼이 나타나면 클릭했다. 이제 저장된 검사 결과와 실제 조작 가능 상태를 기다린다. 두 번째 전체 실행의 상세 출력에서 시나리오 승인 흐름은 2.708초, 수리·재검증은 1.998초, 공개 예제 편집·내보내기는 1.728초였다. 7A에서 수리 흐름이 4.446초였고 과거에는 5초를 넘겼다. 시간 편차는 관측됐으며 모든 과거 실패를 설명하는 단일 제품 결함은 확인되지 않았다. 예제의 저장·내보내기 동작과 수리 후 재검증의 기존 단언, 타임아웃, 워커 설정을 유지했다.

| 검증 명령 | 관측한 결과 |
|---|---|
| `./.venv/Scripts/python.exe -m pytest -q` (`WORLDWEAVER_PROVIDER=mock`) | 329건 통과, 8.08초. Starlette TestClient의 AnyIO 별칭 폐기 예정 경고 1건. |
| `npm.cmd --prefix frontend test` | 중복 응답 사례 추가 전 전체 3회 모두 48파일 241건 통과. 79.76초, 80.18초, 79.64초. 두 번째 실행만 `-- --reporter=verbose`로 사례별 시간을 출력했다. |
| `npm.cmd --prefix frontend test` 최종 구성 | 기본 설정으로 2회 연속 48파일 242건 전부 통과, 각 종료 0. 79.58초와 79.84초. 원래 RED의 의도된 실패 외에 이번 단계의 회귀 실패나 시간 초과는 없었다. |
| `npm.cmd --prefix frontend test -- src/scenarioApproval.test.tsx -t 'single persisted execution'` | 서버가 같은 ID의 실패 실행을 두 번 응답했다. 두 번째 처리 후 전체 IndexedDB 레코드와 토큰이 첫 저장과 같았다. 1건 통과, 17건 필터 제외, 2.67초. |
| `npm.cmd --prefix frontend run typecheck`, `npm.cmd --prefix frontend run build` | 생성 타입 일치·엄격한 TypeScript·프로덕션 Vite 빌드 모두 종료 0. 174개 모듈 변환. |
| `.github/workflows/test.yml`의 “Canonical and provider transport schemas” Python 본문 | 로컬 venv에서 정본(Draft 4)과 전송 스키마 5개(Draft 2020-12) 모두 통과. |
| `./.scratch/phase5a-actionlint-1.7.12/actionlint.exe -no-color .github/workflows/test.yml`, `git diff --check` | 각각 종료 0. |

로컬 파일을 찾는 중 PowerShell의 중괄호 경로·와일드카드 오류가 있어 명시적 경로와 `rg -g`로 다시 조회했다. 원격 메타데이터 조회의 첫 연결 오류와 재확인 결과는 아래 공개 배포 절에 기록했다.

## 릴리스 전 남은 결정

| 항목 | 다음 독립 작업과 판정 기준 |
|---|---|
| B-01 · High | 다음 공개 릴리스의 보안 차단 항목으로 권고한다. 배포 고정값과 설치 메타데이터는 FastAPI `0.115.12`, Starlette `0.46.2`다. 공개 정적 응답이 영향 경로를 사용한다. FastAPI의 허용 범위 `>=0.40.0,<0.47.0`는 이 권고의 최초 수정 버전 `0.49.1`을 제외한다. 별도 RED로 배포 잠금에 영향 버전이 들어오면 실패하게 한다. 이후 호환되는 두 패키지를 선정하고 잠금 재생성, 의존성 검사, 정상 파일 제공·공개 모드·컨테이너 스모크를 수행한다. 운영 프록시에서의 실제 영향은 미확인이다. [유지보수자 권고](https://github.com/Kludex/starlette/security/advisories/GHSA-7f5h-v6xp-fcq8) |
| B-03 · 수용 | 독립 RED에서 모의 완료 봉투 안의 미완료 메시지가 HTTP 502, 후보 0건인지 확인하고 완료 메시지의 정상 대조를 둔다. |
| DEV-01 / DEV-02 · 수용 | 서로 다른 RED로 진행한다. 배포 사전 확인 중 main 이동 시 외부 쓰기 0회, 필수 CSS·프리로드·SVG 누락 시 스모크 실패를 각각 재현한다. |
| DEV-03 · 소유자 설정 | Docker Hub 공개 메타데이터에서 불변 태그 설정이 꺼져 있었다. 소유자가 배포 가이드의 SHA 태그 불변 규칙과 롤백 이미지 보존을 확인한다. A/C는 digest로 배포됐다. [Docker Hub 설정 조회](https://hub.docker.com/v2/repositories/surlworl/worldweaver/) |
| B-02 / DEV-04 · 보류 | 로컬 비용 확인 헤더 생략은 기존 호출자 계약을 결정한 후 모의 호출 수로 시험한다. 빈 Render 202 응답은 후순위 단일 쓰기·상태 보고 시험 대상으로 둔다. |
| 제외·미검증 | Ajv 선택 기능의 제품 노출, 실운영 부하 영향, 저장 데이터 유실과 모든 UI 시간 초과의 공통 원인은 확정할 증거가 없다. |

## 공개 배포

`./.venv/Scripts/python.exe scripts/render_release.py smoke --origin https://worldweaver-8mbz.onrender.com --commit 50e2a7c02b9c6b7472440850af2617afffcbbf53`가 종료 0과 정확한 복구 C SHA를 반환했다. GitHub 공개 API도 같은 main SHA, 보호 활성화, 필수 검사 `Build and smoke-test release image`와 `WORLDWEAVER required`를 반환했다. GitHub와 Docker Hub의 첫 PowerShell 조회는 연결 오류였고 Python 표준 라이브러리로 재조회해 각각 HTTP 200을 확인했다. 실제 소유자 데이터는 같은 HTTPS origin과 기존 브라우저 프로필에서 프로젝트 ID·리비전·기록을 직접 대조해야 한다. 이번 IndexedDB 회귀는 합성 프로젝트와 fake-indexeddb로 실행했다. [공개 상태](https://worldweaver-8mbz.onrender.com/health) · [배포 C](https://github.com/jllgame00/worldweaver/actions/runs/46104696745)

## 소유자 커밋 순서와 전체 변경 파일

아래 세 묶음이 RED 이후 작업 트리의 전체 변경이다. 각 커밋 전에 `git diff --cached --name-only`로 해당 묶음만 들어갔는지 확인한다.

1. **A-01 GREEN** — `git add -- frontend/src/ScenarioStudio.tsx frontend/src/useProjects.ts frontend/src/scenarioApproval.test.tsx`로 구현 2개와 보충 회귀 1개를 선택한다. 권장 메시지는 `fix(scenario): preserve saved verification evidence`다. 원래 RED 파일 `frontend/src/verificationWorkspace.test.tsx`는 이미 부모 커밋에 있다.
2. **A-02 동기화** — `frontend/src/ScenarioStudio.test.tsx`만 선택한다. 권장 메시지는 `test(scenario): wait for validation before approval`다. 기존 통합 검사의 승인 전제와 저장 단언을 모두 유지한다.
3. **문서** — 실제 GREEN SHA와 diff를 확인해 이 보고서와 TDD 원장에 기록한 후 아래 8개 문서를 별도로 선택한다. 권장 메시지는 `docs(review): record independent audit and verification evidence`다. 그 뒤 다음 RED 그룹의 범위를 정한다.

```powershell
git add -- docs/PHASE_7_REVIEW_PLAN.md docs/PHASE_7_AGENT_CORRECTNESS.md docs/PHASE_7_AGENT_SECURITY.md docs/PHASE_7_AGENT_DEVOPS.md docs/PHASE_7_FINDINGS.md docs/PHASE_7A_REPORT.md docs/PHASE_7B_REPORT.md docs/TDD_EVIDENCE.md
```
