import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import App from './App';
import { localePreferenceKey } from './locale';
import { createProject } from './project';
import { listProjects, saveProject } from './storage';

beforeEach(() => localStorage.removeItem(localePreferenceKey));

function mockGeneration() {
  const fetch = vi.fn(async (path: string, request?: RequestInit) => {
    if (path === '/api/generation')
      return Response.json({ available: true, provider: 'mock', mode: 'mock', model: 'offline' });
    if (path === '/api/candidates' && request?.method === 'POST')
      return Response.json({ error: { code: 'unrecognized_diagnostic', message: 'Upstream diagnostic near Iven: A7.' } },
        { status: 502 });
    throw Error('Unexpected request in localization tests');
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function openProject(databaseName: string) {
  const project = createProject('물의 장부 · Water Ledger');
  project.userContent = [{ id: 'content-iven', category: 'character', treatment: 'optional', text: 'Iven, 수문 조사관' }];
  const saved = await saveProject(databaseName, project);
  const user = userEvent.setup();
  render(<App databaseName={databaseName} />);
  const name = await screen.findByRole('heading', { name: project.title });
  const row = name.closest('li');
  if (!row) throw Error('Expected just one project in the fixture');
  await user.click(within(row).getByRole('button'));
  await screen.findByRole('navigation', { name: '프로젝트 스튜디오' });
  return { user, saved };
}

test('an invalid stored locale opens the Korean dashboard and can be replaced by a valid choice', async () => {
  localStorage.setItem(localePreferenceKey, '{unsupported-locale');
  mockGeneration();
  const user = userEvent.setup();
  const app = render(<App databaseName="locale-invalid-pref" />);
  expect(screen.getByRole('heading', { name: '프로젝트' })).toBeVisible();
  expect(document.documentElement.lang).toBe('ko');
  await user.selectOptions(screen.getByRole('combobox', { name: '인터페이스 언어' }), 'en');
  app.unmount();
  render(<App databaseName="locale-invalid-pref" />);
  expect(screen.getByRole('heading', { name: 'Projects' })).toBeVisible();
  expect(screen.getByRole('combobox', { name: 'Interface language' })).toHaveValue('en');
});

test('a pending local intake proposal retains its selection, evidence and edited text during a locale switch', async () => {
  const fetch = mockGeneration();
  const databaseName = 'locale-pending-intake';
  const { user, saved } = await openProject(databaseName);
  await user.click(screen.getByRole('tab', { name: '아이디어 붙여넣기' }));
  const original = screen.getByRole('textbox', { name: '원문 입력' });
  await user.click(original);
  await user.paste('Locations\n- 숲의 수문 🌙\n- East Gate');
  await user.click(screen.getByRole('button', { name: '규칙으로 정리' }));
  const row = screen.getByRole('group', { name: '숲의 수문 🌙' });
  const checkbox = within(row).getByRole('checkbox', { name: '소재 포함' });
  const draft = within(row).getByRole('textbox', { name: '소재 내용' });
  await user.click(checkbox);
  await user.clear(draft);
  await user.click(draft);
  await user.paste('숲의 수문 🌙 · Secret sluice');
  await user.selectOptions(screen.getByRole('combobox', { name: '인터페이스 언어' }), 'en');

  expect(screen.getByRole('button', { name: 'Add selected fragments' })).toBeEnabled();
  expect(within(row).getByRole('checkbox', { name: 'Include fragment' })).toBe(checkbox);
  expect(checkbox).toBeChecked();
  expect(draft).toHaveValue('숲의 수문 🌙 · Secret sluice');
  await user.click(within(row).getByText('Source evidence · occurrence 1'));
  expect(within(row).getByText('- 숲의 수문 🌙', { selector: 'mark' })).toBeVisible();
  expect((await listProjects(databaseName)).projects).toEqual([saved]);
  expect(fetch.mock.calls.filter(([, request]) => request?.method === 'POST')).toHaveLength(0);
});

test('an unknown provider diagnostic stays readable in technical details and round-trips to English', async () => {
  const fetch = mockGeneration();
  const { user } = await openProject('locale-unknown-diagnostic');
  const generate = screen.getByRole('button', { name: '스토리 후보 생성' });
  await waitFor(() => expect(generate).toBeEnabled());
  await user.click(generate);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('기술 세부 정보');
  await user.click(screen.getByText('기술 세부 정보', { selector: 'summary' }));
  expect(screen.getByText('unrecognized_diagnostic', { selector: 'code' })).toBeVisible();
  expect(screen.getByText('Upstream diagnostic near Iven: A7.')).toBeVisible();
  await user.selectOptions(screen.getByRole('combobox', { name: '인터페이스 언어' }), 'en');
  expect(screen.getByRole('alert')).toHaveTextContent('Upstream diagnostic near Iven: A7.');
  expect(fetch.mock.calls.filter(([, request]) => request?.method === 'POST')).toHaveLength(1);
});
