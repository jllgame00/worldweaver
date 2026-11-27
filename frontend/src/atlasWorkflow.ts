import { advance, narrativeFresh, newId } from './project';
import type { Project, World, AtlasSettings, AtlasConstraint, Point } from './project.generated';
import type { AtlasIssue } from './atlasTypes';
import { equalData, scenarioCurrent } from './scenarioWorkflow';
import { entities, isProject, structurallyValidWorld, validAtlasSettings } from './validation';
import { atlasPlaces, portableWorld } from './atlasPlaces';
import { terrain, terrainIssues } from './atlasTerrain';
import { islandPorts } from './atlasPorts';
import { placeLocations, buildRoutes, spatialIssues } from './atlasSpatial';
import { atlasLabels } from './atlasLabels';
import type { Locale, Translation } from './locale';
export { resolvedWorld } from './atlasPlaces';

export const version = 'atlas-1';
export const defaults: AtlasSettings = {
  size: 'standard',
  kmPerCell: 4,
  land: 56,
  ruggedness: 2,
  climate: 'temperate',
  settlements: 1,
  roads: 1,
  politics: 1,
};
export function atlasSourceProblem(p: Project): string | undefined {
  if (!p.narrative?.approved || !narrativeFresh(p)) return 'Approve the current narrative in Narrative Studio.';
  if (!p.scenario) return 'Accept a scenario proposal in Scenario Studio.';
  if (!scenarioCurrent(p)) return 'Reconcile the scenario with its current narrative, then validate and approve it.';
  if (!p.scenario.approved) return 'Approve the saved scenario in Scenario Studio.';
}
export const sourceReady = (p: Project) => !atlasSourceProblem(p);
export function sourceIssues(p: Project, w: World): string[] {
  const problems = [];
  if (!sourceReady(p)) problems.push('The source narrative and scenario need current approval.');
  if (p.narrative?.id !== w.sourceNarrativeId || p.versions.narrative !== w.narrativeRevision)
    problems.push('Narrative revision ' + w.narrativeRevision + ' → ' + p.versions.narrative);
  if (p.scenario?.id !== w.sourceScenarioId || p.versions.scenario !== w.scenarioRevision)
    problems.push('Scenario revision ' + w.scenarioRevision + ' → ' + p.versions.scenario);
  return problems;
}
function key(c: AtlasConstraint) {
  return JSON.stringify([c.origin, c.relation, c.from, c.to, c.via, c.strength, c.description]);
}
export function requirements(p: Project, custom: AtlasConstraint[] = []): AtlasConstraint[] {
  const nodes = new Map(p.nodes.map((n) => [n.id, n]));
  const plan: AtlasConstraint[] = (p.scenario?.geography ?? []).map((c) => ({
    ...c,
    origin: 'scenario',
    strength: 'hard',
  }));
  for (const edge of p.edges.filter((e) => e.travel === 'required' && e.kind !== 'reference')) {
    const from = nodes.get(edge.from)?.locationId,
      to = nodes.get(edge.to)?.locationId;
    if (from && to && from !== to)
      plan.push({
        from,
        to,
        relation: 'travel',
        origin: 'scenario',
        strength: 'hard',
        description: edge.label,
      });
  }
  const all = new Map([...plan, ...custom.filter((c) => c.origin !== 'scenario')].map((c) => [key(c), c]));
  return [...all.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, c]) => ({ ...c }));
}
export function links(p: Project, id: string) {
  const quests = p.quests.filter(
    (q) => q.locationIds?.includes(id) || p.nodes.some((n) => n.id === q.nodeId && n.locationId === id),
  );
  const nodes = p.nodes.filter((n) => n.locationId === id);
  const events = p.nodes.filter((n) => nodes.includes(n) || quests.some((q) => q.nodeId === n.id));
  const characters = p.characters.filter((c) =>
    [...events, ...quests].some((v) => v.characterIds?.includes(c.id)),
  );
  const factions = p.factions.filter(
    (f) =>
      [...events, ...quests].some((v) => v.factionIds?.includes(f.id)) ||
      characters.some((c) => c.factionId === f.id),
  );
  return {
    nodes,
    quests,
    characters,
    factions,
    chapters: p.scenario?.chapters.filter((c) => events.some((n) => n.chapterId === c.id)) ?? [],
  };
}
function referenced(p: Project) {
  return new Set([
    ...(p.scenario?.locations ?? []).map((v) => v.id),
    ...p.nodes.flatMap((n) => (n.locationId ? [n.locationId] : [])),
    ...p.quests.flatMap((q) => q.locationIds ?? []),
    ...(p.scenario?.geography ?? []).flatMap((c) => [c.from, c.to, ...(c.via ? [c.via] : [])]),
    ...[...p.nodes, ...p.edges].flatMap((v) =>
      [...(v.conditions ?? []), ...(v.consequences ?? [])]
        .filter((t) => t.kind === 'location')
        .map((t) => t.key),
    ),
    ...p.quests.flatMap((q) =>
      [...(q.completion ?? []), ...(q.failure ?? [])].filter((t) => t.kind === 'location').map((t) => t.key),
    ),
  ]);
}
export function worldIssues(p: Project, w: World): AtlasIssue[] {
  const issues: AtlasIssue[] = [];
  function error(code: string, ids: string[], message: string, repair: string) {
    issues.push({ code, ids, message, repair, severity: 'error' });
  }
  for (const message of sourceIssues(p, w))
    error('source', [], message, 'Review the source and generate or reconcile a proposal.');
  if (!structurallyValidWorld(w) || !w.settings || !w.elevation || w.generatorVersion !== version) {
    error(
      'world_format',
      [],
      'This atlas does not have supported physical data.',
      'Generate a current atlas proposal.',
    );
    return issues;
  }
  const plan = requirements(p, w.constraints);
  const containment = new Map<string, string>();
  for (const constraint of plan) {
    if (constraint.strength !== 'hard' || !constraint.to || !['inside', 'outside'].includes(constraint.relation)) continue;
    const pair = constraint.from + '/' + constraint.to;
    const previous = containment.get(pair);
    if (previous && previous !== constraint.relation)
      error('conflicting_constraints', [constraint.from, constraint.to],
        'Two hard rules require the same site to be both inside and outside this area.',
        'Review both authored constraints and decide which boundary applies.');
    containment.set(pair, constraint.relation);
  }
  if (plan.some((c) => !(w.constraints ?? []).some((old) => key(c) === key(old))))
    error('requirements', [], 'Scenario requirements are missing.', 'Reconcile with the approved scenario.');
  const ids = new Set(w.locations.map((v) => v.id));
  for (const id of referenced(p))
    if (!ids.has(id))
      error(
        'location_missing',
        [id],
        'Required scenario location is missing.',
        'Restore the linked location with its original ID.',
      );
  for (const e of p.edges.filter((e) => e.travel === 'required' && e.kind !== 'reference')) {
    if ([e.from, e.to].some((id) => !p.nodes.find((n) => n.id === id)?.locationId))
      error(
        'travel_endpoint',
        [e.id],
        'A required journey has an unnamed endpoint.',
        'Assign its location in Scenario Studio.',
      );
  }
  const upstream = entities({ ...p, world: undefined }).map((v) => v.id);
  const declared = new Set(p.scenario?.locations.map((l) => l.id));
  const seen = new Set(upstream);
  for (const row of [
    w,
    ...w.features,
    ...w.regions,
    ...w.routes,
    ...(w.territories ?? []),
    ...w.locations.filter((l) => !declared.has(l.id)),
  ]) {
    if (seen.has(row.id))
      error('duplicate_id', [row.id], 'A canonical ID is used twice.', 'Use a distinct ID.');
    seen.add(row.id);
  }
  const factions = new Set(p.factions.map((f) => f.id)),
    regions = new Set(w.regions.map((r) => r.id));
  const occupied = new Set<string>();
  for (const t of w.territories ?? []) {
    if (
      !t.regionIds.length ||
      t.regionIds.some((id) => !regions.has(id) || occupied.has(id)) ||
      t.factionIds.some((id) => !factions.has(id))
    )
      error(
        'territory',
        [t.id],
        'Territorial ownership or faction influence is unresolved.',
        'Assign distinct existing regions and factions.',
      );
    t.regionIds.forEach((id) => occupied.add(id));
  }
  for (const loc of w.locations)
    if (loc.factionIds?.some((id) => !factions.has(id)))
      error('location_faction', [loc.id], 'Unknown faction affiliation.', 'Select an established faction.');
  const physical = terrainIssues(w);
  issues.push(...physical);
  if (!physical.some((f) => f.severity === 'error')) issues.push(...spatialIssues(w, plan));
  return issues;
}
function sourceStamp(p: Project) {
  return {
    sourceNarrativeId: p.narrative!.id,
    sourceScenarioId: p.scenario!.id,
    narrativeRevision: p.versions.narrative,
    scenarioRevision: p.versions.scenario,
  };
}
export async function generateAtlas(
  p: Project,
  name: string,
  seed: number,
  settings: AtlasSettings,
  custom: AtlasConstraint[],
  progress?: (stage: string) => void,
  signal?: AbortSignal,
): Promise<World> {
  if (!sourceReady(p)) throw Error('Approve the current narrative and scenario first.');
  if (
    !name.trim() ||
    !validAtlasSettings(settings) ||
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff
  )
    throw Error('Check the atlas name, seed and settings.');
  const tick = async (stage: string) => {
    progress?.(stage);
    if (progress) await new Promise((resolve) => setTimeout(resolve, 0));
    signal?.throwIfAborted();
  };
  const constraints = requirements(p, custom);
  if (constraints.length > 128 || atlasPlaces(p).length > 96)
    throw Error('Atlas generation supports up to 96 input locations and 128 requirements.');
  await tick('Requirements prepared');
  const land = terrain(seed, settings);
  const protectedPlaces = referenced(p);
  constraints.forEach((c) =>
    [c.from, c.to, c.via].forEach((id) => {
      if (id) protectedPlaces.add(id);
    }),
  );
  const replaceable = new Set(
    p.world?.locations
      .filter((l) => l.generatedRole && !l.locked && !protectedPlaces.has(l.id))
      .map((l) => l.id),
  );
  const used = new Set(
    [...entities({ ...p, world: undefined }), ...(p.world?.locations ?? []), ...(p.world ? [p.world] : [])]
      .map((v) => v.id)
      .filter((id) => !replaceable.has(id)),
  );
  function free(base: string) {
    let id = base;
    for (let i = 2; used.has(id); i++) id = base + '-' + i;
    used.add(id);
    return id;
  }
  for (const row of [...land.regions, ...land.features]) row.id = free(row.id);
  const w: World = {
    ...land,
    id: p.world?.id ?? free('world-atlas'),
    name: name.trim(),
    seed,
    settings: { ...settings },
    generatorVersion: version,
    ...sourceStamp(p),
    constraints,
    approved: false,
    locations: [],
    routes: [],
    territories: [],
  };
  const korean = /[가-힣]/.test(p.narrative!.story.title);
  const regionNames = ['높은마루', '서녘들', '낮은가람', '새벽골', '갈대해안', '잿빛구릉'];
  for (const [i, region] of w.regions.entries()) {
    if (korean) region.name = regionNames[i % regionNames.length]!;
    const heights = region.cells.map(([x, y]) => w.elevation![y]![x]!);
    const span = Math.min(...heights) + '–' + Math.max(...heights) + ' m';
    region.description = korean
      ? '육지 ' + region.cells.length + '칸, 해발 ' + span
      : 'Land area of ' + region.cells.length + ' cells, elevation ' + span + '.';
  }
  if (korean) {
    const names = {
      river: '강',
      ridge: '산줄기',
      grove: '수림',
      dunes: '사구',
      lake: '호수',
      basin: '내륙 분지',
    };
    const tally = new Map<string, number>();
    for (const f of w.features) {
      const index = (tally.get(f.kind) ?? 0) + 1;
      tally.set(f.kind, index);
      f.name =
        (regionNames[(index + (seed % regionNames.length)) % regionNames.length] ?? '') +
        ' ' +
        names[f.kind] +
        (index > 1 ? ' ' + index : '');
    }
  }
  const ordered = [...w.regions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const count = Math.min(ordered.length, settings.politics);
  for (let i = 0; i < count; i++) {
    const members = ordered.slice(
      Math.floor((i * ordered.length) / count),
      Math.floor(((i + 1) * ordered.length) / count),
    );
    w.territories!.push({
      id: free('atlas-territory-' + (i + 1)),
      name: members[0]!.name + (korean ? ' 연합령' : ' March'),
      regionIds: members.map((r) => r.id),
      factionIds: [],
    });
  }
  await tick('Terrain, drainage and regions built');
  const sites = structuredClone(atlasPlaces(p))
    .filter((l) => !replaceable.has(l.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const names = korean
    ? ['바람재', '여울목', '은빛나루', '먼고개', '돌마루', '안개뜰']
    : ['Windcross', 'Reed Hollow', 'Silver Ford', 'Far Crest', 'Stonefield', 'Mist Vale'];
  for (let i = 0; i < settings.settlements * 2; i++) {
    const id = 'atlas-settlement-' + (i + 1);
    if (!used.has(id))
      sites.push({
        id: free(id),
        name: names[(i + (seed % names.length)) % names.length]!,
        kind: i % 3 === 2 ? 'landmark' : 'village',
        preference: 'any-land',
        generatedRole: 'settlement',
      });
  }
  w.locations = placeLocations(w, sites, constraints);
  if (settings.landform === 'islands') w.locations.push(...islandPorts(w, free, korean));
  await tick('Locations placed');
  w.routes = buildRoutes(w, constraints);
  await tick('Routes constructed');
  return w;
}
export function reconcileWorld(p: Project, w: World): World {
  if (!sourceReady(p)) throw Error('Approve the current narrative and scenario first.');
  const existing = new Set(w.locations.map((l) => l.id));
  const missing = atlasPlaces(p).filter((l) => !existing.has(l.id));
  const next = { ...w, ...sourceStamp(p), approved: false, constraints: requirements(p, w.constraints) };
  const pinned = w.locations.map((l) => ({ ...l, locked: true }));
  const placed = placeLocations(next, [...pinned, ...missing], next.constraints);
  next.locations = [...w.locations, ...placed.filter((l) => !existing.has(l.id))];
  next.routes = buildRoutes(next, next.constraints);
  return next;
}
export function acceptAtlas(p: Project, w: World, base: number, approve: boolean): Project {
  if (p.revision !== base) throw Error('The project changed. Reopen the current revision before acceptance.');
  const findings = worldIssues(p, w);
  const blocking = findings.filter((f) => f.severity === 'error');
  if (blocking.length) throw Error(blocking[0]!.message);
  const saved = portableWorld(p, { ...w, approved: approve });
  const sameDesign = p.world && equalData({ ...p.world, approved: approve }, saved);
  const next = sameDesign ? { ...p, revision: p.revision + 1 } : advance(p, ['world']);
  next.world = saved;
  next.basis = {
    ...p.basis,
    world: { content: p.versions.content, narrative: p.versions.narrative, scenario: p.versions.scenario },
  };
  next.runs = [
    ...p.runs,
    {
      id: newId('atlas-run'),
      stage: 'world',
      mode: 'deterministic',
      baseRevision: base,
      status: approve ? 'verified' : 'proposed',
      calls: 0,
      repairAttempts: 0,
      receipts: [
        {
          tool: 'validate_atlas',
          outcome: 'passed',
          detail: w.locations.length + ' locations, ' + w.routes.length + ' routes checked.',
        },
      ],
    },
  ];
  const checkedIds = new Set(entities(next).map((row) => row.id));
  const runId = next.runs.at(-1)!.id;
  next.findings = [
    ...next.findings.map((f) => (f.rule.startsWith('world.') ? { ...f, status: 'superseded' as const } : f)),
    ...findings.map((f) => ({
      id: newId('atlas-finding'),
      rule: 'world.' + f.code,
      origin: 'deterministic' as const,
      severity: f.severity,
      entityIds: f.ids.filter((id) => checkedIds.has(id)),
      explanation: [f.message, ...f.ids.filter((id) => !checkedIds.has(id))].join(' '),
      ...(f.cell && { spatialCell: f.cell }),
      suggestedRepair: f.repair,
      status: 'open' as const,
      checkedRevision: next.revision,
      runId,
    })),
  ];
  if (!isProject(next)) throw Error('Atlas references conflict with this project.');
  return next;
}
export function moveSite(w: World, id: string, position: Point): World {
  const site = w.locations.find((v) => v.id === id);
  if (!site || site.locked) throw Error('Unlock the location before moving it.');
  const dx = position[0] - (site.position?.[0] ?? position[0]),
    dy = position[1] - (site.position?.[1] ?? position[1]);
  const region = w.regions.find((r) => r.cells.some((c) => c[0] === position[0] && c[1] === position[1]));
  const next = {
    ...w,
    approved: false,
    locations: w.locations.map((v) =>
      v.id === id
        ? {
            ...v,
            position,
            regionId: region?.id,
            ...(v.area && { area: v.area.map(([x, y]): Point => [x + dx, y + dy]) }),
          }
        : v,
    ),
  };
  next.routes = buildRoutes(next, next.constraints ?? []);
  return next;
}
export function removeSite(p: Project, w: World, id: string): World {
  if (referenced(p).has(id) || w.locations.find((v) => v.id === id)?.locked)
    throw Error('This location is linked to the scenario or locked.');
  if (w.constraints?.some((c) => [c.from, c.to, c.via].includes(id)))
    throw Error('Remove the related atlas requirements first.');
  return {
    ...w,
    approved: false,
    locations: w.locations.filter((v) => v.id !== id),
    routes: w.routes.filter((r) => r.from !== id && r.to !== id),
  };
}
const markdownEnglish = {
  world: 'World Atlas',
  approved: 'Approved',
  draft: 'Draft',
  seed: (seed: string) => 'Seed ' + seed,
  scale: (distance: string) => distance + ' km/cell',
  sources: (narrative: string, narrativeRevision: string, scenario: string, scenarioRevision: string) =>
    'Narrative ' + narrative + ' (revision ' + narrativeRevision + ') · Scenario ' + scenario + ' (revision ' + scenarioRevision + ')',
  terrain: 'Terrain and drainage',
  journeys: 'Journeys',
  requirements: 'Requirements',
  unplaced: 'unplaced',
};
const markdownKorean: Translation<typeof markdownEnglish> = {
  world: '세계 지도',
  approved: '승인됨',
  draft: '초안',
  seed: (seed) => '시드 ' + seed,
  scale: (distance) => '칸당 ' + distance + ' km',
  sources: (narrative, narrativeRevision, scenario, scenarioRevision) =>
    '서사 ' + narrative + ' (리비전 ' + narrativeRevision + ') · 시나리오 ' + scenario + ' (리비전 ' + scenarioRevision + ')',
  terrain: '지형과 물길',
  journeys: '여정',
  requirements: '요구 사항',
  unplaced: '미배치',
};

export function atlasMarkdown(w: World, locale: Locale = 'en') {
  const copy = locale === 'ko' ? markdownKorean : markdownEnglish;
  const labels = atlasLabels[locale];
  const number = new Intl.NumberFormat(locale).format;
  const kilometers = new Intl.NumberFormat(locale, { style: 'unit', unit: 'kilometer' }).format;
  const format = (value?: number) => value == null ? '—' : number(value);
  const point = (p: Point) => p.map(number).join(', ');
  const label = (id: string) => w.locations.find((l) => l.id === id)?.name ?? id;
  return [
    '# ' + (w.name ?? copy.world),
    '',
    (w.approved ? copy.approved : copy.draft) + ' · ' + w.generatorVersion + ' · ' + copy.seed(number(w.seed)),
    labels.cells(format(w.tiles[0]?.length) + ' × ' + number(w.tiles.length)) + ' · ' + copy.scale(format(w.settings?.kmPerCell)),
    copy.sources(w.sourceNarrativeId ?? '—', format(w.narrativeRevision), w.sourceScenarioId ?? '—', format(w.scenarioRevision)),
    '',
    '## ' + copy.terrain,
    ...w.features.map(
      (f) =>
        '- ' +
        f.name +
        ' · ' +
        labels.feature[f.kind] +
        ' · ' +
        labels.cells(number(f.cells.length)) +
        (f.kind === 'river' ? ' · ' + point(f.cells[0]) + ' → ' + point(f.cells.at(-1)!) : ''),
    ),
    '',
    '## ' + labels.regions,
    ...w.regions.map(
      (r) =>
        '- ' +
        r.name +
        ' · ' +
        labels.cells(number(r.cells.length)) +
        '. ' +
        (r.description ?? '') +
        (r.climateException ? ' · ' + r.climateException.biome + ' — ' + r.climateException.rule : ''),
    ),
    '',
    '## ' + labels.territories,
    ...(w.territories ?? []).map((t) => '- ' + t.name + ' · ' + t.regionIds.join(', ')),
    '',
    '## ' + labels.locations,
    ...w.locations.map(
      (l) =>
        '- ' +
        l.name +
        ' (' +
        l.id +
        ', ' +
        labels.location[l.kind] +
        ') · ' +
        (l.position ? point(l.position) : copy.unplaced) +
        ' · ' +
        (l.description ?? ''),
    ),
    '',
    '## ' + copy.journeys,
    ...w.routes.map(
      (r) => '- ' + label(r.from) + ' → ' + label(r.to) + ' · ' + labels.route[r.mode] +
        ' · ' + (r.distanceKm == null ? '—' : kilometers(r.distanceKm)),
    ),
    '',
    '## ' + copy.requirements,
    ...(w.constraints ?? []).map(
      (c) =>
        '- ' +
        labels.strength[c.strength] +
        ' · ' +
        label(c.from) +
        ' ' +
        labels.relation[c.relation] +
        ' ' +
        label(c.to ?? '') +
        ' · ' +
        c.description,
    ),
  ].join('\n');
}
