# Phase 6C-R1·6D · HW6 배포 차단 및 복구 증거

**`PHASE_6C_READY_FOR_OWNER_REVIEW` (R1)** — 보호된 공개 `main`의 임시 pytest, 기준 A, 아래 실행 절차를 오너가 검토한다. 실제 B·C는 각각 소유자 승인 후 실행한다. [공개 기준 A의 기록](PHASE_6B_REPORT.md)

## 실행 환경

2026-11-28 02:56 UTC에 공개 브랜치 API에서 `main`의 SHA가 기준 A이고, `protected=true`, `enforcement_level=everyone`이며 `WORLDWEAVER required`와 `Build and smoke-test release image`가 필수 검사로 등록된 것을 확인했다. 적용 ruleset API는 `[]`였다. 상세 보호 API는 인증을 요구하므로 **PR 강제 및 병합 방식은 오너 사전 점검**에 남겨 두었다. 공개 저장소와 Render 데모를 사용하면 같은 주소에서 기준 A와 복구 C를 검증할 수 있다. 사전 조건을 확인할 수 없거나 정규 병합이 차단되면 아래 격리 절차를 사용한다. [브랜치 조회](https://api.github.com/repos/jllgame00/worldweaver/branches/main) · [적용 ruleset 조회](https://api.github.com/repos/jllgame00/worldweaver/rules/branches/main) · [배포 가이드](DEPLOYMENT_GUIDE.md)

임시 테스트는 GitHub Actions에서 `jllgame00/worldweaver`의 `refs/heads/main`에 대한 `jllgame00` 계정의 `push`를 검사한다. push가 강제 푸시가 아니고 `before`가 A, `after`가 실행 SHA여야 한다. 실행 커밋의 부모가 두 개여야 하며 첫째는 A다. 병합 커밋 본문에 **둘째 부모 SHA를 명시한 독립된 승인 줄**이 있을 때만 실제 단언이 실패한다. PR, 수동 실행, 로컬 실행, 다른 저장소와 A 이후의 후속 push에는 적용되지 않는다. B 재실행에는 원래 실행자와 SHA가 유지되므로 복구는 별도 C 커밋으로 한다. [GitHub 기본 변수](https://docs.github.com/en/actions/reference/workflows-and-actions/variables#default-environment-variables) · [push 페이로드](https://docs.github.com/en/webhooks/webhook-events-and-payloads#push)

## 1. 오너 사전 점검과 정상 기준 A

1. GitHub **Settings → Branches**에서 `main`에 PR과 두 필수 검사가 적용되고 오너도 동일한 보호를 받는지 읽기 전용으로 확인한다. 보호 규칙을 지키면서 GitHub의 일반 **Create a merge commit**으로 병합할 수 있어야 한다. **Settings → Environments → production**의 대상 및 필요한 승인 조건, **Settings → Secrets and variables → Actions → Variables**의 `PUBLICATION_ENABLED=true`, `DEPLOYMENT_ENABLED=true`를 확인한다. Render에서 A가 활성이고 다른 배포나 수동 작업이 예약돼 있지 않은지 확인한다. 설정과 자격증명은 그대로 둔다. 실험 종료까지 관련 없는 main 병합과 배포는 보류한다.
2. 아래 스모크 결과와 health JSON, UTC 시각을 저장한다. GitHub `main`과 공개 서비스가 모두 A여야 한다. [기준 A의 Actions 실행](https://github.com/jllgame00/worldweaver/actions/runs/46019534340) · [배포 로그](https://github.com/jllgame00/worldweaver/actions/runs/46019534340/job/140577373724)

   ~~~powershell
   $repo = 'jllgame00/worldweaver'
   $origin = 'https://worldweaver-8mbz.onrender.com'
   $a = '33abe573d3378a7471344d30eb31d0e3d2e13a19'
   gh api "repos/$repo/branches/main" --jq '.commit.sha'
   ./.venv/Scripts/python.exe scripts/render_release.py smoke --origin $origin --commit $a
   [DateTime]::UtcNow.ToString('o')
   Invoke-RestMethod -Uri "$origin/health" -Headers @{'Cache-Control'='no-cache'} | ConvertTo-Json -Compress
   ~~~

3. Render 배포 ID `dep-dc4pjg8u01pc73eu9b10`와 다이제스트 `sha256:446097c166f507d0820a0df93817937b4ed02d6d59edf1de49fc5f480067f041`가 활성인지 기록한다. 전용 브라우저 프로필에서 **프로젝트 → Salt Census → 작업용 사본 만들기** 후 **검증 에이전트 → 빠른 검사 실행**으로 기록 하나를 저장한다. 목록에서 사본을 다시 열어 기록을 확인하고 **프로젝트 관리 → 프로젝트 백업 다운로드**를 선택한다. 제목, 프로젝트 ID·리비전, 장소 수, 승인 상태, 최신 검사 기록을 보관한다. JSON은 로컬에 두고 C까지 같은 프로필과 HTTPS 주소를 사용한다. [공개 예제 검수](PHASE_5E_ACCEPTANCE.md)

## 2. Phase 6C · 실제 실패 B

1. A에서 `feature/deployment-gate-verification` 브랜치를 만들고 [임시 테스트 파일](../scripts/test_controlled_deployment_gate.py)만 `test(devops): add owner-approved deployment gate failure exercise`로 커밋한다. 문서는 검토 자료로 남겨 둔다. 통상 PR을 열고 Changed files가 이 파일 하나인지, 두 필수 검사와 일반 테스트가 성공했는지 확인한다. 승인할 정확한 PR HEAD는 다음 명령으로 조회한다. 병합 직전 GitHub `main`이 여전히 A인지 다시 확인하고 Docker Hub 태그 목록과 Render Events/Deploys를 보관한다.

   ~~~powershell
   $pr = Read-Host 'B PR number'
   gh pr checks $pr --repo $repo --required
   $head = gh pr view $pr --repo $repo --json headRefOid --jq '.headRefOid'
   "HW6-Controlled-Failure: approve-merge $head"
   ~~~

2. 오너가 PR 번호·HEAD·A·대상 주소·승인 시각을 기록한 다음, 직접 아래 정규 병합 명령을 실행한다. GitHub가 확인한 PR HEAD가 검토한 SHA와 달라지면 병합이 거절된다. 현재 규칙이 일반 병합을 허용하지 않으면 중단한다. [GitHub CLI 병합 옵션](https://cli.github.com/manual/gh_pr_merge)

   ~~~powershell
   $actor = gh api user --jq '.login'
   if ($LASTEXITCODE -ne 0 -or $actor -cne 'jllgame00') { throw 'Check the owner account.' }
   $main = gh api "repos/$repo/branches/main" --jq '.commit.sha'
   if ($LASTEXITCODE -ne 0 -or $main -cne $a) { throw 'Baseline A changed.' }
   gh pr checks $pr --repo $repo --required
   if ($LASTEXITCODE -ne 0 -or $head -cnotmatch '^[0-9a-f]{40}$') { throw 'Review the PR checks and SHA.' }
   $body = New-TemporaryFile
   try {
       Set-Content -LiteralPath $body.FullName -Encoding ascii -Value "HW6-Controlled-Failure: approve-merge $head"
       gh pr merge $pr --repo $repo --merge --match-head-commit $head --body-file $body.FullName
       if ($LASTEXITCODE -ne 0) { throw 'The protected merge did not succeed.' }
   } finally {
       Remove-Item -LiteralPath $body.FullName
   }
   ~~~
3. 병합으로 시작한 `WORLDWEAVER CI`의 `main` **push** 실행에서 B 전체 SHA와 URL을 저장한다. B 커밋의 첫째·둘째 부모가 순서대로 A와 `$head`인지 확인하고, 병합 전 목록에 `sha-<B 전체 SHA>` 태그가 없었음을 기록한다. 스위치 두 값이 여전히 `true`인지 확인한다. CI에는 필요한 승인 절차만 적용하고 예상 밖의 게시 또는 배포 승인 요청이 나타나면 승인하지 않는다.

   ~~~powershell
   $b = gh pr view $pr --repo $repo --json mergeCommit --jq '.mergeCommit.oid'
   gh api "repos/$repo/commits/$b" --jq '.parents[].sha'
   gh run list --repo $repo --workflow test.yml --branch main --event push --commit $b --json headSha,url,conclusion
   ~~~

4. `Tests and contracts → Backend regression`에서 실제 테스트 ID와 단언을 캡처한다. `WORLDWEAVER required` 로그가 `Tests: failure. Build: skipped.`이고, 프런트엔드 빌드·컨테이너 빌드 및 스모크·이미지 게시·Render 배포의 네 작업이 모두 `skipped`인지 확인한다.

   ~~~text
   scripts/test_controlled_deployment_gate.py::test_controlled_deployment_gate
   AssertionError: HW6 controlled deployment-gate demonstration: owner-approved pytest failure
   assert not True
   ~~~

5. Docker Hub에 B 태그가 없고 Render Events/Deploys에 B 구간의 신규 배포가 없으며 A의 배포 ID와 다이제스트가 계속 활성인지 확인한다. 1절의 공개 스모크와 `/health` 조회를 다시 실행해 B 종료 뒤에도 A의 SHA가 응답한 UTC 시각과 결과를 보관한다.
6. 지정 단언 외의 실패나 예상 밖의 게시·배포·health 결과가 나오면 기록을 보존하고 실험을 중단한다. 실제 호스팅 실패, 후속 작업 생략, Docker Hub·Render 기록, A의 health가 모두 일치할 때 6C 완료를 기록한다.

## 3. Phase 6D · 독립 복구 C 및 IndexedDB

1. B의 증거를 수집하고 오너가 복구를 승인하면 최신 `main` B에서 복구 브랜치를 만든다. 임시 pytest 파일만 제거하고 `test(devops): remove controlled deployment gate failure exercise`로 커밋한다. 새 PR의 필수 검사와 이미지 스모크가 성공한 뒤 승인 문구 없이 정규 병합한다. 이 별도 C 커밋의 `main` push에서 동일한 스위치·환경으로 여섯 작업이 모두 성공해야 한다.
2. 실행의 C 전체 SHA와 URL, `Publish verified image` 로그의 새 digest, `Deploy digest and verify release` 로그의 새 Render 배포 ID 및 동일 digest를 기록한다. Render의 최신 성공 배포와 대조한다. C가 A와 다른 SHA·digest·배포 ID인지 확인한 뒤 같은 공개 주소를 검증한다.

   ~~~powershell
   $recoveryPr = Read-Host 'C PR number'
   $c = gh pr view $recoveryPr --repo $repo --json mergeCommit --jq '.mergeCommit.oid'
   ./.venv/Scripts/python.exe scripts/render_release.py smoke --origin $origin --commit $c
   [DateTime]::UtcNow.ToString('o')
   Invoke-RestMethod -Uri "$origin/health" -Headers @{'Cache-Control'='no-cache'} | ConvertTo-Json -Compress
   ~~~

3. A와 동일한 브라우저 프로필 및 HTTPS 주소에서 새로고침하고, JSON을 가져오기 전에 기존 사본의 제목·ID·리비전·장소 수·승인 상태·최신 검사 기록을 비교한다. Chromium에서 **Application → IndexedDB → worldweaver-v1 → projects**의 같은 프로젝트 ID를 읽기 전용으로 확인한다. 필요하면 백업을 새로 받아 로컬에서 ID·리비전을 대조한다.
4. C에서 배포나 스모크가 실패하면 결과를 실패로 기록하고 현재 SHA와 Render 이력을 확인한다. 실제 복원이 필요하면 증거와 대상을 확인한 뒤 별도 오너 승인을 받는다. [롤백 절차](DEPLOYMENT_GUIDE.md#4-이관재배포복구)

## 보호 조건을 충족할 수 없을 때

새 인프라는 별도 승인 후 사용한다. 증거용 GitHub 저장소, 불변 태그가 적용된 별도 Docker Hub 저장소, Render Existing Image 서비스, 증거 대상에만 유효한 자격증명을 준비한다. 기존 워크플로를 복제하고 증거 환경에 PR과 두 필수 검사가 적용되는 `main`, `main`으로 제한된 `production` 환경 및 쓰기 대상 하나를 구성한다. 테스트 없는 정상 자동 배포에서 두 스위치가 `true`인 별도 기준 A를 먼저 기록한다. 증거 브랜치의 임시 테스트에서 `EXERCISE_REPOSITORY`와 `BASELINE_COMMIT`을 해당 저장소·기준 A로 바꾸고, 오너 계정이 다르면 `GITHUB_ACTOR` 비교값도 고친다. 조건을 다시 로컬 검증하고, 위 절차의 저장소·주소·SHA를 증거 환경 값으로 대체해 진행한다. 공개 기준 A의 health는 별도로 기록한다. [초기 이미지와 서비스 설정](DEPLOYMENT_GUIDE.md)

제출에는 A/B/C의 SHA, PR·Actions URL과 작업 결과, digest·배포 ID 또는 B 구간의 배포 부재, UTC health와 브라우저 관찰을 담는다. 자격증명과 개인 프로젝트 데이터는 제외한다. [로컬 검증 원장](TDD_EVIDENCE.md)
