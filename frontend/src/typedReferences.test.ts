import { expect, it } from 'vitest';
import fixture from '../../docs/examples/salt-census.json';
import * as validation from './validation';

function example() {
  const project: unknown = structuredClone(fixture);
  if (!validation.isProject(project)) throw new Error('Invalid example');
  return project;
}

it('checks declared state kinds and participant references on imported graphs without scenario metadata', () => {
  const project = example();
  const declared = { ...project, stateEntities: [{ id: 'seal', name: 'Seal', kind: 'item' as const }] };
  const node = declared.nodes[0]!;
  node.consequences = [{ kind: 'item', key: 'seal', value: 'held' }];
  expect(validation.isProject(declared)).toBe(true);
  node.consequences[0]!.kind = 'flag';
  expect(validation.isProject(declared)).toBe(false);
  node.consequences = [];
  declared.quests[0]!.factionIds = [declared.characters[0]!.id];
  expect(validation.isProject(declared)).toBe(false);
  declared.quests[0]!.factionIds = [];
  node.factionIds = ['nonexistent'];
  expect(validation.isProject(declared)).toBe(false);
});

it('preserves legacy state namespaces and promotes colliding IDs deterministically', () => {
  const project = example();
  const id = project.characters[0]!.id;
  project.edges[0]!.consequences = [
    { kind: 'item', key: id, value: 'yes' }, { kind: 'flag', key: 'shared', value: 'yes' },
    { kind: 'decision', key: 'shared', value: 'yes' }, { kind: 'flag', key: 'flag-shared', value: 'yes' },
  ];
  expect(validation.isProject(project)).toBe(true);
  expect(validation.effectiveStateEntities(project)).toHaveLength(4);
  expect(validation.preparedStateEntities(project).map(e => e.id)).toEqual([
    'decision-shared', 'flag-shared', 'flag-shared-2', `item-${id}`,
  ]);
  expect(project.edges[0]!.consequences[0]!.key).toBe(id);
});

it('locates wrong-type references in imported graph fields', () => {
  const project = example();
  project.edges[0]!.conditions = [{ kind: 'relationship', key: project.characters[0]!.id, value: 'hostile' }];
  expect(validation.scenarioReferencePath(project)).toBe('/edges/0/conditions/0/key');
  project.edges[0]!.conditions = [];
  project.quests[0]!.nodeId = project.nodes[0]!.id;
  expect(validation.scenarioReferencePath(project)).toBe('/quests/0/nodeId');
});
