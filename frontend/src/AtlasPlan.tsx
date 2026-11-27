import { useState } from 'react';
import type { AtlasConstraint, Location, World } from './project.generated';
import { useAtlasLabels } from './atlasCopy';
import { useFormatter, useLocalized } from './locale';

const english = {
  requirements: (count: string) => 'Geography requirements (' + count + ')',
  via: (place: string) => 'via ' + place,
  edit: 'Edit requirement',
  remove: 'Remove requirement',
  confirmRemove: 'Remove this geographical requirement?',
  from: 'From location',
  relationship: 'Relationship',
  target: 'Target',
  anyRiver: 'Any natural river',
  chooseTarget: 'Choose target',
  separatingPlace: 'Separating place',
  choose: 'Choose',
  priority: 'Priority',
  note: 'Design note',
  save: 'Save requirement',
  add: 'Add requirement',
  cancel: 'Cancel requirement edit',
};

export function AtlasPlan({
  world,
  sites,
  constraints,
  onChange,
}: {
  world?: World;
  sites: Location[];
  constraints: AtlasConstraint[];
  onChange: (v: AtlasConstraint[]) => void;
}) {
  const copy = useLocalized(english, {
    requirements: (count) => '지리 요구 사항 (' + count + ')',
    via: (place) => place + ' 경유',
    edit: '요구 사항 편집',
    remove: '요구 사항 삭제',
    confirmRemove: '이 지리 요구 사항을 삭제할까요?',
    from: '출발 장소',
    relationship: '관계',
    target: '대상',
    anyRiver: '아무 자연 하천',
    chooseTarget: '대상 선택',
    separatingPlace: '사이를 가르는 장소',
    choose: '선택',
    priority: '우선순위',
    note: '설계 메모',
    save: '요구 사항 저장',
    add: '요구 사항 추가',
    cancel: '요구 사항 편집 취소',
  });
  const labels = useAtlasLabels();
  const { number } = useFormatter();
  const [relation, setRelation] = useState<AtlasConstraint['relation']>('near'),
    [strength, setStrength] = useState<AtlasConstraint['strength']>('hard');
  const [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [via, setVia] = useState(''),
    [description, describe] = useState('');
  const [editing, setEditing] = useState<AtlasConstraint>();
  const source = sites.some((v) => v.id === from) ? from : sites[0]?.id;
  const regions = world?.regions ?? [],
    territories = world?.territories ?? [];
  const targets =
    relation === 'river'
      ? (world?.features ?? []).filter((f) => f.kind === 'river')
      : relation === 'inside' || relation === 'outside'
        ? [...sites, ...regions, ...territories]
        : sites;
  const name = (id: string) =>
    [...sites, ...regions, ...territories, ...(world?.features ?? [])].find((v) => v.id === id)?.name ?? id;
  const target = targets.some((v) => v.id === to) ? to : undefined;
  return (
    <details className="panel atlas-plan">
      <summary>{copy.requirements(number(constraints.length))}</summary>
      <ul>
        {constraints.map((c, i) => (
          <li key={i}>
            <strong>
              {name(c.from)} · {labels.relation[c.relation]} {c.to && name(c.to)} {c.via && copy.via(name(c.via))}
            </strong>
            <small>
              {' '}
              {labels.origin[c.origin]} · {labels.strength[c.strength]}
            </small>
            <p>{c.description}</p>
            {c.origin !== 'scenario' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(c);
                    setFrom(c.from);
                    setTo(c.to ?? '');
                    setVia(c.via ?? '');
                    setStrength(c.strength);
                    setRelation(c.relation);
                    describe(c.description);
                  }}
                >
                  {copy.edit}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(copy.confirmRemove)) {
                      setEditing(undefined);
                      onChange(constraints.filter((_, j) => j !== i));
                    }
                  }}
                >
                  {copy.remove}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="atlas-fields"
        onSubmit={(e) => {
          e.preventDefault();
          if (!source || (!target && relation !== 'river') || (relation === 'separates' && !via)) return;
          const next: AtlasConstraint = {
            from: source,
            relation,
            strength,
            origin: 'owner',
            description: description.trim() || relation,
            ...(target && { to: target }),
            ...(relation === 'separates' && { via }),
          };
          onChange(editing ? constraints.map((c) => (c === editing ? next : c)) : [...constraints, next]);
          setEditing(undefined);
          describe('');
        }}
      >
        <label>
          {copy.from}
          <select value={source ?? ''} onChange={(e) => setFrom(e.target.value)}>
            {sites.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy.relationship}
          <select
            value={relation}
            onChange={(e) => {
              setRelation(e.target.value as typeof relation);
              setTo('');
            }}
          >
            {(Object.keys(labels.relation) as AtlasConstraint['relation'][]).map((v) => (
              <option key={v} value={v}>{labels.relation[v]}</option>
            ))}
          </select>
        </label>
        <label>
          {copy.target}
          <select value={target ?? ''} required={relation !== 'river'} onChange={(e) => setTo(e.target.value)}>
            <option value="">{relation === 'river' ? copy.anyRiver : copy.chooseTarget}</option>
            {targets.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        {relation === 'separates' && (
          <label>
            {copy.separatingPlace}
            <select required value={via} onChange={(e) => setVia(e.target.value)}>
              <option value="">{copy.choose}</option>
              {sites.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {copy.priority}
          <select value={strength} onChange={(e) => setStrength(e.target.value as typeof strength)}>
            <option value="hard">{labels.strength.hard}</option>
            <option value="soft">{labels.strength.soft}</option>
          </select>
        </label>
        <label>
          {copy.note}
          <input value={description} maxLength={500} onChange={(e) => describe(e.target.value)} />
        </label>
        <button>{editing ? copy.save : copy.add}</button>
        {editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(undefined);
              describe('');
            }}
          >
            {copy.cancel}
          </button>
        )}
      </form>
    </details>
  );
}
