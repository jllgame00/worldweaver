import type { Project } from './project.generated';

function graphRows(p: Project) {
  return [...p.nodes, ...p.edges, ...p.quests, ...p.endings, ...p.scenario?.chapters ?? [],
    ...p.characters, ...p.factions, ...p.stateEntities ?? []].map(row => ({
    id: row.id,
    name: ('label' in row && row.label) || ('title' in row && row.title) || ('name' in row && row.name)
      || ('objective' in row && row.objective) || ('consequence' in row && row.consequence) || row.id,
    fields: new Map<string, unknown>(Object.entries(row)),
  }));
}
function format(value: unknown): string {
  if (Array.isArray(value)) return value.map(format).join(', ') || 'None';
  if (value && typeof value === 'object' && 'kind' in value && 'key' in value && 'value' in value)
    return value.kind + ' ' + value.key + ' = ' + value.value;
  return value == null ? 'None' : String(value);
}
export default function RecoveryChanges({ original, edited }: { original: Project; edited: Project }) {
  const previous = new Map(graphRows(original).map(r => [r.id, r]));
  const next = new Map(graphRows(edited).map(r => [r.id, r]));
  const ids = new Set([...previous.keys(), ...next.keys()]);
  return <section aria-label="Edits to the rejected graph">
    <h3>Edits to the rejected graph</h3>
    <ul>{[...ids].map(id => {
      const before = previous.get(id), after = next.get(id);
      if (!before || !after) return <li key={id}>{before ? 'Removed' : 'Added'} · {before?.name ?? after?.name} · {id}</li>;
      const fields = [...new Set([...before.fields.keys(), ...after.fields.keys()])]
        .filter(field => JSON.stringify(before.fields.get(field)) !== JSON.stringify(after.fields.get(field)));
      if (!fields.length) return null;
      return <li key={id}><strong>{after.name}</strong> · {id}
        <dl>{fields.map(field => <div key={field}><dt>{field.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}</dt>
          <dd>{format(before.fields.get(field))} → {format(after.fields.get(field))}</dd></div>)}</dl>
      </li>;
    })}</ul>
  </section>;
}
