# Release and operations plan

Phase 6 introduces GitHub Actions and an authorized Render deployment. Start with one web service serving the compiled frontend and Python API. Keep the canonical project in the browser and portable files. Deployment should be replaceable without migrating designer data.

~~~mermaid
flowchart LR
  PR[Pull request or main update] --> B[Locked dependency install]
  B --> P[pytest with mock provider]
  B --> F[Vitest and Vite production build]
  P --> E[Playwright plus release smoke]
  F --> E
  E --> Q[Required aggregate check]
  Q -->|Success on authorized main SHA| R[Render builds same revision]
  Q -->|Failure or missing job| X[Stop deployment]
  R --> H[Health and frontend smoke]
  H --> D[Record SHA and redeploy evidence]
~~~

1. In the implementation phases pin runtime versions and lock dependencies. Document tested local install and start commands once manifests exist. Use minimal Actions permissions, no provider secret in PRs, and cache dependency downloads keyed by lockfile. Cancel obsolete runs where safe.
2. Run pytest, Vitest, the production build and a critical Playwright journey against the packaged server and mock responses on pull requests and every deployment-branch revision. Capture real collection counts, fail on zero tests and upload sanitized failure diagnostics with short retention.
3. Require an aggregate check that always evaluates all required job outcomes and fails unless each actually succeeded. Trigger required checks without path exclusions on the deploy branch. Use branch protection and Render's **After CI Checks Pass** mode. Render can treat neutral/skipped jobs as passing, so verify the aggregate job on a deliberate failure before enabling auto-deploy. If the gate cannot be demonstrated, leave deployment off. [Render deployment behavior](https://render.com/docs/deploys)
4. Build the same revision with locked dependencies, serve static assets from FastAPI and bind to the host-assigned port. Keep provider configuration and quotas server-side. Verify GET /health without a provider call, load a deep-linked frontend route, check API 404 behavior and confirm the service revision. Compare live SHA with the successful CI SHA.
5. For an authorized re-deploy, record old/new service event IDs or timestamps, source SHA, gate result, health and UI smoke. Exercise a failed release on a controlled branch or staging service. If smoke fails, suspend automatic promotion, restore the last verified revision under release authorization and repeat smoke checks. Browser storage survives an ordinary redeploy at the same origin. JSON backups cover profile or origin changes.
6. Run the isolated, opt-in live provider test with synthetic inputs and an explicit budget. Record provider/model/date, sanitized result summary, tool receipts and measured usage. Exclude prompts, credentials and user project data from artifacts. Scan the built JS, server errors and logs using a fake sentinel before the live test.

## Sustainability and evidence

Compare calls, retries, reported tokens, geometry time, build time and artifact sizes for the same fixture across revisions. Reuse accepted intermediate stages until their inputs change. Use local deterministic geography and validators, mock ordinary CI, and recheck affected domains on edit. Keep a full check at approval/release. These are measurable engineering choices. Energy or carbon impact requires separate measurement.

Release checklist and test IDs are in the [test plan](TDD_PLAN.md). The [matrix](HW6_REQUIREMENTS_MATRIX.md) tracks course-facing proof. Service plan, exposure controls, budgets and exact versions need confirmation before release.
