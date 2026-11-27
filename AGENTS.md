# Working on WORLDWEAVER

Build a tool for narrative designers who need editable branches tied to traversable places. Start with the requested phase in [PLANS](PLANS.md) and the relevant acceptance criteria in the [product specification](docs/PRODUCT_SPEC.md). Stop at the phase gate.

- Read the [schema](docs/DATA_SCHEMA.md) before changing an entity, the [architecture](docs/ARCHITECTURE.md) before crossing a service boundary, and the [agent workflow](docs/AGENT_WORKFLOW.md) before changing generation or repair. Preserve user-approved requirements. Record open decisions explicitly.
- Keep portable design data in one Project. Use stable IDs in both views. Derive reverse indexes. Only an explicit user edit can change a CanonicalFact. Preserve approved work on failure, cancellation or stale responses.
- Keep provider calls and credentials on the server. Treat imported files, model outputs and creative text as untrusted data. Validate structure, references and domain invariants at boundaries. Record narrative judgment separately from structural checks.
- Use English identifiers, strict TypeScript and typed Python boundaries. Follow existing conventions, use small modules and review affected callers. Limit changes to the requested behavior. Keep transient files in ignored scratch space.
- Follow the [TDD plan](docs/TDD_PLAN.md) for feature work. Observe the intended RED before implementation, then GREEN and refactor. Never weaken a test to accept a defect. Record actual commands and outcomes in the [evidence ledger](docs/TDD_EVIDENCE.md). Label deterministic, mock and live evidence accurately.
- From Phase 5, follow the [owner commit gates](docs/PHASE_5_PLAN.md). For one authorized group, change tests/fixtures only, run the focused tests, report the intended collected failure and stop. The owner makes the RED commit. Verify its SHA, contents and failure before implementing. Run focused and full checks, report GREEN and stop for the owner's separate implementation commit. Verify and record both actual SHAs before the next group. Preserve the individual commits through a regular PR merge.
- Review the working tree before and after edits. Preserve unrelated work. Never hardcode credentials or include prompts, project files or secrets in logs. Commit, push and deploy only with explicit authorization.
- Complete a change when its acceptance criteria, affected tests, validation and documentation agree. Report failures, skipped checks and outstanding decisions. A successful schema check establishes structure only.

Development skills guide repository work. Runtime agents are application services. The [Phase 0 report](docs/PHASE_0_REPORT.md) records where the four development skills are available.
