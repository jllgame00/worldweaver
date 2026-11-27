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
