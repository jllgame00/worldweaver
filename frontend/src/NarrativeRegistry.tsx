import { useState, type FormEvent } from 'react';
import { advance, newId } from './project';
import type { Project } from './project.generated';
import { effectiveStateEntities, isProject, structurallyValidProject } from './validation';
import { useLocalized } from './locale';
import type { Translation } from './locale';

const labelsEn = {
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
const labelsKo = {
  title: '정본 엔티티', kind: '엔티티 유형', character: '인물', faction: '세력', item: '아이템 또는 유물',
  flag: '서사 플래그', decision: '플레이어 결정', name: '엔티티 이름', role: '인물의 역할', aim: '세력의 목표',
  factionId: '소속 세력', none: '없음', add: '엔티티 등록', addDraft: '제안에 엔티티 추가',
  duplicate: '이 유형에 같은 이름의 엔티티가 이미 있습니다.',
  conflict: '이전 프로젝트에 겹치는 상태 ID가 있습니다. 시나리오 제안을 검토해 상태 목록을 정리하세요.',
} satisfies Translation<typeof labelsEn>;
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
  const labels = useLocalized(labelsEn, labelsKo);
  const [kind, setKind] = useState<Kind>('character');
  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');
  const [faction, setFaction] = useState('');
  const [error, setError] = useState<'' | 'duplicate' | 'conflict'>('');
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
      setError('duplicate');
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
      setError('conflict');
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
          {error && <p role="alert">{labels[error]}</p>}
        </fieldset>
      </form>
    </section>
  );
}
