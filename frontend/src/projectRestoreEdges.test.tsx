import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import App from './App';
import { approvedProject } from './atlasFixture.testdata';
import { importedDesign, validateBackup } from './backupProject';
import { useEnglishTestLocale } from './englishTestLocale';
import { createProject } from './project';
import { listProjects, readRecoveryProject, readSavedProject, restoreProject, SaveConflict, saveProject } from './storage';
import { recordVerification, reportApplies, verificationIdentity } from './verificationHistory';
import type { Project } from './project.generated';

useEnglishTestLocale();
afterEach(() => vi.restoreAllMocks());

test('v1 upgrade retains both original rows, tokens and local metadata without a recovery write', async () => {
  const db = 'restore-migrate-legacy';
  const legacy = [approvedProject(), createProject('Other project')].map((project, i) => ({
    project, token: 'legacy-token-' + i, savedAt: 1234 + i,
  }));
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(db, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('projects', { keyPath: 'project.id' });
      for (const row of legacy) store.put(row);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { request.result.close(); resolve(); };
  });
  for (const row of legacy) {
    expect(await readSavedProject(db, row.project.id)).toEqual(row);
    expect(await readRecoveryProject(db, row.project.id)).toBeUndefined();
  }
  const row = legacy[0]!;
  await restoreProject(db, row.project, row.token);
  expect(await readRecoveryProject(db, row.project.id)).toEqual(row.project);
  expect(await readSavedProject(db, legacy[1]!.project.id)).toEqual(legacy[1]);
});

test('only one concurrent restore commits and each success retains exactly its immediate predecessor', async () => {
  const db = 'restore-many-previews', p = approvedProject();
  const first = await saveProject(db, p);
  const results = await Promise.allSettled(['West', 'East'].map(title =>
    restoreProject(db, { ...p, title }, first.token)));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(r => r.status === 'rejected')?.reason).toBeInstanceOf(SaveConflict);
  const winner = (await readSavedProject(db, p.id))!;
  expect(winner.project.revision).toBe(p.revision + 1);
  expect(await readRecoveryProject(db, p.id)).toEqual(p);
  const edited = await saveProject(db, { ...winner.project, title: 'Edited again' }, winner.token);
  expect(edited.hasRecovery).toBe(true);
  expect(await readRecoveryProject(db, p.id)).toEqual(p);
  await restoreProject(db, p, edited.token);
  expect(await readRecoveryProject(db, p.id)).toEqual(edited.project);
  for (const token of [first.token, winner.token]) await expect(restoreProject(db, p, token)).rejects.toBeInstanceOf(SaveConflict);
  expect(await readRecoveryProject(db, p.id)).toEqual(edited.project);
});

test('restore of a missing current project cannot insert a replacement or orphan a previous version', async () => {
  const db = 'restore-missing-confirmation', p = approvedProject();
  await expect(restoreProject(db, p, 'missing-token')).rejects.toBeInstanceOf(SaveConflict);
  expect(await readSavedProject(db, p.id)).toBeUndefined();
  expect(await readRecoveryProject(db, p.id)).toBeUndefined();
});

test('aborting the recovery write preserves both an earlier recovery and the current token', async () => {
  const db = 'restore-abort-recovery', p = approvedProject();
  const first = await saveProject(db, p);
  const current = await restoreProject(db, { ...p, title: 'First restore' }, first.token);
  const put = IDBObjectStore.prototype.put;
  let aborted = false;
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
    const req = put.apply(this, args);
    if (this.name === 'previousProjects') req.addEventListener('success', () => {
      aborted = true;
      this.transaction.abort();
    });
    return req;
  });
  await expect(restoreProject(db, p, current.token)).rejects.toThrow();
  expect(aborted).toBe(true);
  expect(await readRecoveryProject(db, p.id)).toEqual(first.project);
  expect(await readSavedProject(db, p.id)).toEqual(current);
});

test('matching imported evidence remains historical across JSON round trip and a forged final approval is rejected', async () => {
  const p = createProject('검토 기록');
  p.runs = [{ id: 'run-history', stage: 'verify', baseRevision: 0, mode: 'deterministic',
    calls: 0, repairAttempts: 0, status: 'unresolved', receipts: [] }];
  const identity = await verificationIdentity(p);
  p.verificationHistory = [{ runId: p.runs[0]!.id, fingerprint: identity, mode: 'quick',
    tools: [], findings: [], decisions: [], paths: [], statesExplored: 0, timestamp: new Date(0).toISOString() }];
  await expect(validateBackup({ ...p, approval: { revision: 0, runId: p.runs[0]!.id } })).rejects.toThrow();
  await expect(validateBackup({ ...p, verificationHistory: [{ ...p.verificationHistory[0]!, sourceRunId: 'missing-run' }] })).rejects.toThrow();
  const restored: Project = JSON.parse(JSON.stringify(importedDesign(p)));
  expect(await verificationIdentity(restored)).toBe(identity);
  expect(reportApplies(restored.verificationHistory![0]!, identity)).toBe(false);
  expect(p.verificationHistory[0]!.archived).toBeUndefined();
  const integrated = approvedProject();
  expect(importedDesign(integrated).narrative?.approved).toBe(true);
  expect(importedDesign({ ...integrated, versions: { ...integrated.versions, content: 200 } }).narrative?.approved).toBe(false);
});

test('bounded report history keeps a cited source run until its last report expires', async () => {
  let project = createProject('Bounded history');
  const fingerprint = await verificationIdentity(project);
  for (let i = 0; i <= 14; i++) {
    const id = 'review-' + i;
    project = recordVerification(project, { id, stage: 'verify', baseRevision: 0, calls: 0,
      receipts: [], repairAttempts: 0, status: 'unresolved', mode: 'deterministic' }, {
      runId: id, mode: 'quick', timestamp: new Date(0).toISOString(), fingerprint, tools: [], findings: [],
      paths: [], statesExplored: 0, decisions: [], ...(i === 2 && {sourceRunId: 'review-0'}),
    });
    if (i === 13) {
      expect(project.verificationHistory?.some(r => r.runId === 'review-0')).toBe(false);
      expect(project.runs.some(r => r.id === 'review-0')).toBe(true);
      await expect(validateBackup(project)).resolves.toBeUndefined();
    }
  }
  expect(project.runs.some(r => r.id === 'review-0')).toBe(false);
  await expect(validateBackup(project)).resolves.toBeUndefined();
});

async function openImport(db: string) {
  const user = userEvent.setup();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url !== '/api/generation') throw Error('Unexpected request');
    return Response.json({ mode: 'mock', provider: 'mock', model: 'offline', available: true });
  }));
  render(<App databaseName={db}/>);
  await screen.findByRole('button', { name: /^Open / });
  return { user, upload: async (value: string) => {
    const file = new File([value], 'backup.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => value });
    await user.upload(screen.getByLabelText('Import project JSON'), file);
  }};
}

test('a valid file after a bad import can be reviewed again in Korean without refreshing its stale token', async () => {
  const db = 'restore-locale-refresh', p = createProject('항구');
  const saved = await saveProject(db, p);
  const { user, upload } = await openImport(db);
  await upload('{');
  expect(await screen.findByRole('alert')).toBeVisible();
  await upload(JSON.stringify({ ...p, title: '백업 🌙' }));
  await screen.findByRole('dialog', { name: 'Restore preview' });
  const newer = await saveProject(db, { ...p, title: 'Newer version' }, saved.token);
  await user.selectOptions(screen.getByRole('combobox', {name: 'Interface language'}), 'ko');
  const dialog = within(await screen.findByRole('dialog', {name: '백업 복원 미리보기'}));
  expect(dialog.getByText('백업 🌙')).toBeVisible();
  await user.click(dialog.getByRole('button', {name: '기존 프로젝트 복원'}));
  expect(await dialog.findByRole('alert')).toHaveTextContent('미리보기 이후');
  expect(await readSavedProject(db, p.id)).toEqual(newer);
  await user.click(dialog.getByRole('button', {name: '최신 저장본과 다시 비교'}));
  expect(await dialog.findByText('Newer version')).toBeVisible();
  expect(await readSavedProject(db, p.id)).toEqual(newer);
  await user.click(dialog.getByRole('button', {name: '기존 프로젝트 복원'}));
  await screen.findByRole('button', {name: '복원 직전 프로젝트 JSON 다운로드'});
  expect(await readRecoveryProject(db, p.id)).toEqual(newer.project);
});

test('a generated copy ID collision never replaces the occupied project and allows a new explicit choice', async () => {
  const db = 'restore-copy-id-collision', p = createProject('Original');
  const saved = await saveProject(db, p);
  const { user, upload } = await openImport(db);
  await upload(JSON.stringify(p));
  const dialog = within(await screen.findByRole('dialog'));
  vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(p.id.slice('project-'.length) as ReturnType<Crypto['randomUUID']>);
  await user.click(dialog.getByRole('button', { name: 'Import as a separate copy' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent('already in use');
  expect(await readSavedProject(db, p.id)).toEqual(saved);
  expect(await readRecoveryProject(db, p.id)).toBeUndefined();
  await user.click(dialog.getByRole('button', { name: 'Import as a separate copy' }));
  await screen.findByRole('navigation', { name: 'Project studio' });
  expect(await readSavedProject(db, p.id)).toEqual(saved);
  await user.click(screen.getByRole('button', { name: 'Projects' }));
  for (const row of (await listProjects(db)).projects)
    expect(screen.getByRole('button', { name: 'Open Original', description: new RegExp(row.project.id) })).toBeEnabled();
});
