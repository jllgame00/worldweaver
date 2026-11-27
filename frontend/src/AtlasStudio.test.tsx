import { useEnglishTestLocale } from './englishTestLocale';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import App from './App';
import { acceptAtlas, defaults, generateAtlas } from './atlasWorkflow';
import { approvedProject } from './atlasFixture.testdata';
import { saveProject, listProjects } from './storage';

it('opens an atlas without a live key, validates, adopts and reopens its linked location', async () => {
  const db = crypto.randomUUID(),
    p = approvedProject();
  await saveProject(db, p);
  const fetch = vi.fn(async (url: string) => {
    if (url !== '/api/generation') throw Error('Unexpected dispatch');
    return Response.json({ mode: 'mock', provider: 'mock', model: 'mock', available: false });
  });
  vi.stubGlobal('fetch', fetch);
  const user = userEvent.setup();
  const app = render(<App databaseName={db} />);
  await user.click(await screen.findByRole('button', { name: 'Open ' + p.title }));
  await user.click(await screen.findByRole('button', { name: 'World Atlas' }));
  await user.click(screen.getByRole('button', { name: 'Generate continent' }));
  await screen.findByRole('button', { name: 'Approve world' }, { timeout: 10000 });
  expect((await listProjects(db)).projects[0]!.project.world?.generatorVersion).toBe('grid-1');
  await user.click(screen.getByRole('button', { name: 'Approve world' }));
  await waitFor(async () => expect((await listProjects(db)).projects[0]!.project.world?.approved).toBe(true));
  app.unmount();
  render(<App databaseName={db} />);
  await user.click(await screen.findByRole('button', { name: 'Open ' + p.title }));
  expect(await screen.findByText('Approved world')).toBeVisible();
  const outline = screen.getByRole('navigation', { name: 'Atlas index' });
  const location = within(outline).getByRole('button', { name: 'Reedmill' });
  await waitFor(() => expect(location).toBeEnabled());
  await user.click(location);
  const inspector = screen.getByRole('region', { name: 'Atlas inspector' });
  await user.click(within(inspector).getByRole('button', { name: p.nodes[0]!.title }));
  await user.click(await screen.findByRole('button', { name: 'Show location on atlas' }));
  expect(await screen.findByRole('region', { name: 'Atlas inspector' })).toHaveTextContent('Reedmill');
  expect(fetch.mock.calls.every(([u]) => u === '/api/generation')).toBe(true);
}, 30000);

it('shows a saved atlas with corrupted terrain as needing review and blocks approval', async () => {
  const db = crypto.randomUUID(),
    p = approvedProject();
  const w = await generateAtlas(p, 'Estuary', 6, defaults, []);
  const saved = acceptAtlas(p, w, p.revision, true);
  const river = saved.world!.features.find((f) => f.kind === 'river')!;
  river.cells.reverse();
  await saveProject(db, saved);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ mode: 'mock', available: false })),
  );
  render(<App databaseName={db} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Open ' + p.title }));
  expect(await screen.findByText('World needs review')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Approve world' })).toBeDisabled();
});

useEnglishTestLocale();
