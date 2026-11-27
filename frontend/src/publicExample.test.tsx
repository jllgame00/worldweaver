import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import App from './App';
import { useEnglishTestLocale } from './englishTestLocale';
import { importProject } from './scenarioWorkflow';
import { listProjects } from './storage';

useEnglishTestLocale();
const example = readFileSync(new NodeURL('../public/examples/salt-census.json', import.meta.url), 'utf8');

function serveExample(source: string) {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') !== 'GET') throw Error('Unexpected write request');
    if (url === '/examples/salt-census.json') return new Response(source);
    if (url === '/api/generation') return Response.json({ available: false, mode: 'mock', provider: 'mock', model: 'offline' });
    throw Error('Unexpected URL');
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

it('opens two independent Salt Census copies, keeps evidence historical, edits and exports one copy offline', async () => {
  const db = 'salt-census-working-copies';
  const user = userEvent.setup();
  const fetcher = serveExample(example);
  const source = importProject(example);
  expect(source.synthetic).toBe(true);
  expect(source.verificationHistory?.some(report => report.paths.length >= 2)).toBe(true);
  const blobUrl = vi.fn((_blob: Blob) => 'blob:example');
  vi.stubGlobal('URL', class extends URL { static createObjectURL = blobUrl; static revokeObjectURL() {} });
  const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    render(<App databaseName={db} />);
    const open = async () => {
      const button = await screen.findByRole('button', { name: 'Create a working copy' });
      await waitFor(() => expect(button).toBeEnabled());
      await user.click(button);
    };
    await open();
    await waitFor(async () => expect((await listProjects(db)).projects).toHaveLength(1));
    const first = (await listProjects(db)).projects[0]!;
    expect(first.project.id).not.toBe(source.id);
    expect(first.project.scenario?.approved).toBe(false);
    expect(first.project.world?.approved).toBe(false);
    expect(first.project.approval).toBeUndefined();
    expect(first.project.verificationHistory).toEqual(source.verificationHistory!.map(row => ({ ...row, archived: true })));
    expect(first.project.runs).toEqual(source.runs);
    expect(first.project.canonicalFacts).toEqual(source.canonicalFacts);

    await user.click(screen.getByRole('button', { name: 'Content' }));
    const marker = 'Only the first working copy records this new witness.';
    fireEvent.change(await screen.findByLabelText('Fragment'), { target: { value: marker } });
    await user.click(screen.getByRole('button', { name: 'Add fragment' }));
    await user.click(await screen.findByRole('button', { name: 'Apply change' }));
    const savedFirst = async () => (await listProjects(db)).projects.find(p => p.project.id === first.project.id)!;
    await waitFor(async () => expect((await savedFirst()).project.userContent.at(-1)?.text).toBe(marker));

    await user.click(screen.getByRole('button', { name: 'Verification Agent' }));
    await user.click(await screen.findByRole('button', { name: 'Export saved project JSON' }));
    expect(download).toHaveBeenCalledOnce();
    const blob = blobUrl.mock.calls[0]![0];
    const exported = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(importProject(exported)).toEqual((await savedFirst()).project);

    await user.click(screen.getByRole('button', { name: 'Projects' }));
    await open();
    await waitFor(async () => expect((await listProjects(db)).projects).toHaveLength(2));
    const second = (await listProjects(db)).projects.find(p => p.project.id !== first.project.id)!;
    expect(second.project.id).not.toBe(source.id);
    expect(second.project.userContent).toEqual(source.userContent);
    expect(second.project.nodes).toEqual(source.nodes);
    expect(second.project.world?.locations).toEqual(source.world?.locations);
    expect(second.project.verificationHistory).toEqual(first.project.verificationHistory);
    expect((await savedFirst()).project).toEqual(importProject(exported));
    expect(fetcher.mock.calls.filter(([url]) => url === '/examples/salt-census.json')).toHaveLength(2);
    expect(fetcher.mock.calls.every(([url, init]) => (!init?.method || init.method === 'GET')
      && ['/api/generation', '/examples/salt-census.json'].includes(url))).toBe(true);
  } finally { download.mockRestore(); }
});

it('rejects an example with a broken scenario reference before creating a local project', async () => {
  const db = 'salt-census-invalid-source';
  const broken = importProject(example);
  broken.edges[0]!.to = 'missing-destination';
  const fetcher = serveExample(JSON.stringify(broken));
  render(<App databaseName={db} />);
  const open = await screen.findByRole('button', { name: 'Create a working copy' });
  await waitFor(() => expect(open).toBeEnabled());
  await userEvent.click(open);
  expect(await screen.findByRole('alert')).toHaveTextContent(/sample could not be opened/i);
  expect((await listProjects(db)).projects).toHaveLength(0);
  expect(fetcher.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
});
