import type { AgentRun, Project, VerificationEntry, RepairEdit, SavedRepair } from './project.generated';
import { verificationCopy as c } from './verificationCopy';

export async function verificationIdentity(project: Project): Promise<string> {
  const { revision, runs, findings, verificationHistory, approval, scenario, ...design } = project;
  const ordered = JSON.stringify(
    { ...design, scenario: scenario && { ...scenario, layout: undefined } },
    (_key, value: unknown) => {
      if (value && typeof value === 'object' && !Array.isArray(value))
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
      return value;
    },
  );
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ordered));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function recordVerification(
  project: Project,
  run: AgentRun,
  entry: VerificationEntry,
  retain?: string,
): Project {
  if (
    entry.runId !== run.id ||
    project.runs.some((row) => row.id === run.id) ||
    run.baseRevision !== project.revision
  )
    throw Error('The verification snapshot has expired.');
  const history = [...(project.verificationHistory ?? []), entry];
  const expired = new Set(
    history
      .filter((row) => row.runId !== retain && row.runId !== project.approval?.runId)
      .slice(0, Math.max(0, history.length - 12))
      .map((row) => row.runId),
  );
  const retainedRuns = project.runs.filter(
    (row) =>
      !expired.has(row.id) ||
      project.approval?.runId === row.id ||
      project.findings.some((f) => f.runId === row.id),
  );
  return {
    ...project,
    runs: [...retainedRuns, run],
    verificationHistory: history.filter((row) => !expired.has(row.runId)),
  };
}

export function reserveRepair(
  project: Project,
  runId: string,
  changes: RepairEdit[],
  classification: SavedRepair['classification'],
): Project {
  const run = project.runs.find((row) => row.id === runId),
    entry = project.verificationHistory?.find((e) => e.runId === runId);
  if (!entry || !run || run.repairAttempts >= 2 || (entry.proposals?.length ?? 0) >= 2) throw Error(c.budget);
  const [first, ...rest] = changes;
  if (
    !first ||
    changes.length > 12 ||
    changes.some((edit) => edit.findingId !== first.findingId) ||
    !entry.findings.some((f) => f.id === first.findingId)
  )
    throw Error(c.invalidSelection);
  const proposal: SavedRepair = {
    edits: [first, ...rest],
    sourceRevision: project.revision,
    classification,
    status: 'pending',
    beforeTools: [],
    afterTools: [],
  };
  const previous = entry.proposals?.[0];
  const proposals: VerificationEntry['proposals'] = previous ? [previous, proposal] : [proposal];
  return {
    ...project,
    runs: project.runs.map((r) => (r === run ? { ...run, repairAttempts: run.repairAttempts + 1 } : r)),
    verificationHistory: project.verificationHistory?.map((e) => (e === entry ? { ...e, proposals } : e)),
  };
}

export function updateRepair(
  project: Project,
  runId: string,
  id: string,
  patch: Pick<SavedRepair, 'status' | 'detail' | 'beforeTools' | 'afterTools'>,
): Project {
  const entry = project.verificationHistory?.find((e) => e.runId === runId);
  const proposals = entry?.proposals;
  const selected = proposals?.find((s) => s.edits[0].proposalId === id);
  if (!entry || !proposals || !selected) throw Error(c.expired);
  const updated = structuredClone(proposals);
  const destination = updated.find((s) => s.edits[0].proposalId === id)!;
  Object.assign(destination, patch);
  return {
    ...project,
    verificationHistory: project.verificationHistory?.map((e) =>
      e === entry ? { ...e, proposals: updated } : e,
    ),
  };
}
