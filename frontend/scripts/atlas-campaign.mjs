import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const kinds = [
  'base',
  'river',
  'near',
  'mountain-port',
  'boundary',
  'aqueduct',
  'advisory',
  'contradiction',
  'locked-ocean',
  'combined',
];
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rule = (relation, from, to, via) => ({
  relation,
  from,
  ...(to && { to }),
  ...(via && { via }),
  origin: 'owner',
  strength: 'hard',
  description: 'Synthetic campaign constraint',
});

function inputs(index, defaults, project) {
  const kind = kinds[index % kinds.length],
    group = Math.floor(index / kinds.length);
  const settings = {
    ...defaults,
    size: (group + index) % 2 ? 'standard' : 'small',
    kmPerCell: [0.1, 1, 5, 25, 50, 100][group],
    land: [35, 45, 55, 65, 70, 75][group],
    climate: ['temperate', 'cold', 'arid'][(group + index) % 3],
    ruggedness: (group + index) % 4,
    roads: (group + 2 * index) % 4,
    settlements: (group + index + 1) % 4,
    politics: (group + index + 2) % 4,
  };
  const custom = [];
  const gate = project.world.locations.find((l) => l.id === 'l-gate');
  const beacon = project.world.locations.find((l) => l.id === 'l-beacon');
  switch (kind) {
    case 'river':
      custom.push(rule('river', 'l-gate'));
      break;
    case 'near':
      custom.push(rule('near', 'l-hall', 'l-beacon'));
      break;
    case 'mountain-port':
      gate.kind = 'port';
      beacon.preference = 'mountain';
      custom.push(rule('travel', gate.id, beacon.id));
      break;
    case 'boundary':
      custom.push(rule('inside', beacon.id, 'atlas-region-1'), rule('outside', 'l-hall', 'atlas-region-1'));
      break;
    case 'aqueduct':
      custom.push(rule('aqueduct', gate.id, beacon.id));
      break;
    case 'advisory':
      custom.push({ ...rule('river', gate.id, 'unknown-river'), strength: 'soft' });
      break;
    case 'contradiction':
      custom.push(rule('inside', beacon.id, 'atlas-region-1'), rule('outside', beacon.id, 'atlas-region-1'));
      break;
    case 'locked-ocean':
      beacon.position = [0, 0];
      beacon.locked = true;
      break;
    case 'combined':
      custom.push(
        rule('river', gate.id),
        rule('near', 'l-hall', beacon.id),
        rule('separates', 'l-hall', beacon.id, gate.id),
      );
      break;
  }
  const expected =
    kind === 'combined'
      ? 'uncertain'
      : ['contradiction', 'locked-ocean'].includes(kind)
        ? 'impossible'
        : 'feasible';
  return { seed: 74001 + 97 * index, kind, expected, settings, custom };
}

async function measure(reverse) {
  const vite = await createServer({
    root,
    configFile: false,
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const { approvedProject } = await vite.ssrLoadModule('/src/atlasFixture.testdata.ts');
    const { generateAtlas, worldIssues, defaults } = await vite.ssrLoadModule('/src/atlasWorkflow.ts');
    const { spatialIssues } = await vite.ssrLoadModule('/src/atlasSpatial.ts');
    const rows = [];
    for (let i = 0; i < 60; i++) {
      const p = approvedProject();
      const { seed, kind, expected, settings, custom } = inputs(i, defaults, p);
      if (reverse) {
        p.edges.reverse();
        p.world.locations.reverse();
        p.scenario.locations.reverse();
        custom.reverse();
      }
      const original = digest(p);
      const t = performance.now();
      const w = await generateAtlas(p, 'Campaign', seed, settings, custom);
      const generated = performance.now();
      const issues = worldIssues(p, w);
      const validated = performance.now();
      assert.equal(digest(p), original, 'A proposal mutated its source');
      const errors = issues.filter((f) => f.severity === 'error');
      const codes = [...new Set(errors.map((f) => f.code))];
      const required = new Set([...p.world.locations, ...p.scenario.locations].map((l) => l.id));
      const covered = [...required].filter((id) =>
        w.locations.some(
          (l) =>
            l.id === id &&
            l.position &&
            !errors.some((f) => f.code.startsWith('location_') && f.ids.includes(id)),
        ),
      ).length;
      const hard = w.constraints.filter((c) => c.strength === 'hard');
      const journey = hard.filter((c) => c.relation === 'travel');
      // Check each demand on its own; counting by error IDs confuses several demands on the same pair.
      const passed = new Set(
        hard.filter(
          (c) =>
            !spatialIssues(w, [c]).some((f) => f.severity === 'error' && /^constraint_|^journey_/.test(f.code)),
        ),
      );
      const knownError =
        kind === 'locked-ocean'
          ? codes.includes('location_position')
          : codes.includes('constraint_inside') || codes.includes('constraint_outside');
      const matches =
        expected === 'uncertain' ||
        (expected === 'impossible'
          ? knownError
          : !errors.length &&
            covered === required.size &&
            hard.length === passed.size &&
            (kind !== 'advisory' ||
              issues.some((f) => f.code === 'constraint_reference' && f.severity === 'warning')));
      rows.push({
        i,
        seed,
        kind,
        expected,
        settings,
        sites: w.locations.length,
        routes: w.routes.length,
        covered,
        required: required.size,
        hardMet: passed.size,
        hard: hard.length,
        travelMet: journey.filter((c) => passed.has(c)).length,
        travel: journey.length,
        sizeBytes: Buffer.byteLength(JSON.stringify(w)),
        generateMs: generated - t,
        validateMs: validated - generated,
        elapsedMs: validated - t,
        hash: digest(w),
        codes,
        warnings: [...new Set(issues.filter((f) => f.severity === 'warning').map((f) => f.code))],
        matches,
      });
    }
    return rows;
  } finally {
    await vite.close();
  }
}

if (['forward', 'reverse'].includes(process.argv[2])) {
  console.log(JSON.stringify(await measure(process.argv[2] === 'reverse')));
} else {
  assert.equal(
    process.argv[2],
    'compare',
    'Use forward or reverse, then compare <forward.json> <reverse.json>.',
  );
  const read = (path) => JSON.parse(readFileSync(path, 'utf8').trimStart());
  const first = read(process.argv[3]),
    replay = read(process.argv[4]);
  assert.equal(first.length, 60);
  assert.equal(replay.length, 60);
  const rows = first.map((r, i) => ({ ...r, replay: r.hash === replay[i].hash }));
  function times(key) {
    const ms = rows.map((r) => r[key]).sort((a, b) => a - b);
    return {
      p50: ms[Math.ceil(ms.length * 0.5) - 1],
      p95: ms[Math.ceil(ms.length * 0.95) - 1],
      max: ms.at(-1),
    };
  }
  console.log(
    JSON.stringify({
      node: process.version,
      platform: process.platform,
      processor: cpus()[0]?.model,
      generationMs: times('generateMs'),
      validationMs: times('validateMs'),
      endToEndMs: times('elapsedMs'),
      rows,
    }),
  );
  assert.ok(
    rows.every((r) => r.matches && r.replay),
    'Unexpected classifications or replay mismatches in campaign rows',
  );
}
