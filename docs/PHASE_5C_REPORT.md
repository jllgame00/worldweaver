# Phase 5C · 한국어 기본 인터페이스와 프로젝트 상태 보존

`feature/product-polish`의 시작 HEAD는 소유자의 5C RED 커밋 `16f8ae67550cd342627c12cb7615b31a319dabb8`이다. 이 커밋에는 `frontend/src/interfaceLocale.test.tsx`만 추가됐다. 직전의 5B GREEN은 `0a9cc291a1a8df71b6a52542d3a8505db92e2272`다. 5C 구현 커밋은 소유자가 별도로 만든 뒤 기록한다.

## 언어 제공 범위

| 화면 | 한국어와 영어로 제공하는 기능 |
|---|---|
| 머리글·프로젝트 | 언어 선택, 프로젝트 열기·만들기·가져오기, 저장 및 충돌 안내, 변경 시각 |
| 이야기 소재 | 자유 입력, 소재 분류와 반영 방식, 고정 설정, 규칙 정리·AI 추출, 제안 검토, 출처·이력, 실패 안내 |
| 스토리 설계 | 후보 비교·선택, 스토리 필드 및 엔티티 등록, 원본 후보, 저장·검토·최종 승인 |
| 시나리오 설계 | 생성 옵션, 그래프와 조작 설명, 장·노드·분기·퀘스트·조건·결과, 검증, 거절한 안 복구, 승인·내보내기 |
| 세계 지도 | 생성 설정, 배치 조건, 지도 레이어·범례·축척, 지형·경로·장소 유형, 검사기, 검증, SVG·Markdown 표시 |
| 세계관 사전 | 유형·검색·관계·사용처, 연결 기록, 변경 영향, 편집 및 고정 설정 확인 |
| 검증 에이전트 | 모드·범위, 도구 상태·이력, 소견과 근거, 수리안 비교·시뮬레이션·결정, 의미 검토와 비용 동의 |

머리글에서 `ko`/`en`을 선택한다. 설정은 프로젝트와 독립된 브라우저 값 `worldweaver.interfaceLocale`에 저장된다. 없거나 잘못된 값은 한국어로 열고, 쓰기가 차단되면 현재 세션에 적용한다. 화면에만 날짜·숫자·단위를 서식화한다. 현재 작업 공간의 React 키, 정본 스키마, 프로젝트 저장과 검증의 진입점은 기존 계약을 따른다. 번역 리소스는 기존 의미 키 및 인자를 컴파일 시 대조하며 별도 번역 패키지를 사용하지 않는다. [아키텍처](ARCHITECTURE.md#interface-locale-boundary)

`저장 완료`는 브라우저 쓰기 완료, `제안 채택`은 편집안 수락, `검증`은 규칙 검사, `최종 승인`은 소유자의 확정을 뜻한다. 사용자와 모델이 작성한 원문, 이름, 스토리, 인용, 과거 기록의 원시 근거, 코드·ID·경로 및 모델명은 원래 값으로 표시한다. 알려진 진단은 코드에 따라 요약을 표시한다. 알려지지 않은 진단과 자유 형식 결과는 원문 기술 세부 정보로 확인할 수 있다.

## HW6 규칙과 원본 테스트

`npm.cmd --prefix frontend test -- interfaceLocale.test.tsx --reporter=verbose`로 RED에서 6개를 수집했다. 종료 코드는 1이었다. C1의 한국어 기대값에는 영어 `Projects`가 나왔다. C2–C5의 다섯 사례는 언어 선택기에 도달해 접근 가능한 combobox를 찾지 못했다. 같은 커밋의 원본 단언 6개가 GREEN에서 종료 0으로 모두 통과했다.

| 원본 테스트 이름 | GREEN에서 실행한 단언 |
|---|---|
| `C1 starts in Korean and switches visible navigation and controls both ways` | 첫 한국어 화면·문서 lang, 날짜 표시와 한영 탐색 및 입력 모드 |
| `C2 switching locale leaves the integrated project byte-for-byte intact without generation` | 한영 원문·창작 결과와 공유 ID를 포함한 전체 저장 레코드 및 정본 바이트 동일, 생성 POST 0회 |
| `C3 preserves the intake text and the selected unsaved fragment editor across locale changes` | 두 편집 노드, 활성 탭, 분류·반영 방식, 미저장 원문과 입력값, 선택 범위 및 저장 레코드 유지 |
| `C4 keeps approvals, local receipts, semantic identity and the current report after a switch` | 실제 아틀라스와 시나리오 검증 준비 후 승인·저장 토큰·리비전·지문·영수증과 현재 보고서 유지, 재검증 POST 0회 |
| `C5 reload restores the interface preference across projects without saving either project` | 다른 프로젝트에서도 선호 복원, 두 저장 행 동일 |
| `C5 a blocked preference write still allows a session-only language change` | 저장 공간 쓰기 차단 후에도 선택과 편집 경로 유지, 정본 행 동일 |

기존 영어 접근성 이름을 검증하는 17개 테스트 파일은 각 파일에서 영어 선호를 설정한다. 기존 단언을 유지했고, 5C 원본 파일이나 전체 Vitest 설정에 영어 기본값을 넣지 않았다. 추가 검증에서는 잘못된 설정, 열린 로컬 소재 제안의 선택·편집·인용 보존, 미등록 공급자 진단 원본의 유지 여부를 확인했다. Atlas의 추가 테스트는 지도 확대·레이어·편집 상태를 유지하면서 한국어 SVG와 Markdown을 만들고 정본 바이트를 보존하는지 검사한다.

## 실제 검증

| 실행 | 결과 |
|---|---|
| `.\.venv\Scripts\python -m pytest -q` | 313개 통과, 기존 Starlette 경고 1개 |
| `npm.cmd --prefix frontend test -- --reporter=dot` | 41개 파일, 185개 통과. 5C 원본 6개와 추가 4개, 기존 소재·서사·시나리오·Atlas·세계관 사전·검증·저장 충돌을 포함한다. |
| `npm.cmd --prefix frontend run check:types`, `npm.cmd --prefix frontend run typecheck`, `npm.cmd --prefix frontend run build` | 타입 동기화, 엄격한 TypeScript, Vite 배포 빌드 통과. 번들은 두 언어를 담으며 청크 크기 경고가 있다. |
| `.\.venv\Scripts\python -m backend.tests.test_atlas_integration` | 루프백 API의 정상 프로젝트는 진행 상태 18개·결말 3개, 잘못된 지도 참조 두 건은 거절 |
| 스키마·워크플로·공백 검사 | 정본 Draft 4와 전송 Draft 2020-12 스키마 5종, `actionlint`, `git diff --check` 통과 |

브라우저 액세스 호스트를 열 수 없었다. 네이티브 글꼴·줄바꿈·키보드·화면 크기별 렌더링은 미검증이다. Vite 빌드, jsdom, 격리 fake IndexedDB를 실제 로컬 FastAPI에 연결해 잘못된 선호에서 한국어 시작, 영어 전환·재열기, 같은 텍스트 영역과 선택 범위, 저장 레코드 보존을 확인했다. 상태 조회 GET 2개에 200을 받았고 생성 POST는 없었다. 실제 ChatKHU·OpenAI 요청과 소비 크레딧은 0이다. 검증용 서버를 종료했다.

구조화 코드가 없는 일부 기존 내부 진단, 외부·과거 진단과 모델 소견, 기술 ID·경로·필드값은 필요할 때 원문으로 읽을 수 있다. JSON 내보내기는 기존 스키마를 사용한다. 시나리오·지도·검증의 사람이 읽는 보고서는 활성 언어로 제목과 표시 상태를 구성하며 증거와 창작 원문을 보존한다.

작업 트리에는 수정 69개와 신규 10개가 있다. 변경은 `frontend/src/locale.tsx` 및 화면별 번역 사전, UI 컴포넌트와 좁은 화면 줄바꿈, 검증 표시 및 읽기용 보고서, 테스트의 영어 선호 설정과 별도 회귀, README와 설계·증거 문서에 해당한다.

## 소유자 확인

1. PowerShell에서 `$env:WORLDWEAVER_PROVIDER = 'mock'`과 `.\scripts\start-dev.ps1`을 실행하고 `http://127.0.0.1:5173`을 연다.
2. 새 테스트 프로젝트를 열어 **소재 → 아이디어 붙여넣기**에서 여러 줄의 한영 원문을 작성한다. **규칙으로 정리** 후 초안 한 항목을 선택하고 편집하되 채택하지 않는다.
3. 머리글의 **인터페이스 언어**에서 **English**를 선택한다. 같은 창작 문장과 선택이 남고 **Add selected fragments** 같은 조작 문구가 영어로 바뀌는지 본다. **한국어**로 되돌리고 소재의 직접 편집 중에도 반복한다.
4. 기존 승인 자료에서 저장 없이 **세계 지도**와 **검증 에이전트**를 연다. 언어를 전환해도 지도·선택과 현재 보고서가 남는지 확인한다. 영어를 선택한 뒤 새로고침하고 다른 프로젝트를 열면 같은 선택을 사용한다.

소유자 GREEN 커밋에 권장하는 메시지는 `feat(locale): add Korean-first interface preferences outside projects`이다. 5D는 그 커밋 이후 별도 단계다.
