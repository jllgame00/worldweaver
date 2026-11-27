import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { fetchGenerationStatus, generateDirections, GenerationError } from './api';
import Content from './Content';
import { StudioIcon } from './StudioIcon';
import { useWorkbenchCopy } from './workbenchCopy';
import { ProjectImport, RecoveryDownload } from './ProjectImport';
import { useRestoreCopy } from './restoreCopy';
import { DiagnosticDetails, LanguageSelector, LocaleProvider, useDiagnostic, useLocale } from './locale';
import { useShellCopy, useWorkspaceCopy } from './workspaceLocale';
import Dashboard from './Dashboard';
import { DirectionDetail, Directions, StoryFields } from './Direction';
import Narrative from './Narrative';
import { acceptBatch, candidatesFresh, chooseDirection, createProject, narrativeFresh } from './project';
import type { Project, StoryCandidate } from './project.generated';
import { createSampleProject, sampleTitle } from './sampleProject';
import { useProjects } from './useProjects';
import type { CandidateResult, GenerationStatus } from './validation';
import { downloadFile } from './scenarioWorkflow';

const Operations = lazy(() => import('./Operations'));
const studios = ['content','directions','narrative','scenario','atlas','bible','verification'] as const;

function StudioPanel({active, children}: {active:boolean; children:ReactNode}) {
  const [visited, setVisited] = useState(active);
  useEffect(() => { if (active) setVisited(true); }, [active]);
  return active || visited ? <div hidden={!active}>{children}</div> : null;
}

type Studio = 'content' | 'directions' | 'narrative' | 'scenario' | 'atlas' | 'bible' | 'verification';
type View = Studio | { detail: string; from: 'directions' | 'narrative' };
type Notice = { label: 'cancelled' | 'staleResponse' | 'generationSaved' | 'requestFailed' | 'imported' | 'restored' }
  | { detail: string; code?: string };

function startingStudio(project: Project): Studio {
  if (project.world?.settings) return 'atlas';
  if (project.scenario) return 'scenario';
  if (project.narrative) return 'narrative';
  return project.storyCandidates.length ? 'directions' : 'content';
}

export default function App({ databaseName = 'worldweaver-v1' }: { databaseName?: string }) {
  return <LocaleProvider><Workspace databaseName={databaseName} /></LocaleProvider>;
}

function Workspace({ databaseName }: { databaseName: string }) {
  const locale = useLocale();
  const copy = useWorkspaceCopy();
  const shell = useShellCopy();
  const recovery = useRestoreCopy();
  const ui = useWorkbenchCopy();
  const [library, setLibrary] = useState(false);
  const [operations, setOperations] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editors, setEditors] = useState<typeof import('./ProjectStudios')>();
  const [loadFailed, setLoadFailed] = useState(false);
  async function loadEditors() {
    if (editors) return true;
    try {
      setEditors(await import('./ProjectStudios'));
      setLoadFailed(false);
      return true;
    } catch {
      setLoadFailed(true);
      return false;
    }
  }
  const diagnostic = useDiagnostic();
  const store = useProjects(databaseName);
  const project = store.record?.project;
  const [view, setView] = useState<View>('content');
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [linked,setLinked]=useState<{projectId:string;id:string;to:Studio}>();
  function navigate(to:Studio,id:string){
    if(!project)return;
    setLinked({projectId:project.id,id,to});
    const candidate=project.storyCandidates.some(c=>c.id===id);
    setView(to==='narrative' && candidate?{from:'directions',detail:id}:to);
  }
  const [proposal, setProposal] = useState<CandidateResult>();
  const [switching, setSwitching] = useState<{ candidate: StoryCandidate; revision: number }>();
  const [generation, setGeneration] = useState<GenerationStatus | null>();
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const request = useRef<AbortController | null>(null);
  const main = useRef<HTMLElement>(null);
  const disabled = store.saving || !!store.pending;
  const fresh = !!project && candidatesFresh(project);
  const loadingLibrary = store.loading || (store.projects.length > 0 && !editors && !loadFailed);
  useEffect(() => {
    if (store.projects.length && !editors && !loadFailed) void loadEditors();
  }, [store.projects.length, editors, loadFailed]);

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
    const source = linked && (view==='content' || view==='narrative') ? document.getElementById('canonical-'+linked.id) : null;
    if(source) source.focus();
    else if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, [project?.id, view, linked, operations, library]);

  function cancel() {
    request.current?.abort();
    request.current = null;
    setGenerating(false);
    setNotice({ label: 'cancelled' });
  }

  function refreshGenerationStatus() {
    setGeneration(undefined);
    setStatusAttempt((attempt) => attempt + 1);
  }

  function closeProject() {
    setLibrary(true);
    setOperations(false);
    setMenu(false);
  }

  async function openNewProject(next: Project) {
    if (!await loadEditors() || !await store.commit(next)) return false;
    setProposal(undefined);
    setSwitching(undefined);
    setNotice(undefined);
    openView('content');
    return true;
  }

  function openView(next: Studio) {
    setLibrary(false);
    setOperations(false);
    setMenu(false);
    setLinked(undefined);
    setView(next);
  }
  async function openFromList(id: string) {
    if (project?.id === id) { setLibrary(false); setOperations(false); return; }
    await reopen(id);
  }

  async function accept(result: CandidateResult) {
    const current = store.current.current?.project;
    if (!current || current.revision !== result.baseRevision) {
      setNotice({ label: 'staleResponse' });
    } else if (await store.commit(acceptBatch(current, result.candidates, result.run))) {
      setView('directions');
      setNotice({ label: 'generationSaved' });
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
      if (!currentRevision()) setNotice({ label: 'staleResponse' });
      else if (project.narrative) setProposal(result);
      else await accept(result);
    } catch (error) {
      if (request.current !== controller) return;
      const failure = error instanceof GenerationError ? error : undefined;
      if (!failure?.configurationChanged && !currentRevision()) setNotice({ label: 'staleResponse' });
      else {
        if (failure?.configurationChanged) refreshGenerationStatus();
        setNotice(failure ? { detail: failure.message, code: failure.code } : { label: 'requestFailed' });
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
    if (!editors && !await loadEditors()) return;
    const opened = await store.reopen(id);
    if (opened) {
      setEditorEpoch((previous) => previous + 1);
      setProposal(undefined);
      setSwitching(undefined);
      setNotice(undefined);
      openView(startingStudio(opened));
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
  const inLibrary = !project || library;
  const visibleStudio = !inLibrary && !operations;
  const label = (s: Studio) => s === 'content' || s === 'directions' || s === 'narrative' ? copy[s] : shell[s];
  const loading = <p role="status" className="panel loading-studio">{ui.loading}</p>;
  const detail = typeof view === 'object' ? project?.storyCandidates.find(({ id }) => id === view.detail) : undefined;
  const publicDemo = generation?.deploymentMode === 'public-demo';
  const providerLabel = publicDemo ? (locale === 'ko' ? '공개 데모' : 'Public demo') : generation?.provider === 'chatkhu' ? copy.chatkhuProvider(generation.model)
    : generation?.mode === 'live' ? copy.liveProvider(generation.model)
    : generation?.mode === 'mock' ? copy.mockProvider : generation === undefined ? copy.checkingGeneration : '';
  const generationIssue = publicDemo ? (locale === 'ko' ? '공개 데모에서는 소재를 직접 편집하거나 무료 규칙 정리를 사용할 수 있습니다. AI 생성은 꺼져 있습니다.' : 'AI generation is off in this public demo. Edit manually or organize ideas with local rules.') : generation === null ? copy.providerStatusFailed
    : generation && !generation.available
      ? locale === 'ko' && generation.message ? shell.unknownProvider : generation.message ?? copy.providerUnavailable
      : undefined;
  const noticeLabels = {
    cancelled: copy.cancelled, staleResponse: copy.staleResponse, generationSaved: copy.generationSaved,
    requestFailed: copy.requestFailed, imported: recovery.imported, restored: recovery.restored,
  };
  const noticeText = notice && ('detail' in notice ? diagnostic(notice.detail, notice.code) : noticeLabels[notice.label]);
  const noticeError = notice && ('detail' in notice || notice.label === 'requestFailed');
  const noticeDetails = notice && 'detail' in notice && <DiagnosticDetails detail={notice.detail} code={notice.code} />;

  return (
    <div className="app workbench">
      <a className="skip-workspace" href="#work-area">{ui.skip}</a>
      <header className="app-header">
        <div className="header-inner">
          <div className="brand"><StudioIcon name="compass"/>{copy.brand}</div>
          <button className="menu-toggle quiet" aria-expanded={menu} aria-controls="workspace-rail" onClick={()=>setMenu(!menu)}>{ui.nav}</button>
          {visibleStudio && project && <>
            <span className="header-project creative">{project.title}</span>
            <span role="status" className="save-status" data-save-state={store.saving ? 'saving' : store.pending ? 'pending' : 'saved'}>
              <i aria-hidden="true" />{store.saving ? copy.saving : store.pending ? copy.unsaved : copy.saved}</span>
          </>}
          <span className="current-workspace">{operations ? ui.operations : inLibrary ? copy.projects : label(studio)}</span>
          {project && visibleStudio && <details className="header-actions">
            <summary>{ui.projectActions}</summary>
            <div><p>{copy.narrative} · {project.narrative ? !narrativeFresh(project) ? copy.stale : project.narrative.approved ? copy.approved : copy.draft : copy.noNarrative}</p>
              <button onClick={()=>downloadFile(project.id+'.json', JSON.stringify(project,null,2), 'application/json')}>{ui.download}</button></div>
          </details>}
          <LanguageSelector />
        </div>
      </header>
      <aside id="workspace-rail" className={'workspace-rail' + (menu ? ' expanded' : '')}>
        <span className="rail-caption">{ui.library}</span>
        <button type="button" aria-current={inLibrary && !operations ? 'page' : undefined} onClick={closeProject}><StudioIcon name="projects"/>{copy.projects}</button>
        {project ? <nav className="studio-nav" aria-label={copy.studioNav}>
          <span className="rail-caption">{ui.studios}</span>
          {studios.map(name => {
            const reason = !project ? ui.selectProject : name === 'directions' && !project.storyCandidates.length ? copy.noDirections
              : name === 'narrative' && !project.narrative ? ui.choose : undefined;
            return <button key={name} type="button" disabled={!!reason} title={reason} aria-describedby={reason ? 'studio-prerequisite' : undefined}
              aria-current={visibleStudio && studio === name ? 'page' : undefined} onClick={()=>openView(name)}><StudioIcon name={name}/>{label(name)}</button>;
          })}
        </nav> : <div className="studio-nav studio-index">
          <span className="rail-caption">{ui.studios}</span>
          {studios.map(name=><span key={name}><StudioIcon name={name}/>{label(name)}</span>)}
        </div>}
        {(!project || !project.narrative) && <p id="studio-prerequisite" className="rail-help">{!project ? ui.selectProject : project.storyCandidates.length ? ui.choose : copy.noDirections}</p>}
        <button className="operations-link" aria-current={operations ? 'page' : undefined}
          onClick={()=>{setOperations(true);setMenu(false);}}><StudioIcon name="operations"/>{ui.operations}</button>
      </aside>
      <main id="work-area" className="workspace" ref={main} tabIndex={-1}>
        {operations && <Suspense fallback={loading}><Operations databaseName={databaseName} project={project} configuration={generation}/></Suspense>}
        <div hidden={operations}>
        {loadFailed && <p role="alert" className="notice error">{ui.loadError} <button onClick={()=>void loadEditors()}>{ui.retry}</button></p>}
        {store.loadError && <p role="alert" className="notice error">{copy[store.loadError]}</p>}
        {store.pending && <div className="notice">
          <p role="alert" className="error">{store.pending.conflict ? copy.saveConflict : copy.saveFailure}</p>
          <div className="actions"><button type="button" className="quiet" onClick={downloadDraft}>{copy.downloadDraft}</button>
            {store.pending.conflict && project ? <button type="button" onClick={() => void reopen(project.id)}>{copy.reopenSaved}</button>
              : <button type="button" disabled={store.saving} onClick={() => {
                if (store.pending) void store.commit(store.pending.project, store.pending.checkedRunId, store.pending.afterSave);
              }}>{copy.retrySave}</button>}</div>
        </div>}
        {project && <div hidden={inLibrary}>
          <div className="project-tools">
            <div className="project-meta"><span className="revision">{copy.revision(project.revision)}</span>
              <span className="provider-mode" role="status">{providerLabel}</span></div>
            {generating ? <div className="actions generation-state"><span role="status">{copy.generating}</span>
              <button type="button" className="quiet" onClick={cancel}>{copy.cancelGeneration}</button></div>
              : ['content','directions','narrative'].includes(studio) && <button type="button" className="primary" disabled={disabled || !generation?.available || !!proposal || !!switching || !project.userContent.length}
                onClick={() => void startGeneration()}>{copy.generate}</button>}
          </div>
          {['content','directions','narrative'].includes(studio) && !project.userContent.length && <p className="prerequisite">{ui.addSource}</p>}
          {(proposal || switching) && <p className="prerequisite">{ui.pending}</p>}
          {studio==='scenario' && (!project.narrative?.approved || !narrativeFresh(project)) && <button className="prerequisite"
            onClick={()=>openView(project.narrative ? 'narrative' : project.storyCandidates.length ? 'directions' : 'content')}>{ui.approveStory} →</button>}
          {studio==='atlas' && !project.scenario?.approved && <button className="prerequisite" onClick={()=>openView('scenario')}>{ui.approveScenario} →</button>}
          {generationIssue && <div className="notice">
            <p role={publicDemo || store.saving || store.pending ? 'status' : 'alert'} className={publicDemo ? 'muted' : 'error'}>{generationIssue}</p>
            {!generation?.available && generation?.message && <DiagnosticDetails detail={generation.message} />}
            {!publicDemo && <div className="actions"><button type="button" className="quiet" onClick={refreshGenerationStatus}>{copy.retryStatus}</button></div>}
          </div>}
          {noticeText && <><p role={noticeError ? 'alert' : 'status'} className={`notice ${noticeError ? 'error' : ''}`}>{noticeText}</p>{noticeDetails}</>}
          {store.record?.hasRecovery && <RecoveryDownload databaseName={databaseName} id={project.id}/>}
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
          {editors && <><StudioPanel key={project.id+'-scenario-'+editorEpoch} active={view==='scenario'}><editors.ScenarioStudio selectedId={linked?.projectId===project.id && linked.to==='scenario'?linked.id:undefined} openAtlas={id=>navigate('atlas',id)} project={project}
            checkedRunId={store.record?.scenarioCheckRunId} disabled={disabled || generating}
            disabledReasons={[
              ...(store.pending ? [store.pending.conflict ? copy.saveConflict : copy.saveFailure] : []),
              ...(store.saving ? [copy.saving] : []),
              ...(generating ? [shell.generating] : []),
            ]}
            generation={generation} refreshGeneration={refreshGenerationStatus} commit={store.commit} current={()=>store.writing.current?undefined:store.current.current?.project}/></StudioPanel>
          <StudioPanel key={project.id+'-bible-'+editorEpoch} active={view==='bible'}><editors.WorldBible project={project} selectedId={linked?.projectId===project.id && linked.to==='bible'?linked.id:undefined}
            review={id=>navigate('verification',id)} navigate={navigate} disabled={disabled || generating} commit={store.commit}
            current={()=>store.writing.current?undefined:store.current.current?.project}/></StudioPanel>
          <StudioPanel key={project.id+'-verification-'+editorEpoch} active={view==='verification'}><editors.VerificationAgent project={project} targetId={linked?.projectId===project.id && linked.to==='verification'?linked.id:undefined}
            inspect={id=>navigate('bible',id)} disabled={disabled || generating} commit={store.commit} configuration={generation}
            current={()=>store.writing.current?undefined:store.current.current?.project}/></StudioPanel>
          <StudioPanel key={project.id+'-atlas-'+editorEpoch} active={view==='atlas'}><editors.AtlasStudio project={project} selectedId={linked?.projectId===project.id && linked.to==='atlas'?linked.id:undefined}
            openScenario={id=>navigate('scenario',id)} disabled={disabled || generating} commit={store.commit}
            current={()=>store.writing.current?undefined:store.current.current?.project} databaseName={databaseName}/></StudioPanel></>}
          <div hidden={view !== 'content'}>
            <Content key={`${project.id}-${editorEpoch}`} project={project} disabled={disabled} commit={store.commit}
              commitIntake={(next, afterSave) => store.commit(next, undefined, afterSave)}
              databaseName={databaseName} configuration={generation} refreshConfiguration={refreshGenerationStatus} />
          </div>
          {project.narrative && <div hidden={view !== 'narrative'}>
            <Narrative key={`${project.narrative.id}-${editorEpoch}`} project={project} narrative={project.narrative} disabled={disabled}
              inspect={(id) => setView({ detail: id, from: 'narrative' })} commit={store.commit} />
          </div>}
        </div>}
        {project && inLibrary && <div className="return-editor">
          <button onClick={()=>{setLibrary(false);setOperations(false);}}>{ui.continue} · {project.title}</button>
          <small>{ui.switchProject}</small>
        </div>}
        {inLibrary && <ProjectImport databaseName={databaseName} disabled={disabled || loadingLibrary || generating} reopen={reopen}
          opened={async (saved, restored) => {
            await loadEditors();
            store.adopt(saved);
            setEditorEpoch(n=>n+1);setProposal(undefined);setSwitching(undefined);
            openView(startingStudio(saved.project));
            setNotice({ label: restored ? 'restored' : 'imported' });
          }}>
          <Dashboard projects={store.projects} loading={loadingLibrary} disabled={disabled || loadingLibrary}
          open={(id) => void openFromList(id)} create={(title) => openNewProject(createProject(title))}
          openExample={async next => {if(await openNewProject(next)) openView(startingStudio(next));}}
          sample={import.meta.env.DEV ? { title: sampleTitle, create: () => void openNewProject(createSampleProject()) } : undefined} />
        </ProjectImport>}
        </div></main>
    </div>
  );
}
