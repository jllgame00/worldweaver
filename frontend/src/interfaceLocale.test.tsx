import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from './App';
import { approvedProject } from './atlasFixture.testdata';
import { acceptAtlas, defaults, generateAtlas } from './atlasWorkflow';
import { createProject } from './project';
import type { Project } from './project.generated';
import { validationRun } from './scenarioApproval';
import { listProjects, saveProject } from './storage';
import { runVerification } from './verificationEngine';
import { verificationIdentity } from './verificationHistory';
import { confirmWorldReview, persistReport } from './verificationReport';

type User = ReturnType<typeof userEvent.setup>;
const initialLanguage = document.documentElement.lang;
const languageName = /^(?:interface language|language|인터페이스 언어|화면 언어|언어)$/i;
const projectHeading = () => screen.getByRole('heading', { level: 1 });
const studioNavigation = () => screen.findByRole('navigation', { name: /project studio|프로젝트|스튜디오/i });

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.lang = initialLanguage;
});

function isolateRequests(project?: Project) {
  const fetch = vi.fn(async (url: string, request?: RequestInit) => {
    if (url === '/api/generation' && (!request?.method || request.method === 'GET'))
      return Response.json({ mode: 'mock', provider: 'mock', model: 'offline', available: true });
    if (project && request?.method === 'POST'
        && (url === '/api/scenario/validate' || url === '/api/scenario/validate?verification=true')) {
      return Response.json({
        valid: true,
        complete: true,
        statesExplored: 6,
        findings: [],
        feasibleEdgeIds: project.edges.map(edge => edge.id),
        paths: project.endings.map(ending => ({
          endingId: ending.id,
          nodeIds: ['n-start', 'n-gate', 'n-witness', 'n-choose', ending.nodeId],
        })),
      });
    }
    throw Error('Unexpected request during the locale test');
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function chooseLanguage(user: User, locale: 'ko' | 'en') {
  await user.selectOptions(screen.getByRole('combobox', { name: languageName }), locale);
  await waitFor(() => expect(document.documentElement.lang).toBe(locale));
}

async function openProject(user: User, title: string) {
  const heading = await screen.findByRole('heading', { name: title });
  const row = heading.closest('li');
  if (!row) throw Error('The saved project is missing from the project list');
  await user.click(within(row).getByRole('button'));
  return studioNavigation();
}

async function integratedProject() {
  const source = approvedProject();
  source.userContent[0]!.text += ' 증인은 물을 기억한다. 🌙';
  const draft = await generateAtlas(source, 'Estuary', 42, defaults, []);
  return acceptAtlas(source, draft, source.revision, true);
}

test('C1 starts in Korean and switches visible navigation and controls both ways', async () => {
  isolateRequests();
  const databaseName = 'locale-first-launch';
  const saved = await saveProject(databaseName, createProject('수문 · The gate'));
  const user = userEvent.setup();
  render(<App databaseName={databaseName} />);

  expect(projectHeading()).toHaveTextContent(/^프로젝트$/);
  expect(document.documentElement.lang).toBe('ko');
  expect(await screen.findByRole('button', { name: /새 프로젝트/i })).toBeVisible();
  const date = new Date(saved.savedAt);
  const dateOptions = { dateStyle: 'medium', timeStyle: 'short' } as const;
  expect(screen.getByText(new Intl.DateTimeFormat('ko', dateOptions).format(date))).toBeVisible();

  await chooseLanguage(user, 'en');
  expect(projectHeading()).toHaveTextContent(/^Projects$/);
  expect(screen.getByRole('button', { name: 'New project' })).toBeVisible();
  expect(screen.getByText(new Intl.DateTimeFormat('en', dateOptions).format(date))).toBeVisible();
  const navigation = await openProject(user, saved.project.title);
  expect(within(navigation).getByRole('button', { name: 'Content', current: 'page' })).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Paste ideas' })).toBeVisible();

  await chooseLanguage(user, 'ko');
  expect(within(await studioNavigation()).getByRole('button', {
    name: /^(?:콘텐츠|소재)(?: 스튜디오)?$/, current: 'page',
  })).toBeVisible();
  expect(screen.getByRole('tab', { name: /아이디어 붙여넣기/ })).toBeVisible();
});

test('C2 switching locale leaves the integrated project byte-for-byte intact without generation', async () => {
  const databaseName = 'locale-canonical-project';
  const project = await integratedProject();
  const saved = await saveProject(databaseName, project);
  const before = new TextEncoder().encode(JSON.stringify(saved.project));
  const fetch = isolateRequests();
  const user = userEvent.setup();
  render(<App databaseName={databaseName} />);
  const navigation = await openProject(user, project.title);
  expect(within(navigation).getByRole('button', { name: /world atlas|세계 지도/i, current: 'page' })).toBeVisible();

  await chooseLanguage(user, 'en');
  await chooseLanguage(user, 'ko');

  const { projects } = await listProjects(databaseName);
  expect(projects).toEqual([saved]);
  expect(new TextEncoder().encode(JSON.stringify(projects[0]!.project))).toEqual(before);
  expect(fetch.mock.calls.every(([url, request]) =>
    url === '/api/generation' && (!request?.method || request.method === 'GET'))).toBe(true);
});

test('C3 preserves the intake text and the selected unsaved fragment editor across locale changes', async () => {
  isolateRequests();
  const databaseName = 'locale-editor-drafts';
  const project = createProject('Mixed-language draft');
  const fragment = { id: 'u-gate', category: 'location', treatment: 'optional', text: 'East Sluice' } as const;
  project.userContent = [fragment, { ...fragment, id: 'u-tower', text: '관측탑' }];
  const saved = await saveProject(databaseName, project);
  const user = userEvent.setup();
  render(<App databaseName={databaseName} />);
  await openProject(user, project.title);

  const pasteTab = /^(?:Paste ideas|아이디어 붙여넣기)$/i;
  const editTab = /^(?:Edit fragments|소재 (?:직접 )?편집)$/i;
  const originalName = /^(?:Original input|원문(?: 입력)?)$/i;
  const fragmentName = /^(?:Fragment|소재(?: 내용| 텍스트)?)$/i;
  const editForm = /^(?:Edit fragment|소재 편집)$/i;
  const source = '  🌙 사람들은 물을 기억한다.\n“The gate opens at dawn.”\n\n다음 장면은 지하.';
  const edited = '보류 중인 대사.\n“Wait, Iven!” 🧭';

  await user.click(screen.getByRole('tab', { name: pasteTab }));
  const original = screen.getByRole<HTMLTextAreaElement>('textbox', { name: originalName });
  await user.click(original);
  await user.paste(source);
  await user.click(screen.getByRole('tab', { name: editTab }));
  const row = screen.getByText(fragment.text, { selector: 'p' }).closest('li');
  if (!row) throw Error('The stored fragment is missing from the editor');
  await user.click(within(row).getByRole('button', { name: editForm }));
  const editor = within(screen.getByRole('form', { name: editForm }));
  const text = editor.getByRole<HTMLTextAreaElement>('textbox', { name: fragmentName });
  await user.clear(text);
  await user.click(text);
  await user.paste(edited);
  await user.selectOptions(editor.getByRole('combobox', { name: /^(?:Treatment|취급|반영 방식)$/i }), 'excluded');
  text.setSelectionRange(2, 6);
  expect(original).toHaveValue(source);
  expect(text).toHaveValue(edited);

  await chooseLanguage(user, 'en');

  expect(screen.getByRole('tab', { name: 'Edit fragments', selected: true })).toBeVisible();
  const english = within(screen.getByRole('form', { name: 'Edit fragment' }));
  expect(english.getByRole('textbox', { name: 'Fragment' })).toBe(text);
  expect(text).toHaveValue(edited);
  expect([text.selectionStart, text.selectionEnd]).toEqual([2, 6]);
  expect(english.getByRole('combobox', { name: 'Category' })).toHaveValue('location');
  expect(english.getByRole('combobox', { name: 'Treatment' })).toHaveValue('excluded');
  await user.click(screen.getByRole('tab', { name: 'Paste ideas' }));
  expect(screen.getByRole('textbox', { name: 'Original input' })).toBe(original);
  original.setSelectionRange(4, 10);
  await chooseLanguage(user, 'ko');
  expect(screen.getByRole('tab', { name: /아이디어 붙여넣기/, selected: true })).toBeVisible();
  expect(screen.getByRole('textbox', { name: originalName })).toBe(original);
  expect(original).toHaveValue(source);
  expect([original.selectionStart, original.selectionEnd]).toEqual([4, 10]);
  expect((await listProjects(databaseName)).projects).toEqual([saved]);
});

test('C4 keeps approvals, local receipts, semantic identity and the current report after a switch', async () => {
  const databaseName = 'locale-approval';
  const project = await integratedProject();
  const fetch = isolateRequests(project);
  const fingerprint = await verificationIdentity(project);
  const report = await runVerification(project, { mode: 'full' });
  expect(report.run.status).toBe('verified');
  const approved = await confirmWorldReview(
    persistReport(project, report, fingerprint), report.run.id, new AbortController().signal,
  );
  await saveProject(databaseName, approved);
  const user = userEvent.setup();
  render(<App databaseName={databaseName} />);
  const navigation = await openProject(user, project.title);
  await user.click(within(navigation).getByRole('button', { name: /scenario studio|시나리오(?: 스튜디오)?/i }));
  await user.click(screen.getByRole('button', { name: /validate scenario|시나리오 (?:검증|검사)/i }));
  const record = async () => (await listProjects(databaseName)).projects[0]!;
  await waitFor(async () => expect((await record()).scenarioCheckRunId).toBeDefined());
  const before = await record();
  expect(validationRun(before.project, before.scenarioCheckRunId)?.status).toBe('verified');
  expect(before.project.narrative?.approved).toBe(true);
  expect(before.project.scenario?.approved).toBe(true);
  expect(before.project.world?.approved).toBe(true);
  expect(before.project.approval).toEqual(approved.approval);
  await user.click(within(navigation).getByRole('button', { name: /verification agent|검증(?: 에이전트| 도구)?/i }));
  expect(await screen.findByText(/applies to current design|현재 설계에 적용/i)).toBeVisible();
  const requestCount = fetch.mock.calls.length;

  await chooseLanguage(user, 'en');
  expect(await screen.findByText(/applies to current design/i)).toBeVisible();

  const after = await record();
  expect(after).toEqual(before);
  expect(await verificationIdentity(after.project)).toBe(fingerprint);
  expect(validationRun(after.project, after.scenarioCheckRunId)).toEqual(
    validationRun(before.project, before.scenarioCheckRunId),
  );
  expect(after.project.verificationHistory?.find(entry => entry.runId === approved.approval?.runId)?.fingerprint)
    .toBe(fingerprint);
  expect(fetch.mock.calls.slice(requestCount).filter(([, request]) => request?.method === 'POST')).toHaveLength(0);
});

test('C5 reload restores the interface preference across projects without saving either project', async () => {
  isolateRequests();
  const databaseName = 'locale-independent-preference';
  const first = createProject('달빛 기록실');
  const second = createProject('Workshop notes');
  await saveProject(databaseName, first);
  await saveProject(databaseName, second);
  const before = await listProjects(databaseName);
  const user = userEvent.setup();
  const app = render(<App databaseName={databaseName} />);
  await openProject(user, first.title);

  await chooseLanguage(user, 'en');
  app.unmount();
  document.documentElement.lang = 'ko';
  render(<App databaseName={databaseName} />);
  await waitFor(() => expect(document.documentElement.lang).toBe('en'));
  expect(projectHeading()).toHaveTextContent(/^Projects$/);
  expect(screen.getByRole('combobox', { name: languageName })).toHaveValue('en');
  const navigation = await openProject(user, second.title);
  expect(within(navigation).getByRole('button', { name: 'Content', current: 'page' })).toBeVisible();
  expect((await listProjects(databaseName))).toEqual(before);
});

test('C5 a blocked preference write still allows a session-only language change', async () => {
  isolateRequests();
  const databaseName = 'locale-storage-unavailable';
  const project = createProject('수문');
  const saved = await saveProject(databaseName, project);
  const user = userEvent.setup();
  render(<App databaseName={databaseName} />);
  await openProject(user, project.title);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Preference storage blocked', 'QuotaExceededError');
  });

  await chooseLanguage(user, 'en');
  await user.click(screen.getByRole('button', { name: 'Projects' }));
  expect(projectHeading()).toHaveTextContent(/^Projects$/);
  await openProject(user, project.title);
  expect(screen.getByRole('combobox', { name: languageName })).toHaveValue('en');
  expect((await listProjects(databaseName)).projects).toEqual([saved]);
});
