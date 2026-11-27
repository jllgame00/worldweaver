# WORLDWEAVER 배포 가이드

소유자가 외부 자원 생성을 승인한 뒤 실행한다. 공개 서비스 한 개에서 FastAPI가 React 빌드, 공개 예제, API를 같은 HTTPS 주소로 제공한다. 공개 이미지에는 빌드한 전체 Git SHA가 읽기 전용 파일로 들어 있다. Node·Vite는 빌드 단계에서만 쓴다.

## 1. 계정과 GitHub 설정

1. Docker Hub에서 소유자 또는 조직의 저장소를 선택하거나 새로 만든다. 공개 예제 서비스는 공개 이미지로 시작할 수 있다. 비공개 이미지는 이후 Render에 별도의 읽기 전용 레지스트리 자격이 필요하다. 태그 설정에서 모든 릴리스 태그를 불변으로 설정한다. 예시는 정규식 `^sha-[0-9a-f]{40}$`이다. 현재·직전 배포를 포함한 롤백 대상 이미지는 보존한다. [태그 설정](https://docs.docker.com/docker-hub/repos/manage/hub-images/immutable-tags/)
2. Docker 계정의 Personal access tokens에서 이 용도만의 읽기·쓰기 토큰을 발급한다. 삭제 권한은 필요하지 않다. [Docker 토큰](https://docs.docker.com/security/access-tokens/)
3. GitHub 저장소 Settings → Environments에서 `production`을 만들고 배포 가능한 브랜치를 보호된 `main`으로 제한한다. 사용 중인 요금제에서 가능하면 승인자를 지정한다. Branch protection에서 PR과 기존 검사 `WORLDWEAVER required`를 요구하고 `Build and smoke-test release image`도 필수로 설정한다. 이 설정의 현재 적용 여부는 소유자가 확인한다.
4. 다음 이름을 사용한다. 작업 시작 조건을 평가하는 스위치는 **저장소 Actions variables**에 둔다. 시크릿 값은 화면 캡처·명령행·이슈에 넣지 않는다.

| 위치 | 이름 | 값 또는 역할 |
|---|---|---|
| 저장소 Variables | `PUBLICATION_ENABLED` | 최초 `false`. 게시를 승인할 때만 `true` |
| 저장소 Variables | `DEPLOYMENT_ENABLED` | 초기 이미지 게시·Render 설정을 마칠 때까지 `false` |
| production Variables | `DOCKERHUB_REPOSITORY` | 소문자 `namespace/repository` |
| production Variables | `DOCKERHUB_USERNAME` | 토큰 소유 계정 |
| production Secrets | `DOCKERHUB_TOKEN` | Docker Hub 쓰기 토큰 |
| production Variables | `RENDER_SERVICE_ID` | Render 서비스 ID `srv-…` |
| production Variables | `RENDER_ORIGIN` | 해당 서비스 상세에 표시된 기본 HTTPS 주소. 경로나 사용자 정의 도메인을 넣지 않는다. |
| production Secrets | `RENDER_API_KEY` | 대상 서비스 조회·배포 목록/상태 조회·배포 생성·롤백 권한이 있는 서버용 토큰 |

## 2. 첫 이미지 → 첫 서비스 → 자동 배포

1. 배포 코드를 검토하고 PR로 main에 통합한다. 두 스위치가 꺼져 있으면 CI는 테스트, 빌드, 컨테이너 실행 검사까지 진행한다.
2. 게시만 승인한 뒤 `PUBLICATION_ENABLED=true`, `DEPLOYMENT_ENABLED=false`로 설정한다. Actions → WORLDWEAVER CI → Run workflow에서 **main**을 선택한다. PR 실행에는 게시 권한이 주어지지 않는다. 결과의 `Publish verified image` 단계 요약에서 `docker.io/namespace/repository@sha256:…`와 Git SHA를 보관한다.
3. Render Dashboard → New → Web Service → **Existing Image**에서 방금 확인한 전체 다이제스트 참조를 지정한다. 비공개 이미지라면 읽기 전용 레지스트리 자격을 연결한다. 첫 서비스 생성 자체가 첫 배포이므로 이 단계에도 소유자 승인이 필요하다. 무료 인스턴스는 시연용이며 유휴 상태에서 잠들 수 있다. 운영 가용성이 필요하면 유료 요금과 승인을 별도로 확인한다. [이미지 서비스](https://render.com/docs/deploying-an-image) · [무료 인스턴스 제약](https://render.com/docs/free)
4. Health Check Path를 `/health`로 설정한다. Docker의 기본 시작 명령과 Render가 부여하는 `PORT`를 사용한다. `WORLDWEAVER_EXECUTION_MODE=public-demo`가 이미지 기본값이다. 프로바이더 키, 서버 디스크, Git 기반 자동 배포와 deploy hook은 설정할 필요가 없다. 이미지 기반 서비스의 이후 자동 릴리스는 GitHub Actions 한 곳이 제어한다. [배포 방식](https://render.com/docs/deploys) · [Deploy hook](https://render.com/docs/deploy-hooks)
5. Render의 서비스 기본 URL, 서비스 ID와 API 키를 위 표에 등록한다. 같은 브라우저에서 홈페이지와 `/health`를 열고 `commit`을 2단계 Git SHA와 대조한다. 운영 및 설정 → 서비스 상태 확인에서도 확인할 수 있다.
6. 다음 **새 main 커밋**부터 배포를 승인하려면 `DEPLOYMENT_ENABLED=true`로 설정한다. 게시 단계는 스모크 검사에서 사용한 이미지를 불변 태그 `sha-<전체 Git SHA>`로 올린다. Render API에 전달하는 값은 게시 후 얻은 다이제스트다. 이미 게시한 불변 태그는 다른 이미지로 덮어쓰지 않는다. 성공한 게시 뒤 배포만 실패했다면 원인을 해결하고 해당 실행에서 실패한 작업을 재실행하거나 검토된 새 커밋을 배포한다.
7. 배포 로그의 Render 배포 ID, 이미지 다이제스트와 SHA를 보관한다. 아래 검사에서 사용하는 주소는 실제 서비스 주소로 바꾼다.

~~~powershell
$origin = 'https://YOUR-SERVICE.onrender.com'
$commit = git rev-parse main
python scripts/render_release.py smoke --origin $origin --commit $commit
~~~

## 3. 동작 범위와 개인정보

공개 데모는 예제 열기, 수동 편집, 무료 규칙 정리, 기존 시나리오 편집, 선행 승인을 충족한 지도의 절차적 생성, 결정론적 검증, JSON 이관을 지원한다. AI 후보 생성·추출·수정·의미 검토 요청은 모두 403이다. 이미지에 키를 추가해도 활성화되지 않는다. `/health`는 서비스·필수 정적 파일·버전을 점검한다. 공급자 인증이나 잔액을 조회하지 않는다.

기존 로컬 개발 모드에서는 `WORLDWEAVER_PROVIDER`, `CHATKHU_API_KEY`, `CHATKHU_MODEL`, `CHATKHU_API` 또는 별도의 `OPENAI_API_KEY`를 서버에서 관리한다. 로컬 실행과 확인 절차는 [README](../README.md)에 있다. 공개 호스팅에서 보호된 유료 기능을 도입하려면 ChatKHU의 호스팅 허용과 소유자 승인, 인증 세션·CSRF 방어, 영속적인 지출 예약·제한, 동시성 제어와 작업별 전송 동의가 선행되어야 한다. 이번 이미지는 공개 데모 전용이다.

## 4. 이관·재배포·복구

- 평소 localhost 프로젝트를 **프로젝트 백업 다운로드**로 내보내고 배포 주소에서 **프로젝트 JSON 가져오기**를 사용한다. 같은 ID가 있으면 차이를 읽고 복원·별도 사본·취소를 선택한다. 다른 기기·프로필·포트·도메인은 별도 보관함이다.
- 컨테이너는 창작 프로젝트를 저장하지 않는다. 같은 HTTPS origin·브라우저 프로필의 IndexedDB는 컨테이너 교체와 별개다. 사이트 데이터 삭제, 프로필 변경, 브라우저 저장 공간 정책에 대비해 JSON을 별도로 보관한다. 별도 로컬 초안과 직전 복원본의 이관 범위는 [복구 보고서](PHASE_5D_REPORT.md)를 따른다.
- 새 배포가 실패하면 로그의 최초 실패, 이전 건강한 SHA와 다이제스트, 복원 배포 ID를 대조한다. 새 배포가 외부에서 개입했거나 이전 건강한 배포가 없으면 자동 롤백 대상이 없다. 수동 복원은 소유자의 승인을 받아 Render → Deploys → 이전 성공 배포 → Rollback을 선택하고 위 스모크 명령의 SHA를 이전 SHA로 바꿔 검증한다. 복원 실패는 미확인 상태로 기록한다. [Render 롤백](https://render.com/docs/rollbacks)
- 실패 차단 및 동일 주소 재배포 검수는 [증거 수집 절차](DEPLOYMENT_EVIDENCE_PLAN.md)를 따른다.
