# Phase 6C · 실제 배포 차단 검증

오너가 승인한 `main` push B에서 지정 pytest 단언이 실패해 필수 검사가 실패했고, 이미지 게시와 Render 배포 작업이 생략됐다. B 종료 뒤에도 공개 서비스는 기준 A의 SHA로 정상 응답했다. Render 내부 Events/Deploys 확인은 오너에게 남아 있다.

## 리비전과 실행

| 항목 | 확인 결과 |
|---|---|
| 배포 기준 A | `33abe573d3378a7471344d30eb31d0e3d2e13a19`. 자동 배포에서 검증된 Render 배포 ID는 `dep-dc4pjg8u01pc73eu9b10`, 이미지 다이제스트는 `sha256:446097c166f507d0820a0df93817937b4ed02d6d59edf1de49fc5f480067f041`이다. [기준 A 실행](https://github.com/jllgame00/worldweaver/actions/runs/46019534340) · [6B 보고서](PHASE_6B_REPORT.md) |
| 보호된 `main` | 복구 준비 시작 시 작업 트리는 깨끗했다. `feature/deployment-gate-recovery`의 HEAD, 로컬 `main`, `origin/main`, GitHub API의 `main`이 모두 B였다. GitHub API에서 브랜치 보호와 필수 검사 `WORLDWEAVER required`, `Build and smoke-test release image`가 모두에게 적용됐다. [브랜치 조회](https://api.github.com/repos/jllgame00/worldweaver/branches/main) |
| 병합 전 PR | PR #4의 HEAD `a468c381f00d0e74f94f3971e0d9e7888ab2e44f`에서 테스트, 프런트엔드 빌드, 필수 검사, 컨테이너 빌드·스모크가 통과했다. PR 이벤트에서 게시와 배포는 생략됐다. [PR](https://github.com/jllgame00/worldweaver/pull/4) · [PR 검사](https://github.com/jllgame00/worldweaver/actions/runs/46101576201) |
| 통제 실패 B | `e6948120db9f017579a3e027f8fdd02215ed0239`. 첫째 부모가 A, 둘째 부모가 위 PR HEAD이고 병합 메시지의 승인 줄에 같은 PR HEAD가 기록됐다. 오너 `jllgame00`이 2026-11-28 03:16:31 UTC에 병합했고, 03:16:34 UTC에 시작한 실행은 `main`의 `push`이며 결론은 `failure`였다. A와 B 사이의 변경은 임시 pytest 파일과 문서 3개였다. [병합 커밋](https://github.com/jllgame00/worldweaver/commit/e6948120db9f017579a3e027f8fdd02215ed0239) · [B 실행](https://github.com/jllgame00/worldweaver/actions/runs/46102057956) |

## B의 호스팅 결과

| 작업 | 결과 |
|---|---|
| Tests and contracts | `Backend regression`의 `python -m pytest -q`가 **329건 통과, 지정 1건 실패**로 종료 코드 1을 반환했다. 같은 작업의 프런트엔드 회귀 단계는 생략됐다. [테스트 로그](https://github.com/jllgame00/worldweaver/actions/runs/46102057956/job/140846478873) |
| WORLDWEAVER required | `Tests: failure. Build: skipped.`와 종료 코드 1을 반환했다. [필수 검사 로그](https://github.com/jllgame00/worldweaver/actions/runs/46102057956/job/140846974990) |
| Production frontend build | `skipped`. [작업 결과](https://github.com/jllgame00/worldweaver/actions/runs/46102057956/job/140846976150) |
| Build and smoke-test release image | `skipped`. [작업 결과](https://github.com/jllgame00/worldweaver/actions/runs/46102057956/job/140846998592) |
| Publish verified image | `skipped`. [작업 결과](https://github.com/jllgame00/worldweaver/actions/runs/46102057956/job/140846999254) |
| Deploy digest and verify release | `skipped`. [작업 결과](https://github.com/jllgame00/worldweaver/actions/runs/46102057956/job/140846999752) |

실패 로그에서 확인한 테스트 ID와 단언

~~~text
scripts/test_controlled_deployment_gate.py::test_controlled_deployment_gate
AssertionError: HW6 controlled deployment-gate demonstration: owner-approved pytest failure
assert not True
~~~

## 게시·배포 교차 확인

- **Docker Hub와 레지스트리 확인.** 2026-11-28 03:27–03:28 UTC에 Docker Hub 태그 API와 공개 레지스트리 manifest 조회가 모두 A의 `sha-<전체 SHA>` 태그에 HTTP 200과 위 다이제스트를 반환했다. 두 조회 모두 B의 정확한 태그에는 HTTP 404를 반환했다. [Docker Hub 태그](https://hub.docker.com/r/surlworl/worldweaver/tags)
- **GitHub 배포 레코드 확인.** SHA로 필터한 GitHub API에서 A의 `production` 레코드 두 개를 반환했고, B의 레코드는 빈 목록이었다. B의 배포 작업 생략과 일치한다. [B 배포 조회](https://api.github.com/repos/jllgame00/worldweaver/deployments?sha=e6948120db9f017579a3e027f8fdd02215ed0239)
- **공개 서비스 확인.** 아래 스모크는 종료 코드 0과 `Healthy image 33abe573d3378a7471344d30eb31d0e3d2e13a19`를 반환했다. 03:27:50 UTC의 `/health`는 HTTP 200, `status=ok`, A의 정확한 SHA, `backendReady=true`, `frontendReady=true`, `liveEnabled=false`를 반환했다. 03:36:24 UTC에 HTTP 200과 A의 SHA를 재확인했다. [공개 health](https://worldweaver-8mbz.onrender.com/health)
- **Render 내부 이력은 오너 확인.** 비인증 배포 이력 조회는 HTTP 401이었다. 오너는 Events/Deploys에서 A의 배포 ID와 다이제스트가 활성인지, B 실행 전후에 별도 배포 이벤트가 있었는지 확인하고 시각이 보이는 기록을 보관한다.

~~~powershell
./.venv/Scripts/python.exe scripts/render_release.py smoke --origin https://worldweaver-8mbz.onrender.com --commit 33abe573d3378a7471344d30eb31d0e3d2e13a19
~~~

후속 C의 호스팅 테스트, 이미지 다이제스트, Render 배포 ID 및 동일 브라우저의 IndexedDB 보존은 [복구 절차](DEPLOYMENT_EVIDENCE_PLAN.md#3-phase-6d--독립-복구-c-및-indexeddb)에 따라 확인한다. [로컬 검증 원장](TDD_EVIDENCE.md)
