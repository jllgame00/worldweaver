import { atlasPlaces, journeyRoutes } from './atlasPlaces';
import type { Project, StateTerm, UserContent } from './project.generated';
import { effectiveStateEntities, entities as canonicalEntities } from './validation';

export type BibleSource = 'content' | 'narrative' | 'scenario' | 'atlas';
export type BibleKind =
  | UserContent['category']
  | 'fragment'
  | 'fact'
  | 'candidate'
  | 'narrative'
  | 'scenario'
  | 'decision'
  | 'flag'
  | 'chapter'
  | 'node'
  | 'edge'
  | 'quest'
  | 'endingRecord'
  | 'world'
  | 'region'
  | 'feature'
  | 'territory'
  | 'route';
export interface BibleEntity {
  id: string;
  kind: BibleKind;
  label: string;
  description: string;
  source: BibleSource;
}
export interface BibleLink {
  from: string;
  to: string;
  kind: string;
  stored: boolean;
}
export interface BibleIndex {
  entities: Map<string, BibleEntity>;
  links: BibleLink[];
  ambiguousStateIds: string[];
}

export function buildWorldBible(p: Project): BibleIndex {
  const entities = new Map<string, BibleEntity>(),
    links: BibleLink[] = [];
  const seen = new Set<string>();
  const states = effectiveStateEntities(p);
  const ambiguousStateIds = new Set<string>();
  if (!p.stateEntities) {
    const occupied = new Set(canonicalEntities(p).map((r) => r.id));
    for (const s of states) {
      if (occupied.has(s.id)) ambiguousStateIds.add(s.id);
      occupied.add(s.id);
    }
  }
  function add(id: string, kind: BibleKind, label: string, description: string, source: BibleSource) {
    entities.set(id, { id, kind, label, description, source });
  }
  function link(from: string, to: string | undefined, kind: string, stored = true) {
    if (!to) return;
    const key = JSON.stringify([from, to, kind, stored]);
    if (!seen.has(key)) {
      links.push({ from, to, kind, stored });
      seen.add(key);
    }
  }
  function many(id: string, ids: string[] | undefined, kind: string) {
    ids?.forEach((to) => link(id, to, kind));
  }
  function terms(id: string, values: StateTerm[] | undefined, kind: string) {
    for (const t of values ?? []) {
      if (['item', 'decision', 'flag'].includes(t.kind) && ambiguousStateIds.has(t.key)) continue;
      link(id, t.key, kind);
    }
  }
  const { scenario, world, narrative } = p;
  for (const t of p.userContent) add(t.id, t.category, t.text, t.treatment, 'content');
  for (const f of p.canonicalFacts) {
    add(f.id, 'fact', f.statement, '', 'content');
    link(f.id, f.sourceContentId, 'Source fragment');
  }
  for (const c of p.storyCandidates) {
    add(c.id, 'candidate', c.story.title, c.story.premise, 'narrative');
    for (const e of c.coverage) link(c.id, e.contentId, 'Coverage');
  }
  if (narrative) {
    add(narrative.id, 'narrative', narrative.story.title, narrative.story.premise, 'narrative');
    link(narrative.id, narrative.sourceCandidateId, 'Selected direction');
  }
  for (const f of p.factions) add(f.id, 'faction', f.name, f.aim, 'narrative');
  for (const c of p.characters) {
    add(c.id, 'character', c.name, c.role, 'narrative');
    link(c.id, c.factionId, 'Faction membership');
  }
  for (const t of states) {
    if (!ambiguousStateIds.has(t.id)) add(t.id, t.kind, t.name, '', 'narrative');
  }
  if (scenario) {
    add(scenario.id, 'scenario', scenario.title, scenario.summary, 'scenario');
    link(scenario.id, scenario.sourceNarrativeId, 'Source narrative');
    many(scenario.id, scenario.factIds, 'Cited fact');
    many(scenario.id, scenario.contentIds, 'Cited fragment');
    for (const c of scenario.chapters) {
      add(c.id, 'chapter', c.title, c.summary, 'scenario');
      link(c.id, scenario.id, 'Scenario chapter', false);
    }
  }
  const places = atlasPlaces(p);
  for (const l of places) {
    add(l.id, 'location', l.name, l.description ?? '', world ? 'atlas' : 'scenario');
    link(l.id, l.regionId, 'Located in region');
    many(l.id, l.factionIds, 'Faction presence');
  }
  const nodeMap = new Map(p.nodes.map((n) => [n.id, n]));
  const path = journeyRoutes(world?.routes ?? []);
  for (const n of p.nodes) {
    add(n.id, 'node', n.title, n.description, 'scenario');
    link(n.id, n.chapterId, 'Chapter');
    link(n.id, n.locationId, 'Event location');
    many(n.id, n.characterIds, 'Participants');
    many(n.id, n.factionIds, 'Participating factions');
    many(n.id, n.requiresVisited, 'Required visit');
    terms(n.id, n.conditions, 'Condition');
    terms(n.id, n.consequences, 'Effect');
  }
  for (const e of p.edges) {
    add(e.id, 'edge', e.label, e.kind ?? 'progression', 'scenario');
    link(e.id, e.from, 'Source node');
    link(e.id, e.to, 'Destination node');
    if (e.kind !== 'reference') link(e.to, e.id, 'Incoming branch', false);
    many(e.id, e.requiresVisited, 'Required visit');
    terms(e.id, e.conditions, 'Condition');
    terms(e.id, e.consequences, 'Effect');
    const from = nodeMap.get(e.from)?.locationId,
      to = nodeMap.get(e.to)?.locationId;
    if (e.kind !== 'reference' && e.travel === 'required' && from && to && from !== to) {
      for (const route of path(from, to)) link(e.id, route, 'Travel path', false);
    }
  }
  for (const q of p.quests) {
    add(q.id, 'quest', q.title ?? q.objective, q.objective, 'scenario');
    link(q.id, q.nodeId, 'Quest node');
    link(q.nodeId, q.id, 'Quest encounter', false);
    many(q.id, q.characterIds, 'Participants');
    many(q.id, q.factionIds, 'Participating factions');
    many(q.id, q.locationIds, 'Quest location');
    many(q.id, q.prerequisiteIds, 'Prerequisite quest');
    terms(q.id, q.completion, 'Completion condition');
    terms(q.id, q.failure, 'Failure condition');
  }
  for (const e of p.endings) {
    add(e.id, 'endingRecord', nodeMap.get(e.nodeId)?.title ?? e.id, e.consequence, 'scenario');
    link(e.id, e.nodeId, 'Ending node');
  }
  if (world) {
    add(world.id, 'world', world.name ?? 'World Atlas', world.generatorVersion, 'atlas');
    link(world.id, world.sourceScenarioId, 'Source scenario');
    link(world.id, world.sourceNarrativeId, 'Source narrative');
    for (const r of world.regions) {
      add(r.id, 'region', r.name, r.description ?? '', 'atlas');
      link(r.id, r.controllerId, 'Controlling faction');
    }
    for (const t of world.territories ?? []) {
      add(t.id, 'territory', t.name, '', 'atlas');
      many(t.id, t.regionIds, 'Member region');
      many(t.id, t.factionIds, 'Territorial faction');
    }
    for (const f of world.features) add(f.id, 'feature', f.name, f.kind, 'atlas');
    const names = new Map(places.map((l) => [l.id, l.name]));
    for (const r of world.routes) {
      add(r.id, 'route', (names.get(r.from) ?? r.from) + ' → ' + (names.get(r.to) ?? r.to), r.mode, 'atlas');
      link(r.id, r.from, 'Route origin');
      link(r.id, r.to, 'Route destination');
    }
  }
  for (const c of [...(scenario?.geography ?? []), ...(world?.constraints ?? [])]) {
    link(c.from, c.to, 'Geography · ' + c.relation);
    link(c.from, c.via, 'Geography · via');
  }
  return { entities, links, ambiguousStateIds: [...ambiguousStateIds] };
}

export function dependencyImpact(index: BibleIndex, id: string) {
  const owners = new Map<string, Set<string>>();
  for (const l of index.links) {
    if (!owners.has(l.to)) owners.set(l.to, new Set());
    owners.get(l.to)!.add(l.from);
  }
  const direct = [...(owners.get(id) ?? [])].filter((owner) => owner !== id);
  const queue = [...direct],
    seen = new Set([id, ...direct]);
  for (let i = 0; i < queue.length; i++) {
    for (const owner of owners.get(queue[i]!) ?? []) {
      if (!seen.has(owner)) {
        seen.add(owner);
        queue.push(owner);
      }
    }
  }
  // A chapter summarizes its impacted scenes. That context does not invalidate its sibling scenes.
  const affected = new Set([id, ...queue]),
    nested = new Set(queue.slice(direct.length));
  for (const l of index.links) {
    if (l.kind === 'Chapter' && l.to !== id && affected.has(l.from) && !direct.includes(l.to))
      nested.add(l.to);
  }
  return { direct, transitive: [...nested] };
}
