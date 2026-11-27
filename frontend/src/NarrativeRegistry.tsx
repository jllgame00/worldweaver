import { useState, type FormEvent } from 'react';
import { advance, newId } from './project';
import type { Project } from './project.generated';
import { effectiveStateEntities, isProject, structurallyValidProject } from './validation';

const labels = {
  title: 'Canonical entities',
  kind: 'Entity type',
  character: 'Character',
  faction: 'Faction',
  item: 'Item or artifact',
  flag: 'Narrative flag',
  decision: 'Player decision',
  name: 'Entity name',
  role: 'Character role',
  aim: 'Faction aim',
  factionId: 'Affiliated faction',
  none: 'None',
  add: 'Register entity',
  addDraft: 'Add entity to proposal',
  duplicate: 'An entity with this name already exists in this category.',
  conflict:
    'This legacy project uses overlapping state IDs. Prepare its state inventory with a reviewed scenario proposal.',
};
type Kind = 'character' | 'faction' | 'item' | 'flag' | 'decision';

export default function NarrativeRegistry({
  project,
  disabled,
  commit,
  proposal = false,
}: {
  project: Project;
  disabled: boolean;
  commit: (p: Project) => Promise<boolean>;
  proposal?: boolean;
}) {
  const [kind, setKind] = useState<Kind>('character');
  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');
  const [faction, setFaction] = useState('');
  const [error, setError] = useState('');
  const states = effectiveStateEntities(project);
  const registered = [
    ...project.characters.map((row) => ({ ...row, kind: 'character' as const })),
    ...project.factions.map((row) => ({ ...row, kind: 'faction' as const })),
    ...states,
  ];
  async function add(event: FormEvent) {
    event.preventDefault();
    const title = name.trim(),
      description = detail.trim();
    if (disabled || !title || ((kind === 'character' || kind === 'faction') && !description)) return;
    if (
      registered.some(
        (row) =>
          row.kind === kind &&
          row.name.trim().normalize('NFC').toLowerCase() === title.normalize('NFC').toLowerCase(),
      )
    ) {
      setError(labels.duplicate);
      return;
    }
    const next = advance(project, []);
    const id = newId(kind);
    if (kind === 'character')
      next.characters = [
        ...project.characters,
        { id, name: title, role: description, ...(faction && { factionId: faction }) },
      ];
    else if (kind === 'faction') next.factions = [...project.factions, { id, name: title, aim: description }];
    else next.stateEntities = [...states, { id, kind, name: title }];
    const valid = proposal ? structurallyValidProject(next) : isProject(next);
    if (!valid) {
      setError(labels.conflict);
      return;
    }
    if (await commit(next)) {
      setName('');
      setDetail('');
      setError('');
    }
  }
  return (
    <section className="panel">
      <h2>{labels.title}</h2>
      {!proposal && !!registered.length && (
        <ul className="record-list">
          {registered.map((row) => (
            <li key={row.kind + '/' + row.id} id={'canonical-'+row.id} tabIndex={-1}>
              {row.name} · {labels[row.kind]} <code>{row.id}</code>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void add(e)}>
        <fieldset disabled={disabled}>
          <label>
            {labels.kind}
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as Kind);
                setError('');
              }}
            >
              {(['character', 'faction', 'item', 'flag', 'decision'] as const).map((k) => (
                <option value={k} key={k}>
                  {labels[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {labels.name}
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {(kind === 'character' || kind === 'faction') && (
            <label>
              {kind === 'character' ? labels.role : labels.aim}
              <input required value={detail} onChange={(e) => setDetail(e.target.value)} />
            </label>
          )}
          {kind === 'character' && project.factions.length > 0 && (
            <label>
              {labels.factionId}
              <select value={faction} onChange={(e) => setFaction(e.target.value)}>
                <option value="">{labels.none}</option>
                {project.factions.map((f) => (
                  <option value={f.id} key={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" className="quiet">
            {proposal ? labels.addDraft : labels.add}
          </button>
          {error && <p role="alert">{error}</p>}
        </fieldset>
      </form>
    </section>
  );
}
