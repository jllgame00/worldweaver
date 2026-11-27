import { expect, it } from 'vitest';
import { approvedProject } from './atlasFixture.testdata';
import { atlasMarkdown, defaults, generateAtlas, worldIssues } from './atlasWorkflow';

it('allocates a distinct provisional ID when a terrain ID already belongs to the story', async () => {
  const p = approvedProject();
  p.factions.push({ id: 'atlas-region-1', name: 'River parliament', aim: 'Maintain the harbor' });
  const w = await generateAtlas(p, 'Estuary', 34, defaults, []);
  expect(worldIssues(p, w).filter((i) => i.code === 'duplicate_id')).toEqual([]);
  expect(w.regions.find((r) => r.id === 'atlas-region-1')).toBeUndefined();
  expect(w.locations.every((l) => w.regions.some((r) => r.id === l.regionId))).toBe(true);
});
it('rejects an oversized geographical plan before computing the terrain', async () => {
  const p = approvedProject();
  const plan = Array.from({ length: 130 }, (_, i) => ({
    relation: 'near' as const,
    from: 'vault',
    to: 'l-gate',
    strength: 'soft' as const,
    origin: 'owner' as const,
    description: 'Review ' + i,
  }));
  await expect(generateAtlas(p, 'Estuary', 12, defaults, plan)).rejects.toThrow(/128/);
});
it('keeps vertical tunnel depth independent of horizontal scale and describes the generated regions', async () => {
  const p = approvedProject();
  const w = await generateAtlas(p, '기록실', 42, { ...defaults, kmPerCell: 50 }, [
    {
      from: 'vault',
      to: 'l-mill',
      relation: 'travel',
      origin: 'owner',
      strength: 'hard',
      description: '계단을 내려간다.',
    },
  ]);
  const descent = w.routes.find((r) => [r.to, r.from].includes('vault') && [r.to, r.from].includes('l-mill'));
  expect(descent?.distanceKm).toBe(0.05);
  expect(w.regions.every((r) => !!r.description)).toBe(true);
  expect(atlasMarkdown(w)).toContain('## Terrain and drainage');
  expect(atlasMarkdown(w)).toContain(w.features.find((f) => f.kind === 'river')!.name);
});
