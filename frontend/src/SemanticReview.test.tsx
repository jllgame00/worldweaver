import { useEnglishTestLocale } from './englishTestLocale';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { approvedProject } from './atlasFixture.testdata';
import SemanticReview from './SemanticReview';
import { requestReview, reviewSources } from './semanticReviewClient';
import type { GenerationStatus } from './validation';

const config: GenerationStatus = {
  available: true,
  provider: 'chatkhu',
  mode: 'live',
  api: 'responses',
  model: 'reviewer',
  semanticMaxOutputTokens: 256,
};
const project = approvedProject();
const scope = { mode: 'targeted', targetId: project.nodes[0]!.id } as const;
const records = reviewSources(project, scope);
const run = {
  id: 'semantic-test',
  stage: 'verify',
  mode: 'live',
  baseRevision: project.revision,
  status: 'proposed',
  repairAttempts: 0,
  calls: 1,
  receipts: [
    {
      tool: 'provider_config',
      outcome: 'passed',
      detail:
        'provider=chatkhu model=reviewer maxCalls=1 maxOutputTokens=256 startedAt=2026-10-02T12:30:00+00:00',
    },
    { tool: 'semantic_review', outcome: 'advice', detail: 'checkedFindings=1' },
  ],
};
const finding = {
  category: 'creative-suggestion',
  severity: 'warning',
  explanation: 'Consider the decision.',
  uncertainty: 'Intent needs review.',
  suggestedRepair: 'Discuss the stakes.',
  evidence: [{ id: records[0]!.id, kind: 'node', excerpt: project.nodes[0]!.title }],
};
const reply = (f = finding) =>
  Response.json({ projectId: project.id, baseRevision: project.revision, run, findings: [f] });

test('retains a failed audit when transport loses the provider receipt', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Network failure');
    }),
  );
  const save = vi.fn();
  render(<SemanticReview project={project} scope={scope} configuration={config} onResult={save} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review semantic evidence' }));
  fireEvent.click(screen.getByRole('button', { name: 'Authorize one live review' }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        receipts: expect.arrayContaining([expect.objectContaining({ tool: 'semantic_transport_unknown' })]),
      }),
      [],
    ),
  );
});

test('previews exact scope and budget, then makes a single authorized call with bounded source excerpts', async () => {
  const fetcher = vi.fn(async () => reply());
  vi.stubGlobal('fetch', fetcher);
  const save = vi.fn();
  render(<SemanticReview project={project} scope={scope} configuration={config} onResult={save} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review semantic evidence' }));
  for (const label of ['chatkhu', 'reviewer', 'Maximum provider requests', '256', 'Pricing unavailable'])
    expect(screen.getByText(label)).toBeVisible();
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Authorize one live review' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('/api/verify/semantic');
  const body = JSON.parse(String(init.body));
  expect(body.records).toEqual(records);
  expect(body.records.every((r: object) => Object.keys(r).sort().join(',') === 'id,kind,text')).toBe(true);
  expect(body.records.some((r: { id: string }) => r.id === project.storyCandidates[0]!.id)).toBe(false);
  expect(init.headers).toMatchObject({ 'X-Worldweaver-Semantic-Budget': '1:256' });
  const [savedRun, [saved]] = save.mock.calls[0]!;
  expect(savedRun).toEqual(run);
  expect(saved).toMatchObject({
    rule: 'semantic-creative-suggestion',
    origin: 'editorial',
    severity: 'info',
    status: 'open',
    entityIds: [scope.targetId],
  });
  expect(saved.explanation).toContain(project.nodes[0]!.title);
  expect(saved.explanation).toContain(finding.uncertainty);
  expect(saved.evidence).toEqual(finding.evidence);
  expect(saved.uncertainty).toEqual(finding.uncertainty);
  expect(saved).not.toHaveProperty('suggestedRelationship');
});

test.each(['cancel', 'edit'])(
  'a late response after %s cannot persist findings or mark the design verified',
  async (action) => {
    let finish!: (value: Response) => void;
    let sent: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        sent = init.signal!;
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }),
    );
    const save = vi.fn();
    const props = { project, scope, configuration: config, onResult: save };
    const view = render(<SemanticReview {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review semantic evidence' }));
    fireEvent.click(screen.getByRole('button', { name: 'Authorize one live review' }));
    if (action === 'cancel') {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel semantic review' }));
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled',
          receipts: expect.arrayContaining([
            expect.objectContaining({ tool: 'semantic_cancelled', outcome: 'cancelled' }),
          ]),
        }),
        [],
      );
      expect(save.mock.calls[0]![0]).not.toHaveProperty('tokens');
    } else
      view.rerender(<SemanticReview {...props} project={{ ...project, revision: project.revision + 1 }} />);
    expect(sent?.aborted).toBe(true);
    await act(async () => finish(reply()));
    expect(save).toHaveBeenCalledTimes(action === 'cancel' ? 1 : 0);
  },
);

test.each([{ id: 'unknown' }, { kind: 'ending' }, { excerpt: 'Something never said' }])(
  'rejects unsupported response citations %j',
  async (change) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reply({ ...finding, evidence: [{ ...finding.evidence[0]!, ...change }] })),
    );
    await expect(
      requestReview(project, scope, config, records, new AbortController().signal),
    ).rejects.toThrow('invalid evidence');
  },
);

test('rejects an AI-proposed relationship to a record absent from the cited evidence', async () => {
  const proposed = {
    ...finding,
    suggestedRelationship: { fromId: records[0]!.id, toId: 'unknown', label: 'Possible tie' },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => reply(proposed)),
  );
  await expect(requestReview(project, scope, config, records, new AbortController().signal)).rejects.toThrow(
    'invalid evidence',
  );
});

test('preserves a relationship only when explicitly proposed for independently checked citations', async () => {
  const fact = records.find((r) => r.kind === 'fact')!;
  const evidence = [...finding.evidence, { kind: fact.kind, id: fact.id, excerpt: fact.text }];
  const suggestedRelationship = { fromId: records[0]!.id, toId: fact.id, label: 'May test the canon' };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => reply({ ...finding, evidence, suggestedRelationship } as typeof finding)),
  );
  const result = await requestReview(project, scope, config, records, new AbortController().signal);
  expect(result.findings[0]).toMatchObject({
    evidence,
    uncertainty: finding.uncertainty,
    suggestedRelationship,
  });
});

useEnglishTestLocale();
