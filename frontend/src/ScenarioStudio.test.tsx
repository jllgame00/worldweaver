import { useEnglishTestLocale } from './englishTestLocale';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import App from './App';
import { listProjects, saveProject } from './storage';
import { isProject } from './validation';
import { designOf } from './scenarioWorkflow';
import type { Project } from './project.generated';
import example from '../../docs/examples/salt-census.json';

test('previews generation, rejects and accepts explicitly, undoes edits and reopens an approved design', async () => {
  const db = crypto.randomUUID();
  if (!isProject(example)) throw Error('Invalid fixture');
  await saveProject(db, example);
  const user = userEvent.setup();
  const stored = async () => (await listProjects(db)).projects[0]!.project;
  let calls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url === '/api/generation')
        return Response.json({ available: true, model: 'mock', provider: 'mock', mode: 'mock' });
      if (url === '/api/scenario/validate')
        return Response.json({ complete: true, valid: true, findings: [], paths: [] });
      if (url !== '/api/scenario') throw Error('Unexpected request');
      const { project: p, settings } = JSON.parse(String(options?.body)) as {
        project: Project;
        settings: unknown;
      };
      calls++;
      return Response.json({
        baseRevision: p.revision,
        additions: {
          characters: [{ id: 'ch-keeper', name: 'Keeper', role: 'Seal witness', factionId: 'f-keepers' }],
          factions: [{ id: 'f-keepers', name: 'Keepers', aim: 'Preserve records.' }],
          stateEntities: [{ id: 'i-seal', name: 'Witness seal', kind: 'item' }],
        },
        run: {
          id: 'run-gen-' + calls,
          stage: 'scenario',
          mode: 'mock',
          baseRevision: p.revision,
          status: 'proposed',
          repairAttempts: 0,
          calls: 1,
          receipts: [{ tool: 'check_scenario', outcome: 'passed', detail: 'Checked' }],
        },
        design: {
          nodes: p.nodes.map((n, i) => i ? n : { ...n, characterIds: [...n.characterIds, 'ch-keeper'],
            consequences: [{ kind: 'item', key: 'i-seal', value: 'collected' }] }),
          edges: p.edges,
          quests: p.quests,
          endings: p.endings,
          scenario: {
            id: 's-one',
            title: 'Archive design',
            summary: 'Open the ledger',
            approved: false,
            sourceNarrativeId: p.narrative!.id,
            settings,
            chapters: [],
            locations: [{ id: 'l-depot', name: 'Depot', kind: 'landmark', purpose: 'Stores the ledger.' }],
            geography: [],
            contentIds: p.userContent.map((x) => x.id),
            factIds: p.canonicalFacts.map((x) => x.id),
            layout: [],
          },
        },
      });
    }),
  );
  const app = render(<App databaseName={db} />);
  const click = async (name: string) => user.click(await screen.findByRole('button', { name }));
  await click('Open ' + example.title);
  await click('Scenario Studio');
  await click('Generate scenario');
  const inventory = await screen.findByRole('region', { name: 'Proposal entities' });
  for (const label of ['ch-keeper', 'Seal witness', 'f-keepers', 'Preserve records.', 'i-seal', 'Witness seal', 'l-depot'])
    expect(inventory).toHaveTextContent(label);
  const seal = within(inventory).getByText('Witness seal').closest('li')!;
  await user.click(within(seal).getByText(/Used by/));
  expect(within(seal).getByText(/n-start.*collected/)).toBeVisible();
  expect((await stored()).scenario).toBeUndefined();
  expect((await stored()).characters).toEqual(example.characters);
  await click('Reject proposal');
  expect((await stored()).scenario).toBeUndefined();
  await click('Generate scenario');
  await click('Accept proposal');
  await waitFor(async () => expect((await stored()).scenario?.title).toBe('Archive design'));
  expect((await stored()).characters.at(-1)?.id).toBe('ch-keeper');
  await click('Undo');
  await waitFor(async () => expect((await stored()).characters).toEqual(example.characters));
  expect((await stored()).stateEntities).toBeUndefined();
  expect((await stored()).factions).toEqual(example.factions);
  await click('Redo');
  await waitFor(async () => expect((await stored()).stateEntities?.[0]?.id).toBe('i-seal'));
  await user.click(screen.getByText('Scenario overview · Archive design'));
  const title = screen.getByRole('textbox', { name: 'Scenario title' });
  await user.clear(title);
  await user.type(title, 'Edited design');
  await click('Save overview');
  await waitFor(async () => expect((await stored()).scenario?.title).toBe('Edited design'));
  await click('Undo');
  await waitFor(async () => expect((await stored()).scenario?.title).toBe('Archive design'));
  await click('Redo');
  await waitFor(async () => expect((await stored()).scenario?.title).toBe('Edited design'));
  expect(screen.getByRole('button', { name: 'Approve scenario' })).toBeDisabled();
  await click('Validate scenario');
  await user.click(screen.getByLabelText('I reviewed the branches, locked facts and narrative consequences.'));
  await click('Approve scenario');
  await waitFor(async () => expect((await stored()).scenario?.approved).toBe(true));
  app.unmount();
  render(<App databaseName={db} />);
  await click('Open ' + example.title);
  expect(await screen.findByRole('heading', { name: 'Scenario Studio' })).toBeVisible();
  expect((await stored()).narrative).toEqual(example.narrative);
  expect(calls).toBe(2);
}, 20000);

test('shows the live scenario budget and keeps a saved design after output exhaustion', async () => {
  if (!isProject(example)) throw Error('Invalid fixture');
  const project: Project = { ...example, scenario: {
    id: 'scenario-saved', sourceNarrativeId: example.narrative.id, approved: true,
    title: 'Owner-edited design', summary: 'A costly decision.', layout: [], locations: [], geography: [],
    chapters: [], factIds: example.canonicalFacts.map(f=>f.id), contentIds: example.userContent.map(f=>f.id),
    settings: {scale:'standard',chapterCount:3,branching:'branching',endings:'multiple',mainQuests:'strong',sideQuests:'some',instructions:''},
  }};
  const db = crypto.randomUUID();
  await saveProject(db, project);
  const post = vi.fn(() => Response.json({error: {
    code:'provider_output_limit',message:'The provider reached the generation token budget.',
    run:{id:'failed-run',baseRevision:project.revision,stage:'scenario',status:'failed',mode:'live',calls:1,repairAttempts:0,
      receipts:[{tool:'provider_usage',outcome:'passed',detail:'outputTokens=6000'},
        {tool:'provider_reasoning',outcome:'passed',detail:'reasoningTokens=1800'}]},
  }},{status:502}));
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>url==='/api/generation'
    ? Response.json({available:true,mode:'live',provider:'chatkhu',api:'responses',model:'gpt-6.2-sol',
      limits:{maxOutputTokens:3000,scenarioMaxOutputTokens:6000,timeoutSeconds:120}})
    : post()));
  const user=userEvent.setup();
  render(<App databaseName={db}/>);
  await user.click(await screen.findByRole('button',{name:'Open '+project.title}));
  await user.click(await screen.findByText('Generation settings'));
  expect(await screen.findByText(/1 provider request.*6000 output tokens.*120 seconds/i)).toBeVisible();
  await user.click(screen.getByRole('button',{name:'Generate scenario'}));
  const alert=await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/6000 output tokens, including 1800 reasoning tokens/i);
  const saved=(await listProjects(db)).projects[0]!.project;
  expect(saved.scenario).toEqual(project.scenario);
  expect(saved.nodes).toEqual(project.nodes);
  expect(saved.revision).toBe(project.revision);
  expect(saved.runs.at(-1)?.status).toBe('failed');
  expect(post).toHaveBeenCalledTimes(1);
});

test('groups failed proposal references by rule and shows fields, types and repair without saving the proposal', async () => {
  if (!isProject(example)) throw Error('Invalid fixture');
  const db = crypto.randomUUID();
  const project: Project = { ...example, characters: [], factions: [], nodes: [], edges: [], quests: [], endings: [] };
  delete project.world;
  await saveProject(db, project);
  const post = vi.fn(() => Response.json({ error: {
    code: 'scenario_invalid', message: 'Review the proposal references.',
    findings: ['n-first', 'n-last'].map(id => ({ rule: 'reference', entityIds: [id], severity: 'error',
      fieldPath: id + '.characterIds[0]', referenceId: 'f-reviewers', expectedType: 'character', actualType: 'faction',
      explanation: 'The character field refers to a faction.', suggestedRepair: 'Select a character from the cast.' })),
  } }, { status: 422 }));
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/generation'
    ? Response.json({ available: true, model: 'mock', provider: 'mock', mode: 'mock' }) : post()));
  const user = userEvent.setup();
  render(<App databaseName={db} />);
  await user.click(await screen.findByRole('button', { name: 'Open ' + project.title }));
  await user.click(await screen.findByRole('button', { name: 'Scenario Studio' }));
  await user.click(await screen.findByRole('button', { name: 'Generate scenario' }));
  const report = await screen.findByRole('region', { name: 'Proposal findings' });
  const group = within(report).getByText(/reference.*\(2\)/i).closest('details')!;
  await user.click(group.querySelector('summary')!);
  expect(group).toHaveAttribute('open');
  for (const value of ['n-first.characterIds[0]', 'n-last.characterIds[0]', 'f-reviewers', 'Expected type', 'Actual type', 'Select a character from the cast.'])
    expect(group).toHaveTextContent(value);
  expect((await listProjects(db)).projects[0]!.project).toEqual(project);
  expect(post).toHaveBeenCalledOnce();
  expect(screen.getByText(/propose.*characters.*factions.*same request/i)).toBeVisible();
});

function reviewedProject(): Project {
  if (!isProject(example)) throw Error('Invalid fixture');
  return { ...example, scenario: {
    id: 'scenario-review', title: 'Review', summary: 'Follow the census.', approved: false,
    sourceNarrativeId: example.narrative.id, chapters: [], locations: [], geography: [], contentIds: [], factIds: [], layout: [],
    settings: { scale: 'short', chapterCount: 1, branching: 'branching', endings: 'multiple', mainQuests: 'light', sideQuests: 'none', instructions: '' },
  } };
}

test('repairs a rejected progression on a detached graph and preserves the original through review and reopen', async () => {
  const db = crypto.randomUUID();
  const project = reviewedProject();
  project.id = 'p-' + db;
  project.scenario!.approved = true;
  await saveProject(db, project);
  const stored = async () => (await listProjects(db)).projects[0]!.project;
  const design = structuredClone(designOf(project));
  design.scenario!.approved = false;
  design.scenario!.title = 'Rejected graph';
  design.edges[0]!.conditions = [{ kind: 'quest', key: 'q-rubbing', value: 'completed' }];
  const finding = { rule: 'dead_end', severity: 'error', entityIds: ['n-start', 'e-1'],
    explanation: 'The first transition requires an unfinished quest.', suggestedRepair: 'Inspect the prerequisite on e-1.',
    witnessPath: ['n-start'] };
  const generate = vi.fn(() => Response.json({ error: { code: 'invalid_scenario', message: 'Blocked at the opening.',
    findings: [finding], recovery: { baseRevision: project.revision, design, additions: { characters: [], factions: [], stateEntities: [] } },
  } }, { status: 422 }));
  const validate = vi.fn((draft: Project) => {
    const valid = !draft.edges[0]?.conditions?.length;
    return Response.json({ valid, complete: true, findings: valid ? [] : [finding], paths: [] });
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (url === '/api/scenario') return generate();
    if (url === '/api/scenario/validate') return validate(JSON.parse(String(options?.body)));
    if (url === '/api/generation') return Response.json({ available: true, model: 'mock', provider: 'mock', mode: 'mock' });
    throw Error('Unexpected request ' + url);
  }));
  const user = userEvent.setup();
  let app = render(<App databaseName={db} />);
  const click = async (name: string) => user.click(await screen.findByRole('button', { name }));
  await click('Open ' + project.title);
  await user.click(await screen.findByText('Generation settings'));
  await click('Generate scenario');
  const editor = () => screen.findByRole('region', { name: 'Rejected proposal editor' });
  const repair = async () => {
    const graph = within(await editor());
    await user.click(within(graph.getByRole('region', { name: 'Scenario graph' }))
      .getByRole('button', { name: 'Walk to the gate' }));
    const guard = graph.getByRole('group', { name: 'Entry conditions' });
    expect(within(guard).getByLabelText('Value')).toHaveValue('completed');
    await user.click(within(guard).getByRole('button', { name: 'Remove' }));
    await user.click(graph.getByRole('button', { name: 'Save connection' }));
    await click('Revalidate edited proposal');
    expect(await screen.findByRole('region', { name: 'Proposal entities' })).toBeVisible();
    const changes = await screen.findByRole('region', { name: 'Edits to the rejected graph' });
    expect(changes).toHaveTextContent('Walk to the gate');
    expect(changes).toHaveTextContent('q-rubbing = completed');
    expect(changes).toHaveTextContent('None');
  };
  expect(await editor()).toBeVisible();
  await click('Revalidate edited proposal');
  expect(await within(await editor()).findByText('The corrected draft still has validation errors.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Accept proposal' })).toBeNull();
  await repair();
  await click('Reject proposal');
  expect((await stored()).scenario).toEqual(project.scenario);
  expect((await stored()).nodes).toEqual(project.nodes);
  expect((await stored()).edges).toEqual(project.edges);
  expect((await stored()).canonicalFacts).toEqual(project.canonicalFacts);
  await click('Restore original rejected proposal');
  const restoredGraph = within(await editor());
  await user.click(within(restoredGraph.getByRole('region', { name: 'Scenario graph' }))
    .getByRole('button', { name: 'Walk to the gate' }));
  expect(restoredGraph.getByLabelText('Value')).toHaveValue('completed');
  app.unmount();
  app = render(<App databaseName={db} />);
  await click('Open ' + project.title);
  await repair();
  await click('Accept proposal');
  await waitFor(async () => expect((await stored()).scenario?.title).toBe('Rejected graph'));
  expect((await stored()).runs.at(-1)).toMatchObject({ calls: 0, mode: 'deterministic' });
  expect((await stored()).scenario?.approved).toBe(false);
  expect(screen.queryByRole('button', { name: 'Revalidate edited proposal' })).toBeNull();
  expect(await screen.findByText(/belongs to an older revision/)).toBeVisible();
  await click('Discard original rejected proposal');
  await waitFor(() => expect(screen.queryByText(/belongs to an older revision/)).toBeNull());
  expect(generate).toHaveBeenCalledOnce();
  expect(validate).toHaveBeenCalledTimes(3);
  app.unmount();
}, 20000);

test('reopens deterministic findings with the field, witness and affected inspector', async () => {
  const db = crypto.randomUUID();
  const project = reviewedProject();
  await saveProject(db, project);
  const finding = { rule: 'chapter_required', severity: 'error', entityIds: ['n-start'], fieldPath: 'nodes[0].chapterId',
    expectedType: 'chapter', explanation: 'The opening has no chapter.', suggestedRepair: 'Assign an opening chapter.', witnessPath: ['n-start'] };
  const blocked = { rule: 'dead_end', severity: 'error', entityIds: ['n-start'], explanation: 'The gate is blocked.',
    suggestedRepair: 'Review the gate quest.', blockedTransitions: [{ edgeId: 'e-1', targetId: 'n-gate',
      fieldPath: '/edges/0/conditions/0', kind: 'quest', key: 'q-rubbing', required: 'completed', actual: null,
      producerIds: ['n-witness'] }] };
  const downstream = { rule: 'ending_unreachable', severity: 'error', entityIds: ['n-public'], causeNodeId: 'n-start',
    explanation: 'The public ending cannot be reached.', suggestedRepair: 'Review the first blocked connection.' };
  const validate = vi.fn(() => Response.json({ valid: false, complete: true, findings: [blocked, downstream, finding], paths: [] }));
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/generation'
    ? Response.json({ available: false, model: 'mock', provider: 'mock', mode: 'mock' }) : validate()));
  const user = userEvent.setup();
  const app = render(<App databaseName={db} />);
  const open = async () => user.click(await screen.findByRole('button', { name: 'Open ' + project.title }));
  await open();
  await user.click(await screen.findByRole('button', { name: 'Validate scenario' }));
  await waitFor(async () => expect((await listProjects(db)).projects[0]!.project.findings.at(-1))
    .toMatchObject({ ...finding, rule: 'scenario.chapter_required' }));
  const savedIssues = (await listProjects(db)).projects[0]!.project.findings;
  expect(savedIssues.find(f => f.rule === 'scenario.dead_end')?.blockedTransitions).toEqual(blocked.blockedTransitions);
  expect(savedIssues.find(f => f.rule === 'scenario.ending_unreachable')?.causeNodeId).toBe('n-start');
  app.unmount();
  render(<App databaseName={db} />);
  await open();
  const findings = await screen.findByRole('region', { name: 'Scenario findings' });
  await user.click(within(findings).getByText('chapter · chapter_required (1)'));
  expect(within(findings).getByText(finding.fieldPath)).toBeVisible();
  expect(within(findings).getByText(/Play path.*n-start/)).toBeVisible();
  const chapterGroup = within(findings).getByText('chapter · chapter_required (1)').parentElement!;
  await user.click(within(chapterGroup).getByRole('button', { name: 'Inspect n-start' }));
  expect(screen.getByLabelText('Title')).toHaveValue(example.nodes[0]!.title);
  expect(validate).toHaveBeenCalledOnce();
});

test.each([false, true])('relinks a rejected draft, checks it locally and saves only after explicit acceptance (blocked progression: %s)', async (blocked) => {
  const db = crypto.randomUUID();
  const p = reviewedProject();
  p.id = 'p-' + db;
  p.scenario!.approved = true;
  await saveProject(db, p);
  const stored = async () => (await listProjects(db)).projects[0]!.project;
  const design = structuredClone(designOf(p));
  design.scenario!.approved = false;
  design.scenario!.title = 'Corrected proposal';
  design.nodes[0]!.characterIds = ['wrong-person'];
  const finding = { rule: 'reference', severity: 'error', entityIds: ['n-start', 'wrong-person'],
    fieldPath: '/nodes/0/characterIds/0', referenceId: 'wrong-person', expectedType: 'character',
    explanation: 'The character ID is missing.', suggestedRepair: 'Select an existing character.' };
  const generate = vi.fn(() => Response.json({ error: { code: 'scenario_invalid', message: 'Unknown character.',
    findings: [finding], recovery: { baseRevision: p.revision, design, additions: { characters: [], factions: [], stateEntities: [] } },
    run: { id: 'run-unresolved', baseRevision: p.revision, stage: 'scenario', status: 'unresolved', mode: 'mock',
      calls: 1, repairAttempts: 0, receipts: [{ tool: 'check_scenario', outcome: 'failed', detail: 'scenario_invalid' }] },
  } }, { status: 422 }));
  const validate = vi.fn(() => Response.json({ valid: true, complete: true, findings: [], paths: [] }));
  if (blocked) validate.mockImplementationOnce(() => Response.json({ valid: false, complete: true, findings: [{
    rule: 'dead_end', severity: 'error', entityIds: ['n-start'], explanation: 'The opening has no playable exit.',
    suggestedRepair: 'Review its outgoing progression.', witnessPath: ['n-start'],
  }], paths: [] }));
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/scenario') return generate();
    if (url === '/api/scenario/validate') return validate();
    if (url === '/api/generation') return Response.json({ available: true, model: 'mock', provider: 'mock', mode: 'mock' });
    throw Error('Unexpected request');
  }));
  const user = userEvent.setup();
  render(<App databaseName={db} />);
  const click = async (name: string) => user.click(await screen.findByRole('button', { name }));
  await click('Open ' + p.title);
  await user.click(await screen.findByText('Generation settings'));
  await click('Generate scenario');
  await user.click(await screen.findByText('Relink rejected references'));
  const key = screen.getByRole('combobox', { name: /wrong-person.*character/i });
  expect(within(key).queryByRole('option', { name: /Ward Assemblies/ })).toBeNull();
  await user.selectOptions(key, 'ch-iven');
  await click('Check corrections without generation');
  if (blocked) {
    const graph = within(await screen.findByRole('region', { name: 'Rejected proposal editor' }));
    expect(within(graph.getByRole('group', { name: 'Characters' })).getByRole('checkbox', { name: 'Iven' })).toBeChecked();
    const description = graph.getByLabelText('Description');
    await user.clear(description);
    await user.type(description, 'Review the gate route.');
    await user.click(graph.getByRole('button', { name: 'Save node' }));
    await click('Revalidate edited proposal');
  }
  expect(await screen.findByRole('region', { name: 'Proposal entities' })).toBeVisible();
  expect((await stored()).scenario).toEqual(p.scenario);
  expect((await stored()).nodes).toEqual(p.nodes);
  await click('Accept proposal');
  await waitFor(async () => expect((await stored()).scenario?.title).toBe('Corrected proposal'));
  const saved = await stored();
  expect(saved.nodes[0]!.characterIds).toEqual(['ch-iven']);
  expect(saved.runs.slice(-2).map(r => [r.status, r.calls])).toEqual([['unresolved', 1], ['proposed', 0]]);
  expect(generate).toHaveBeenCalledOnce();
  expect(validate).toHaveBeenCalledTimes(blocked ? 2 : 1);
});

useEnglishTestLocale();
