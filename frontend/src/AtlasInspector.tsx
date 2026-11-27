import type { Location, Point, Project, Region, World } from './project.generated';
import { newId } from './project';
import { links, moveSite, removeSite } from './atlasWorkflow';
import { buildRoutes } from './atlasSpatial';

type Props = {
  p: Project;
  world: World;
  id?: string;
  select: (id: string) => void;
  openScenario: (id: string) => void;
  change: (next: () => World) => void;
};
export default function AtlasInspector({ p, world: w, id, select, openScenario, change }: Props) {
  const site = w.locations.find((l) => l.id === id),
    region = w.regions.find((r) => r.id === id),
    route = w.routes.find((r) => r.id === id),
    territory = w.territories?.find((t) => t.id === id);
  const feature = w.features.find((f) => f.id === id);
  const biomes: Record<string, string> = {
    '~': 'Ocean',
    l: 'Inland lake',
    m: 'Mountains',
    h: 'Hills',
    v: 'River valley',
    p: 'Plains',
    f: 'Woodland',
    d: 'Dryland',
    s: 'Alpine snow',
  };
  const origins = site && links(p, site.id);
  const placeName = (key: string) => w.locations.find((l) => l.id === key)?.name ?? key;
  const number = (f: FormData, k: string) => Number(f.get(k));
  const value = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
  const kinds: Location['kind'][] = [
    'capital',
    'city',
    'town',
    'village',
    'port',
    'fortress',
    'ruin',
    'dungeon',
    'landmark',
    'forest',
    'underground',
    'reservoir',
  ];
  const pos = site?.position;
  function updateRegion(r: Region, f: FormData) {
    const biome = value(f, 'biome'),
      rule = value(f, 'rule');
    if (!!biome !== !!rule) throw Error('Enter both the unusual biome and its narrative rule.');
    return {
      ...w,
      regions: w.regions.map((v) =>
        v.id === r.id
          ? {
              ...v,
              name: value(f, 'name'),
              description: value(f, 'description'),
              climateException: biome ? { biome, rule } : undefined,
            }
          : v,
      ),
    };
  }
  return (
    <section aria-label="Atlas inspector" className="panel atlas-inspector">
      <h2>
        {site?.name ??
          region?.name ??
          feature?.name ??
          territory?.name ??
          (route ? placeName(route.from) + ' → ' + placeName(route.to) : 'Atlas inspector')}
      </h2>
      {site && (
        <>
          <p>
            {site.kind} · {site.regionId ? w.regions.find((r) => r.id === site.regionId)?.name : 'Unplaced'}{' '}
            {pos &&
              ' · ' +
                (w.elevation?.[pos[1]]?.[pos[0]] ?? '—') +
                ' m · ' +
                (biomes[w.tiles[pos[1]]?.[pos[0]] ?? ''] ?? 'Outside map')}
          </p>
          <form
            key={JSON.stringify(site)}
            className="atlas-fields"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              change(() => {
                const x = number(f, 'x'),
                  y = number(f, 'y');
                const moved = !pos || pos[0] !== x || pos[1] !== y;
                let next = w;
                if (moved) next = moveSite(w, site.id, [x, y]);
                next = {
                  ...next,
                  locations: next.locations.map((l) =>
                    l.id === site.id
                      ? {
                          ...l,
                          generatedRole: undefined,
                          name: value(f, 'name'),
                          description: value(f, 'description'),
                          kind: value(f, 'kind') as Location['kind'],
                          level: number(f, 'level'),
                          locked: f.has('locked'),
                          factionIds: f.getAll('factions').map(String),
                        }
                      : l,
                  ),
                };
                return { ...next, routes: buildRoutes(next, next.constraints ?? []) };
              });
            }}
          >
            <label>
              Location name
              <input name="name" required defaultValue={site.name} />
            </label>
            <label>
              Description
              <textarea name="description" defaultValue={site.description} />
            </label>
            <label>
              Location type
              <select name="kind" defaultValue={site.kind}>
                {kinds.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label>
              Column
              <input
                name="x"
                type="number"
                required
                min={0}
                max={w.tiles[0]!.length - 1}
                defaultValue={pos?.[0] ?? 0}
              />
            </label>
            <label>
              Row
              <input
                name="y"
                type="number"
                required
                min={0}
                max={w.tiles.length - 1}
                defaultValue={pos?.[1] ?? 0}
              />
            </label>
            <label>
              Depth level
              <input name="level" type="number" min={-32} max={0} defaultValue={site.level ?? 0} />
            </label>
            <label>
              Faction associations
              <select name="factions" multiple defaultValue={site.factionIds ?? []}>
                {p.factions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input name="locked" type="checkbox" defaultChecked={site.locked} /> Lock position during
              regeneration
            </label>
            <button>Save location</button>
          </form>
          <h3>Scenario references</h3>
          {[...origins!.chapters, ...origins!.nodes, ...origins!.quests].map((v) => (
            <button key={v.id} onClick={() => openScenario(v.id)}>
              {v.title ?? ('objective' in v ? v.objective : v.id)}
            </button>
          ))}
          <p>{[...origins!.characters, ...origins!.factions].map((v) => v.name).join(' · ')}</p>
          <button
            onClick={() => {
              if (
                window.confirm(
                  'Remove ' + site.name + ' and its incident atlas routes? Scenario references are protected.',
                )
              )
                change(() => removeSite(p, w, site.id));
            }}
          >
            Remove location
          </button>
        </>
      )}
      {region && (
        <form
          key={JSON.stringify([region.id, region.name, region.description])}
          className="atlas-fields"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            change(() => updateRegion(region, f));
          }}
        >
          <p>{region.cells.length} land cells</p>
          <label>
            Region name
            <input required name="name" defaultValue={region.name} />
          </label>
          <label>
            Region description
            <textarea name="description" defaultValue={region.description} />
          </label>
          <label>
            Exceptional biome
            <input name="biome" defaultValue={region.climateException?.biome} />
          </label>
          <label>
            Established ecological rule
            <textarea name="rule" defaultValue={region.climateException?.rule} />
          </label>
          <button>Save region</button>
        </form>
      )}
      {territory && (
        <form
          key={territory.id}
          className="atlas-fields"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            change(() => ({
              ...w,
              territories: w.territories?.map((t) =>
                t.id === territory.id
                  ? {
                      ...t,
                      name: value(f, 'name'),
                      regionIds: f.getAll('regions').map(String),
                      factionIds: f.getAll('factions').map(String),
                    }
                  : t,
              ),
            }));
          }}
        >
          <label>
            Territory name
            <input name="name" required defaultValue={territory.name} />
          </label>
          <label>
            Member regions
            <select name="regions" multiple defaultValue={territory.regionIds}>
              {w.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Political influence
            <select multiple name="factions" defaultValue={territory.factionIds}>
              {p.factions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <button>Save territory</button>
        </form>
      )}
      {route && (
        <>
          <p>
            {route.mode} · {route.distanceKm ?? '—'} km · {route.path.length} path cells
          </p>
          <button
            onClick={() => {
              if (window.confirm('Remove this route? Required journeys will be revalidated.'))
                change(() => ({ ...w, routes: w.routes.filter((r) => r.id !== route.id) }));
            }}
          >
            Remove route
          </button>
        </>
      )}
      {feature && (
        <p>
          {feature.kind} · {feature.cells.length} cells.{' '}
          {feature.kind === 'river' &&
            'Source ' + feature.cells[0].join(', ') + ' → outlet ' + feature.cells.at(-1)!.join(', ')}
        </p>
      )}
      <details>
        <summary>Add connection</summary>
        <form
          className="atlas-fields"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const from = value(data, 'from'),
              to = value(data, 'to'),
              relation = value(data, 'relation') as 'travel' | 'canal' | 'aqueduct';
            change(() => {
              if (from === to) throw Error('Choose two distinct places.');
              const constraint = {
                from,
                to,
                relation,
                origin: 'owner' as const,
                strength: 'hard' as const,
                description: 'Connect ' + placeName(from) + ' and ' + placeName(to),
              };
              const next = { ...w, constraints: [...(w.constraints ?? []), constraint] };
              return { ...next, routes: buildRoutes(next, next.constraints) };
            });
          }}
        >
          {['from', 'to'].map((k) => (
            <label key={k}>
              {k === 'from' ? 'Route origin' : 'Route destination'}
              <select name={k} defaultValue={k === 'from' ? site?.id : undefined}>
                {w.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label>
            Connection purpose
            <select name="relation">
              <option value="travel">Player travel</option>
              <option>canal</option>
              <option>aqueduct</option>
            </select>
          </label>
          <button>Build connection</button>
        </form>
      </details>
      <details>
        <summary>Add location</summary>
        <form
          className="atlas-fields"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const id = newId('place'),
              point: Point = [number(f, 'x'), number(f, 'y')];
            const newSite: Location = {
              id,
              name: value(f, 'name'),
              kind: value(f, 'kind') as Location['kind'],
              preference: 'any-land',
            };
            change(() => moveSite({ ...w, locations: [...w.locations, newSite] }, id, point));
            select(id);
          }}
        >
          <label>
            New place name
            <input name="name" required />
          </label>
          <label>
            Type
            <select name="kind">
              {kinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            New column
            <input
              name="x"
              type="number"
              min={0}
              max={w.tiles[0]!.length - 1}
              defaultValue={Math.floor(w.tiles[0]!.length / 2)}
              required
            />
          </label>
          <label>
            New row
            <input
              name="y"
              type="number"
              min={0}
              max={w.tiles.length - 1}
              defaultValue={Math.floor(w.tiles.length / 2)}
              required
            />
          </label>
          <button>Add place to atlas</button>
        </form>
      </details>
    </section>
  );
}
