# Phase 6B · 최초 공개 릴리스 검증

**초기 이미지 게시와 수동 배포 검증 통과. 첫 자동 Render 배포는 후속 main 릴리스에서 확인한다.**

## 기준과 게시 근거

| 항목 | 확인 결과 |
|---|---|
| 로컬 기준 | `feature/release-verification`의 시작 HEAD와 로컬 `main` 및 `origin/main`은 모두 `a2e277e0ba463e044ce75c7e6af17c8a1e7af1ae`였다. 작업 트리는 깨끗했다. |
| 병합 이력 | PR #2가 위 SHA로 병합됐다. Docker 빌드 입력 수정 `5a107fb`와 비동기 프런트엔드 테스트 수정 `7d708f9`가 병합 이력에 있다. [PR #2](https://github.com/jllgame00/worldweaver/pull/2) |
| 최초 게시 | Actions 실행 `45969940615`에서 계약·테스트, Vite 빌드, 필수 검사, 이미지 빌드·스모크와 게시가 성공했다. 호스팅 pytest 329건, Vitest 48파일 236건이다. 실행의 Render 배포 작업은 건너뛰었다. [전체 실행](https://github.com/jllgame00/worldweaver/actions/runs/45969940615) |
| 이미지 | 태그 `sha-a2e277e0ba463e044ce75c7e6af17c8a1e7af1ae`의 게시 로그에서 digest `sha256:a39ee2c85c8271ee8aec5aaa12ffcd44ebdbcdf8e34ece08de490fe6f2356753`을 확인했다. 러너의 로컬 이미지 크기는 149,267,753바이트였다. [게시 로그](https://github.com/jllgame00/worldweaver/actions/runs/45969940615/job/140409542274) · [이미지 스모크 로그](https://github.com/jllgame00/worldweaver/actions/runs/45969940615/job/140409230323) |
| Render | 서비스 ID `srv-dc4kk0c9v7es73fbfv5g`에 초기 이미지를 수동 배포했다는 소유자 기록이 있다. 공개 HTTP의 전체 SHA는 확인했다. Render 내부 배포 ID와 런타임 이미지 digest는 공개 응답에서 확인할 수 없다. [공개 서비스](https://worldweaver-8mbz.onrender.com) |

## 실제 공개 서비스 확인

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

## 첫 자동 배포를 확인하는 소유자 절차

1. 이 브랜치의 문서 변경을 검토하고 `docs(release): record initial production deployment and verification plan`으로 커밋한다. 브랜치를 게시하고 `main` 대상 PR을 열어 필수 검사와 이미지 스모크를 확인한다.
2. 병합 전에 소유자가 설정한 `PUBLICATION_ENABLED=true`, `DEPLOYMENT_ENABLED=true`와 GitHub `production` 환경의 운영 대상, 필요한 승인 조건을 확인한다. 자격증명 값은 캡처와 보고서에서 제외한다. [설정 위치와 이름](DEPLOYMENT_GUIDE.md)
3. 승인 후 병합하고 PR 실행 대신 **병합으로 시작된 main push 실행**을 연다. 새 전체 SHA로 필수 검사, 이미지 스모크, `Publish verified image`, `Deploy digest and verify release` 모두 성공했는지 확인한다. 게시 digest, 컨트롤러가 확인한 이전 건강한 SHA, 새 Render 배포 ID 및 최종 검증 SHA를 기록한다.
4. 아래 `$releaseSha`에 Actions 실행의 전체 SHA를 넣어 재확인한다. 운영 주소와 기존 예제 URL을 연다. 이때의 정확한 실행 URL과 Render 이벤트가 첫 자동 배포 근거다.

~~~powershell
$releaseSha = '<main push Actions 실행의 전체 SHA>'
.\.venv\Scripts\python.exe scripts/render_release.py smoke --origin https://worldweaver-8mbz.onrender.com --commit $releaseSha
~~~

게시·배포 활성화와 Render 자격 구성은 소유자 보고다. 자격의 유효성, 자동 배포, 브라우저 세션의 저장 보존과 실패 차단은 각각 실제 후속 실행에서 판정한다. 의도적 테스트 실패와 새 정상 커밋 복구는 전용 증거 서비스에서 실행하는 것이 기본 경로다. [6C 차단과 6D 복구 절차](DEPLOYMENT_EVIDENCE_PLAN.md)
