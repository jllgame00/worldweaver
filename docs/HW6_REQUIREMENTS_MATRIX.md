# HW6 요구사항 대응표

기준은 현재까지 공지된 과제의 최소 요구사항이다. 공식 과제 명세를 받으면 담당자가 문구와 제출 형식을 대조해 이 표를 갱신한다. 공개 제품의 품질 목표와 단계별 종료 조건은 제품 명세와 로드맵에서 관리한다.

| 공지 항목 | WORLDWEAVER에서 확인할 행동 | 계획 단계 | 제출 때 확보할 증거 | 현재 확인한 범위 |
|---|---|---|---|---|
| Product | 디자이너가 아이디어에서 출발해 분기와 장소를 편집하고 설계 자료를 내보낸다. | 1–5 | 입력부터 재열기·내보내기까지의 사용자 시연, 합격 기준별 결과 | Phase 1 프로젝트 작성, 후보 비교·선택, 이야기 편집, 로컬 저장·재열기 |
| TDD 3개 이상 | 후보 수, 필수 소재 보존, 잘못된 응답 처리부터 독립적인 동작을 테스트한다. | 1부터 매 단계 | 실제 RED 실패, 최소 구현 후 GREEN, 리팩터링 회귀 기록 | N1–N3 및 OpenAI·ChatKHU 가짜 HTTP 경계, 조회 도구와 화면의 RED 및 GREEN 기록 확보 |
| LLM 연동 1회 이상 | 실제 제공자의 구조화된 결과를 파싱하고 정합성을 확인한 뒤 편집 가능한 후보로 변환한다. | 1.5 어댑터, 1.5-C ChatKHU 우선, 승인 뒤 실응답 검증 | 승인된 실연동의 모델·일자·결과 및 오류 처리, mock과 분리한 기록 | 두 어댑터 구현 및 가짜 HTTP 검증. ChatKHU 계정 메타데이터 조회 401, 실제 생성 PENDING |
| Agent | 실행기가 지리 생성·검증 도구를 호출하고 근거를 남긴다. 오류가 계속되면 두 번 이내에서 복구를 멈춘다. | 1–4, 6 검증 | 도구 호출 기록, 실패·취소·승인 사례, 재검증 결과 | Narrative Agent의 호출, 구조·참조 점검, AgentRun 및 제한 재시도 구현 |
| DevOps / CI/CD | 테스트와 빌드가 통과한 리비전만 Render에 배포한다. | 6 | GitHub Actions 결과, 실패 차단 사례, 배포·재배포 SHA와 상태 점검 | 파이프라인 설계 |
| GitHub | 저장소에서 변경 이력과 검증 결과를 추적한다. | 승인 후 단계별, 6 종합 | 실제 저장소 주소 및 변경과 CI 실행의 연결 | 로컬 origin 설정 확인, 원격 동작 미검증 |
| 지속가능한 SW 개발 | 동일 입력 지도 재현, 불필요한 재생성 억제, 일반 CI의 mock 사용, 호출·재시도 상한 | 1, 3, 4, 6 | 동일 예시에서 호출 수·토큰·빌드 시간 측정, 선택의 장단점 | 생성 호출 수 기록, 일시적 오류에 최대 1회 재시도, mock 검증 사용 |
| 독창적인 제품 개념 | 사건에서 지도를 찾고 지도에서 퀘스트를 찾아 경로까지 검사한다. | 0에서 정의, 2–5 구현 | 직접 작성한 합성 예시, 양방향 편집 및 이동 불가 사례 시연 | 독자적 설계 가설 수립, 시장 검증 전 |

Phase 0 설계 게이트는 **PASS**다. 개발 스킬 4개의 설치 파일과 현재 Codex 세션 목록을 각각 확인했으며 모두 Git 추적 대상에 포함할 수 있다. 검증 방법과 남은 결정은 [Phase 0 보고서](PHASE_0_REPORT.md)에 기록했다.

Phase 1의 실제 검증과 남은 항목은 [Phase 1 보고서](PHASE_1_REPORT.md)에 기록했다.

ChatKHU 인증, 모델·크레딧 예산 승인, 실제 성공 응답 및 창작 품질 평가가 다음 실연동 확인 항목이다. [Phase 1.5 보고서](PHASE_1_5_REPORT.md)

제품의 지표는 [제품 명세](PRODUCT_SPEC.md), 실제 개발 증거는 [TDD 기록](TDD_EVIDENCE.md), 단계별 종료 조건은 [로드맵](../PLANS.md)에서 관리한다.

## Phase 2 검증 근거

설계 패턴은 기존 provider 어댑터와 생성 API에서 확인할 수 있다. 시나리오 에이전트는 구조화된 결과를 받고 참조·분기·조건 검사를 호출한 후 제안을 돌려준다. 편집자가 선택한 노드, 퀘스트, 장만 수정하는 요청은 한 번의 호출로 제한한다. mock 및 가짜 HTTP 경계에서 실패, 승인 전 거절, 저장, 재열기를 검증했다. 실제 브라우저 조작, 실연동 서사 품질, CI/CD와 지도상의 이동 검증은 별도 증거가 필요하다. [Phase 2 보고서](PHASE_2_REPORT.md) · [TDD 기록](TDD_EVIDENCE.md)

### Phase 2.3 진행 신뢰성 증거

| 검증 항목 | 확인 방법과 결과 |
|---|---|
| 에이전트와 도메인 도구 | 생성 1회, 정본 ID 매핑, 경로별 퀘스트·조건 검사, 오류의 노드·연결·필드 추적. 실제 모델 검증은 소유자 대기 |
| TDD와 회귀 | 한국어 통행증 사례, 합류·상호 배타 분기, 선택 퀘스트 생략, 효과 순서, 다중 결말 및 이동 참조 검사. 정상 5개·의도적 실패 6개의 결과가 예상과 일치 |
| 승인과 저장 | 거절 원본 보존, 작업본 편집·검증, 변경 비교와 명시적 채택. 실제 로컬 HTTP, jsdom, 모의 IndexedDB의 증거를 구분해 기록 |

[Phase 2.3 검증 보고서](PHASE_2_3_REPORT.md) · [RED/GREEN 기록](TDD_EVIDENCE.md)

### Phase 3 절차적 지도 증거

| 항목 | 확인 결과 |
|---|---|
| 절차적 생성과 자원 | 시드와 설정으로 대륙·해안·고도·하천·호수·생물군계·지역을 재현한다. 60개 전수 2회 실행에서 의미 데이터 해시가 일치했다. 지도 생성과 복구의 유료 요청은 0회다. |
| 장면·세계 연결 | 승인 장소 ID와 실제 여정을 사용한다. 한국어 합성 3장 프로젝트를 지도와 함께 내보내고 다시 열어 기존 시나리오·확정 사실과 세 결말을 검사했다. |
| 상호작용과 수정 | 레이어·이동·확대·선택·키보드 목록, 이름/좌표 편집, 경로 재계산, 잠금·되돌리기, 별도 작업본 복구와 명시적 승인을 검사했다. |
| 표현·내보내기 | 편집 가능한 프로젝트 JSON, 세계 Markdown, 범례와 축척이 포함된 SVG를 지원한다. 독립 출력물은 QtSVG로 그려 확인했다. 실제 브라우저 및 소유자 프로젝트 확인은 대기 중이다. |

[지도 캠페인 상세](ATLAS_CAMPAIGN.md) · [Phase 3 검토 항목](PHASE_3_REPORT.md)

## Phase 4 evidence update

| Capability | Implemented evidence | Outstanding evidence |
|---|---|---|
| P6 shared records and geography | World Bible, stable ID links, reverse references, dependency/approval previews, keyboard list and bounded SVG graph | Owner review of the latest local project and native interaction |
| P7 verification and targeted repair | Registered deterministic tools, feasible progression/journeys, scoped evidence, one-request semantic contract, two-attempt repair budget, explicit decisions and full recheck | Live editorial quality and actual provider price for the owner's model |
| P8 portable verification metadata | Legacy import, bounded history, current/historical fingerprint, recovered proposals, JSON / Markdown, token-guarded save | Actual backup and restore in owner's browser profile |
| Evidence and cost | 44 classified cases, real local HTTP, privacy-preserving owner diagnostics, mocked semantic transport, zero paid development requests | Final course rubric and Phase 5 review remain separate |

[Regression and limitations](PHASE_4_REPORT.md) · [TDD ledger](TDD_EVIDENCE.md) · [Case-by-case measurements](VERIFICATION_CAMPAIGN.md)

## Phase 5A · 소유자가 전달한 HW6 튜토리얼 기준

위 표는 각 단계 당시의 기록이다. 소유자가 전달한 제출 기준을 현재 작업에 적용하면 다음 증거가 필요하다.

| 항목 | 현재 근거 | 제출 전에 확보할 근거 |
|---|---|---|
| 타인이 실행할 수 있는 제품·계획 | 한국어 README의 설치·시작·mock 절차, AGENTS.md, Phase 5A 설계와 게이트 | 깨끗한 환경에서 README대로 실행한 독립 시연, 실제 브라우저 사용성 점검 |
| test-first 핵심 규칙 세 가지 | 과거 실행 원장과 별도로 5B 원문/대안, 5C 로캘/편집 상태, 5D 복원/CAS를 사전 정의 | 소유자의 테스트→구현 커밋 세 쌍, 각 SHA·부모·실패 단언 및 이후 전체 성공 기록 |
| LLM·mock·출력 검증·fallback | ChatKHU/OpenAI 서버 어댑터, 구조/참조 검증, 자동 검사용 mock. 소유자가 실제 ChatKHU로 서사·시나리오 생성을 관찰했다고 보고했다. | 공개 가능한 승인된 실제 실행 증빙과 사용량, 5B 실패 시 원문 보존·규칙 정리의 별도 검증. 로컬 개발·CI의 유료 호출은 0회로 유지 |
| CI와 자동 Docker 배포 | PR/push 테스트, 성공 뒤 프런트 빌드, 읽기 전용 권한의 결과 게이트 구성 | 실제 Actions RED(빌드 차단)/GREEN 링크, main 보호 설정. Phase 6에서 같은 커밋의 Docker 빌드·자동 배포·health/버전·롤백 또는 재배포 증거 |
| 비밀 관리 | 실제 키를 받지 않는 테스트, 기존 서버 측 설정·루프백·가짜 전송 테스트, 체크아웃 자격 증명 비영속화 | 배포 시 서버 측 주입과 비노출 확인, 제출 자료의 비밀·프로젝트 본문 제거 |
| 서브에이전트 리뷰와 수정 | 5A 독립 감사로 기존 CAS 테스트 중복을 제외하고, 복원 시 미리보기 토큰·역사적 승인·운영 집계 의미를 명세에 반영했다. | 5F 실제 코드 리뷰의 대상 SHA·지적과 대응 diff, 소유자 수정 커밋 및 재검증. 5A 설계 리뷰는 최종 수정 커밋의 증거와 구분한다. |
| feature 브랜치와 PR | `feature/product-polish` 작업, 소유자 커밋 정지점과 일반 merge 정책 | 실제 브랜치 게시·PR·필수 검사·일반 merge commit 링크. 로컬 추적 참조로 원격 보호 설정을 판정하지 않는다. |

[커밋 메시지와 정지점](PHASE_5_PLAN.md) · [화면별 제품 설계](PRODUCT_POLISH_DESIGN.md)

## Phase 5B · 원문 보존과 검토 후 적용

| 과제 규칙 | 실제 검증 | 제출에 남은 근거 |
|---|---|---|
| 테스트를 먼저 커밋 | `81bef2ff5a867cfb1ce09962bec74e54da624ee1`에는 테스트만 포함. 프런트 6개·백엔드 4개 RED 재현 후 같은 단언에서 GREEN | 소유자 구현 커밋 SHA와 Actions 실행 링크 |
| 응답 검증과 실패 대안 | ChatKHU/OpenAI는 가짜 HTTP 경계에서 구조·예산·인용 검증. 키 없는 로컬 정리, 잘못된 출력 거절, 원문 보존과 소재 선별 적용 통과 | 실제 제공자 응답의 편집 품질은 별도 승인 후 확인 |
| 저장과 이력 | 승인 전 정본 쓰기 0회, 수락 시 한 변경, 다른 탭의 최신 저장 보존. mock·live 시도·결정적 fallback·선택 수락/거절을 브라우저 영수증으로 구별 | 실제 네이티브 브라우저 확인, 5F 최종 리뷰·PR 및 6단계 배포 증거 |

[실제 RED/GREEN 결과](PHASE_5B_REPORT.md) · [증거 원장](TDD_EVIDENCE.md)
