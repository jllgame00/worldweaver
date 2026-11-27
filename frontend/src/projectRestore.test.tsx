import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import App from './App';
import { approvedProject } from './atlasFixture.testdata';
import { acceptAtlas, defaults, generateAtlas } from './atlasWorkflow';
import { useEnglishTestLocale } from './englishTestLocale';
import type { AgentRun, Project } from './project.generated';
import { validationRun } from './scenarioApproval';
import { importProject } from './scenarioWorkflow';
import * as storage from './storage';
import type { SavedProject } from './storage';
import { isProject } from './validation';
import { runVerification } from './verificationEngine';
import { verificationIdentity } from './verificationHistory';
import { confirmWorldReview, persistReport } from './verificationReport';

useEnglishTestLocale();
afterEach(() => vi.restoreAllMocks());

const restoreReviewName = /restore preview|review (?:the )?(?:project )?(?:backup|restore)/i;
const restoreName = /^(?:confirm restore|restore (?:this |existing )?(?:backup|project))$/i;
const duplicateName = /^(?:import as (?:a )?separate copy|create (?:a )?separate copy)$/i;
const recoveryName = /download (?:(?:the )?(?:previous project|recovery)(?: project)?(?: json| backup| copy)*)/i;
const review = () => screen.findByRole('dialog', { name: restoreReviewName });
type User = ReturnType<typeof userEvent.setup>;

let currentProject: Project;
let backup: Project;
const localRunId = 'run-local-current-scenario-check';

beforeAll(async () => {
  const input = approvedProject();
  const atlas = await generateAtlas(input, 'Estuary', 42, defaults, []);
  const withAtlas = acceptAtlas(input, atlas, input.revision, true);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url !== '/api/scenario/validate?verification=true') throw Error('Unexpected fixture request');
    return Response.json({
      valid: true, complete: true, statesExplored: 6, findings: [],
      feasibleEdgeIds: withAtlas.edges.map(edge => edge.id),
      paths: withAtlas.endings.map(ending => ({
        endingId: ending.id,
        nodeIds: ['n-start', 'n-gate', 'n-witness', 'n-choose', ending.nodeId],
      })),
    });
  }));
  try {
    async function verified(project: Project) {
      const report = await runVerification(project, { mode: 'full' });
      const recorded = persistReport(project, report, await verificationIdentity(project));
      return confirmWorldReview(recorded, report.run.id, new AbortController().signal);
    }

    backup = await verified({ ...withAtlas, title: 'Water Ledger · Older backup' });
    const before = {
      ...withAtlas, title: 'Water Ledger · Current project', revision: withAtlas.revision + 2,
      userContent: withAtlas.userContent.map((fragment, index) =>
        index === 0 ? { ...fragment, text: fragment.text + ' 수문 기록을 대조한다. 🌙' } : fragment),
    };
    const localRun: AgentRun = {
      id: localRunId, baseRevision: before.revision, stage: 'scenario', mode: 'deterministic',
      status: 'verified', calls: 0, repairAttempts: 0,
      receipts: [{ tool: 'validate_scenario', outcome: 'passed', detail: 'Validation passed' }],
    };
    currentProject = await verified({ ...before, runs: [...before.runs, localRun] });
    expect(isProject(backup)).toBe(true);
    expect(isProject(currentProject)).toBe(true);
    expect(backup.approval?.runId).toBeDefined();
    expect(currentProject.approval?.runId).toBeDefined();
    expect(validationRun(currentProject, localRunId)?.status).toBe('verified');
  } finally {
    vi.unstubAllGlobals();
  }
});

async function seed(databaseName: string) {
  return storage.saveProject(databaseName, currentProject, undefined, localRunId);
}

async function launch(databaseName: string) {
  const saved = await seed(databaseName);
  const user = userEvent.setup();
  const legacyCollision = vi.spyOn(window, 'confirm').mockReturnValue(false);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url !== '/api/generation' || init?.method === 'POST') throw Error('Restore must stay offline');
    return Response.json({ mode: 'mock', provider: 'mock', model: 'offline', available: true });
  }));
  const app = render(<App databaseName={databaseName} />);
  await screen.findByRole('button', { name: 'Open ' + saved.project.title });
  const records = async () => (await storage.listProjects(databaseName)).projects;
  return { app, user, saved, records, legacyCollision };
}

async function upload(user: User, source = JSON.stringify(backup)) {
  const file = new File([source], 'project-backup.json', { type: 'application/json' });
  // jsdom File may lack Blob.text(), which is present at the browser import boundary.
  if (!file.text) Object.defineProperty(file, 'text', { value: async () => source });
  await user.upload(screen.getByLabelText('Import project JSON'), file);
}

async function openSaved(user: User, project: Project) {
  await user.click(await screen.findByRole('button', { name: 'Open ' + project.title }));
  expect(await screen.findByRole('navigation', { name: 'Project studio' })).toBeVisible();
  expect(screen.getByText(project.title, { selector: '.header-project' })).toBeVisible();
}

async function saveAgainWithSameSnapshot(databaseName: string, saved: SavedProject) {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(saved.savedAt);
  let newer: SavedProject;
  try {
    // saveProject opens a separate IndexedDB connection. The token alone distinguishes this write.
    newer = await storage.saveProject(databaseName, structuredClone(saved.project), saved.token);
  } finally {
    clock.mockRestore();
  }
  expect(newer.token).not.toBe(saved.token);
  expect({ ...newer, token: saved.token }).toEqual(saved);
  return newer;
}

test('D1 previews a same-ID backup and its changes without writing either version', async () => {
  const { user, saved, records, legacyCollision } = await launch('project-restore-preview');
  await upload(user);
  const dialog = within(await review());

  expect(dialog.getByText(saved.project.title)).toBeVisible();
  expect(dialog.getByText(backup.title)).toBeVisible();
  expect(dialog.getByText(saved.project.userContent[0]!.text)).toBeVisible();
  expect(dialog.getByText(backup.userContent[0]!.text)).toBeVisible();
  expect(dialog.getByRole('button', { name: restoreName })).toBeVisible();
  expect(dialog.getByRole('button', { name: duplicateName })).toBeVisible();
  expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
  expect(await records()).toEqual([saved]);
  expect(legacyCollision).not.toHaveBeenCalled();
});

test('D2 rejects a preview after another tab changes only the saved token and allows a fresh review', async () => {
  const databaseName = 'project-restore-competing-tab';
  const { user, saved, records } = await launch(databaseName);
  await upload(user);
  const dialog = within(await review());
  expect(await records()).toEqual([saved]);
  const newer = await saveAgainWithSameSnapshot(databaseName, saved);

  await user.click(dialog.getByRole('button', { name: restoreName }));

  const conflict = await screen.findByRole('alert');
  expect(conflict).toHaveTextContent(/(?:another tab|saved project|saved version).*(?:changed|saved|newer)/i);
  expect(conflict).toHaveTextContent(/reopen|review|preview/i);
  expect(await records()).toEqual([newer]);
  expect(screen.queryByRole('button', { name: recoveryName })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /reopen (?:the )?(?:latest|saved) project/i }));
  expect(await screen.findByRole('navigation', { name: 'Project studio' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Projects' }));
  await upload(user);
  expect(within(await review()).getByRole('button', { name: restoreName })).toBeEnabled();
  expect(await records()).toEqual([newer]);
});

test('D2 the restore persistence boundary rejects the preview token before writing', async () => {
  const databaseName = 'project-restore-token-boundary';
  const saved = await seed(databaseName);
  const newer = await saveAgainWithSameSnapshot(databaseName, saved);
  const boundary = storage as typeof storage & {
    restoreProject?: (databaseName: string, backup: Project, expectedToken: string) => Promise<unknown>;
  };

  expect(boundary.restoreProject, 'A canonical storage restore operation must accept the preview token').toBeTypeOf('function');
  await expect(boundary.restoreProject!(databaseName, backup, saved.token)).rejects.toBeInstanceOf(storage.SaveConflict);
  expect(await storage.listProjects(databaseName)).toEqual({ projects: [newer], unreadable: false });
});

function readBlob(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

test('D3 commits the reviewed backup once and offers the exact previous project as recovery JSON', async () => {
  const databaseName = 'project-restore-success';
  const { app, user, saved, records } = await launch(databaseName);
  await upload(user);
  const dialog = within(await review());
  expect(await records()).toEqual([saved]);
  const downloads: Blob[] = [];
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL(blob: Blob) {
      downloads.push(blob);
      return 'blob:project-restore-test';
    }
    static revokeObjectURL() {}
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  await user.click(dialog.getByRole('button', { name: restoreName }));
  await waitFor(async () => expect((await records())[0]?.project.title).toBe(backup.title));
  const rows = await records();
  expect(rows).toHaveLength(1);
  const restored = rows[0]!;
  expect(restored.project.id).toBe(saved.project.id);
  expect(restored.token).not.toBe(saved.token);
  expect(restored.project.revision).toBe(saved.project.revision + 1);
  expect(isProject(restored.project)).toBe(true);
  for (const field of ['userContent', 'canonicalFacts', 'nodes', 'edges', 'quests', 'endings', 'characters', 'factions'] as const)
    expect(restored.project[field]).toEqual(backup[field]);
  expect(restored.project.scenario?.id).toBe(backup.scenario?.id);
  expect(restored.project.world?.locations).toEqual(backup.world?.locations);
  expect(restored.project.narrative?.story).toEqual(backup.narrative?.story);
  expect(restored.project.approval).toBeUndefined();
  expect(restored.project.scenario?.approved).toBe(false);
  expect(restored.project.world?.approved).toBe(false);
  expect(restored.scenarioCheckRunId).toBeUndefined();
  const historic = restored.project.verificationHistory?.find(row => row.runId === backup.approval?.runId);
  expect(historic).toBeDefined();
  expect(historic?.fingerprint).not.toBe(await verificationIdentity(restored.project));

  app.unmount();
  render(<App databaseName={databaseName} />);
  await openSaved(user, restored.project);
  await user.click(await screen.findByRole('button', { name: recoveryName }));
  expect(downloads).toHaveLength(1);
  expect(importProject(await readBlob(downloads[0]!))).toEqual(saved.project);
  expect(await records()).toEqual([restored]);
});

const invalidBackups: [description: string, serialize: () => string][] = [
  ['malformed JSON', () => '{"id":'],
  ['unsupported schema', () => JSON.stringify({ ...backup, schemaVersion: '99.0.0' })],
  ['invalid canonical reference', () => {
    const invalid = structuredClone(backup);
    invalid.edges[0]!.to = 'missing-scenario-node';
    return JSON.stringify(invalid);
  }],
  ['approval referencing a missing run', () => JSON.stringify({
    ...backup, approval: { revision: backup.revision, runId: 'missing-approval-run' },
  })],
];

test.each(invalidBackups)('D4 keeps the existing record on import of %s', async (description, source) => {
  const { user, saved, records } = await launch('project-restore-invalid-' + description);
  await upload(user, source());
  expect(await screen.findByRole('alert')).toHaveTextContent(/could not import|invalid entity reference/i);
  expect(screen.queryByRole('dialog', { name: restoreReviewName })).not.toBeInTheDocument();
  expect(await records()).toEqual([saved]);
});

test('D4 an IndexedDB abort after the restore write leaves no partial restore or recovery entry', async () => {
  const databaseName = 'project-restore-abort';
  const { app, user, saved, records } = await launch(databaseName);
  await upload(user);
  const dialog = within(await review());
  const originalPut = IDBObjectStore.prototype.put;
  const aborted = vi.fn();
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>
  ) {
    const request = originalPut.apply(this, args);
    if (this.name === 'projects' && args[0]?.project?.id === saved.project.id && args[0].project.title === backup.title) {
      request.addEventListener('success', () => {
        aborted();
        this.transaction.abort();
      }, { once: true });
    }
    return request;
  });

  await user.click(dialog.getByRole('button', { name: restoreName }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/restore|save|storage/i);
  expect(aborted).toHaveBeenCalledOnce();
  expect(await records()).toEqual([saved]);
  app.unmount();
  render(<App databaseName={databaseName} />);
  await openSaved(user, saved.project);
  expect(screen.queryByRole('button', { name: recoveryName })).not.toBeInTheDocument();
});

test('D5 imports a separate copy with stable internal IDs and keeps both projects independently openable', async () => {
  const databaseName = 'project-restore-copy';
  const { app, user, saved, records } = await launch(databaseName);
  await upload(user);
  const dialog = within(await review());
  await user.click(dialog.getByRole('button', { name: duplicateName }));

  await waitFor(async () => expect(await records()).toHaveLength(2));
  const rows = await records();
  const copied = rows.find(row => row.project.id !== saved.project.id)!;
  expect(rows.find(row => row.project.id === saved.project.id)).toEqual(saved);
  expect(copied.project.id).not.toBe(backup.id);
  expect(isProject(copied.project)).toBe(true);
  expect(copied.project.canonicalFacts).toEqual(backup.canonicalFacts);
  expect(copied.project.nodes).toEqual(backup.nodes);
  expect(copied.project.edges).toEqual(backup.edges);
  expect(copied.project.world?.locations).toEqual(backup.world?.locations);
  expect(copied.project.approval).toBeUndefined();
  expect(copied.project.scenario?.approved).toBe(false);
  expect(copied.project.world?.approved).toBe(false);
  expect(copied.scenarioCheckRunId).toBeUndefined();
  app.unmount();
  render(<App databaseName={databaseName} />);
  await openSaved(user, copied.project);
  await user.click(screen.getByRole('button', { name: 'Projects' }));
  await openSaved(user, saved.project);
  expect(await records()).toEqual(rows);
});

test('D6 cancelling restore leaves the saved project, approval and token untouched', async () => {
  const { user, saved, records } = await launch('project-restore-cancel');
  await upload(user);
  const dialog = within(await review());
  await user.click(dialog.getByRole('button', { name: 'Cancel' }));

  await waitFor(() => expect(screen.queryByRole('dialog', { name: restoreReviewName })).not.toBeInTheDocument());
  expect(await records()).toEqual([saved]);
  expect(screen.queryByRole('button', { name: recoveryName })).not.toBeInTheDocument();
});
