import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import App from './App';
import { createProject } from './project';
import { saveProject, listProjects } from './storage';
import { approvedProject } from './atlasFixture.testdata';
import { acceptAtlas, defaults, generateAtlas } from './atlasWorkflow';

it('runs a credential-free Quick Check from workspace navigation and reopens its evidence', async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn(async () =>
    Response.json({ available: false, mode: 'mock', provider: 'mock', model: 'offline' }),
  );
  vi.stubGlobal('fetch', fetcher);
  await saveProject('verify-workspace', createProject('Offline evidence'));
  render(<App databaseName="verify-workspace" />);
  await user.click(await screen.findByRole('button', { name: /open/i }));
  await user.click(await screen.findByRole('button', { name: 'Verification Agent' }));
  await user.click(screen.getByRole('button', { name: 'Run Quick Check' }));
  await waitFor(async () =>
    expect((await listProjects('verify-workspace')).projects[0]?.project.runs.at(-1)?.stage).toBe('verify'),
  );
  expect(screen.getByText('Export report Markdown')).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'World Bible' }));
  await user.click(screen.getByRole('button', { name: 'Verification Agent' }));
  expect(await screen.findByText('Export findings JSON')).toBeEnabled();
  expect(fetcher.mock.calls.every((args) => (args as unknown[])[0] === '/api/generation')).toBe(true);
});

it('keeps a rejected distance correction and its source, then accepts a fresh simulation as one save', async () => {
  const user = userEvent.setup();
  const input = approvedProject();
  const p = acceptAtlas(
    input,
    await generateAtlas(input, 'River reach', 17, defaults, []),
    input.revision,
    true,
  );
  const route = p.world!.routes[0]!,
    length = route.distanceKm!;
  route.distanceKm = length + 20;
  const db = 'repair-workspace';
  await saveProject(db, p);
  const endpoints: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    endpoints.push(url);
    if (url === '/api/generation')
      return Response.json({ mode: 'mock', model: 'offline', available: false, provider: 'mock' });
    if (!url.startsWith('/api/scenario/validate')) throw Error('Unexpected provider request');
    return Response.json({
      valid: true,
      complete: true,
      statesExplored: 6,
      findings: [],
      feasibleEdgeIds: p.edges.map((e) => e.id),
      paths: p.endings.map((e) => ({
        endingId: e.id,
        nodeIds: ['n-start', 'n-gate', 'n-witness', 'n-choose', e.nodeId],
      })),
    });
  });
  const downloaded = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(downloaded);
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL() {
        return 'blob:recover';
      }
      static revokeObjectURL() {}
    },
  );
  render(<App databaseName={db} />);
  await user.click(await screen.findByRole('button', { name: /^open /i }));
  await user.click(await screen.findByRole('button', { name: 'Verification Agent' }));
  await user.click(screen.getByRole('button', { name: 'Run Quick Check' }));
  const finding = () =>
    screen.getByText(/route distance differs/i, { selector: 'strong' }).closest('article')!;
  await screen.findByText(/route distance differs/i, { selector: 'strong' });
  await user.click(within(finding()).getByRole('button', { name: 'Prepare repair' }));
  await user.click(screen.getByRole('button', { name: 'Reject proposal' }));
  const saved = async () => (await listProjects(db)).projects[0]!.project;
  await waitFor(async () =>
    expect((await saved()).verificationHistory?.[0]?.decisions[0]?.decision).toBe('rejected'),
  );
  expect((await saved()).world).toEqual(p.world);
  await user.click(within(finding()).getByRole('button', { name: 'Prepare repair' }));
  await user.click(screen.getByRole('button', { name: 'Simulate on isolated copy' }));
  await screen.findByText('Ready for owner review');
  expect(screen.getByRole('button', { name: /accept repair/i })).toBeDisabled();
  await user.click(screen.getByLabelText(/I reviewed the affected records/i));
  await user.click(screen.getByRole('button', { name: /accept repair/i }));
  await waitFor(async () => expect((await saved()).verificationHistory?.at(-1)?.mode).toBe('full'));
  const result = await saved();
  expect(result.world?.routes[0]?.distanceKm).toBe(length);
  expect(result.scenario).toEqual(p.scenario);
  expect(result.canonicalFacts).toEqual(p.canonicalFacts);
  expect(result.verificationHistory?.[0]?.decisions.map((d) => d.decision)).toEqual(['rejected', 'accepted']);
  expect(result.verificationHistory?.at(-1)?.findings.some((f) => f.rule === 'world.route_geometry')).toBe(
    false,
  );
  expect(downloaded).toHaveBeenCalledOnce();
  expect(
    endpoints.every((url) => url === '/api/generation' || url.startsWith('/api/scenario/validate')),
  ).toBe(true);
  vi.restoreAllMocks();
});
