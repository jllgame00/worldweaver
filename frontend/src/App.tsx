import { useEffect, useRef, useState } from 'react';
import { generateDirections, GenerationError } from './api';
import Content from './Content';
import { copy } from './copy';
import Dashboard from './Dashboard';
import { DirectionDetail, Directions, StoryFields } from './Direction';
import Narrative from './Narrative';
import { acceptBatch, candidatesFresh, chooseDirection, createProject } from './project';
import type { Project, StoryCandidate } from './project.generated';
import { useProjects } from './useProjects';
import type { CandidateResult } from './validation';

type Studio = 'content' | 'directions' | 'narrative';
type View = Studio | { detail: string; from: 'directions' | 'narrative' };

function startingStudio(project: Project): Studio {
  if (project.narrative) return 'narrative';
  return project.storyCandidates.length ? 'directions' : 'content';
}

export default function App({ databaseName = 'worldweaver-v1' }: { databaseName?: string }) {
  const store = useProjects(databaseName);
  const project = store.record?.project;
  const [view, setView] = useState<View>('content');
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [proposal, setProposal] = useState<CandidateResult>();
  const [switching, setSwitching] = useState<{ candidate: StoryCandidate; revision: number }>();
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<{ message: string; error?: boolean }>();
  const request = useRef<AbortController | null>(null);
  const main = useRef<HTMLElement>(null);
  const disabled = store.saving || !!store.pending;
  const fresh = !!project && candidatesFresh(project);

  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  useEffect(() => {
    const heading = Array.from(main.current?.querySelectorAll('h1') ?? []).find((element) => !element.closest('[hidden]'));
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, [project?.id, view]);

  function cancel() {
    request.current?.abort();
    request.current = null;
    setGenerating(false);
    setNotice({ message: copy.cancelled });
  }

  function closeProject() {
    if (generating) cancel();
    setNotice(undefined);
    setProposal(undefined);
    setSwitching(undefined);
    store.select(undefined);
  }

  async function accept(result: CandidateResult) {
    const current = store.current.current?.project;
    if (!current || current.revision !== result.baseRevision) {
      setNotice({ message: copy.staleResponse });
    } else if (await store.commit(acceptBatch(current, result.candidates, result.run))) {
      setView('directions');
    }
    setProposal(undefined);
  }

  async function startGeneration() {
    if (!project || request.current || disabled) return;
    const controller = new AbortController();
    request.current = controller;
    setGenerating(true);
    setNotice(undefined);
    setProposal(undefined);
    const currentRevision = () => {
      const current = store.current.current?.project;
      return !store.writing.current && current?.id === project.id && current.revision === project.revision;
    };

    try {
      const result = await generateDirections(project, controller.signal);
      if (request.current !== controller) return;
      request.current = null;
      setGenerating(false);
      if (!currentRevision()) setNotice({ message: copy.staleResponse });
      else if (project.narrative) setProposal(result);
      else await accept(result);
    } catch (error) {
      if (request.current !== controller) return;
      if (!currentRevision()) setNotice({ message: copy.staleResponse });
      else {
        setNotice({ message: error instanceof GenerationError ? error.message : copy.requestFailed, error: true });
        if (error instanceof GenerationError && error.run) await store.commit({ ...project, runs: [...project.runs, error.run] });
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setGenerating(false);
      }
    }
  }

  async function selectDirection(candidate: StoryCandidate) {
    const current = store.current.current?.project;
    if (current && candidatesFresh(current) && current.storyCandidates.some(({ id }) => id === candidate.id)
      && await store.commit(chooseDirection(current, candidate))) setView('narrative');
    setSwitching(undefined);
  }

  function choose(candidate: StoryCandidate) {
    if (!project || disabled) return;
    if (project.narrative?.sourceCandidateId === candidate.id) setView('narrative');
    else if (project.narrative) setSwitching({ candidate, revision: project.revision });
    else void selectDirection(candidate);
  }

  async function reopen(id: string) {
    const opened = await store.reopen(id);
    if (opened) {
      setEditorEpoch((previous) => previous + 1);
      setProposal(undefined);
      setSwitching(undefined);
      setNotice(undefined);
      setView(startingStudio(opened));
    }
  }

  function downloadDraft() {
    if (!store.pending) return;
    const draft = store.pending.project;
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${draft.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const studio = typeof view === 'string' ? view : view.from;
  const detail = typeof view === 'object' ? project?.storyCandidates.find(({ id }) => id === view.detail) : undefined;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand"><span className="brand-mark" aria-hidden="true" />{copy.brand}</div>
          {project && <><button type="button" className="quiet projects-link" disabled={disabled} onClick={closeProject}>{copy.projects}</button>
            <span className="header-project creative">{project.title}</span>
            <span role="status" className="save-status" data-save-state={store.saving ? 'saving' : store.pending ? 'pending' : 'saved'}>
              <i aria-hidden="true" />{store.saving ? copy.saving : store.pending ? copy.unsaved : copy.saved}</span>
          </>}
        </div>
        {project && <nav className="studio-nav" aria-label={copy.studioNav}>
          {(['content', 'directions', 'narrative'] as const).map((name) => (
            <button key={name} type="button" aria-current={studio === name ? 'page' : undefined}
              disabled={name === 'directions' ? !project.storyCandidates.length : name === 'narrative' && !project.narrative}
              onClick={() => setView(name)}>{copy[name]}</button>
          ))}
        </nav>}
      </header>
      <main className="workspace" ref={main}>
        {store.loadError && <p role="alert" className="notice error">{store.loadError}</p>}
        {store.pending && <div className="notice">
          <p role="alert" className="error">{store.pending.conflict ? copy.saveConflict : copy.saveFailure}</p>
          <div className="actions"><button type="button" className="quiet" onClick={downloadDraft}>{copy.downloadDraft}</button>
            {store.pending.conflict && project ? <button type="button" onClick={() => void reopen(project.id)}>{copy.reopenSaved}</button>
              : <button type="button" disabled={store.saving} onClick={() => {
                if (store.pending) void store.commit(store.pending.project);
              }}>{copy.retrySave}</button>}</div>
        </div>}
        {project ? <>
          <div className="project-tools">
            <div className="project-meta"><span className="revision">{copy.revision(project.revision)}</span>
              <span className="provider-mode">{copy.mockProvider}</span></div>
            {generating ? <div className="actions generation-state"><span role="status">{copy.generating}</span>
              <button type="button" className="quiet" onClick={cancel}>{copy.cancelGeneration}</button></div>
              : <button type="button" className="primary" disabled={disabled || !!proposal || !!switching || !project.userContent.length}
                onClick={() => void startGeneration()}>{copy.generate}</button>}
          </div>
          {notice && <p role={notice.error ? 'alert' : 'status'} className={`notice ${notice.error ? 'error' : ''}`}>{notice.message}</p>}
          {proposal && <section className="panel confirmation" aria-labelledby="replacement-title">
            <h2 id="replacement-title">{copy.replacementTitle}</h2><p>{copy.replacementPrompt}</p>
            {project.narrative && <div className="replacement-grid">
              <section><h3>{copy.currentDraft}</h3><StoryFields story={project.narrative.story} fields={['title', 'premise', 'possibleEndings']} /></section>
              {proposal.candidates.map(({ id, story }) => <section key={id}><h3 className="creative">{story.title}</h3><StoryFields story={story} fields={['premise', 'possibleEndings']} /></section>)}
            </div>}
            <div className="actions"><button type="button" className="quiet" onClick={() => setProposal(undefined)}>{copy.keepDraft}</button>
              <button type="button" className="primary" disabled={disabled} onClick={() => void accept(proposal)}>{copy.replaceDirections}</button></div>
          </section>}
          {switching && project.narrative && <section className="panel confirmation" aria-labelledby="switch-title">
            <h2 id="switch-title">{copy.switchTitle}</h2><p>{copy.switchPrompt}</p>
            <div className="replacement-grid switch-grid">
              <section><h3>{copy.currentDraft}</h3><StoryFields story={project.narrative.story} fields={['title', 'premise', 'possibleEndings']} /></section>
              <section><h3>{copy.proposedDirection}</h3><StoryFields story={switching.candidate.story} fields={['title', 'premise', 'possibleEndings']} /></section>
            </div>
            <div className="actions"><button type="button" className="quiet" onClick={() => setSwitching(undefined)}>{copy.keepDraft}</button>
              <button type="button" className="primary" disabled={disabled || switching.revision !== project.revision}
                onClick={() => void selectDirection(switching.candidate)}>{copy.replaceNarrative}</button></div>
          </section>}
          {detail && typeof view === 'object' ? <DirectionDetail project={project} candidate={detail} fresh={fresh} disabled={disabled}
            fromNarrative={view.from === 'narrative'} back={() => setView(view.from)} choose={choose} />
            : studio === 'directions' ? <Directions project={project} fresh={fresh} disabled={disabled || !!proposal || !!switching} choose={choose}
              inspect={(id) => setView({ detail: id, from: 'directions' })} />
              : studio === 'narrative' && !project.narrative && <p className="empty panel">{copy.noNarrative}</p>}
          <div hidden={view !== 'content'}>
            <Content key={`${project.id}-${editorEpoch}`} project={project} disabled={disabled} commit={store.commit} />
          </div>
          {project.narrative && <div hidden={view !== 'narrative'}>
            <Narrative key={`${project.narrative.id}-${editorEpoch}`} project={project} narrative={project.narrative} disabled={disabled}
              inspect={(id) => setView({ detail: id, from: 'narrative' })} commit={store.commit} />
          </div>}
        </> : <Dashboard projects={store.projects} loading={store.loading} disabled={disabled || store.loading}
          open={(id) => void reopen(id)} create={async (title) => {
            setView('content');
            return store.commit(createProject(title));
          }} />}
      </main>
    </div>
  );
}
