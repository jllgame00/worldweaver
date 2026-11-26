import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import App from './App';
import { acceptBatch, createProject as newProject, editContent } from './project';
import type { AgentRun, Project, StoryCandidate } from './project.generated';
import { listProjects, saveProject } from './storage';

const mockProvider = { mode: 'mock', available: true, provider: 'mock', model: 'development-mock' };
const liveProvider = { mode: 'live', available: true, provider: 'openai', model: 'gpt-4.1-mini' };

function stubGeneration(
  generate: (project: Project, init?: RequestInit) => Response | Promise<Response> = (project) => Response.json(response(project)),
  provider = () => Promise.resolve(Response.json(mockProvider)),
) {
  const post = vi.fn(generate);
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === '/api/generation') return provider();
    if (url === '/api/candidates') return post(JSON.parse(String(init?.body)), init);
    throw new Error(`Unexpected fetch ${url}`);
  });
  return post;
}

function response(project: Project, mode: AgentRun['mode'] = 'mock') {
  const candidates: StoryCandidate[] = ['Open the aqueduct', 'Expose the council', 'Abandon the port'].map((title, index) => ({
    id: `candidate-${project.revision}-${index}`,
    story: {
      title, genre: 'Mystery', tone: 'Quiet', premise: `A surveyor must ${title.toLowerCase()}.`,
      conflict: `The port can save district ${index + 1}.`, motivation: 'Protect the witnesses.',
      opposition: 'A guarded council', background: 'The old charter concealed the flood history.',
      progression: [title, 'Answer the witnesses'], possibleEndings: [`District ${index + 1} decides who can return.`],
    },
    coverage: project.userContent.map(({ id, treatment }) => ({
      contentId: id, disposition: treatment === 'excluded' ? 'excluded' : 'incorporated', reason: 'The draft accounts for this fragment.',
    })),
  }));
  return {
    baseRevision: project.revision,
    candidates,
    run: { id: `run-${project.revision}`, stage: 'candidates', baseRevision: project.revision, mode, status: 'proposed', repairAttempts: 0,
      receipts: [{ tool: 'generate_structured', outcome: 'passed', detail: 'Response received' },
        { tool: 'check_candidates', outcome: 'passed', detail: 'Structure and coverage passed' }], calls: 1 } satisfies AgentRun,
  };
}

async function createProject(databaseName: string) {
  const user = userEvent.setup();
  const app = render(<App databaseName={databaseName} />);
  await user.click(await screen.findByRole('button', { name: 'New project' }));
  await user.type(screen.getByLabelText('Project title'), 'The Water Archive');
  await user.click(screen.getByRole('button', { name: 'Create project' }));
  await user.type(await screen.findByLabelText('Fragment'), '물과 기록의 도시');
  await user.click(screen.getByRole('button', { name: 'Add fragment' }));
  await within(screen.getByRole('region', { name: 'Fragments' })).findByText('물과 기록의 도시');
  return { user, app };
}

test('chooses the requested direction and creates a draft directly from that candidate', async () => {
  stubGeneration();
  const { user } = await createProject('ww-choose');
  expect(await screen.findByText('Development mock provider')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Generate directions' }));
  const card = await screen.findByRole('article', { name: 'Expose the council' });
  await user.click(within(card).getByRole('button', { name: 'Choose direction' }));

  expect(await screen.findByLabelText('Narrative title')).toHaveValue('Expose the council');
  expect(screen.getByLabelText('Premise')).toHaveValue('A surveyor must expose the council.');
  expect(screen.getByRole('button', { name: 'Approve narrative' })).toBeDisabled();
});

test('reopens approved edits with the original source candidate and preserves the source snapshot', async () => {
  stubGeneration();
  const { user, app } = await createProject('ww-edit');
  await user.click(screen.getByRole('button', { name: 'Generate directions' }));
  const card = await screen.findByRole('article', { name: 'Open the aqueduct' });
  await user.click(within(card).getByRole('button', { name: 'Choose direction' }));

  const premise = await screen.findByLabelText('Premise');
  await user.clear(premise);
  await user.type(premise, '기록관은 두 마을에 관개 수로를 돌려준다.');
  await user.click(screen.getByRole('button', { name: 'Save narrative edits' }));
  const review = screen.getByLabelText('I reviewed this narrative against the pinned facts and current fragments.');
  await waitFor(() => expect(review).toBeEnabled());
  await user.click(review);
  await user.click(screen.getByRole('button', { name: 'Approve narrative' }));
  await screen.findByText('Approved narrative');
  app.unmount();

  render(<App databaseName="ww-edit" />);
  await user.click(await screen.findByRole('button', { name: 'Open The Water Archive' }));
  expect(await screen.findByLabelText('Premise')).toHaveValue('기록관은 두 마을에 관개 수로를 돌려준다.');
  expect(screen.getByText('Approved narrative')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'View source direction' }));
  expect(await screen.findByText('A surveyor must open the aqueduct.')).toBeVisible();
});

test('drops an in-flight response after a fragment edit', async () => {
  let reply: (() => void) | undefined;
  stubGeneration((project) => new Promise<Response>((resolve) => {
    reply = () => resolve(Response.json(response(project)));
  }));
  const { user } = await createProject('ww-stale');
  await user.click(screen.getByRole('button', { name: 'Generate directions' }));
  await screen.findByRole('button', { name: 'Cancel generation' });
  await user.type(screen.getByLabelText('Fragment'), 'A second village remembers the breach.');
  await user.click(screen.getByRole('button', { name: 'Add fragment' }));
  reply?.();

  expect(await screen.findByText(/generated directions were discarded/i)).toBeVisible();
  expect(within(screen.getByRole('region', { name: 'Fragments' })).getByText('A second village remembers the breach.')).toBeVisible();
  expect(screen.queryByRole('article', { name: 'Open the aqueduct' })).toBeNull();
});

test('leaves the saved narrative untouched when the designer declines replacement', async () => {
  stubGeneration();
  const { user } = await createProject('ww-decline');
  await user.click(screen.getByRole('button', { name: 'Generate directions' }));
  const card = await screen.findByRole('article', { name: 'Open the aqueduct' });
  await user.click(within(card).getByRole('button', { name: 'Choose direction' }));
  const narrative = await screen.findByLabelText('Narrative title');
  await user.clear(narrative);
  await user.type(narrative, 'A canal for every village');
  await user.click(screen.getByRole('button', { name: 'Save narrative edits' }));
  const generate = screen.getByRole('button', { name: 'Generate directions' });
  await waitFor(() => expect(generate).toBeEnabled());
  await user.click(generate);

  expect(await screen.findByRole('heading', { name: 'Review replacement directions' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Keep current draft' }));

  expect(screen.getByLabelText('Narrative title')).toHaveValue('A canal for every village');
  expect(screen.getByRole('button', { name: 'View source direction' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Review replacement directions' })).toBeNull();
});

test('cancellation discards a response even when transport still resolves', async () => {
  let reply: (() => void) | undefined;
  stubGeneration((project) => new Promise<Response>((resolve) => {
    reply = () => resolve(Response.json(response(project)));
  }));
  const { user } = await createProject('ww-cancel');
  await user.click(screen.getByRole('button', { name: 'Generate directions' }));
  await user.click(await screen.findByRole('button', { name: 'Cancel generation' }));
  await act(async () => { reply?.(); });

  expect(screen.getByText('Generation cancelled.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Story directions' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Generate directions' })).toBeEnabled();
});

test('keeps unfinished narrative edits while the designer inspects the source direction', async () => {
  stubGeneration();
  const { user } = await createProject('ww-unsaved-navigation');
  await user.click(screen.getByRole('button', { name: 'Generate directions' }));
  const card = await screen.findByRole('article', { name: 'Open the aqueduct' });
  await user.click(within(card).getByRole('button', { name: 'Choose direction' }));
  const premise = await screen.findByLabelText('Premise');
  await user.clear(premise);
  await user.type(premise, 'A new draft to keep reviewing.');
  await user.click(screen.getByRole('button', { name: 'View source direction' }));
  await user.click(await screen.findByRole('button', { name: 'Back to narrative' }));

  expect(screen.getByLabelText('Premise')).toHaveValue('A new draft to keep reviewing.');
  expect(screen.getByRole('button', { name: 'Save narrative edits' })).toBeEnabled();
});

test('reports unavailable live configuration and keeps the editor usable', async () => {
  const post = stubGeneration(undefined, async () => Response.json({
    ...liveProvider, available: false, message: 'Configure OPENAI_API_KEY on the server to enable live generation.',
  }));
  const { user } = await createProject('ww-live-unavailable');
  expect(await screen.findByText('Live AI provider · gpt-4.1-mini')).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent('Configure OPENAI_API_KEY on the server');
  const generate = screen.getByRole('button', { name: 'Generate directions' });
  expect(generate).toBeDisabled();
  await user.click(generate);
  expect(post).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Fragment')).toBeEnabled();
});

test('keeps generation disabled until it can confirm the configured provider', async () => {
  let reply: ((value: Response) => void) | undefined;
  const provider = vi.fn(() => Promise.resolve(Response.json(mockProvider)));
  provider.mockImplementationOnce(() => new Promise((resolve) => { reply = resolve; }));
  stubGeneration(undefined, provider);
  const { user } = await createProject('ww-provider-loading');
  expect(screen.getByText('Checking generation availability…')).toBeVisible();
  const generate = screen.getByRole('button', { name: 'Generate directions' });
  expect(generate).toBeDisabled();
  await act(async () => { reply?.(Response.json({ ...mockProvider, available: 'yes' })); });
  expect(await screen.findByRole('alert')).toHaveTextContent('Generation availability could not be confirmed.');
  expect(generate).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Check generation again' }));
  await waitFor(() => expect(generate).toBeEnabled());
  expect(screen.getByText('Development mock provider')).toBeVisible();
});

test('shows live generation progress and the saved live batch', async () => {
  let reply: (() => void) | undefined;
  stubGeneration((project) => new Promise<Response>((resolve) => {
    reply = () => resolve(Response.json(response(project, 'live')));
  }), async () => Response.json(liveProvider));
  const { user } = await createProject('ww-live-generate');
  expect(await screen.findByText('Live AI provider · gpt-4.1-mini')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Generate directions' }));
  expect(screen.getByText('Generating three story directions…')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Cancel generation' })).toBeEnabled();
  await act(async () => { reply?.(); });

  expect(await screen.findByText('Three story directions generated and saved.')).toHaveAttribute('role', 'status');
  expect(screen.getByText('Direction source · Live AI')).toBeVisible();
  expect(screen.getAllByRole('article')).toHaveLength(3);
});

test('refreshes changed generation configuration and waits for another explicit request', async () => {
  let refresh: ((value: Response) => void) | undefined;
  const provider = vi.fn(() => Promise.resolve(Response.json(mockProvider)));
  provider.mockImplementationOnce(() => Promise.resolve(Response.json(mockProvider)))
    .mockImplementationOnce(() => new Promise((resolve) => { refresh = resolve; }));
  const post = stubGeneration((project) => Response.json(response(project, 'live')), provider);
  post.mockReturnValueOnce(Response.json({
    error: {
      code: 'generation_configuration_changed',
      message: 'Generation configuration changed. Review the provider and start generation again.',
    },
  }, { status: 409 }));

  const { user } = await createProject('ww-provider-changed');
  expect(await screen.findByText('Development mock provider')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Generate directions' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Generation configuration changed.');
  expect(new Headers(post.mock.calls[0]?.[1]?.headers).get('X-Worldweaver-Generation')).toBe('mock:development-mock');
  expect(await screen.findByText('Checking generation availability…')).toBeVisible();
  const generate = screen.getByRole('button', { name: 'Generate directions' });
  expect(generate).toBeDisabled();

  await act(async () => { refresh?.(Response.json(liveProvider)); });
  expect(await screen.findByText('Live AI provider · gpt-4.1-mini')).toBeVisible();
  expect(post).toHaveBeenCalledTimes(1);
  expect(screen.queryAllByRole('article')).toHaveLength(0);
  await user.click(generate);
  expect(await screen.findByText('Direction source · Live AI')).toBeVisible();
  expect(new Headers(post.mock.calls[1]?.[1]?.headers).get('X-Worldweaver-Generation')).toBe('live:gpt-4.1-mini');
  expect(post).toHaveBeenCalledTimes(2);
});

test.each([
  { api: 'responses', model: 'gpt-4.1-mini', fingerprint: 'chatkhu:responses:gpt-4.1-mini' },
  { api: 'chat_completions', model: 'vendor/model-v1', fingerprint: 'chatkhu:chat_completions:vendor/model-v1' },
])('refreshes ChatKHU Gateway $api intent and waits for a new click', async ({ api, model, fingerprint }) => {
  const provider = vi.fn(async () => Response.json({ ...liveProvider, provider: 'chatkhu', api, model }));
  provider.mockResolvedValueOnce(Response.json(liveProvider));
  const post = stubGeneration((project) => Response.json(response(project, 'live')), provider);
  post.mockReturnValueOnce(Response.json({
    error: { code: 'generation_configuration_changed', message: 'Generation configuration changed.' },
  }, { status: 409 }));
  const { user } = await createProject(`ww-chatkhu-${api}`);
  await user.click(screen.getByRole('button', { name: 'Generate directions' }));
  expect(await screen.findByText(`ChatKHU Gateway · ${model}`)).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent('Generation configuration changed.');
  expect(post).toHaveBeenCalledTimes(1);
  expect(new Headers(post.mock.calls[0]?.[1]?.headers).get('X-Worldweaver-Generation')).toBe('live:gpt-4.1-mini');

  await user.click(screen.getByRole('button', { name: 'Generate directions' }));
  expect(await screen.findByText('Direction source · Live AI')).toBeVisible();
  expect(post).toHaveBeenCalledTimes(2);
  expect(new Headers(post.mock.calls[1]?.[1]?.headers).get('X-Worldweaver-Generation')).toBe(fingerprint);
});

test('rejects results recorded under a different generation mode', async () => {
  const post = stubGeneration((project) => Response.json(response(project, 'live')));
  const { user } = await createProject('ww-provider-mismatch');
  await user.click(screen.getByRole('button', { name: 'Generate directions' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Generation returned an invalid result.');
  expect(screen.getByText('Development mock provider')).toBeVisible();
  expect(screen.queryAllByRole('article')).toHaveLength(0);
  expect(post).toHaveBeenCalledTimes(1);
});

test('keeps historical mock provenance after a live validation failure and reopen', async () => {
  stubGeneration();
  const { user, app } = await createProject('ww-candidate-origin');
  await user.click(screen.getByRole('button', { name: 'Generate directions' }));
  expect(await screen.findByText('Direction source · Development mock')).toBeVisible();
  app.unmount();

  const post = stubGeneration((project) => Response.json({
    error: {
      code: 'invalid_candidates', message: 'Candidate validation failed. Review your input and retry.',
      run: { ...response(project, 'live').run, status: 'failed' },
    },
  }, { status: 422 }), async () => Response.json(liveProvider));
  const reopened = render(<App databaseName="ww-candidate-origin" />);
  await user.click(await screen.findByRole('button', { name: 'Open The Water Archive' }));
  expect(await screen.findByText('Live AI provider · gpt-4.1-mini')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Generate directions' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Candidate validation failed.');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate directions' })).toBeEnabled());
  expect(post).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Live AI provider · gpt-4.1-mini')).toBeVisible();
  expect(screen.getByText('Direction source · Development mock')).toBeVisible();
  expect(screen.getAllByRole('article')).toHaveLength(3);
  reopened.unmount();

  render(<App databaseName="ww-candidate-origin" />);
  await user.click(await screen.findByRole('button', { name: 'Open The Water Archive' }));
  const card = await screen.findByRole('article', { name: 'Open the aqueduct' });
  await user.click(within(card).getByRole('button', { name: 'Inspect direction' }));
  expect(await screen.findByText('Direction source · Development mock')).toBeVisible();
});

test('shows an unknown source for a saved batch with no generation run', async () => {
  const name = 'ww-candidate-origin-unknown';
  const project = newProject('Historical directions');
  const { candidates, run } = response(project);
  const [first, second, third] = candidates;
  if (!first || !second || !third) throw new Error('Expected three candidate fixtures');
  await saveProject(name, { ...acceptBatch(project, [first, second, third], run), runs: [] });
  stubGeneration();
  const user = userEvent.setup();
  render(<App databaseName={name} />);
  await user.click(await screen.findByRole('button', { name: 'Open Historical directions' }));
  expect(await screen.findByText('Direction source · Unknown')).toBeVisible();
});

test('creates and reopens the development sample without replacing a same-titled project', async () => {
  const databaseName = 'ww-forgotten-moon';
  const title = '잊혀진 달';
  const original = editContent(newProject(title), {
    userContent: [{ id: 'fragment-original', category: 'idea', treatment: 'mandatory', text: 'Existing personal fragment' }],
  });
  const originalRecord = await saveProject(databaseName, original);
  const post = stubGeneration();
  const user = userEvent.setup();
  const app = render(<App databaseName={databaseName} />);

  await user.click(await screen.findByRole('button', { name: title }));
  await screen.findByText('Saved locally');
  expect(screen.getByRole('heading', { name: 'Project content' })).toBeVisible();
  const { projects, unreadable } = await listProjects(databaseName);
  expect(unreadable).toBe(false);
  expect(projects).toHaveLength(2);
  expect(projects.find(({ project }) => project.id === original.id)).toEqual(originalRecord);
  const sample = projects.find(({ project }) => project.id !== original.id)?.project;
  if (!sample) throw new Error('Expected a new project');
  expect(sample.schemaVersion).toBe(original.schemaVersion);
  expect(sample.userContent.map(({ category, treatment, text }) => [category, treatment, text])).toEqual([
    ['idea', 'mandatory', '세계를 구할수록 자신의 정체성을 잃어가는 방랑 기사의 이야기'],
    ['genre', 'mandatory', '다크 판타지 액션 RPG'],
    ['theme', 'mandatory', '기억과 정체성, 희생, 구원, 쇠락한 세계에서의 희망'],
    ['character', 'mandatory', '죽은 사람의 기억을 읽을 수 있는 방랑 기사'],
    ['faction', 'mandatory', '사라진 달의 귀환을 숭배하는 비밀 교단'],
    ['creature', 'optional', '기억을 잃어버린 인간이 변이하여 탄생한 괴물'],
    ['item', 'optional', '죽은 사람의 마지막 기억을 보존하는 검은 수정'],
    ['location', 'mandatory', '몰락한 왕국, 지하도시, 검은 숲'],
    ['history', 'mandatory', '100년 전 달이 사라지면서 대륙의 문명이 쇠퇴하기 시작했다.'],
    ['mechanic', 'mandatory', '마법을 사용할 때마다 자신의 기억을 잃는다.'],
    ['ending', 'optional', '세계의 구원과 주인공의 정체성 보존 사이에서 선택하는 여운이 남는 결말'],
    ['constraint', 'excluded', '시간 여행, 평행세계'],
  ]);
  expect(sample.canonicalFacts.map(({ statement }) => statement)).toEqual([
    '달은 정확히 100년 전에 사라졌다.',
    '마법 사용으로 잃어버린 기억은 되돌릴 수 없다.',
    '주인공은 죽은 사람의 기억을 읽을 수 있지만 자신의 잃어버린 기억은 복구할 수 없다.',
  ]);

  app.unmount();
  render(<App databaseName={databaseName} />);
  const buttons = await screen.findAllByRole('button', { name: `Open ${title}` });
  expect(buttons).toHaveLength(2);
  const sampleButton = buttons[projects.findIndex(({ project }) => project.id === sample.id)];
  if (!sampleButton) throw new Error('Expected a saved sample in the project list');
  await user.click(sampleButton);
  expect(await screen.findByText('달은 정확히 100년 전에 사라졌다.')).toBeVisible();
  expect((await listProjects(databaseName)).projects).toEqual(projects);
  expect(post).not.toHaveBeenCalled();
});
