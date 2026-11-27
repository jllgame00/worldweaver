import type { Location, Point, Project, Region, World } from './project.generated';
import { newId } from './project';
import { links, moveSite, removeSite } from './atlasWorkflow';
import { buildRoutes } from './atlasSpatial';
import { useAtlasLabels } from './atlasCopy';
import { useFormatter, useLocalized } from './locale';

const english = {
  inspector: 'Atlas inspector',
  outside: 'Outside map',
  locationName: 'Location name',
  description: 'Description',
  locationType: 'Location type',
  column: 'Column',
  row: 'Row',
  depth: 'Depth level',
  factions: 'Faction associations',
  lock: 'Lock position during regeneration',
  saveLocation: 'Save location',
  references: 'Scenario references',
  nested: 'Nested places', nesting: (child: string, relation: string, host: string) => child + ' ' + relation + ' ' + host,
  confirmLocation: (name: string) => 'Remove ' + name + ' and its incident atlas routes? Scenario references are protected.',
  removeLocation: 'Remove location',
  landCells: (count: string) => count + ' land cells',
  regionName: 'Region name',
  regionDescription: 'Region description',
  exceptionalBiome: 'Exceptional biome',
  ecologicalRule: 'Established ecological rule',
  saveRegion: 'Save region',
  territoryName: 'Territory name',
  memberRegions: 'Member regions',
  politicalInfluence: 'Political influence',
  saveTerritory: 'Save territory',
  pathCells: (count: string) => count + ' path cells',
  confirmRoute: 'Remove this route? Required journeys will be revalidated.',
  removeRoute: 'Remove route',
  sourceOutlet: (source: string, outlet: string) => 'Source ' + source + ' → outlet ' + outlet,
  addConnection: 'Add connection',
  routeOrigin: 'Route origin',
  routeDestination: 'Route destination',
  connectionPurpose: 'Connection purpose',
  playerTravel: 'Player travel',
  buildConnection: 'Build connection',
  addLocation: 'Add location',
  newPlaceName: 'New place name',
  type: 'Type',
  newColumn: 'New column',
  newRow: 'New row',
  addPlace: 'Add place to atlas',
};

type Props = {
  p: Project;
  world: World;
  id?: string;
  select: (id: string) => void;
  openScenario: (id: string) => void;
  change: (next: () => World) => void;
};
export default function AtlasInspector({ p, world: w, id, select, openScenario, change }: Props) {
  const copy = useLocalized(english, {
    inspector: '지도 상세 정보',
    outside: '지도 범위 밖',
    locationName: '장소 이름',
    description: '설명',
    locationType: '장소 유형',
    column: '열',
    row: '행',
    depth: '깊이 층',
    factions: '관련 세력',
    lock: '다시 생성할 때도 위치 고정',
    saveLocation: '장소 저장',
    references: '시나리오 참조',
    nested: '장소 포함 관계', nesting: (child, relation, host) => child + ' · ' + host + ' ' + relation,
    confirmLocation: (name) => name + ' 및 연결된 지도 경로를 삭제할까요? 시나리오 참조는 보호됩니다.',
    removeLocation: '장소 삭제',
    landCells: (count) => '육지 ' + count + '칸',
    regionName: '지역 이름',
    regionDescription: '지역 설명',
    exceptionalBiome: '특수 생물군계',
    ecologicalRule: '설정된 생태 규칙',
    saveRegion: '지역 저장',
    territoryName: '영토 이름',
    memberRegions: '소속 지역',
    politicalInfluence: '정치적 영향권',
    saveTerritory: '영토 저장',
    pathCells: (count) => '경로 ' + count + '칸',
    confirmRoute: '이 경로를 삭제할까요? 필수 여정을 다시 검증합니다.',
    removeRoute: '경로 삭제',
    sourceOutlet: (source, outlet) => '발원지 ' + source + ' → 유출구 ' + outlet,
    addConnection: '연결 추가',
    routeOrigin: '경로 출발지',
    routeDestination: '경로 도착지',
    connectionPurpose: '연결 목적',
    playerTravel: '플레이어 이동',
    buildConnection: '연결 만들기',
    addLocation: '장소 추가',
    newPlaceName: '새 장소 이름',
    type: '유형',
    newColumn: '새 열',
    newRow: '새 행',
    addPlace: '지도에 장소 추가',
  });
  const labels = useAtlasLabels();
  const { number: formatNumber } = useFormatter();
  const site = w.locations.find((l) => l.id === id),
    region = w.regions.find((r) => r.id === id),
    route = w.routes.find((r) => r.id === id),
    territory = w.territories?.find((t) => t.id === id);
  const feature = w.features.find((f) => f.id === id);
  const origins = site && links(p, site.id);
  const placeName = (key: string) => w.locations.find((l) => l.id === key)?.name ?? key;
  const nesting = site && w.constraints?.flatMap(c =>
    c.to && (c.from === site.id || c.to === site.id) && (c.relation === 'beneath' || c.relation === 'inside')
      ? [{ child: c.from, host: c.to, relation: c.relation }] : []);
  const number = (f: FormData, k: string) => Number(f.get(k));
  const value = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
  const kinds = Object.keys(labels.location) as Location['kind'][];
  const pos = site?.position;
  const elevation = pos && w.elevation?.[pos[1]]?.[pos[0]];
  const tile = pos && w.tiles[pos[1]]?.[pos[0]];
  const coordinates = (point: Point) => point.map((axis) => formatNumber(axis)).join(', ');
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
    <section aria-label={copy.inspector} className="panel atlas-inspector">
      <h2>
        {site?.name ??
          region?.name ??
          feature?.name ??
          territory?.name ??
          (route ? placeName(route.from) + ' → ' + placeName(route.to) : copy.inspector)}
      </h2>
      {site && (
        <>
          <p>
            {labels.location[site.kind]} · {site.regionId ? w.regions.find((r) => r.id === site.regionId)?.name : labels.unplaced}{' '}
            {pos &&
              ' · ' +
                (elevation == null ? '—' : formatNumber(elevation, { style: 'unit', unit: 'meter' })) +
                ' · ' +
                (labels.biomes[tile as keyof typeof labels.biomes] ?? copy.outside)}
          </p>
          {!!nesting?.length && <section className="atlas-hosts" aria-label={copy.nested}>
            <h3>{copy.nested}</h3>
            {nesting.map((c,i) => <button key={i} onClick={() => select(c.child === site.id ? c.host : c.child)}>
              {copy.nesting(placeName(c.child), labels.relation[c.relation], placeName(c.host))}
            </button>)}
          </section>}
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
              {copy.locationName}
              <input name="name" required defaultValue={site.name} />
            </label>
            <label>
              {copy.description}
              <textarea name="description" defaultValue={site.description} />
            </label>
            <label>
              {copy.locationType}
              <select name="kind" defaultValue={site.kind}>
                {kinds.map((k) => (
                  <option key={k} value={k}>{labels.location[k]}</option>
                ))}
              </select>
            </label>
            <label>
              {copy.column}
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
              {copy.row}
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
              {copy.depth}
              <input name="level" type="number" min={-32} max={0} defaultValue={site.level ?? 0} />
            </label>
            <label>
              {copy.factions}
              <select name="factions" multiple defaultValue={site.factionIds ?? []}>
                {p.factions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input name="locked" type="checkbox" defaultChecked={site.locked} /> {copy.lock}
            </label>
            <button>{copy.saveLocation}</button>
          </form>
          <h3>{copy.references}</h3>
          {[...origins!.chapters, ...origins!.nodes, ...origins!.quests].map((v) => (
            <button key={v.id} onClick={() => openScenario(v.id)}>
              {v.title ?? ('objective' in v ? v.objective : v.id)}
            </button>
          ))}
          <p>{[...origins!.characters, ...origins!.factions].map((v) => v.name).join(' · ')}</p>
          <button
            onClick={() => {
              if (
                window.confirm(copy.confirmLocation(site.name))
              )
                change(() => removeSite(p, w, site.id));
            }}
          >
            {copy.removeLocation}
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
          <p>{copy.landCells(formatNumber(region.cells.length))}</p>
          <label>
            {copy.regionName}
            <input required name="name" defaultValue={region.name} />
          </label>
          <label>
            {copy.regionDescription}
            <textarea name="description" defaultValue={region.description} />
          </label>
          <label>
            {copy.exceptionalBiome}
            <input name="biome" defaultValue={region.climateException?.biome} />
          </label>
          <label>
            {copy.ecologicalRule}
            <textarea name="rule" defaultValue={region.climateException?.rule} />
          </label>
          <button>{copy.saveRegion}</button>
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
            {copy.territoryName}
            <input name="name" required defaultValue={territory.name} />
          </label>
          <label>
            {copy.memberRegions}
            <select name="regions" multiple defaultValue={territory.regionIds}>
              {w.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {copy.politicalInfluence}
            <select multiple name="factions" defaultValue={territory.factionIds}>
              {p.factions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <button>{copy.saveTerritory}</button>
        </form>
      )}
      {route && (
        <>
          <p>
            {labels.route[route.mode]} · {route.distanceKm == null ? '—' : formatNumber(route.distanceKm, { style: 'unit', unit: 'kilometer' })} · {copy.pathCells(formatNumber(route.path.length))}
          </p>
          <button
            onClick={() => {
              if (window.confirm(copy.confirmRoute))
                change(() => ({ ...w, routes: w.routes.filter((r) => r.id !== route.id) }));
            }}
          >
            {copy.removeRoute}
          </button>
        </>
      )}
      {feature && (
        <p>
          {labels.feature[feature.kind]} · {labels.cells(formatNumber(feature.cells.length))}.{' '}
          {feature.kind === 'river' &&
            copy.sourceOutlet(coordinates(feature.cells[0]), coordinates(feature.cells.at(-1)!))}
        </p>
      )}
      <details>
        <summary>{copy.addConnection}</summary>
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
              {k === 'from' ? copy.routeOrigin : copy.routeDestination}
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
            {copy.connectionPurpose}
            <select name="relation">
              <option value="travel">{copy.playerTravel}</option>
              <option value="canal">{labels.route.canal}</option>
              <option value="aqueduct">{labels.route.aqueduct}</option>
            </select>
          </label>
          <button>{copy.buildConnection}</button>
        </form>
      </details>
      <details>
        <summary>{copy.addLocation}</summary>
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
            {copy.newPlaceName}
            <input name="name" required />
          </label>
          <label>
            {copy.type}
            <select name="kind">
              {kinds.map((k) => (
                <option key={k} value={k}>{labels.location[k]}</option>
              ))}
            </select>
          </label>
          <label>
            {copy.newColumn}
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
            {copy.newRow}
            <input
              name="y"
              type="number"
              min={0}
              max={w.tiles.length - 1}
              defaultValue={Math.floor(w.tiles.length / 2)}
              required
            />
          </label>
          <button>{copy.addPlace}</button>
        </form>
      </details>
    </section>
  );
}
