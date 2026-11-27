import type { Project, ValidationFinding } from './project.generated';
import {atlasPlaces} from './atlasPlaces';
import { studioCopy as c } from './scenarioCopy';
import { scenarioCopy } from './studioWorkflowCopy';

export type ScenarioFinding = Pick<
  ValidationFinding,
  | 'rule'
  | 'severity'
  | 'entityIds'
  | 'explanation'
  | 'fieldPath'
  | 'referenceId'
  | 'expectedType'
  | 'actualType'
  | 'witnessPath'
  | 'causeNodeId'
  | 'blockedTransitions'
> &
  Partial<Pick<ValidationFinding, 'suggestedRepair'>>;

export function findingsOf(value: unknown): (ScenarioFinding & { suggestedRepair: string })[] {
  const stringList = (v: unknown) => Array.isArray(v) && v.every((id) => typeof id === 'string');
  if (
    !Array.isArray(value) ||
    !value.every(
      (f) =>
        f &&
        typeof f.rule === 'string' &&
        typeof f.explanation === 'string' &&
        typeof f.suggestedRepair === 'string' &&
        ['error', 'warning', 'info'].includes(f.severity) &&
        stringList(f.entityIds) &&
        (f.witnessPath === undefined || stringList(f.witnessPath)) &&
        (f.blockedTransitions === undefined ||
          (Array.isArray(f.blockedTransitions) &&
            f.blockedTransitions.every(
              (b: Record<string, unknown>) =>
                b &&
                typeof b === 'object' &&
                ['fieldPath', 'kind', 'key', 'required'].every((k) => typeof b[k] === 'string') &&
                ['edgeId', 'targetId'].every((k) => b[k] === undefined || typeof b[k] === 'string') &&
                (b.actual === null || typeof b.actual === 'string') &&
                stringList(b.producerIds),
            ))) &&
        ['fieldPath', 'referenceId', 'expectedType', 'actualType', 'causeNodeId'].every(
          (k) => f[k] === undefined || typeof f[k] === 'string',
        ),
    )
  )
    throw Error(scenarioCopy.requestFailed);
  return value;
}

export default function ScenarioFindings({
  title,
  findings,
  canInspect,
  inspect,
  project,
}: {
  project?: Project;
  title: string;
  findings: ScenarioFinding[];
  canInspect?: (id: string) => boolean;
  inspect?: (id: string) => void;
}) {
  const names = new Map<string, string>();
  if (project) {
    for (const n of project.nodes) names.set(n.id, n.title);
    for (const q of project.quests) names.set(q.id, q.title || q.objective);
    for (const e of project.edges) names.set(e.id, e.label);
    for (const row of [
      ...project.characters,
      ...project.factions,
      ...(project.stateEntities ?? []),
      ...atlasPlaces(project),
    ])
      names.set(row.id, row.name);
  }
  const nameOf = (id: string) => names.get(id) ?? id;
  const isRoot = (f: ScenarioFinding) =>
    ['dead_end', 'blocked_start'].includes(f.rule.replace(/^scenario\./, '')) || !!f.blockedTransitions?.length;
  const roots = findings.filter(isRoot);
  const rootIds = new Set(roots.map((f) => f.entityIds[0]));
  const downstream = (id: string | undefined) =>
    id ? findings.filter((f) => f.causeNodeId === id && !isRoot(f)) : [];
  const groups = new Map<string, ScenarioFinding[]>();
  for (const finding of findings) {
    if (isRoot(finding) || (finding.causeNodeId && rootIds.has(finding.causeNodeId))) continue;
    const rule = finding.rule.replace(/^scenario\./, '');
    const name = [finding.expectedType, rule].filter(Boolean).join(' · ');
    const group = groups.get(name);
    if (group) group.push(finding);
    else groups.set(name, [finding]);
  }
  if (!findings.length) return null;
  return (
    <section className="scenario-findings" aria-label={title}>
      <h3>{title}</h3>
      {roots.map((f, index) => {
        const owner = f.entityIds[0],
          effects = downstream(owner);
        return (
          <article key={index} className="progression-finding">
            <h4>{owner ? 'Blocked at ' + nameOf(owner) : 'Blocked progression'}</h4>
            <span className="pill">{f.severity}</span>
            {!f.blockedTransitions?.length && <p>{f.explanation}</p>}
            {!!f.witnessPath?.length && <p>Feasible path · {f.witnessPath.map(nameOf).join(' → ')}</p>}
            {f.blockedTransitions?.map((b, i) => (
              <div key={i}>
                <strong>
                  {b.edgeId && nameOf(b.edgeId)} {b.targetId && '→ ' + nameOf(b.targetId)}
                </strong>
                <p>
                  {nameOf(b.key)} ·{' '}
                  <span>
                    {b.actual ?? 'unset'} → {b.required}
                  </span>
                </p>
                <p>
                  {b.producerIds.length
                    ? 'Possible sources · ' + b.producerIds.map(nameOf).join(', ')
                    : 'No matching source identified.'}
                </p>
              </div>
            ))}
            {f.suggestedRepair && <p>{f.suggestedRepair}</p>}
            {inspect && (
              <div className="actions">
                {[
                  ...new Set([
                    ...f.entityIds,
                    ...(f.blockedTransitions ?? []).flatMap((b) => [
                      b.edgeId,
                      b.targetId,
                      b.key,
                      ...b.producerIds,
                    ]),
                  ]),
                ]
                  .filter((id): id is string => !!id && !!canInspect?.(id))
                  .map((id) => (
                    <button key={id} type="button" onClick={() => inspect(id)}>
                      {c.inspect} {nameOf(id)}
                    </button>
                  ))}
              </div>
            )}
            <details>
              <summary>Technical details</summary>
              {!!f.blockedTransitions?.length && <p>{f.explanation}</p>}
              <p>
                {f.rule} · {f.entityIds.join(', ')}
              </p>
              <p>{f.witnessPath?.join(' → ')}</p>
              {f.blockedTransitions?.map((b, i) => (
                <p key={i}>
                  <code>{b.fieldPath}</code> · {b.kind} · {b.key} ·{' '}
                  {[b.edgeId, b.targetId, ...b.producerIds].filter(Boolean).join(', ')}
                </p>
              ))}
            </details>
            {!!effects.length && (
              <details>
                <summary>Downstream findings ({effects.length})</summary>
                <ul>
                  {effects.map((row, i) => (
                    <li key={i}>
                      {row.severity} · {row.rule} · {row.entityIds.map(nameOf).join(', ')}
                      <p>{row.explanation}</p>
                      <p>{row.suggestedRepair}</p>
                      <code>{row.entityIds.join(', ')}</code>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        );
      })}
      {Array.from(groups, ([group, rows]) => (
        <details key={group}>
          <summary>
            {group} ({rows.length})
          </summary>
          <ol className="record-list">
            {rows.map((f, i) => (
              <li key={i}>
                <span className="pill">{f.severity}</span>
                <p>{f.explanation}</p>
                <dl>
                  {[
                    [c.fieldPath, f.fieldPath],
                    [c.referenceId, f.referenceId],
                    [c.expectedType, f.expectedType],
                    [c.actualType, f.actualType],
                  ].map(
                    ([label, value]) =>
                      value && (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>
                            <code>{value}</code>
                          </dd>
                        </div>
                      ),
                  )}
                </dl>
                {!!f.entityIds.length && (
                  <p>
                    {c.affected} · {f.entityIds.join(', ')}
                  </p>
                )}
                {!!f.witnessPath?.length && (
                  <p>
                    {c.witnessPath} · {f.witnessPath.join(' → ')}
                  </p>
                )}
                {f.suggestedRepair && <p>{f.suggestedRepair}</p>}
                {inspect && (
                  <div className="actions">
                    {[...new Set([...f.entityIds, ...(f.witnessPath ?? [])])]
                      .filter((id) => canInspect?.(id))
                      .map((id) => (
                        <button type="button" key={id} onClick={() => inspect(id)}>
                          {c.inspect} {id}
                        </button>
                      ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </details>
      ))}
    </section>
  );
}
