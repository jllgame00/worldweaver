import { narrativeFresh } from './project';
import type { Project } from './project.generated';
import { isProject } from './validation';
import { verificationIdentity } from './verificationHistory';
import { sources } from './verificationTools';

export async function validateBackup(project: Project) {
  if (!isProject(project)) throw Error('Invalid project file.');
  const verifyRuns = new Set(project.runs.filter(run => run.stage === 'verify').map(run => run.id));
  if (project.verificationHistory?.some(entry => entry.sourceRunId &&
    (entry.sourceRunId === entry.runId || !verifyRuns.has(entry.sourceRunId))))
    throw Error('Missing or invalid source verification run.');
  if (project.approval && sources(project, await verificationIdentity(project)).issues.length)
    throw Error('Invalid final approval.');
}

export function importedDesign(backup: Project, id = backup.id): Project {
  const next = structuredClone(backup);
  next.id = id;
  delete next.approval;
  if (next.narrative?.approved && !narrativeFresh(next)) next.narrative.approved = false;
  if (next.scenario) next.scenario.approved = false;
  if (next.world?.approved) next.world.approved = false;
  for (const entry of next.verificationHistory ?? []) entry.archived = true;
  for (const finding of next.findings) {
    finding.status = 'superseded';
    if (id !== backup.id) {
      finding.entityIds = finding.entityIds.map(ref => ref === backup.id ? id : ref);
      for (const citation of finding.evidence ?? []) if (citation.id === backup.id) citation.id = id;
    }
  }
  return next;
}
