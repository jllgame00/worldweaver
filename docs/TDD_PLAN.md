# Test-first verification plan

Each feature starts with one behavior at its normal entry point. Write the smallest failing test, execute it, and check that it fails for the intended reason. Fix a broken harness before counting RED. Add minimum behavior, rerun the same test for GREEN, refactor and run the affected suite. Record actual commands, exit codes and observations in the [evidence ledger](TDD_EVIDENCE.md). If an existing behavior already passes, choose a real missing behavior or label the test characterization. Never reconstruct a missing RED.

Priority A protects accepted data and the core product. Priority B covers release and interaction gates. Order within each phase starts with A. The first three independent RED/GREEN candidates are N1, N2 and N3. All listed outcomes are planned.

| ID / priority | Test input or action | Expected observable behavior | Layer |
|---|---|---|---|
| N1 A | Mock returns 2, 3 or 4 candidates | Only three structurally complete candidates can replace a batch. No partial acceptance. | pytest, mock |
| N2 A | Mandatory item, exclusion and pinned fact, then regenerate | Coverage accounts for all entries, conflict blocks approval and fact text/IDs stay unchanged. Review the three directions for distinct decisions. | pytest mock + human rubric |
| N3 A | Malformed JSON, unknown property or bad coverage ID | Surface schema/reference error, retain the prior draft byte-for-byte in design fields. | pytest, mock integration |
| N4 A | Timeout/quota error after prior successful generation | Bounded retry applies only to transient errors. Original project stays usable. | pytest, mock |
| S1 A | Missing endpoint, wrong ID type or back edge | Reject dangling references and cycles including disconnected cycles. | pytest deterministic |
| S2 A | Unreachable mandatory quest or no reachable ending | Return affected IDs and a failed rule. | pytest deterministic |
| S3 A | Choice leads to a non-ending sink or prerequisite from the other branch | Report a blocked feasible play state even if topology appears connected. | pytest deterministic |
| W1 A | Replay normalized input, seed and engine version in separate processes | Identical serialized grid, points and paths. Input ordering cannot change placement. | pytest deterministic |
| W2 A | Ocean village, duplicate location ID, fractional or out-of-bounds point | Reject each mutation with the relevant entity or field. | pytest deterministic |
| W3 A | Remove the only road, or route a road through ocean | Required journey fails. A road cannot be treated as a ferry. | pytest deterministic |
| W4 A | Add an explicit port-to-port sea path then remove one port | Valid sea connection passes, implicit or malformed crossing fails. | pytest deterministic |
| I1 A | Select quest then place shared with another event | One canonical location resolves, reverse lookup lists exactly its events/quests. Unknown ID fails validation. | Vitest + Playwright |
| I2 A | Edit a pinned fact during generation, return old result | Affected stages become stale, old proposal cannot overwrite the edit, current checks required. | Vitest + API integration |
| I3 A | Round-trip synthetic project, stale draft and older/unknown version | Valid data and IDs survive. Unsupported version leaves the existing project intact. Add a migration fixture for every supported legacy version. | pytest + Vitest |
| A1 A | Spy on tools during generation and verification | Generator/validators invoked with actual revision and geometry. Verified status requires passing full receipts. | pytest mock + real validator integration |
| A2 A | Validator keeps failing and patcher keeps offering changes | Exactly two repair requests maximum, fresh checks after each applied patch, unresolved result. Missing receipt also fails final gate. | pytest integration |
| A3 A | Patcher proposes a changed ending or a pinned fact | Await user approval for the ending. Decline leaves prior design. Direct fact editor is the sole fact mutation path. | pytest + Vitest |
| A4 A | Cancel in flight, retry acceptance, open competing tab | No late write, duplicate application or lost local edit. | Vitest + Playwright |
| U1 B | Keyboard-only workflow at desktop and narrow viewport | Compare, select, inspect linked data, reopen, then export readable Markdown with outstanding findings. | Playwright, mock server |
| D1 B | CI on PR and deployment branch, empty or failed suite | Real test collection and execution plus Vite release build required. Empty/skipped required job prevents gate success. | CI integration |
| D2 B | Start release artifact, request health, UI and missing API route | Healthy response without provider key, UI loads, missing API returns JSON 404. | release smoke |
| D3 A | Put synthetic secret sentinel in server-only environment | Absent from assets, API errors and logs. CI receives no real provider credentials. | build inspection + integration |
| L1 B | Approved opt-in real-provider session with synthetic content | Record model/version, schema result, usage, human review and failure path. Preserve project on failure. | manual live, separate from CI |

Use small invariant fixtures for RED and the [synthetic example](examples/salt-census.json) for integration and controlled mutations. Round-trip comparisons preserve semantic JSON including array order where meaningful. Test constraints both before and after a mutation. For narrative review ask whether a decision changes who bears the consequence, whether facts still hold and which content lacks support. Record reviewer judgment separately. A mock response cannot establish live-provider behavior.
