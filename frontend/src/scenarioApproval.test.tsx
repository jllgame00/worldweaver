import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import App from './App';
import { approvedProject } from './atlasFixture.testdata';
import { listProjects, saveProject } from './storage';
import * as storage from './storage';
import { editDesign } from './scenarioWorkflow';
import * as recovery from './rejectedStorage';

afterEach(() => vi.restoreAllMocks());
const passing = { valid: true, complete: true, findings: [], paths: [] };
const failed = {
  valid: false,
  complete: true,
  paths: [],
  findings: [
    {
      rule: 'no_reachable_ending',
      severity: 'error',
      entityIds: [],
      explanation: 'No ending is reachable.',
      suggestedRepair: 'Connect an ending.',
    },
  ],
};
async function setup(reply = () => Response.json(passing), approved = false, delayedRecovery = false) {
  if (!vi.isMockFunction(recovery.loadRejection))
    vi.spyOn(recovery, 'loadRejection').mockResolvedValue(undefined);
  const p = approvedProject(),
    db = crypto.randomUUID();
  p.scenario!.approved = approved;
  await saveProject(db, p);
  const check = vi.fn(reply);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/generation')
        return Response.json({ provider: 'mock', model: 'mock', mode: 'mock', available: true });
      if (url === '/api/scenario/validate') return check();
      throw Error('Unexpected request ' + url);
    }),
  );
  const record = async () => (await listProjects(db)).projects[0]!;
  const open = async () => {
    const app = render(<App databaseName={db} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open ' + p.title }));
    await screen.findByRole('button', { name: 'Validate scenario' });
    if (!delayedRecovery)
      await waitFor(() =>
        expect(screen.getByText('Generate scenario', { selector: 'button' })).toBeEnabled(),
      );
    return app;
  };
  return { p, db, record, open, check, app: await open() };
}
const button = (name: string) => screen.getByRole('button', { name });
const review = () => fireEvent.click(screen.getByRole('checkbox', { name: /I reviewed the branches/ }));

it('shows both missing starting visits alongside the unchecked editorial review at approval', async () => {
  const fixture = approvedProject();
  const start = fixture.nodes.find(n => n.kind === 'prologue')!;
  const targets = ['quest', 'ending'].map(kind => fixture.nodes.find(n => n.kind === kind)!);
  const result = {valid:false, complete:true, paths:[], findings:[{
    rule:'blocked_start', severity:'error', entityIds:[start.id], explanation:'Entry is blocked.',
    suggestedRepair:'Review the starting requirements.',
    blockedTransitions:targets.map((n,i)=>({kind:'visited',key:n.id,actual:null,required:'visited',
      fieldPath:'/nodes/0/requiresVisited/'+i,producerIds:[n.id]}))
  }]};
  await setup(() => Response.json(result));
  fireEvent.click(button('Validate scenario'));
  await screen.findByText(/1 blocking finding.*blocked_start/i);
  const reasons = document.getElementById('scenario-approval-reason')!;
  expect(reasons).toHaveTextContent('Check the editorial review box');
  for (const node of [start,...targets]) expect(reasons).toHaveTextContent(node.title);
  review();
  expect(reasons).not.toHaveTextContent('Check the editorial review box');
  expect(button('Approve scenario')).toBeDisabled();
});
async function validate() {
  fireEvent.click(button('Validate scenario'));
  await screen.findByText(/Validation passed/);
  await waitFor(() => expect(button('Validate scenario')).toBeEnabled());
}

it('keeps a successful check and editorial review across a saved layout change', async () => {
  const { record, p } = await setup();
  await validate();
  review();
  expect(button('Approve scenario')).toBeEnabled();
  fireEvent.click(button('Auto-layout'));
  await waitFor(async () => expect((await record()).project.revision).toBe(p.revision + 1));
  expect((await record()).project.versions.scenario).toBe(p.versions.scenario);
  await waitFor(() => expect(button('Approve scenario')).toBeEnabled());
});

it('restores a local validation after autosave and reload, then approves and opens continent generation', async () => {
  const { app, p, record, db, open, check } = await setup();
  await validate();
  app.unmount();
  const saved = await record();
  expect(saved.project.revision).toBe(p.revision);
  await saveProject(db, structuredClone(saved.project), saved.token);
  const reopened = await open();
  review();
  expect(button('Approve scenario')).toBeEnabled();
  fireEvent.click(button('Approve scenario'));
  await waitFor(async () => expect((await record()).project.scenario!.approved).toBe(true));
  reopened.unmount();
  await open();
  fireEvent.click(button('World Atlas'));
  await waitFor(() => expect(button('Generate continent')).toBeEnabled());
  expect(check).toHaveBeenCalledTimes(1);
});

it('requires another check after a semantic edit and a fresh check for a portable copy', async () => {
  const { app, record, db, open } = await setup();
  await validate();
  app.unmount();
  const saved = await record();
  const changed = editDesign(saved.project, (next) => {
    next.nodes[0]!.description += ' 후속 조사';
  });
  await saveProject(db, changed, saved.token);
  const edited = await open();
  review();
  expect(button('Approve scenario')).toBeDisabled();
  expect(screen.getByText(/no current local validation/i)).toBeVisible();
  edited.unmount();
  const copy = { ...saved.project, id: 'portable-copy' },
    other = crypto.randomUUID();
  await saveProject(other, copy);
  render(<App databaseName={other} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open ' + copy.title }));
  await screen.findByRole('checkbox', { name: /I reviewed the branches/ });
  review();
  expect(button('Approve scenario')).toBeDisabled();
});

it('rechecking a previously approved invalid graph reports the blocker and closes the atlas gate', async () => {
  const { p, record } = await setup(() => Response.json(failed), true);
  fireEvent.click(button('Validate scenario'));
  await screen.findByText(/Resolve the blocking findings/i);
  await waitFor(async () => expect((await record()).project.scenario!.approved).toBe(false));
  expect((await record()).project.nodes).toEqual(p.nodes);
  review();
  expect(button('Approve scenario')).toBeDisabled();
  expect(screen.getByText(/1 blocking finding.*no_reachable_ending/i)).toBeVisible();
  fireEvent.click(button('World Atlas'));
  expect(await screen.findByRole('button', { name: 'Generate continent' })).toBeDisabled();
  expect(await screen.findByText('Approve the saved scenario in Scenario Studio.')).toBeVisible();
});

it('keeps incomplete exploration distinct from missing validation after reopening', async () => {
  const { app, open, record } = await setup(() =>
    Response.json({ valid: false, complete: false, paths: [], findings: [] }),
  );
  fireEvent.click(button('Validate scenario'));
  await waitFor(async () => expect((await record()).project.runs.at(-1)?.status).toBe('unresolved'));
  app.unmount();
  await open();
  review();
  expect(button('Approve scenario')).toBeDisabled();
  expect(screen.getByText(/Validation did not complete/)).toBeVisible();
});

it('validates immediately while unrelated rejected-proposal storage is still opening', async () => {
  vi.spyOn(recovery, 'loadRejection').mockImplementation(() => new Promise(() => {}));
  const { check } = await setup(undefined, false, true);
  fireEvent.click(button('Validate scenario'));
  await waitFor(() => expect(check).toHaveBeenCalledOnce());
});

it('preserves approval and the scenario version when the editor saves unchanged design fields', () => {
  const p = approvedProject();
  const next = editDesign(p, (draft) => {
    draft.scenario!.summary = p.scenario!.summary;
  });
  expect(next.versions.scenario).toBe(p.versions.scenario);
  expect(next.scenario!.approved).toBe(true);
});

it('rejects a semantic mutation incorrectly marked layout-only', () => {
  const p = approvedProject();
  expect(() =>
    editDesign(
      p,
      (draft) => {
        draft.nodes[0]!.title += '!';
      },
      true,
    ),
  ).toThrow(/layout/i);
});

it('retries a failed receipt save without calling the validator again', async () => {
  const { check } = await setup();
  vi.spyOn(storage, 'saveProject').mockRejectedValueOnce(Error('storage unavailable'));
  fireEvent.click(button('Validate scenario'));
  fireEvent.click(await screen.findByRole('button', { name: 'Retry save' }));
  await screen.findByText(/Validation passed/);
  review();
  expect(button('Approve scenario')).toBeEnabled();
  expect(check).toHaveBeenCalledTimes(1);
});

it('drops local trust if a saved source fact changes even with unchanged counters', async () => {
  const { app, record, db } = await setup();
  await validate();
  app.unmount();
  const saved = await record();
  expect(saved.scenarioCheckRunId).toBeTruthy();
  const altered = structuredClone(saved.project);
  altered.canonicalFacts[0]!.statement += ' New rule.';
  await saveProject(db, altered, saved.token);
  expect((await record()).scenarioCheckRunId).toBeUndefined();
});

it('undoing a layout change after a failed check cannot restore a prior approval', async () => {
  const { record, p } = await setup(() => Response.json(failed), true);
  fireEvent.click(button('Auto-layout'));
  await waitFor(async () => expect((await record()).project.revision).toBe(p.revision + 1));
  fireEvent.click(button('Validate scenario'));
  await waitFor(async () => expect((await record()).project.scenario!.approved).toBe(false));
  fireEvent.click(button('Undo'));
  await waitFor(async () => expect((await record()).project.scenario!.layout).toEqual(p.scenario!.layout));
  expect((await record()).project.scenario!.approved).toBe(false);
});
