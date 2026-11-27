import { useRef, useState } from 'react';
import {atlasPlaces} from './atlasPlaces';
import type { Ending, Project, Quest, ScenarioNode } from './project.generated';
import { newId } from './project';
import { removeQuests } from './scenarioGraph';
import { nodeKinds, questKinds, useScenarioKind, useStudioCopy } from './scenarioCopy';
import { MultiField, options, SelectField, StateFields, TextField } from './ScenarioFields';
import type { ScenarioEditorProps } from './ScenarioEditor';

export function freshNode(kind: ScenarioNode['kind'], chapterId?: string): ScenarioNode {
  return { id: newId('node'), title: '', description: '', kind, ...(chapterId && { chapterId }),
    mandatory: kind !== 'quest', characterIds: [], requiresVisited: [] };
}

export function NodeInspector({ project, original, edit, select, isNew, checkSaved }: {
  project: Project; original: ScenarioNode; edit: ScenarioEditorProps['edit']; select: (id: string) => void; isNew: boolean;
  checkSaved?: () => void;
}) {
  const c = useStudioCopy();
  const kindLabel = useScenarioKind();
  const [node, setNode] = useState(original);
  const priorQuest = project.quests.find((q) => q.nodeId === original.id);
  const priorEnding = project.endings.find((e) => e.nodeId === original.id);
  const [quest, setQuest] = useState<Quest>(() => priorQuest ??
    { id: newId('quest'), nodeId: original.id, kind: 'main', objective: '', outcome: '' });
  const [ending, setEnding] = useState<Ending>(() => priorEnding ??
    { id: newId('ending'), nodeId: original.id, consequence: '' });
  const [confirm, setConfirm] = useState(false);
  const visitFields = useRef<HTMLDivElement>(null);
  const places = atlasPlaces(project);
  const nodeOptions = project.nodes.filter((n) => n.id !== original.id).map((n) => ({ id: n.id, name: n.title }));
  function changeNode(patch: Partial<ScenarioNode>) { setNode({ ...node, ...patch }); }
  function changeQuest(patch: Partial<Quest>) { setQuest({ ...quest, ...patch }); }
  async function save() {
    const saved = await edit((p) => {
      const saved = { ...node };
      if (!saved.chapterId) delete saved.chapterId;
      if (!saved.locationId) delete saved.locationId;
      if (!saved.purpose) delete saved.purpose;
      if (!saved.outcome) delete saved.outcome;
      if (saved.kind === 'quest' || !saved.objective) delete saved.objective;
      if (isNew) p.nodes.push(saved);
      else p.nodes[p.nodes.findIndex((n) => n.id === saved.id)] = saved;
      if (saved.kind === 'quest') {
        const next = { ...quest };
        if (!next.title) delete next.title;
        if (!next.description) delete next.description;
        if (!next.reward) delete next.reward;
        const i = p.quests.findIndex((q) => q.nodeId === node.id);
        if (i < 0) p.quests.push(next);
        else p.quests[i] = next;
      }
      if (saved.kind === 'ending' && !priorEnding) p.endings.push(ending);
      if (saved.kind === 'ending' && priorEnding) p.endings[p.endings.findIndex((e) => e.id === priorEnding.id)] = ending;
      if (priorEnding && saved.kind !== 'ending') p.endings = p.endings.filter((e) => e.id !== priorEnding.id);
      if (priorQuest && saved.kind !== 'quest') removeQuests(p, new Set([priorQuest.id]));
    });
    if (saved === false) return;
    setConfirm(false);
    select(node.id);
  }
  return <form className="scenario-form" onSubmit={(e) => {
    e.preventDefault();
    if (!confirm && ((priorQuest && node.kind !== 'quest') || (priorEnding && node.kind !== 'ending'))) setConfirm(true);
    else save();
  }}>
    <SelectField label={c.nodeType} value={node.kind} options={options(nodeKinds, kindLabel)}
      onChange={(kind) => { setConfirm(false); changeNode({ kind: kind as ScenarioNode['kind'] }); }} />
    <TextField label={c.title} value={node.title} onChange={(title) => changeNode({ title })} required />
    <TextField label={c.description} value={node.description} onChange={(description) => changeNode({ description })} required area />
    <SelectField label={c.chapter} value={node.chapterId} optional options={(project.scenario?.chapters ?? []).map((ch) => ({ id: ch.id, name: ch.title }))}
      onChange={(chapterId) => changeNode({ chapterId })} />
    <TextField label={c.purpose} value={node.purpose} onChange={(purpose) => changeNode({ purpose })} />
    {node.kind !== 'quest' && <TextField label={c.objective} value={node.objective} onChange={(objective) => changeNode({ objective })} />}
    <TextField label={c.outcome} value={node.outcome} onChange={(outcome) => changeNode({ outcome })} />
    <SelectField label={c.place} value={node.locationId} options={places} optional={node.kind !== 'quest'} onChange={(locationId) => changeNode({ locationId })} />
    <label className="checkbox-label"><input type="checkbox" checked={node.mandatory} onChange={(e) => changeNode({ mandatory: e.target.checked })} />{c.mandatory}</label>
    <h3>{c.participants}</h3>
    <MultiField label={c.characters} options={project.characters} values={node.characterIds} onChange={(characterIds) => changeNode({ characterIds })} />
    <MultiField label={c.factions} options={project.factions} values={node.factionIds} onChange={(factionIds) => changeNode({ factionIds })} />
    <div className="scenario-visits" ref={visitFields}>
      {node.kind === 'prologue' && node.requiresVisited.length > 0 && <div role="alert" className="notice">
        <p>{c.prologueVisits(node.title, node.requiresVisited.map(id => project.nodes.find(other => other.id === id)?.title ?? id).join(', '))}</p>
        <button type="button" onClick={() => visitFields.current?.querySelector<HTMLInputElement>('input:checked')?.focus()}>{c.reviewVisits}</button>
      </div>}
      <p>{c.visitHint}</p>
      <MultiField label={c.visited} options={nodeOptions} values={node.requiresVisited} onChange={(requiresVisited) => changeNode({ requiresVisited })} />
      {node.kind === 'prologue' && checkSaved && (node === original && !isNew ?
        <button type="button" onClick={checkSaved}>{c.checkSaved}</button> : <small>{c.saveBeforeCheck}</small>)}
    </div>
    <StateFields project={project} label={c.conditions} terms={node.conditions} change={(conditions) => changeNode({ conditions })} />
    <StateFields project={project} label={c.effects} terms={node.consequences} change={(consequences) => changeNode({ consequences })} effect />
    {node.kind === 'quest' && <fieldset><legend>{c.quest}</legend>
      <SelectField label={c.questType} value={quest.kind ?? 'main'} options={options(questKinds, kindLabel)} onChange={(kind) => changeQuest({ kind: kind as Quest['kind'] })} />
      <TextField label={c.questTitle} value={quest.title} onChange={(title) => changeQuest({ title })} />
      <TextField label={c.questDescription} value={quest.description} onChange={(description) => changeQuest({ description })} area />
      <TextField label={c.questObjective} value={quest.objective} required onChange={(objective) => changeQuest({ objective })} area />
      <TextField label={c.questOutcome} value={quest.outcome} required onChange={(outcome) => changeQuest({ outcome })} area />
      <TextField label={c.reward} value={quest.reward} onChange={(reward) => changeQuest({ reward })} />
      <MultiField label={c.prerequisites} options={project.quests.filter((q) => q.id !== quest.id).map((q) =>
        ({ id: q.id, name: q.title ?? project.nodes.find((n) => n.id === q.nodeId)?.title ?? q.id }))}
        values={quest.prerequisiteIds} onChange={(prerequisiteIds) => changeQuest({ prerequisiteIds })} />
      <MultiField label={c.questLocations} options={places} values={quest.locationIds} onChange={(locationIds) => changeQuest({ locationIds })} />
      <MultiField label={c.questCharacters} options={project.characters} values={quest.characterIds} onChange={(characterIds) => changeQuest({ characterIds })} />
      <MultiField label={c.questFactions} options={project.factions} values={quest.factionIds} onChange={(factionIds) => changeQuest({ factionIds })} />
      <StateFields project={project} label={c.questComplete} terms={quest.completion} change={(completion) => changeQuest({ completion })} />
      <StateFields project={project} label={c.questFail} terms={quest.failure} change={(failure) => changeQuest({ failure })} />
    </fieldset>}
    {node.kind === 'ending' && <TextField label={c.ending} value={ending.consequence} required onChange={(consequence) => setEnding({ ...ending, consequence })} area />}
    {confirm && <p role="alert">{c.replaceKind}</p>}
    <button className="primary" type="submit">{confirm ? c.confirmChange : c.saveNode}</button>
  </form>;
}
