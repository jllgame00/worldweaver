import { useEnglishTestLocale } from './englishTestLocale';
﻿import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import example from '../../docs/examples/salt-census.json';
import ScenarioEditor from './ScenarioEditor';
import { isProject } from './validation';
import type { Project } from './project.generated';

function studio(rejectSave = false) {
  const revised = vi.fn();
  const commits = vi.fn();
  function Workspace() {
    const [project, setProject] = useState<Project>(() => {
      const p: unknown = structuredClone(example);
      if (!isProject(p)) throw new Error('Invalid test fixture');
      p.scenario = { id: 'scenario', title: 'Salt census', summary: 'Recover the roll.', approved: false,
        sourceNarrativeId: p.narrative!.id, chapters: [], locations: [], geography: [], factIds: [], contentIds: [], layout: [],
        settings: { scale: 'short', chapterCount: 2, branching: 'branching', mainQuests: 'strong', sideQuests: 'some', endings: 'multiple', instructions: '' } };
      p.nodes[0]!.conditions = [{ kind: 'flag', key: 'q-rubbing', value: 'unlocked' }];
      p.nodes[0]!.consequences = [{ kind: 'quest', key: 'q-rubbing', value: 'started' }];
      return p;
    });
    return <ScenarioEditor project={project} revise={revised}
      findings={[{ rule: 'quest', entityIds: ['q-rubbing'], severity: 'warning', explanation: 'Review the objective.' }]}
      edit={(mutate, layoutOnly) => {
        const next = structuredClone(project);
        mutate(next);
        commits(next, !!layoutOnly);
        if (rejectSave) return Promise.resolve(false);
        setProject(next);
        return Promise.resolve(true);
      }} />;
  }
  render(<Workspace />);
  return { user: userEvent.setup(), revised, commits };
}

test('opens a quest finding, saves its objective and preserves node and quest identities', async () => {
  const { user, commits } = studio();
  await user.click(screen.getByText('quest (1)'));
  await user.click(screen.getByRole('button', { name: /inspect q-rubbing/i }));
  const objective = screen.getByLabelText('Quest objective');
  await user.clear(objective);
  await user.type(objective, 'Compare both copies.');
  await user.click(screen.getByRole('button', { name: 'Save node' }));
  const [saved, layout] = commits.mock.lastCall!;
  expect(layout).toBe(false);
  expect(saved.quests).toContainEqual({ ...example.quests[0], objective: 'Compare both copies.' });
  expect(saved.nodes.map(({ id }: { id: string }) => id)).toEqual(example.nodes.map(({ id }) => id));
});

test('selects a branch in the outline and opens its destination ending', async () => {
  const { user, revised } = studio();
  await user.click(screen.getByRole('button', { name: 'Outline' }));
  const outline = screen.getByRole('region', { name: 'Scenario outline' });
  await user.click(within(outline).getByRole('button', { name: 'Publish the roll' }));
  expect(screen.getByLabelText('Choice label')).toHaveValue('Publish the roll');
  await user.click(screen.getByRole('button', { name: 'Inspect destination' }));
  expect(screen.getByLabelText('Ending consequence')).toHaveValue(example.endings[0]!.consequence);
  await user.click(screen.getByRole('button', { name: 'Revise selected node' }));
  expect(revised).toHaveBeenCalledWith('n-public');
});

test('confirms node deletion with its incident edges and dependent prerequisites in one edit', async () => {
  const { user, commits } = studio();
  await user.click(screen.getByText('quest (1)'));
  await user.click(screen.getByRole('button', { name: /inspect q-rubbing/i }));
  await user.click(screen.getByRole('button', { name: 'Delete node' }));
  expect(commits).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Confirm deletion' }));
  const [saved] = commits.mock.lastCall! as [Project, boolean];
  expect(saved.quests).toHaveLength(0);
  expect(saved.nodes[0]!.conditions).toEqual([{ kind: 'flag', key: 'q-rubbing', value: 'unlocked' }]);
  expect(saved.nodes[0]!.consequences).toEqual([]);
  expect(saved.nodes.some(({ id }) => id === 'n-witness')).toBe(false);
  expect(saved.edges.every((edge) => ![edge.from, edge.to, ...edge.requiresVisited].includes('n-witness'))).toBe(true);
});


test('keeps an unsaved new node in the inspector after storage rejects the edit', async () => {
  const { user, commits } = studio(true);
  await user.click(screen.getByRole('button', { name: 'Add node' }));
  await user.type(screen.getByLabelText('Title'), 'Cross the bridge');
  await user.type(screen.getByLabelText('Description'), 'Follow the line.');
  await user.click(screen.getByRole('button', { name: 'Save node' }));
  expect(commits).toHaveBeenCalledOnce();
  expect(screen.getByLabelText('Title')).toHaveValue('Cross the bridge');
});

test('rejects a progression cycle atomically and permits an explicit reference link', async () => {
  const { user, commits } = studio();
  await user.click(screen.getByRole('button', { name: 'Connect nodes' }));
  await user.type(screen.getByLabelText('Choice label'), 'Look back');
  await user.selectOptions(screen.getByLabelText('Source node'), 'n-gate');
  await user.selectOptions(screen.getByLabelText('Destination node'), 'n-start');
  await user.click(screen.getByRole('button', { name: 'Save connection' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/create a cycle/i);
  expect(commits).not.toHaveBeenCalled();
  await user.selectOptions(screen.getByLabelText('Connection type'), 'reference');
  await user.click(screen.getByRole('button', { name: 'Save connection' }));
  expect(commits.mock.lastCall![0].edges.at(-1)).toMatchObject({ label: 'Look back', kind: 'reference', from: 'n-gate', to: 'n-start' });
});

test('repositions a graph node from the keyboard in a layout-only transaction', async () => {
  const { user, commits } = studio();
  const graph = screen.getByRole('region', { name: 'Scenario graph' });
  within(graph).getByRole('button', { name: 'The erased line' }).focus();
  await user.keyboard('{ArrowRight}');
  const [saved, layout] = commits.mock.lastCall! as [Project, boolean];
  expect(layout).toBe(true);
  expect(saved.scenario!.layout).toEqual([{ nodeId: 'n-start', x: 42, y: 30 }]);
  expect(saved.nodes[0]?.title).toBe('The erased line');
});
test('filters the canvas by quest type while keeping the selected inspector linked', async () => {
  const { user } = studio();
  const rail = screen.getByRole('navigation', { name: 'Scenario navigation' });
  await user.selectOptions(within(rail).getByLabelText('Filter quests'), 'main');
  const canvas = screen.getByRole('region', { name: 'Scenario graph' });
  expect(within(canvas).queryByRole('button', { name: 'The erased line' })).toBeNull();
  await user.click(within(canvas).getByRole('button', { name: 'Take a rubbing' }));
  expect(screen.getByLabelText('Quest objective')).toHaveValue(example.quests[0]!.objective);
});

test('lists the names and IDs of the records affected by node deletion before confirmation', async () => {
  const { user, commits } = studio();
  await user.click(screen.getByText('quest (1)'));
  await user.click(screen.getByRole('button', { name: /inspect q-rubbing/i }));
  await user.click(screen.getByRole('button', { name: 'Delete node' }));
  const preview = screen.getByRole('alert');
  for (const id of ['e-2','e-3','e-4','e-5','q-rubbing']) expect(preview).toHaveTextContent(id);
  expect(preview).toHaveTextContent('Compare the marks');
  expect(commits).not.toHaveBeenCalled();
});

test('previews pointer movement and persists the position once on release, preserving scenario data', async () => {
  const { commits } = studio();
  const canvas = screen.getByRole('region', { name: 'Scenario graph' });
  const start = within(canvas).getByRole('button', { name: 'The erased line' });
  const svg = start.closest('svg')!;
  fireEvent.pointerDown(start, { button: 0, pointerId: 1, clientX: 32, clientY: 33 });
  fireEvent.pointerMove(svg, { pointerId: 1, clientX: 92, clientY: 103 });
  expect(commits).not.toHaveBeenCalled();
  fireEvent.pointerUp(svg, { pointerId: 1, clientX: 92, clientY: 103 });
  expect(commits).toHaveBeenCalledOnce();
  const [saved, layout] = commits.mock.lastCall! as [Project, boolean];
  expect(layout).toBe(true);
  expect(saved.scenario!.layout).toEqual([{ nodeId: 'n-start', x: 90, y: 100 }]);
});

test('adds chapters, moves their order and creates a node in the selected chapter', async () => {
  const { user, commits } = studio();
  for (const title of ['Witnesses', 'Assembly']) {
    await user.click(screen.getByRole('button', { name: 'Add chapter' }));
    await user.type(screen.getByLabelText('Title'), title);
    await user.type(screen.getByLabelText('Purpose'), 'Hear testimony');
    await user.type(screen.getByLabelText('Summary'), 'Inspect the archive');
    await user.click(screen.getByRole('button', { name: 'Save chapter' }));
  }
  await user.click(screen.getByRole('button', { name: 'Move chapter earlier' }));
  const [reordered] = commits.mock.lastCall! as [Project, boolean];
  expect(reordered.scenario!.chapters.map((ch) => ch.title)).toEqual(['Assembly','Witnesses']);
  await user.click(screen.getByRole('button', { name: 'Add node' }));
  await user.type(screen.getByLabelText('Title'), 'Reconvene');
  await user.type(screen.getByLabelText('Description'), 'Read the result aloud.');
  await user.click(screen.getByRole('button', { name: 'Save node' }));
  const [saved] = commits.mock.lastCall! as [Project, boolean];
  expect(saved.nodes.at(-1)).toMatchObject({ chapterId: reordered.scenario!.chapters[0]!.id, title: 'Reconvene' });
  expect(screen.getByLabelText('Title')).toHaveValue('Reconvene');
});

test('chooses quest state keys from typed records when adding a structured condition', async () => {
  const { user, commits } = studio();
  const conditions = screen.getByRole('group', { name: 'Entry conditions' });
  await user.click(within(conditions).getByRole('button', { name: 'Add condition' }));
  await user.selectOptions(within(conditions).getAllByLabelText('Type')[1]!, 'quest');
  const key = within(conditions).getAllByRole('combobox', { name: 'Key' }).at(-1)!;
  await user.selectOptions(key, 'q-rubbing');
  await user.type(within(conditions).getAllByLabelText('Value')[1]!, 'completed');
  await user.click(screen.getByRole('button', { name: 'Save node' }));
  expect(commits.mock.lastCall![0].nodes[0].conditions[1]).toEqual({ kind: 'quest', key: 'q-rubbing', value: 'completed' });
});

test('selects a registered legacy flag by kind without accepting arbitrary item IDs', async () => {
  const { user } = studio();
  const conditions = screen.getByRole('group', { name: 'Entry conditions' });
  const key = within(conditions).getByRole('combobox', { name: 'Key' });
  expect(key).toHaveValue('q-rubbing');
  expect(within(key).getByRole('option', { name: /q-rubbing/ })).toBeInTheDocument();
  await user.selectOptions(within(conditions).getByLabelText('Type'), 'item');
  expect(within(key).queryByRole('option', { name: /q-rubbing/ })).toBeNull();
  expect(within(conditions).queryByRole('textbox', { name: 'Key' })).toBeNull();
});

useEnglishTestLocale();
