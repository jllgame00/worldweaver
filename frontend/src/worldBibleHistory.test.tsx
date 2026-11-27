import { useEnglishTestLocale } from './englishTestLocale';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { approvedProject } from './atlasFixture.testdata';
import { verificationIdentity } from './verificationHistory';
import { WorldBible } from './WorldBible';
import type { ValidationFinding, VerificationEntry } from './project.generated';
import { buildWorldBible, dependencyImpact } from './worldBibleIndex';

it('links deduplicated current and historical findings, keeping a layout change current and isolating targeted receipts', async () => {
  const p = approvedProject(),
    fingerprint = await verificationIdentity(p);
  p.revision++;
  p.scenario!.layout = [{ nodeId: 'n-start', x: 198, y: 240 }];
  p.stateEntities = [{ id: 'unrelated-flag', kind: 'flag', name: 'Unrelated flag' }];
  // Establish the checked state before a layout-only change.
  const checked = await verificationIdentity(p);
  p.revision++;
  p.scenario!.layout[0]!.x++;
  const finding: ValidationFinding = {
    id: 'finding-seal',
    runId: 'current',
    rule: 'editorial.motive',
    origin: 'editorial',
    severity: 'warning',
    entityIds: ['ch-iven'],
    explanation: 'The surveyor has conflicting loyalties.',
    suggestedRepair: 'Review the two accounts.',
    status: 'open',
    checkedRevision: p.revision - 1,
  };
  const entry: VerificationEntry = {
    runId: 'current',
    fingerprint: checked,
    mode: 'targeted',
    targetId: 'ch-iven',
    timestamp: '2026-11-27T00:00:00Z',
    findings: [finding],
    paths: [],
    statesExplored: 0,
    decisions: [],
    tools: [
      {
        tool: 'references',
        status: 'passed',
        detail: 'Checked',
        durationMs: 1,
        checkedRevision: p.revision - 1,
        findings: 0,
        entityIds: ['ch-iven'],
      },
    ],
  };
  const otherId = 'unrelated-flag';
  p.verificationHistory = [
    {
      ...entry,
      runId: 'old',
      fingerprint,
      findings: [{ ...finding, id: 'former', runId: 'old', explanation: 'Prior survey detail.' }],
    },
    {
      ...entry,
      runId: 'separate',
      targetId: otherId,
      findings: [],
      tools: [{ ...entry.tools[0]!, entityIds: [otherId] }],
    },
    entry,
  ];
  for (const { runId } of p.verificationHistory)
    p.runs.push({
      id: runId,
      stage: 'verify',
      baseRevision: p.revision - 1,
      calls: 0,
      repairAttempts: 0,
      mode: 'deterministic',
      status: 'proposed',
      receipts: [],
    });
  p.findings = [...p.findings, finding];
  const commit = vi.fn(async () => true);
  render(
    <WorldBible
      project={p}
      selectedId="ch-iven"
      current={() => p}
      commit={commit}
      disabled={false}
      review={vi.fn()}
      navigate={vi.fn()}
    />,
  );
  const advice = await screen.findByText(finding.explanation);
  expect(screen.getAllByText(finding.explanation)).toHaveLength(1);
  expect(await within(advice.closest('li')!).findByText(/Current design/)).toBeVisible();
  expect(
    within(screen.getByText('Prior survey detail.').closest('li')!).getByText(/Historical design/),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Edit record' }));
  fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Chief surveyor' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview change' }));
  const impact = screen.getByRole('region', { name: 'Change impact' });
  expect(await within(impact).findByText(/references · current ·/)).toBeInTheDocument();
  expect(within(impact).queryByText(/references · separate ·/)).toBeNull();
});

it('shows only current cited editorial relationships as suggestions without changing the canonical index', async () => {
  const p = approvedProject(),
    fingerprint = await verificationIdentity(p);
  const suggestion = {
    id: 'review-link',
    runId: 'review',
    rule: 'editorial.affiliation',
    origin: 'editorial' as const,
    severity: 'info' as const,
    entityIds: ['ch-iven', 'l-beacon'],
    explanation: 'Consider a tie to the beacon.',
    suggestedRepair: 'Review this relationship.',
    status: 'open' as const,
    checkedRevision: p.revision,
    suggestedRelationship: { fromId: 'ch-iven', toId: 'l-beacon', label: 'Tends the beacon' },
  };
  const entry: VerificationEntry = {
    runId: 'review',
    mode: 'full',
    fingerprint,
    timestamp: '2026-11-27T00:00:00Z',
    tools: [],
    findings: [suggestion],
    paths: [],
    statesExplored: 0,
    decisions: [],
  };
  const uncited = {
    ...suggestion,
    id: 'uncited',
    entityIds: ['ch-iven'],
    suggestedRelationship: { ...suggestion.suggestedRelationship, label: 'Uncited relationship' },
  };
  const stale = {
    ...suggestion,
    id: 'stale',
    runId: 'old',
    suggestedRelationship: { ...suggestion.suggestedRelationship, label: 'Stale relationship' },
  };
  p.verificationHistory = [
    { ...entry, runId: 'old', fingerprint: 'a'.repeat(64), findings: [stale] },
    { ...entry, findings: [suggestion, uncited] },
  ];
  render(
    <WorldBible
      project={p}
      selectedId="ch-iven"
      current={() => p}
      commit={vi.fn()}
      disabled={false}
      review={vi.fn()}
      navigate={vi.fn()}
    />,
  );
  const related = screen.getByRole('list', { name: 'Related records' });
  expect(await within(related).findByText(/Tends the beacon.*Suggested/)).toBeVisible();
  expect(within(related).queryByText(/Uncited relationship|Stale relationship/)).toBeNull();
  fireEvent.change(screen.getByLabelText('Relationship type'), { target: { value: 'Tends the beacon' } });
  expect(within(related).getAllByRole('button')).toHaveLength(1);
  expect(dependencyImpact(buildWorldBible(p), 'l-beacon').direct).not.toContain('ch-iven');
});

useEnglishTestLocale();
