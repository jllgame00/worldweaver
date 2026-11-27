import { memo, useId, useMemo } from 'react';
import type { AtlasIssue } from './atlasTypes';
import { geometry, line, placeLabels } from './atlasGeometry';
import type { MapLabel, View } from './atlasGeometry';
import type { Location, Point, TravelRoute, World } from './project.generated';
import { useAtlasDiagnostic, useAtlasLabels } from './atlasCopy';
import { useFormatter, useLocalized } from './locale';

export const layerNames = {
  biomes: 'Biomes',
  relief: 'Relief',
  water: 'Hydrology',
  regions: 'Regions',
  territories: 'Territories',
  places: 'Settlements & sites',
  routes: 'Routes',
  infrastructure: 'Infrastructure',
  scenario: 'Scenario anchors',
  constraints: 'Spatial constraints',
  findings: 'Findings',
  labels: 'Labels',
};
export type Layer = keyof typeof layerNames;
export type Layers = Record<Layer, boolean>;
export const defaults: Layers = {
  biomes: true,
  relief: true,
  water: true,
  regions: true,
  territories: false,
  places: true,
  routes: true,
  infrastructure: true,
  scenario: true,
  constraints: false,
  findings: true,
  labels: true,
};
const paint: Record<string, string> = {
  p: '#ddce99',
  v: '#b5bd82',
  f: '#859b70',
  h: '#cbb582',
  m: '#baa88c',
  d: '#dec094',
  s: '#e6e5d3',
  l: '#9dbdb4',
};
const tints = ['#aa6260', '#7f7ba4', '#728d54', '#c58a45', '#468987', '#877152'];
const marks: Record<Location['kind'], string> = {
  capital: 'M-5 3V-2L-2 0L0-5L2 0L5-2V3ZM-5 5H5',
  city: 'M-5 4V-3H-3V-1H-1V-4H1V-1H3V-3H5V4Z',
  village: 'M-4 1L0-3L4 1V4H-4Z',
  town: 'M-5 4V0L-2-3L1 0V4ZM1 4V-1L3-3L5-1V4Z',
  dungeon: 'M-5 4L0-4L5 4ZM-1 3V1Q0-1 1 1V3',
  underground: 'M-5 0L0 5L5 0M-4-3L0 1L4-3',
  port: 'M0-4V4M-2-2H2M-5 0Q-5 4 0 5Q5 4 5 0',
  landmark: 'M-3 4L-1-4L1-5L3 4Z',
  ruin: 'M-5 4V1L-3-1V-4H-1V0L1-2V2H4V4Z',
  fortress: 'M-4-3L0-5L4-3V1L0 5L-4 1Z',
  forest: 'M-4 3L0-5L4 3ZM0 3V5',
  reservoir: 'M0-5Q6 1 3 4Q0 7-3 4Q-6 1 0-5Z',
};
const roadInk: Record<TravelRoute['mode'], [string, string | undefined]> = {
  road: ['#895b32', undefined],
  bridge: ['#744c2d', undefined],
  trail: ['#765735', '.12 .25'],
  pass: ['#876746', '.32 .18'],
  sea: ['#365e75', '.52 .27'],
  tunnel: ['#6f5772', '.2 .2'],
  canal: ['#357b87', undefined],
  aqueduct: ['#397c79', '.6 .13'],
};
const infrastructure = new Set(['bridge', 'tunnel', 'canal', 'aqueduct', 'pass']);
const english = {
  crossingLabel: (mode: string) => 'Crossing · ' + mode,
  crossingTitle: (mode: string) => mode + ' crossing',
  level: (level: string) => 'level ' + level,
  compass: 'North compass',
  north: 'N',
  highlands: 'Highlands',
  water: 'Water',
  anchors: 'Story sites', issues: 'Findings', constraints: 'Constraints',
};
const korean = {
  crossingLabel: (mode: string) => '횡단 지점 · ' + mode,
  crossingTitle: (mode: string) => mode + ' 횡단 지점',
  level: (level: string) => level + '층',
  compass: '북쪽 나침반',
  north: '북',
  highlands: '고지대',
  water: '수역',
  anchors: '시나리오 지점', issues: '검증 결과', constraints: '공간 제약',
};

function SurfaceDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={id + 'sea'} x2=".89" y2="1">
        <stop stopColor="#b5c8bc" />
        <stop offset=".57" stopColor="#91b9b4" />
        <stop offset="1" stopColor="#719b9d" />
      </linearGradient>
      <pattern id={id + 'waves'} width="3.9" height="2.5" patternUnits="userSpaceOnUse">
        <path
          d="M.25.8q.33-.14.67 0t.66 0M2.3 1.9q.24-.1.48 0t.48 0"
          fill="none"
          stroke="#557f80"
          strokeOpacity=".35"
          strokeWidth=".035"
        />
      </pattern>
      <pattern id={id + 'sand'} width="1.8" height="1.2" patternUnits="userSpaceOnUse">
        <path d="M0 .9Q.7.25 1.3.72M.5 1.16q.5-.36.8-.27" fill="none" stroke="#aa875a" strokeWidth=".045" />
      </pattern>
      <pattern id={id + 'territory'} width=".85" height=".85" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
        <path d="M0 0V.85" stroke="#575442" strokeWidth=".09" opacity=".52" />
      </pattern>
      <pattern id={id + 'paper'} width="1.4" height="1.3" patternUnits="userSpaceOnUse">
        <path d="M.05.31l.26-.03M.68.89l.11.02M1.17.36l.13-.02" stroke="#684d2e" strokeWidth=".042" opacity=".25" />
      </pattern>
      <pattern id={id + 'climate'} width=".72" height=".72" patternUnits="userSpaceOnUse">
        <path
          d="M-.1.1.1-.1M0 .72.72 0M.62.82.82.62"
          fill="none"
          stroke="#81677a"
          opacity=".54"
          strokeWidth=".075"
        />
      </pattern>
    </defs>
  );
}

const Surface = memo(function Surface({
  world,
  g,
  id,
  layers,
}: {
  world: World;
  g: ReturnType<typeof geometry>;
  id: string;
  layers: Layers;
}) {
  return (
    <g pointerEvents="none">
      <defs>
        <path id={id + 'coast'} d={g.coast} />
        <clipPath id={id + 'land'}><use href={'#' + id + 'coast'} /></clipPath>
      </defs>
      <rect
        x="-1"
        y="-1"
        width={(world.tiles[0]?.length ?? 1) + 2}
        height={world.tiles.length + 2}
        fill={'url(#' + id + 'sea)'}
      />
      <rect
        x="-1"
        y="-1"
        width={(world.tiles[0]?.length ?? 1) + 2}
        height={world.tiles.length + 2}
        fill={'url(#' + id + 'waves)'}
      />
      <use href={'#' + id + 'coast'} fill="#d7cfaa" stroke="#719596" strokeWidth="1.48" strokeLinejoin="round" />
      <use href={'#' + id + 'coast'} fill="#d7cfaa" stroke="#aac4b7" strokeWidth="1.36" strokeLinejoin="round" />
      <use href={'#' + id + 'coast'} fill="#dbcc9c" stroke="#70938c" strokeWidth=".70" strokeLinejoin="round" />
      <use href={'#' + id + 'coast'} fill="#dbcc9c" stroke="#d4dbc0" strokeWidth=".61" strokeLinejoin="round" />
      <g data-layer="biomes">
        {g.biomes.map(
          ([kind, d]) =>
            (kind === 'l' ? layers.water : layers.biomes) && (
              <g key={kind}>
                <path
                  d={d}
                  data-terrain={kind}
                  fill={paint[kind] ?? '#d9c997'}
                  stroke={kind === 'l' ? '#608e91' : paint[kind]}
                  strokeWidth={kind === 'l' ? 0.08 : 0.23}
                  strokeOpacity={kind === 'l' ? 1 : 0.46}
                />
                {kind === 'd' && <path d={d} fill={'url(#' + id + 'sand)'} />}
              </g>
            ),
        )}
      </g>
      <use href={'#' + id + 'coast'} fill={'url(#' + id + 'paper)'} />
      {layers.biomes && (
        <g fill="#82996f" stroke="#486849" strokeWidth=".055" strokeLinejoin="round">
          <path d={g.trees} />
          <path d={g.trunks} fill="none" />
        </g>
      )}
      {layers.relief && (
        <g data-layer="relief" clipPath={'url(#' + id + 'land)'}>
          <path data-relief="sunlit" d={g.sunlit} fill="#fff3c8" opacity=".28" />
          <path data-relief="shaded" d={g.shaded} fill="#55472f" opacity=".15" />
          {g.contours.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="#8d7552"
              fillOpacity=".075"
              stroke="#8a775a"
              strokeOpacity=".50"
              strokeWidth=".058"
            />
          ))}
          <path d={g.hills} fill="none" stroke="#988665" strokeWidth=".064" />
          <path d={g.peaks} fill="#ded2b6" stroke="#796e55" strokeLinejoin="round" strokeWidth=".068" />
          <path d={g.facets} fill="#948269" />
        </g>
      )}
      <use href={'#' + id + 'coast'} fill="none" stroke="#667d70" strokeWidth=".08" />
    </g>
  );
});

interface GeographyProps {
  world: World;
  layers: Layers;
  view: View;
  typeScale: number;
  selected?: string;
  onSelect: (id: string) => void;
  issues: AtlasIssue[];
  scenarioLocationIds: string[];
  requiredLocationIds?: string[];
  scenarioRouteIds: string[];
}

export function Geography({
  world,
  layers,
  view,
  typeScale,
  selected,
  onSelect,
  issues,
  scenarioLocationIds,
  requiredLocationIds,
  scenarioRouteIds,
}: GeographyProps) {
  const copy = useLocalized(english, korean);
  const types = useAtlasLabels();
  const diagnostic = useAtlasDiagnostic();
  const { number } = useFormatter();
  const g = useMemo(() => geometry(world), [world]);
  const id = useId().replace(/:/g, '');
  const size = (view.width / 73) * typeScale;
  const placeNames = new Map(world.locations.map((l) => [l.id, l.name]));
  const siteSymbols = new Map<string, Point>(),
    depthStacks = new Map<string, number>();
  for (const l of world.locations) {
    if (!l.position) continue;
    if ((l.level ?? 0) >= 0) {
      siteSymbols.set(l.id, l.position);
      continue;
    }
    const key = l.position.join(),
      index = (depthStacks.get(key) ?? 0) + 1;
    depthStacks.set(key, index);
    siteSymbols.set(l.id, [l.position[0] + size * 0.72, l.position[1] + size * 1.22 * index]);
  }
  const activeFeature = (kind: string) =>
    kind === 'river' || kind === 'lake' || kind === 'basin'
      ? layers.water
      : kind === 'ridge'
        ? layers.relief
        : layers.biomes;
  function interactive(entityId: string, name: string) {
    return {
      role: 'button',
      tabIndex: 0,
      'aria-label': name,
      'aria-pressed': selected === entityId,
      'data-entity': entityId,
      style: { cursor: 'pointer' },
      onClick: () => onSelect(entityId),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(entityId);
        }
      },
    };
  }
  const labels: MapLabel[] = [];
  function addLabel(item: { id: string; name: string }, kind: MapLabel['kind']) {
    const point = siteSymbols.get(item.id) ?? g.anchors.get(item.id);
    if (point)
      labels.push({
        id: item.id,
        text: item.name,
        point,
        kind,
      });
  }
  const zoom = ((world.tiles[0]?.length ?? 0) + 2) / view.width;
  const required = new Set(requiredLocationIds ?? scenarioLocationIds);
  const major = new Set(['capital', 'city', 'port']);
  if (layers.places) world.locations.filter(l => selected === l.id || required.has(l.id) || major.has(l.kind) ||
    zoom >= 2 || (zoom >= 1.3 && l.kind === 'town')).forEach(l => addLabel(l, 'place'));
  if (layers.territories) world.territories?.forEach((t) => addLabel(t, 'territory'));
  if (layers.regions) world.regions.forEach((r) => addLabel(r, 'region'));
  world.features.filter(f => activeFeature(f.kind) && (f.id === selected || zoom >= 1.3)).forEach(f => addLabel(f, 'feature'));
  for (const route of world.routes) {
    if ((route.id === selected || zoom >= 1.3) && layers[infrastructure.has(route.mode) ? 'infrastructure' : 'routes']) {
      addLabel({ id: route.id, name: (placeNames.get(route.from) ?? route.from) + ' → ' + (placeNames.get(route.to) ?? route.to) }, 'route');
    }
  }
  const priority = (label: MapLabel) => label.id === selected ? 0 : required.has(label.id) ? 1 :
    label.kind === 'region' || label.kind === 'territory' ? 2 : 3;
  labels.sort((a, b) => priority(a) - priority(b));
  const selectedPoint = selected ? (siteSymbols.get(selected) ?? g.anchors.get(selected)) : undefined;
  return (
    <>
      <SurfaceDefs id={id} />
      <Surface world={world} g={g} id={id} layers={layers} />
      {layers.biomes &&
        world.regions.map(
          (r) =>
            r.climateException && (
              <g
                key={r.id}
                role="img"
                aria-label={r.name + ' · ' + r.climateException.biome + ' · ' + r.climateException.rule}
                data-climate-exception={r.id}
              >
                <title>{[r.name, r.climateException.biome, r.climateException.rule].join(' · ')}</title>
                <path d={g.areas.get(r.id)} fill={'url(#' + id + 'climate)'} />
              </g>
            ),
        )}
      {(['regions', 'territories'] as const).map(
        (layer) =>
          layers[layer] && (
            <g key={layer} data-layer={layer}>
              {(layer === 'regions' ? world.regions : (world.territories ?? [])).map((r, i) => (
                <g key={r.id}>
                <path
                  {...interactive(r.id, r.name)}
                  d={g.areas.get(r.id)}
                  fill={tints[i % tints.length]}
                  fillOpacity={selected === r.id ? 0.37 : layer === 'regions' ? 0.025 : 0.21}
                  stroke={
                    selected === r.id ? '#8f3b24' : layer === 'regions' ? '#786e50' : tints[i % tints.length]
                  }
                  strokeWidth={selected === r.id ? 0.26 : layer === 'regions' ? 0.075 : 0.18}
                  strokeDasharray={layer === 'regions' ? '.3 .2' : undefined}
                >
                  <title>{r.name}</title>
                </path>
                {layer === 'territories' && <path d={g.areas.get(r.id)} fill={'url(#' + id + 'territory)'} pointerEvents="none" />}
                </g>
              ))}
            </g>
          ),
      )}
      <g data-layer="features">
        {world.features
          .filter((f) => activeFeature(f.kind))
          .map((f) => {
            const river = f.kind === 'river',
              active = f.id === selected;
            return (
              <g key={f.id} {...interactive(f.id, f.name)}>
                <title>{f.name + ' · ' + types.feature[f.kind]}</title>
                <path
                  d={g.areas.get(f.id)}
                  fill={river ? 'none' : 'transparent'}
                  stroke="transparent"
                  strokeWidth={river ? 0.62 : 0}
                />
                <path
                  d={g.areas.get(f.id)}
                  fill={active && !river ? '#f2cf78' : 'none'}
                  fillOpacity=".32"
                  stroke={active ? '#923e27' : river ? '#477f87' : 'none'}
                  strokeWidth={active ? 0.23 : 0.17}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {river && (
                  <path
                    d={g.areas.get(f.id)}
                    fill="none"
                    stroke="#bad8cd"
                    strokeWidth=".054"
                    strokeLinejoin="round"
                  />
                )}
              </g>
            );
          })}
      </g>
      {layers.scenario && (
        <g data-layer="scenario" pointerEvents="none">
          {world.routes
            .filter((r) => scenarioRouteIds.includes(r.id))
            .map((r) => (
              <path
                key={r.id}
                d={g.areas.get(r.id)}
                fill="none"
                stroke="#f6df90"
                strokeOpacity=".85"
                strokeWidth=".5"
              />
            ))}
          {scenarioLocationIds.map((k) => {
            const p = g.anchors.get(k);
            return (
              p && (
                <circle
                  key={k}
                  cx={p[0] + 0.5}
                  cy={p[1] + 0.5}
                  r={size * 0.67}
                  fill="#f3df9b"
                  fillOpacity=".7"
                  stroke="#8a722f"
                  strokeWidth={size * 0.07}
                  strokeDasharray={size * 0.17 + ' ' + size * 0.1}
                />
              )
            );
          })}
        </g>
      )}
      {layers.constraints && (
        <g data-layer="constraints" fill="none" stroke="#80588a" strokeWidth=".12" strokeDasharray=".2 .17">
          {world.constraints?.map((c, i) => {
            const points = [c.from, c.via, c.to].flatMap((k) =>
              k && g.anchors.has(k) ? [g.anchors.get(k)!] : [],
            );
            if (!points.length) return null;
            return (
              <g key={i}>
                <title>{types.strength[c.strength] + ' ' + types.relation[c.relation] + ' · ' + c.description}</title>
                <path d={line(points)} />
                {points.map(([x, y], j) => (
                  <circle key={j} cx={x + 0.5} cy={y + 0.5} r=".58" />
                ))}
              </g>
            );
          })}
        </g>
      )}
      {(['routes', 'infrastructure'] as const).map(
        (layer) =>
          layers[layer] && (
            <g data-layer={layer} key={layer}>
              {world.routes
                .filter((r) => infrastructure.has(r.mode) === (layer === 'infrastructure'))
                .map((r) => {
                  const name =
                    (placeNames.get(r.from) ?? r.from) +
                    ' → ' +
                    (placeNames.get(r.to) ?? r.to) +
                    ' · ' +
                    r.mode;
                  const [color, dash] = roadInk[r.mode],
                    active = selected === r.id;
                  return (
                    <g key={r.id} {...interactive(r.id, name)}>
                      <title>{name + (r.distanceKm != null ? ' · ' + number(r.distanceKm, { style: 'unit', unit: 'kilometer' }) : '')}</title>
                      <path d={g.areas.get(r.id)} fill="none" stroke="transparent" strokeWidth=".75" />
                      <path
                        d={g.areas.get(r.id)}
                        fill="none"
                        stroke={active ? '#9a4128' : '#efe1bc'}
                        strokeWidth={active ? 0.46 : 0.25}
                        strokeLinejoin="round"
                      />
                      <path
                        d={g.areas.get(r.id)}
                        fill="none"
                        stroke={active ? '#ffe0a7' : color}
                        strokeDasharray={dash}
                        strokeWidth=".115"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </g>
                  );
                })}
              {layer === 'infrastructure' &&
                world.routes.map((r) =>
                  r.crossings?.map(([x, y], i) => (
                    <g
                      key={r.id + i}
                      transform={'translate(' + (x + 0.5) + ' ' + (y + 0.5) + ')'}
                      {...interactive(r.id, copy.crossingLabel(types.route[r.mode]))}
                    >
                      <title>{copy.crossingTitle(types.route[r.mode])}</title>
                      <path d="M-.28-.14H.28M-.28.14H.28" stroke="#59452e" strokeWidth=".09" />
                    </g>
                  )),
                )}
            </g>
          ),
      )}
      {layers.places && (
        <g data-layer="places">
          {world.locations.map((loc) => {
            if (!loc.position) return null;
            const [x, y] = siteSymbols.get(loc.id)!,
              active = selected === loc.id;
            const underground = (loc.level ?? 0) < 0;
            return (
              <g key={loc.id} {...interactive(loc.id, loc.name)}>
                <title>
                  {loc.name + ' · ' + types.location[loc.kind] + (loc.level != null ? ' · ' + copy.level(number(loc.level)) : '')}
                </title>
                {loc.area?.length ? (
                  <path
                    d={g.areas.get(loc.id)}
                    fill="#b49556"
                    fillOpacity=".25"
                    stroke="#806a42"
                    strokeWidth=".1"
                    strokeDasharray=".19 .12"
                  />
                ) : null}
                {underground && (
                  <line
                    x1={loc.position[0] + 0.5}
                    y1={loc.position[1] + 0.5}
                    x2={x + 0.5}
                    y2={y + 0.5}
                    stroke="#674e6b"
                    strokeDasharray=".13 .08"
                    strokeWidth=".1"
                  />
                )}
                <g transform={'translate(' + (x + 0.5) + ' ' + (y + 0.5) + ') scale(' + size * 0.099 + ')'}>
                  <circle r="7" fill="transparent" />
                  <path
                    d={marks[loc.kind]}
                    fill={active ? '#b7663d' : '#655238'}
                    stroke="#f4e5be"
                    strokeWidth="2.4"
                    paintOrder="stroke"
                  />
                  <path
                    d={marks[loc.kind]}
                    fill={active ? '#a95032' : '#6c5335'}
                    stroke="#493c2c"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeWidth="1"
                  />
                  {underground && (
                    <text
                      data-depth={loc.level}
                      x="-5.5"
                      y="4"
                      textAnchor="end"
                      fontSize="9"
                      fill="#513e59"
                      fontWeight="bold"
                    >
                      {'−' + number(Math.abs(loc.level!))}
                    </text>
                  )}
                </g>
              </g>
            );
          })}
        </g>
      )}
      {layers.findings && (
        <g data-layer="findings">
          {issues.flatMap((issue, i) => {
            const points: Point[] = issue.cell
              ? [issue.cell]
              : issue.ids.flatMap((k) => (g.anchors.has(k) ? [g.anchors.get(k)!] : []));
            return points.map(([x, y], j) => (
              <g
                key={i + '-' + j}
                transform={'translate(' + (x + 0.85) + ' ' + (y + 0.12) + ') scale(' + size * 0.1 + ')'}
              >
                <title>{types.severity[issue.severity] + ' · ' + diagnostic(issue.message, issue.code)}</title>
                <path
                  d="M0-6L6 5H-6Z"
                  fill={issue.severity === 'error' ? '#9c4132' : '#856023'}
                  stroke="#fff1ca"
                  strokeWidth="1"
                />
                <text y="3.5" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">
                  !
                </text>
              </g>
            ));
          })}
        </g>
      )}
      {selectedPoint && (
        <circle
          cx={selectedPoint[0] + 0.5}
          cy={selectedPoint[1] + 0.5}
          r={size * 0.81}
          fill="none"
          stroke="#9c402b"
          strokeWidth={size * 0.11}
          pointerEvents="none"
        />
      )}
      {layers.labels && (
        <g data-layer="labels" fontSize="16" fontFamily="Georgia, Pretendard, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif">
          {placeLabels(labels, view, size, selected).map((l) => (
            <g
              key={l.id}
              transform={'translate(' + l.x + ' ' + l.y + ') scale(' + size / 16 + ')'}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelect(l.id)}
              fontStyle={l.kind === 'feature' ? 'italic' : undefined}
              fontWeight={l.kind === 'place' || l.id === selected ? 'bold' : undefined}
            >
              <text
                aria-hidden="true"
                stroke="#eee0b6"
                fill="#eee0b6"
                strokeLinejoin="round"
                strokeWidth="3.35"
              >
                {l.text}
              </text>
              <text fill={l.id === selected ? '#7e321e' : l.kind === 'feature' ? '#385c58' : '#403b2c'}>
                {l.text}
              </text>
            </g>
          ))}
        </g>
      )}
    </>
  );
}

export function Compass() {
  const copy = useLocalized(english, korean);
  return (
    <g transform="translate(907 39)" fill="#485451" stroke="#485451" aria-label={copy.compass}>
      <text y="-18" textAnchor="middle" stroke="none" fontFamily="Georgia, Pretendard, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif" fontSize="11">
        {copy.north}
      </text>
      <circle r="10" fill="none" strokeWidth=".7" />
      <path d="M0-15L3-3L15 0L3 3L0 15L-3 3L-15 0L-3-3Z" fill="#eee4c8" strokeWidth=".7" />
      <path d="M0-15V0L-3-3ZM15 0H0L3-3ZM0 15V0L3 3ZM-15 0H0L-3 3Z" stroke="none" />
    </g>
  );
}

interface LegendEntry { key: string; label: string; color: string; line?: boolean; dashed?: boolean; mark?: string }
export function useAtlasLegend(world: World, layers: Layers, anchors: boolean, findings: boolean) {
  const copy = useLocalized(english, korean);
  const types = useAtlasLabels();
  const entries: LegendEntry[] = [];
  const terrain = world.tiles.join('');
  if (layers.biomes && terrain.includes('f')) entries.push({ key: 'wood', label: types.biomes.f, color: paint.f! });
  if (layers.relief && /[mhs]/.test(terrain)) entries.push({ key: 'hills', label: copy.highlands, color: '#a68e6b' });
  if (terrain.includes('~') || (layers.water && terrain.includes('l'))) entries.push({ key: 'water', label: copy.water, color: '#8dafaa' });
  if (layers.water && world.features.some(f => f.kind === 'river')) entries.push({ key: 'river', label: types.feature.river, color: '#477f87', line: true });
  if (layers.regions && world.regions.length) entries.push({ key: 'regions', label: types.regions, color: '#786e50', line: true, dashed: true });
  if (layers.territories && world.territories?.length) entries.push({ key: 'territories', label: types.territories, color: tints[0]! });
  if (layers.places) {
    for (const kind of new Set(world.locations.filter(l => l.position).map(l => l.kind))) {
      entries.push({ key: kind, label: types.location[kind], color: '#68513b', mark: marks[kind] });
    }
  }
  for (const mode of new Set(world.routes.map(r => r.mode))) {
    if (!layers[infrastructure.has(mode) ? 'infrastructure' : 'routes']) continue;
    entries.push({ key: mode, label: types.route[mode].charAt(0).toUpperCase() + types.route[mode].slice(1),
      color: roadInk[mode][0], line: true, dashed: !!roadInk[mode][1] });
  }
  if (layers.scenario && anchors) entries.push({ key: 'anchors', label: copy.anchors, color: '#8a722f', mark: 'M0-5a5 5 0 1 0 .01 0Z' });
  if (layers.constraints && world.constraints?.length) entries.push({ key: 'constraints', label: copy.constraints, color: '#80588a', line: true, dashed: true });
  if (layers.findings && findings) entries.push({ key: 'findings', label: copy.issues, color: '#9c4132', mark: 'M0-6L6 5H-6Z' });
  return entries;
}

export function Legend({
  y,
  scale,
  viewWidth,
  mapWidth,
  entries,
  typeScale,
  columns,
  rows,
}: {
  y: number;
  scale?: number;
  viewWidth: number;
  mapWidth: number;
  entries: LegendEntry[];
  typeScale: number;
  columns: number;
  rows: number;
}) {
  const types = useAtlasLabels();
  const { number } = useFormatter();
  const cells = Math.max(1, Math.floor(viewWidth / 9)),
    length = (cells * mapWidth) / viewWidth / typeScale;
  return (
    <g
      data-layer="legend"
      transform={'translate(0 ' + y + ') scale(' + typeScale + ')'}
      fill="#484a3b"
      fontFamily="Georgia, Pretendard, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif"
      fontSize="13"
    >
      {entries.map(({key, label, color, line, dashed, mark}, i) => (
        <g key={key} transform={'translate(' + (22 + (i % columns) * 113) + ' ' + (Math.floor(i / columns) * 23) + ')'}>
          {mark ? <path d={mark} transform="translate(8 -5)" fill="none" stroke={color} strokeWidth="1.8" /> :
            line ? <path d="M0-4H17" stroke={color} strokeWidth="2.4" strokeDasharray={dashed ? '4 2' : undefined} /> :
            <rect y="-9" width="16" height="9" rx="1.5" fill={color} />}
          <text x="22">{label}</text>
        </g>
      ))}
      <g transform={'translate(' + 915 / typeScale + ' ' + (typeScale > 1.5 ? 8 + rows * 23 : 0) + ')'} textAnchor="end" data-scale="true">
        <path d={'M-' + length + ' -7v7H0v-7'} fill="none" stroke="#525045" strokeWidth="1.5" />
        <path d={'M-' + length + ' -2h' + length / 2} stroke="#525045" strokeWidth="3" />
        <text y="17">{scale ? number(cells * scale, { style: 'unit', unit: 'kilometer' }) : types.cells(number(cells))}</text>
      </g>
    </g>
  );
}
