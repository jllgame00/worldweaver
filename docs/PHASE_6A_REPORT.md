# Phase 6A · 단일 이미지 릴리스 준비

**PARTIAL.** 시작 시 `feature/production-deployment`의 HEAD는 `c0559e2d130971b68e47bafd24d777da544ff8df`이고 작업 트리는 깨끗했다. GitHub에서 [PR #1](https://github.com/jllgame00/worldweaver/pull/1)의 실제 병합 SHA `a8648b9b71c9a54aadd16f64fc6ac9392493b8aa`와 [기존 PR CI 성공](https://github.com/jllgame00/worldweaver/actions/runs/45953195181)을 확인했다. 배포 브랜치는 이 병합본보다 9개 커밋 뒤였다. 이번 구현·회귀는 병합 SHA의 격리된 작업 사본에서 수행했다. 쓰기 가능한 소유자 Git 환경에서 기준을 fast-forward한 뒤 적용해야 한다.

| HW6 규칙 | RED | GREEN |
|---|---|---|
| 소재 접수 | `81bef2f` | `0a9cc29` |
| 언어와 정본 상태 | `16f8ae6` | `ae5979a` |
| 동시 저장 후 복원 거절 | `34aad6d` | `0dda171` |

여섯 SHA가 각각 병합본의 조상이며 원래 순서와 독립 커밋을 보존한다. 배포 브랜치의 시작 HEAD에는 포함되지 않았다.

### 구현과 검증

- Docker Hub가 반환한 digest로 Node 24.13.0, Python 3.13.12 베이스 이미지를 고정했다. npm lockfile과 서버의 고정 런타임 목록을 사용한다. final image는 UID/GID 65532, 단일 Uvicorn 프로세스, Render PORT, 읽기 전용 패키지 SHA를 사용한다.
- 배포용 파일 마커가 있으면 로컬 모드 전환을 거절한다. 공개 모드에서는 공급자 설정을 읽거나 어댑터를 생성하기 전에 차단한다. 정본 검증과 로컬 편집은 유지한다. 같은 origin에서 정적 파일, 공개 예제, SPA 탐색과 API를 구분한다. 운영 화면은 조회한 서비스의 전체 SHA를 표시한다.
- 테스트와 프런트엔드 빌드를 통과해야 기존 필수 검사가 성공한다. 이후 AMD64 이미지 빌드 → 컨테이너 스모크 → 같은 이미지 게시 → digest 배포 → Render 배포 ID·실제 SHA·서비스 확인으로 이어진다. PR은 게시·배포 대상에서 제외하며 두 저장소 스위치 기본값은 꺼짐이다.
- 이전 건강한 배포 ID·SHA·digest를 기록한다. 새 배포에 실패하면 최신 이벤트가 자신의 배포일 때만 이전 ID로 롤백을 요청한다. 롤백의 새 배포 ID, 이전 digest와 건강한 SHA를 확인하고도 원래 작업을 실패로 남긴다. 서로 다른 Render 서비스와 health URL은 거절한다.
- 현재 개발 머신의 Docker CLI 29.6.1은 Linux Engine named pipe에 연결할 수 없었다. 이미지 빌드·실행·크기·종료 신호, Docker Hub 게시, 실서비스 롤백과 6A 호스팅 CI 증거는 미확인이다. 이전 PR CI 성공은 Phase 5의 증거다.
- 키 형식·개인 키 머리글에 대한 값 비출력 검사에서 병합본 추적 파일과 컴파일한 정적 자산의 일치 건수는 0이었다. 빌드 문맥은 허용 목록으로 구성했고 공개 이미지는 자격을 주입하지 않는다. 실제 ChatKHU·OpenAI 요청, 크레딧, 외부 자원 생성은 0이다.

| 로컬 검사 | 결과 |
|---|---|
| pytest 전체 | 329 통과. 기존 Starlette 사용 중단 경고 1건 |
| Vitest 전체 | 48파일 236 통과 |
| 원래 5B·5C·5D | 기존 프런트엔드 23건과 새 운영 SHA 1건 통과. 5B API 4건을 포함한 백엔드 집중 검사 57건 통과 |
| 계약·빌드 | 정본 Draft 4 및 전송 스키마 5종, strict TypeScript, 생성 타입, Vite 빌드, actionlint 통과. 초기 JS gzip 합계 약 186.4 kB |
| 통합 스모크 | 격리된 실제 Uvicorn에서 빌드한 홈페이지, JS, 공개 예제, 생성 차단 설정, 테스트용 전체 SHA를 HTTP로 확인 후 서버 종료 |
| 저장 | 기존 IndexedDB·복원·승인 회귀 통과. 실제 배포 도메인의 재배포 전후 지속성과 네이티브 화면 확인은 소유자 단계 |

릴리스 작업은 브라우저 데이터를 서버로 옮기지 않는다. localhost의 자료를 HTTPS 주소로 옮길 때는 JSON 백업을 쓴다. [6B 계정·서비스 설정](DEPLOYMENT_GUIDE.md) · [6C·6D 증거 캠페인](DEPLOYMENT_EVIDENCE_PLAN.md)
