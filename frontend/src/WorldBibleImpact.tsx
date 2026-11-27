import { useEffect, useRef, type ReactNode } from 'react';
import type { Project } from './project.generated';
import { useBibleCopy } from './worldBibleCopy';
import { useFormatter } from './locale';
import { useVerificationTool } from './verificationCopy';
import { editStages } from './worldBibleEdits';
import { dependencyImpact, type BibleIndex, type BibleEntity } from './worldBibleIndex';
import { useVerificationIdentity } from './worldBibleEvidence';
import { targetScope } from './verificationTools';

export function WorldBibleImpact({
  project,
  entity,
  index,
  changes,
  children,
}: {
  project: Project;
  entity: BibleEntity;
  index: BibleIndex;
  changes: { key: string; label: string; before: string; after: string }[];
  children: ReactNode;
}) {
  const t = useBibleCopy();
  const { number } = useFormatter();
  const tool = useVerificationTool();
  const impact = dependencyImpact(index, entity.id);
  const fingerprint = useVerificationIdentity(project);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const stages = editStages(project, entity),
    content = stages.includes('content'),
    scenario = stages.includes('scenario');
  const affected = [
    ...(content && project.narrative?.approved ? [t.narrative] : []),
    ...((scenario || content) && project.scenario?.approved ? [t.scenario] : []),
    ...(project.world?.approved ? [t.world] : []),
    ...(project.approval ? [t.final + ' · ' + project.approval.runId] : []),
  ];
  const saved = project.verificationHistory ?? [];
  const historicalIds = new Set(saved.map((entry) => entry.runId));
  const checks = project.runs
    .filter(
      (run) =>
        !historicalIds.has(run.id) &&
        (run.stage === 'verify' ||
          run.stage === 'world' ||
          (run.stage === 'scenario' && (content || scenario)) ||
          content),
    )
    .flatMap((run) => run.receipts.map((r) => ({ tool: r.tool, run: run.id, revision: run.baseRevision })));
  for (const entry of saved) {
    if (entry.fingerprint !== fingerprint) continue;
    if (
      entry.mode === 'targeted' &&
      (!entry.targetId || !targetScope(project, entry.targetId, index)?.ids.has(entity.id))
    )
      continue;
    for (const r of entry.tools) checks.push({ tool: r.tool, run: entry.runId, revision: r.checkedRevision });
  }
  return (
    <section className="notice bible-impact" aria-label={t.impact}>
      <h3 ref={heading} tabIndex={-1}>
        {t.impact}
      </h3>
      {changes.map((f) => (
        <div key={f.key}>
          <strong>{f.label}</strong>
          <div className="bible-diff">
            <div>
              <small>{t.before}</small>
              <p>{f.before || t.none}</p>
            </div>
            <div>
              <small>{t.after}</small>
              <p>{f.after || t.none}</p>
            </div>
          </div>
        </div>
      ))}
      {(
        [
          ['direct', impact.direct],
          ['indirect', impact.transitive],
        ] as const
      ).map(([key, ids]) => (
        <details key={key} open={key === 'direct'}>
          <summary>
            {t[key]} ({number(ids.length)})
          </summary>
          <ul>
            {ids.map((id) => (
              <li key={id}>
                {index.entities.get(id)?.label ?? id} <code>{id}</code>
              </li>
            ))}
          </ul>
        </details>
      ))}
      <p>
        <strong>{t.stages}</strong> · {affected.join(', ') || t.none}
      </p>
      <details>
        <summary>
          {t.receipts} ({number(checks.length)})
        </summary>
        <ul>
          {checks.map((r, i) => (
            <li key={i} title={r.tool}>
              {tool(r.tool)} · {r.run} · {number(r.revision)}
            </li>
          ))}
        </ul>
      </details>
      {children}
    </section>
  );
}
