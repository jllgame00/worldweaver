import { useEffect, useRef, useState } from 'react';
import { fetchGenerationStatus, generateDirections, GenerationError } from './api';
import Content from './Content';
import ScenarioStudio from './ScenarioStudio';
import AtlasStudio from './AtlasStudio';
import { scenarioCopy } from './studioWorkflowCopy';
import { importProject, InvalidProjectReference } from './scenarioWorkflow';
import { copy } from './copy';
import Dashboard from './Dashboard';
import { DirectionDetail, Directions, StoryFields } from './Direction';
import Narrative from './Narrative';
import { acceptBatch, candidatesFresh, chooseDirection, createProject, newId } from './project';
import type { Project, StoryCandidate } from './project.generated';
import { createSampleProject, sampleTitle } from './sampleProject';
import { useProjects } from './useProjects';
import type { CandidateResult, GenerationStatus } from './validation';

type Studio = 'content' | 'directions' | 'narrative' | 'scenario' | 'atlas';
type View = Studio | { detail: string; from: 'directions' | 'narrative' };

function startingStudio(project: Project): Studio {
  if (project.world?.settings) return 'atlas';
  if (project.scenario) return 'scenario';
  if (project.narrative) return 'narrative';
  return project.storyCandidates.length ? 'directions' : 'content';
}

export default function App({ databaseName = 'worldweaver-v1' }: { databaseName?: string }) {
  const store = useProjects(databaseName);
  const project = store.record?.project;
  const [view, setView] = useState<View>('content');
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [linked,setLinked]=useState<{projectId:string;id:string}>();
  function navigate(to:'atlas'|'scenario',id:string){if(project){setLinked({projectId:project.id,id});setView(to);}}
  const [proposal, setProposal] = useState<CandidateResult>();
  const [switching, setSwitching] = useState<{ candidate: StoryCandidate; revision: number }>();
  const [generation, setGeneration] = useState<GenerationStatus | null>();
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<{ message: string; error?: boolean }>();
  const request = useRef<AbortController | null>(null);
  const main = useRef<HTMLElement>(null);
  const disabled = store.saving || !!store.pending;
  const fresh = !!project && candidatesFresh(project);

  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetchGenerationStatus(controller.signal).then((status) => {
      if (!controller.signal.aborted) setGeneration(status);
    }).catch(() => {
      if (!controller.signal.aborted) setGeneration(null);
    });
    return () => controller.abort();
  }, [statusAttempt]);

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

  function refreshGenerationStatus() {
    setGeneration(undefined);
    setStatusAttempt((attempt) => attempt + 1);
  }

  function closeProject() {
    if (generating) cancel();
    setNotice(undefined);
    setProposal(undefined);
    setSwitching(undefined);
    store.select(undefined);
  }

  function openNewProject(next: Project) {
    setView('content');
    return store.commit(next);
  }

  async function accept(result: CandidateResult) {
    const current = store.current.current?.project;
    if (!current || current.revision !== result.baseRevision) {
      setNotice({ message: copy.staleResponse });
    } else if (await store.commit(acceptBatch(current, result.candidates, result.run))) {
      setView('directions');
      setNotice({ message: copy.generationSaved });
    }
    setProposal(undefined);
  }

  async function startGeneration() {
    if (!project || !generation?.available || request.current || disabled) return;
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
      const result = await generateDirections(project, generation, controller.signal);
      if (request.current !== controller) return;
      request.current = null;
      setGenerating(false);
      if (!currentRevision()) setNotice({ message: copy.staleResponse });
      else if (project.narrative) setProposal(result);
      else await accept(result);
    } catch (error) {
      if (request.current !== controller) return;
      const failure = error instanceof GenerationError ? error : undefined;
      if (!failure?.configurationChanged && !currentRevision()) setNotice({ message: copy.staleResponse });
      else {
        if (failure?.configurationChanged) refreshGenerationStatus();
        setNotice({ message: failure?.message ?? copy.requestFailed, error: true });
        if (failure?.run) await store.commit({ ...project, runs: [...project.runs, failure.run] });
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
  const providerLabel = generation?.provider === 'chatkhu' ? copy.chatkhuProvider(generation.model)
    : generation?.mode === 'live' ? copy.liveProvider(generation.model)
    : generation?.mode === 'mock' ? copy.mockProvider : generation === undefined ? copy.checkingGeneration : '';
  const generationIssue = generation === null ? copy.providerStatusFailed
    : generation && !generation.available ? generation.message ?? copy.providerUnavailable : undefined;

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
          {(['content', 'directions', 'narrative', 'scenario', 'atlas'] as const).map((name) => (
            <button key={name} type="button" aria-current={studio === name ? 'page' : undefined}
              disabled={name === 'directions' ? !project.storyCandidates.length : name === 'narrative' && !project.narrative}
              onClick={() => {setLinked(undefined);setView(name);}}>{name==='atlas'?'World Atlas':name==='scenario'?scenarioCopy.title:copy[name]}</button>
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
                if (store.pending) void store.commit(store.pending.project, store.pending.checkedRunId);
              }}>{copy.retrySave}</button>}</div>
        </div>}
        {project ? <>
          <div className="project-tools">
            <div className="project-meta"><span className="revision">{copy.revision(project.revision)}</span>
              <span className="provider-mode" role="status">{providerLabel}</span></div>
            {generating ? <div className="actions generation-state"><span role="status">{copy.generating}</span>
              <button type="button" className="quiet" onClick={cancel}>{copy.cancelGeneration}</button></div>
              : studio!=='scenario' && <button type="button" className="primary" disabled={disabled || !generation?.available || !!proposal || !!switching || !project.userContent.length}
                onClick={() => void startGeneration()}>{copy.generate}</button>}
          </div>
          {generationIssue && <div className="notice">
            <p role="alert" className="error">{generationIssue}</p>
            <div className="actions"><button type="button" className="quiet" onClick={refreshGenerationStatus}>{copy.retryStatus}</button></div>
          </div>}
          {notice && <p role={notice.error ? 'alert' : 'status'} className={`notice ${notice.error ? 'error' : ''}`}>{notice.message}</p>}
          {proposal && <section className="panel confirmation" aria-labelledby="replacement-title">
            <h2 id="replacement-title">{copy.replacementTitle}</h2><p>{copy.replacementPrompt}</p>
            <p>{copy.proposalSource(proposal.run.mode)}</p>
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
          {view==='scenario' && <ScenarioStudio key={project.id+'-'+editorEpoch} selectedId={linked?.projectId===project.id?linked.id:undefined} openAtlas={id=>navigate('atlas',id)} project={project}
            checkedRunId={store.record?.scenarioCheckRunId} disabled={disabled || generating}
            disabledReasons={[
              ...(store.pending ? [store.pending.conflict ? copy.saveConflict : copy.saveFailure] : []),
              ...(store.saving ? [copy.saving] : []),
              ...(generating ? [scenarioCopy.generating] : []),
            ]}
            generation={generation} refreshGeneration={refreshGenerationStatus} commit={store.commit} current={()=>store.writing.current?undefined:store.current.current?.project}/>}
          {view==='atlas' && <AtlasStudio key={project.id} project={project} selectedId={linked?.projectId===project.id?linked.id:undefined}
            openScenario={id=>navigate('scenario',id)} disabled={disabled || generating} commit={store.commit}
            current={()=>store.writing.current?undefined:store.current.current?.project} databaseName={databaseName}/>}
          <div hidden={view !== 'content'}>
            <Content key={`${project.id}-${editorEpoch}`} project={project} disabled={disabled} commit={store.commit} />
          </div>
          {project.narrative && <div hidden={view !== 'narrative'}>
            <Narrative key={`${project.narrative.id}-${editorEpoch}`} project={project} narrative={project.narrative} disabled={disabled}
              inspect={(id) => setView({ detail: id, from: 'narrative' })} commit={store.commit} />
          </div>}
        </> : <><Dashboard projects={store.projects} loading={store.loading} disabled={disabled || store.loading}
          open={(id) => void reopen(id)} create={(title) => openNewProject(createProject(title))}
          sample={import.meta.env.DEV ? { title: sampleTitle, create: () => void openNewProject(createSampleProject()) } : undefined} />
          <label className="panel">{scenarioCopy.import}<input type="file" accept="application/json,.json" disabled={disabled||store.loading}
            onChange={async e=>{
              const file=e.target.files?.[0];e.target.value='';if(!file) return;
              try {
                if(file.size>16*1024*1024) throw Error(scenarioCopy.large);
                const imported=importProject(await file.text());
                if(store.projects.some(row=>row.project.id===imported.id)) {
                  if(!window.confirm(scenarioCopy.duplicate)) return;
                  const oldId=imported.id;
                  imported.id=newId('project');
                  for(const finding of imported.findings) finding.entityIds=finding.entityIds.map(id=>id===oldId?imported.id:id);
                }
                delete imported.approval;
                if(imported.scenario) imported.scenario.approved=false;
                if(imported.world?.approved) imported.world.approved=false;
                setNotice(imported.scenario?{message:scenarioCopy.importReview}:undefined);
                if(await store.commit(imported)) setView(startingStudio(imported));
              } catch (err) {
                const show = err instanceof InvalidProjectReference || (err instanceof Error && err.message === scenarioCopy.large);
                setNotice({message: show ? err.message : scenarioCopy.importError, error:true});
              }
            }}/></label>{notice?.error && <p role="alert">{notice.message}</p>}</>}
      </main>
    </div>
  );
}
