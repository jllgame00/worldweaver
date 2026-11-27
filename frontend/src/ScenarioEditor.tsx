import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {atlasPlaces} from './atlasPlaces';
import type { Chapter, Project, ScenarioEdge, ScenarioNode } from './project.generated';
import { newId } from './project';
import { nodeKinds, questKinds, useScenarioKind, useStudioCopy } from './scenarioCopy';
import { arrange, deleteEntity, deletionImpact } from './scenarioGraph';
import ScenarioCanvas, { type Camera } from './ScenarioCanvas';
import ScenarioFindings, { type ScenarioFinding } from './ScenarioFindings';
import { freshNode, NodeInspector } from './NodeInspector';
import { ChapterInspector, EdgeInspector } from './ScenarioInspectors';
import { useFormatter } from './locale';
import './scenario.css';

export interface ScenarioEditorProps {
  evidence?: { complete: boolean; paths: string[][] };
  incomplete?: boolean;
  checkSaved?: () => void;
  selectedId?:string;
  openAtlas?:(id:string)=>void;
  project: Project;
  edit: (mutate: (project: Project) => void, layoutOnly?: boolean) => void | Promise<boolean>;
  revise?: (id: string) => void;
  findings: ScenarioFinding[];
}

type Draft = { node: ScenarioNode } | { edge: ScenarioEdge } | { chapter: Chapter };

export default function ScenarioEditor({ project, edit, revise, findings, selectedId, openAtlas, evidence, incomplete, checkSaved }: ScenarioEditorProps) {
  const c = useStudioCopy();
  const kindLabel = useScenarioKind();
  const { number } = useFormatter();
  const entityIdPrefix = useId() + '-entity-';
  const [view, setView] = useState<'graph'|'outline'>('graph');
  const narrow = () => window.matchMedia?.('(max-width: 899px)').matches === true;
  const [inspecting, setInspecting] = useState(() => !!selectedId || !narrow());
  const toggle = useRef<HTMLButtonElement>(null);
  const [selection, setSelection] = useState(() => selectedId ? target(selectedId) : project.nodes[0]?.id);
  const [camera, setCamera] = useState<Camera>();
  useEffect(() => {
    if (selectedId) select(selectedId);
  }, [selectedId]);
  const [draft, setDraft] = useState<Draft>();
  const [confirm, setConfirm] = useState(false);
  const [returnId, setReturnId] = useState<string>();
  const [query, setQuery] = useState('');
  const [chapterFilter, setChapterFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [questFilter, setQuestFilter] = useState('');
  const inspector = useRef<HTMLElement>(null);
  const chapters = project.scenario?.chapters ?? [];
  const node = draft ? ('node' in draft ? draft.node : undefined) : project.nodes.find((n) => n.id === selection);
  const edge = draft ? ('edge' in draft ? draft.edge : undefined) : project.edges.find((e) => e.id === selection);
  const chapter = draft ? ('chapter' in draft ? draft.chapter : undefined) : chapters.find((ch) => ch.id === selection);
  const quest = node && project.quests.find((q) => q.nodeId === node.id);
  const place = atlasPlaces(project).find(l=>l.id===selection);
  const chosen = node ?? edge ?? chapter ?? place;
  const title = node?.title || edge?.label || chapter?.title || place?.name;
  const chapterIndex = chapters.findIndex((ch) => ch.id === chapter?.id);
  const members = chapter && project.nodes.filter((n) => n.chapterId === chapter.id);
  function target(id: string) {
    return project.quests.find((q) => q.id === id)?.nodeId ?? project.endings.find((e) => e.id === id)?.nodeId ?? id;
  }
  const problems = new Set(findings.flatMap((f) => f.entityIds.map(target)));
  const path = node?.kind === 'ending' ? evidence?.paths.find(ids => ids.at(-1) === node.id) : undefined;
  function select(id: string) {
    setInspecting(true);
    setDraft(undefined); setConfirm(false); setSelection(target(id));
    if (narrow()) requestAnimationFrame(() => inspector.current?.focus());
  }
  function add(d: Draft) {
    setInspecting(true);
    setDraft(d); setConfirm(false); setReturnId(undefined);
    requestAnimationFrame(() => inspector.current?.querySelector<HTMLElement>('input,select')?.focus());
  }
  function addNode(kind: ScenarioNode['kind']) {
    const chapterId = chapterFilter ? (chapterFilter === '-' ? undefined : chapterFilter) : chapter?.id ?? node?.chapterId ?? chapters[0]?.id;
    add({ node: freshNode(kind, chapterId) });
  }
  async function erase() {
    const next = project.nodes.find((n) => n.id !== node?.id)?.id;
    if (!chosen) return;
    const saved = await edit((p) => deleteEntity(p, chosen.id));
    if (saved === false) return;
    setConfirm(false); setDraft(undefined); setSelection(next);
    requestAnimationFrame(() => {
      const target = next ? document.getElementById(entityIdPrefix + next) : null;
      (target ?? inspector.current)?.focus();
    });
  }
  function shiftChapter(offset: number) {
    edit((p) => {
      const list = p.scenario!.chapters;
      const index = list.findIndex((ch) => ch.id === chapter!.id);
      if (list[index + offset]) [list[index], list[index + offset]] = [list[index + offset]!, list[index]!];
    });
  }
  function nav(id: string, label: string, focusTarget = false) {
    return <button key={id} type="button" id={focusTarget ? entityIdPrefix + id : undefined} aria-pressed={selection === id && !draft} onClick={() => select(id)}>{label}</button>;
  }
  const nodeTitle = (id: string) => project.nodes.find((n) => n.id === id)?.title ?? id;
  const matches = (value: string) => value.toLowerCase().includes(query.trim().toLowerCase());
  const linked = node && project.edges.filter((e) => e.from === node.id || e.to === node.id);
  const known = new Set([...project.nodes, ...project.edges, ...chapters, ...project.scenario?.locations ?? [], ...project.world?.locations ?? []].map((o) => o.id));
  const visibleNodes = useMemo(() => project.nodes.filter((n) => (!chapterFilter || (n.chapterId ?? '-') === chapterFilter) &&
    (!kindFilter || n.kind === kindFilter) && (!questFilter || n.kind === 'quest' &&
      (project.quests.find((q) => q.nodeId === n.id)?.kind ?? 'main') === questFilter)), [project.nodes, project.quests, chapterFilter, kindFilter, questFilter]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  return <div className="scenario-studio">

    <div className={'scenario-workspace' + (inspecting ? '' : ' inspector-closed')}>
      <nav className="scenario-rail panel" aria-label={c.navigation}>
        <details open={!narrow()}><summary>{c.filters}</summary><div className="scenario-rail-content">
        <h3>{c.chapters}</h3>
        <label>{c.filterChapter}<select value={chapterFilter} onChange={(e) => setChapterFilter(e.target.value)}>
          <option value="">{c.all}</option>{chapters.map((ch) => <option key={ch.id} value={ch.id}>{ch.title}</option>)}
          <option value="-">{c.unassigned}</option></select></label>
        {chapters.map((ch) => nav(ch.id, ch.title))}
        <h3>{c.nodes}</h3>
        <label>{c.filterNodes}<select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
          <option value="">{c.all}</option>{nodeKinds.map((kind) => <option key={kind} value={kind}>{kindLabel(kind)}</option>)}</select></label>
        <label>{c.filterQuests}<select value={questFilter} onChange={(e) => setQuestFilter(e.target.value)}>
          <option value="">{c.all}</option>{questKinds.map((kind) => <option key={kind} value={kind}>{kindLabel(kind)}</option>)}</select></label>
        {project.quests.filter(q => visibleIds.has(q.nodeId)).map(q =>
          <button key={q.id} aria-pressed={selection === q.nodeId} onClick={() => select(q.nodeId)}>{q.title ?? nodeTitle(q.nodeId)}</button>)}
        <div className="rail-add">
          <button disabled={!project.scenario} onClick={() => add({ chapter: { id: newId('chapter'), title: '', purpose: '', summary: '' } })}>{c.addChapter}</button>
          <button onClick={() => addNode('event')}>{c.addNode}</button>
          <button onClick={() => addNode('quest')}>{c.addQuest}</button>
          <button disabled={project.nodes.length < 2} onClick={() => {
            const from = node?.id ?? project.nodes[0]!.id;
            add({ edge: { id: newId('edge'), from, to: project.nodes.find((n) => n.id !== from)!.id, label: '', travel: 'none', requiresVisited: [] } });
          }}>{c.addEdge}</button>
        </div></div></details>
      </nav>
      <div className="scenario-main">
        <div className="scenario-tabs">
          <button aria-pressed={view === 'graph'} onClick={() => setView('graph')}>{c.graph}</button>
          <button aria-pressed={view === 'outline'} onClick={() => setView('outline')}>{c.outline}</button>
          <button ref={toggle} className="inspector-toggle" aria-expanded={inspecting} aria-controls={entityIdPrefix + 'inspector'}
            onClick={() => { setInspecting(!inspecting); if (!inspecting) requestAnimationFrame(() => inspector.current?.focus()); }}>
            {inspecting ? c.hideInspector : c.showInspector}</button>
        </div>
        {view === 'graph' ? <ScenarioCanvas project={project} path={path} camera={camera} setCamera={setCamera} entityIdPrefix={entityIdPrefix} visibleIds={visibleIds} selected={draft ? undefined : selection} select={select} problems={problems}
          reset={() => edit((p) => { p.scenario!.layout = arrange(p); }, true)} move={(point) => edit((p) => {
            const positions = p.scenario!.layout;
            const i = positions.findIndex((pos) => pos.nodeId === point.nodeId);
            if (i < 0) positions.push(point); else positions[i] = point;
          }, true)} />
        : <section className="scenario-outline panel" aria-label={c.outlineName}>
          <label>{c.search}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          {[...chapters, undefined].map((ch) => {
            const nodes = visibleNodes.filter((n) => n.chapterId === ch?.id && (
              matches(ch?.title ?? c.unassigned) || matches(n.title) || matches(n.kind) || matches(kindLabel(n.kind)) ||
              project.edges.some((e) => e.from === n.id && matches(e.label))));
            if (!nodes.length && (!ch || chapterFilter || kindFilter || questFilter || !matches(ch.title))) return null;
            return <section className="outline-chapter" key={ch?.id ?? ''}>
              {ch ? nav(ch.id, ch.title) : <h3>{c.unassigned}</h3>}
              <ul>{nodes.map((n) => <li key={n.id}><span className="outline-kind">{kindLabel(n.kind)}</span>{nav(n.id, n.title, true)}
                <ul>{project.edges.filter((e) => e.from === n.id).map((e) => <li key={e.id}>
                  {nav(e.id, e.label)}<span className="muted"> → {nodeTitle(e.to)}</span></li>)}</ul>
              </li>)}</ul>
            </section>;
          })}
        </section>}
        {!visibleNodes.length && <p className="notice">{c.empty}</p>}
        <ScenarioFindings project={project} title={c.findings} findings={findings} canInspect={id => known.has(target(id))}
          inspect={id => { setReturnId(selection); select(id); inspector.current?.focus(); }} />
      </div>
      <aside id={entityIdPrefix + 'inspector'} hidden={!inspecting} ref={inspector} tabIndex={-1} className="scenario-inspector panel" aria-label={c.inspector}
        onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setInspecting(false); toggle.current?.focus(); } }}>
        {openAtlas && node?.locationId && <button onClick={()=>openAtlas(node.locationId!)}>{c.showLocation}</button>}
        {openAtlas && edge?.travel==='required' && edge.kind!=='reference' && <button onClick={()=>openAtlas(edge.id)}>{c.showJourney}</button>}
        <header><span className="outline-kind">{c.inspector}</span><h2>{title ?? (node ? c.addNode : chapter ? c.addChapter : edge ? c.addEdge : c.inspector)}</h2>
          {chosen && !draft && <small className="muted">{chosen.id}</small>}
        </header>
        {node?.kind === 'ending' && !draft && <section className="scenario-evidence" aria-label={c.evidence}>
          <h3>{c.evidence}</h3>{path?.length ? <><strong>{c.examplePath}</strong><p>{path.map(nodeTitle).join(' → ')}</p></> : <p>{c.noPath}</p>}
          {(incomplete || evidence?.complete === false) && <strong>{c.incomplete}</strong>}
          <p className="muted">{c.pathScope}</p>
          {checkSaved && <button onClick={checkSaved}>{c.checkSaved}</button>}
        </section>}
        {returnId && returnId !== selection && <button onClick={() => { select(returnId); setReturnId(undefined); }}>{c.back}</button>}
        {edge && !draft && <div className="actions"><button onClick={() => select(edge.from)}>{c.fromNode}</button><button onClick={() => select(edge.to)}>{c.toNode}</button></div>}
        {chapter && !draft && <div className="actions">
          <button disabled={chapterIndex < 1} onClick={() => shiftChapter(-1)}>{c.moveUp}</button>
          <button disabled={chapterIndex >= chapters.length - 1} onClick={() => shiftChapter(1)}>{c.moveDown}</button>
        </div>}
        {members && <div className="actions">{members.map((n) => nav(n.id, n.title))}</div>}
        {linked && linked.length > 0 && <details><summary>{c.linked} ({number(linked.length)})</summary>
          <div className="actions">{linked.map((e) => nav(e.id, e.label))}</div>
        </details>}
        {node && !draft && project.nodes.length > 1 && <details><summary>{c.addReference}</summary>
          <p>{c.referenceHint}</p><button onClick={() => add({ edge: { id: newId('edge'), from: node.id,
            to: project.nodes.find(other => other.id !== node.id)!.id, label: '', kind: 'reference', travel: 'none', requiresVisited: [] } })}>{c.addReference}</button>
        </details>}
        {node && <NodeInspector key={JSON.stringify([node, quest, project.endings.find((e) => e.nodeId === node.id)])}
          project={project} original={node} edit={edit} select={select} isNew={!!draft} checkSaved={checkSaved} />}
        {chapter && <ChapterInspector key={JSON.stringify(chapter)} original={chapter} edit={edit} select={select} isNew={!!draft} />}
        {edge && <EdgeInspector key={JSON.stringify(edge)} original={edge} project={project} edit={edit} select={select} isNew={!!draft} />}
        {place && !draft && <div><p>{kindLabel(place.kind)}</p><p>{place.description}</p>{openAtlas && <button onClick={()=>openAtlas(place.id)}>{c.showLocation}</button>}
          <div className="actions">{project.nodes.filter((n) => n.locationId === place.id).map((n) => nav(n.id, n.title))}</div></div>}
        {!chosen && <p>{c.noSelection}</p>}
        <div className="actions">
          {draft ? <button onClick={() => { setDraft(undefined); setConfirm(false); }}>{c.cancel}</button> : <>
            {node && revise && <button onClick={() => revise(node.id)}>{c.revise}</button>}
            {quest && revise && <button onClick={() => revise(quest.id)}>{c.reviseQuest}</button>}
            {chapter && revise && <button onClick={() => revise(chapter.id)}>{c.reviseChapter}</button>}
            {(node || edge || chapter) && <button onClick={() => setConfirm(true)}>{node ? c.deleteNode : edge ? c.deleteEdge : c.deleteChapter}</button>}
          </>}
        </div>
        {confirm && <div className="notice" role="alert"><p>{node ? c.deleteNodeDetail : edge ? c.deleteEdgeDetail : c.deleteChapterDetail}</p>
          {edge && <p>{nodeTitle(edge.from)} · {edge.from} → {nodeTitle(edge.to)} · {edge.to}</p>}
          <strong>{c.affected}</strong><ul>{chosen && deletionImpact(project, chosen.id).map((r) => <li key={r.id}>{r.name} · {r.id}</li>)}</ul>
          <div className="actions"><button onClick={erase}>{c.confirmDeletion}</button><button onClick={() => setConfirm(false)}>{c.cancel}</button></div>
        </div>}
      </aside>
    </div>
  </div>;
}
