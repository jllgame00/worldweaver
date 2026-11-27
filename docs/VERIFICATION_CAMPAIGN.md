# Phase 4 교차 도메인 신뢰성 캠페인

**44/44건이 사전 분류와 일치했다.** 합성 42건과 소유자의 과거 진단 사본 2건에서 예상한 차단 규칙 누락 0건, 허용한 후속 증상 외의 차단 오류 0건, 정상으로 분류한 사례의 차단 오탐 0건이었다. 모든 입력 프로젝트의 실행 전후 해시가 일치했다. [사전 분류와 변형](../frontend/scripts/verification-cases.mjs) · [실행 드라이버](../frontend/scripts/verification-campaign.mjs)

시드 42의 합성 통합 프로젝트를 기반으로 선형·분기·퀘스트 상태·지상/지하 배치·경로 결함·승인 리비전을 바꿨다. 기존 v1 프로젝트와 중단·오래된 응답도 별도로 검사했다. 프런트엔드 런타임이 실제 FastAPI의 진행 탐색을 루프백으로 호출했다. 백분위는 준비 시간과 수리 실험을 제외한 각 최초 검사 실행 시간이다. 중앙값 71 ms, p95 75 ms, 범위 0–87 ms였다.

기대 열은 반드시 발견해야 하는 차단 규칙이다. 허용되는 후속 증상도 실행 전에 사례별로 정의했다. 실제 열은 발견한 차단 규칙을 중복 없이 표시한다. 도구 열에는 계획한 도구 중 통과 이외 상태를 모두 적었다. 전체 검사의 도구는 schema, references, sources, progression, atlas, coverage다. 검사 성공 여부와 발견된 도메인 오류, 보류된 승인, 실행 취소를 구분한다.

| 사례 | 기대 차단 규칙 | 실제 차단 규칙 | 실행 상태 | 도구 결과 | 탐색 상태 / 엔딩 | ms |
|---|---|---|---|---|---:|---:|
| 1. Branching project with two endings and a buried vault | — | — | verified | 모두 통과 | 6 / 2 | 87 |
| 2. Single linear ending | — | — | verified | 모두 통과 | 5 / 1 | 74 |
| 3. Reference edge pointing back to prologue | — | — | verified | 모두 통과 | 6 / 2 | 73 |
| 4. Scene cut between distant places with no corridors | — | — | verified | 모두 통과 | 6 / 2 | 69 |
| 5. Quest chain with delayed completion, two prerequisites and a final guard | — | — | verified | 모두 통과 | 8 / 2 | 75 |
| 6. Optional branch skipped on the direct ending path | — | — | verified | 모두 통과 | 7 / 2 | 71 |
| 7. Unplaced optional legacy state registry inferred from authored terms | — | — | verified | 모두 통과 | 6 / 2 | 70 |
| 8. Legacy graph with illustrative geometry and no scenario header | — | — | unresolved | sources incomplete, atlas skipped | 6 / 2 | 6 |
| 9. Impossible prologue with two future visits | scenario.blocked_start, scenario.mandatory_unreachable, scenario.ending_unreachable, scenario.no_reachable_ending | scenario.blocked_start, scenario.ending_unreachable, scenario.mandatory_unreachable, scenario.no_reachable_ending | unresolved | progression failed | 0 / 0 | 73 |
| 10. Impossible exit with no flag producer | scenario.progression_blocked, scenario.ending_unreachable | scenario.ending_unreachable, scenario.progression_blocked | unresolved | progression failed | 5 / 1 | 71 |
| 11. Simultaneous incompatible conditions | scenario.contradictory_condition | scenario.contradictory_condition | unresolved | progression failed, atlas incomplete | 0 / 0 | 71 |
| 12. Quest guard requiring an unknown lifecycle state | scenario.quest_state_value | scenario.quest_state_value | unresolved | progression failed, atlas incomplete | 0 / 0 | 71 |
| 13. Only side quest required on main progression | scenario.side_quest_required | scenario.side_quest_required | unresolved | progression failed | 6 / 2 | 72 |
| 14. Cycle through authored progression | scenario.cycle | scenario.cycle | unresolved | progression failed, atlas incomplete | 0 / 0 | 70 |
| 15. Two prologue scenes | scenario.prologue | scenario.prologue | unresolved | progression failed, atlas incomplete | 0 / 0 | 70 |
| 16. Unattached ending record | scenario.ending_detail | scenario.ending_detail | unresolved | progression failed, atlas incomplete | 0 / 0 | 72 |
| 17. Wrong-type character in location slot | references.typed, scenario.reference, world.location_missing | references.typed, scenario.reference, world.location_missing | unresolved | references failed, progression failed, atlas incomplete | 0 / 0 | 72 |
| 18. Duplicated canonical character ID | references.duplicate_id, scenario.duplicate_id | references.duplicate_id, scenario.duplicate_id | unresolved | references failed, progression failed, atlas incomplete | 0 / 0 | 71 |
| 19. Missing mandatory fragment coverage | references.project, coverage.fragment | coverage.fragment, references.project | unresolved | references failed, coverage failed | 6 / 2 | 72 |
| 20. Missing canonical fact trace | coverage.scenario, scenario.source_coverage | coverage.scenario, scenario.source_coverage | unresolved | progression failed, atlas incomplete, coverage failed | 0 / 0 | 71 |
| 21. Stale narrative upstream approval | sources.narrative, sources.scenario, sources.world | sources.narrative, sources.scenario, sources.world | unresolved | sources failed | 6 / 2 | 70 |
| 22. Unapproved scenario with a downstream approved atlas | sources.world | sources.world | unresolved | sources failed | 6 / 2 | 69 |
| 23. Stale atlas stamps | sources.world | sources.world | unresolved | sources failed | 6 / 2 | 72 |
| 24. Final approval refers to a generation receipt | sources.approval | sources.approval | unresolved | sources failed | 6 / 2 | 72 |
| 25. Disconnected required journey | world.journey_unreachable | world.journey_unreachable | unresolved | atlas failed | 6 / 2 | 68 |
| 26. Route with an interior gap | world.route_geometry | world.journey_unreachable, world.route_geometry | unresolved | atlas failed | 6 / 2 | 73 |
| 27. Underground vault moved to surface | world.constraint_beneath, world.location_overlap | world.constraint_beneath, world.journey_unreachable, world.location_overlap, world.route_endpoint | unresolved | atlas failed | 6 / 2 | 71 |
| 28. Engineered canal required but absent | world.constraint_canal | world.constraint_canal | unresolved | atlas failed | 6 / 2 | 70 |
| 29. Engineered aqueduct required but absent | world.constraint_aqueduct | world.constraint_aqueduct | unresolved | atlas failed | 6 / 2 | 69 |
| 30. Out-of-bounds atlas marker | world.location_position | references.project, world.location_position, world.route_endpoint | unresolved | references failed, atlas failed | 6 / 2 | 70 |
| 31. Inconsistent territory reference | world.territory, references.project | references.project, world.territory | unresolved | references failed, atlas failed | 6 / 2 | 70 |
| 32. Terrain dimensions inconsistent with elevation | world.terrain-elevation | world.terrain-elevation | unresolved | atlas failed | 6 / 2 | 70 |
| 33. Scoped quest review | — | — | proposed | 모두 통과 | 6 / 2 | 72 |
| 34. Unknown target | scope.target | scope.target | unresolved | schema failed, references skipped, sources skipped, progression skipped, atlas skipped, coverage skipped | 0 / 0 | 1 |
| 35. Cancellation after schema receipt | — | — | cancelled | references skipped, sources skipped, progression skipped, atlas skipped, coverage skipped | 0 / 0 | 1 |
| 36. Concurrent design edit after schema receipt | — | — | stale | references skipped, sources skipped, progression skipped, atlas skipped, coverage skipped | 0 / 0 | 0 |
| 37. Bounded exploration exhausted | scenario.state_budget | scenario.state_budget | unresolved | progression incomplete, atlas incomplete | 1024 / 0 | 86 |
| 38. Reversed route distance simulated on detached draft | world.route_geometry | world.journey_unreachable, world.route_geometry | unresolved | atlas failed | 6 / 2 | 70 |
| 39. Repair targeting pinned fact is rejected | — | — | verified | 모두 통과 | 6 / 2 | 72 |
| 40. Repair with a stale source revision is rejected | — | — | verified | 모두 통과 | 6 / 2 | 69 |
| 41. Mutually exclusive hard rules about one territorial boundary | world.conflicting_constraints, world.constraint_outside | world.conflicting_constraints, world.constraint_outside | unresolved | atlas failed | 6 / 2 | 71 |
| 42. Unstructured conflicting locked statements require editorial judgment | — | — | verified | 모두 통과 | 6 / 2 | 71 |
| 43. Owner diagnostic copy | scenario.blocked_start | scenario.blocked_start, scenario.ending_unreachable, scenario.mandatory_unreachable, scenario.no_reachable_ending | unresolved | sources incomplete, progression failed, atlas skipped | 0 / 0 | 47 |
| 44. Owner locally edited diagnostic copy | — | — | unresolved | sources incomplete, atlas skipped | 31 / 3 | 46 |

38번은 거리 10 km 오류를 찾고 격리 사본의 거리를 복원한 뒤 전체를 재검사했다. 차단 오류 0개, 지도 승인 대기였다. 39번 고정 사실 변경과 40번 오래된 수리 요청은 거절됐다. 이 세 사례의 원본 설계와 승인은 보존됐다. 다른 행은 검사 전용이다. 41번은 동일 장소를 같은 지역 안과 밖에 동시에 두라는 강제 규칙의 충돌이다. 42번은 정오의 문이 열려 있고 닫혀 있다는 두 자연어 고정 사실이다. 결정 도구는 이 문장의 진위를 판정하지 않으며 보고서에 편집 검토 범위를 표시한다.

43번의 프롤로그에서 미래 퀘스트 장면과 엔딩의 방문 상태가 모두 비어 있었다. 실제 제목 세 개가 원인 설명에 포함됐는지 검사했다. 원본에는 선택 장면의 도달 가능성 경고도 있었다. 44번은 기존 프롤로그 수정 초안이며 시나리오 승인과 지도 승인은 미완료다. 두 파일은 각기 바이트가 같은 별도 사본에서 읽었고 원본 SHA-256 동일성을 확인했다. 이 결과는 최신 소유자 브라우저의 상태나 AI의 편집 정확도를 측정하지 않는다.

## 재실행

루트의 첫 PowerShell에서 다음 명령으로 mock 서버를 시작한다.

```powershell
$env:WORLDWEAVER_PROVIDER = 'mock'
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8794 --no-access-log
```

두 번째 PowerShell에서 `node frontend/scripts/verification-campaign.mjs`를 실행하면 합성 42건이 출력된다. 허가된 과거 진단본을 검사하려면 명령 뒤에 차단 원본 사본 경로와 수정 초안 사본 경로를 순서대로 추가한다. 각 결과의 `unexpected`, `missed`, `warnings`, `tools`, `repair`, `unchanged`, `ms`에 세부 관측이 기록된다. 종료 후 첫 터미널에서 Ctrl+C를 누른다. 독립적인 UI 실험 파일만 만들려면 추가 서버 없이 `node frontend/scripts/verification-campaign.mjs --demo-only`를 실행한다.
