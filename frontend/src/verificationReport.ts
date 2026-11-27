import type { AgentRun, Project, VerificationEntry } from './project.generated';
import type { Locale, Translation } from './locale';
import { recordVerification, reportApplies, verificationIdentity } from './verificationHistory';
import { runVerification } from './verificationEngine';
import type { VerificationReport } from './verificationEngine';
import { verificationCopy as c } from './verificationCopy';

export const reportedCalls = (run: AgentRun) =>
  run.receipts.some((r) => ['semantic_cancelled', 'semantic_transport_unknown'].includes(r.tool))
    ? c.unknown
    : run.calls;

export async function confirmWorldReview(project: Project, runId: string, signal: AbortSignal) {
  const entry = project.verificationHistory?.find((row) => row.runId === runId);
  const fingerprint = await verificationIdentity(project);
  if (
    entry?.mode !== 'full' ||
    !reportApplies(entry, fingerprint) ||
    !project.runs.some((r) => r.id === runId && r.mode === 'deterministic' && r.status === 'verified')
  )
    throw Error(c.expired);
  const report = await runVerification(project, { mode: 'full', signal });
  if (report.run.status !== 'verified' || signal.aborted) throw Error(c.incomplete);
  const next = persistReport(project, report, fingerprint);
  return { ...next, approval: { runId: report.run.id, revision: project.revision } };
}

export function persistReport(
  p: Project,
  report: VerificationReport,
  fingerprint: string,
  context?: Pick<VerificationEntry, 'provider' | 'model' | 'sourceRunId' | 'submittedIds' | 'revalidation'>,
  retain?: string,
): Project {
  const { run, tools, mode, targetId, paths, findings, statesExplored } = report;
  const entry: VerificationEntry = {
    runId: run.id,
    timestamp: new Date().toISOString(),
    fingerprint,
    mode,
    ...(targetId && { targetId }),
    ...context,
    tools,
    statesExplored,
    paths: paths.slice(0, 64),
    findings: findings.slice(0, 500),
    ...(findings.length > 500 && { omittedFindings: findings.length - 500 }),
    decisions: [],
  };
  return recordVerification(p, run, entry, retain);
}

const markdownEnglish = {
  title: c.title,
  mode: c.mode,
  scope: 'Scope',
  scopeAll: c.scopeAll,
  snapshot: 'Snapshot',
  revision: 'Revision',
  status: {
    running: 'running', proposed: 'proposed', verified: 'verified', unresolved: 'unresolved',
    failed: 'failed', cancelled: 'cancelled', stale: 'stale',
  } satisfies Record<AgentRun['status'], string>,
  current: c.current,
  stale: c.stale,
  provider: 'Provider',
  none: 'none',
  requests: 'requests',
  tokens: 'tokens',
  unreported: 'unreported',
  unknown: c.unknown,
  receipts: c.receipts,
  findings: c.findings,
  limit: c.limit,
  submitted: c.submitted,
  savedProposal: c.savedProposal,
  unreviewed: c.unreviewed,
  paths: c.paths,
  actions: c.actions,
};

const markdownKorean = {
  title: '검증 에이전트',
  mode: { quick: '빠른 검사', targeted: '대상 검토', full: '전체 세계 검토' },
  scope: '범위',
  scopeAll: '프로젝트 전체',
  snapshot: '스냅샷',
  revision: '리비전',
  status: {
    running: '실행 중', proposed: '제안됨', verified: '검증됨', unresolved: '미해결',
    failed: '실패', cancelled: '취소됨', stale: '이전 버전',
  },
  current: '현재 설계에 적용',
  stale: '이전 설계의 기록입니다. 편집하기 전에 새 검사를 실행하세요.',
  provider: '공급자',
  none: '없음',
  requests: '요청 수',
  tokens: '토큰 수',
  unreported: '보고되지 않음',
  unknown: '전송 여부 및 사용량 미확인',
  receipts: '도구 실행 기록',
  findings: '검증 소견',
  limit: '저장 가능한 검증 소견 한도에 도달했습니다. 남은 항목을 보려면 범위를 좁히세요.',
  submitted: '이 요청에 선택된 원본 발췌문',
  savedProposal: '저장된 제안',
  unreviewed: '이야기의 일관성과 자유 형식 규칙의 의미는 편집 검토가 필요합니다.',
  paths: '도달 가능한 결말 경로',
  actions: '소유자 결정',
} satisfies Translation<typeof markdownEnglish>;

export function verificationMarkdown(
  project: Project,
  entry: VerificationEntry,
  run: AgentRun,
  current: boolean,
  locale: Locale = 'en',
) {
  const copy = locale === 'ko' ? markdownKorean : markdownEnglish;
  const number = locale === 'ko' ? new Intl.NumberFormat(locale).format : String;
  const calls = reportedCalls(run);
  const lines = [
    '# ' + project.title + ' · ' + copy.title,
    '',
    copy.mode[entry.mode] + ' · ' + entry.timestamp,
    copy.scope + ': ' + (entry.targetId ?? copy.scopeAll),
    copy.snapshot + ': ' + entry.fingerprint,
    copy.revision + ' ' + number(run.baseRevision) + ' · ' + copy.status[run.status] + ' · ' + (current ? copy.current : copy.stale),
    copy.provider + ': ' +
      (entry.provider ?? copy.none) +
      ' · ' +
      (entry.model ?? '—') +
      ' · ' + copy.requests + ' ' +
      (typeof calls === 'number' ? number(calls) : copy.unknown) +
      ' · ' + copy.tokens + ' ' +
      (run.tokens === undefined ? copy.unreported : number(run.tokens)),
    '',
    '## ' + copy.receipts,
    ...entry.tools.map((t) => '- ' + t.tool + ' · ' + t.status + ' · ' + t.detail),
    ...run.receipts.map((r) => '- ' + r.tool + ' · ' + r.outcome + ' · ' + r.detail),
    '',
    '## ' + copy.findings,
  ];
  for (const f of entry.findings)
    lines.push(
      '',
      '### ' + f.rule + ' · ' + f.severity + ' · ' + f.origin,
      f.explanation,
      f.suggestedRepair,
      f.status + ' · ' + f.id + ' · ' + f.entityIds.join(', '),
      f.fieldPath ?? '',
      ...(f.blockedTransitions ?? []).map((b) => JSON.stringify(b)),
    );
  if (entry.omittedFindings) lines.push(copy.limit + ' (' + number(entry.omittedFindings) + ')');
  if (entry.submittedIds) lines.push('', copy.submitted + ' · ' + entry.submittedIds.join(', '));
  for (const s of entry.proposals ?? [])
    lines.push(
      '',
      copy.savedProposal + ' · ' + s.classification + ' · ' + s.status,
      ...s.edits.map((e) => '- ' + e.recordId + ' · ' + e.field + ' · ' + e.before + ' → ' + e.after),
      s.detail ?? '',
    );
  lines.push(
    '',
    copy.unreviewed,
    '',
    '## ' + copy.paths,
    ...entry.paths.map((path) => '- ' + path.nodeIds.join(' → ')),
    '',
    '## ' + copy.actions,
    ...entry.decisions.map(
      (d) => '- ' + d.decision + ' · ' + d.recordId + ' · ' + d.field + ' · ' + d.before + ' → ' + d.after,
    ),
  );
  return lines.join('\n');
}
