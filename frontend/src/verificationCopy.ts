import { useDiagnostic, useFormatter, useLocale, useLocalized, type Translation } from './locale';
import type { AgentRun, Receipt, ValidationFinding, VerificationToolReceipt } from './project.generated';
import { useAtlasDiagnostic } from './atlasCopy';
import { useScenarioRule } from './ScenarioFindings';
import { semanticCopy, useSemanticCopy } from './semanticReviewCopy';

export const verificationCopy = {
  bible: 'World Bible',
  title: 'Verification Agent',
  scope: 'Verification scope',
  target: 'Review target',
  mode: { quick: 'Quick Check', targeted: 'Targeted Review', full: 'Full World Review' },
  run: { quick: 'Run Quick Check', targeted: 'Run Targeted Review', full: 'Run Full World Review' },
  cost: 'Deterministic checks use zero provider requests.',
  select: 'Select a record to review.',
  cancel: 'Cancel verification',
  plan: 'Execution plan',
  waiting: 'Planned',
  running: 'Invoking',
  history: 'Verification history',
  current: 'Applies to current design',
  stale: 'Historical snapshot — run a new check before editing.',
  checking: 'Comparing design snapshot…',
  empty: 'No verification runs saved yet.',
  scopeAll: 'Whole project',
  markdown: 'Export report Markdown',
  json: 'Export findings JSON',
  project: 'Export saved project JSON',
  receipts: 'Tool execution',
  findings: 'Findings',
  details: 'Evidence and field paths',
  paths: 'Feasible ending paths',
  unreviewed: 'Creative coherence and the meaning of free-text rules require editorial review.',
  semanticLimit:
    'AI findings are editorial judgments about the cited excerpts. The owner decides whether to revise them.',
  noFindings: 'No findings were recorded within the checked scope.',
  review: 'Inspect record',
  revise: 'Prepare repair',
  compare: 'Repair comparison',
  field: 'Field to revise',
  replace: 'Proposed value',
  before: 'Original',
  after: 'Proposed',
  simulate: 'Simulate on isolated copy',
  accept: 'Accept repair and download recovery JSON',
  reject: 'Reject proposal',
  disabled: 'Wait for the pending project operation to finish.',
  expired: 'The project changed. Run verification again.',
  failed: 'The verification operation could not be completed.',
  result: 'Validation before and after',
  ownerConfirm: 'I reviewed the affected records and approval changes.',
  recover: 'A recovery JSON copy downloads when you accept.',
  approvals: 'Affected approvals',
  dependency: 'Dependent records',
  grouped: 'Apply the selected changes together.',
  openEditor: 'Open the source record to design a correction.',
  technical: 'Technical correction',
  creative: 'Owner-authored correction',
  actions: 'Owner decisions',
  revalidate: 'Revalidate',
  declined: 'Rejected',
  accepted: 'Accepted',
  noTarget: 'No supported records in this scope.',
  limit: 'The retained report reached its finding limit. Narrow the scope for the remaining details.',
  severity: {
    error: 'Blocking errors',
    warning: 'Warnings',
    info: 'Information',
    editorial: 'Editorial suggestions',
  },
  incomplete:
    'Verification did not finish. Resolve the failed or incomplete checks before applying a repair.',
  harmful: 'The isolated result introduces a blocking finding.',
  unchanged: 'The source finding persists in the isolated result.',
  available: 'Ready for owner review',
  previewOnly: 'Review the proposed values and simulate before acceptance.',
  budget:
    'This run has used its two repair attempts. Start a new verification run to propose another change.',
  invalidSelection: 'Select an existing finding and up to twelve related edits.',
  queue: 'Add to joint proposal',
  remove: 'Remove from selection',
  tool: 'Tool',
  attempts: 'Repair attempts',
  savedProposal: 'Saved proposal',
  waitingForSimulation: 'Simulation has no completed result.',
  runUsage: 'Provider requests',
  unknown: 'dispatch and usage unconfirmed',
  reportedTokens: 'Reported tokens',
  addValue: 'Enter a different value to simulate or reject a proposal.',
  noApproval: 'draft or absent',
  approved: 'approved',
  blocked: 'The simulation blocked this repair.',
  reviewAgain: 'Run a new verification to prepare a new revision of this proposal.',
  missingReview: 'Run the selected deterministic review to open the optional semantic evidence preview.',
  timestamp: 'Recorded',
  notChecked: 'Not checked',
  openApprovals: 'Review the downstream source versions after applying this change.',
  related: 'Blocked requirements',
  states: 'states',
  preflight: 'Inspecting the snapshot',
  finalReview: 'I reviewed the story, endings, geography and remaining editorial questions.',
  finalApprove: 'Recheck and approve this design',
  approvedDesign: 'Owner-approved design',
  submitted: 'Source excerpts selected for this request',
  downstream: 'Consequences of this finding',
  narrativeChanged:
    'The saved narrative changed during this edit. Copy any draft text you want to keep, then reopen the saved version.',
  restoreNarrative: 'Reopen saved narrative text',
  gate: 'This report is historical or incomplete. Run a current check to enable repair simulation.',
};

const verificationKorean = {
    bible: '세계관 사전',
    title: '검증 에이전트',
    scope: '검증 범위',
    target: '검토 대상',
    mode: { quick: '빠른 검사', targeted: '대상 검토', full: '전체 세계 검토' },
    run: { quick: '빠른 검사 실행', targeted: '대상 검토 실행', full: '전체 세계 검토 실행' },
    cost: '결정론적 검사에는 공급자 요청이 필요하지 않습니다.',
    select: '검토할 기록을 선택하세요.',
    cancel: '검증 취소',
    plan: '실행 계획',
    waiting: '대기 중',
    running: '실행 중',
    history: '검증 이력',
    current: '현재 설계에 적용',
    stale: '이전 설계의 기록입니다. 편집하기 전에 새 검사를 실행하세요.',
    checking: '설계 스냅샷 비교 중…',
    empty: '아직 저장된 검증 기록이 없습니다.',
    scopeAll: '프로젝트 전체',
    markdown: 'Markdown 보고서 내보내기',
    json: '검증 소견 JSON 내보내기',
    project: '저장된 프로젝트 JSON 내보내기',
    receipts: '도구 실행 기록',
    findings: '검증 소견',
    details: '검증 근거와 필드 경로',
    paths: '도달 가능한 결말 경로',
    unreviewed: '이야기의 일관성과 자유 형식 규칙의 의미는 편집 검토가 필요합니다.',
    semanticLimit: 'AI 소견은 인용된 발췌문에 대한 편집 의견입니다. 수정 여부는 소유자가 결정합니다.',
    noFindings: '검사 범위에서 기록된 소견이 없습니다.',
    review: '기록 살펴보기',
    revise: '수정안 준비',
    compare: '수정 전후 비교',
    field: '수정할 필드',
    replace: '제안 값',
    before: '기존 값',
    after: '제안 값',
    simulate: '분리된 사본에서 시뮬레이션',
    accept: '수정 적용 및 복구 JSON 다운로드',
    reject: '제안 거절',
    disabled: '진행 중인 프로젝트 작업이 끝날 때까지 기다리세요.',
    expired: '프로젝트가 변경되었습니다. 다시 검증하세요.',
    failed: '검증 작업을 완료하지 못했습니다.',
    result: '변경 전후 검증 결과',
    ownerConfirm: '영향을 받는 기록과 승인 변경 사항을 검토했습니다.',
    recover: '수정을 적용하면 복구용 JSON 사본을 다운로드합니다.',
    approvals: '영향을 받는 승인',
    dependency: '의존하는 기록',
    grouped: '선택한 변경 사항을 함께 적용합니다.',
    openEditor: '수정하려면 원본 기록의 편집기를 여세요.',
    technical: '기술적 수정',
    creative: '소유자가 작성한 수정',
    actions: '소유자 결정',
    revalidate: '다시 검증',
    declined: '거절됨',
    accepted: '수락됨',
    noTarget: '이 범위에 지원되는 기록이 없습니다.',
    limit: '저장 가능한 검증 소견 한도에 도달했습니다. 남은 항목을 보려면 범위를 좁히세요.',
    severity: { error: '진행을 막는 오류', warning: '경고', info: '정보', editorial: '편집 제안' },
    incomplete: '검증이 끝나지 않았습니다. 수정을 적용하기 전에 실패했거나 끝나지 않은 검사를 해결하세요.',
    harmful: '분리된 사본의 검증에서 진행을 막는 새로운 문제가 발견되었습니다.',
    unchanged: '분리된 사본에도 기존 문제가 남아 있습니다.',
    available: '소유자 검토 대기',
    previewOnly: '제안 값을 검토하고 시뮬레이션한 뒤 수락하세요.',
    budget: '이 실행에서 수정 시도 두 번을 모두 사용했습니다. 다른 변경을 제안하려면 다시 검증하세요.',
    invalidSelection: '기존 소견과 관련 변경 사항을 최대 12개 선택하세요.',
    queue: '공동 제안에 추가',
    remove: '선택에서 제거',
    tool: '도구',
    attempts: '수정 시도',
    savedProposal: '저장된 제안',
    waitingForSimulation: '완료된 시뮬레이션 결과가 없습니다.',
    runUsage: '공급자 요청',
    unknown: '전송 여부 및 사용량 미확인',
    reportedTokens: '보고된 토큰 수',
    addValue: '제안을 시뮬레이션하거나 거절하려면 다른 값을 입력하세요.',
    noApproval: '초안 또는 없음',
    approved: '승인됨',
    blocked: '시뮬레이션 결과 이 수정을 적용할 수 없습니다.',
    reviewAgain: '이 제안을 새로 수정하려면 다시 검증하세요.',
    missingReview: '선택한 결정론적 검사를 실행하면 선택 사항인 의미 검토의 근거를 미리 볼 수 있습니다.',
    timestamp: '기록 시각',
    notChecked: '검사 안 함',
    openApprovals: '이 변경을 적용한 뒤 이후 단계가 참조하는 원본 버전을 검토하세요.',
    related: '충족하지 못한 조건',
    states: '탐색한 상태',
    preflight: '스냅샷 검사 중',
    finalReview: '이야기, 결말, 지리 및 남은 편집 질문을 검토했습니다.',
    finalApprove: '다시 검사하고 설계 승인',
    approvedDesign: '소유자가 승인한 설계',
    submitted: '이 요청에 선택된 원본 발췌문',
    downstream: '이 소견으로 인한 후속 문제',
    narrativeChanged: '편집하는 동안 저장된 서사가 변경되었습니다. 보관할 초안을 복사한 뒤 저장된 버전을 다시 여세요.',
    restoreNarrative: '저장된 서사 다시 열기',
    gate: '이전 또는 미완료 보고서입니다. 수정 시뮬레이션을 하려면 현재 설계를 검사하세요.',
} satisfies Translation<typeof verificationCopy>;

export function useVerificationCopy() {
  return useLocalized(verificationCopy, verificationKorean);
}

type VerificationStatus = AgentRun['status'] | Receipt['outcome'] | ValidationFinding['status'] |
  ValidationFinding['severity'] | VerificationToolReceipt['status'] | 'accepted' | 'rejected';

const koreanStatuses: Record<VerificationStatus, string> = {
  running: '실행 중',
  proposed: '제안됨',
  verified: '검증됨',
  unresolved: '미해결',
  failed: '실패',
  cancelled: '취소됨',
  stale: '이전 버전',
  passed: '통과',
  skipped: '건너뜀',
  incomplete: '미완료',
  advice: '조언',
  open: '검토 대기',
  declined: '거절됨',
  resolved: '해결됨',
  superseded: '새 기록으로 대체됨',
  error: '오류',
  warning: '경고',
  info: '정보',
  accepted: '수락됨',
  rejected: '거절됨',
};

export function useVerificationStatus() {
  return useLocalized((status: VerificationStatus): string => status, (status) => koreanStatuses[status]);
}

const koreanTools = {
  schema: '스키마',
  references: '참조',
  sources: '원본',
  progression: '시나리오 진행',
  atlas: '아틀라스',
  coverage: '소재 반영',
  provider_config: '공급자 설정',
  semantic_review: '의미 검토',
  semantic_cancelled: '의미 검토 취소',
  semantic_transport_unknown: '의미 검토 전송 확인 불가',
} satisfies Record<VerificationToolReceipt['tool'] | `semantic_${string}` | 'provider_config', string>;

export function useVerificationTool() {
  return useLocalized((tool: string) => tool, (tool) =>
    Object.hasOwn(koreanTools, tool) ? koreanTools[tool as keyof typeof koreanTools] : tool);
}

export const verificationMessages = {
  duplicateId: 'Two records share the same stable ID.',
  relinkDuplicate: 'Assign a distinct ID and relink affected references.',
  unresolvedReference: 'A typed reference cannot resolve at ',
  selectExpectedType: 'Select an existing entity of the required type.',
  inconsistentLinks:
    'The project has inconsistent links, coverage, version records or approved route endpoints.',
  inspectDomains: 'Inspect source, progression and atlas findings for the affected record.',
  checkedIds: ' stable IDs and project references checked.',
  narrativeApproval: 'narrative approval',
  narrativeStale: 'The approved narrative uses an older source.',
  approveNarrative: 'Review the current narrative and approve it.',
  scenarioApproval: 'scenario approval',
  reviewScenario: 'Review the current narrative and scenario source versions in Scenario Studio.',
  atlasApproval: 'atlas approval',
  atlasStale: 'The atlas lacks approval on the current sources.',
  reconcileAtlas: 'Reconcile the saved atlas against the current scenario and review it.',
  invalidFinalApproval: 'Final approval cites an incomplete or outdated verification run.',
  reviewFinal: 'Review and verify the current revision before approving.',
  comparedSources: 'Compared narrative, scenario, atlas and final approval sources.',
  incompatibleCoverage: 'The selected direction has no compatible coverage decision for this fragment.',
  reviewCoverage: 'Review its treatment and the selected direction.',
  missingSource: 'The scenario source list omits this record.',
  consultDesigner: 'Review the source with the designer.',
  fragmentCount: ' fragment decisions and ',
  factCount: ' fact links inspected. Story meaning requires editorial judgment.',
  progressionUnavailable: 'Scenario validation is unavailable.',
  invalidProgression: 'Invalid progression receipt.',
  invalidFindings: 'Invalid progression findings.',
  invalidTraversal: 'Invalid feasible transitions.',
  invalidEnding: 'Invalid ending witness.',
  missingProof: 'Missing verification evidence.',
  missingFailure: 'Missing failure evidence.',
  graphBlocked: 'Graph prerequisites failed before feasible-state traversal.',
  exploredBudget: ' of 2048 feasible-state budget explored. ',
  endingCount: ' ending witnesses.',
  noAtlas: 'World geometry and journeys await an atlas.',
  routeCount: ' authored routes. ',
  physicalBlocked: 'Terrain or format validation blocked the spatial and journey checks.',
  journeysIncomplete: 'The full set of feasible scenario journeys was not established.',
  feasibleJourneys: ' feasible journey requirements.',
  skippedAfter: 'Not dispatched after ',
  invalidScope: 'The snapshot or scope could not be checked.',
  noCoverage: 'No selected direction has source coverage to check.',
  noScenario: 'No playable scenario has been saved.',
  legacyAtlas: 'Legacy illustrative world data awaits a supported atlas.',
  invalidSchema: 'The snapshot violates the portable project schema.',
  restoreSchema: 'Restore the required fields and types, then recheck.',
  invalidTarget: 'The selected target is unavailable.',
  selectExisting: 'Select an entity in the current project.',
  snapshotLimit: 'Snapshot exceeds the 1 MiB, 1024-node or 4096-edge verification limit.',
  checkedSchema: 'Portable project schema checked.',
  discardedAfter: 'Discarded tool output after ',
  interrupted: 'The check was interrupted before a result could be used.',
  toolError: 'Tool failed or returned invalid evidence. Run the check again.',
  sourceEditor: 'This field requires its source editor.',
  changedRevision: 'The source revision changed.',
  selectChanges: 'Select between one and twelve edits.',
  dependentChanges: 'Select all dependent proposals together.',
  routeChanged: 'The route changed. Recalculate its physical path.',
  differentValue: 'Enter a replacement value.',
  invalidDistance: 'Invalid route distance.',
  invalidDraft: 'The selected repairs violate the project schema or a typed reference.',
  overlap: 'The original value changed or two proposals edit the same field.',
};

const koreanMessages: Record<keyof typeof verificationMessages, string> = {
  duplicateId: '두 기록이 같은 고유 ID를 사용합니다.',
  relinkDuplicate: '서로 다른 ID를 지정하고 영향을 받는 참조를 다시 연결하세요.',
  unresolvedReference: '다음 경로에서 지정된 유형의 참조를 확인할 수 없습니다. ',
  selectExpectedType: '필요한 유형의 기존 항목을 선택하세요.',
  inconsistentLinks: '프로젝트의 연결, 소재 반영, 버전 기록 또는 승인된 경로의 끝점이 서로 일치하지 않습니다.',
  inspectDomains: '영향을 받는 기록의 원본, 시나리오 진행, 아틀라스 소견을 검토하세요.',
  checkedIds: '개의 고유 ID와 프로젝트 참조를 검사했습니다.',
  narrativeApproval: '서사 승인',
  narrativeStale: '승인된 서사가 이전 버전의 원본을 사용합니다.',
  approveNarrative: '현재 서사를 검토하고 승인하세요.',
  scenarioApproval: '시나리오 승인',
  reviewScenario: '시나리오 설계에서 현재 스토리와 시나리오 원본의 버전을 검토하세요.',
  atlasApproval: '아틀라스 승인',
  atlasStale: '아틀라스가 현재 원본을 기준으로 승인되지 않았습니다.',
  reconcileAtlas: '저장된 아틀라스를 현재 시나리오에 맞춰 검토하세요.',
  invalidFinalApproval: '최종 승인이 미완료 또는 이전 검증 기록을 참조합니다.',
  reviewFinal: '승인하기 전에 현재 리비전을 검토하고 검증하세요.',
  comparedSources: '서사, 시나리오, 아틀라스 및 최종 승인의 원본을 비교했습니다.',
  incompatibleCoverage: '선택한 서사 방향에는 이 소재의 반영 방식에 맞는 결정이 없습니다.',
  reviewCoverage: '이 소재의 반영 방식과 선택한 서사 방향을 검토하세요.',
  missingSource: '시나리오 원본 목록에 이 기록이 없습니다.',
  consultDesigner: '디자이너와 함께 원본을 검토하세요.',
  fragmentCount: '개의 소재 반영 결정과 ',
  factCount: '개의 사실 연결을 검사했습니다. 이야기의 의미는 편집 검토가 필요합니다.',
  progressionUnavailable: '시나리오 검증을 사용할 수 없습니다.',
  invalidProgression: '진행 검사 기록이 유효하지 않습니다.',
  invalidFindings: '진행 검사 소견이 유효하지 않습니다.',
  invalidTraversal: '도달 가능한 전이 기록이 유효하지 않습니다.',
  invalidEnding: '결말 경로의 근거가 유효하지 않습니다.',
  missingProof: '검증 근거가 누락되었습니다.',
  missingFailure: '검사 실패 근거가 누락되었습니다.',
  graphBlocked: '그래프의 사전 조건을 충족하지 못해 도달 가능한 상태를 탐색하지 못했습니다.',
  exploredBudget: '개의 상태를 탐색했습니다. 결말 경로 ',
  endingCount: '개를 확인했습니다.',
  noAtlas: '세계 지형과 이동 경로를 검사하려면 아틀라스가 필요합니다.',
  routeCount: '개의 작성된 경로. ',
  physicalBlocked: '지형이나 형식 검증에 실패하여 위치와 이동 경로를 검사하지 못했습니다.',
  journeysIncomplete: '시나리오에서 가능한 이동 요건을 모두 확인하지 못했습니다.',
  feasibleJourneys: '개의 실현 가능한 이동 요건을 확인했습니다.',
  skippedAfter: '다음 상태 이후에는 검사를 실행하지 않았습니다. ',
  invalidScope: '스냅샷이나 검증 범위를 검사할 수 없습니다.',
  noCoverage: '소재 반영을 검사할 수 있는 서사 방향을 선택하지 않았습니다.',
  noScenario: '플레이 가능한 시나리오가 저장되어 있지 않습니다.',
  legacyAtlas: '이전 형식의 예시 지도를 검사하려면 지원되는 아틀라스가 필요합니다.',
  invalidSchema: '스냅샷이 프로젝트 스키마를 위반합니다.',
  restoreSchema: '필수 필드 및 유형을 복구한 후 다시 검사하세요.',
  invalidTarget: '선택한 검토 대상을 사용할 수 없습니다.',
  selectExisting: '현재 프로젝트의 항목을 선택하세요.',
  snapshotLimit: '스냅샷이 검증 한도(1 MiB, 노드 1,024개 또는 분기 4,096개)를 초과합니다.',
  checkedSchema: '이식 가능한 프로젝트 스키마를 검사했습니다.',
  discardedAfter: '다음 상태 이후의 도구 결과를 폐기했습니다. ',
  interrupted: '검사가 중단되어 결과를 사용할 수 없습니다.',
  toolError: '도구가 실패했거나 유효하지 않은 근거를 반환했습니다. 다시 검사하세요.',
  sourceEditor: '이 필드는 원본 편집기에서 편집하세요.',
  changedRevision: '원본 리비전이 변경되었습니다.',
  selectChanges: '변경 사항을 1~12개 선택하세요.',
  dependentChanges: '서로 의존하는 제안을 모두 함께 선택하세요.',
  routeChanged: '경로가 변경되었습니다. 실제 이동 경로를 다시 계산하세요.',
  differentValue: '기존 값과 다른 값을 입력하세요.',
  invalidDistance: '경로 거리가 유효하지 않습니다.',
  invalidDraft: '선택한 수정이 프로젝트 스키마 또는 유형이 지정된 참조를 위반합니다.',
  overlap: '원래 값이 변경되었거나 두 제안이 같은 필드를 수정합니다.',
};

const koreanLocalDetails = new Map<string, string>([
  ...Object.entries(verificationMessages).map(([key, english]) =>
    [english, koreanMessages[key as keyof typeof koreanMessages]] as const),
  ...(['expired', 'failed', 'incomplete', 'harmful', 'unchanged', 'invalidSelection', 'budget'] as const)
    .map((key) => [verificationCopy[key], verificationKorean[key]] as const),
]);

export function useVerificationDetail() {
  const locale = useLocale();
  const diagnostic = useDiagnostic();
  const atlasDiagnostic = useAtlasDiagnostic();
  const scenarioRule = useScenarioRule();
  const semantic = useSemanticCopy();
  const status = useVerificationStatus();
  const { number } = useFormatter();
  const en = verificationMessages;
  const ko = koreanMessages;
  return (detail: string, code?: string, fallback?: string) => {
    if (locale === 'en') return detail;
    const known = koreanLocalDetails.get(detail);
    if (known) return known;
    if (detail === semanticCopy.cancelReceipt) return semantic.cancelReceipt;
    if (code?.startsWith('scenario.')) {
      const summary = scenarioRule(code);
      if (summary !== code) return summary;
    }
    if (detail.startsWith(en.unresolvedReference)) return ko.unresolvedReference + detail.slice(en.unresolvedReference.length);
    for (const key of ['skippedAfter', 'discardedAfter'] as const) {
      for (const value of ['cancelled', 'stale'] as const) {
        if (detail === en[key] + value + '.') return ko[key] + status(value);
      }
    }
    if (detail.startsWith('Awaiting ') && detail.endsWith('.')) {
      const stages = detail.slice(9, -1).split(', ');
      if (stages.every((stage) => koreanLocalDetails.has(stage)))
        return stages.map((stage) => koreanLocalDetails.get(stage)).join(', ') + ' 대기 중입니다.';
    }
    const references = /^(\d+) stable IDs and project references checked\.$/.exec(detail);
    if (references) return number(Number(references[1])) + ko.checkedIds;
    const coverage = /^(\d+) fragment decisions and (\d+) fact links inspected\. Story meaning requires editorial judgment\.$/.exec(detail);
    if (coverage) return number(Number(coverage[1])) + ko.fragmentCount + number(Number(coverage[2])) + ko.factCount;
    const progression = /^(\d+) of 2048 feasible-state budget explored\. (\d+) ending witnesses\.$/.exec(detail);
    if (progression) return number(2048) + '개 중 ' + number(Number(progression[1])) + ko.exploredBudget +
      number(Number(progression[2])) + ko.endingCount;
    const atlas = /^(\d+) locations, (\d+) authored routes\. (.+)$/.exec(detail);
    if (atlas) {
      const journeys = /^(\d+) feasible journey requirements\.$/.exec(atlas[3]!);
      const result = journeys ? number(Number(journeys[1])) + ko.feasibleJourneys : koreanLocalDetails.get(atlas[3]!);
      if (result) return number(Number(atlas[1])) + '개의 장소와 ' + number(Number(atlas[2])) + ko.routeCount + result;
    }
    const summary = atlasDiagnostic(detail, code);
    return fallback !== undefined && summary === diagnostic(detail, code) ? fallback : summary;
  };
}
