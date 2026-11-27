import type { Project, StateTerm } from './project.generated';

import { useFormatter } from './locale';
import { useScenarioKind } from './scenarioCopy';
import { scenarioRecoveryCopy, useScenarioRecoveryCopy } from './scenarioRecoveryCopy';

export default function ProposalEntities({ before, after }: { before: Project; after: Project }) {
  const { entities: c } = useScenarioRecoveryCopy();
  const { number } = useFormatter();
  const kindLabel = useScenarioKind();
  const english = scenarioRecoveryCopy.entities;
  function rows(p: Project) {
    return [
      ...p.characters.map(x => ({ ...x, kind: 'character' as const, detail: x.role })),
      ...p.factions.map(x => ({ ...x, kind: 'faction' as const, detail: x.aim })),
      ...(p.stateEntities ?? []).map(x => ({ ...x, detail: '' })),
      ...(p.world?.locations ?? []).map(x => ({ ...x, kind: 'location' as const, detail: x.kind, display: kindLabel(x.kind) })),
      ...(p.scenario?.locations ?? []).map(x => ({ ...x, kind: 'location' as const, detail: x.kind + ' · ' + x.purpose, display: kindLabel(x.kind) + ' · ' + x.purpose })),
    ];
  }
  const previous = new Map(rows(before).map(row => [row.id, row]));
  const catalog = rows(after);
  const uses = new Map<string, Map<string, string>>();
  function link(id: string | undefined, description: string, display = description) {
    if (!id) return;
    const existing = uses.get(id);
    if (existing) existing.set(description, display);
    else uses.set(id, new Map([[description, display]]));
  }
  function terms(list: StateTerm[] | undefined, usage: string, action: 'requires' | 'sets' | 'completion' | 'failure') {
    for (const t of list ?? [])
      link(t.key, usage + ' · ' + english[action] + ' · ' + t.kind + ' = ' + t.value,
        usage + ' · ' + c[action] + ' · ' + kindLabel(t.kind) + ' = ' + t.value);
  }
  for (const x of after.characters) link(x.factionId, x.name + ' · ' + x.id);
  for (const n of after.nodes) {
    const scene = n.title + ' · ' + n.id;
    link(n.locationId, scene);
    for (const id of [...n.characterIds, ...n.factionIds ?? []]) link(id, scene);
    terms(n.conditions, scene, 'requires');
    terms(n.consequences, scene, 'sets');
  }
  for (const q of after.quests) {
    const quest = (q.title ?? q.objective) + ' · ' + q.id;
    for (const id of [...q.locationIds ?? [], ...q.characterIds ?? [], ...q.factionIds ?? []]) link(id, quest);
    terms(q.completion, quest, 'completion');
    terms(q.failure, quest, 'failure');
  }
  for (const e of after.edges) {
    const edge = e.label + ' · ' + e.id;
    terms(e.conditions, edge, 'requires');
    terms(e.consequences, edge, 'sets');
  }
  for (const g of after.scenario?.geography ?? []) {
    const relation = [g.from, g.relation, g.to, g.via].filter(Boolean).join(' · ');
    const display = [g.from, kindLabel(g.relation), g.to, g.via].filter(Boolean).join(' · ');
    for (const id of [g.from, g.to, g.via]) link(id, relation, display);
  }
  const retained = new Set(catalog.map(row => row.id));
  const removed = [...previous.values()].filter(x => !retained.has(x.id));
  return <section className="proposal-entities" aria-label={c.title}>
    <h3>{c.title}</h3>
    <ul>{catalog.map(x => {
      const old = previous.get(x.id);
      const status = !old ? c.new : old.name === x.name && old.detail === x.detail ? c.existing : c.updated;
      return <li key={x.id}>
        <strong>{x.name}</strong> · {x.kind === 'character' || x.kind === 'faction' || x.kind === 'location' ? c[x.kind] : kindLabel(x.kind)} · {status} <code>{x.id}</code>
        {x.detail && <p>{'display' in x ? x.display : x.detail}</p>}
        {'factionId' in x && x.factionId && <p>{c.faction} · <code>{x.factionId}</code></p>}
        {uses.has(x.id) && <details><summary>{c.usedBy} ({number(uses.get(x.id)!.size)})</summary>
          <ul>{[...uses.get(x.id)!].map(([id, label]) => <li key={id}>{label}</li>)}</ul>
        </details>}
      </li>;
    })}</ul>
    {removed.length > 0 && <p>{c.removed} · {removed.map(x => x.name + ' (' + x.id + ')').join(', ')}</p>}
  </section>;
}
