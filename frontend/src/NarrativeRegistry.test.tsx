import { useEnglishTestLocale } from './englishTestLocale';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Narrative from './Narrative';
import ScenarioRelink from './ScenarioRelink';
import example from '../../docs/examples/salt-census.json';
import type { Project } from './project.generated';

it('prepares a missing character inside a rejected draft when no registered substitute exists', async () => {
  const p = structuredClone(example) as unknown as Project;
  const node = { ...p.nodes[0]!, characterIds: ['missing-witness'] };
  const design = {
    nodes: [node],
    edges: [],
    quests: [],
    endings: [],
    scenario: {
      id: 'draft',
      title: '명부',
      summary: '기록',
      approved: false,
      sourceNarrativeId: p.narrative!.id,
      settings: {
        scale: 'short',
        chapterCount: 1,
        branching: 'linear',
        mainQuests: 'strong',
        sideQuests: 'none',
        endings: 'single',
        instructions: '',
      },
      chapters: [],
      locations: [],
      geography: [],
      layout: [],
      factIds: [],
      contentIds: [],
    },
  };
  const path = '/nodes/0/characterIds/0';
  render(
    <ScenarioRelink
      project={p}
      recovery={{
        baseRevision: p.revision,
        design,
        additions: { characters: [], factions: [], stateEntities: [] },
      }}
      findings={[
        { fieldPath: path, referenceId: 'missing-witness', entityIds: [node.id], expectedType: 'character' },
      ]}
      onProposal={() => {}}
    />,
  );
  fireEvent.click(screen.getByText('Relink rejected references'));
  fireEvent.change(screen.getByLabelText('Entity name'), { target: { value: '증인' } });
  fireEvent.change(screen.getByLabelText('Character role'), { target: { value: '서명한다' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add entity to proposal' }));
  expect(await screen.findByRole('option', { name: /증인 · character-/ })).toBeTruthy();
  expect(p).toEqual(example);
});
it('registers a cast identity without changing approved prose or making a provider request', async () => {
  const p = structuredClone(example) as unknown as Project;
  const commit = vi.fn(async (_next: Project) => true);
  const { rerender } = render(
    <Narrative project={p} narrative={p.narrative!} disabled={false} inspect={() => {}} commit={commit} />,
  );
  fireEvent.change(screen.getByLabelText('Entity name'), { target: { value: '서기' } });
  fireEvent.change(screen.getByLabelText('Character role'), { target: { value: '원본 명부를 보관한다.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Register entity' }));
  expect(commit).toHaveBeenCalledTimes(1);
  const added = commit.mock.calls[0]![0];
  expect(added.narrative).toEqual(p.narrative);
  expect(added.characters.at(-1)).toMatchObject({ name: '서기', role: '원본 명부를 보관한다.' });
  expect(added.revision).toBe(p.revision + 1);
  rerender(
    <Narrative
      project={added}
      narrative={added.narrative!}
      disabled={false}
      inspect={() => {}}
      commit={commit}
    />,
  );
  expect(await screen.findByText(added.characters.at(-1)!.id)).toBeTruthy();
});

useEnglishTestLocale();
