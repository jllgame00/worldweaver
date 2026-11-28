# Phase 7A · 독립 리뷰 C · DevOps와 릴리스

- 실행 이름 `/root/devops`. 기준 `50e2a7c02b9c6b7472440850af2617afffcbbf53`, 브랜치 `feature/final-agent-review`. GitHub·Docker Hub·공개 Render를 읽기 전용으로 조회했다. 실패 경로는 합성 값과 모의 응답으로 검증했다.
- 로컬 `./.venv/Scripts/python.exe -m pytest -q scripts/test_render_release.py scripts/test_release_gate.py -o cache_dir=.scratch/phase7-agent-devops-pytest-cache`는 12건 통과했다. Windows 샌드박스의 pytest 캐시 디렉터리 쓰기 경고가 한 건 있었다. `./.venv/Scripts/python.exe scripts/render_release.py smoke --origin https://worldweaver-8mbz.onrender.com --commit 50e2a7c02b9c6b7472440850af2617afffcbbf53`는 종료 0과 정확한 SHA를 출력했다.

## 실제 캠페인 교차 확인

| 실행 | 조회한 결과 |
|---|---|
| A | Actions Jobs API의 여섯 작업이 성공했다. 게시 작업에서 테스트 이미지 `worldweaver:33abe57…`를 불러와 `sha256:446097c166f507d0820a0df93817937b4ed02d6d59edf1de49fc5f480067f041`를 게시했다. Render 작업에서 `dep-dc4pjg8u01pc73eu9b10`와 A 전체 SHA·다이제스트가 함께 검증됐다. [실행](https://github.com/jllgame00/worldweaver/actions/runs/46019534340) · [배포 로그](https://github.com/jllgame00/worldweaver/actions/runs/46019534340/job/140577373724) |
| B | 지정 pytest가 단언으로 실패했고 329건은 통과했다. 필수 검사는 `Tests: failure. Build: skipped.` 뒤 실패했다. Vite·이미지 빌드와 스모크·게시·Render 네 작업은 모두 생략됐다. Docker Hub B 태그는 HTTP 404였고 GitHub SHA별 배포 조회는 빈 목록이었다. [실행](https://github.com/jllgame00/worldweaver/actions/runs/46102057956) · [필수 게이트 로그](https://github.com/jllgame00/worldweaver/actions/runs/46102057956/job/140846974990) · [GitHub 배포 조회](https://api.github.com/repos/jllgame00/worldweaver/deployments?sha=e6948120db9f017579a3e027f8fdd02215ed0239) |
| C | 여섯 작업이 성공했다. 수집 로그에 pytest 329건, Vitest 48파일 236건이 있다. 컨테이너 단계의 스모크가 정확한 C SHA로 통과했다. 빌드가 올린 `tested-image-46104696745`의 아티팩트 ID `15247241489`가 게시 로그의 다운로드 ID와 같다. 게시 단계가 동일 SHA 태그로 불러와 게시한 결과가 `sha256:0e88200d9be8745f8ab9c4d7470c4d50388680532c95fdadfa28a860027af8c7`이며 Render 로그에서 A를 이전 정상 배포로 확인한 뒤 `dep-dc550rs9v7es73977udg`, C 전체 SHA, 동일 digest를 검증했다. 같은 Docker digest와 공개 `/health`의 C 전체 SHA를 독립적으로 확인했다. [실행](https://github.com/jllgame00/worldweaver/actions/runs/46104696745) · [컨테이너](https://github.com/jllgame00/worldweaver/actions/runs/46104696745/job/140855448316) · [게시](https://github.com/jllgame00/worldweaver/actions/runs/46104696745/job/140855579376) · [배포](https://github.com/jllgame00/worldweaver/actions/runs/46104696745/job/140855653989) |

`main`의 공개 응답에서 보호가 활성화됐고 `WORLDWEAVER required`와 `Build and smoke-test release image`가 모두에게 적용됐다. 브랜치 세부 보호 API는 401을 반환했다. 브랜치 ruleset 목록은 비어 있어 별도의 활성 ruleset 증거는 관측되지 않았다. 실제 저장소 관리자 화면과 Render 내부 배포 이력에는 접근하지 않았다. [브랜치 조회](https://api.github.com/repos/jllgame00/worldweaver/branches/main) · [관리 API 문서](https://docs.github.com/en/rest/branches/branch-protection#get-branch-protection)

## DEV-01 · Medium · 확인된 릴리스 순서 결함

- 위치 `.github/workflows/test.yml:205–223`, `scripts/render_release.py:69–77`, `scripts/render_release.py:135–146`.
- 상황 및 영향. 현재 `main` 확인 한 번이 Python 컨트롤러 호출 앞에 있다. 컨트롤러가 이전 배포의 공개 스모크와 Render 사전 조회를 하는 동안 새 커밋이 `main`에 병합되면, 이미 대체된 SHA에 대해 배포 POST가 호출될 수 있다. 기존 롤아웃 concurrency는 GitHub 작업을 직렬화하고 `main` 이동은 별도 작업이므로 이 시간차가 유지된다. 새로운 SHA가 아직 성공하지 않았거나 실패하면 이전 후보가 최신 변경과 어긋난 상태로 남을 수 있다. 이미 통과한 이미지에 대한 문제이며 CI 실패 이미지 자체가 게시된다는 근거는 없다.
- 재현. `./.venv/Scripts/python.exe .scratch/phase7-agent-devops-probe.py`의 모의 Render에서 사전 `main` 검사 이후 `verify(None)` 동안 합성 `main`을 바꿨다. 실제 `rollout()`은 `current at deploy: False ; deployment calls: 1`을 출력했고 candidate를 `Verified`로 처리했다. 원격 쓰기는 없다.
- 권장 수정과 RED. 실패해도 배포하지 않는 `main` 재확인을 실제 POST 직전에 적용한다. 이벤트나 모의 콜백으로 이전 배포 검증이 진행되는 동안 `main`을 이동시키고, 배포 쓰기가 0회이며 대체된 릴리스가 명확히 보고되는지 시험한다.
- 신뢰도 높음. 로컬 순서를 결정적으로 재현했다. GitHub와 Render 사이에 원자적 조건부 쓰기 계약이 없어 최종 읽기와 쓰기 사이의 모든 경쟁까지 제거했다고 주장할 수 없다. C에서 이 상황은 관측되지 않았다.

## DEV-02 · Medium · 확인된 공개 스모크 범위 결함

- 위치 `scripts/render_release.py:41–66`, `backend/app/release.py:22–44`, `backend/app/main.py:155–165`.
- 상황 및 영향. 현재 HTTP 스모크는 HTML의 직접 `script src`와 합성 예제 JSON을 요청한다. 메인 JS가 의존하는 HTML `modulepreload` 런타임, CSS와 SVG 예제의 HTTP 접근성을 확인하지 않는다. `/health`가 이 항목의 디스크 존재까지는 검사하지만 외부 URL의 정상 응답을 보장하지 않는다. HTML은 정상인데 필수 런타임 URL이 404거나 HTML을 반환하면 브라우저 초기화가 실패해도 배포가 건강하다고 표시될 수 있다.
- 재현. 같은 로컬 스크립트에서 정상 `/health`, HTML, entry JS, JSON을 유지하고 HTML에 선언된 React 런타임과 CSS 및 예상한 SVG 경로에 모의 404를 주었다. `probe accepted exact SHA: True`와 요청 다섯 개만 관측됐다. C의 실제 HTML과 직접 선언된 JS 3개, CSS 1개 및 SVG는 모두 HTTP 200과 기대 MIME을 반환했다.
- 권장 수정과 RED. 같은 origin의 HTML에 직접 선언된 modulepreload JS와 stylesheet, 현재 예제 SVG의 상태·유형·비어 있지 않은 본문을 점검한다. 각 필수 경로 하나만 빠졌거나 HTML로 대체된 합성 응답에서 스모크가 실패하도록 시험한다. 모든 동적 청크 그래프를 재구축하는 변경과는 분리한다.
- 신뢰도 높음. 스모크의 성공 판정 자체를 모의 응답으로 재현했다. HTML에 없는 동적 스튜디오 청크 하나를 생략해도 현재 디스크 준비 목록이 모두 존재한 것으로 판정하는 점을 추가 관측했다. 실제 배포의 동적 청크 누락은 확인되지 않았으므로, 릴리스 manifest 또는 네이티브 스튜디오 스모크 도입은 별도 검토 대상이다.

## DEV-03 · Medium · 확인된 Docker Hub 설정 불일치

- 위치 `docs/DEPLOYMENT_GUIDE.md:7,30`, `.github/workflows/test.yml:181–197`.
- 상황 및 영향. 문서는 SHA 태그 불변성을 전제로 한다. 실제 공개 저장소 메타데이터는 2026-11-28 04:04 UTC에 HTTP 200과 `immutable_tags_settings.enabled=false`, `rules=[".*"]`를 돌려줬다. 워크플로는 SHA 태그에 이미 존재하는 이미지 여부를 검사하지 않고 push한다. 같은 태그로 이미지를 바꾸면 태그만으로 릴리스 출처를 재현하기 어려워질 수 있다. Render는 이 관측에서 실제 digest를 사용했으므로 이미 실행 중인 C가 태그 변경으로 바뀐다는 근거는 없다. A·C 태그가 실제 변경됐다는 증거도 없다. [공개 저장소 메타데이터](https://hub.docker.com/v2/repositories/surlworl/worldweaver/) · [Docker Hub 불변 태그 문서](https://docs.docker.com/docker-hub/repos/manage/hub-images/immutable-tags/)
- 권장 수정과 검증. 오너가 실제 설정 화면에서 현재 적용을 확인한 뒤 별도 권한으로 승인된 `^sha-[0-9a-f]{40}$` 불변 규칙의 적용을 결정한다. 변경 후 메타데이터와 기존 A·C 태그/digest를 읽기 전용으로 확인한다. 현재 코드 결함으로 가정한 로컬 RED나 실제 태그 덮어쓰기는 수행할 근거가 없다.
- 신뢰도 높음. 공개 메타데이터의 구체적 필드와 문서가 불일치한다. 권한을 사용하는 관리자 화면은 확인하지 않았다.

## DEV-04 · Low · Render 대기 응답의 운영 위험

- 위치 `scripts/render_release.py:22–38,98–99,114–115,145–146,182–186`, `docs/DEPLOYMENT_GUIDE.md:30,49`, `docs/DEVOPS_PLAN.md:19`.
- 상황 및 영향. 공식 Render 배포 생성 계약은 본문 스키마가 없는 `202 Queued`도 명시한다. 현 클라이언트는 모든 성공 HTTP 본문을 JSON 객체로 해석하고 ID를 요구하므로, 대기 요청이 수락됐으나 본문이 비어 있으면 JSON 디코딩 오류만 출력한다. 이벤트 확인을 하기 전에 오너가 수동으로 재실행할 경우 상태가 혼동될 수 있다. 코드의 쓰기 단일 시도 자체는 유지된다. [Render 배포 API](https://api-docs.render.com/reference/create-deploy) · [공개 OpenAPI](https://api-docs.render.com/openapi/render-public-api-1.json)
- 재현. 합성 빈 응답에서 `Render.deploy()`가 `JSONDecodeError`를 내고 쓰기 호출 횟수는 1회였다. 실제 C에서 이 응답이 발생했다는 로그는 없다.
- 권장 수정과 회귀. 애매한 성공 응답에는 Render 이벤트 확인이 필요함을 명확히 알리고 재전송이나 추정 롤백을 피한다. 빈 성공 응답에서 메시지와 단일 POST를 보장하는 모의 회귀를 검토한다. 정상 201 및 정확한 ID·digest 경로는 기존대로 검증한다.
- 코드 경로 재현 신뢰도 높음. 실제 이미지 기반 서비스의 해당 응답 발생 조건은 미확인이라 이 단계에서는 후순위 운영 위험으로 분류한다.

## 교차 검토와 보류

- 워크플로는 `test → build → required → container → publish → deploy`의 성공 의존 관계와 각각의 배포 스위치를 유지한다. 집계는 두 선행 결과가 모두 성공일 때만 성공한다. PR job에는 배포 시크릿을 참조하지 않는다. 사용한 이미지는 한 번 만든 아티팩트로 전달한다. `.github/workflows/test.yml:72–156,158–223`.
- Render 컨트롤러는 일치하는 서비스 origin, 이전의 건강한 공개 SHA, 겹치는 배포 상태, 새 ID·해결 digest·공개 SHA를 검사한다. 실패해도 자체 배포가 여전히 최신일 때만 이전 ID로 롤백하고, 이전 digest·SHA가 확인된 후 원래 작업을 실패로 남긴다. 실제 롤백이나 쓰기 시점 외부 경쟁은 실행하지 않았다. 이미지 기반 Render 서비스가 Git 커밋을 자동배포한다는 가설은 공식 문서와 현재 방식에 맞지 않는다. `scripts/render_release.py:87–159`. [Render 이미지 배포 방식](https://render.com/docs/deploys#automatic-deploys) · [롤백](https://render.com/docs/rollbacks)
- 공개 레지스트리 C manifest와 config를 내려받아 각각 SHA-256을 대조했다. 정확한 OCI SHA, Linux/amd64, 사용자 `65532:65532`, `exec` Uvicorn, 종료 유예 20초를 확인했다. 설정 목록에 공급자 자격 이름이 없다. CI 스모크의 Docker 종료 판단은 25초 내 코드 0 또는 143 허용이다. 로컬 Docker Engine 소켓이 없어 새 컨테이너 실행이나 실제 트래픽 처리 중 종료는 확인하지 못했다. `Dockerfile:11–26`, `.dockerignore:1–27`, `.github/workflows/test.yml:117–144`.
- A와 C 사이 `frontend/src/App.tsx` 및 `frontend/src/storage.ts`에는 변경이 없다. IndexedDB는 브라우저 내부, origin과 프로필에 속한다. HTTP 스모크나 앱이 작동한다는 오너 보고만으로 실제 기존 프로젝트 레코드의 동일 ID·리비전 보존을 판정할 수 없다. 같은 프로필과 주소에서 JSON 재가져오기 전에 레코드를 확인하는 절차가 남아 있다. `frontend/src/App.tsx:41`, `frontend/src/storage.ts:16–41,67–80`, `docs/DEPLOYMENT_EVIDENCE_PLAN.md`의 복구 절차.

실제 롤백, Docker Hub·GitHub·Render 설정 변경, 기존 브라우저 프로젝트의 접근은 수행 범위에 포함하지 않았다. 외부 배포 추가·대체 여부와 실데이터 보존 여부는 해당 관리·브라우저 증거가 필요하다.
