import { advance } from './project';
import type { Project } from './project.generated';
import { isProject, effectiveStateEntities } from './validation';
import { buildWorldBible, type BibleEntity, type BibleIndex } from './worldBibleIndex';
import { bibleCopy as t } from './worldBibleCopy';

type Stage = keyof Project['versions'];
type Field = 'name' | 'description' | 'factionId';
export interface BibleField {
  key: Field;
  label: string;
  value: string;
  optional?: boolean;
}
export type BibleValues = Record<Field, string>;

export function editFields(p: Project, e: BibleEntity): BibleField[] {
  const name = { key: 'name' as const, label: t.name, value: e.label };
  const detail = (label: string, optional = false): BibleField => ({
    key: 'description',
    label,
    value: e.description,
    optional,
  });
  const faction = (label: string, value = ''): BibleField => ({
    key: 'factionId',
    label,
    value,
    optional: true,
  });
  if (e.kind === 'fact') return [{ ...name, label: t.statement }];
  if (e.source === 'content') return [{ ...name, label: t.text }];
  switch (e.kind) {
    case 'character':
      return [name, detail(t.role), faction(t.faction, p.characters.find((x) => x.id === e.id)?.factionId)];
    case 'faction':
      return [name, detail(t.aim)];
    case 'item':
    case 'flag':
    case 'decision':
      return [name];
    case 'region':
      return [
        name,
        detail(t.description, true),
        faction(t.controller, p.world?.regions.find((x) => x.id === e.id)?.controllerId),
      ];
    case 'location':
      return [name, detail(t.description, !p.scenario?.locations.some((l) => l.id === e.id))];
    case 'quest':
      return [
        { ...name, value: p.quests.find((q) => q.id === e.id)?.title ?? '', optional: true },
        detail(t.objective),
      ];
    case 'territory':
      return [name];
    default:
      return [];
  }
}

export function editStages(p: Project, e: BibleEntity): Stage[] {
  if (e.source === 'content') return ['content'];
  if (e.kind === 'location' && p.scenario?.locations.some((l) => l.id === e.id)) return ['scenario'];
  return e.source === 'atlas' ? ['world'] : ['scenario'];
}

export function deleteProtected(p: Project, index: BibleIndex, id: string) {
  return (
    index.links.some((l) => l.to === id) ||
    [...(p.scenario?.geography ?? []), ...(p.world?.constraints ?? [])].some((c) =>
      [c.from, c.to, c.via].includes(id),
    ) ||
    p.world?.placements?.some((l) => l.locationId === id) ||
    p.world?.locations.some((l) => l.id === id && l.locked)
  );
}

export function changeBibleRecord(
  p: Project,
  id: string,
  values: BibleValues | null,
  directFactEdit = false,
): Project {
  const index = buildWorldBible(p),
    e = index.entities.get(id);
  if (!e || !editFields(p, e).length) throw Error(t.invalid);
  if (e.kind === 'fact' && (!directFactEdit || !values)) throw Error(t.directOnly);
  if (!values && deleteProtected(p, index, id)) throw Error(t.protected);
  const fields = editFields(p, e);
  if (values && fields.some((f) => !f.optional && !values[f.key].trim())) throw Error(t.invalid);
  if (values && fields.every((f) => f.value === values[f.key].trim())) throw Error(t.noChange);
  const name = values?.name.trim() ?? '',
    description = values?.description.trim() ?? '',
    factionId = values?.factionId ?? '';
  if (
    values &&
    name !== e.label &&
    e.source !== 'content' &&
    name &&
    [...index.entities.values()].some(
      (x) =>
        x.id !== id &&
        x.kind === e.kind &&
        x.source !== 'content' &&
        x.label.trim().normalize('NFC').toLowerCase() === name.normalize('NFC').toLowerCase(),
    )
  )
    throw Error(t.duplicate);
  const draft = structuredClone(p);
  function update<T extends { id: string }>(items: T[], edit: (item: T) => void): T[] {
    if (!values) return items.filter((item) => item.id !== id);
    const row = items.find((item) => item.id === id);
    if (!row) throw Error(t.invalid);
    edit(row);
    return items;
  }
  if (e.kind === 'fact')
    draft.canonicalFacts = update(draft.canonicalFacts, (row) => {
      row.statement = name;
    });
  else if (e.source === 'content')
    draft.userContent = update(draft.userContent, (row) => {
      row.text = name;
    });
  else
    switch (e.kind) {
      case 'character':
        draft.characters = update(draft.characters, (row) => {
          row.name = name;
          row.role = description;
          if (factionId) row.factionId = factionId;
          else delete row.factionId;
        });
        break;
      case 'faction':
        draft.factions = update(draft.factions, (row) => {
          row.name = name;
          row.aim = description;
        });
        break;
      case 'item':
      case 'flag':
      case 'decision':
        draft.stateEntities = update(effectiveStateEntities(draft), (row) => {
          row.name = name;
        });
        break;
      case 'region':
        draft.world!.regions = update(draft.world!.regions, (row) => {
          row.name = name;
          if (description) row.description = description;
          else delete row.description;
          if (factionId) row.controllerId = factionId;
          else delete row.controllerId;
        });
        break;
      case 'location': {
        if (draft.scenario?.locations.some((l) => l.id === id)) {
          draft.scenario.locations = update(draft.scenario.locations, (row) => {
            const placement = draft.world?.placements?.find((l) => l.locationId === id);
            if (name !== e.label) {
              row.name = name;
              if (placement) delete placement.label;
            }
            if (description !== e.description) {
              row.purpose = description;
              if (placement) delete placement.description;
            }
          });
        } else
          draft.world!.locations = update(draft.world!.locations, (row) => {
            row.name = name;
            if (description) row.description = description;
            else delete row.description;
          });
        break;
      }
      case 'quest':
        draft.quests = update(draft.quests, (row) => {
          if (name) row.title = name;
          else delete row.title;
          row.objective = description;
        });
        break;
      case 'territory':
        draft.world!.territories = update(draft.world!.territories ?? [], (row) => {
          row.name = name;
        });
        break;
      default:
        throw Error(t.invalid);
    }
  const stages = editStages(p, e),
    next = advance(draft, stages);
  if (stages.includes('scenario') && next.scenario) next.scenario.approved = false;
  if (stages.includes('world') && next.world) next.world.approved = false;
  if (!isProject(next)) throw Error(!p.stateEntities && draft.stateEntities ? t.legacy : t.invalid);
  return next;
}
