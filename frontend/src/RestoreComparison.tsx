import { useState } from 'react';
import { useFormatter } from './locale';
import type { Project } from './project.generated';
import { useRestoreCopy } from './restoreCopy';
import { equalData } from './scenarioWorkflow';
import type { SavedProject } from './storage';

type Copy = ReturnType<typeof useRestoreCopy>;
export interface RestorePreview {
  current: SavedProject;
  backup: Project;
  fileDate: number;
}

function Changes<T extends object>({ name, before, after, identify, label, copy }: {
  name: string; before: T[]; after: T[]; identify: (row: T) => string; label: (row: T) => string; copy: Copy;
}) {
  const [limit, setLimit] = useState(20);
  const { number } = useFormatter();
  const from = new Map(before.map(row => [identify(row), row]));
  const to = new Map(after.map(row => [identify(row), row]));
  const ids = [...new Set([...from.keys(), ...to.keys()])].filter(id => !equalData(from.get(id), to.get(id)));
  const commonBefore = [...from.keys()].filter(id => to.has(id));
  const reordered = !equalData(commonBefore, [...to.keys()].filter(id => from.has(id)));
  if (!ids.length && !before.length && !after.length) return null;
  return <section><h4>{name} · {number(before.length)} → {number(after.length)}</h4>
    {reordered && <p>{copy.reordered}</p>}
    {ids.length ? <ul>{ids.slice(0, limit).map(id => {
      const left = from.get(id), right = to.get(id);
      return <li key={id}><strong>{!left ? copy.added : !right ? copy.removed : copy.changed}</strong>
        {left && <div className="creative"><small>{copy.current} </small><span>{label(left)}</span></div>}
        {right && <div className="creative"><small>{copy.backup} </small><span>{label(right)}</span></div>}
        {left && right && <details><summary>{copy.fields}</summary><ul>
          {[...new Set([...Object.keys(left), ...Object.keys(right)])].filter(key =>
            !equalData(Reflect.get(left, key), Reflect.get(right, key))).map(key =>
              <li key={key}><code>{key}</code></li>)}
        </ul></details>}
      </li>;
    })}</ul> : !reordered && <small>{copy.same}</small>}
    {ids.length > limit && <button type="button" onClick={() => setLimit(limit + 20)}>{copy.more}</button>}
  </section>;
}

const idOf = (row: { id: string }) => row.id;
export function RestoreComparison({ current, backup, fileDate }: RestorePreview) {
  const c = useRestoreCopy(), format = useFormatter(), saved = current.project;
  const group = <T extends { id: string }>(name: string, a: T[], b: T[], label: (row: T) => string) =>
    <Changes name={name} before={a} after={b} identify={idOf} label={label} copy={c} />;
  const approval = (exists: boolean, approved?: boolean) => !exists ? c.none : approved ? c.approved : c.draft;
  return <>
    <div className="replacement-grid switch-grid">{[saved, backup].map((p, index) =>
      <section key={index}><h3>{index ? c.backup : c.current}</h3><p className="creative">{p.title}</p>
        <p>{c.revision} {format.number(p.revision)} · {index ? c.fileDate : c.saved} {format.date(index ? fileDate : current.savedAt, {dateStyle: 'medium', timeStyle: 'short'})}</p>
        <h4>{c.approval}</h4>
        <p>{c.narrative} · {approval(!!p.narrative, p.narrative?.approved)}<br/>
          {c.scenario} · {approval(!!p.scenario, p.scenario?.approved)}<br/>
          {c.world} · {approval(!!p.world, p.world?.approved)}<br/>
          {c.final} · {p.approval ? c.approved : c.draft}</p>
      </section>)}</div>
    {group(c.fragments, saved.userContent, backup.userContent, r => r.text)}
    {group(c.facts, saved.canonicalFacts, backup.canonicalFacts, r => r.statement)}
    {group(c.narrative, saved.narrative ? [saved.narrative] : [], backup.narrative ? [backup.narrative] : [], r => r.story.title + ' · ' + r.story.premise)}
    {group(c.chapters, saved.scenario?.chapters ?? [], backup.scenario?.chapters ?? [], r => r.title)}
    {group(c.nodes, saved.nodes, backup.nodes, r => r.title + ' · ' + r.description)}
    {group(c.edges, saved.edges, backup.edges, r => r.label || r.from + ' → ' + r.to)}
    {group(c.quests, saved.quests, backup.quests, r => r.title ?? r.objective)}
    {group(c.endings, saved.endings, backup.endings, r => r.consequence)}
    {group(c.characters, saved.characters, backup.characters, r => r.name + ' · ' + r.role)}
    {group(c.factions, saved.factions, backup.factions, r => r.name + ' · ' + r.aim)}
    {group(c.locations, saved.scenario?.locations ?? [], backup.scenario?.locations ?? [], r => r.name)}
    {group(c.world, saved.world ? [saved.world] : [], backup.world ? [backup.world] : [], r => (r.name ?? c.world) + ' · ' + format.number(r.seed))}
    {group(c.places, saved.world?.locations ?? [], backup.world?.locations ?? [], r => r.name)}
    <Changes name={c.history} before={saved.verificationHistory ?? []} after={backup.verificationHistory ?? []}
      identify={r => r.runId} label={r => Number.isFinite(Date.parse(r.timestamp))
        ? format.date(new Date(r.timestamp), { dateStyle: 'medium', timeStyle: 'short' }) : r.timestamp} copy={c}/>
  </>;
}
