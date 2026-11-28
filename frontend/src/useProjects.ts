import { useEffect, useRef, useState } from 'react';
import type { Project } from './project.generated';
import { listProjects, SaveConflict, saveProject } from './storage';
import type { SavedProject } from './storage';

interface PendingSave {
  project: Project;
  conflict: boolean;
  checkedRunId?: string;
  afterSave?: () => void;
}

export function useProjects(databaseName: string) {
  const current = useRef<SavedProject | undefined>(undefined);
  const writing = useRef(false);
  const [record, setRecord] = useState<SavedProject>();
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<'unreadableProjects' | 'storageUnavailable'>();
  const [pending, showPending] = useState<PendingSave>();
  const pendingSave = useRef<PendingSave | undefined>(undefined);

  function setPending(next: PendingSave | undefined) {
    pendingSave.current = next;
    showPending(next);
  }

  useEffect(() => {
    let active = true;
    void listProjects(databaseName).then(({ projects, unreadable }) => {
      if (!active) return;
      setProjects(projects);
      if (unreadable) setLoadError('unreadableProjects');
    }).catch(() => { if (active) setLoadError('storageUnavailable'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [databaseName]);

  function select(next: SavedProject | undefined) {
    current.current = next;
    setRecord(next);
  }

  function adopt(saved: SavedProject) {
    setProjects(previous => [saved, ...previous.filter(row => row.project.id !== saved.project.id)]);
    select(saved);
    setPending(undefined);
  }

  async function commit(project: Project, checkedRunId?: string, afterSave?: () => void): Promise<boolean> {
    // An in-flight callback must not replace the draft the owner can retry or download.
    const draft = pendingSave.current;
    if (writing.current || (draft && (draft.conflict || draft.project !== project))) return false;
    writing.current = true;
    setSaving(true);
    try {
      const active = current.current;
      const saved = await saveProject(databaseName, project, active?.project.id === project.id ? active.token : undefined, checkedRunId);
      adopt(saved);
    } catch (error) {
      setPending({ project, conflict: error instanceof SaveConflict, checkedRunId, afterSave });
      return false;
    } finally {
      writing.current = false;
      setSaving(false);
    }
    afterSave?.();
    return true;
  }

  async function reopen(id: string) {
    setLoadError(undefined);
    try {
      const { projects, unreadable } = await listProjects(databaseName);
      const saved = projects.find(({ project }) => project.id === id);
      if (!saved) {
        setLoadError('unreadableProjects');
        return undefined;
      }
      setProjects(projects);
      if (unreadable) setLoadError('unreadableProjects');
      select(saved);
      setPending(undefined);
      return saved.project;
    } catch {
      setLoadError('storageUnavailable');
      return undefined;
    }
  }

  return { current, writing, record, projects, loading, saving, loadError, pending, select, adopt, commit, reopen };
}
