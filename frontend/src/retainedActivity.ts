import { intakeHistory, intakeStorageKey } from './intakeModel';
import type { IntakeReceipt } from './intakeModel';
import type { AgentRun, Project } from './project.generated';
import { reportedCalls } from './verificationReport';

export function readIntakeReceipts(database: string, projectId: string) {
  try {
    const raw = localStorage.getItem(intakeStorageKey(database, projectId));
    return raw === null ? [] : intakeHistory(JSON.parse(raw).history);
  } catch {
    return undefined;
  }
}

const counts = () => ({ calls: 0, responses: 0, failed: 0, rejected: 0, unknown: 0 });
type Purpose = AgentRun['stage'] | 'extract';
type Mode = 'live' | 'mock';

export function retainedActivity(project: Project, receipts: IntakeReceipt[]) {
  const totals = { live: counts(), mock: counts() };
  const purposes: Record<Purpose, Record<Mode, number>> = {
    candidates: { live: 0, mock: 0 }, scenario: { live: 0, mock: 0 }, verify: { live: 0, mock: 0 },
    world: { live: 0, mock: 0 }, extract: { live: 0, mock: 0 },
  };
  let fallback = 0, local = 0, deterministic = 0, accepted = 0, declined = 0;
  for (const event of receipts) {
    if (event.outcome === 'accepted') { accepted++; continue; }
    if (event.outcome === 'rejected') { declined++; continue; }
    if (event.method === 'fallback' || event.method === 'local') {
      if (event.outcome === 'completed') {
        if (event.method === 'fallback') fallback++;
        else local++;
      }
      continue;
    }
    const row = totals[event.method];
    if (event.dispatches === undefined) row.unknown++;
    else { row.calls += event.dispatches; purposes.extract[event.method] += event.dispatches; }
    row.responses += event.responses ?? 0;
    if (event.outcome === 'invalid' && event.responses === 1) row.rejected++;
    if (event.dispatches === 1 && event.responses === 0 &&
      ['timeout', 'failed', 'authentication'].includes(event.outcome)) row.failed++;
  }
  const seen = new Set<string>();
  for (const run of project.runs) {
    if (seen.has(run.id)) continue;
    seen.add(run.id);
    if (run.mode === 'deterministic') { deterministic++; continue; }
    const row = totals[run.mode];
    const calls = reportedCalls(run);
    if (typeof calls !== 'number') { row.unknown++; continue; }
    row.calls += calls;
    purposes[run.stage][run.mode] += calls;
    if (!calls) continue;
    // A legacy run can report a dispatch total without a per-attempt outcome.
    const returned = run.receipts.filter(r => (r.tool === 'generate_structured' && r.outcome === 'passed')
      || (r.tool === 'semantic_review' && r.outcome === 'advice')).length;
    const invalid = run.receipts.some(r => r.outcome === 'failed'
      && (['check_candidates', 'check_scenario'].includes(r.tool)
        || ['invalid_provider_response', 'invalid_review_evidence', 'provider_incomplete',
          'provider_refused', 'provider_content_filter', 'provider_output_limit'].includes(r.detail)));
    const responses = Math.min(calls, Math.max(returned, Number(invalid)));
    row.responses += responses;
    row.rejected += Number(invalid);
    row.failed += Math.min(calls - responses, run.receipts.filter(r => r.outcome === 'failed'
      && ['generate_structured', 'semantic_review'].includes(r.tool)
      && ['provider_timeout', 'provider_unavailable', 'provider_authentication', 'provider_error'].includes(r.detail)).length);
  }
  const reports = new Map((project.verificationHistory ?? []).map(r => [r.runId, r]));
  const dates = [...reports.values()].map(r => Date.parse(r.timestamp)).filter(Number.isFinite).sort((a, b) => a - b);
  return { totals, purposes, fallback, local, deterministic, accepted, declined, dates,
    runs: seen.size, reports: reports.size, archived: [...reports.values()].filter(r => r.archived).length };
}
