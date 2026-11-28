# Phase 6B · 최초 공개 릴리스 검증

**초기 수동 배포와 첫 자동 Render 배포를 확인했다. 첫 자동 배포를 Phase 6C의 공개 기준 A로 기록한다.**

## 첫 자동 배포 · 공개 기준 A

| 항목 | 확인 결과 |
|---|---|
| 리비전과 트리거 | PR #3을 병합한 `main` push의 전체 SHA는 `33abe573d3378a7471344d30eb31d0e3d2e13a19`이다. GitHub `main` 조회 결과도 동일했다. [PR #3](https://github.com/jllgame00/worldweaver/pull/3) · [main](https://github.com/jllgame00/worldweaver/tree/main) |
| 호스팅 CI | 2026-11-27 14:50 UTC에 시작한 실행 `46019534340`에서 테스트·계약, 프런트엔드 빌드, `WORLDWEAVER required`, 이미지 빌드·스모크, 이미지 게시, Render 배포가 모두 성공했다. pytest 329건, Vitest 48파일 236건이다. [Actions 실행](https://github.com/jllgame00/worldweaver/actions/runs/46019534340) · [테스트 로그](https://github.com/jllgame00/worldweaver/actions/runs/46019534340/job/140575264967) |
| 게시와 배포 | 태그 `sha-33abe573d3378a7471344d30eb31d0e3d2e13a19`의 게시 다이제스트는 `sha256:446097c166f507d0820a0df93817937b4ed02d6d59edf1de49fc5f480067f041`이다. 배포 컨트롤러가 14:55:29 UTC에 Render 배포 `dep-dc4pjg8u01pc73eu9b10`의 동일 다이제스트와 전체 SHA를 검증했다. [게시 로그](https://github.com/jllgame00/worldweaver/actions/runs/46019534340/job/140577087052) · [배포 로그](https://github.com/jllgame00/worldweaver/actions/runs/46019534340/job/140577373724) |
| 직전 건강한 배포 | 같은 컨트롤러 로그에 수동 배포 SHA `a2e277e0ba463e044ce75c7e6af17c8a1e7af1ae`, 배포 ID `dep-dc4kmf95efls739nfl6g`, 다이제스트 `sha256:a39ee2c85c8271ee8aec5aaa12ffcd44ebdbcdf8e34ece08de490fe6f2356753`가 기록됐다. [배포 로그](https://github.com/jllgame00/worldweaver/actions/runs/46019534340/job/140577373724) |

2026-11-28 02:37 UTC에 운영 주소에서 아래 스모크가 종료 코드 0과 `Healthy image 33abe573d3378a7471344d30eb31d0e3d2e13a19`를 반환했다.

~~~powershell
./.venv/Scripts/python.exe scripts/render_release.py smoke --origin https://worldweaver-8mbz.onrender.com --commit 33abe573d3378a7471344d30eb31d0e3d2e13a19
~~~

같은 시각에 `/health`는 HTTP 200, `status=ok`, `version=1.0.0`, 일치하는 전체 SHA, `backendReady=true`, `frontendReady=true`, `executionMode=public-demo`, `providerMode=disabled`, `liveEnabled=false`, `persistence=browser-indexeddb`를 반환했다. Render 내부 기록은 호스팅 배포 컨트롤러 로그에서 확인했다. 테스트 실패 후 운영 상태와 브라우저 데이터 보존은 후속 실험에서 확인한다. [공개 health](https://worldweaver-8mbz.onrender.com/health) · [6C 차단과 6D 복구 절차](DEPLOYMENT_EVIDENCE_PLAN.md)

## 초기 수동 배포와 게시 근거

| 항목 | 확인 결과 |
|---|---|
| 로컬 기준 | `feature/release-verification`의 시작 HEAD와 로컬 `main` 및 `origin/main`은 모두 `a2e277e0ba463e044ce75c7e6af17c8a1e7af1ae`였다. 작업 트리는 깨끗했다. |
| 병합 이력 | PR #2가 위 SHA로 병합됐다. Docker 빌드 입력 수정 `5a107fb`와 비동기 프런트엔드 테스트 수정 `7d708f9`가 병합 이력에 있다. [PR #2](https://github.com/jllgame00/worldweaver/pull/2) |
| 최초 게시 | Actions 실행 `45969940615`에서 계약·테스트, Vite 빌드, 필수 검사, 이미지 빌드·스모크와 게시가 성공했다. 호스팅 pytest 329건, Vitest 48파일 236건이다. 실행의 Render 배포 작업은 건너뛰었다. [전체 실행](https://github.com/jllgame00/worldweaver/actions/runs/45969940615) |
| 이미지 | 태그 `sha-a2e277e0ba463e044ce75c7e6af17c8a1e7af1ae`의 게시 로그에서 digest `sha256:a39ee2c85c8271ee8aec5aaa12ffcd44ebdbcdf8e34ece08de490fe6f2356753`을 확인했다. 러너의 로컬 이미지 크기는 149,267,753바이트였다. [게시 로그](https://github.com/jllgame00/worldweaver/actions/runs/45969940615/job/140409542274) · [이미지 스모크 로그](https://github.com/jllgame00/worldweaver/actions/runs/45969940615/job/140409230323) |
| Render | 서비스 ID `srv-dc4kk0c9v7es73fbfv5g`에 초기 이미지를 수동 배포했다는 소유자 기록이 있다. 공개 HTTP의 전체 SHA는 확인했다. Render 내부 배포 ID와 런타임 이미지 digest는 공개 응답에서 확인할 수 없다. [공개 서비스](https://worldweaver-8mbz.onrender.com) |

## 초기 이미지의 공개 서비스 확인

2026-11-27 09:26 UTC에 기존 읽기 전용 스모크 명령과 추가 HTTPS GET으로 확인했다.

~~~powershell
.\.venv\Scripts\python.exe scripts/render_release.py smoke --origin https://worldweaver-8mbz.onrender.com --commit a2e277e0ba463e044ce75c7e6af17c8a1e7af1ae
~~~

- 스모크가 종료 코드 0과 `Healthy image a2e277e0ba463e044ce75c7e6af17c8a1e7af1ae`를 반환했다.
- `/health`는 `status=ok`, `version=1.0.0`, 일치하는 전체 SHA, `backendReady=true`, `frontendReady=true`, `executionMode=public-demo`, `providerMode=disabled`, `liveEnabled=false`, `persistence=browser-indexeddb`를 반환했다. [공개 health](https://worldweaver-8mbz.onrender.com/health)
- 홈페이지에서 참조한 엔트리 JS, React 런타임, 번들 런타임 및 CSS를 모두 받았다. Salt Census JSON의 `synthetic=true`와 SVG 응답을 확인했다. `/api/generation`은 `available=false`였다. [공개 예제 JSON](https://worldweaver-8mbz.onrender.com/examples/salt-census.json) · [공개 예제 지도](https://worldweaver-8mbz.onrender.com/examples/salt-census.svg)
- 기존 HTTPS 서비스는 명령 환경에서 접근 가능했다. 확인은 HTTP 스모크이며 브라우저 렌더링과 재배포 후 저장소 보존은 별도 확인 대상이다. 6B 마무리 중 실제 LLM 호출 및 크레딧 사용은 0이다.

## 로컬 회귀

pytest 329건과 Vitest 48파일 236건이 통과했다. Vite 빌드에 포함된 생성 타입 동기화와 엄격한 TypeScript, 정본·전송 스키마 5종, actionlint, `git diff --check`도 통과했다. pytest에서 기존 Starlette 사용 중단 경고 한 건이 나왔다.
