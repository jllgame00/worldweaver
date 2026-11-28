# Agent B · 보안, 개인정보, LLM 신뢰성 독립 감사

실행 식별자는 `/root/security`, 검토 기준은 `50e2a7c02b9c6b7472440850af2617afffcbbf53`이다. 추적 파일을 읽기 전용으로 검토했다. 재현에는 공개 합성 프로젝트, 인프로세스 `TestClient`, `httpx.MockTransport`를 사용했다.

## B-01 · High · 공개 정적 파일 경로가 영향받는 Starlette 버전에 고정됨

- 근거 파일은 `backend/requirements-runtime.txt:9,24`, `Dockerfile:18–22,24`, `backend/app/main.py:145–148,342–350`, `backend/app/release.py:47–51`이다.
- 공개 이미지가 설치하는 Starlette `0.46.2`는 `FileResponse`에서 과도한 CPU 사용이 발생할 수 있는 공개 권고의 영향 범위에 포함된다. `/assets`, `/examples`와 SPA 진입 경로가 해당 정적 응답 구현을 사용한다. [Starlette 유지보수자 권고](https://github.com/Kludex/starlette/security/advisories/GHSA-7f5h-v6xp-fcq8)
- 로컬 배포 패키지 메타데이터는 FastAPI `0.115.12`, Starlette `0.46.2`를 확인했다. 현재 FastAPI가 요구하는 `starlette>=0.40.0,<0.47.0`에는 이 권고의 최초 수정 버전 `0.49.1`이 들어가지 않는다.
- 공개 서비스 가용성이 영향을 받을 수 있다. 고정 버전과 애플리케이션 도달 경로의 증거는 확실하다. Render 프록시에서 전달되는 조건과 운영 영향은 미검증이다. 운영 부하 검사는 수행하지 않았다.
- 호환되는 FastAPI와 Starlette 고정 버전을 함께 선정한다. RED는 배포용 의존성 목록 또는 설치 버전에서 영향 범위를 허용하지 않는 정책 테스트로 준비할 수 있다. GREEN에서는 호환성 검사, 일반 정적 파일 요청, 공개 데모 차단, 컨테이너 스모크를 수행한다.

## B-02 · Medium · 로컬 시나리오 생성에서 출력 한도 확인값 생략이 허용됨

- 근거 파일은 `backend/app/main.py:234–245`, `frontend/src/ScenarioStudio.tsx:278–279,582–583`, `docs/AGENT_WORKFLOW.md:58`, `backend/tests/test_scenario_reliability.py:33–53`이다.
- 라이브 UI는 표시한 출력 한도를 생성 요청에 실어 보내며 서버는 낮은 이전 값과 불일치하면 차단한다. 서버는 확인값이 빠지면 현재 서버 한도로 요청을 보낸다. 로컬 통합 클라이언트가 오래된 요청 형식을 사용하면 표시한 비용 한도를 확인하지 않은 상태에서 AI 요청이 진행될 수 있다.
- 합성 설정의 한도는 16,000이다. 확인값 생략은 모의 호출 1회에 16,000을 전달했다. 이전 값 6,000은 HTTP 409와 호출 0회였다. 일치하는 16,000은 모의 호출 1회를 허용했다.
- 재현 신뢰도는 높다. 공개 데모는 이 분기 전에 차단된다. 기존 실패 안내 테스트 일부가 생략을 허용하는 호출 방식을 쓰므로 로컬 요청 계약을 확정할 때 기존 호출자 영향도 검토해야 한다.
- 표시된 한도와 라이브 요청을 결합하는 계약을 적용한다면 누락과 불일치에서 HTTP 409와 공급자 호출 0회를 단언한다. 기존 성공·오류 안내 테스트는 해당 시나리오에 필요한 확인값을 명시하고 기존 단언을 유지한다.

## B-03 · Medium · 완료된 Responses 봉투 안의 미완료 메시지가 후보로 반환됨

- 근거 파일은 `backend/app/openai_provider.py:203–217`, `backend/app/chatkhu_provider.py:27–38`, `backend/tests/test_live_provider.py:80–129`이다. 설치된 공식 SDK의 `openai/types/responses/response_output_message.py:28`은 메시지 상태를 `in_progress`, `completed`, `incomplete`로 구분한다.
- Responses 봉투가 `completed`이고 출력 메시지가 `incomplete`여도 유효한 후보 JSON이 들어 있으면 현재 코드는 정상 후보를 반환한다. 이 경로는 OpenAI Responses와 ChatKHU Responses가 공유한다.
- 모의 응답에서 봉투·메시지 모두 완료는 HTTP 200과 후보 3건이었다. 봉투 완료·메시지 미완료도 HTTP 200과 후보 3건이었다. 봉투 미완료는 HTTP 502와 `provider_incomplete`, 후보 0건이었다. 합성 사용자 프로젝트는 변경되지 않았다.
- 서로 다른 상태를 처리하는 방식은 반복 재현했다. 실제 공급자가 상태 불일치를 얼마나 자주 보내는지는 미확인이다. 해당 상태가 발생하면 설계자에게 미완료 출력이 정상 제안으로 표시된다.
- `message` 출력 상태를 확인하고 미완료 메시지를 기존 구조화 오류 경로로 전달한다. RED는 후보 JSON이 올바른 모의 응답의 내부 메시지 상태만 `incomplete`로 바꾸고 HTTP 502, `provider_incomplete`, 후보 부재를 단언한다.

B-02와 B-03의 읽기 전용 진단 명령은 다음과 같다. 저장소 루트에서 실행했고 두 관측을 재확인했다.

~~~powershell
Get-Content -Raw -Encoding UTF8 .scratch/phase7-security-b02-b03.py | & ./.venv/Scripts/python.exe -
~~~

## 대조 검증과 남은 범위

- 공개 이미지 테스트에서 다섯 AI 라우트가 공급자 초기화 전에 HTTP 403을 반환했고 비생성 시나리오 검증은 동작했다. `/.env`는 HTTP 404였다. 공개 릴리스·시나리오 안내·콘텐츠 추출 테스트 23건과 라이브 어댑터·ChatKHU·의미 검토 모의 테스트 81건이 통과했다.
- `backend/app/main.py:110–129,167–177,200–209,272–334`에서 서버 전용 설정, 고정 공급자 주소, 리다이렉트 비활성화, SDK 자동 재시도 0회, 동시 호출 제어, 요청 크기 제한을 확인했다. `backend/app/openai_provider.py:121–165,181–190`, `backend/app/content_extraction.py:24–46,112–118`, `backend/app/semantic_review.py:128–144`에서 지시와 창작 데이터 분리, 닫힌 스키마와 원문 인용 검사를 확인했다. 검토한 공급자 호출은 도구 실행 경로를 노출하지 않았다.
- 로컬 빌드의 JS 여섯 개를 알려진 토큰·개인키 패턴으로 검사했으며 일치 항목이 없었다. 추적 목록에는 `.env.example`만 있었다. Docker 문맥과 이미지 복사 경로는 허용 목록을 사용한다. 실제 `.env`, 운영 이미지의 파일시스템, 전체 운영 로그는 열지 않았다.
- 브라우저는 파일을 읽기 전에 16 MiB 한도를 확인하고 구조·참조·승인을 검증한다. 서버의 1 MiB 요청 한도와 차이가 있어 크게 편집된 정본의 기능별 경험에는 추가 검토 여지가 있다. 두 한도는 별도 경계의 정책이며 이 감사에서 해당 차이를 결함이나 RED로 확정하지 않았다. `frontend/src/ProjectImport.tsx:46–55`, `frontend/src/backupProject.ts:7–16`, `frontend/src/storage.ts:89–92`, `backend/app/main.py:35,200–209`.
- Ajv의 유지보수자 릴리스에는 `$data` 기반 보안 수정이 포함된다. 현재 앱의 생성 옵션과 고정 스키마에서 이 기능을 사용하는 경로를 찾지 못했다. 런타임 노출로 확정하지 않았다. `frontend/package.json:16`, `frontend/src/validation.ts:7`. [Ajv 릴리스](https://github.com/ajv-validator/ajv/releases/tag/v8.18.0)

에이전트는 가용성 위험 B-01을 우선 검토하고, 동작이 분명한 B-03을 독립 RED 후보로 둘 것을 제안했다. 실제 공급자 호출·크레딧 사용·운영 부하 검사·원격 상태 변경은 없었다. 운영 프록시 완화 효과, 공급자 응답 빈도와 브라우저 실데이터 보존은 미검증이다.
