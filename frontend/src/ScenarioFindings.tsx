import type { Project, ValidationFinding } from './project.generated';
import {atlasPlaces} from './atlasPlaces';
import { useScenarioKind, useStudioCopy } from './scenarioCopy';
import { DiagnosticDetails, useDiagnostic, useFormatter, useLocale, useLocalized, type Translation } from './locale';
import { scenarioCopy } from './studioWorkflowCopy';

const findingCopy = {
  blockedAt: (name?: string) => name ? 'Blocked at ' + name : 'Blocked progression',
  feasiblePath: 'Feasible path',
  unset: 'unset',
  sources: (names: string[]) => names.length ? 'Possible sources · ' + names.join(', ') : 'No matching source identified.',
  technical: 'Technical details',
  downstream: 'Downstream findings',
  severity: { error: 'error', warning: 'warning', info: 'info' },
};

const findingCopyKo = {
  blockedAt: (name) => name ? '진행이 막힌 장면 · ' + name : '진행 불가',
  feasiblePath: '진행 가능한 경로',
  unset: '미설정',
  sources: (names) => names.length ? '값을 설정할 수 있는 항목 · ' + names.join(', ') : '일치하는 항목을 찾지 못했습니다.',
  technical: '기술 세부 정보',
  downstream: '후속 검증 결과',
  severity: { error: '오류', warning: '경고', info: '정보' },
} satisfies Translation<typeof findingCopy>;

const rules: Record<string, readonly [label: string, guidance: string]> = {
  structure: ['필드 형식 오류', '필수 필드를 복원하거나 허용되는 값을 선택하세요.'],
  duplicate_id: ['중복 ID', '각 기록에 고유한 ID를 부여하고 참조를 다시 연결하세요.'],
  project_reference: ['프로젝트 참조 불일치', '프로젝트 원본을 검토하고 참조 대상 기록을 복원하세요.'],
  reference: ['참조 오류', '참조 대상 ID와 유형을 확인하고 올바른 기록을 연결하세요.'],
  narrative_source: ['승인된 원본 필요', '현재 스토리를 검토하고 승인한 뒤 시나리오를 검토하거나 다시 생성하세요.'],
  geography_separates: ['지리적 분리 조건', '두 지점과 그 사이를 가르는 별도의 장소 하나를 지정하세요.'],
  chapter_required: ['장 미지정', '이 노드를 장에 배정하세요.'],
  source_coverage: ['원본 소재 반영 부족', '원본을 검토하고 반영 근거를 보완하세요.'],
  duplicate_layout: ['중복 배치', '노드마다 배치 위치를 하나만 유지하세요.'],
  contradictory_condition: ['충돌하는 조건', '같은 키에 적용할 조건이나 효과의 값을 하나로 정하세요.'],
  duplicate_edge: ['중복 연결', '중복 연결을 제거하거나 선택지와 조건을 다르게 지정하세요.'],
  self_edge: ['자기 연결', '출발과 다른 도착 노드를 선택하세요.'],
  travel_location: ['이동 장소 미지정', '이동의 양쪽 끝에 장소를 지정하세요.'],
  cycle: ['순환 연결', '순환을 만드는 연결을 제거하거나 다른 노드로 연결하세요.'],
  prologue: ['프롤로그 개수 오류', '시작 노드를 하나로 지정하세요.'],
  quest_detail: ['퀘스트 기록 오류', '노드에 해당하는 퀘스트 기록을 하나로 맞추세요.'],
  quest_fields: ['퀘스트 필드 오류', '노드에 장소를 지정하고 목표는 퀘스트 기록에서 편집하세요.'],
  ending_detail: ['결말 기록 오류', '노드에 해당하는 결말 기록을 하나로 맞추세요.'],
  ending_successor: ['결말 이후 연결', '결말에서 이어지는 진행 연결을 제거하세요.'],
  quest_prerequisite_cycle: ['선행 퀘스트 순환', '서로를 요구하는 선행 퀘스트를 검토하세요.'],
  blocked_start: ['시작 조건 미충족', '프롤로그의 진입 조건을 검토하세요.'],
  quest_transition: ['퀘스트 상태 전환 오류', '퀘스트의 현재 상태와 상태 변경 조건을 검토하세요.'],
  state_budget: ['탐색 한도 초과', '분기와 상태 조건을 단순화한 뒤 다시 검증하세요.'],
  dead_end: ['진행이 막힌 장면', '이어지는 경로와 조건을 확인해 실행 가능한 진행을 추가하세요.'],
  progression_blocked: ['진행 조건 미충족', '연결에 필요한 상태가 해당 경로에서 설정되는지 확인하세요.'],
  quest_completion_unreachable: ['완료할 수 없는 퀘스트', '완료에 필요한 상태와 그 상태를 설정하는 경로를 확인하세요.'],
  ending_unreachable: ['도달할 수 없는 결말', '이 결말까지 진행할 수 있는 경로를 연결하세요.'],
  mandatory_unreachable: ['도달할 수 없는 필수 장면', '필수 장면의 진입 조건과 연결을 확인하세요.'],
  optional_unreachable: ['도달할 수 없는 선택 장면', '선택 장면의 진입 조건과 연결을 확인하세요.'],
  no_reachable_ending: ['도달 가능한 결말 없음', '진행 가능한 경로를 결말에 연결하세요.'],
  side_quest_required: ['보조 퀘스트에 의존하는 주요 진행', '주요 경로가 보조 퀘스트를 완료하지 않아도 이어지는지 확인하세요.'],
  geography_pending: ['이동 경로 확인 필요', '세계 지도에서 장소 배치와 이동 경로를 확인하세요.'],
  narrative_review: ['서사 검토 필요', '각 결정과 대가, 결말을 승인된 스토리와 비교하세요.'],
};

export function useScenarioRule() {
  const locale = useLocale();
  return (rule: string) => {
    const key = rule.replace(/^scenario\./, '');
    return locale === 'ko' && Object.hasOwn(rules, key) ? rules[key]![0] : rule;
  };
}

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
  const c = useStudioCopy();
  const labels = useLocalized(findingCopy, findingCopyKo);
  const kindLabel = useScenarioKind();
  const ruleLabel = useScenarioRule();
  const locale = useLocale();
  const diagnostic = useDiagnostic();
  const { number } = useFormatter();
  function guidance(f: ScenarioFinding) {
    const rule = f.rule.replace(/^scenario\./, '');
    return Object.hasOwn(rules, rule) ? rules[rule]![1] : diagnostic(f.explanation, f.rule);
  }
  function describe(f: ScenarioFinding) {
    if (locale === 'en') return <><p>{f.explanation}</p>{f.suggestedRepair && <p>{f.suggestedRepair}</p>}</>;
    return <>
      <p>{guidance(f)}</p>
      <DiagnosticDetails detail={[f.explanation, f.suggestedRepair].filter(Boolean).join(' ')} code={f.rule} />
    </>;
  }
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
            <h4>{labels.blockedAt(owner ? nameOf(owner) : undefined)}</h4>
            <span className="pill">{labels.severity[f.severity]}</span>
            {!f.blockedTransitions?.length && locale === 'en' && <p>{f.explanation}</p>}
            {!!f.witnessPath?.length && <p>{labels.feasiblePath} · {f.witnessPath.map(nameOf).join(' → ')}</p>}
            {f.blockedTransitions?.map((b, i) => (
              <div key={i}>
                <strong>
                  {b.edgeId && nameOf(b.edgeId)} {b.targetId && '→ ' + nameOf(b.targetId)}
                </strong>
                <p>
                  {nameOf(b.key)} ·{' '}
                  <span>
                    {b.actual ?? labels.unset} → {b.required}
                  </span>
                </p>
                <p>
                  {labels.sources(b.producerIds.map(nameOf))}
                </p>
              </div>
            ))}
            {locale === 'ko' ? <p>{guidance(f)}</p> : f.suggestedRepair && <p>{f.suggestedRepair}</p>}
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
                      {c.inspectNamed(nameOf(id))}
                    </button>
                  ))}
              </div>
            )}
            <details>
              <summary>{labels.technical}</summary>
              {(locale === 'ko' || !!f.blockedTransitions?.length) && <p>{f.explanation}</p>}
              {locale === 'ko' && f.suggestedRepair && <p>{f.suggestedRepair}</p>}
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
                <summary>{labels.downstream} ({number(effects.length)})</summary>
                <ul>
                  {effects.map((row, i) => (
                    <li key={i}>
                      {labels.severity[row.severity]} · {ruleLabel(row.rule)} · {row.entityIds.map(nameOf).join(', ')}
                      {describe(row)}
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
            {[rows[0]?.expectedType && kindLabel(rows[0].expectedType), rows[0] && ruleLabel(rows[0].rule.replace(/^scenario\./, ''))].filter(Boolean).join(' · ')} ({number(rows.length)})
          </summary>
          <ol className="record-list">
            {rows.map((f, i) => (
              <li key={i}>
                <span className="pill">{labels.severity[f.severity]}</span>
                {describe(f)}
                <dl>
                  {([
                    ['fieldPath', f.fieldPath],
                    ['referenceId', f.referenceId],
                    ['expectedType', f.expectedType],
                    ['actualType', f.actualType],
                  ] as const).map(
                    ([field, value]) =>
                      value && (
                        <div key={field}>
                          <dt>{c[field]}</dt>
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
                {inspect && (
                  <div className="actions">
                    {[...new Set([...f.entityIds, ...(f.witnessPath ?? [])])]
                      .filter((id) => canInspect?.(id))
                      .map((id) => (
                        <button type="button" key={id} onClick={() => inspect(id)}>
                          {c.inspectNamed(id)}
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
