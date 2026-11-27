import type { World } from './project.generated';
import { structurallyValidWorld } from './validation';
import { SaveConflict } from './storage';

export interface AtlasDraft {
  base: number;
  world: World;
}
interface Record {
  token: string;
  draft: AtlasDraft;
}

function valid(draft: AtlasDraft) {
  return (
    Number.isSafeInteger(draft?.base) &&
    draft.base >= 0 &&
    structurallyValidWorld(draft.world) &&
    !!draft.world.settings &&
    draft.world.approved === false
  );
}

function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name + '-atlas-proposals-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('Atlas working-copy storage is blocked.'));
  });
}

// Reading the expected token and replacing the record in one transaction serializes competing tabs.
async function access(name: string, projectId: string, change?: { expected?: string; next?: AtlasDraft }) {
  const db = await open(name);
  try {
    return await new Promise<Record | undefined>((resolve, reject) => {
      const tx = db.transaction('drafts', change ? 'readwrite' : 'readonly');
      const store = tx.objectStore('drafts'),
        read = store.get(projectId);
      let result: Record | undefined, failure: unknown;
      read.onsuccess = () => {
        try {
          result = read.result;
          if (result !== undefined && (!result || typeof result.token !== 'string' || !valid(result.draft)))
            throw Error('The saved atlas working copy cannot be opened.');
          if (!change) return;
          if (result?.token !== change.expected)
            throw new SaveConflict(
              'Another tab changed the working copy. Reopen this project before editing or approving it.',
            );
          if (change.next) {
            if (!valid(change.next)) throw Error('The atlas working copy has an invalid format.');
            result = { token: crypto.randomUUID(), draft: change.next };
            store.put(result, projectId);
          } else {
            result = undefined;
            store.delete(projectId);
          }
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? tx.error ?? Error('Atlas working-copy storage failed.'));
    });
  } finally {
    db.close();
  }
}

export const readAtlasDraft = (name: string, id: string) => access(name, id);
export const writeAtlasDraft = (name: string, id: string, expected?: string, next?: AtlasDraft) =>
  access(name, id, { expected, next });
