import { useState } from 'react';
import { newId } from './project';
import type { Project, Scenario } from './project.generated';
import type { ScenarioEditorProps } from './ScenarioEditor';
import { TextField, SelectField, options } from './ScenarioFields';

const c = {
  overview: 'Scenario overview',
  title: 'Scenario title',
  summary: 'Scenario summary',
  save: 'Save overview',
  places: 'Location requirements',
  place: 'Proposed location',
  addPlace: 'Add proposed location',
  kind: 'Location type',
  name: 'Place name',
  purpose: 'Narrative purpose',
  savePlace: 'Save place',
  geography: 'Geography and travel',
  relation: 'Relationship',
  from: 'Origin',
  to: 'Destination',
  detail: 'Geography requirement',
  add: 'Add requirement',
  remove: 'Remove requirement',
  confirm: 'Remove this geography requirement?',
  catalog: 'Canonical world locations',
  via: 'Separating place',
  cancel: 'Cancel',
};
type Place = Scenario['locations'][number];
type Geography = Scenario['geography'][number];
export default function ScenarioBrief({ project, edit }: { project: Project; edit: ScenarioEditorProps['edit'] }) {
  const s = project.scenario!;
  const [title, setTitle] = useState(s.title),
    [summary, setSummary] = useState(s.summary);
  const [place, setPlace] = useState<Place>();
  const [geo, setGeo] = useState<Geography>({ from: '', to: '', relation: 'travel', description: '' });
  const places = [...(project.world?.locations ?? []), ...s.locations];
  const label = (id: string) => places.find((x) => x.id === id)?.name ?? id;
  return (
    <details className="panel">
      <summary>
        {c.overview} · {s.title}
      </summary>
      <form
        className="scenario-form"
        onSubmit={(e) => {
          e.preventDefault();
          void edit((p) => {
            p.scenario!.title = title;
            p.scenario!.summary = summary;
          });
        }}
      >
        <TextField required label={c.title} value={title} onChange={setTitle} />
        <TextField required area label={c.summary} value={summary} onChange={setSummary} />
        <button>{c.save}</button>
      </form>
      <h3>{c.places}</h3>
      {!!project.world?.locations.length && (
        <p>
          {c.catalog} · {project.world.locations.map((x) => x.name).join(', ')}
        </p>
      )}
      <div className="actions">
        {s.locations.map((x) => (
          <button key={x.id} onClick={() => setPlace(x)}>
            {x.name}
          </button>
        ))}
        <button onClick={() => setPlace({ id: newId('location'), kind: 'landmark', name: '', purpose: '' })}>
          {c.addPlace}
        </button>
      </div>
      {place && (
        <form
          className="scenario-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await edit((p) => {
              const existing = p.scenario!.locations.find((x) => x.id === place.id);
              if (existing) Object.assign(existing, place);
              else p.scenario!.locations.push(place);
            });
            if (ok !== false) setPlace(undefined);
          }}
        >
          <TextField
            required
            label={c.name}
            value={place.name}
            onChange={(name) => setPlace({ ...place, name })}
          />
          <SelectField
            label={c.kind}
            value={place.kind}
            options={options(['city', 'village', 'dungeon', 'landmark', 'port'])}
            onChange={(kind) => setPlace({ ...place, kind: kind as Place['kind'] })}
          />
          <TextField
            required
            label={c.purpose}
            value={place.purpose}
            onChange={(purpose) => setPlace({ ...place, purpose })}
          />
          <button>{c.savePlace}</button>
          <button type="button" onClick={() => setPlace(undefined)}>
            {c.cancel}
          </button>
        </form>
      )}
      <h3>{c.geography}</h3>
      <ul>
        {s.geography.map((g, i) => (
          <li key={i}>
            {label(g.from)} · {g.relation} · {label(g.to)}
            {g.via ? ' (' + label(g.via) + ')' : ''} — {g.description}
            <button
              onClick={() => {
                if (window.confirm(c.confirm))
                  void edit((p) => {
                    p.scenario!.geography.splice(i, 1);
                  });
              }}
            >
              {c.remove}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="scenario-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            geo.from !== geo.to &&
            (await edit((p) => {
              p.scenario!.geography.push(geo);
            })) !== false
          )
            setGeo({ ...geo, description: '' });
        }}
      >
        <SelectField
          label={c.from}
          options={places}
          value={geo.from}
          onChange={(from) => setGeo({ ...geo, from })}
        />
        <SelectField
          label={c.to}
          options={places.filter((x) => x.id !== geo.from)}
          value={geo.to}
          onChange={(to) => setGeo({ ...geo, to })}
        />
        <SelectField
          label={c.relation}
          options={options(['near', 'beneath', 'separates', 'travel'])}
          value={geo.relation}
          onChange={(relation) => {
            const { via: _, ...pair } = geo;
            setGeo({ ...pair, relation: relation as Geography['relation'] });
          }}
        />
        {geo.relation === 'separates' && (
          <SelectField
            label={c.via}
            options={places.filter((x) => x.id !== geo.from && x.id !== geo.to)}
            value={geo.via}
            onChange={(via) => setGeo({ ...geo, via })}
          />
        )}
        <TextField
          required
          label={c.detail}
          value={geo.description}
          onChange={(description) => setGeo({ ...geo, description })}
        />
        <button disabled={!geo.from || !geo.to || geo.from === geo.to}>{c.add}</button>
      </form>
    </details>
  );
}
