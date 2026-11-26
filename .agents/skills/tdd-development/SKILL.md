---
name: tdd-development
description: Use when a WORLDWEAVER feature, regression, or behavior change enters implementation.
---

# TDD development

**Inputs.** Identify the approved phase, one observable acceptance criterion, its public entry point and the smallest reproducible input. Look up its test layer and evidence location in the [test plan](../../../docs/TDD_PLAN.md).

1. **RED.** Write a test for the expected behavior before implementing it. Use a mock at the provider boundary for ordinary CI. Run the named test, verify it was collected, and retain the failing assertion and input. Fix unrelated setup or discovery errors and retry until the intended behavior fails.
2. **GREEN.** Make the smallest change that satisfies the criterion. Rerun the same test with the original assertion. Check callers and run the affected regression suite.
3. **REFACTOR.** Simplify only the touched behavior while the tests pass. Rerun the relevant suite after the last edit.

**Failure handling.** An initially passing case can document existing behavior. Choose an actual missing behavior for the next cycle. If code already preceded the test, preserve the contributor's work and disclose the missing RED. A later replay against an old revision can establish regression sensitivity only. Keep the assertion that expresses the approved behavior.

**Evidence and completion.** Record the criterion, test ID, commands, expected and observed assertion, exit statuses, counts, provider mode and final regression result in the [evidence log](../../../docs/TDD_EVIDENCE.md). A completed cycle requires an observed pre-implementation RED, a subsequent GREEN and a passing final run. Mark any missing observation explicitly.
