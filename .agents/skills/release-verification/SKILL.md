---
name: release-verification
description: Use when assessing a WORLDWEAVER release candidate, investigating a CI result or checking an explicitly authorized deployment.
---

# Release verification

**Inputs.** Identify the exact candidate revision, current phase gate, CI configuration and logs, frontend artifact, service configuration and applicable deployment authorization. Read the [DevOps plan](../../../docs/DEVOPS_PLAN.md) and [test plan](../../../docs/TDD_PLAN.md).

1. Inspect the commands CI executed for that revision. Check test discovery and executed counts for backend, frontend and critical end-to-end flows. Investigate empty suites, unexpected skips and steps allowed to fail. Confirm the production frontend build completed and the assembled service serves its frontend and health endpoint.
2. Inspect tracked files, built client assets, export samples, environment names and logs for exposed secrets. Examine server-side credential injection, log redaction and the configured provider mode. Record the location and category of any suspect value with its value redacted.
3. Trace the deployment trigger to the tested revision and successful required checks. Keep offline mock evidence and separately authorized live-provider results distinct. A deployment requires explicit authorization for this target and revision or release scope. For an authorized rollout, record the deployed revision, health response, and critical smoke flow before accepting the rollout.

**Failure handling.** Hold a release on missing tests, broken CI gates, unhealthy service or suspected credential exposure. Preserve redacted evidence. If a real credential escaped, involve its owner for revocation or rotation, rebuild and rescan. Report an unexecuted live check or deployment as pending.

**Evidence and completion.** Record candidate and environment, CI run, commands, test counts and exits, build output, security check result, provider mode, health result and outstanding blockers. Distinguish local readiness, CI verification and deployed verification in the verdict. Mark each applicable gate passed, failed or unverified from its own evidence.
