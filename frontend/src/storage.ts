import type { Project } from './project.generated';
import { isProject } from './validation';
import { sameScenarioInputs, validationRun } from './scenarioApproval';
import { importedDesign, validateBackup } from './backupProject';

export interface SavedProject {
  project: Project;
  token: string;
  savedAt: number;
  scenarioCheckRunId?: string;
  hasRecovery?: true;
}

export class SaveConflict extends Error {}

const storeName = 'projects';
const recoveryStore = 'previousProjects';

function validRecord(value: unknown): value is SavedProject {
  if (!value || typeof value !== 'object') return false;
  return 'project' in value && isProject(value.project) && 'token' in value && typeof value.token === 'string'
    && 'savedAt' in value && typeof value.savedAt === 'number' && Number.isFinite(value.savedAt);
}

function open(databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 2);
    let blocked = false;
    request.onupgradeneeded = event => {
      if (event.oldVersion === 0) request.result.createObjectStore(storeName, { keyPath: 'project.id' });
      request.result.createObjectStore(recoveryStore, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('IndexedDB open blocked')); };
  });
}

async function readById(databaseName: string, store: string, id: string): Promise<unknown> {
  const db = await open(databaseName);
  try {
    return await new Promise((resolve, reject) => {
      const read = db.transaction(store).objectStore(store).get(id);
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    });
  } finally { db.close(); }
}

export async function readSavedProject(databaseName: string, id: string) {
  const row = await readById(databaseName, storeName, id);
  if (row === undefined || validRecord(row)) return row;
  throw Error('Unreadable project record.');
}

export async function readRecoveryProject(databaseName: string, id: string) {
  const project = await readById(databaseName, recoveryStore, id);
  if (project === undefined || isProject(project)) return project;
  throw Error('Unreadable recovery record.');
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
  return writeProject(databaseName, project, expectedToken, false, checkedRunId);
}

export async function restoreProject(databaseName: string, backup: Project, expectedToken: string) {
  const snapshot = structuredClone(backup);
  await validateBackup(snapshot);
  return writeProject(databaseName, importedDesign(snapshot), expectedToken, true);
}

async function writeProject(databaseName: string, project: Project, expectedToken: string | undefined, restore: boolean, checkedRunId?: string): Promise<SavedProject> {
  const database = await open(databaseName);
  const record: SavedProject = { project, token: crypto.randomUUID(), savedAt: Date.now() };
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(restore ? [storeName, recoveryStore] : storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const read = store.get(project.id);
      let failure: unknown;
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('IndexedDB save aborted'));
      read.onsuccess = () => {
        const current: unknown = read.result;
        const previous = validRecord(current) ? current : undefined;
        try {
          if (current === undefined ? restore || expectedToken !== undefined : !previous || previous.token !== expectedToken)
            throw new SaveConflict();
          if (restore && previous) {
            project.revision = previous.project.revision + 1;
            if (!Number.isSafeInteger(project.revision) || !isProject(project)) throw Error('Invalid restore revision or design.');
            transaction.objectStore(recoveryStore).put(previous.project);
            record.hasRecovery = true;
          } else {
            if (previous?.hasRecovery) record.hasRecovery = true;
            if (checkedRunId) record.scenarioCheckRunId = checkedRunId;
            else if (previous && validationRun(project, previous.scenarioCheckRunId) &&
                sameScenarioInputs(previous.project, project)) record.scenarioCheckRunId = previous.scenarioCheckRunId;
          }
          store.put(record);
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
    });
    return record;
  } finally {
    database.close();
  }
}
