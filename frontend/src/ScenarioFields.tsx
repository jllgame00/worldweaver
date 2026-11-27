import { stateKinds, useScenarioKind, useStudioCopy } from './scenarioCopy';
import type { Project, StateTerm } from './project.generated';
import { effectiveStateEntities } from './validation';

export function TextField({ label, value, onChange, required, area }: {
  label: string; value?: string; onChange: (s: string) => void; required?: boolean; area?: boolean;
}) {
  return <label>{label}{area
    ? <textarea rows={2} required={required} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    : <input required={required} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />}</label>;
}

export interface Option { id: string; name: string }
export function SelectField({ label, value, options, onChange, optional }: {
  label: string; value?: string; options: readonly Option[]; onChange: (s: string) => void; optional?: boolean;
}) {
  const c = useStudioCopy();
  return <label>{label}<select required={!optional} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
    {(optional || !value) && <option value="">{c.none}</option>}
    {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
  </select></label>;
}

export function MultiField({ label, values, options, onChange }: {
  label: string; values?: string[]; options: readonly Option[]; onChange: (ids: string[]) => void;
}) {
  const c = useStudioCopy();
  return <fieldset className="scenario-multi"><legend>{label}</legend>
    {!options.length && <span className="muted">{c.none}</span>}
    {options.map((option) => <label key={option.id} className="checkbox-label">
      <input type="checkbox" checked={values?.includes(option.id) ?? false} onChange={(e) =>
        onChange(e.target.checked ? [...values ?? [], option.id] : (values ?? []).filter((id) => id !== option.id))} />
      {option.name}
    </label>)}
  </fieldset>;
}

export function options(values: readonly string[], label: (id: string) => string): Option[] {
  return values.map((id) => ({ id, name: label(id) }));
}

export function StateFields({ label, terms = [], change, effect, project }: {
  project: Project; label: string; terms?: StateTerm[]; change: (terms: StateTerm[]) => void; effect?: boolean;
}) {
  const c = useStudioCopy();
  const kindLabel = useScenarioKind();
  const states = effectiveStateEntities(project);
  const refs: Record<StateTerm['kind'], readonly Option[]> = {
    item: states.filter(s => s.kind === 'item'),
    decision: states.filter(s => s.kind === 'decision'),
    flag: states.filter(s => s.kind === 'flag'),
    quest: project.quests.map((q) => ({ id: q.id, name: q.title ?? project.nodes.find((n) => n.id === q.nodeId)?.title ?? q.objective })),
    character: project.characters,
    relationship: project.factions,
    location: [...project.world?.locations ?? [], ...project.scenario?.locations ?? []],
  };
  function update(index: number, patch: Partial<StateTerm>) {
    change(terms.map((term, i) => i === index ? { ...term, ...patch } : term));
  }
  return <fieldset className="scenario-state"><legend>{label}</legend>
    {terms.map((term, i) => <div className="state-row" key={i}>
      <SelectField label={c.termKind} value={term.kind} options={options(stateKinds, kindLabel)}
        onChange={(kind) => update(i, { kind: kind as StateTerm['kind'], key: '' })} />
      <SelectField label={c.termKey} value={term.key} options={refs[term.kind]} onChange={(key) => update(i, { key })} />
      <TextField label={c.termValue} value={term.value} required onChange={(value) => update(i, { value })} />
      <button type="button" onClick={() => change(terms.filter((_, n) => n !== i))}>{c.remove}</button>
    </div>)}
    <button type="button" onClick={() => change([...terms, { kind: 'flag', key: '', value: '' }])}>{effect ? c.addEffect : c.addTerm}</button>
  </fieldset>;
}
