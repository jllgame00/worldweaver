import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import App from './App';
import type { Project, StoryCandidate } from './project.generated';

function response(project: Project) {
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
    run: { id: `run-${project.revision}`, stage: 'candidates', baseRevision: project.revision, mode: 'mock', status: 'proposed', repairAttempts: 0,
      receipts: [{ tool: 'generate_structured', outcome: 'passed', detail: 'Response received' },
        { tool: 'check_candidates', outcome: 'passed', detail: 'Structure and coverage passed' }], calls: 1 },
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
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => Response.json(response(JSON.parse(String(init.body)))));
  const { user } = await createProject('ww-choose');
  await user.click(screen.getByRole('button', { name: 'Generate directions' }));
  const card = await screen.findByRole('article', { name: 'Expose the council' });
  await user.click(within(card).getByRole('button', { name: 'Choose direction' }));

  expect(await screen.findByLabelText('Narrative title')).toHaveValue('Expose the council');
  expect(screen.getByLabelText('Premise')).toHaveValue('A surveyor must expose the council.');
  expect(screen.getByRole('button', { name: 'Approve narrative' })).toBeDisabled();
});

test('reopens approved edits with the original source candidate and preserves the source snapshot', async () => {
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => Response.json(response(JSON.parse(String(init.body)))));
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
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise<Response>((resolve) => {
    reply = () => resolve(Response.json(response(JSON.parse(String(init.body)))));
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
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => Response.json(response(JSON.parse(String(init.body)))));
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
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise<Response>((resolve) => {
    reply = () => resolve(Response.json(response(JSON.parse(String(init.body)))));
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
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => Response.json(response(JSON.parse(String(init.body)))));
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
