import { useEnglishTestLocale } from './englishTestLocale';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import fixture from '../../docs/examples/salt-census.json';
import App from './App';
import { editContent } from './project';
import { listProjects, saveProject } from './storage';
import { isProject, type GenerationStatus } from './validation';

const source = [
  '  🌙 물은 기억한다.',
  '인물: 해온',
  '',
  'Locations',
  '- 물시계 광장',
  '* East Sluice',
  'Other notes',
  '- 물은 기억한다.',
  'Maybe the gate opens at dawn?',
  '',
].join('\n');

const live = {
  mode: 'live', provider: 'chatkhu', api: 'responses', model: 'test-model', available: true,
} satisfies GenerationStatus;
const unavailable = { ...live, available: false, message: 'No credentials configured.' };

async function openIntake(
  databaseName: string,
  provider: GenerationStatus = unavailable,
  reply?: () => Response,
) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/generation') return Response.json(provider);
    if (url === '/api/content/extract' && init?.method === 'POST' && reply) return reply();
    throw new Error('Unexpected request in the content intake test');
  });
  vi.stubGlobal('fetch', fetch);

  const project: unknown = structuredClone(fixture);
  if (!isProject(project)) throw new Error('The canonical example failed validation');
  const saved = await saveProject(databaseName, project);
  const read = async () => (await listProjects(databaseName)).projects;
  const postRequests = () => fetch.mock.calls.filter(([, init]) => init?.method === 'POST');

  const user = userEvent.setup();
  const app = render(<App databaseName={databaseName} />);
  await user.click(await screen.findByRole('button', { name: 'Open ' + project.title }));
  const navigation = await screen.findByRole('navigation');
  await user.click(within(navigation).getByRole('button', { name: /^content$/i }));
  expect(screen.getByRole('region', { name: 'Fragments' })).toBeVisible();
  await user.click(screen.getByRole('tab', { name: /paste ideas/i }));
  const input = screen.getByRole('textbox', { name: /original (input|text)/i });
  await user.click(input);
  await user.paste(source);
  expect(input).toHaveValue(source);
  return { user, app, input, saved, read, postRequests };
}

const localAction = () => screen.getByRole('button', { name: /organize with rules/i });
const review = () => screen.findByRole('region', { name: /review draft fragments/i });

test('B1 retains the original and the entire saved project after a provider timeout', async () => {
  const reply = vi.fn(() => Response.json({
    error: { code: 'provider_timeout', message: 'The generation deadline expired.' },
  }, { status: 504 }));
  const { user, input, saved, read, postRequests } = await openIntake('ww-intake-timeout', live, reply);

  await user.click(screen.getByRole('button', { name: /suggest with ai/i }));
  await user.click(screen.getByRole('button', { name: /authorize one extraction/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/timed out|deadline/i);
  expect(localAction()).toBeEnabled();
  expect(input).toHaveValue(source);
  expect(await read()).toEqual([saved]);
  expect(reply).toHaveBeenCalledTimes(1);
  const posts = postRequests();
  expect(posts).toHaveLength(1);
  const request = posts[0]?.[1];
  expect(JSON.parse(String(request?.body))).toMatchObject({
    sourceText: source,
    projectId: saved.project.id,
    baseRevision: saved.project.revision,
  });
});

test('B2 uses only local rules without credentials and records one recoverable fallback', async () => {
  const { user, app, input, saved, read, postRequests } = await openIntake('ww-intake-local');
  expect(await screen.findByText('No credentials configured.')).toBeVisible();
  const history = () => within(screen.getByRole('region', { name: /intake history/i }));
  const previousHistory = screen.queryByRole('region', { name: /intake history/i });
  if (previousHistory) expect(within(previousHistory).queryByText(/deterministic fallback/i)).toBeNull();

  await user.click(localAction());
  const draft = within(await review());
  expect(draft.getByText(/deterministic fallback/i)).toBeVisible();
  for (const [entry, category] of [
    ['해온', 'character'], ['물시계 광장', 'location'], ['East Sluice', 'location'],
  ]) {
    const row = within(draft.getByRole('group', { name: entry }));
    expect(row.getByRole('textbox')).toBeEnabled();
    expect(row.getByRole('textbox')).toHaveValue(entry);
    expect(row.getByRole('combobox', { name: /category/i })).toHaveValue(category);
  }
  const ambiguous = within(draft.getByRole('group', { name: /needs review/i }));
  expect(ambiguous.getByText('🌙 물은 기억한다.')).toBeVisible();
  expect(ambiguous.getByText('- 물은 기억한다.')).toBeVisible();
  expect(ambiguous.getByText('Maybe the gate opens at dawn?')).toBeVisible();
  expect(draft.getAllByRole('combobox', { name: /category/i })).toHaveLength(3);
  expect(input).toHaveValue(source);
  expect(await history().findByText(/deterministic fallback.*(completed|succeeded)/i)).toBeVisible();
  expect(await read()).toEqual([saved]);

  app.unmount();
  render(<App databaseName="ww-intake-local" />);
  await user.click(await screen.findByRole('button', { name: 'Open ' + saved.project.title }));
  const navigation = await screen.findByRole('navigation');
  await user.click(within(navigation).getByRole('button', { name: /^content$/i }));
  await user.click(screen.getByRole('tab', { name: /paste ideas/i }));
  expect(await screen.findByRole('textbox', { name: /original (input|text)/i })).toHaveValue(source);
  expect(within(await review()).getByRole('group', { name: '해온' })).toBeVisible();
  expect(await history().findByText(/deterministic fallback.*(completed|succeeded)/i)).toBeVisible();
  expect(history().getAllByText(/deterministic fallback/i)).toHaveLength(1);
  expect(postRequests()).toHaveLength(0);
  expect(await read()).toEqual([saved]);
});

test('B3 retains the original and offers manual or local editing after AI output is rejected', async () => {
  const { user, input, saved, read, postRequests } = await openIntake('ww-intake-rejected-ai', live, () =>
    Response.json({
      error: { code: 'invalid_provider_response', message: 'Invalid structured extraction output.' },
    }, { status: 502 }));

  await user.click(screen.getByRole('button', { name: /suggest with ai/i }));
  await user.click(screen.getByRole('button', { name: /authorize one extraction/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/invalid|could not read/i);
  expect(screen.queryByRole('region', { name: /review draft fragments/i })).toBeNull();
  expect(localAction()).toBeEnabled();
  expect(input).toHaveValue(source);
  await user.click(screen.getByRole('tab', { name: /edit fragments/i }));
  expect(within(screen.getByRole('region', { name: 'Fragments' })).getByRole('textbox', { name: 'Fragment' })).toBeEnabled();
  expect(await read()).toEqual([saved]);
  expect(postRequests()).toHaveLength(1);
});

test('B4 rejecting a reviewed draft preserves the input and the saved project', async () => {
  const { user, input, saved, read } = await openIntake('ww-intake-reject');
  await user.click(localAction());
  const draft = within(await review());
  expect(await read()).toEqual([saved]);

  await user.click(draft.getByRole('button', { name: /reject draft/i }));

  await waitFor(() => expect(screen.queryByRole('region', { name: /review draft fragments/i })).toBeNull());
  expect(input).toHaveValue(source);
  expect(localAction()).toBeEnabled();
  expect(await read()).toEqual([saved]);
});

async function selectOneFragment(user: ReturnType<typeof userEvent.setup>) {
  const draft = within(await review());
  const selected = within(draft.getByRole('group', { name: '해온' }));
  const include = selected.getByRole<HTMLInputElement>('checkbox', { name: /include/i });
  for (const checkbox of draft.getAllByRole<HTMLInputElement>('checkbox', { name: /include/i })) {
    if (checkbox.checked !== (checkbox === include)) await user.click(checkbox);
  }
  const editor = selected.getByRole('textbox');
  await user.clear(editor);
  await user.type(editor, '해온 — keeper of the sluice');
  return draft.getByRole('button', { name: /add selected fragments/i });
}

test('B4 only explicit acceptance adds the selected edited fragment in one revision', async () => {
  const { user, saved, read } = await openIntake('ww-intake-accept');
  await user.click(localAction());
  const accept = await selectOneFragment(user);
  expect(await read()).toEqual([saved]);

  await user.click(accept);

  await waitFor(async () => {
    const [current] = await read();
    if (!current) throw new Error('The saved project is missing after acceptance');
    const before = saved.project;
    expect(current.project.revision).toBe(before.revision + 1);
    expect(current.project.versions.content).toBe(before.versions.content + 1);
    expect(current.project.userContent).toEqual([
      ...before.userContent,
      expect.objectContaining({ text: '해온 — keeper of the sluice', category: 'character' }),
    ]);
    expect(current.project.canonicalFacts).toEqual(before.canonicalFacts);
  });
});

test('B4 rejects acceptance of a draft when a newer canonical revision has been saved', async () => {
  const databaseName = 'ww-intake-stale';
  const { user, input, saved, read } = await openIntake(databaseName);
  await user.click(localAction());
  const accept = await selectOneFragment(user);
  const newer = editContent(saved.project, {
    userContent: [...saved.project.userContent, {
      id: 'fragment-intake-concurrent', category: 'idea', treatment: 'optional', text: 'Saved in another tab.',
    }],
  });
  const concurrent = await saveProject(databaseName, newer, saved.token);

  await user.click(accept);

  expect(await screen.findByRole('alert')).toHaveTextContent(/changed|out of date|stale|conflict|another tab/i);
  expect(input).toHaveValue(source);
  expect(await read()).toEqual([concurrent]);
});

useEnglishTestLocale();
