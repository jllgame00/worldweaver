import type { Project, ValidationFinding } from './project.generated';
import type { VerificationReport } from './verificationEngine';
import { runVerification } from './verificationEngine';
import { repairDraft, type RepairEdit } from './verificationRepair';
import { verificationIdentity } from './verificationHistory';
import { verificationCopy as c } from './verificationCopy';

export function incomplete(report: Pick<VerificationReport, 'run' | 'tools'>) {
  return (
    ['failed', 'cancelled', 'stale', 'running'].includes(report.run.status) ||
    report.tools.some(
      (t) =>
        (t.status === 'incomplete' && t.tool !== 'sources') ||
        t.status === 'cancelled' ||
        (t.status === 'failed' && !t.findings),
    )
  );
}
const approvalFinding = (f: ValidationFinding) =>
  [
    'world.source',
    'sources.approval',
    'sources.narrative',
    'sources.world',
    'sources.scenario',
    'atlas.source',
  ].includes(f.rule);
const identity = (f: ValidationFinding) => JSON.stringify([f.rule, f.entityIds, f.fieldPath, f.explanation]);

export async function simulateRepairs(
  project: Project,
  edits: RepairEdit[],
  source: ValidationFinding,
  fingerprint: string,
  signal: AbortSignal,
) {
  if ((await verificationIdentity(project)) !== fingerprint) throw Error(c.expired);
  const draft = repairDraft(project, edits, project.revision);
  const before = await runVerification(project, { mode: 'full', signal });
  if (incomplete(before)) throw Error(c.incomplete);
  const after = await runVerification(draft, { mode: 'full', signal });
  let problem: string | undefined;
  if (incomplete(after)) problem = c.incomplete;
  const beforeErrors = new Set(before.findings.filter((f) => f.severity === 'error').map(identity));
  // An upstream semantic edit intentionally expires downstream source approvals.
  const upstream =
    draft.versions.scenario !== project.versions.scenario ||
    draft.versions.narrative !== project.versions.narrative;
  const introduced = after.findings.find(
    (f) => f.severity === 'error' && !(upstream && approvalFinding(f)) && !beforeErrors.has(identity(f)),
  );
  if (!problem && introduced) problem = c.harmful + ' ' + introduced.explanation;
  if (
    !problem &&
    source.origin === 'deterministic' &&
    (!before.findings.some((f) => f.id === source.id) || after.findings.some((f) => f.id === source.id))
  )
    problem = c.unchanged;
  return { draft, before, after, problem };
}
