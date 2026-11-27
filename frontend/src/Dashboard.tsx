import { useState } from 'react';
import type { FormEvent } from 'react';
import { useWorkspaceCopy } from './workspaceLocale';
import { useFormatter } from './locale';
import { candidatesFresh, narrativeFresh } from './project';
import type { SavedProject } from './storage';

interface DashboardProps {
  projects: SavedProject[];
  loading: boolean;
  disabled: boolean;
  open: (id: string) => void;
  create: (title: string) => Promise<boolean>;
  sample?: { title: string; create: () => void };
}

export default function Dashboard({ projects, loading, disabled, open, create, sample }: DashboardProps) {
  const copy = useWorkspaceCopy();
  const format = useFormatter();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [invalid, setInvalid] = useState(false);
  const titles = new Set<string>(), repeated = new Set<string>();
  for (const { project } of projects) {
    if (titles.has(project.title)) repeated.add(project.title);
    titles.add(project.title);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setInvalid(true);
      event.currentTarget.querySelector('input')?.focus();
      return;
    }
    await create(title.trim());
  }

  return (
    <>
      <div className="page-heading heading-actions">
        <div><p className="eyebrow">{copy.workspace}</p><h1>{copy.projects}</h1></div>
        {!creating && !loading && <div className="actions">
          {sample && <button type="button" disabled={disabled} onClick={sample.create}>{sample.title}</button>}
          <button type="button" className="primary" disabled={disabled} onClick={() => setCreating(true)}>{copy.newProject}</button>
        </div>}
      </div>
      {creating && <form className="panel create-form" onSubmit={submit}>
        <fieldset disabled={disabled}>
          <label>{copy.projectTitle}<input value={title} required autoFocus aria-invalid={invalid}
            aria-describedby={invalid ? 'title-error' : undefined} onChange={({ target }) => { setTitle(target.value); setInvalid(false); }} /></label>
          {invalid && <p id="title-error" className="error">{copy.blank}</p>}
          <div className="actions"><button type="submit" className="primary">{copy.createProject}</button>
            <button type="button" className="quiet" onClick={() => { setCreating(false); setTitle(''); setInvalid(false); }}>{copy.cancel}</button></div>
        </fieldset>
      </form>}
      <section className="panel projects-panel" aria-labelledby="project-list-heading">
        <div className="section-heading"><h2 id="project-list-heading">{copy.localProjects}</h2><span className="count">{format.number(projects.length)}</span></div>
        {loading ? <p role="status">{copy.loadingProjects}</p> : projects.length === 0 ? <p className="empty">{copy.emptyProjects}</p> : (
          <ul className="project-list">
            {projects.map(({ project, savedAt }) => (
              <li key={project.id}>
                <div><h3 className="creative">{project.title}</h3><time dateTime={new Date(savedAt).toISOString()}>{format.date(savedAt, { dateStyle: 'medium', timeStyle: 'short' })}</time>
                  {repeated.has(project.title) && <small id={'saved-' + project.id}> · ID {project.id}</small>}</div>
                <span className="pill">{project.narrative ? (narrativeFresh(project) ? (project.narrative.approved ? copy.approved : copy.draft) : copy.stale)
                  : project.storyCandidates.length ? (candidatesFresh(project) ? copy.directions : copy.stale) : copy.content}</span>
                <button type="button" disabled={disabled} aria-label={copy.open(project.title)}
                  aria-describedby={repeated.has(project.title) ? 'saved-' + project.id : undefined}
                  onClick={() => open(project.id)}>{copy.openProject}</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
