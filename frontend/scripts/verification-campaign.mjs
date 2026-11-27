import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { verificationCases } from './verification-cases.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const request = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  assert.equal(url, '/api/scenario/validate?verification=true');
  return request('http://127.0.0.1:8794' + url, init);
};
const vite = await createServer({
  root: join(root, 'frontend'),
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});
const hash = (value) => createHash('sha256').update(value).digest('hex');
try {
  const { approvedProject } = await vite.ssrLoadModule('/src/atlasFixture.testdata.ts');
  const { acceptAtlas, defaults, generateAtlas } = await vite.ssrLoadModule('/src/atlasWorkflow.ts');
  const { runVerification } = await vite.ssrLoadModule('/src/verificationEngine.ts');
  const { repairDraft, routeCorrection } = await vite.ssrLoadModule('/src/verificationRepair.ts');
  const legacy = JSON.parse(readFileSync(join(root, 'docs/examples/salt-census.json'), 'utf8'));
  const source = approvedProject();
  const fixture = acceptAtlas(
    source,
    await generateAtlas(source, 'Estuary', 42, defaults, []),
    source.revision,
    true,
  );
  if (process.argv.includes('--demo') || process.argv.includes('--demo-only')) {
    const { isProject } = await vite.ssrLoadModule('/src/validation.ts');
    const demo = structuredClone(fixture);
    demo.world.routes[0].distanceKm += 10;
    assert.ok(isProject(demo));
    mkdirSync(join(root, '.scratch'), { recursive: true });
    const destination = join(root, '.scratch', 'phase4-synthetic-route-repair.json');
    try {
      writeFileSync(destination, JSON.stringify(demo, null, 2), { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  if (!process.argv.includes('--demo-only')) {
    const cases = [...verificationCases];
    const [file, repairedFile] = process.argv.slice(2).filter((arg) => arg !== '--demo');
    const ownerFiles = new Map();
    if (file) {
      ownerFiles.set(file, hash(readFileSync(file)));
      cases.push({
        name: 'Owner diagnostic copy',
        expected: ['scenario.blocked_start'],
        base: 'owner',
        mutate: () => {},
        allowed: [
          'sources.narrative',
          'sources.scenario',
          'sources.world',
          'scenario.ending_unreachable',
          'scenario.mandatory_unreachable',
          'scenario.no_reachable_ending',
        ],
        endings: 0,
        inspect: 'prologue',
      });
    }
    if (repairedFile) {
      ownerFiles.set(repairedFile, hash(readFileSync(repairedFile)));
      cases.push({
        name: 'Owner locally edited diagnostic copy',
        expected: [],
        base: 'edited',
        mutate: () => {},
        status: 'unresolved',
        endings: 3,
      });
    }
    let failures = 0;
    for (const c of cases) {
      const p =
        c.base === 'owner' || c.base === 'edited'
          ? JSON.parse(readFileSync(c.base === 'owner' ? file : repairedFile, 'utf8'))
          : structuredClone(c.base === 'legacy' ? legacy : fixture);
      c.mutate(p);
      const before = hash(JSON.stringify(p)),
        controller = new AbortController();
      let current = true;
      const r = await runVerification(p, {
        mode: c.mode ?? 'full',
        targetId: c.targetId,
        signal: controller.signal,
        isCurrent: () => current,
        onTool: (receipt) => {
          if (receipt.tool !== 'schema') return;
          if (c.interrupt === 'cancelled') controller.abort();
          if (c.interrupt === 'stale') current = false;
        },
      });
      const actual = [...new Set(r.findings.filter((f) => f.severity === 'error').map((f) => f.rule))].sort();
      const unexpected = actual.filter((rule) => ![...c.expected, ...(c.allowed ?? [])].includes(rule));
      const missed = c.expected.filter((rule) => !actual.includes(rule));
      const expectedStatus = c.status ?? (c.expected.length ? 'unresolved' : 'verified');
      let repair = '—';
      if (c.repair === 'distance') {
        const finding = r.findings.find((f) => f.rule === 'world.route_geometry');
        const fix = routeCorrection(p, finding);
        assert.ok(fix);
        const draft = repairDraft(p, [fix], p.revision);
        const recheck = await runVerification(draft, { mode: 'full' });
        assert.deepEqual(
          recheck.findings.filter((f) => f.severity === 'error'),
          [],
        );
        assert.equal(recheck.tools.find((t) => t.tool === 'sources').status, 'incomplete');
        assert.deepEqual(draft.canonicalFacts, p.canonicalFacts);
        repair = 'corrected; atlas review due';
      } else if (c.repair) {
        const proposal = {
          proposalId: 'repair-test',
          findingId: 'finding-test',
          recordId: p.canonicalFacts[0].id,
          field: 'statement',
          before: p.canonicalFacts[0].statement,
          after: 'Replacement',
          requires: [],
        };
        assert.throws(
          () => repairDraft(p, [proposal], p.revision - (c.repair === 'stale' ? 1 : 0)),
          c.repair === 'stale' ? /revision changed/ : /source editor/,
        );
        repair = 'rejected; source preserved';
      }
      if (c.inspect === 'prologue') {
        const issue = r.findings.find((f) => f.rule === 'scenario.blocked_start');
        const start = p.nodes.find((n) => n.kind === 'prologue');
        assert.ok(issue?.explanation.includes(start.title));
        assert.equal(issue.blockedTransitions.length, 2);
        assert.ok(
          issue.blockedTransitions.every(
            (b) =>
              b.actual === null &&
              b.required === 'visited' &&
              issue.explanation.includes(p.nodes.find((n) => n.id === b.key)?.title),
          ),
        );
      }
      const unchanged = hash(JSON.stringify(p)) === before;
      const success =
        unchanged &&
        !missed.length &&
        !unexpected.length &&
        r.run.status === expectedStatus &&
        (c.endings === undefined || r.paths.length === c.endings);
      if (!success) failures++;
      console.log(
        JSON.stringify({
          name: c.name,
          expected: c.expected,
          allowed: c.allowed ?? [],
          actual,
          unexpected,
          missed,
          warnings: [...new Set(r.findings.filter((f) => f.severity === 'warning').map((f) => f.rule))],
          expectedStatus,
          status: r.run.status,
          ms: r.run.durationMs,
          tools: r.tools.map((t) => [t.tool, t.status]),
          states: r.statesExplored,
          endings: r.paths.length,
          repair,
          unchanged,
          success,
        }),
      );
    }
    for (const [path, original] of ownerFiles) assert.equal(hash(readFileSync(path)), original);
    if (failures) process.exitCode = 1;
  }
} finally {
  await vite.close();
}
