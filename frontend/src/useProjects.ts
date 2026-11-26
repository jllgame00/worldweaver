import { useEffect, useRef, useState } from 'react';
import { copy } from './copy';
import type { Project } from './project.generated';
import { listProjects, SaveConflict, saveProject } from './storage';
import type { SavedProject } from './storage';

interface PendingSave {
  project: Project;
  conflict: boolean;
}

export function useProjects(databaseName: string) {
  const current = useRef<SavedProject | undefined>(undefined);
  const writing = useRef(false);
  const [record, setRecord] = useState<SavedProject>();
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [pending, setPending] = useState<PendingSave>();

  useEffect(() => {
    let active = true;
    void listProjects(databaseName).then(({ projects, unreadable }) => {
      if (!active) return;
      setProjects(projects);
      if (unreadable) setLoadError(copy.unreadableProjects);
    }).catch(() => { if (active) setLoadError(copy.storageUnavailable); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [databaseName]);

  function select(next: SavedProject | undefined) {
    current.current = next;
    setRecord(next);
  }

  async function commit(project: Project): Promise<boolean> {
    if (writing.current) return false;
    writing.current = true;
    setSaving(true);
    try {
      const active = current.current;
      const saved = await saveProject(databaseName, project, active?.project.id === project.id ? active.token : undefined);
      setProjects((previous) => [saved, ...previous.filter(({ project: existing }) => existing.id !== project.id)]);
      select(saved);
      setPending(undefined);
      return true;
    } catch (error) {
      setPending({ project, conflict: error instanceof SaveConflict });
      return false;
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }

  async function reopen(id: string) {
    setLoadError(undefined);
    try {
      const { projects, unreadable } = await listProjects(databaseName);
      const saved = projects.find(({ project }) => project.id === id);
      if (!saved) {
        setLoadError(copy.unreadableProjects);
        return undefined;
      }
      setProjects(projects);
      if (unreadable) setLoadError(copy.unreadableProjects);
      select(saved);
      setPending(undefined);
      return saved.project;
    } catch {
      setLoadError(copy.storageUnavailable);
      return undefined;
    }
  }

  return { current, writing, record, projects, loading, saving, loadError, pending, select, commit, reopen };
}
