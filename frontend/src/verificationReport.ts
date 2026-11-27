import type { AgentRun, Project, VerificationEntry } from './project.generated';
import { recordVerification, verificationIdentity } from './verificationHistory';
import { runVerification } from './verificationEngine';
import type { VerificationReport } from './verificationEngine';
import { verificationCopy as c } from './verificationCopy';

export const reportedCalls = (run: AgentRun) =>
  run.receipts.some((r) => ['semantic_cancelled', 'semantic_transport_unknown'].includes(r.tool))
    ? c.unknown
    : run.calls;

export async function confirmWorldReview(project: Project, runId: string, signal: AbortSignal) {
  const entry = project.verificationHistory?.find((row) => row.runId === runId);
  const fingerprint = await verificationIdentity(project);
  if (
    entry?.mode !== 'full' ||
    entry.fingerprint !== fingerprint ||
    !project.runs.some((r) => r.id === runId && r.mode === 'deterministic' && r.status === 'verified')
  )
    throw Error(c.expired);
  const report = await runVerification(project, { mode: 'full', signal });
  if (report.run.status !== 'verified' || signal.aborted) throw Error(c.incomplete);
  const next = persistReport(project, report, fingerprint);
  return { ...next, approval: { runId: report.run.id, revision: project.revision } };
}

export function persistReport(
  p: Project,
  report: VerificationReport,
  fingerprint: string,
  context?: Pick<VerificationEntry, 'provider' | 'model' | 'sourceRunId' | 'submittedIds' | 'revalidation'>,
  retain?: string,
): Project {
  const { run, tools, mode, targetId, paths, findings, statesExplored } = report;
  const entry: VerificationEntry = {
    runId: run.id,
    timestamp: new Date().toISOString(),
    fingerprint,
    mode,
    ...(targetId && { targetId }),
    ...context,
    tools,
    statesExplored,
    paths: paths.slice(0, 64),
    findings: findings.slice(0, 500),
    ...(findings.length > 500 && { omittedFindings: findings.length - 500 }),
    decisions: [],
  };
  return recordVerification(p, run, entry, retain);
}

export function verificationMarkdown(
  project: Project,
  entry: VerificationEntry,
  run: AgentRun,
  current: boolean,
) {
  const lines = [
    '# ' + project.title + ' · ' + c.title,
    '',
    c.mode[entry.mode] + ' · ' + entry.timestamp,
    'Scope: ' + (entry.targetId ?? c.scopeAll),
    'Snapshot: ' + entry.fingerprint,
    'Revision ' + run.baseRevision + ' · ' + run.status + ' · ' + (current ? c.current : c.stale),
    'Provider: ' +
      (entry.provider ?? 'none') +
      ' · ' +
      (entry.model ?? '—') +
      ' · requests ' +
      reportedCalls(run) +
      ' · tokens ' +
      (run.tokens ?? 'unreported'),
    '',
    '## ' + c.receipts,
    ...entry.tools.map((t) => '- ' + t.tool + ' · ' + t.status + ' · ' + t.detail),
    ...run.receipts.map((r) => '- ' + r.tool + ' · ' + r.outcome + ' · ' + r.detail),
    '',
    '## ' + c.findings,
  ];
  for (const f of entry.findings)
    lines.push(
      '',
      '### ' + f.rule + ' · ' + f.severity + ' · ' + f.origin,
      f.explanation,
      f.suggestedRepair,
      f.status + ' · ' + f.id + ' · ' + f.entityIds.join(', '),
      f.fieldPath ?? '',
      ...(f.blockedTransitions ?? []).map((b) => JSON.stringify(b)),
    );
  if (entry.omittedFindings) lines.push(c.limit + ' (' + entry.omittedFindings + ')');
  if (entry.submittedIds) lines.push('', c.submitted + ' · ' + entry.submittedIds.join(', '));
  for (const s of entry.proposals ?? [])
    lines.push(
      '',
      c.savedProposal + ' · ' + s.classification + ' · ' + s.status,
      ...s.edits.map((e) => '- ' + e.recordId + ' · ' + e.field + ' · ' + e.before + ' → ' + e.after),
      s.detail ?? '',
    );
  lines.push(
    '',
    c.unreviewed,
    '',
    '## ' + c.paths,
    ...entry.paths.map((path) => '- ' + path.nodeIds.join(' → ')),
    '',
    '## ' + c.actions,
    ...entry.decisions.map(
      (d) => '- ' + d.decision + ' · ' + d.recordId + ' · ' + d.field + ' · ' + d.before + ' → ' + d.after,
    ),
  );
  return lines.join('\n');
}
