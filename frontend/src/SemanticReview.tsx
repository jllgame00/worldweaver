import { useEffect, useMemo, useRef, useState } from 'react';
import { GenerationError } from './api';
import { newId } from './project';
import type { Project, AgentRun, ValidationFinding } from './project.generated';
import { requestReview, reviewSources, type ReviewScope } from './semanticReviewClient';
import type { GenerationStatus } from './validation';
import { semanticCopy as c } from './semanticReviewCopy';

interface Props {
  project: Project;
  scope: ReviewScope;
  configuration?: GenerationStatus | null;
  disabled?: boolean;
  onBusy?: (busy: boolean) => void;
  onResult: (run: AgentRun, findings: ValidationFinding[]) => void | boolean | Promise<void | boolean>;
}

export default function SemanticReview({ project, scope, configuration, disabled, onResult, onBusy }: Props) {
  const [preview, setPreview] = useState(false);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState('');
  const request = useRef<AbortController | null>(null);
  const started = useRef(0);
  const records = useMemo(() => reviewSources(project, scope), [project, scope.mode, scope.targetId]);
  const available = configuration?.available && configuration.semanticMaxOutputTokens && records.length > 0;
  useEffect(() => {
    onBusy?.(running);
    return () => onBusy?.(false);
  }, [running, onBusy]);
  useEffect(() => {
    setPreview(false);
    setRunning(false);
    setNotice('');
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [project.id, project.revision, scope.mode, scope.targetId, configuration]);

  async function start() {
    if (request.current || disabled || !preview || !configuration || !available) return;
    const controller = new AbortController();
    request.current = controller;
    started.current = Date.now();
    setRunning(true);
    setPreview(false);
    setNotice('');
    try {
      const { run, findings } = await requestReview(
        project,
        scope,
        configuration,
        records,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      request.current = null;
      setRunning(false);
      const saved = await onResult(run, findings);
      if (!controller.signal.aborted) setNotice(saved === false ? c.saveFailed : c.returned(findings.length));
    } catch (error) {
      if (controller.signal.aborted) return;
      setNotice(error instanceof Error ? error.message : c.failure);
      if (request.current === controller) {
        request.current = null;
        setRunning(false);
        const failed =
          error instanceof GenerationError && error.run ? error.run : unknownUsage('failed', configuration);
        try {
          await onResult(failed, []);
        } catch {
          setNotice(c.saveFailed);
        }
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setRunning(false);
      }
    }
  }

  function unknownUsage(status: 'failed' | 'cancelled', configuration: GenerationStatus): AgentRun {
    return {
      id: newId('semantic'),
      stage: 'verify',
      mode: configuration.mode,
      baseRevision: project.revision,
      status,
      calls: 0,
      repairAttempts: 0,
      durationMs: Math.max(0, Date.now() - started.current),
      receipts: [
        {
          tool: 'provider_config',
          outcome: 'passed',
          detail:
            'provider=' +
            configuration.provider +
            ' model=' +
            configuration.model +
            ' maxCalls=1 maxOutputTokens=' +
            configuration.semanticMaxOutputTokens +
            ' startedAt=' +
            new Date(started.current).toISOString(),
        },
        {
          tool: status === 'cancelled' ? 'semantic_cancelled' : 'semantic_transport_unknown',
          outcome: status,
          detail: c.cancelReceipt,
        },
      ],
    };
  }
  async function cancel() {
    if (!request.current || !configuration) return;
    request.current.abort();
    request.current = null;
    setRunning(false);
    setNotice(c.cancelled);
    const run = unknownUsage('cancelled', configuration);
    try {
      if ((await onResult(run, [])) === false) setNotice(c.saveFailed);
    } catch {
      setNotice(c.saveFailed);
    }
  }

  return (
    <section aria-label={c.region}>
      <h3>{c.title}</h3>
      <button
        type="button"
        disabled={disabled || running || !available}
        onClick={() => setPreview(!preview)}
        aria-expanded={preview}
      >
        {c.preview}
      </button>
      {!available && <p>{!records.length ? c.selectSource : (configuration?.message ?? c.unavailable)}</p>}
      {preview && configuration && (
        <div>
          <dl>
            <dt>{c.provider}</dt>
            <dd>{configuration.provider}</dd>
            <dt>{c.model}</dt>
            <dd>{configuration.model}</dd>
            <dt>{c.scope}</dt>
            <dd>
              {scope.mode}
              {scope.targetId ? ' · ' + scope.targetId : ''} · {c.revision(project.revision)}
            </dd>
            <dt>{c.requests}</dt>
            <dd>1</dd>
            <dt>{c.tokens}</dt>
            <dd>{configuration.semanticMaxOutputTokens}</dd>
            <dt>{c.estimate}</dt>
            <dd>{configuration.mode === 'mock' ? c.mockCost : c.pricing}</dd>
          </dl>
          <details>
            <summary>{c.excerpts(records.length)}</summary>
            <ul>
              {records.map((r) => (
                <li key={r.id}>
                  <strong>
                    {r.kind} · {r.id}
                  </strong>
                  <p>{r.text}</p>
                </li>
              ))}
            </ul>
          </details>
          <button type="button" disabled={disabled} onClick={() => void start()}>
            {configuration.mode === 'live' ? c.authorize : c.simulate}
          </button>
        </div>
      )}
      {running && (
        <button type="button" onClick={() => void cancel()}>
          {c.cancel}
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
