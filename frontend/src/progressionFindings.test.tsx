import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import ScenarioFindings, { findingsOf } from './ScenarioFindings';
import example from '../../docs/examples/salt-census.json';
import type { Project } from './project.generated';

it('places a demonstrated cause before its downstream findings and distinguishes independent failures', () => {
  const project = structuredClone(example) as unknown as Project;
  const [start, blocked, destination] = project.nodes;
  const quest = project.quests[0]!;
  const common = { severity: 'error', suggestedRepair: 'Place evidence before this gate.', witnessPath: [] };
  const rows = findingsOf([
    {
      ...common,
      rule: 'ending_unreachable',
      entityIds: [destination!.id],
      explanation: 'An ending is unreachable.',
      causeNodeId: blocked!.id,
    },
    {
      ...common,
      rule: 'ending_unreachable',
      entityIds: ['independent'],
      explanation: 'Disconnected elsewhere.',
    },
    {
      ...common,
      rule: 'dead_end',
      entityIds: [blocked!.id],
      explanation: 'No feasible successor.',
      witnessPath: [start!.id, blocked!.id],
      blockedTransitions: [
        {
          edgeId: project.edges[0]!.id,
          targetId: destination!.id,
          kind: 'quest',
          key: quest.id,
          actual: 'active',
          required: 'completed',
          producerIds: [start!.id],
          fieldPath: '/edges/0/conditions/0/key',
        },
      ],
    },
  ]);
  const inspected: string[] = [];
  render(
    <ScenarioFindings
      title="Validation"
      findings={rows}
      project={project}
      inspect={(id) => inspected.push(id)}
      canInspect={() => true}
    />,
  );
  screen.getByRole('button', { name: 'Inspect ' + project.edges[0]!.label }).click();
  expect(inspected).toEqual([project.edges[0]!.id]);
  expect(screen.getByText('Blocked at ' + blocked!.title)).toBeVisible();
  expect(screen.getByText('active → completed')).toBeVisible();
  expect(screen.getByText('No feasible successor.').closest('details')?.querySelector('summary'))
    .toHaveTextContent('Technical details');
  expect(screen.getByText('Downstream findings (1)')).toBeInTheDocument();
  expect(screen.getByText('Disconnected elsewhere.')).toBeInTheDocument();
  expect(() => findingsOf([{ ...rows[2], blockedTransitions: [{ kind: 'quest', key: 'unsafe' }] }])).toThrow();
});
