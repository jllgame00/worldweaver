import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import App from './App';
import Operations from './Operations';
import { approvedProject } from './atlasFixture.testdata';
import { useEnglishTestLocale } from './englishTestLocale';
import { createProject } from './project';
import type { ValidationFinding } from './project.generated';
import { saveProject } from './storage';
import { retainedActivity } from './retainedActivity';
import VerificationAgent from './VerificationAgent';
import { WorldBible } from './WorldBible';

useEnglishTestLocale();

it('distinguishes duplicate Bible names by their linked faction and opens named direct uses', () => {
  const project = approvedProject();
  const first = project.characters[0]!;
  const faction = project.factions[0]!;
  first.factionId = faction.id;
  project.characters.push({ id: 'other-witness', name: first.name, role: 'Independent witness' });
  project.nodes[0]!.characterIds = [first.id];
  const commit = vi.fn();
  render(<WorldBible project={project} current={() => project} commit={commit} disabled={false}
    selectedId={first.id} navigate={vi.fn()} review={vi.fn()} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: first.name } });
  const list = screen.getByRole('list', { name: 'Records' });
  expect(within(list).getByRole('button', { name: new RegExp(faction.name) })).toHaveTextContent(first.name);
  const usage = screen.getByRole('region', { name: 'Used by' });
  fireEvent.click(within(usage).getByRole('button', { name: project.nodes[0]!.title }));
  expect(within(screen.getByRole('region', { name: 'Record details' })).getByRole('heading', { name: project.nodes[0]!.title })).toBeVisible();
  expect(commit).not.toHaveBeenCalled();
});

it('keeps same-name records distinguishable even when their source, kind and faction also match', () => {
  const project = approvedProject();
  const first = project.characters[0]!;
  project.characters.push({ ...first, id: 'second-witness' });
  render(<WorldBible project={project} current={() => project} commit={vi.fn()} disabled={false}
    selectedId={first.id} navigate={vi.fn()} review={vi.fn()} />);
  const register = within(screen.getByRole('list', { name: 'Records' }));
  expect(register.getByRole('button', { name: new RegExp(first.id) })).toHaveTextContent(first.name);
  expect(register.getByRole('button', { name: /second-witness/ })).toHaveTextContent(first.name);
});

it('filters historical findings by severity and exposes structured evidence for the selected cause', () => {
  const project = approvedProject();
  const runId = 'report-test';
  const root: ValidationFinding = { id: 'one', rule: 'test.local', origin: 'deterministic', severity: 'error',
    status: 'open', entityIds: [project.nodes[0]!.id], explanation: 'Start condition blocks travel.', suggestedRepair: '',
    fieldPath: '/nodes/0/conditions', checkedRevision: project.revision, runId };
  const warning: ValidationFinding = { ...root, id: 'two', severity: 'warning', explanation: 'Optional route has a warning.' };
  project.runs.push({ id: runId, stage: 'verify', baseRevision: project.revision, mode: 'deterministic',
    status: 'unresolved', repairAttempts: 0, receipts: [], calls: 0 });
  project.verificationHistory = [{ runId, fingerprint: 'old-snapshot', timestamp: '2026-01-01T00:00:00Z',
    mode: 'quick', findings: [root, warning], tools: [], paths: [], statesExplored: 0, decisions: [] }];
  render(<VerificationAgent project={project} current={() => project} commit={vi.fn()} disabled={false} inspect={vi.fn()} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Filter findings' }), { target: { value: 'error' } });
  expect(screen.queryByText(warning.explanation)).toBeNull();
  const finding = screen.getByRole('article', { name: root.explanation });
  fireEvent.click(within(finding).getByText(/Evidence and field paths/));
  expect(within(finding).getByText(root.fieldPath!)).toBeVisible();
  expect(within(finding).getByRole('button', { name: 'Prepare repair' })).toBeDisabled();
});

it('updates the targeted review when another Bible record is opened in an already visited verification workspace', () => {
  const project = approvedProject();
  const commit = vi.fn();
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const props = { project, current: () => project, commit, disabled: false, inspect: vi.fn() };
  const view = render(<VerificationAgent {...props} targetId={project.characters[0]!.id} />);
  expect(screen.getByRole('combobox', { name: 'Review target' })).toHaveValue(project.characters[0]!.id);
  view.rerender(<VerificationAgent {...props} targetId={project.nodes[0]!.id} />);
  expect(screen.getByRole('combobox', { name: 'Review target' })).toHaveValue(project.nodes[0]!.id);
  expect(fetcher).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
});

it('counts retained operations by source without exposing private text or inventing missing dispatches', async () => {
  const db = 'evidence-operations';
  const project = createProject('Receipt fixture');
  project.runs.push({ id: 'live-run', stage: 'candidates', baseRevision: 0, mode: 'live', status: 'proposed',
    calls: 2, receipts: [{ tool: 'generate_structured', outcome: 'passed', detail: 'secret-tool-detail' }], repairAttempts: 0 });
  await saveProject(db, project);
  localStorage.setItem(JSON.stringify(['worldweaver-content-intake-v1', db, project.id]), JSON.stringify({
    source: 'secret-source-text', history: [
      { id: 'extract', method: 'live', outcome: 'invalid', dispatches: 1, responses: 1 },
      { id: 'extract', method: 'live', outcome: 'pending' },
      { id: 'pending', method: 'live', outcome: 'unconfirmed' },
      { id: 'mock', method: 'mock', outcome: 'completed', dispatches: 1, responses: 1 },
      { id: 'fallback', method: 'fallback', outcome: 'completed' },
      { id: 'decline', method: 'fallback', outcome: 'rejected' },
    ],
  }));
  const fetcher = vi.fn(async (url: string) => Response.json(url === '/health' ? { status: 'ok' }
    : { available: false, mode: 'mock', provider: 'mock', model: 'offline' }));
  vi.stubGlobal('fetch', fetcher);
  render(<App databaseName={db} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open Receipt fixture' }));
  await screen.findByRole('heading', { name: 'Project content' });
  fireEvent.click(await screen.findByRole('button', { name: 'Operations & settings' }));
  const metrics = await screen.findByRole('table', { name: 'Retained activity' });
  for (const [name, count] of [['Live requests', 3], ['Mock requests', 1], ['Unconfirmed dispatch', 1],
    ['Rejected outputs', 1], ['Local fallbacks', 1]]) {
    expect(within(metrics).getByRole('row', { name: new RegExp(String(name)) })).toHaveTextContent(String(count));
  }
  expect(screen.getByRole('region', { name: 'Operations' }).textContent).not.toMatch(/secret-(source-text|tool-detail)/);
  expect(fetcher.mock.calls.every(([url]) => url === '/api/generation')).toBe(true);
  const log = within(screen.getByRole('region', {name:'Recent operation history'}));
  expect(log.getByText(/Story candidates.*proposed/i)).toBeVisible();
  expect(log.getByText(/Deterministic fallback.*draft rejected/i)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Check service health' }));
  expect(await screen.findByText(/Service reachable/)).toBeVisible();
  expect(fetcher.mock.calls.filter(([url]) => url === '/health')).toHaveLength(1);
});

it('uses confirmed run outcomes and archived report dates without counting reports as extra dispatches', () => {
  const project = createProject('Mixed history');
  project.runs = [
    { id: 'revision', stage: 'scenario', mode: 'live', calls: 2, status: 'failed', repairAttempts: 0, baseRevision: 0,
      receipts: [{ tool: 'generate_structured', outcome: 'failed', detail: 'provider_timeout' },
        { tool: 'generate_structured', outcome: 'passed', detail: 'Response received' },
        { tool: 'check_scenario', outcome: 'failed', detail: 'invalid_scenario' }] },
    { id: 'semantic', stage: 'verify', mode: 'mock', calls: 1, status: 'failed', repairAttempts: 0, baseRevision: 0,
      receipts: [{ tool: 'semantic_review', outcome: 'failed', detail: 'invalid_review_evidence' }] },
    { id: 'cancelled', stage: 'verify', mode: 'live', calls: 0, status: 'cancelled', repairAttempts: 0, baseRevision: 0,
      receipts: [{ tool: 'semantic_cancelled', outcome: 'cancelled', detail: '' }] },
    { id: 'legacy', stage: 'candidates', mode: 'live', calls: 3, status: 'proposed', repairAttempts: 0, baseRevision: 0, receipts: [] },
    { id: 'quick', stage: 'verify', mode: 'deterministic', calls: 0, status: 'verified', repairAttempts: 0, baseRevision: 0, receipts: [] },
  ];
  project.verificationHistory = [{ runId: 'quick', archived: true, timestamp: '2025-10-01T00:00:00Z', mode: 'quick',
    fingerprint: 'old', tools: [], findings: [], paths: [], statesExplored: 0, decisions: [] }];
  const activity = retainedActivity(project, [
    { id: 'blocked', method: 'live', outcome: 'failed', dispatches: 0, responses: 0 },
    { id: 'timeout', method: 'mock', outcome: 'timeout', dispatches: 1, responses: 0 },
    { id: 'fallback', method: 'fallback', outcome: 'completed', dispatches: 0, responses: 0 },
    { id: 'accept', method: 'fallback', outcome: 'accepted' },
  ]);
  expect(activity).toMatchObject({ runs: 5, reports: 1, archived: 1, deterministic: 1, accepted: 1, fallback: 1,
    totals: { live: { calls: 5, responses: 1, rejected: 1, failed: 1, unknown: 1 },
      mock: { calls: 2, responses: 1, rejected: 1, failed: 1, unknown: 0 } } });
  expect(activity.dates).toEqual([Date.parse('2025-10-01T00:00:00Z')]);
});

it('shows an unavailable intake store as unknown while keeping available portable counts', () => {
  const project = createProject('Unavailable intake');
  const original = Storage.prototype.getItem;
  const denied = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
    if (key.includes('worldweaver-content-intake-v1')) throw Error('Storage access denied');
    return original.call(this, key);
  });
  try {
    render(<Operations project={project} databaseName="no-local-intake" />);
    const table = screen.getByRole('table', { name: 'Retained activity' });
    expect(within(table).getByRole('row', { name: /Local fallbacks/ })).toHaveTextContent('Unknown');
    expect(within(table).getByRole('row', { name: /Deterministic runs/ })).toHaveTextContent('0');
    expect(screen.getByText('The browser intake history is unavailable.')).toBeVisible();
  } finally { denied.mockRestore(); }
});
