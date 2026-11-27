import { useState } from 'react';
import type { Chapter, Project, ScenarioEdge } from './project.generated';
import type { ScenarioEditorProps } from './ScenarioEditor';
import { edgeKinds, studioCopy, useScenarioKind, useStudioCopy } from './scenarioCopy';
import { connectionError } from './scenarioGraph';
import { MultiField, options, SelectField, StateFields, TextField } from './ScenarioFields';

export function EdgeInspector({ project, original, edit, select, isNew }: {
  project: Project; original: ScenarioEdge; edit: ScenarioEditorProps['edit']; select: (id: string) => void; isNew: boolean;
}) {
  const c = useStudioCopy();
  const kindLabel = useScenarioKind();
  const [edge, setEdge] = useState(original);
  const [error, setError] = useState('');
  const nodes = project.nodes.map((n) => ({ id: n.id, name: n.title }));
  function change(patch: Partial<ScenarioEdge>) { setEdge({ ...edge, ...patch }); setError(''); }
  return <form className="scenario-form" onSubmit={async (e) => {
    e.preventDefault();
    const reason = connectionError(project, edge);
    if (reason) { setError(reason); return; }
    const saved = await edit((p) => {
      if (isNew) p.edges.push(edge);
      else p.edges[p.edges.findIndex((item) => item.id === edge.id)] = edge;
    });
    if (saved !== false) select(edge.id);
  }}>
    <TextField label={c.edgeLabel} value={edge.label} onChange={(label) => change({ label })} required />
    <div className="paired-fields">
      <SelectField label={c.from} options={nodes} value={edge.from} onChange={(from) => change({ from })} />
      <SelectField label={c.to} options={nodes} value={edge.to} onChange={(to) => change({ to })} />
    </div>
    {error && <p className="error" role="alert">{error === studioCopy.cycle ? c.cycle : c.selfEdge}</p>}
    <SelectField label={c.edgeType} options={options(edgeKinds, kindLabel)} value={edge.kind ?? 'progression'} onChange={(kind) => change({ kind: kind as ScenarioEdge['kind'] })} />
    {edge.kind === 'reference' && <p className="notice">{c.referenceHint}</p>}
    {edge.kind !== 'reference' && <>
    <SelectField label={c.travel} options={[{ id: 'none', name: c.sceneCut }, { id: 'required', name: c.travelRequired }]}
      value={edge.travel} onChange={(travel) => change({ travel: travel as ScenarioEdge['travel'] })} />
    <MultiField label={c.visited} options={nodes} values={edge.requiresVisited} onChange={(requiresVisited) => change({ requiresVisited })} />
    <StateFields project={project} label={c.conditions} terms={edge.conditions} change={(conditions) => change({ conditions })} />
    <StateFields project={project} label={c.effects} terms={edge.consequences} change={(consequences) => change({ consequences })} effect />
    </>}
    <button className="primary">{c.saveEdge}</button>
  </form>;
}

export function ChapterInspector({ original, edit, select, isNew }: {
  original: Chapter; edit: ScenarioEditorProps['edit']; select: (id: string) => void; isNew: boolean;
}) {
  const c = useStudioCopy();
  const [chapter, setChapter] = useState(original);
  return <form className="scenario-form" onSubmit={async (e) => {
    e.preventDefault();
    const saved = await edit((p) => {
      if (isNew) p.scenario!.chapters.push(chapter);
      else p.scenario!.chapters[p.scenario!.chapters.findIndex((ch) => ch.id === chapter.id)] = chapter;
    });
    if (saved !== false) select(chapter.id);
  }}>
    <TextField label={c.title} required value={chapter.title} onChange={(title) => setChapter({ ...chapter, title })} />
    <TextField label={c.purpose} required value={chapter.purpose} onChange={(purpose) => setChapter({ ...chapter, purpose })} />
    <TextField label={c.summary} area required value={chapter.summary} onChange={(summary) => setChapter({ ...chapter, summary })} />
    <button className="primary">{c.saveChapter}</button>
  </form>;
}
