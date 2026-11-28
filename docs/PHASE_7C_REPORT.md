# Phase 7C · 보안 의존성과 최종 릴리스 검토

**PHASE_7C_READY_FOR_FINAL_RELEASE** · 로컬 릴리스 후보의 보안 GREEN과 필수 회귀를 확인했다. 병합은 최종 PR 리비전의 필수 CI와 Linux 컨테이너 스모크 성공 후 진행한다. 현재 공개 배포는 복구 C다.

오너의 테스트 전용 RED `2b2fecffd5bab11b7672c1a3c501f3f4b091262e`에서 의도한 실패를 재현한 뒤 공개 웹 의존성 잠금을 수정했다. 아래에는 R1의 실제 변경과 검사 결과, 앞선 7C에서 확보한 RED와 조합 선정 근거를 함께 보관한다. [전체 발견표](PHASE_7_FINDINGS.md)

## R1 · 배포 잠금 변경

- RED의 부모는 `91b0eeb2e803f77a0103cc369c91f385ebddbee2`이며 유일한 변경 파일은 `backend/tests/test_public_release.py`다. 기존 가상 환경과 잠금이 일치하는 상태에서 `test_public_runtime_pins_patched_web_dependencies`가 23행의 `Version('0.46.2') >= Version('1.3.1')`에서 실패했다(종료 1).
- 직접 요구사항 `backend/requirements.in`의 FastAPI를 `0.163.2`로 올렸다. 배포용 `backend/requirements-runtime.txt`에는 FastAPI `0.163.2`, Starlette `1.3.1`, annotated-doc `0.0.7`, opentelemetry-api `1.45.2`를 고정했다. 네 버전 모두 PyPI에서 철회되지 않은 wheel과 활성 권고 0건을 재확인했다. 직접 요구사항과 플랫폼별 전이 의존성은 아래의 검토 근거를 따른다.
- 로컬 `scripts/setup.ps1`과 Windows Actions는 같은 `backend/requirements.txt`를 설치하며 첫 줄이 런타임 잠금을 포함한다. Linux Dockerfile은 그 런타임 잠금을 직접 복사해 `--no-deps`로 설치하고 `pip check`를 실행한다. 이 연결은 파일과 플랫폼별 패키지 메타데이터로 확인했다. 최종 PR SHA에 대한 실제 CI와 Linux 이미지의 검증 결과는 병합 전에 확보한다.

Starlette `1.3.1`은 이번 후보의 **누적 보안 하한**이다. 기존 핀에 보고된 각 권고의 최초 수정 릴리스는 다음과 같다.

| Starlette 권고 | 최초 수정 버전 |
|---|---|
| [대용량 multipart 처리](https://github.com/Kludex/starlette/security/advisories/GHSA-2c2j-9gv5-cj73) | `0.47.2` |
| [FileResponse Range 처리 · CVE-2025-62727](https://github.com/Kludex/starlette/security/advisories/GHSA-7f5h-v6xp-fcq8) | `0.49.1` |
| [Host 헤더와 경로](https://github.com/Kludex/starlette/security/advisories/GHSA-86qp-5c8j-p5mr) | `1.0.1` |
| [Windows StaticFiles](https://github.com/Kludex/starlette/security/advisories/GHSA-wqp7-x3pw-xc5r) | `1.1.0` |
| [HTTPEndpoint 메서드 선택](https://github.com/Kludex/starlette/security/advisories/GHSA-x746-7m8f-x49c) | `1.1.0` |
| [요청 URL 호스트 구성](https://github.com/Kludex/starlette/security/advisories/GHSA-jp82-jpqv-5vv3) | `1.3.0` |
| [URL 인코딩 폼 한도](https://github.com/Kludex/starlette/security/advisories/GHSA-82w8-qh3p-5jfq) | `1.3.1` |

### R1 검증과 독립 검토

| 검사 | 수정된 작업 트리에서 관측한 결과 |
|---|---|
| 기존 RED | `./.venv/Scripts/python.exe -m pytest -q backend/tests/test_public_release.py::test_public_runtime_pins_patched_web_dependencies`는 수정 전 1건 실패(종료 1), 수정 후 같은 단언 1건 통과(종료 0). RED 커밋 이후 테스트 파일 diff는 없다. |
| 설치·의존성 | 개발용 `.venv`에 실제 `backend/requirements.txt`를 PyPI에서 해석·설치했다. 작업 디렉터리에 임시 파일을 두는 기존 로컬 pip 실행기를 사용했다. `python -m pip check` 통과. 독립 환경에서도 Windows 설치 버전 34개가 최종 잠금과 일치했다. |
| 공개·로컬 API | `backend/tests/test_public_release.py`, `test_live_provider.py`, `test_chatkhu_provider.py`, `test_scenario_reliability.py` 집중 검사 74건 통과. 공개 모드 health·정상 HEAD/단일 Range·생성 차단, 로컬 공급자 API의 **모의 전송**을 검증했다. |
| 전체 백엔드 | `./.venv/Scripts/python.exe -m pytest -q` **331건 통과**, 8.46초. Starlette TestClient의 httpx 사용 및 AnyIO 별칭에 대한 폐기 예정 경고 2건이 남는다. |
| 전체 프런트엔드 | `npm.cmd --prefix frontend test` 기본 구성으로 2회 모두 **48파일 242건 통과**(81.60초, 81.70초). 시간 초과 0건. `npm.cmd --prefix frontend test -- src/verificationWorkspace.test.tsx -t 'preserves both saved checks'`에서 원래 7B 회귀도 통과했다(1건 통과, 이름 필터 제외 2건). |
| 타입·빌드·계약 | `npm.cmd --prefix frontend run typecheck`와 `run build` 모두 종료 0. 생성 타입, 엄격한 TypeScript, Vite 174개 모듈 빌드, CI 본문의 정본 Draft 4 및 전송 Draft 2020-12 스키마 5개, actionlint 1.7.12 통과. |
| 실제 빌드 자산 | 합성 릴리스 ID를 주입한 인프로세스 TestClient에서 공개 모드 health, 빌드 HTML, 선언된 JS·CSS 4개, 예제 SVG·JSON의 HTTP 200을 확인했다. 자산 본문은 로컬 빌드 파일과 일치했다. |

`/root/security`는 오너 RED 대비 실제 두 요구사항 파일을 읽고 공식 권고·PyPI 배포물을 재조회했다. Python 3.13에서 직접 요구사항 8개가 잠금과 일치했고 Linux 런타임/개발 28/33개, Windows 29/34개의 wheel·환경 마커·필수 의존성을 확인했다. 독립 환경에서 커밋된 공개 릴리스 테스트 6건이 모두 통과했다. `/root/devops`는 같은 diff에서 로컬 설정·CI·Docker 설치 경로와 게시·배포 게이트를 추적하고 공개 릴리스·롤아웃 검사 18건을 통과시켰다. 두 검토자가 보고한 추가 차단 사항은 없었다.

DevOps 검토자는 main의 필수 검사 두 개, Docker Hub의 실제 SHA 태그 불변 규칙, 공개 스모크의 C 전체 SHA를 재확인했다. Linux Docker 엔진 소켓이 없어 로컬 이미지 실행은 보류했다. 최종 PR의 호스팅 이미지 빌드·스모크가 병합 조건이다. [main](https://api.github.com/repos/jllgame00/worldweaver/branches/main) · [Docker Hub](https://hub.docker.com/v2/repositories/surlworl/worldweaver/)

## 7C 당시 보안 RED와 배포 범위

시작 시 `feature/final-agent-review`의 작업 트리는 깨끗했고 HEAD와 원격 추적 브랜치는 `91b0eeb2e803f77a0103cc369c91f385ebddbee2`였다. 7B RED는 `2c12785ffe18794cfe23ef1b66ffc83724c67218`, 직접 자식 GREEN은 `b70f1ad353bc93b094285b6e224b9459518ab8f1`이다. RED에는 테스트 하나, GREEN에는 구현 파일 두 개와 보충 테스트 파일 하나가 들어 있다. UI 동기화는 별도 커밋 `1ba88520fe3c0a0c345e58d8b021c8af94f2bdd3`이다. 통제 실패 테스트 `scripts/test_controlled_deployment_gate.py`는 Git 트리와 디스크에서 모두 제거된 상태다.

Dockerfile은 `backend/requirements-runtime.txt`를 `--no-deps`로 설치한 후 `pip check`를 실행한다. Starlette의 파일 응답은 `backend/app/main.py`의 SPA 진입점에서 직접 사용되며, `/assets`의 `BuiltAssets`와 `/examples`의 `StaticFiles`에서도 사용된다. CVE-2025-62727의 범위는 `>=0.39.0,<=0.49.0`, 최초 수정은 `0.49.1`이다. Linux 운영 경로에 해당하는 의존성과 호출자를 확인했다. 운영 프록시의 완화 효과는 미검증이다. [파일 응답 권고](https://github.com/Kludex/starlette/security/advisories/GHSA-7f5h-v6xp-fcq8)

| 구성 요소 | 2026-11-28 조회 결과와 판단 |
|---|---|
| Starlette | `0.46.2`에 해당하는 고유 권고 7건. 후속 수정은 대용량 multipart 처리 `0.47.2`, Host/경로 `1.0.1`, Windows 정적 파일 및 HTTPEndpoint `1.1.0`, URL 호스트 구성 `1.3.0`, URL 인코딩 폼 한도 `1.3.1`이다. 앱은 `request.url.path`를 사용한다. Windows 정적 파일 위험은 Windows 실행에 해당하며 운영 이미지는 Linux다. 현재 API는 JSON을 사용하고 HTTPEndpoint·폼 라우트는 확인되지 않았다. 후보 하한은 `1.3.1`이다. [버전별 PyPI 기록](https://pypi.org/pypi/starlette/0.46.2/json) · [유지보수자 권고 목록](https://github.com/Kludex/starlette/security/advisories) |
| FastAPI | `0.115.12`는 Starlette를 `<0.47.0`으로 제한한다. FastAPI 자체의 새 권고 범위는 `>=0.123.2,<0.163.2`다. 후보 `0.163.2`는 Starlette `>=0.46.0`과 Python `>=3.11`을 허용한다. 저장소 기준은 Python 3.13이다. 런타임 잠금에 추가할 직접 의존성으로 `annotated-doc`와 `opentelemetry-api`가 있다. [FastAPI 권고](https://github.com/fastapi/fastapi/security/advisories/GHSA-f56c-v883-vx8r) · [후보 메타데이터](https://pypi.org/pypi/fastapi/0.163.2/json) |
| 기타 Python 핀 | 보안 검토자가 런타임·개발 핀 32개를 PyPI의 정확한 설치 버전과 대조했다. `python-dotenv 1.1.1`의 파일 쓰기 권고는 `1.2.2`에서 해결됐다. 앱은 `dotenv_values`로 읽으며 해당 쓰기 API는 사용하지 않는다. `pytest 8.4.1`의 UNIX 임시 경로 권고는 `9.0.3`에서 해결됐다. 테스트는 Windows CI에서 실행하고 운영 이미지에는 pytest가 없다. 두 항목은 별도 유지보수 대상으로 기록한다. 이 세 패키지 외의 29개 핀에서는 버전별 PyPI 조회에 활성 항목이 없었다. [dotenv 권고](https://github.com/theskumar/python-dotenv/security/advisories/GHSA-mf9w-mj56-hr94) · [pytest 권고](https://github.com/advisories/GHSA-6w46-j5rx-g56g) |
| 프런트엔드 | 공개 npm 레지스트리에 `npm.cmd --prefix frontend audit --json`을 실행해 종료 1, moderate 2건을 받았다. Ajv `8.17.1`의 권고 한 건과 이를 참조하는 `ajv-draft-04`다. 권고의 조건인 `$data` 사용은 앱의 고정 스키마 검증에서 확인되지 않았다. `8.18.0`부터의 호환 수정은 별도 회귀로 다룬다. [권고](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6) |

새 테스트는 배포 잠금의 두 핀이 테스트 프로세스에 설치된 버전과 일치하는지 확인한 다음, Starlette 하한 및 FastAPI의 확인된 영향 범위를 검사한다. 로컬 `TestClient`는 10바이트 합성 JS의 HEAD와 3바이트 단일 구간 응답(206)을 대조한다. 두 테스트 모두 오프라인으로 동작한다.

### 독립 보안 검토와 격리 후보

`/root/security`가 실제 테스트 diff와 유지보수자 권고를 대조했다. 안정 릴리스에 대해 하한·영향 구간 및 정상 파일 응답 대조가 적절하다고 판단했다. 향후 사전 릴리스를 의도적으로 채택하면 범위 비교도 다시 검토해야 한다. 현재 잠금과 후보는 모두 안정 버전이다. 현재 FastAPI부터 `0.123.2` 미만의 사용 가능 안정 버전 27개는 모두 Starlette 상한이 낮다. 이후 FastAPI 권고 구간을 지나 처음 선택할 수 있는 안정 버전이 `0.163.2`다.

Windows Python 3.13의 별도 venv에 설치해 확인한 차이는 다음 네 핀이다. 다른 핀은 기존 값을 사용했다. `annotated-doc`은 resolver가 고른 버전이며 실제 검증한 후보를 명시했다. OpenTelemetry의 선언 하한 `1.44.0`에는 후속 권고 2건이 남아 있었고 `1.45.1`에도 1건이 남아 있었다. [1.44.0 권고 목록](https://pypi.org/pypi/opentelemetry-api/1.44.0/json) · [1.45.2 메타데이터](https://pypi.org/pypi/opentelemetry-api/1.45.2/json)

```text
fastapi==0.163.2
starlette==1.3.1
annotated-doc==0.0.7
opentelemetry-api==1.45.2
```

처음 venv 생성·pip 설치 시 Windows 임시 디렉터리 권한 오류가 발생했다. 검토자는 무시된 작업 디렉터리 안에서 임시 경로를 분리해 해결했다. 새 환경의 resolver 설치와 `python -m pip check`는 성공했다. 휠 메타데이터·플랫폼 조건으로 확인한 런타임 클로저는 Linux 28개·Windows 29개, 개발 포함 Linux 33개·Windows 34개였다. Linux 이미지에서의 실제 설치·실행은 호스팅 게이트에 남아 있다.

후보 의존성으로 `git archive HEAD`의 기존 329건이 모두 통과했다(7.85초). 작업 트리의 공개 테스트 중 배포 잠금 비교만 제외한 5건도 통과했다. 후보에서는 TestClient의 httpx 폐기 예정 경고와 기존 AnyIO 별칭 경고가 발생했고, 아카이브 회귀에는 임시 pytest 캐시 권한 경고가 하나 더 있었다. 보안 구현 diff에 대한 최종 검토는 소유자 RED 커밋 뒤에 수행한다.

## 7C 당시 실행 근거

| 검사 | 결과 |
|---|---|
| 기존 잠금 기준 `./.venv/Scripts/python.exe -m pytest -q` 및 `-m pip check` | 테스트 추가 전 329건 통과, 기존 Starlette TestClient 경고 1건. 설치 의존성 일관성 검사 통과. |
| `./.venv/Scripts/python.exe -m pytest -q backend/tests/test_public_release.py` | 기존 4건 통과. 새 테스트 추가 후 **5건 통과, 1건 실패**. `test_public_runtime_pins_patched_web_dependencies`에서 설치·잠금 비교가 통과한 뒤 `Version('0.46.2') >= Version('1.3.1')`이 실패했다. 정상 정적 파일, health 및 공개 모드의 5개 생성 경로 차단 대조는 통과했다. |
| 새 RED 포함 전체 pytest | **330건 통과, 같은 1건 실패**, 기존 경고 1건. 해당 실행은 보안 GREEN으로 집계할 수 없다. |
| 기본 Vitest `npm.cmd --prefix frontend test` | 48파일 242건을 2회 연속 통과(81.52초, 81.24초). 타임아웃·워커 설정을 유지했다. 원래 7B 유실 테스트를 이름으로 골라 다시 실행해 1건 통과(3.16초). |
| 저장 경계 | `npm.cmd --prefix frontend test -- src/storage.test.ts src/atlasImport.test.ts src/projectRestore.test.tsx src/projectRestoreEdges.test.tsx src/publicExample.test.tsx src/scenarioApproval.test.tsx`로 가져오기·IndexedDB·복원·경쟁 저장 등 6파일 42건 통과. |
| 생성 타입·엄격한 TypeScript 및 Vite | `npm.cmd --prefix frontend run typecheck`와 `npm.cmd --prefix frontend run build` 모두 성공. 174개 모듈 변환. |
| 스키마·워크플로·Git | CI의 정본 Draft 4와 전송 스키마 5개, actionlint 1.7.12 및 `git diff --check` 통과. |

## 7C 당시 배포와 독립 검토

- 네이티브 `/root/devops`가 C와 현재 HEAD의 실제 워크플로·Dockerfile·릴리스 컨트롤러를 대조했다. 세 파일에 변경이 없었고 릴리스 테스트 12건이 통과했다. 보호된 main은 `50e2a7c02b9c6b7472440850af2617afffcbbf53`이며 필수 검사는 `WORLDWEAVER required`와 `Build and smoke-test release image`다. 보호 상세 관리자 API는 401이었다. 후보 SHA의 호스팅 체크와 이 브랜치의 열린 PR은 관찰되지 않았다. [main](https://api.github.com/repos/jllgame00/worldweaver/branches/main)
- Docker Hub 공개 API에서 `immutable_tags_settings.enabled=true` 및 `^sha-[0-9a-f]{40}$`를 확인했다. 규칙은 워크플로의 `sha-$GITHUB_SHA`와 일치한다. 설정 변경 시각과 실제 덮어쓰기 시도는 관찰하지 않았다. A와 C의 태그 digest는 기존 증거와 일치했고 B 태그 조회는 404였다. C에서 빌드와 게시가 사용한 아티팩트 ID는 `15247241489`다. [레지스트리](https://hub.docker.com/v2/repositories/surlworl/worldweaver/) · [C 이미지 검증](https://github.com/jllgame00/worldweaver/actions/runs/46104696745/job/140855448316) · [동일 이미지 게시](https://github.com/jllgame00/worldweaver/actions/runs/46104696745/job/140855579376)
- DevOps 검토자의 첫 직접 health 조회는 시간 초과였다. 재시도와 코디네이터의 기존 스모크 스크립트는 모두 종료 0과 정확한 C SHA를 반환했다. 로컬 Docker CLI는 있으나 Linux 엔진 소켓이 없어 이미지 빌드·스모크를 실행할 수 없었다. 최종 PR SHA에서 호스팅 컨테이너 검사를 확인해야 한다. [공개 상태](https://worldweaver-8mbz.onrender.com/health)
- DEV-01의 최신 main 확인과 배포 사이 시간차, DEV-02의 일부 정적 자산 스모크 누락은 독립 회귀 대상이다. DEV-04의 빈 202 응답 처리는 후순위다. B-03은 로컬 LLM 응답 검증, B-02는 로컬 한도 확인 계약에 남아 있다. 7C에서 새 배포 차단 결함으로 승격할 증거는 발견하지 않았다. [독립 감사 판정](PHASE_7_FINDINGS.md)

## HW6 두 쪽 보고서의 증거 색인

| 지면 · 항목 | 제출자가 인용할 증거와 한계 |
|---|---|
| 1쪽 · Product | 합성 Salt Census 사본을 열고 편집·저장·재열기·내보내는 흐름. README에 설치·시작 절차가 있다. 실제 소유자 프로젝트의 저장 전후 동일성은 별도 관찰이 필요하다. [README](../README.md) · [공개 예제 회귀](../frontend/src/publicExample.test.tsx) |
| 1쪽 · TDD | PR #1에서 5B `81bef2ff5a867cfb1ce09962bec74e54da624ee1` → `0a9cc291a1a8df71b6a52542d3a8505db92e2272`, 5C `16f8ae67550cd342627c12cb7615b31a319dabb8` → `ae5979a362ce5e46b9a9192b07f1ba7c9eaaa422`, 5D `34aad6d7552dc033e8fb945a6dcaa7e9736998ce` → `0dda171c636a4291f7efabd01863d4499248754f`의 직접 부모 관계를 확인했다. 7B는 본문 첫 절의 별도 데이터 유실 사례다. [TDD 원장](TDD_EVIDENCE.md) · [PR #1](https://github.com/jllgame00/worldweaver/pull/1) |
| 1쪽 · LLM | 소유자는 ChatKHU의 실제 호출과 출력 사용량을 보고했다. 기존 기록에는 그래프 검사에서 거절된 응답과 원문 보존이 있다. 성공 결과 채택의 독립 실연동 증거는 미확보다. 서버 어댑터·실패·대체 경로는 모의 테스트에서 검증했다. 공개 데모는 라이브 생성을 차단한다. [실행 근거](PHASE_2_2_REPORT.md) · [과제 대응표](HW6_REQUIREMENTS_MATRIX.md) |
| 2쪽 · DevOps | A는 6개 작업 성공, B는 실제 pytest 실패로 4개 후속 작업 생략, C는 6개 성공 후 동일 이미지 digest 배포다. C의 Render ID는 `dep-dc550rs9v7es73977udg`, digest는 `sha256:0e88200d9be8745f8ab9c4d7470c4d50388680532c95fdadfa28a860027af8c7`다. [A](https://github.com/jllgame00/worldweaver/actions/runs/46019534340) · [B](https://github.com/jllgame00/worldweaver/actions/runs/46102057956) · [C](https://github.com/jllgame00/worldweaver/actions/runs/46104696745) |
| 2쪽 · Agent | 7A 네이티브 검토자 `/root/correctness`, `/root/security`, `/root/devops`가 각각 독립 보고서를 남겼다. A-01의 실제 발견 → RED → GREEN과 정확성 재검토를 연결한다. 7C에서 보안·배포 검토자를 다시 실행했다. [7A 감사](PHASE_7A_REPORT.md) · [7B 수정](PHASE_7B_REPORT.md) |
| 2쪽 · GitHub | 기능 브랜치, 일반 병합 PR #1–5 및 실제 필수 검사 이력이 있다. 최종 PR 번호·후보 Actions URL·병합 SHA는 생성된 뒤 채운다. [PR #1 CI](https://github.com/jllgame00/worldweaver/actions/runs/45953195181) · [복구 PR #5](https://github.com/jllgame00/worldweaver/pull/5) |

## 오너 커밋 범위

| 순서 | 권장 메시지 | 포함 파일 |
|---|---|---|
| 1 · 보안 GREEN | `fix(security): pin compatible patched FastAPI and Starlette runtimes` | `backend/requirements.in`, `backend/requirements-runtime.txt` |
| 2 · 문서 | `docs(release): index HW6 evidence and record release gates` | `docs/PHASE_7C_REPORT.md`, `docs/PHASE_7_FINDINGS.md`, `docs/TDD_EVIDENCE.md`, `docs/HW6_REQUIREMENTS_MATRIX.md` |

이 여섯 파일이 전체 작업 트리 변경이다. 오너가 GREEN 커밋을 만든 뒤 부모가 보안 RED `2b2fecffd5bab11b7672c1a3c501f3f4b091262e`인지, 변경 파일이 첫 행의 두 개인지 확인한다. 실제 GREEN SHA를 원장과 PR에 기록한 다음 문서 커밋을 만든다.

## 최종 PR

**제목**　WORLDWEAVER · 검증 기록 유실 수정과 공개 웹 의존성 보안 패치

**본문**

> 시나리오 응답이 늦게 도착해도 먼저 저장한 Quick Check와 실행 ID를 유지합니다. 이 수정은 RED `2c12785`와 GREEN `b70f1ad`에서 확인할 수 있습니다.
>
> 공개 파일 제공 경로의 보안 권고를 반영해 FastAPI와 Starlette의 배포 잠금을 갱신했습니다. 오너 RED `2b2fecf`에서 실패한 단언이 수정 후 통과합니다. 전체 백엔드 331건과 기본 프런트엔드 242건(2회)이 통과했습니다. 독립 보안·DevOps 검토 결과와 HW6 증거 색인은 `docs/PHASE_7C_REPORT.md`에 있습니다.
>
> 병합 조건은 최종 PR 리비전의 `WORLDWEAVER required`와 `Build and smoke-test release image` 성공입니다. 로컬 Linux 엔진을 사용할 수 없어 컨테이너 실행 증거는 호스팅 작업에서 수집합니다.

## 병합 및 배포 후 확인

1. base `main`, head `feature/final-agent-review`로 PR을 만든다. PR에 오너 GREEN SHA와 최신 head 기준 검사 링크를 기록한다. **두 필수 검사와 적용되는 리뷰가 모두 통과한 후** 일반 merge commit으로 병합한다. 병합 전 소유자가 같은 브라우저 프로필·HTTPS origin에 있는 기존 예제의 ID·리비전·검증 기록과 JSON 백업을 별도 보관한다.
2. main push에서 6개 작업의 성공, 이미지 아티팩트 ID의 빌드·게시 일치, `sha-<병합 SHA>`의 digest, 그 digest에 대한 Render 배포 ID와 완료 상태를 기록한다. `./.venv/Scripts/python.exe scripts/render_release.py smoke --origin https://worldweaver-8mbz.onrender.com --commit <병합 SHA>`로 확인한다. CSS·모듈 프리로드·예제 SVG도 일반 GET으로 확인한다. 실패 시 배포 로그와 마지막 정상 배포를 확인한다. [배포 가이드](DEPLOYMENT_GUIDE.md)
3. 배포 뒤 같은 프로필·주소에서 새로고침하고 JSON을 가져오기 전에 기존 프로젝트를 열어 사전 기록과 대조한다. 이 비교와 오너 확인을 받아야 실제 IndexedDB 보존을 보고할 수 있다. [비교 항목](DEPLOYMENT_EVIDENCE_PLAN.md)
