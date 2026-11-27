# 6C·6D HW6 배포 증거 수집

6A에서는 아래 캠페인을 실행하지 않는다. 소유자가 승인한 전용 증거 저장소, Docker Hub 저장소와 별도 Render 서비스에서 동일한 `test.yml`을 사용한다. 증거용 저장소의 보호된 main, production 환경, 별도의 최소 권한 자격, 두 스위치가 모두 켜져 있는 상태를 먼저 확인한다. 실제 서비스의 브랜치 보호와 시크릿은 그대로 둔다.

1. **A · 정상 기준**. [부트스트랩](DEPLOYMENT_GUIDE.md) 후 새 커밋 A의 main push에서 required, container, publish, deploy까지 통과시킨다. Git SHA·워크플로 URL·배포 ID·이미지 digest·health 응답·공개 화면을 기록한다. HTTPS 주소와 브라우저 프로필을 기록하고 폐기 가능한 예제 사본을 저장한다. 이름, 장소 수, 승인 상태, 검증 이력을 기록하고 JSON 백업을 받는다.
2. **B · 실패 차단**. 전용 증거 저장소에서 새 PR로 의도적 실패 테스트 한 개를 추가한다. 예를 들어 테스트에서 `GITHUB_REPOSITORY`가 해당 증거 저장소이고 `GITHUB_REF == "refs/heads/main"`, `GITHUB_EVENT_NAME == "push"`일 때만 명시적으로 `pytest.fail("HW6 controlled evidence release")`한다. 이 지점을 6C에서 별도 커밋 B로 기록한다. PR에서도 원래 회귀는 전부 실행한다. 승인된 병합 뒤 **게시·배포가 가능한 main push 실행**을 캡처한다.
3. B 실행에서 실제 실패한 테스트 ID와 로그, `Tests and contracts` 실패, frontend build 건너뜀, `WORLDWEAVER required` 실패와 container/publish/deploy 건너뜀을 한 흐름으로 보존한다. ref, event, 스위치, 환경 승인 조건이 A와 같음을 함께 기록한다. Render에 B 배포 이벤트가 생기지 않았고 기존 주소의 스모크가 여전히 A SHA로 성공하는지 확인한다.
4. **C · 정상 복구**. 의도적 실패를 제거한 독립 커밋 C를 새 PR로 검토·병합한다. 같은 조건에서 모든 검사와 실제 배포가 통과하는지 확인한다. 새 다이제스트와 배포 ID, 운영 화면과 `/health`의 전체 C SHA를 함께 캡처한다. 복구를 위해 CI 단계를 건너뛰거나 동일 불변 태그를 덮어쓰지 않는다.
5. **저장 확인**. A와 같은 프로필·HTTPS origin에서 새로고침한다. 예제 사본의 제목·장소·승인·검증 이력을 확인한다. 사본 JSON을 다시 가져와 같은 ID 비교에서 한 번 취소하고, 폐기용 사본에서만 복원·직전본 다운로드·다시 열기를 확인한다. 서버 재배포가 프로젝트 리비전을 변경했는지도 대조한다.
6. **제출물**. A/B/C 각각 Git SHA, PR URL, Actions URL과 job 결과, Render 이벤트, 건강 검사 시각과 SHA, 스크린샷 경로, 지속성 관찰 결과, 미확인 항목을 표 한 줄로 남긴다. 소유자 개인 프로젝트·토큰·세션·환경 변수 값은 캡처에서 제외한다. 자동 롤백은 별도 승인 없이 실서비스에서 강제하지 않는다. Phase 7의 실제 하위 에이전트 검토와 후속 수정 커밋은 별도 증거다.
