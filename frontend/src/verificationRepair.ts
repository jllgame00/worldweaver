import { verificationMessages as v } from './verificationCopy';
import { advance, newId } from './project';
import type { Project, RepairEdit, ValidationFinding } from './project.generated';
export type { RepairEdit } from './project.generated';
import { resolvedWorld } from './atlasPlaces';
import { lengthKm } from './atlasSpatial';
import { isProject } from './validation';
import { rebuiltRoute } from './verificationRoute';
// Only existing scalar fields are writable. References and term types are checked on the complete draft.
function fields(p: Project, id: string) {
  const route = p.world?.routes.find((r) => r.id === id);
  if (route) return { row: route, domain: 'world' as const, keys: ['distanceKm'] };
  const constraint = p.world?.constraints;
  if (id === p.world?.id && constraint)
    return {
      row: { constraints: constraint },
      domain: 'world' as const,
      keys: constraint.flatMap((c, i) =>
        c.origin === 'owner'
          ? ['from', 'to', 'via'].filter((k) => Object.hasOwn(c, k)).map((k) => 'constraints.' + i + '.' + k)
          : [],
      ),
    };
  const narrative = p.narrative;
  if (narrative?.id === id)
    return {
      row: narrative.story,
      domain: 'narrative' as const,
      keys: ['premise', 'motivation', 'opposition', 'background', 'conflict'],
    };
  const character = p.characters.find((r) => r.id === id);
  if (character)
    return {
      row: character,
      domain: 'scenario' as const,
      keys: ['role', ...(character.factionId ? ['factionId'] : [])],
    };
  const faction = p.factions.find((r) => r.id === id);
  if (faction) return { row: faction, domain: 'scenario' as const, keys: ['aim'] };
  const node = p.nodes.find((r) => r.id === id),
    edge = p.edges.find((r) => r.id === id),
    quest = p.quests.find((r) => r.id === id);
  const row = node ?? edge ?? quest;
  if (!row) return;
  const scalar = node
    ? ['locationId', 'description', 'outcome']
    : edge
      ? ['from', 'to']
      : ['objective', 'outcome', 'description'];
  const keys = scalar.filter((k) => Object.hasOwn(row, k));
  for (const [field, value] of Object.entries(row)) {
    if (
      ['prerequisiteIds', 'requiresVisited', 'locationIds', 'characterIds', 'factionIds'].includes(field) &&
      Array.isArray(value)
    )
      value.forEach((_, i) => keys.push(field + '.' + i));
    if (['completion', 'failure', 'conditions', 'consequences'].includes(field) && Array.isArray(value))
      value.forEach((_, i) => keys.push(field + '.' + i + '.key', field + '.' + i + '.value'));
  }
  return { row, domain: 'scenario' as const, keys };
}

function slot(p: Project, id: string, field: string) {
  const record = fields(p, id);
  if (!record?.keys.includes(field)) throw Error(v.sourceEditor);
  const parts = field.split('.');
  const key = parts.pop()!;
  const parent = parts.reduce(
    (obj, k) => obj[k] as Record<string, unknown>,
    record.row as unknown as Record<string, unknown>,
  );
  return { domain: record.domain, parent, key };
}

export function repairFields(project: Project, finding: ValidationFinding) {
  const ids = new Set([...finding.entityIds, ...(finding.causeNodeId ? [finding.causeNodeId] : [])]);
  if (
    finding.rule.startsWith('world.') &&
    project.world?.constraints?.some(
      (c) => c.origin === 'owner' && [c.from, c.to, c.via].some((id) => id && ids.has(id)),
    )
  )
    ids.add(project.world.id);
  const options = [...ids].flatMap((id) => {
    const record = fields(project, id);
    return (record?.keys ?? []).map((field) => {
      const { parent, key } = slot(project, id, field);
      return { recordId: id, field, before: String(parent[key] ?? '') };
    });
  });
  const fix = routeCorrection(project, finding);
  if (fix?.field === 'corridor')
    options.unshift({ recordId: fix.recordId, field: fix.field, before: fix.before });
  return options;
}

export function routeCorrection(p: Project, finding: ValidationFinding): RepairEdit | undefined {
  if (!finding.rule.endsWith('route_geometry')) return;
  const world = resolvedWorld(p),
    route = world?.routes.find((row) => finding.entityIds.includes(row.id));
  const a = world?.locations.find((row) => row.id === route?.from),
    b = world?.locations.find((row) => row.id === route?.to);
  if (!world || !route || !a || !b) return;
  const corrected = rebuiltRoute(p, route.id);
  if (!corrected) return;
  const distanceOnly =
    JSON.stringify(route.path) === JSON.stringify(corrected.path) &&
    JSON.stringify(route.crossings ?? []) === JSON.stringify(corrected.crossings ?? []);
  return {
    proposalId: newId('repair'),
    findingId: finding.id,
    recordId: route.id,
    field: distanceOnly ? 'distanceKm' : 'corridor',
    before: distanceOnly ? String(route.distanceKm ?? '') : JSON.stringify(route),
    after: distanceOnly ? String(lengthKm(world, route.path, a, b)) : JSON.stringify(corrected),
    requires: [],
  };
}

export function repairDraft(project: Project, changes: RepairEdit[], revision: number): Project {
  if (project.revision !== revision) throw Error(v.changedRevision);
  if (!changes.length || changes.length > 12) throw Error(v.selectChanges);
  const selected = new Set(changes.map((change) => change.proposalId));
  if (selected.size !== changes.length || changes.some((c) => c.requires.some((id) => !selected.has(id))))
    throw Error(v.dependentChanges);
  const draft = structuredClone(project);
  const domains = new Set<keyof Project['versions']>();
  const seen = new Set<string>();
  for (const change of changes) {
    if (change.field === 'corridor') {
      const world = draft.world,
        idx = world?.routes.findIndex((r) => r.id === change.recordId) ?? -1;
      const restored = rebuiltRoute(draft, change.recordId);
      if (
        !world ||
        !restored ||
        idx < 0 ||
        JSON.stringify(world.routes[idx]) !== change.before ||
        JSON.stringify(restored) !== change.after
      )
        throw Error(v.routeChanged);
      world.routes[idx] = restored;
      domains.add('world');
      continue;
    }
    const { parent, key, domain } = slot(draft, change.recordId, change.field);
    const address = change.recordId + '/' + change.field;
    if (seen.has(address) || String(parent[key] ?? '') !== change.before) throw Error(v.overlap);
    seen.add(address);
    if (!change.after.trim() || change.before === change.after) throw Error(v.differentValue);
    if (change.field === 'distanceKm' && (!Number.isFinite(Number(change.after)) || Number(change.after) < 0))
      throw Error(v.invalidDistance);
    parent[key] = change.field === 'distanceKm' ? Number(change.after) : change.after;
    domains.add(domain);
  }
  if (domains.has('world') && draft.world) draft.world.approved = false;
  if (domains.has('scenario') && draft.scenario) draft.scenario.approved = false;
  if (domains.has('narrative') && draft.narrative) draft.narrative.approved = false;
  const next = advance(draft, [...domains]);
  if (!isProject(next)) throw Error(v.invalidDraft);
  return next;
}
