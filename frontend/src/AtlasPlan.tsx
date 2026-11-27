import { useState } from 'react';
import type { AtlasConstraint, Location, World } from './project.generated';

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
      <summary>Geography requirements ({constraints.length})</summary>
      <ul>
        {constraints.map((c, i) => (
          <li key={i}>
            <strong>
              {name(c.from)} · {c.relation} {c.to && name(c.to)} {c.via && 'via ' + name(c.via)}
            </strong>
            <small>
              {' '}
              {c.origin} · {c.strength}
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
                  Edit requirement
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Remove this geographical requirement?')) {
                      setEditing(undefined);
                      onChange(constraints.filter((_, j) => j !== i));
                    }
                  }}
                >
                  Remove requirement
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
          From location
          <select value={source ?? ''} onChange={(e) => setFrom(e.target.value)}>
            {sites.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Relationship
          <select
            value={relation}
            onChange={(e) => {
              setRelation(e.target.value as typeof relation);
              setTo('');
            }}
          >
            {['near', 'beneath', 'separates', 'travel', 'river', 'inside', 'outside', 'canal', 'aqueduct'].map(
              (v) => (
                <option key={v}>{v}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Target
          <select value={target ?? ''} required={relation !== 'river'} onChange={(e) => setTo(e.target.value)}>
            <option value="">{relation === 'river' ? 'Any natural river' : 'Choose target'}</option>
            {targets.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        {relation === 'separates' && (
          <label>
            Separating place
            <select required value={via} onChange={(e) => setVia(e.target.value)}>
              <option value="">Choose</option>
              {sites.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Priority
          <select value={strength} onChange={(e) => setStrength(e.target.value as typeof strength)}>
            <option>hard</option>
            <option>soft</option>
          </select>
        </label>
        <label>
          Design note
          <input value={description} maxLength={500} onChange={(e) => describe(e.target.value)} />
        </label>
        <button>{editing ? 'Save requirement' : 'Add requirement'}</button>
        {editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(undefined);
              describe('');
            }}
          >
            Cancel requirement edit
          </button>
        )}
      </form>
    </details>
  );
}
