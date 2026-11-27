import type { Project } from './project.generated';
import { useScenarioFieldLabel, useScenarioKind } from './scenarioCopy';
import { useScenarioRecoveryCopy } from './scenarioRecoveryCopy';

function graphRows(p: Project) {
  return [...p.nodes, ...p.edges, ...p.quests, ...p.endings, ...p.scenario?.chapters ?? [],
    ...p.characters, ...p.factions, ...p.stateEntities ?? []].map(row => ({
    id: row.id,
    name: ('label' in row && row.label) || ('title' in row && row.title) || ('name' in row && row.name)
      || ('objective' in row && row.objective) || ('consequence' in row && row.consequence) || row.id,
    fields: new Map<string, unknown>(Object.entries(row)),
  }));
}
export default function RecoveryChanges({ original, edited }: { original: Project; edited: Project }) {
  const { changes: c } = useScenarioRecoveryCopy();
  const fieldLabel = useScenarioFieldLabel();
  const kindLabel = useScenarioKind();
  function format(value: unknown, field?: string): string {
    if (Array.isArray(value)) return value.map(item => format(item)).join(', ') || c.none;
    if (value && typeof value === 'object' && 'kind' in value && 'key' in value && 'value' in value)
      return kindLabel(String(value.kind)) + ' ' + value.key + ' = ' + value.value;
    if (value == null) return c.none;
    return field === 'kind' ? kindLabel(String(value)) : String(value);
  }
  const previous = new Map(graphRows(original).map(r => [r.id, r]));
  const next = new Map(graphRows(edited).map(r => [r.id, r]));
  const ids = new Set([...previous.keys(), ...next.keys()]);
  return <section aria-label={c.title}>
    <h3>{c.title}</h3>
    <ul>{[...ids].map(id => {
      const before = previous.get(id), after = next.get(id);
      if (!before || !after) return <li key={id}>{before ? c.removed : c.added} · {before?.name ?? after?.name} · {id}</li>;
      const fields = [...new Set([...before.fields.keys(), ...after.fields.keys()])]
        .filter(field => JSON.stringify(before.fields.get(field)) !== JSON.stringify(after.fields.get(field)));
      if (!fields.length) return null;
      return <li key={id}><strong>{after.name}</strong> · {id}
        <dl>{fields.map(field => <div key={field}><dt>{fieldLabel(field, field.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())}</dt>
          <dd>{format(before.fields.get(field), field)} → {format(after.fields.get(field), field)}</dd></div>)}</dl>
      </li>;
    })}</ul>
  </section>;
}
