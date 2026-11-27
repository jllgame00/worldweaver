import { expect, it } from 'vitest';
import { approvedProject } from './atlasFixture.testdata';
import { atlasPlaces } from './atlasPlaces';
import { scenarioMarkdown } from './scenarioWorkflow';
import { links } from './atlasWorkflow';

it('uses the cartographic name of a scenario declaration in story exports while keeping the original narrative purpose', () => {
  const p = approvedProject(),
    site = p.scenario!.locations[0]!;
  p.world!.placements = [{ locationId: site.id, label: '새 기록실', position: [2, 2] }];
  p.nodes[0]!.locationId = p.nodes[1]!.locationId = site.id;
  p.quests[0]!.locationIds = [site.id];
  expect(atlasPlaces(p).filter((l) => l.id === site.id)).toHaveLength(1);
  expect(links(p, site.id).nodes.map((n) => n.id)).toEqual([p.nodes[0]!.id, p.nodes[1]!.id]);
  expect(links(p, site.id).quests).toHaveLength(1);
  expect(scenarioMarkdown(p)).toContain('Location · 새 기록실');
  expect(site.name).toBe('지하 기록실');
});
