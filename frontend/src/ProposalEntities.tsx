import type { Project, StateTerm } from './project.generated';

export default function ProposalEntities({ before, after }: { before: Project; after: Project }) {
  function rows(p: Project) {
    return [
      ...p.characters.map(x => ({ ...x, kind: 'Character', detail: x.role })),
      ...p.factions.map(x => ({ ...x, kind: 'Faction', detail: x.aim })),
      ...(p.stateEntities ?? []).map(x => ({ ...x, detail: '' })),
      ...(p.world?.locations ?? []).map(x => ({ ...x, kind: 'Location', detail: x.kind })),
      ...(p.scenario?.locations ?? []).map(x => ({ ...x, kind: 'Location', detail: x.kind + ' · ' + x.purpose })),
    ];
  }
  const previous = new Map(rows(before).map(row => [row.id, row]));
  const catalog = rows(after);
  const uses = new Map<string, Set<string>>();
  function link(id: string | undefined, description: string) {
    if (!id) return;
    const existing = uses.get(id);
    if (existing) existing.add(description);
    else uses.set(id, new Set([description]));
  }
  function terms(list: StateTerm[] | undefined, usage: string) {
    for (const t of list ?? []) link(t.key, usage + ' · ' + t.kind + ' = ' + t.value);
  }
  for (const x of after.characters) link(x.factionId, x.name + ' · ' + x.id);
  for (const n of after.nodes) {
    const scene = n.title + ' · ' + n.id;
    link(n.locationId, scene);
    for (const id of [...n.characterIds, ...n.factionIds ?? []]) link(id, scene);
    terms(n.conditions, scene + ' · Requires');
    terms(n.consequences, scene + ' · Sets');
  }
  for (const q of after.quests) {
    const quest = (q.title ?? q.objective) + ' · ' + q.id;
    for (const id of [...q.locationIds ?? [], ...q.characterIds ?? [], ...q.factionIds ?? []]) link(id, quest);
    terms(q.completion, quest + ' · Completion');
    terms(q.failure, quest + ' · Failure');
  }
  for (const e of after.edges) {
    const edge = e.label + ' · ' + e.id;
    terms(e.conditions, edge + ' · Requires');
    terms(e.consequences, edge + ' · Sets');
  }
  for (const g of after.scenario?.geography ?? []) {
    const relation = [g.from, g.relation, g.to, g.via].filter(Boolean).join(' · ');
    for (const id of [g.from, g.to, g.via]) link(id, relation);
  }
  const retained = new Set(catalog.map(row => row.id));
  const removed = [...previous.values()].filter(x => !retained.has(x.id));
  return <section className="proposal-entities" aria-label="Proposal entities">
    <h3>Proposal entities</h3>
    <ul>{catalog.map(x => {
      const old = previous.get(x.id);
      const status = !old ? 'New' : old.name === x.name && old.detail === x.detail ? 'Existing' : 'Updated';
      return <li key={x.id}>
        <strong>{x.name}</strong> · {x.kind} · {status} <code>{x.id}</code>
        {x.detail && <p>{x.detail}</p>}
        {'factionId' in x && x.factionId && <p>Faction · <code>{x.factionId}</code></p>}
        {uses.has(x.id) && <details><summary>Used by ({uses.get(x.id)!.size})</summary>
          <ul>{[...uses.get(x.id)!].map(label => <li key={label}>{label}</li>)}</ul>
        </details>}
      </li>;
    })}</ul>
    {removed.length > 0 && <p>Removed from this design · {removed.map(x => x.name + ' (' + x.id + ')').join(', ')}</p>}
  </section>;
}
