import type { Project } from './project.generated';
import { isProject } from './validation';
import { sameScenarioInputs, validationRun } from './scenarioApproval';

export interface SavedProject {
  project: Project;
  token: string;
  savedAt: number;
  scenarioCheckRunId?: string;
}

export class SaveConflict extends Error {}

const storeName = 'projects';

function validRecord(value: unknown): value is SavedProject {
  if (!value || typeof value !== 'object') return false;
  return 'project' in value && isProject(value.project) && 'token' in value && typeof value.token === 'string'
    && 'savedAt' in value && typeof value.savedAt === 'number' && Number.isFinite(value.savedAt);
}

function open(databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(storeName, { keyPath: 'project.id' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

export async function listProjects(databaseName: string): Promise<{ projects: SavedProject[]; unreadable: boolean }> {
  const database = await open(databaseName);
  try {
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const read = database.transaction(storeName).objectStore(storeName).getAll();
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    });
    const projects = rows.filter(validRecord).sort((a, b) => b.savedAt - a.savedAt);
    return { projects, unreadable: rows.length !== projects.length };
  } finally {
    database.close();
  }
}

export async function saveProject(databaseName: string, project: Project, expectedToken?: string, checkedRunId?: string): Promise<SavedProject> {
  if (!isProject(project)) throw new Error('Invalid project');
  if (checkedRunId && validationRun(project, checkedRunId)?.baseRevision !== project.revision)
    throw new Error('The validation receipt does not match the checked revision.');
  const database = await open(databaseName);
  const record: SavedProject = { project, token: crypto.randomUUID(), savedAt: Date.now() };
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const read = store.get(project.id);
      let conflicted = false;
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(conflicted ? new SaveConflict() : transaction.error ?? new Error('IndexedDB save aborted'));
      read.onsuccess = () => {
        const current: unknown = read.result;
        const previous = validRecord(current) ? current : undefined;
        if (current === undefined ? expectedToken !== undefined : !previous || previous.token !== expectedToken) {
          conflicted = true;
          transaction.abort();
          return;
        }
        if (checkedRunId) record.scenarioCheckRunId = checkedRunId;
        else if (previous && validationRun(project, previous.scenarioCheckRunId) &&
            sameScenarioInputs(previous.project, project)) record.scenarioCheckRunId = previous.scenarioCheckRunId;
        store.put(record);
      };
    });
    return record;
  } finally {
    database.close();
  }
}
