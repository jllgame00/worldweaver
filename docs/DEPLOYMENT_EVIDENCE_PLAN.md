# 6C·6D HW6 배포 증거 수집

6B에서 수동으로 올린 공개 서비스를 확인했다. 다음에 문서 PR을 병합하면 실제 서비스의 첫 자동 배포를 검증할 수 있다. 아래 실패 캠페인은 소유자가 승인한 **별도 증거 저장소, Docker Hub 저장소, Render 서비스**에서 진행한다. 각 환경의 결과와 주소를 보고서에 구분한다. [6B 기준 및 자동 배포 확인](PHASE_6B_REPORT.md)

## 준비와 정상 기준 A

1. 검증한 릴리스의 코드를 증거 저장소에 사용한다. 동일한 `test.yml`과 보호된 `main`을 사용한다. `production` 환경의 대상은 증거용 `main`으로 제한한다. Docker Hub의 증거 전용 저장소와 Render 증거 서비스로 연결하고 해당 환경용 자격만 등록한다. [이미지 게시와 서비스 초기화](DEPLOYMENT_GUIDE.md)
2. 초기 이미지로 증거 서비스를 연 뒤, 증거 저장소에서 테스트가 통과하는 새 PR을 병합한다. `PUBLICATION_ENABLED`와 `DEPLOYMENT_ENABLED`를 `true`로 설정한 상태에서 이 `main` push의 이미지 검사, 게시, 자동 배포까지 모두 성공한 실행을 A로 기록한다. 두 값과 환경 승인 조건은 B·C에도 동일하게 유지한다.
3. 실행의 전체 SHA를 `$a`에, 실제 증거 서비스 HTTPS 주소를 `$evidenceOrigin`에 설정하고 아래 명령을 실행한다. A의 Git SHA, Actions URL, Docker digest, Render 배포 ID와 상태 확인 시각을 저장한다.

~~~powershell
.\.venv\Scripts\python.exe scripts/render_release.py smoke --origin $evidenceOrigin --commit $a
~~~

4. 같은 브라우저 프로필에서 증거 주소를 열어 폐기 가능한 Salt Census 작업용 사본 하나를 만든다. 식별하기 쉬운 이름을 주고 저장 상태, 장소 수, 승인 상태와 검증 기록을 확인한 뒤 프로젝트 JSON 백업을 받는다. A·C 모두 같은 주소와 프로필을 사용한다.

## 6C · 실제 테스트 실패로 배포 차단 B

1. **증거 저장소에서만** 브랜치를 만들어 아래 테스트를 `scripts/test_evidence_release_gate.py`에 추가한다. `owner/evidence_repo`를 실제 증거 저장소 전체 이름의 소문자로 바꾼다. 이 파일은 통상 PR 검사에는 통과하고 증거 저장소 `main`의 push에서 실제 pytest 실패를 낸다. 이 변경만 포함한 PR의 검사 성공을 확인하고 승인 후 병합한다.

~~~python
import os
import pytest


def test_controlled_evidence_release_gate():
    if (
        os.environ.get("GITHUB_REPOSITORY", "").lower() == "owner/evidence_repo"
        and os.environ.get("GITHUB_REF") == "refs/heads/main"
        and os.environ.get("GITHUB_EVENT_NAME") == "push"
    ):
        pytest.fail("HW6 controlled evidence release")
~~~

2. **병합으로 시작된 증거 저장소 `main` push**를 연다. 전체 SHA B, `push`, `refs/heads/main`, 활성 게시·배포 스위치와 A와 동일한 환경을 기록한다. B는 게시가 가능한 새 SHA여야 하며 해당 불변 태그가 Docker Hub에 없어야 한다.
3. pytest의 실패 테스트 ID와 메시지, `Tests and contracts` 실패, `Production frontend build` 건너뜀, `WORLDWEAVER required` 실패, 그리고 이미지 빌드·게시·배포 작업의 건너뜀을 캡처한다. Docker Hub에 B 태그가 추가되지 않았는지, Render 이벤트에 새 배포가 없는지 확인한다. 증거 서비스에서 위 스모크를 다시 실행해 여전히 **A**가 응답하는지 확인한다.
4. 예정한 테스트가 실패했는데 이미지 게시나 Render 호출이 실행되면 캠페인을 중단한다. 실행·이벤트 기록과 현재 제공 중인 SHA를 먼저 대조한다.

## 6D · 독립 복구 커밋 C와 데이터 확인

1. 증거 저장소에서 해당 임시 테스트만 제거한 PR을 별도 커밋으로 검토·병합한다. 같은 스위치와 환경에서 이 `main` push의 테스트, 필수 검사, 이미지 스모크, 게시, 자동 배포 단계가 성공해야 한다. Actions 실행의 전체 SHA를 `$c`에 기록해 아래 명령을 실행한다. 배포 작업의 Render ID와 게시 digest도 저장한다.

~~~powershell
.\.venv\Scripts\python.exe scripts/render_release.py smoke --origin $evidenceOrigin --commit $c
~~~

2. A에서 저장한 동일 브라우저 프로필과 HTTPS 주소에서 새로고침해 프로젝트를 다시 연다. 제목·장소 수·승인 상태·검증 이력과 정본 리비전을 대조한다. 폐기 가능한 사본에서만 JSON을 다시 가져와 같은 ID의 비교·취소·복원·직전본 다운로드를 확인한다.
3. 제출 기록에는 A/B/C의 전체 SHA, PR·Actions URL, 작업 결과, Render 배포 ID 또는 이벤트 부재, health 확인 시각과 SHA, 화면, 프로젝트 보존 관찰을 각각 기록한다. 캡처에는 시크릿 값과 개인 프로젝트 데이터를 포함하지 않는다. 실서비스 롤백을 강제로 시험하는 절차와 Phase 7의 하위 에이전트 검토·후속 커밋은 별도 승인 범위다.

## 기존 공개 데모를 쓰는 대안 · 승인 대기

기존 데모에도 테스트 단계에서만 동작하는 수동 실행 입력을 추가할 수 있다. 운영 코드와 정상 PR·push에서는 입력을 기본값으로 두고, 선택된 `main` 수동 실행에서만 실제 pytest 단언을 실패시킨다. 테스트 전후로 동일 공개 주소의 A SHA를 확인한다. 실패 실행에는 게시·배포 스위치와 환경을 모두 활성 상태로 두고, 현재 `main`인 새 미게시 SHA를 사용해야 한다. 이 SHA의 초기 push에서 자동 게시가 선행되지 않도록 별도로 조율해야 한다. 후속 정상 커밋은 기존 `main` 배포 흐름으로 검증한다.

이 방식은 별도 서비스가 필요 없고 일반 main 테스트를 깨지 않는다. 운영 대상에서 검증하므로 스위치·실행 타이밍 관리가 필요하고, 게이트에 결함이 있으면 운영에 영향을 줄 수 있다. 수동 실행의 실패는 push 배포 차단과 증거 형식이 다르므로 채점 기준이 수동 실행을 인정하는지 확인해야 한다. **현재 계획은 위 격리 환경 방식이다. 대안의 설정과 테스트는 소유자 승인 전에는 적용하지 않는다.**
