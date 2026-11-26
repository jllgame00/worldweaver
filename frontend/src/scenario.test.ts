import { expect, it } from 'vitest';
import { createProject } from './project';
import { isProject } from './validation';
import { listProjects, saveProject } from './storage';

export const settings = {
  scale: 'short',
  chapterCount: 1,
  branching: 'linear',
  mainQuests: 'strong',
  sideQuests: 'none',
  endings: 'single',
  instructions: '',
} as const;

it('round-trips a recoverable scenario draft and its independent layout', async () => {
  const project = createProject('Journey');
  const scenario = {
    id: 'scenario-one',
    sourceNarrativeId: 'prior-narrative',
    title: 'Journey',
    summary: 'Return home',
    approved: false,
    settings,
    chapters: [{ id: 'opening', title: 'Opening', purpose: 'Meet', summary: 'Arrival' }],
    locations: [],
    geography: [],
    factIds: [],
    contentIds: [],
    layout: [{ nodeId: 'arrival', x: -40, y: 55 }],
  };
  const draft = {
    ...project,
    versions: { ...project.versions, narrative: 1 },
    scenario,
    basis: { scenario: { narrative: 0, content: 0 } },
    nodes: [
      {
        id: 'arrival',
        kind: 'event' as const,
        title: 'Arrival',
        description: 'Meet the pilot',
        chapterId: 'opening',
        mandatory: true,
        characterIds: [],
        requiresVisited: [],
      },
    ],
  };
  expect(isProject(draft)).toBe(true);
  const db = crypto.randomUUID();
  await saveProject(db, draft);
  expect((await listProjects(db)).projects[0]!.project).toEqual(draft);
});
