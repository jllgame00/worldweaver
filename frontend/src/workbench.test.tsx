import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import App from './App';
import { approvedProject } from './atlasFixture.testdata';
import { Directions } from './Direction';
import { useEnglishTestLocale } from './englishTestLocale';
import { createProject } from './project';
import { saveProject, readSavedProject } from './storage';

useEnglishTestLocale();

test('a designer can compare just the endings across all directions without choosing or editing one', async () => {
  const project = approvedProject(), choose = vi.fn();
  render(<Directions project={project} fresh disabled={false} choose={choose} inspect={vi.fn()}/>);
  await userEvent.selectOptions(screen.getByRole('combobox', {name: 'Compare by'}), 'possibleEndings');
  for (const candidate of project.storyCandidates) {
    const article = within(screen.getByRole('article', { name: candidate.story.title }));
    expect(article.getByText(candidate.story.possibleEndings[0])).toBeVisible();
    expect(article.queryByText(candidate.story.background)).toBeNull();
  }
  expect(choose).not.toHaveBeenCalled();
});

test('the library can be revisited without discarding an unsaved fragment or writing to the project', async () => {
  const db = 'renewal-draft-library', project = createProject('Estuary dossier');
  const saved = await saveProject(db, project), user = userEvent.setup();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({mode:'mock', provider:'mock', model:'offline', available:true})));
  render(<App databaseName={db}/>);
  const open = () => screen.findByRole('button', {name:'Open Estuary dossier'});
  await user.click(await open());
  await user.type(await screen.findByLabelText('Fragment'), '수문 · 未保存');
  await user.click(screen.getByRole('button', {name:'Projects'}));
  await user.click(await open());
  expect(await screen.findByLabelText('Fragment')).toHaveValue('수문 · 未保存');
  expect(await readSavedProject(db, project.id)).toEqual(saved);
});
