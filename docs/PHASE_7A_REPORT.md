# Phase 7A · 독립 감사와 테스트 우선 준비

**`PHASE_7A_READY_FOR_OWNER_REVIEW`** — 세 독립 감사를 완료하고, 저장된 검증 기록 유실 한 건을 오너의 첫 RED 그룹으로 준비했다.

## 기준과 실제 실행

시작 작업 트리는 깨끗했다. `feature/final-agent-review`의 HEAD와 로컬 `main`, `origin/main`, GitHub `main`이 모두 `50e2a7c02b9c6b7472440850af2617afffcbbf53`였다. 임시 실패 테스트는 파일과 추적 목록에서 제거된 상태였다. 공개 스모크는 종료 코드 0과 C의 전체 SHA를 반환했다. GitHub의 `main` 보호와 두 필수 검사를 조회했다. [감사 계획](PHASE_7_REVIEW_PLAN.md) · [GitHub main](https://api.github.com/repos/jllgame00/worldweaver/branches/main)

C는 `main push`에서 여섯 작업이 성공했다. 호스팅 테스트는 백엔드 329건, 프런트엔드 48파일 236건이었다. 게시 로그의 `sha256:0e88200d9be8745f8ab9c4d7470c4d50388680532c95fdadfa28a860027af8c7`와 Render 로그의 `dep-dc550rs9v7es73977udg`, 전체 SHA가 일치했다. A·B·C의 아티팩트, 작업 결론과 배포 증거는 독립 DevOps 보고서에 보관했다. [C 실행](https://github.com/jllgame00/worldweaver/actions/runs/46104696745) · [C 게시](https://github.com/jllgame00/worldweaver/actions/runs/46104696745/job/140855579376) · [C 배포](https://github.com/jllgame00/worldweaver/actions/runs/46104696745/job/140855653989) · [A/B/C 교차 검토](PHASE_7_AGENT_DEVOPS.md)

| 네이티브 실행 식별자 | 독립 검토 결과 |
|---|---|
| `/root/correctness` | 완료. 저장 기록 유실 A-01 재현, 승인 준비 상태 대조 통과, 두 장시간 UI 사례의 과거 시간 증거 분석. [제품 감사](PHASE_7_AGENT_CORRECTNESS.md) |
| `/root/security` | 완료. 영향받는 고정 의존성 확인, 로컬 출력 한도와 미완료 응답의 모의 재현, 공개 차단과 개인정보 경계 대조. [보안 감사](PHASE_7_AGENT_SECURITY.md) |
| `/root/devops` | 완료. 실제 A/B/C 대조, 배포 사전 확인·자산 스모크 모의 결함, Docker Hub 설정 차이와 Render 응답 위험 확인. [릴리스 감사](PHASE_7_AGENT_DEVOPS.md) |

식별자와 완료 상태는 네이티브 하위 에이전트 도구의 실행 및 목록 응답에서 확인했다. 각 독립 보고서를 별도 파일에 보관했다. 조정자는 A-01을 별도로 실행했고 보안·DevOps의 모의 요청과 원격 공개 설정을 재확인했다. 확정 범위와 보류 이유는 [발견 및 우선순위](PHASE_7_FINDINGS.md)에 있다.

## 회귀와 RED

| 검사 | 결과 |
|---|---|
| 변경 전 전체 백엔드 | 모의 공급자에서 `./.venv/Scripts/python.exe -m pytest -q` 종료 0, 329건 통과. 기존 Starlette/AnyIO 사용 중단 경고 한 건. |
| 변경 전 전체 프런트엔드 | `npm.cmd --prefix frontend test -- --reporter=dot` 종료 0, 기본 워커 설정에서 48파일 236건 통과. |
| 지정 RED 2회 | 아래 집중 명령은 각각 종료 1, 테스트 1건 실패와 필터로 제외한 2건을 보고했다. 두 실행 모두 `verificationWorkspace.test.tsx:87`의 기존 Quick Check 실행 ID 보존 단언에서 실패했다. 새 시나리오 검사 ID는 저장됐고 설계 리비전은 유지됐다. 에이전트의 별도 프로브에서는 `verificationHistory`의 유실도 관측됐다. |
| 기존 UI 대조 | 세 파일에서 새 RED만 제외해 기존 11건이 통과했다. `verificationWorkspace`의 거절·채택 사례 4.446초, Salt Census 사본 사례 3.392초, `ScenarioStudio`의 생성·승인 사례 4.876초와 거절 후 복구 사례 4.971초였다. |
| 정적 확인 | `npm.cmd --prefix frontend run typecheck`, `npm.cmd --prefix frontend run build`, CI의 정본 및 전송 스키마 5종, actionlint 1.7.12와 `git diff --check`가 통과했다. |

~~~powershell
npm.cmd --prefix frontend test -- src/verificationWorkspace.test.tsx -t 'preserves both saved checks'
npm.cmd --prefix frontend test -- src/verificationWorkspace.test.tsx src/publicExample.test.tsx src/ScenarioStudio.test.tsx --reporter=verbose -t '^(?!.*preserves both saved checks)'
~~~

새 RED는 지연된 시나리오 응답과 먼저 완료된 Quick Check 저장의 순서를 제어한다. 이전 장시간 테스트의 실패는 과거 로그와 현재 대조 시간을 별도로 기록했다. 지연 응답 대조에서 승인 버튼이 렌더된 시점과 승인 가능 시점이 다름을 확인했다. 이번 기존 테스트들은 통과했으며, 과거의 모든 간헐 실패가 같은 원인이라는 증거는 없다. 테스트 제한과 기본 워커 설정을 유지했다.

## 변경 파일과 오너 커밋 순서

| 변경 파일 | 범위 |
|---|---|
| `docs/PHASE_7_REVIEW_PLAN.md` | 독립 감사 계획과 오너 게이트 |
| `docs/PHASE_7_AGENT_CORRECTNESS.md` | 독립 에이전트 A 보고서 |
| `docs/PHASE_7_AGENT_SECURITY.md` | 독립 에이전트 B 보고서 |
| `docs/PHASE_7_AGENT_DEVOPS.md` | 독립 에이전트 C 보고서 |
| `docs/PHASE_7_FINDINGS.md` | 근거와 수용·보류·제외 판정 |
| `docs/PHASE_7A_REPORT.md` | 실행 및 오너 인수 기록 |
| `docs/TDD_EVIDENCE.md` | 기준 회귀와 실제 RED 기록 |
| `frontend/src/verificationWorkspace.test.tsx` | A-01 RED 추가와 필요한 테스트 import |

1. 오너 RED 커밋은 `test(verification): reproduce lost saved check evidence`를 권장한다. 해당 테스트 파일만 포함하고 위 집중 명령이 기록 보존 단언에서 실패하는지 확인한다. 문서가 필요하면 별도 문서 커밋으로 보관한다.
2. 후속 승인에서 실제 RED SHA·diff·실패를 확인한 뒤 해당 저장 경로의 최소 수정에 착수한다. 오너 GREEN 커밋은 `fix(scenario): preserve saved verification evidence`를 권장한다. 동일 단언과 전체 회귀를 통과하고 두 실제 SHA를 기록한 뒤 다음 그룹을 선택한다. [오너 커밋 게이트](PHASE_5_PLAN.md)

운영 IndexedDB의 기존 레코드 동일성, Render 내부 배포 이력, 실제 롤백 및 유료 공급자 동작은 확인하지 않았다. 공개 애플리케이션이 정상이라는 오너 보고와 공개 헬스는 서비스 관찰로 기록했다. 운영 구현·CI·원격 설정·자격증명 변경 및 커밋·푸시·게시·배포는 없었다. LLM 호출과 크레딧 사용은 0이다.
