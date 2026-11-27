import type { Location, Point, TravelRoute, World } from './project.generated';
import type { AtlasConstraint, AtlasIssue } from './atlasTypes';

const neighbors = ([x, y]: Point): Point[] => [
  [x, y - 1],
  [x + 1, y],
  [x, y + 1],
  [x - 1, y],
];
const distance = (a: Point, b: Point) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
const land = (tile: string) => tile.length === 1 && 'pvfhdms'.includes(tile);
const high = (tile: string) => tile === 'm' || tile === 's';
const terrain = (w: World, [x, y]: Point) =>
  Number.isInteger(x) && Number.isInteger(y) ? (w.tiles[y]?.[x] ?? '') : '';
const compare = (a: string, b: string) => (a === b ? 0 : a < b ? -1 : 1);
const byId = (a: { id: string }, b: { id: string }) => compare(a.id, b.id);
const ids = (c: AtlasConstraint) => [c.from, c.to, c.via].filter((v): v is string => !!v);
const positionRules = (c: AtlasConstraint) => !['travel', 'canal', 'aqueduct'].includes(c.relation);
const coastal = (w: World, p: Point) => neighbors(p).some((n) => terrain(w, n) === '~');

function hash(text: string) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}

function geography(w: World, locations: Location[]) {
  const places = new Map(locations.map((l) => [l.id, l]));
  const regions = new Map<string, string>();
  for (const region of w.regions) for (const cell of region.cells) regions.set(cell.join(), region.id);
  const regionsById = new Set(w.regions.map((r) => r.id));
  const territories = new Map((w.territories ?? []).map((t) => [t.id, new Set(t.regionIds)]));
  const riverBanks = new Map<string, Set<string>>();
  const rivers = new Set<string>();
  const banks = new Set<string>();
  for (const feature of w.features) {
    if (feature.kind !== 'river') continue;
    const edge = new Set<string>();
    for (const p of feature.cells) {
      if (!land(terrain(w, p))) continue;
      rivers.add(p.join());
      for (const q of [p, ...neighbors(p)]) {
        edge.add(q.join());
        banks.add(q.join());
      }
    }
    riverBanks.set(feature.id, edge);
  }
  return { places, regions, regionsById, territories, rivers, riverBanks, banks };
}
type Geography = ReturnType<typeof geography>;

function referencesExist(g: Geography, c: AtlasConstraint) {
  if (!g.places.has(c.from)) return false;
  if (c.relation === 'river') return !c.to || g.riverBanks.has(c.to);
  if (!c.to) return false;
  if (c.relation === 'inside' || c.relation === 'outside') {
    const target = g.places.get(c.to);
    return (
      c.from !== c.to &&
      (g.regionsById.has(c.to) ||
        g.territories.has(c.to) ||
        (!!target && (!!target.area?.length || ['forest', 'reservoir'].includes(target.kind))))
    );
  }
  if (!g.places.has(c.to)) return false;
  if (c.relation === 'separates') return !!c.via && g.places.has(c.via) && new Set(ids(c)).size === 3;
  return c.relation === 'travel' || c.from !== c.to;
}

// Undefined means another required position has yet to be placed during the bounded search.
function satisfies(g: Geography, c: AtlasConstraint): boolean | undefined {
  const from = g.places.get(c.from),
    to = g.places.get(c.to ?? '');
  const a = from?.position,
    b = to?.position;
  if (!a) return;
  if (c.relation === 'river') return (c.to ? g.riverBanks.get(c.to) : g.banks)?.has(a.join()) ?? false;
  if (c.relation === 'inside' || c.relation === 'outside') {
    if (to && !to.area?.length && !b) return;
    const region = g.regions.get(a.join()) ?? '';
    const within = to
      ? (to.area ?? (b ? [b] : [])).some((p) => same(p, a))
      : region === c.to || !!g.territories.get(c.to ?? '')?.has(region);
    return c.relation === 'inside' ? within : !within;
  }
  if (!b) return;
  if (c.relation === 'near') return distance(a, b) <= 4;
  if (c.relation === 'beneath') return same(a, b) && (from!.level ?? 0) < (to!.level ?? 0);
  if (c.relation === 'separates') {
    const v = g.places.get(c.via ?? '')?.position;
    if (!v) return;
    return (
      distance(a, v) + distance(v, b) === distance(a, b) &&
      (a[0] - v[0]) * (b[0] - v[0]) + (a[1] - v[1]) * (b[1] - v[1]) < 0
    );
  }
}

function preferred(l: Location, tile: string) {
  const preferences = { 'any-land': 'pvfhdms', plain: 'pv', forest: 'f', mountain: 'ms', desert: 'd' };
  return land(tile) && preferences[l.preference].includes(tile);
}

function footprint(w: World, l: Location, p: Point) {
  if (!['forest', 'reservoir'].includes(l.kind)) return;
  return [p, ...neighbors(p)].filter(
    (q) => land(terrain(w, q)) && (l.kind !== 'forest' || terrain(w, q) === terrain(w, p)),
  );
}

export function placeLocations(
  world: World,
  locations: Location[],
  constraints: AtlasConstraint[],
): Location[] {
  const places = structuredClone(locations).sort(byId);
  const rules = constraints
    .filter(positionRules)
    .sort((a, b) => compare(JSON.stringify(ids(a)), JSON.stringify(ids(b))) || compare(a.relation, b.relation));
  const g = geography(world, places);
  const closeSeparators = rules.filter(
    (c) =>
      c.relation === 'separates' &&
      c.strength === 'hard' &&
      rules.some(
        (n) =>
          n.relation === 'near' &&
          n.strength === 'hard' &&
          ((n.from === c.from && n.to === c.to) || (n.from === c.to && n.to === c.from)),
      ),
  );
  const landCells: Point[] = [];
  world.tiles.forEach((row, y) =>
    [...row].forEach((t, x) => {
      if (land(t) && g.regions.has([x, y].join())) landCells.push([x, y]);
    }),
  );
  // Preserve a designer's lock, including an infeasible one, for the checker to explain.
  for (const l of places)
    if (!l.locked) {
      delete l.position;
      delete l.regionId;
      delete l.area;
      if (l.kind === 'underground' && l.level === undefined) l.level = -1;
    }
  const pending = new Set(places.filter((l) => !l.locked));
  const order: Location[] = [];
  while (pending.size) {
    const idPending = (id?: string) => !!id && pending.has(g.places.get(id)!);
    const next =
      [...pending].find((l) =>
        rules.every((c) => {
          if (['beneath', 'inside', 'outside'].includes(c.relation) && c.from === l.id) return !idPending(c.to);
          if (closeSeparators.includes(c)) return (l.id !== c.from && l.id !== c.to) || !idPending(c.via);
          if (c.relation === 'separates' && c.via === l.id) return !idPending(c.from) && !idPending(c.to);
          return true;
        }),
      ) ?? pending.values().next().value!;
    pending.delete(next);
    order.push(next);
  }
  for (const l of order) {
    const below = rules.filter((c) => c.relation === 'beneath' && c.from === l.id && referencesExist(g, c));
    if (below.length)
      l.level = Math.max(
        -32,
        Math.min(l.level ?? 0, ...below.map((c) => (g.places.get(c.to!)?.level ?? 0) - 1)),
      );
  }
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const l of order) {
      const relevant = rules.filter((c) => ids(c).includes(l.id) && referencesExist(g, c));
      const old = l.position;
      if (pass && old && relevant.every((c) => satisfies(g, c) !== false)) continue;
      const peers = places.filter((o) => o !== l && !!o.position && (o.level ?? 0) === (l.level ?? 0));
      const occupied = new Set(peers.map((o) => o.position!.join()));
      // Anchor the separator first. With the other endpoint pending, reserve a legal opposite cell.
      const paired = new Set<string>();
      for (const c of closeSeparators) {
        if (l.id !== c.from && l.id !== c.to) continue;
        const other = g.places.get(l.id === c.from ? c.to! : c.from),
          center = g.places.get(c.via!)?.position;
        if (!other || other.position || !center) continue;
        for (const cell of neighbors(center)) {
          const opposite: Point = [2 * center[0] - cell[0], 2 * center[1] - cell[1]];
          if (
            land(terrain(world, opposite)) &&
            !occupied.has(opposite.join()) &&
            (other.kind !== 'port' || coastal(world, opposite))
          )
            paired.add(cell.join());
        }
      }
      let best: Point | undefined,
        bestHardFailures = Infinity,
        bestScore = -Infinity;
      const origin = hash(world.seed + ':' + l.id);
      for (const p of landCells) {
        const key = p.join(),
          tile = terrain(world, p);
        if (occupied.has(key) || (l.kind === 'port' && !coastal(world, p))) continue;
        l.position = p;
        // Candidate area participates when this place contains a second location.
        l.area = footprint(world, l, p);
        let hardFailures = 0,
          score = hash(origin + ':' + key) / 4294967296;
        for (const c of relevant)
          if (satisfies(g, c) === false) {
            if (c.strength === 'hard') hardFailures++;
            else score -= 100;
          }
        if (hardFailures > bestHardFailures) continue;
        if (paired.has(key)) score += 200;
        if (preferred(l, tile)) score += 20;
        if (l.kind === 'forest' && tile === 'f') score += 20;
        if (['city', 'capital', 'village', 'town'].includes(l.kind)) {
          if ('pv'.includes(tile)) score += 4;
          if (g.banks.has(key)) score += 2;
        }
        if (l.kind === 'fortress' && 'hm'.includes(tile)) score += 4;
        if (peers.length) score += Math.min(8, ...peers.map((o) => distance(o.position!, p))) / 2;
        if (hardFailures < bestHardFailures || score > bestScore) {
          bestHardFailures = hardFailures;
          bestScore = score;
          best = p;
        }
      }
      if (best) {
        l.position = best;
        l.regionId = g.regions.get(best.join());
        const area = footprint(world, l, best);
        if (area) l.area = area;
        else delete l.area;
      } else {
        delete l.position;
        delete l.area;
        delete l.regionId;
      }
      if (old?.join() !== best?.join()) changed = true;
    }
    if (!changed) break;
  }
  return places;
}

// Integer movement costs let Dijkstra visit cost buckets in ascending order.
function findPath(w: World, g: Geography, start: Point, end: Point, kind: string): Point[] {
  const width = w.tiles[0]?.length ?? 0;
  if (!width || !land(terrain(w, start)) || !land(terrain(w, end))) return [];
  const sea = kind === 'sea';
  if (kind === 'canal' && high(terrain(w, start))) return [];
  const index = ([x, y]: Point) => y * width + x;
  const point = (i: number): Point => [i % width, Math.floor(i / width)];
  const first = index(start),
    last = index(end);
  const cost = new Float64Array(w.tiles.length * width).fill(Infinity);
  const prev = new Int32Array(cost.length).fill(-1);
  const buckets: number[][] = [[first]];
  cost[first] = 0;
  for (let d = 0; d < buckets.length; d++)
    for (const i of buckets[d] ?? []) {
      if (d !== cost[i]) continue;
      if (i === last) {
        const path: Point[] = [];
        for (let j = last; j !== -1; j = prev[j]!) path.push(point(j));
        return path.reverse();
      }
      const p = point(i);
      for (const q of neighbors(p)) {
        const tile = terrain(w, q);
        if (sea ? tile !== '~' && !(same(q, end) && i !== first) : !land(tile)) continue;
        if (kind === 'canal' && high(tile)) continue;
        const j = index(q);
        const rise = Math.abs((w.elevation?.[q[1]]?.[q[0]] ?? 0) - (w.elevation?.[p[1]]?.[p[0]] ?? 0));
        const step = sea
          ? 2
          : 2 +
            (high(tile) ? 15 : tile === 'h' ? 5 : 'fd'.includes(tile) ? 2 : 0) +
            (g.rivers.has(q.join()) ? 5 : 0) +
            Math.min(5, Math.round(rise / 10));
        const total = d + step;
        if (total < cost[j]!) {
          cost[j] = total;
          prev[j] = i;
          (buckets[total] ??= []).push(j);
        }
      }
    }
  return [];
}

class Connections {
  private readonly groups = new Map<string, Set<string>>();
  linked(a: string, b: string) {
    return a === b || !!this.groups.get(a)?.has(b);
  }
  join(a: string, b: string) {
    if (this.linked(a, b)) return;
    const group = new Set([...(this.groups.get(a) ?? [a]), ...(this.groups.get(b) ?? [b])]);
    for (const id of group) this.groups.set(id, group);
  }
}

const waterwork = (mode: string) => mode === 'canal' || mode === 'aqueduct';
function lengthKm(w: World, path: Point[], from: Location, to: Location) {
  const horizontal =
    (same(path[0]!, path[path.length - 1]!) ? 0 : path.length - 1) * (w.settings?.kmPerCell ?? 1);
  // An atlas depth level spans 50 metres, regardless of the continental map scale.
  return Math.round((horizontal + 0.05 * Math.abs((from.level ?? 0) - (to.level ?? 0))) * 1000) / 1000;
}

export function buildRoutes(world: World, constraints: AtlasConstraint[]): TravelRoute[] {
  const locations = [...world.locations]
    .filter((l) => l.position && land(terrain(world, l.position)))
    .sort(byId);
  const g = geography(world, locations),
    connections = new Connections();
  const reserved = new Set([
    world.id,
    ...locations.map((l) => l.id),
    ...world.features.map((f) => f.id),
    ...world.regions.map((r) => r.id),
    ...(world.territories ?? []).map((t) => t.id),
  ]);
  const routes: TravelRoute[] = [];
  const attempted = new Set<string>();
  function connect(one: Location, other: Location, requested = 'travel') {
    if (one.id === other.id) return;
    const [from, to] = byId(one, other) < 0 ? [one, other] : [other, one];
    const key = [from.id, to.id, requested].join(':');
    if (attempted.has(key)) return;
    attempted.add(key);
    const a = from.position!,
      b = to.position!;
    const underground = (from.level ?? 0) < 0 || (to.level ?? 0) < 0;
    if ((same(a, b) && (!underground || from.level === to.level)) || (waterwork(requested) && underground))
      return;
    let path = same(a, b) ? [a, b] : findPath(world, g, a, b, requested);
    let mode: TravelRoute['mode'] = 'road';
    if (!path.length && !waterwork(requested) && from.kind === 'port' && to.kind === 'port' && !underground) {
      path = findPath(world, g, a, b, 'sea');
      mode = 'sea';
    }
    if (path.length < 2) return;
    const crossings = path.filter((p) => g.rivers.has(p.join()));
    if (requested === 'canal' || requested === 'aqueduct') mode = requested;
    else if (underground) mode = 'tunnel';
    else if (mode !== 'sea') {
      if (path.some((p) => high(terrain(world, p)))) mode = 'pass';
      else if (crossings.length) mode = 'bridge';
      else if (
        (world.settings?.roads ?? 1) <= 1 &&
        [from, to].some((l) => ['dungeon', 'ruin', 'forest'].includes(l.kind))
      )
        mode = 'trail';
    }
    const base = 'atlas-route-' + hash(key).toString(36);
    let id = base;
    for (let n = 2; reserved.has(id); n++) id = base + '-' + n;
    reserved.add(id);
    routes.push({
      id,
      from: from.id,
      to: to.id,
      mode,
      path: path as TravelRoute['path'],
      distanceKm: lengthKm(world, path, from, to),
      ...(crossings.length && !waterwork(mode) && mode !== 'sea' && mode !== 'tunnel' ? { crossings } : {}),
    });
    if (!waterwork(mode)) connections.join(from.id, to.id);
  }
  const demands = constraints
    .filter((c) => !positionRules(c))
    .sort(
      (a, b) => compare(a.from, b.from) || compare(a.to ?? '', b.to ?? '') || compare(a.relation, b.relation),
    );
  for (const c of demands) {
    const from = g.places.get(c.from),
      to = g.places.get(c.to ?? '');
    if (from && to) connect(from, to, c.relation);
  }
  const pairs = locations
    .flatMap((a, i) => locations.slice(i + 1).map((b) => ({ a, b, d: distance(a.position!, b.position!) })))
    .sort((u, v) => u.d - v.d || byId(u.a, v.a) || byId(u.b, v.b));
  for (const { a, b } of pairs) if (!connections.linked(a.id, b.id)) connect(a, b);
  let extras = Math.floor((locations.length * Math.max(0, (world.settings?.roads ?? 1) - 1)) / 2);
  for (const { a, b } of pairs) {
    if (!extras) break;
    const count = routes.length;
    connect(a, b);
    if (routes.length > count) extras--;
  }
  return routes;
}

function routeFault(
  w: World,
  g: Geography,
  r: TravelRoute,
  from: Location,
  to: Location,
): [string, Point?] | undefined {
  const path: Point[] = r.path,
    first = path[0],
    last = path[path.length - 1];
  if (path.length < 2 || !first || !last || !same(first, from.position!) || !same(last, to.position!))
    return ['The route must start and finish at its declared locations.', first];
  const depth = (from.level ?? 0) < 0 || (to.level ?? 0) < 0;
  const vertical =
    r.mode === 'tunnel' && (from.level ?? 0) !== (to.level ?? 0) && same(first, last) && path.length === 2;
  const gap = path.find((p, i) => !terrain(w, p) || (i > 0 && !vertical && distance(p, path[i - 1]!) !== 1));
  if (gap) return ['The route leaves the grid or skips a four-neighbor step.', gap];
  if (depth && r.mode !== 'tunnel') return ['An underground endpoint requires a tunnel.', first];
  if (r.mode === 'sea') {
    if (from.kind !== 'port' || to.kind !== 'port' || path.length < 3)
      return ['Sea travel needs two coastal ports and an ocean passage.', first];
    const bad = path.slice(1, -1).find((p) => terrain(w, p) !== '~');
    if (bad) return ['The sea passage crosses a non-ocean cell.', bad];
  } else {
    const wet = path.find((p) => !land(terrain(w, p)));
    if (wet) return ['The land corridor crosses open water.', wet];
    const mountain = path.find((p) => high(terrain(w, p)));
    if (r.mode === 'tunnel' && !depth && !mountain)
      return ['A tunnel requires an underground site or mountain crossing.', first];
    if (r.mode === 'pass' && !mountain) return ['A pass must traverse mountain relief.', first];
    if (mountain && !['pass', 'tunnel', 'aqueduct'].includes(r.mode))
      return ['Mountain relief requires a pass, tunnel or engineered aqueduct.', mountain];
    if (!waterwork(r.mode) && r.mode !== 'tunnel') {
      const required = new Set(path.filter((p) => g.rivers.has(p.join())).map((p) => p.join()));
      const marked = new Set((r.crossings ?? []).map((p) => p.join()));
      if (
        w.generatorVersion !== 'grid-1' &&
        (marked.size !== required.size || [...required].some((k) => !marked.has(k)))
      )
        return [
          'Recorded river crossings differ from the river cells on the path.',
          path.find((p) => g.rivers.has(p.join())),
        ];
      if (r.mode === 'bridge' && !required.size) return ['Bridge route has no river crossing.', first];
      if (required.size && w.generatorVersion !== 'grid-1' && !['pass', 'bridge'].includes(r.mode))
        return [
          'A surface river crossing requires a bridge designation.',
          path.find((p) => g.rivers.has(p.join())),
        ];
    }
  }
  if (r.distanceKm !== undefined && Math.abs(r.distanceKm - lengthKm(w, path, from, to)) > 0.0005)
    return ['The route distance differs from the path at the current map scale.', first];
}

const constraintText: Record<AtlasConstraint['relation'], string> = {
  near: 'Sites must be within four horizontal or vertical grid steps.',
  beneath: 'The lower site must share the upper site’s coordinates at a deeper level.',
  separates:
    'The third place must lie between the endpoints along a shortest grid path with the endpoints on opposing sides.',
  travel: 'No continuous journey through valid routes connects these places.',
  river: 'The site must occupy or border a natural river cell.',
  inside: 'The site must lie inside the referenced area.',
  outside: 'The site must lie outside the referenced area.',
  canal: 'The requested engineered canal is missing or invalid.',
  aqueduct: 'The requested engineered aqueduct is missing or invalid.',
};

export function spatialIssues(world: World, constraints: AtlasConstraint[]): AtlasIssue[] {
  const issues: AtlasIssue[] = [],
    g = geography(world, world.locations);
  const report = (
    code: string,
    ids: string[],
    message: string,
    repair: string,
    cell?: Point,
    severity: AtlasIssue['severity'] = 'error',
  ) => issues.push({ code, severity, ids, message, repair, ...(cell && { cell }) });
  const seen = new Set<string>(),
    occupied = new Map<string, string>(),
    invalid = new Set<string>();
  for (const l of world.locations) {
    const p = l.position,
      tile = p && terrain(world, p);
    const initial = issues.length;
    if (seen.has(l.id))
      report(
        'location_id',
        [l.id],
        'Two locations use the same ID.',
        'Restore a distinct stable ID for each site.',
      );
    seen.add(l.id);
    if (!p || !tile || !land(tile))
      report(
        'location_position',
        [l.id],
        'The location lacks an integer land cell inside the map.',
        'Choose an available land cell or revise the lock.',
        p,
      );
    else {
      if (!l.regionId || l.regionId !== g.regions.get(p.join()))
        report(
          'location_region',
          [l.id],
          'The site is outside its recorded region.',
          'Assign the region that contains this cell.',
          p,
        );
      const slot = [p[0], p[1], l.level ?? 0].join(),
        prior = occupied.get(slot);
      if (prior) {
        invalid.add(prior);
        report(
          'location_overlap',
          [prior, l.id],
          'Two sites occupy this cell on the same level.',
          'Move one site or review its underground level.',
          p,
        );
      }
      occupied.set(slot, l.id);
      if (l.kind === 'port' && !coastal(world, p))
        report(
          'location_port',
          [l.id],
          'The port has no adjacent ocean cell.',
          'Move the port to the coast.',
          p,
        );
      if (
        !Number.isInteger(l.level ?? 0) ||
        (l.level ?? 0) > 0 ||
        (l.kind === 'underground' && (l.level ?? 0) >= 0)
      )
        report(
          'location_level',
          [l.id],
          'The site has an incompatible vertical level.',
          'Use zero for surface sites or a negative integer underground.',
          p,
        );
      if (l.area) {
        const cells = new Set(l.area.map((q) => q.join()));
        const connected = new Set([p.join()]),
          queue = [p];
        for (const q of queue)
          for (const n of neighbors(q))
            if (cells.has(n.join()) && !connected.has(n.join())) {
              connected.add(n.join());
              queue.push(n);
            }
        if (
          !cells.has(p.join()) ||
          cells.size !== l.area.length ||
          connected.size !== cells.size ||
          l.area.some((q) => !land(terrain(world, q)))
        )
          report(
            'location_area',
            [l.id],
            'The footprint must be connected land containing the marker.',
            'Redraw the footprint around its marker.',
            p,
          );
      }
    }
    if (issues.length > initial) invalid.add(l.id);
    if (p && tile && land(tile) && !preferred(l, tile))
      report(
        'terrain_preference',
        [l.id],
        'Placement relaxed this site’s terrain preference.',
        'Review the chosen cell or select compatible terrain.',
        p,
        'warning',
      );
  }
  const connections = new Connections(),
    infrastructure: TravelRoute[] = [];
  const routeIds = new Set<string>(),
    duplicates = new Set<string>();
  for (const r of world.routes) {
    if (routeIds.has(r.id) || seen.has(r.id)) duplicates.add(r.id);
    routeIds.add(r.id);
  }
  for (const r of world.routes) {
    const from = g.places.get(r.from),
      to = g.places.get(r.to),
      entities = [r.id, r.from, r.to];
    if (duplicates.has(r.id)) {
      report('route_id', entities, 'The route ID is already in use.', 'Assign a unique route ID.');
      continue;
    }
    if (!from?.position || !to?.position || from.id === to.id || invalid.has(from.id) || invalid.has(to.id)) {
      report(
        'route_endpoint',
        entities,
        'A route endpoint is missing, invalid or identical to its other endpoint.',
        'Restore both valid sites and rebuild the route.',
      );
      continue;
    }
    const fault = routeFault(world, g, r, from, to);
    if (fault)
      report(
        'route_geometry',
        entities,
        fault[0],
        'Rebuild this corridor against the current terrain and endpoints.',
        fault[1],
      );
    else if (waterwork(r.mode)) infrastructure.push(r);
    else connections.join(from.id, to.id);
  }
  for (const c of constraints) {
    const involved = ids(c),
      severity = c.strength === 'hard' ? 'error' : 'warning';
    if (!referencesExist(g, c)) {
      report(
        'constraint_reference',
        involved,
        'The spatial requirement has missing or incompatible references.',
        'Select existing identities of the required kind.',
        undefined,
        severity,
      );
      continue;
    }
    const ok =
      c.relation === 'travel'
        ? !invalid.has(c.from) && !invalid.has(c.to!) && connections.linked(c.from, c.to!)
        : waterwork(c.relation)
          ? infrastructure.some(
              (r) =>
                r.mode === c.relation &&
                ((r.from === c.from && r.to === c.to) || (r.from === c.to && r.to === c.from)),
            )
          : satisfies(g, c);
    if (!ok)
      report(
        c.relation === 'travel' ? 'journey_unreachable' : 'constraint_' + c.relation,
        involved,
        constraintText[c.relation],
        c.relation === 'travel'
          ? 'Restore the missing route or connect coastal ports.'
          : 'Review the involved sites, locks and requirement before changing the map.',
        g.places.get(c.from)?.position,
        severity,
      );
  }
  return issues;
}
