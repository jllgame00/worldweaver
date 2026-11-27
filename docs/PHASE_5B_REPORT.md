# Phase 5B · 자유 입력과 검토 후 반영

**GREEN 통과.** `feature/product-polish`의 소유자 RED 커밋은 `81bef2ff5a867cfb1ce09962bec74e54da624ee1`이다. 부모는 Phase 5A `2bd184b6fc18438c3a15366e8fe92ce0375f07d4`다. RED 커밋에는 테스트 파일 두 개만 있다. 구현 커밋 SHA는 소유자가 별도로 커밋한 뒤 기록한다.

## 구현

- **Content → Paste ideas**는 한국어·영어, 여러 줄, 공백과 Unicode를 브라우저 입력값 그대로 보존한다. **Edit fragments**로 전환해도 원문은 남는다.
- **Organize with rules**는 알려진 한영 제목, `인물: 해온`과 같은 라벨, `[Location] East Gate`, `-`/`*` 목록을 해석한다. `제외:`/`Exclude:`와 `필수:`/`Required:`는 명시적 취급이다. 모호한 줄과 미등록 제목은 **Needs review**에서 수정하거나 사용자가 자유 소재로 분류한다. 빈 줄과 제목도 분리된 원문에 보존한다.
- **Suggest with AI → Authorize one extraction**은 표시된 모드·모델·상한으로 원문만 한 번 요청한다. ChatKHU Responses 및 Chat Completions, OpenAI Responses와 개발 mock을 기존 서버 어댑터에 연결했다. 자동 유료 재시도는 0회다.
- API는 기존 분류·취급과 정확한 인용을 검사한다. 인용은 겹치지 않는 일치를 왼쪽부터 1로 세며, 한국어·이모지·개행을 그대로 해석한다. 중복 JSON 필드, 잘못된 구조·카테고리·취급, 없는 인용과 순번을 거절한다. 사용자는 표시한 근거를 펼쳐 확인할 수 있다. [API 계약](ARCHITECTURE.md#phase-5b-content-intake-api)
- 검토와 거절 동안 정본 저장은 0회다. **Add selected fragments**만 체크한 유효 소재를 새 ID로 묶어 한 번 저장한다. 기존 고정 사실과 소재를 보존하며 기존 버전 규칙에 따라 출처 재검토 상태를 표시한다. 다른 탭이 먼저 저장하면 최신 정본을 보존하고 다시 열기를 안내한다.

## HW6 규칙과 테스트

| 규칙 | 원래 RED 테스트 이름 | GREEN에서 확인한 동작 |
|---|---|---|
| B1 실패 후 원문과 정본 보존 | `B1 retains the original and the entire saved project after a provider timeout` | 가짜 504 이후 원문, 전체 정본, 규칙 정리와 요청 1회 |
| B2 키 없는 결정적 초안 | `B2 uses only local rules without credentials and records one recoverable fallback` | 한영 분류·모호한 텍스트 보존, 원문과 영수증 재열기, POST 0회 |
| B3 잘못된 출력 거절과 복구 | `B3 retains the original and offers manual or local editing after AI output is rejected` | 잘못된 출력 거절 후 원문 보존과 수동 편집 |
| B4 검토와 원자적 채택 | `B4 rejecting a reviewed draft preserves the input and the saved project`, `B4 only explicit acceptance adds the selected edited fragment in one revision` | 거절 시 쓰기 0회, 선택하고 편집한 소재만 추가, 고정 사실 보존 |
| B4 경쟁 저장 보호 | `B4 rejects acceptance of a draft when a newer canonical revision has been saved` | 두 번째 연결의 최신 정본과 원문을 보존하고 충돌 안내 |
| API 근거·형식 검증 | `test_content_extraction_returns_a_detached_proposal_with_the_second_exact_citation`, `test_content_extraction_rejects_invalid_provider_output_without_a_proposal` | 유효한 두 번째 인용에 200. `malformed-json`, `invalid-category`, `nonexistent-citation-occurrence`에 502 |

프런트엔드 RED 6개는 **Paste ideas** 탭 부재에서, 백엔드 RED 4개는 추출 POST의 405에서 실패했다. 두 명령 모두 종료 1이었다. GREEN에서는 각각 6개와 4개가 통과했고, 원래 두 테스트 파일은 RED 커밋과 같다. 이후 추가한 회귀는 백엔드 13개, 프런트엔드 2개다. API 동의와 상한, timeout·인증 실패·출력 거절 집계, 유효하지 않은 취급·거짓 근거, 3개 SDK 전송 형식, 제외 규칙, 화면의 두 번째 인용 강조와 영수증 중복 방지를 확인했다.

## 운영 기록

| 이력 구분 | 집계 기준 |
|---|---|
| Live AI / Development mock | 추출 동의에서 시도 ID를 만들고 서버 결과로 같은 행을 갱신한다. 어댑터 발송 시도는 1회, 발송 전 가드는 0회다. mock은 별도 모드다. |
| 응답·실패·출력 거절 | 돌아온 모델 응답은 검증에 실패해도 수신으로 센다. timeout·인증 실패·검증 거절은 별도 결과다. 영수증을 잃으면 발송과 응답은 미확인이다. |
| Deterministic fallback / Local extraction | 공급자가 없거나 현재 입력의 AI 실패 후 규칙 정리를 실제 누를 때 fallback 1회다. AI 사용 가능 상태의 직접 로컬 선택은 별도 방법이다. 공급자 발송은 모두 0회다. |
| 수락·거절 | 성공한 정본 저장에 수락 1회, 명시적 거절에 거절 1회다. 화면 렌더·충돌·버튼 안내는 이 수치에 포함하지 않는다. |

원문·초안과 최근 작업 이벤트 50개는 프로젝트별 localStorage에 보관한다. 이 기록은 계정 전체의 과거 사용량이나 결제 증거를 제공하지 않는다. 저장 제한으로 브라우저에 기록할 수 없으면 화면에서 계속 편집할 수 있고, 닫기 전에 원문 사본을 보존하라는 안내가 표시된다. 정본 JSON에는 채택된 소재만 포함된다.

## 실제 실행

| 명령과 범위 | 결과 |
|---|---|
| `npm.cmd --prefix frontend test -- contentIntake.test.tsx --reporter=verbose` 및 `.\.venv\Scripts\python -m pytest -q backend/tests/test_content_extraction.py --tb=short` | 원래 단언 **10/10 GREEN** |
| `.\.venv\Scripts\python -m pytest -q` | **313 통과**, 기존 Starlette 경고 1개 |
| `npm.cmd --prefix frontend test -- --reporter=dot` | **175 통과, 파일 38개**. 서사·시나리오·Atlas·검증 에이전트·저장·경쟁 쓰기 포함 |
| `.\.venv\Scripts\python -m backend.tests.test_atlas_integration` | 루프백 정상 프로젝트에 진행 상태 18개·엔딩 3개, 잘못된 지도 참조 2개는 거절 |
| 타입·빌드·스키마·워크플로·공백 | 생성 동기화, 엄격한 TypeScript, Vite, 정본 Draft 4와 전송 Draft 2020-12 5개, actionlint 및 `git diff --check` 통과. 기존 Vite 청크 경고 |

브라우저 액세스 호스트는 사용할 수 없었고 네이티브 Chrome 제어는 승인 제한으로 거절됐다. 프로덕션 빌드를 jsdom, fake IndexedDB와 실제 루프백 FastAPI에서 실행해 동의 전 요청 0회, 동의 후 mock POST 1회·200, 거절, 로컬 선별 수락, 원문과 이력 재열기를 확인했다. 소유자 IndexedDB는 접근하지 않았다. 테스트 서버를 종료했다. 실제 ChatKHU·OpenAI 호출과 소비 크레딧은 0이다. 실제 제공자의 추출 품질과 네이티브 브라우저 조작은 미검증이다.

소유자 확인은 [README의 자유 입력과 소재 검토 절차](../README.md#자유-입력과-소재-검토)를 따른다. 구현 커밋 메시지는 `feat(content): preserve source drafts and apply reviewed extraction`이다.

## 변경 파일

작업 트리는 수정 파일 15개와 신규 파일 6개를 담는다. RED 커밋의 테스트 파일은 두 변경 목록에 포함되지 않는다.

| 영역 | 파일 |
|---|---|
| 백엔드 | `backend/app/content_extraction.py`, `main.py`, `mock_provider.py`, `openai_provider.py`, `provider.py` |
| 프런트엔드 | `frontend/src/App.tsx`, `Content.tsx`, `ContentIntake.tsx`, `intakeModel.ts`, `styles.css`, `useProjects.ts`, `validation.ts` |
| 추가 테스트·CI | `backend/tests/test_content_extraction_edges.py`, `frontend/src/intakeEdges.test.tsx`, `.github/workflows/test.yml` |
| 문서 | `README.md`, `docs/ARCHITECTURE.md`, `docs/HW6_REQUIREMENTS_MATRIX.md`, `docs/PHASE_5_PLAN.md`, `docs/TDD_EVIDENCE.md`, `docs/PHASE_5B_REPORT.md` |
