import { useEnglishTestLocale } from './englishTestLocale';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AtlasStudio from './AtlasStudio';
import { approvedProject } from './atlasFixture.testdata';
import { acceptAtlas, defaults, generateAtlas, resolvedWorld } from './atlasWorkflow';
import { readAtlasDraft, writeAtlasDraft } from './atlasRecovery';
import { SaveConflict } from './storage';
import type { Point, Project } from './project.generated';

afterEach(() => {
  vi.restoreAllMocks();
});

async function fixture() {
  const project = approvedProject();
  const w = await generateAtlas(project, 'Coastal record', 42, { ...defaults, size: 'small', roads: 0 }, []);
  return acceptAtlas(project, w, project.revision, true);
}
function editor(
  project: Project,
  db: string,
  commit = vi.fn(async (_p: Project) => true),
  current = () => project,
) {
  const mounted = render(
    <AtlasStudio
      project={project}
      databaseName={db}
      selectedId="l-gate"
      openScenario={vi.fn()}
      current={current}
      commit={commit}
      disabled={false}
    />,
  );
  const screen = within(mounted.container);
  return { ...mounted, screen, commit, button: (name: string) => screen.getByRole('button', { name }) };
}
async function rename(view: ReturnType<typeof editor>, name: string) {
  const save = within(view.screen.getByRole('region', { name: 'Atlas inspector' })).getByRole('button', {
    name: 'Save location',
  });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.change(view.screen.getByRole('textbox', { name: 'Location name' }), { target: { value: name } });
  fireEvent.click(view.button('Save location'));
  await view.screen.findByRole('heading', { name });
  await waitFor(() => expect(view.button('Save location')).toBeEnabled());
}

it('rejects approval of the working copy another tab has since replaced', async () => {
  const p = await fixture(),
    db = crypto.randomUUID();
  const a = editor(p, db);
  await rename(a, 'First witness');
  const b = editor(p, db);
  await b.screen.findByRole('heading', { name: 'First witness' });
  await rename(b, 'Second witness');
  fireEvent.click(a.button('Approve world'));
  await a.screen.findByText(/another tab changed/i);
  expect(a.commit).not.toHaveBeenCalled();
  a.unmount();
  b.unmount();
  const reopened = editor(p, db);
  expect(await reopened.screen.findByRole('heading', { name: 'Second witness' })).toBeVisible();
}, 20000);

it('accepts a cartographic rename of a scenario-owned underground location', async () => {
  const p = await fixture(),
    a = editor(p, crypto.randomUUID());
  const original = p.scenario!.locations.find((l) => l.id === 'vault')!;
  await waitFor(() => expect(a.button('Save location')).toBeEnabled());
  fireEvent.click(
    within(a.screen.getByRole('navigation', { name: 'Atlas index' })).getByRole('button', {
      name: original.name,
    }),
  );
  await rename(a, '지하 증언 보관소');
  fireEvent.click(a.button('Approve world'));
  await waitFor(() => expect(a.commit).toHaveBeenCalledTimes(1));
  const saved = a.commit.mock.calls[0]![0];
  expect(saved.scenario).toEqual(p.scenario);
  expect(saved.world!.placements!.find((s) => s.locationId === 'vault')?.label).toBe('지하 증언 보관소');
});

it('reports a successful canonical save independently of a new proposal created during that save', async () => {
  const p = await fixture(),
    db = crypto.randomUUID();
  let finish!: () => void;
  const a = editor(
    p,
    db,
    vi.fn(
      (_p: Project) =>
        new Promise<boolean>((resolve) => {
          finish = () => resolve(true);
        }),
    ),
  );
  await rename(a, 'Accepted witness');
  fireEvent.click(a.button('Approve world'));
  await waitFor(() => expect(a.commit).toHaveBeenCalledTimes(1));
  const b = editor(p, db);
  await b.screen.findByRole('heading', { name: 'Accepted witness' });
  await rename(b, 'Newer proposal');
  await act(async () => finish());
  expect(await a.screen.findByText(/world approval saved.*newer working copy/i)).toBeVisible();
  expect((await readAtlasDraft(db, p.id))!.draft.world.locations.find((l) => l.id === 'l-gate')!.name).toBe(
    'Newer proposal',
  );
}, 20000);

it('keeps a failed canonical save and invalid edit recoverable while the approved project stays intact', async () => {
  const p = await fixture(),
    original = JSON.stringify(p),
    db = crypto.randomUUID();
  const network = vi.fn(() => {
    throw Error('Unexpected provider request');
  });
  vi.stubGlobal('fetch', network);
  const a = editor(
    p,
    db,
    vi.fn(async () => false),
  );
  await rename(a, 'Owner correction');
  fireEvent.click(a.button('Approve world'));
  await waitFor(() => expect(a.commit).toHaveBeenCalledTimes(1));
  expect(a.screen.getByText('Working proposal')).toBeVisible();
  a.unmount();
  const b = editor(p, db);
  await b.screen.findByRole('heading', { name: 'Owner correction' });
  fireEvent.change(b.screen.getByRole('spinbutton', { name: 'Column' }), { target: { value: 0 } });
  fireEvent.change(b.screen.getByRole('spinbutton', { name: 'Row' }), { target: { value: 0 } });
  fireEvent.click(b.button('Save location'));
  await waitFor(() => expect(b.button('Approve world')).toBeDisabled());
  b.unmount();
  const c = editor(p, db);
  expect(await c.screen.findByText(/error · location_position/)).toBeVisible();
  expect(c.button('Approve world')).toBeDisabled();
  expect(c.commit).not.toHaveBeenCalled();
  expect(JSON.stringify(p)).toBe(original);
  expect(network).not.toHaveBeenCalled();
}, 20000);

it('serializes overlapping same-token saves and protects the winning proposal from a stale discard', async () => {
  const p = await fixture(),
    db = crypto.randomUUID(),
    world = { ...resolvedWorld(p)!, approved: false };
  const initial = await writeAtlasDraft(db, p.id, undefined, { base: p.revision, world });
  const results = await Promise.allSettled(
    ['north', 'south'].map((name) =>
      writeAtlasDraft(db, p.id, initial!.token, { base: p.revision, world: { ...world, name } }),
    ),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((r) => r.status === 'rejected')?.reason).toBeInstanceOf(SaveConflict);
  await expect(writeAtlasDraft(db, p.id, initial!.token)).rejects.toBeInstanceOf(SaveConflict);
  expect((await readAtlasDraft(db, p.id))!.draft.world.name).toMatch(/north|south/);
  expect(await readAtlasDraft(db, 'another-project')).toBeUndefined();
});

it('retains a quota-failed edit in this tab and makes it recoverable when storage returns', async () => {
  const p = await fixture(),
    db = crypto.randomUUID(),
    a = editor(p, db);
  await rename(a, 'Durable');
  const failed = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
    throw new DOMException('Quota exhausted.', 'QuotaExceededError');
  });
  await rename(a, 'Memory copy');
  expect(await a.screen.findByRole('alert')).toHaveTextContent(/only in this tab/i);
  expect((await readAtlasDraft(db, p.id))!.draft.world.locations.find((l) => l.id === 'l-gate')!.name).toBe(
    'Durable',
  );
  failed.mockRestore();
  await rename(a, 'Recovered copy');
  expect(a.screen.queryByText(/only in this tab/i)).toBeNull();
  a.unmount();
  const b = editor(p, db);
  expect(await b.screen.findByRole('heading', { name: 'Recovered copy' })).toBeVisible();
}, 20000);

it('restores the old source revision when undoing reconciliation of a stale proposal', async () => {
  const p = await fixture(),
    db = crypto.randomUUID(),
    a = editor(p, db);
  await rename(a, 'Old proposal');
  a.unmount();
  const b = editor({ ...p, revision: p.revision + 1 }, db);
  expect(await b.screen.findByRole('alert')).toHaveTextContent('Working copy is based on project revision');
  expect(b.button('Approve world')).toBeDisabled();
  fireEvent.click(b.button('Reconcile with approved scenario'));
  await waitFor(() => expect(b.button('Approve world')).toBeEnabled());
  fireEvent.click(b.button('Undo atlas edit'));
  expect(await b.screen.findByText(/Working copy is based on project revision/)).toBeVisible();
  expect(b.button('Approve world')).toBeDisabled();
  fireEvent.click(b.button('Redo atlas edit'));
  await waitFor(() => expect(b.button('Approve world')).toBeEnabled());
}, 20000);

it('renames, locks and moves a site and restores the original and edited placement with undo and redo', async () => {
  const p = await fixture(),
    db = crypto.randomUUID(),
    a = editor(p, db),
    original = resolvedWorld(p)!;
  const site = original.locations.find((l) => l.id === 'l-gate')!,
    [x, y] = site.position!;
  const neighbor = (
    [
      [x + 1, y],
      [x - 1, y],
      [x, y - 1],
      [x, y + 1],
    ] as Point[]
  ).find(
    ([nx, ny]) =>
      !!original.tiles[ny]?.[nx] &&
      !'~l'.includes(original.tiles[ny]![nx]!) &&
      !original.locations.some((l) => l.position?.join() === [nx, ny].join()),
  )!;
  await waitFor(() => expect(a.button('Save location')).toBeEnabled());
  fireEvent.change(a.screen.getByLabelText('Column'), { target: { value: neighbor[0] } });
  fireEvent.change(a.screen.getByLabelText('Row'), { target: { value: neighbor[1] } });
  fireEvent.click(a.screen.getByRole('checkbox', { name: /lock position/i }));
  await rename(a, 'Locked tollgate');
  const check = async () =>
    (await readAtlasDraft(db, p.id))!.draft.world.locations.find((l) => l.id === site.id);
  expect(await check()).toMatchObject({ name: 'Locked tollgate', locked: true, position: neighbor });
  fireEvent.change(a.screen.getByLabelText('Column'), { target: { value: x === neighbor[0] ? x + 1 : x } });
  fireEvent.click(a.button('Save location'));
  expect(await a.screen.findByText(/unlock the location/i)).toBeVisible();
  expect(await check()).toMatchObject({ position: neighbor });
  fireEvent.click(a.button('Undo atlas edit'));
  await a.screen.findByRole('heading', { name: site.name });
  expect(await check()).toEqual(site);
  fireEvent.click(a.button('Redo atlas edit'));
  await a.screen.findByRole('heading', { name: 'Locked tollgate' });
  expect(await check()).toMatchObject({ position: neighbor, locked: true });
  expect(original.locations.find((l) => l.id === site.id)).toEqual(site);
}, 20000);

it('ignores an editor mutation after its source stops being current', async () => {
  const p = await fixture(),
    db = crypto.randomUUID();
  let current = p;
  const a = editor(p, db, undefined, () => current);
  await waitFor(() => expect(a.button('Save location')).toBeEnabled());
  current = { ...p, revision: p.revision + 1 };
  fireEvent.change(a.screen.getByRole('textbox', { name: 'Location name' }), {
    target: { value: 'Stale write' },
  });
  fireEvent.click(a.button('Save location'));
  expect(await a.screen.findByText(/source changed/i)).toBeVisible();
  expect(a.screen.queryByText('Working proposal')).toBeNull();
  expect(a.commit).not.toHaveBeenCalled();
}, 20000);

it('adds an owner journey, removes its corridor and rebuilds the same route from the retained requirement', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const p = await fixture(),
    db = crypto.randomUUID(),
    a = editor(p, db),
    w = resolvedWorld(p)!;
  const [from, to] = w.locations
    .flatMap((l, i) => w.locations.slice(i + 1).map((k) => [l, k] as const))
    .find(([l, k]) => !w.routes.some((r) => [r.from, r.to].includes(l.id) && [r.from, r.to].includes(k.id)))!;
  await waitFor(() => expect(a.button('Save location')).toBeEnabled());
  fireEvent.click(a.screen.getByText(/Geography requirements \(/));
  fireEvent.change(a.screen.getByLabelText('From location'), { target: { value: from.id } });
  fireEvent.change(a.screen.getByLabelText('Relationship'), { target: { value: 'travel' } });
  fireEvent.change(a.screen.getByLabelText('Target'), { target: { value: to.id } });
  fireEvent.click(a.button('Add requirement'));
  await a.screen.findByText('Working proposal');
  fireEvent.click(a.button('Recalculate routes'));
  const load = async () => (await readAtlasDraft(db, p.id))!.draft.world;
  const requested = async () =>
    (await load()).routes.find((r) => [r.from, r.to].includes(from.id) && [r.from, r.to].includes(to.id));
  await waitFor(async () => expect(await requested()).toBeDefined());
  const route = (await requested())!,
    name = (id: string) => w.locations.find((l) => l.id === id)!.name;
  const nav = within(a.screen.getByRole('navigation', { name: 'Atlas index' }));
  fireEvent.click(nav.getByText(/^Routes \(/));
  fireEvent.click(nav.getByRole('button', { name: name(route.from) + ' → ' + name(route.to) }));
  fireEvent.click(a.button('Remove route'));
  await waitFor(async () => expect(await requested()).toBeUndefined());
  expect((await load()).constraints).toContainEqual(
    expect.objectContaining({ origin: 'owner', from: from.id, to: to.id, relation: 'travel' }),
  );
  fireEvent.click(a.button('Recalculate routes'));
  await waitFor(async () => expect(await requested()).toEqual(route));
  expect(a.commit).not.toHaveBeenCalled();
}, 20000);

it('recovers the previous proposal after failed and cancelled regeneration', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const p = await fixture(),
    db = crypto.randomUUID(),
    a = editor(p, db);
  await rename(a, 'Before generation');
  const original = await readAtlasDraft(db, p.id);
  fireEvent.click(a.screen.getByText('Continent settings'));
  fireEvent.change(a.screen.getByLabelText('Seed'), { target: { value: -1 } });
  fireEvent.click(a.button('Generate continent'));
  expect(await a.screen.findByText(/check the atlas name, seed/i)).toBeVisible();
  fireEvent.change(a.screen.getByLabelText('Seed'), { target: { value: 17 } });
  fireEvent.click(a.button('Generate continent'));
  fireEvent.click(a.button('Cancel generation'));
  expect(await a.screen.findByText('Generation cancelled.')).toBeVisible();
  a.unmount();
  const b = editor(p, db);
  expect(await b.screen.findByRole('heading', { name: 'Before generation' })).toBeVisible();
  expect(await readAtlasDraft(db, p.id)).toEqual(original);
  expect(a.commit).not.toHaveBeenCalled();
}, 20000);

useEnglishTestLocale();
