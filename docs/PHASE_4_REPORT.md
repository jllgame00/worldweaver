# Phase 4 소유자 검토 보고서

**PASS — 오프라인 구현과 소유자 검토 진입 기준을 충족했다.** 기존 프로젝트를 열어 공유 정본을 탐색하고, 모델 호출 없이 결함과 근거를 확인하고, 격리한 수리안을 비교·수락·거절한 뒤 저장 결과를 재검사할 수 있다. 네이티브 브라우저 조작과 최신 소유자 프로젝트 확인, 실제 ChatKHU의 편집 품질 평가는 남아 있다. Phase 5는 시작하지 않았다.

## 구현과 검증 범위

| 기능 | 확인한 동작 |
|---|---|
| World Bible | 기존 Project에서 인물·세력·장소·아이템·퀘스트·사건·상태·지역·영토 등을 검색하고 편집한다. 독립된 구조가 없는 생물·역사·세계 법칙은 기존 콘텐츠 분류로 취급한다. 이름을 바꿔도 ID를 유지한다. 고정 사실은 별도 편집 확인을 거친다. |
| 관계와 영향 | 선택한 기록을 중심으로 관계를 페이지 단위로 표시한다. 키보드 목록과 그래프에서 관계·유형 필터, 이동, 확대·축소, 원본 편집기 이동을 지원한다. 역참조에서 직접·간접 영향과 관련 승인·검증 이력을 계산한다. AI가 제안한 관계에는 별도 표시가 있다. |
| 런타임 | 입력 사본·의미 지문 → 모드·대상 → 도구 계획 → 실제 실행 → 증거 정규화 → 선택적 의미 검토 → 수리 시뮬레이션 → 소유자 결정 → 원자적 저장 → 저장 결과 재검증 순서로 진행한다. 실행·건너뜀·실패·취소·불완전을 기록한다. |
| 결정적 도구 | `schema`는 정본 구조, `references`는 ID·자료형·참조, `sources`는 원본 리비전과 승인, `progression`은 상태·퀘스트·전이·엔딩, `atlas`는 장소·경로·지리 제약, `coverage`는 소스 요구사항의 반영을 검사한다. Quick은 앞의 다섯 개, Full은 여섯 개, Targeted는 대상의 의존 도메인을 계획한다. 실제 가능한 경로와 명시적 물리 여행을 검사한다. |
| 의미 검토 | 기존 서버 측 ChatKHU·OpenAI·개발 mock 어댑터를 사용한다. 실제 제출할 발췌와 상한을 미리 보여주며, 확인 한 번에 요청 한 번, 자동 유료 재시도 0회다. 알려진 자료형·ID와 정확한 인용을 검증한다. 모순 가능성·불확실성·편집 제안을 표시한다. mock 전송으로 성공·실패·잘못된 증거·취소를 시험했다. |
| 수리와 승인 | 원래 값, 제안 값, 영향, 승인 변화, 전후 검사 결과를 격리 사본에서 비교한다. 저장 직전 리비전·지문·원래 값·필드 허용 범위를 재확인하고 의존 변경을 함께 적용한다. 이전 상태는 복구용 JSON으로 받을 수 있다. 수락 직후 저장된 정본을 다시 검사한다. 최종 설계 승인에는 별도 확인과 Full 재검사가 필요하다. |
| 저장·내보내기 | 기존 IndexedDB의 경쟁 쓰기 검사를 거쳐 최근 12개 보고서와 제안·결정 이력을 프로젝트에 저장한다. 역사적 결과에 현재 적용 가능 여부를 표시한다. 기존 v1 JSON 가져오기, Markdown 보고서, 소견 JSON, 이력 포함 프로젝트 JSON을 지원한다. |

## 실제 결과

| 검사 | 시작 시점 | 최종 결과 |
|---|---|---|
| pytest | 276 통과 | **296 통과**, 기존 Starlette 경고 1건 |
| Vitest | 25개 파일, 126 통과 | **36개 파일, 167 통과** |
| 엄격한 TypeScript·생성 타입 동기화·Vite | 통과 | 통과. 최종 JS 624.78 kB, gzip 188.32 kB로 청크 크기 경고가 있다. |
| 정본·전송 스키마 | 기존 정본·전송 형식 | 정본 Draft 4와 서사·시나리오·수정·의미 검토 전송 스키마 정의 검사 통과 |
| 통합 | 기존 편집기·승인 회귀 포함 | 시나리오 진행·위치 참조·Atlas 검증·공급자 보호·가져오기/내보내기·수리 이력 회귀 통과. 독립 Atlas 통합은 상태 18개와 엔딩 3개를 확인했다. |
| 신뢰성 캠페인 | 42개 합성 사례와 과거 소유자 진단본 2개 | 두 차례 실행 모두 **44/44 일치**. 사전 지정한 차단 규칙 누락 0, 예상 밖 차단 규칙 0, 정상 사례 차단 오탐 0. 입력 해시 전부 보존. 최초 실행 중앙값 71 ms, p95 75 ms. |

TDD에서는 검증 도구 미연결, 근거 없는 통과 판정, 잘못된 인용 ID 수락, 수리 시뮬레이션 부재, 원본이 바뀐 Narrative Studio의 오래된 표시를 각각 RED로 확인한 뒤 같은 검사를 GREEN으로 만들었다. 중간 전체 프런트엔드 회귀에서 8건이 실패했다. jsdom 동시 실행을 4개로 제한한 뒤 최종 전체 스위트가 통과했다. [그룹별 RED/GREEN 명령과 관측](TDD_EVIDENCE.md) · [캠페인의 사례별 기대·실제 결과와 수리 실험](VERIFICATION_CAMPAIGN.md)

## 잊혀진 달 진단 자료

두 파일은 기존 조사에서 남은 과거 진단본이다. 각 원본을 바이트 단위로 복사해 읽고, 검사 전후 원본과 작업 사본의 SHA-256을 대조했다. 두 파일 모두 3장, 장면 14개, 연결 16개, 퀘스트 4개, 엔딩 3개, 인물 5명, 세력 2개, 장소 6개를 담았다. 두 파일에서 서사는 승인됐고 시나리오는 승인 대기였으며 지도는 들어 있지 않았다.

| 자료 | 확인한 진행 결과 | SHA-256 |
|---|---|---|
| 과거 승인 진단본, rev 9 | 프롤로그가 미래 퀘스트 장면 및 엔딩 방문을 요구했다. 보고서가 두 장면과 프롤로그 이름을 제시했다. 탐색 상태 0개, 도달 엔딩 0개였다. | `2512EE615D4C4E65D26CF9787F08454404B98D17240296B52DD329E0B676E588` |
| 기존 소유자 검토용 수정 초안, rev 10 | 같은 탐색기로 상태 31개, 엔딩 3개에 도달했다. 초안의 승인 상태는 보존했다. | `173826C926B07A383458C0DCEDD5344B12F0C8EDF77C0C661DE8D2AC666FF0EB` |

최신 브라우저 프로젝트와 소유자가 렌더링한 시드 42 지도는 이 자료로 확인할 수 없다. 캠페인의 시드 42 지도는 독립적으로 만든 합성 입력이다.

## 화면·저장·비용

네이티브 Edge 실행은 운영체제에서 `spawn EPERM`을 반환했다. 인앱 브라우저 호스트도 사용할 수 없어 실제 렌더링, 스크린샷, 소유자 IndexedDB 상태는 미확인이다. 별도로 프로덕션 빌드와 jsdom, 모의 IndexedDB, 실제 루프백 FastAPI를 연결했다. 합성 프로젝트 가져오기 → 관계 그래프 → Quick Check → 거리 오류 → 격리 수리 비교 → 재열기 → 명시적 수락과 복구 다운로드 → 저장 후 재검사 → 세 형식 내보내기를 확인했다. 검증 POST 6회가 모두 200이었고, Python 정본 경계가 내보낸 JSON의 보고서 2개와 결정 1개를 읽었다.

개발 중 실제 ChatKHU·OpenAI 요청은 **0회**, 유료 크레딧 사용은 **0**이었다. 직접 실행한 검증용 서버는 종료했다. 모델에 제출할 근거가 부족한 경우와 결정 검사에서 탐색 상한(2,048개 상태)에 도달한 경우는 추가 검토 대상으로 남는다. 자연어 세계 법칙이나 인물 동기의 창작 타당성은 소유자의 판단이 필요하다.

## 소유자 인수 절차

1. 저장소 루트에서 `.\scripts\start-dev.ps1`을 실행한다. 기존 브라우저 프로필로 `http://127.0.0.1:5173`에 접속해 **Projects → 잊혀진 달 → Open** 후 **Verification Agent → Export saved project JSON**으로 백업한다.
2. Narrative·Scenario·Atlas의 실제 내용과 승인을 확인한다. World Bible에서 인물·세력·장소를 차례로 선택하고 관계 그래프와 목록에서 원본 편집기를 연다. **Edit record → Preview change → Cancel**로 변경 영향을 확인한다.
3. **Verification Agent → Quick Check → Run Quick Check** 후 증거를 펼쳐 관련 기록으로 이동한다. 수리는 별도 합성 프로젝트에서 시도한다. `node frontend/scripts/verification-campaign.mjs --demo-only`로 만든 `.scratch/phase4-synthetic-route-repair.json`을 가져온다.
4. 복사본에서 **Run Quick Check → Prepare repair → Reject proposal**을 실행한다. 다시 **Prepare repair → Simulate on isolated copy**에서 원래 값과 제안 값을 비교한 뒤 확인란과 **Accept repair and download recovery JSON**을 사용한다. 자동으로 추가된 Full 결과, Markdown·소견 JSON·정본 JSON 내보내기, 새로고침 후 결정 이력을 확인한다.
5. 선택적 ChatKHU 검토는 별도 요청이다. 서버 측 기존 키와 `WORLDWEAVER_PROVIDER=chatkhu`, `CHATKHU_MODEL=gpt-6.2-sol`, `CHATKHU_API=responses`를 설정하고 재시작한다. 대상을 선택해 **Review this record → Run Targeted Review → Review semantic evidence**에서 제출 자료, 모델, 가격 가용 여부와 토큰 상한을 읽는다. 비용에 동의할 때 **Authorize one live review**를 한 번 누른다. [상세 인수 절차와 실행 한도](VERIFICATION_AGENT.md)

## 작업 트리와 다음 게이트

시작 브랜치는 `main`, HEAD는 `e3605f38a49f7e8824b3d92a4e953df58afd8b1a`였고 작업 트리는 깨끗했다. 종료 시점은 같은 브랜치와 HEAD다. 구현은 로컬 미커밋 상태로 남겼고 push·배포는 실행하지 않았다. 다음 단계 결정은 소유자가 기존 프로필에서 최신 데이터와 화면을 확인한 뒤에 한다.

수정 32개, 신규 41개다. 검사한 전체 파일 목록은 다음과 같다.

<details><summary>변경 파일 전체 목록</summary>

~~~text
 M  PLANS.md
 M  README.md
 M  backend/app/contracts.py
 M  backend/app/main.py
 M  backend/app/mock_provider.py
 M  backend/app/openai_provider.py
 M  backend/app/provider.py
 M  backend/app/scenario_progression.py
 M  backend/app/scenario_validation.py
 M  docs/AGENT_WORKFLOW.md
 M  docs/ARCHITECTURE.md
 M  docs/DATA_SCHEMA.md
 M  docs/HW6_REQUIREMENTS_MATRIX.md
 M  docs/TDD_EVIDENCE.md
 M  docs/project-v1.schema.json
 M  frontend/scripts/generate-types.mjs
 M  frontend/src/App.tsx
 M  frontend/src/AtlasStudio.tsx
 M  frontend/src/Content.tsx
 M  frontend/src/Narrative.tsx
 M  frontend/src/NarrativeRegistry.tsx
 M  frontend/src/ScenarioStudio.tsx
 M  frontend/src/api.ts
 M  frontend/src/atlasPlaces.ts
 M  frontend/src/atlasSpatial.ts
 M  frontend/src/atlasWorkflow.ts
 M  frontend/src/project.generated.ts
 M  frontend/src/project.ts
 M  frontend/src/referenceRepair.ts
 M  frontend/src/styles.css
 M  frontend/src/validation.ts
 M  frontend/vite.config.ts
??  backend/app/semantic_review.py
??  backend/tests/test_semantic_review.py
??  backend/tests/test_verification_progression.py
??  docs/PHASE_4_REPORT.md
??  docs/VERIFICATION_AGENT.md
??  docs/VERIFICATION_CAMPAIGN.md
??  frontend/scripts/verification-campaign.mjs
??  frontend/scripts/verification-cases.mjs
??  frontend/src/SemanticReview.test.tsx
??  frontend/src/SemanticReview.tsx
??  frontend/src/VerificationAgent.tsx
??  frontend/src/VerificationRepairReview.tsx
??  frontend/src/WorldBible.test.tsx
??  frontend/src/WorldBible.tsx
??  frontend/src/WorldBibleEditor.tsx
??  frontend/src/WorldBibleGraph.tsx
??  frontend/src/WorldBibleImpact.tsx
??  frontend/src/repairSimulation.ts
??  frontend/src/semanticReview.test.ts
??  frontend/src/semanticReviewClient.ts
??  frontend/src/semanticReviewCopy.ts
??  frontend/src/verificationApproval.test.ts
??  frontend/src/verificationCopy.ts
??  frontend/src/verificationEngine.test.ts
??  frontend/src/verificationEngine.ts
??  frontend/src/verificationHistory.test.ts
??  frontend/src/verificationHistory.ts
??  frontend/src/verificationRepair.test.ts
??  frontend/src/verificationRepair.ts
??  frontend/src/verificationReport.ts
??  frontend/src/verificationRoute.test.ts
??  frontend/src/verificationRoute.ts
??  frontend/src/verificationTools.ts
??  frontend/src/verificationWorkspace.test.tsx
??  frontend/src/verifiedNarrative.test.tsx
??  frontend/src/worldBible.css
??  frontend/src/worldBibleCopy.ts
??  frontend/src/worldBibleEdits.ts
??  frontend/src/worldBibleEvidence.ts
??  frontend/src/worldBibleHistory.test.tsx
??  frontend/src/worldBibleIndex.ts
~~~

</details>
