import type { Project } from './project.generated';
import { findingsOf, type ScenarioFinding } from './ScenarioFindings';
import { recoveryProject } from './referenceRepair';

export interface RejectedDraft {
  findings: ScenarioFinding[];
  recovery: unknown;
}
const format = 'worldweaver.rejected-scenario.v1';
const storeName = 'originals';
export const diagnosticMaxBytes = 16 * 1024 * 1024;

function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function hasKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return (
    record(value) && Object.keys(value).length === keys.length && keys.every((k) => Object.hasOwn(value, k))
  );
}
export function checkedRejection(value: unknown): RejectedDraft {
  if (!hasKeys(value, ['findings', 'recovery'])) throw Error('Invalid rejected proposal file.');
  const recovery = value.recovery;
  if (
    !hasKeys(recovery, ['baseRevision', 'additions', 'design']) ||
    !Number.isSafeInteger(recovery.baseRevision) ||
    !hasKeys(recovery.design, ['nodes', 'edges', 'quests', 'endings', 'scenario']) ||
    !record(recovery.design.scenario) ||
    recovery.design.scenario.approved !== false ||
    !hasKeys(recovery.additions, ['characters', 'factions', 'stateEntities'])
  )
    throw Error('Invalid rejected proposal.');
  const findings = findingsOf(value.findings);
  if (!findings.some((f) => f.severity === 'error'))
    throw Error('A rejected proposal must include a blocking finding.');
  return { recovery, findings };
}
export function writeRecoveryFile(projectId: string, original: RejectedDraft): string {
  return JSON.stringify({ format, projectId, original: checkedRejection(original) }, null, 2);
}
export function readRecoveryFile(project: Project, text: string): RejectedDraft {
  if (new Blob([text]).size > diagnosticMaxBytes) throw Error('Diagnostic file is too large.');
  const file: unknown = JSON.parse(text);
  if (
    !hasKeys(file, ['format', 'projectId', 'original']) ||
    file.format !== format ||
    file.projectId !== project.id
  )
    throw Error('Select a rejected scenario file from this project.');
  const original = checkedRejection(file.original);
  recoveryProject(project, original.recovery);
  return original;
}

// Separate database: an unreviewed design can never enter the Projects listing.
function openOriginals(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('worldweaver-rejected-scenarios-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('Rejected proposal storage is unavailable.'));
  });
}
async function accessOriginal(
  projectId: string,
  operation: 'read' | 'keep' | 'dismiss',
  expected?: RejectedDraft,
) {
  const db = await openOriginals();
  try {
    return await new Promise<{ original?: RejectedDraft; removed: boolean }>((resolve, reject) => {
      const tx = db.transaction(storeName, operation === 'read' ? 'readonly' : 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.get(projectId);
      let original: RejectedDraft | undefined,
        removed = false;
      tx.oncomplete = () => resolve({ original, removed });
      tx.onabort = () => reject(tx.error ?? Error('Rejected proposal storage failed.'));
      request.onsuccess = () => {
        try {
          if (request.result !== undefined) original = checkedRejection(request.result);
          if (operation === 'keep' && !original && expected) {
            original = expected;
            store.add(original, projectId);
          }
          if (
            operation === 'dismiss' &&
            original &&
            expected &&
            JSON.stringify(original) === JSON.stringify(checkedRejection(expected))
          ) {
            store.delete(projectId);
            removed = true;
          }
        } catch (error) {
          tx.abort();
          reject(error);
        }
      };
    });
  } finally {
    db.close();
  }
}
export async function loadRejection(projectId: string) {
  return (await accessOriginal(projectId, 'read')).original;
}
export async function keepRejection(project: Project, rejected: RejectedDraft): Promise<RejectedDraft> {
  const original = checkedRejection(rejected);
  recoveryProject(project, original.recovery);
  return (await accessOriginal(project.id, 'keep', original)).original!;
}
export async function dismissRejection(projectId: string, expected: RejectedDraft) {
  return (await accessOriginal(projectId, 'dismiss', expected)).removed;
}
