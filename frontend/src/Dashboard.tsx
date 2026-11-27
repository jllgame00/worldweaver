import { useState } from 'react';
import type { FormEvent } from 'react';
import { useWorkspaceCopy } from './workspaceLocale';
import { useFormatter } from './locale';
import { ProjectEntry } from './ProjectEntry';
import { newId } from './project';
import type { Project } from './project.generated';
import { importedDesign, validateBackup } from './backupProject';
import { importProject } from './scenarioWorkflow';
import { StudioIcon } from './StudioIcon';
import { useWorkbenchCopy } from './workbenchCopy';
import type { SavedProject } from './storage';

interface DashboardProps {
  projects: SavedProject[];
  loading: boolean;
  disabled: boolean;
  open: (id: string) => void;
  create: (title: string) => Promise<boolean>;
  openExample: (project:Project) => Promise<void>;
  sample?: { title: string; create: () => void };
}

export default function Dashboard({ projects, loading, disabled, open, create, sample, openExample }: DashboardProps) {
  const copy = useWorkspaceCopy();
  const ui = useWorkbenchCopy();
  const [reading, setReading] = useState(false), [exampleError, setExampleError] = useState(false);
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

  async function example() {
    if (reading) return;
    setReading(true); setExampleError(false);
    try {
      const response = await fetch(import.meta.env.BASE_URL + 'examples/salt-census.json');
      if (!response.ok) throw Error();
      const project = importProject(await response.text());
      await validateBackup(project);
      await openExample(importedDesign(project,newId('project')));
    } catch { setExampleError(true); }
    finally { setReading(false); }
  }
  const exhibit = <section className={projects.length ? "example-folio compact-example" : "example-folio"}>
    <div className="folio-text"><span className="section-kicker"><StudioIcon name="atlas"/>{ui.exampleName}</span>
      <h2 lang="en">{ui.exampleTitle}</h2>{!projects.length && <p>{ui.exampleText}</p>}
      <button type="button" onClick={()=>void example()} disabled={disabled || reading}>{reading ? ui.loading : ui.exampleAction}<StudioIcon name="arrow"/></button>
      {exampleError && <small role="alert">{ui.exampleFailure}</small>}
    </div>{!projects.length && <img src={import.meta.env.BASE_URL + 'examples/salt-census.svg'} alt={ui.preview}/>}
  </section>;
  return (
    <>
      <div className="page-heading heading-actions">
        <div><h1>{copy.projects}</h1><p>{ui.intro}</p></div>
        {!creating && !loading && <div className="actions">
          <button type="button" className="primary" disabled={disabled} onClick={() => setCreating(true)}><StudioIcon name="add"/>{copy.newProject}</button>
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
      <div className="library-desk"><div className="library-stack">
      {!loading && !projects.length && exhibit}
      <section className="panel projects-panel" aria-labelledby="project-list-heading">
        <div className="section-heading"><h2 id="project-list-heading">{copy.localProjects}</h2><span className="count">{format.number(projects.length)}</span></div>
        {loading ? <p role="status">{copy.loadingProjects}</p> : projects.length === 0 ? <p className="empty">{copy.emptyProjects}</p> : (
          <ul className="project-list">
            {projects.map(record => <ProjectEntry key={record.project.id} record={record}
              repeated={repeated.has(record.project.title)} disabled={disabled} open={open}/> )}
          </ul>
        )}
      </section>{!loading && !!projects.length && exhibit}</div>
      <aside className="workflow-index"><h2>{ui.workflow}</h2><ol>{(['content','narrative','scenario','atlas','verification'] as const).map((icon,i)=>
        <li key={icon}><StudioIcon name={icon}/><div><strong>{ui.stages[i]}</strong><p>{ui.stageNotes[i]}</p></div></li>)}</ol>
        {sample && !loading && <button className="quiet dev-sample" disabled={disabled} onClick={sample.create}>{sample.title}</button>}
      </aside></div>
    </>
  );
}
