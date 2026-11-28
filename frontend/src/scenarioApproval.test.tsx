import { useEnglishTestLocale } from './englishTestLocale';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
async function setup(reply: () => Response | Promise<Response> = () => Response.json(passing), approved = false, delayedRecovery = false) {
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
  const { check, record } = await setup();
  vi.spyOn(storage, 'saveProject').mockRejectedValueOnce(Error('storage unavailable'));
  fireEvent.click(button('Validate scenario'));
  fireEvent.click(await screen.findByRole('button', { name: 'Retry save' }));
  await screen.findByText(/Validation passed/);
  review();
  expect(button('Approve scenario')).toBeEnabled();
  expect(check).toHaveBeenCalledTimes(1);
  const saved = await record();
  expect(saved.project.runs.filter(run => run.stage === 'scenario').map(run => run.id)).toEqual([saved.scenarioCheckRunId]);
});

async function startDelayedCheck(approved = false) {
  let finish!: (response: Response) => void;
  const response = new Promise<Response>(resolve => { finish = resolve; });
  const fixture = await setup(() => response, approved);
  fireEvent.click(button('Validate scenario'));
  expect(fixture.check).toHaveBeenCalledOnce();
  return { ...fixture, finish: (reply = Response.json(passing)) => finish(reply) };
}

it('keeps a single persisted execution when the validator returns the same failed run twice', async () => {
  const run = {
    id: 'replayed-check', stage: 'scenario', mode: 'deterministic', baseRevision: approvedProject().revision,
    status: 'failed', repairAttempts: 0, calls: 0, receipts: [],
  };
  let replies = 0;
  const { record } = await setup(() => Response.json({
    error: { run, message: 'Check response ' + ++replies },
  }, { status: 422 }));
  const validateButton = button('Validate scenario');
  fireEvent.click(validateButton);
  await screen.findByText('Check response 1', { selector: 'li' });
  const first = await record();
  expect(first.project.runs.filter(r => r.id === run.id)).toEqual([run]);
  fireEvent.click(validateButton);
  await screen.findByText('Check response 2', { selector: 'li' });
  expect(await record()).toEqual(first);
});

it('preserves the saved Quick Check when a delayed invalid check withdraws approval', async () => {
  const { finish, record, p, app, open } = await startDelayedCheck(true);
  const fetcher = vi.mocked(fetch);
  fetcher.mockResolvedValueOnce(Response.json({
    ...passing, statesExplored: 6, feasibleEdgeIds: p.edges.map(e => e.id),
    paths: p.endings.map(e => ({ endingId: e.id, nodeIds: ['n-start', 'n-gate', 'n-witness', 'n-choose', e.nodeId] })),
  }));
  fireEvent.click(button('Verification Agent'));
  fireEvent.click(await screen.findByRole('button', { name: 'Run Quick Check' }));
  await screen.findByRole('button', { name: 'Export report Markdown' });
  const before = await record();
  expect(before.project.verificationHistory).toHaveLength(1);
  expect(before.project.scenario?.approved).toBe(true);
  finish(Response.json(failed));
  await waitFor(async () => expect((await record()).project.scenario?.approved).toBe(false));
  app.unmount();
  await open();
  const saved = await record();
  expect(saved.project.verificationHistory).toEqual(before.project.verificationHistory);
  expect(saved.project.runs).toEqual([...before.project.runs, expect.objectContaining({
    id: saved.scenarioCheckRunId, status: 'unresolved', baseRevision: p.revision,
  })]);
  expect(saved.project.findings.at(-1)?.runId).toBe(saved.scenarioCheckRunId);
  expect(saved.project.revision).toBe(p.revision);
});

it.each([false, true])('keeps a newer content edit when scenario validation returns (save rejected: %s)', async (rejected) => {
  const { finish, record, p } = await startDelayedCheck();
  fireEvent.click(button('Content'));
  const text = 'A newly recorded witness.';
  fireEvent.change(await screen.findByLabelText('Fragment'), { target: { value: text } });
  fireEvent.click(button('Add fragment'));
  if (rejected) vi.spyOn(storage, 'saveProject').mockRejectedValueOnce(Error('storage unavailable'));
  fireEvent.click(await screen.findByRole('button', { name: 'Apply change' }));
  if (rejected) await screen.findByRole('button', { name: 'Retry save' });
  else await waitFor(async () => expect((await record()).project.revision).toBe(p.revision + 1));

  fireEvent.click(button('Scenario Studio'));
  finish();
  await screen.findByText(rejected ? /Validation could not be saved/ : /saved project changed during this action/);
  if (rejected) {
    expect((await record()).project).toEqual(p);
    fireEvent.click(button('Retry save'));
  }
  await waitFor(async () => {
    const saved = await record();
    expect(saved.project.userContent.at(-1)?.text).toBe(text);
    expect(saved.project.revision).toBe(p.revision + 1);
    expect(saved.project.runs).toEqual(p.runs);
    expect(saved.scenarioCheckRunId).toBeUndefined();
  });
});

it('keeps a competing tab save when the delayed receipt loses the token check', async () => {
  const { finish, record, db } = await startDelayedCheck();
  const prior = await record();
  const winner = await saveProject(db, { ...prior.project, title: 'Another tab saved this title' }, prior.token);
  finish();
  const reopen = await screen.findByRole('button', { name: 'Reopen saved project' });
  expect(button('Download draft JSON')).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Retry save' })).toBeNull();
  expect(await record()).toEqual(winner);
  fireEvent.click(reopen);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Reopen saved project' })).toBeNull());
  expect(await record()).toEqual(winner);
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

useEnglishTestLocale();

it('highlights only the ending witness returned by the current local check and clears it on a design edit', async () => {
  const path = ['n-start','n-gate','n-witness','n-choose','n-public'];
  const p = approvedProject();
  const ending = p.endings.find(e => e.nodeId === 'n-public')!;
  const { check } = await setup(() => Response.json({ valid: true, complete: true, findings: [], paths: [{endingId: ending.id, nodeIds: path}] }));
  const graph = within(await screen.findByRole('region', {name: 'Scenario graph'}));
  fireEvent.click(graph.getByRole('button', {name: 'The restored roll'}));
  const evidence = await screen.findByRole('region', {name: 'Ending path evidence'});
  expect(evidence).toHaveTextContent(/no example path/i);
  await validate();
  expect(evidence).toHaveTextContent(/example path from scenario validation/i);
  expect(graph.getByRole('button', {name: 'Publish the roll'})).toHaveClass('on-witness');
  fireEvent.change(screen.getByLabelText('Title'), {target: {value: 'A revised ending'}});
  fireEvent.click(button('Save node'));
  await waitFor(() => expect(evidence).toHaveTextContent(/no example path/i));
  expect(graph.getByRole('button', {name: 'Publish the roll'})).not.toHaveClass('on-witness');
  expect(check).toHaveBeenCalledOnce();
});
