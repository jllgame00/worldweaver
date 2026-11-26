# WORLDWEAVER

**From scattered ideas to a living world.**

WORLDWEAVER(가칭)는 흩어진 게임 아이디어를 이야기와 지도 위에서 함께 편집하는 내러티브 설계 도구다. 인디 개발자, 게임·내러티브 디자이너, 소규모 팀과 학생이 주요 사용자다. 장기 목표는 창작자가 이야기와 세계 설정을 연결해 편집할 수 있는 공개 서비스다. 「오픈소스 SW 개발방법 및 도구」 HW6의 요구사항은 최소 검증 기준으로 삼는다. 현재 **Phase 1 Narrative Engine**에서 이야기 초안을 작성하고 브라우저에 저장할 수 있다.

예를 들어 플레이어가 수문에서 증언을 모은 뒤 명부를 공개할지 봉인할지 고른다고 하자. 설계자는 각 결말이 벌어지는 장소를 지도에서 확인하고, 공개 장소로 가는 유일한 도로를 지웠을 때 어느 분기가 막히는지 확인할 수 있어야 한다. 이 동작이 제품의 핵심 목표다. [합성 예시 프로젝트](docs/examples/salt-census.json)

## 지금 사용할 수 있는 기능

1. **Projects**에서 제목을 입력해 새 프로젝트를 만든다.
2. **Content Studio**에서 한국어 또는 영어 소재를 하나 이상 입력한다. 필수, 선택, 제외로 분류하고 보호할 사실을 따로 고정한다.
3. mock 제공자가 제안한 세 방향의 갈등, 결말, 소재 반영 근거를 비교한다. 후보를 골라 이야기 필드를 편집한 뒤 고정 사실과 내용을 검토해 승인한다.
4. 브라우저의 IndexedDB에 저장된 프로젝트를 같은 브라우저 프로필과 주소에서 다시 연다. 소재 변경 후 기존 후보와 이야기는 재검토가 필요한 상태로 남는다.

분기 그래프, 세계 지도, JSON 교환과 Markdown 내보내기는 이후 단계에서 다룬다.

## 로컬에서 실행

Python 3.13, Node.js 24 및 npm이 필요하다. 저장소 루트에서 PowerShell로 다음을 실행한다.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm.cmd --prefix frontend ci
```

백엔드와 프런트엔드는 각각 별도 터미널에서 실행한다. 개발 화면은 `http://127.0.0.1:5173`, 백엔드 헬스는 `http://127.0.0.1:8000/health`에서 확인한다.

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
npm.cmd --prefix frontend run dev
```

배포 형태를 로컬에서 확인하려면 `npm.cmd --prefix frontend run build` 후 백엔드를 다시 시작하고 `http://127.0.0.1:8000`을 연다. 포트가 다르면 브라우저 저장소도 각각 별도로 열린다.

기본값은 `WORLDWEAVER_PROVIDER=mock`, `WORLDWEAVER_MODEL=worldweaver-mock-v1`, `WORLDWEAVER_TIMEOUT_SECONDS=8`이다. 서버를 시작할 터미널의 환경 변수로 설정할 수 있다. mock은 결정론적 개발·자동 검증 전용이며 API 키가 필요 없다. 실제 생성 품질 검증과 공개 운영에는 승인된 제공자·모델·비용 한도가 필요하다.

## 기술과 검증 계획

React·TypeScript·Vite 프런트엔드와 FastAPI·Pydantic 백엔드를 사용한다. 정본은 버전이 있는 하나의 Project다. 서버는 제공자 응답을 정본 스키마로 검사하고 현재 프로젝트 리비전에 대한 제안으로 반환한다. 프로젝트와 제공자 설정은 각각 브라우저와 서버에서 관리한다. [아키텍처](docs/ARCHITECTURE.md) · [데이터 계약](docs/DATA_SCHEMA.md)

런타임 에이전트는 서사 생성, 시나리오 구성, 세계 생성, 검증을 분담한다. 자동 복구는 최대 두 번이며 중요한 서사 변경에는 사용자 승인이 필요하다. 개발용 저장소 스킬은 향후 코딩 에이전트가 테스트와 검증 절차를 따르도록 안내한다. [런타임 흐름](docs/AGENT_WORKFLOW.md) · [개발 규칙](AGENTS.md)

검증에는 pytest와 Vitest를 사용한다. 일반 CI는 mock을 사용하도록 설계했으며, CI 구성과 배포는 후속 단계에서 진행한다. [TDD 계획](docs/TDD_PLAN.md) · [CI/CD 계획](docs/DEVOPS_PLAN.md)

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend run build
```

## 현재 열어볼 수 있는 자료

별도 API 키 없이 mock으로 실행할 수 있으며, 설계 문서와 합성 예시도 확인할 수 있다.

| 확인할 내용 | 문서 |
|---|---|
| 제품 범위, 합격 기준, 9개 화면 스케치 | [제품 명세](docs/PRODUCT_SPEC.md) · [UX 설계](docs/UX_DESIGN.md) |
| 단계별 작업과 다음 단계 진입 조건 | [로드맵](PLANS.md) |
| 과제 요구사항, TDD 증거 현황 | [HW6 대응표](docs/HW6_REQUIREMENTS_MATRIX.md) · [TDD 기록](docs/TDD_EVIDENCE.md) |
| 설계 검증 결과와 보류 사항 | [Phase 0 보고서](docs/PHASE_0_REPORT.md) |
| Narrative Engine 구현과 실행 검증 | [Phase 1 보고서](docs/PHASE_1_REPORT.md) |
