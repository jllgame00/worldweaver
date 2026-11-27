import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from './project.generated';
import type { GenerationStatus } from './validation';
import { useFormatter, useLocale } from './locale';
import { readIntakeReceipts, retainedActivity } from './retainedActivity';
import { useVerificationStatus } from './verificationCopy';
import { useIntakeCopy } from './intakeLocale';
import './evidenceWorkspace.css';

export default function Operations({ databaseName, project, configuration }: {
  databaseName: string; project?: Project; configuration?: GenerationStatus | null;
}) {
  const ko = useLocale() === 'ko';
  const t = (en: string, kr: string) => ko ? kr : en;
  const { number, date } = useFormatter();
  const intake = useIntakeCopy();
  const status = useVerificationStatus();
  const { receipts, activity, observed } = useMemo(() => {
    const receipts = project ? readIntakeReceipts(databaseName, project.id) : undefined;
    return { receipts, activity: project && retainedActivity(project, receipts ?? []), observed: Date.now() };
  }, [databaseName, project]);
  const [health, setHealth] = useState<{ state: 'pending' | 'ok' | 'failed'; at?: number; commit?: string }>();
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function check() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setHealth({ state: 'pending' });
    try {
      const response = await fetch('/health', { signal: controller.signal, cache: 'no-store' });
      const data: unknown = response.ok && await response.json();
      if (!controller.signal.aborted) setHealth({ state: data && typeof data === 'object' && 'status' in data && data.status === 'ok'
        ? 'ok' : 'failed', at: Date.now(), commit: data && typeof data === 'object' && 'commit' in data &&
          typeof data.commit === 'string' && /^[0-9a-f]{40}$/.test(data.commit) ? data.commit : undefined });
    } catch {
      if (!controller.signal.aborted) setHealth({ state: 'failed', at: Date.now() });
    } finally { request.current = null; }
  }
  const stamp = (value: number) => date(value, { dateStyle: 'medium', timeStyle: 'medium' });
  const title = t('Operations', '운영');
  const names = { extract: t('Content extraction', '소재 추출'), candidates: t('Story candidates', '스토리 후보'),
    scenario: t('Scenario generation and revision', '시나리오 생성·수정'), verify: t('Verification', '검증'),
    world: t('World generation', '세계 생성') };
  const known = (count?: number) => count === undefined ? t('Unknown', '미확인') : number(count);
  function metric(label: string, count?: number) {
    return <tr key={label}><th scope="row">{label}</th><td>{known(count)}</td></tr>;
  }
  return <section className="evidence-workspace operations-workspace" aria-label={title}>
    <header className="page-heading"><h1>{title}</h1></header>
    <div className="operations-layout">
      <section className="panel">
        <h2>{t('Retained activity', '보관된 활동')}</h2>
        {activity ? <>
          <p>{t('Current project · checks and generation recorded in the project, plus intake receipts on this browser.',
            '현재 프로젝트에 보관된 검사·생성 기록과 이 브라우저의 소재 접수 영수증을 집계합니다.')}</p>
          <p className="muted">{t('Snapshot viewed', '집계 확인 시각')} · {stamp(observed)}</p>
          {receipts === undefined && <p role="status">{t('The browser intake history is unavailable.', '브라우저의 소재 접수 이력을 읽을 수 없습니다.')}</p>}
          <table aria-label={t('Retained activity', '보관된 활동')} className="operations-metrics"><tbody>
            {metric(t('Live requests', '실제 모델 요청'), activity.totals.live.calls)}
            {metric(t('Mock requests', '모의 요청'), activity.totals.mock.calls)}
            {metric(t('Unconfirmed dispatch', '전송 여부 미확인'), activity.totals.live.unknown + activity.totals.mock.unknown)}
            {metric(t('Received responses', '응답 수신'), activity.totals.live.responses + activity.totals.mock.responses)}
            {metric(t('Failed requests', '실패한 요청'), activity.totals.live.failed + activity.totals.mock.failed)}
            {metric(t('Rejected outputs', '검증에서 거절된 출력'), activity.totals.live.rejected + activity.totals.mock.rejected)}
            {metric(t('Local fallbacks', '로컬 대체 처리'), receipts && activity.fallback)}
            {metric(t('Local organization', '직접 선택한 로컬 정리'), receipts && activity.local)}
            {metric(t('Deterministic runs', '결정론적 실행'), activity.deterministic)}
          </tbody></table>
          <p>{t('Response, failure and rejection totals include live and mock requests. A received response may fail validation. Earlier activity without receipts is unknown.',
            '응답·실패·출력 거절은 실제 요청과 모의 요청을 합한 수입니다. 수신한 응답이 검증에서 거절될 수도 있습니다. 영수증이 없는 이전 활동은 집계 범위 밖입니다.')}</p>
          <details><summary>{t('Request breakdown and sources', '요청 목적과 출처')}</summary>
            <table className="operations-metrics"><thead><tr><th>{t('Purpose', '목적')}</th><th>{t('Live', '실제')}</th><th>{t('Mock', '모의')}</th></tr></thead>
              <tbody>{(Object.keys(names) as (keyof typeof names)[]).map(key => <tr key={key}><th scope="row">{names[key]}</th>
                <td>{known(key === 'extract' && !receipts ? undefined : activity.purposes[key].live)}</td>
                <td>{known(key === 'extract' && !receipts ? undefined : activity.purposes[key].mock)}</td></tr>)}</tbody></table>
            <table className="operations-metrics"><thead><tr><th>{t('Reported outcome', '확인된 결과')}</th><th>{t('Live', '실제')}</th><th>{t('Mock', '모의')}</th></tr></thead>
              <tbody>{([
                ['responses', t('Received', '응답 수신')], ['failed', t('Request failed', '요청 실패')],
                ['rejected', t('Output rejected', '출력 거절')], ['unknown', t('Dispatch unconfirmed', '전송 여부 미확인')],
              ] as const).map(([key, label]) => <tr key={key}><th scope="row">{label}</th>
                <td>{number(activity.totals.live[key])}</td><td>{number(activity.totals.mock[key])}</td></tr>)}
                <tr><th scope="row">{t('Dispatched with no recorded outcome', '전송 후 결과 미확인')}</th>
                  {(['live', 'mock'] as const).map(mode => { const row = activity.totals[mode];
                    return <td key={mode}>{number(Math.max(0, row.calls - row.responses - row.failed))}</td>; })}</tr>
              </tbody></table>
            <dl className="operations-details">
              <dt>{t('Portable run records', '프로젝트 실행 기록')}</dt><dd>{number(activity.runs)}</dd>
              <dt>{t('Verification reports', '검증 보고서')}</dt><dd>{number(activity.reports)}</dd>
              <dt>{t('Archived reports', '보관 처리된 보고서')}</dt><dd>{number(activity.archived)}</dd>
              <dt>{t('Dated verification history', '시각이 기록된 검증 기간')}</dt>
              <dd>{activity.dates.length ? stamp(activity.dates[0]!) + ' – ' + stamp(activity.dates.at(-1)!)
                : t('No dated reports', '시각이 기록된 보고서 없음')}</dd>
              <dt>{t('Browser intake receipts', '브라우저 소재 영수증')}</dt><dd>{known(receipts?.length)}</dd>
              <dt>{t('Intake drafts accepted / declined', '사용자가 수락 / 거절한 소재 초안')}</dt><dd>{known(receipts && activity.accepted)} / {known(receipts && activity.declined)}</dd>
            </dl>
            <p className="muted">{t('Portable records can come from imported projects. Reports share run IDs. Legacy run totals do not identify the outcome of every attempt.',
              '프로젝트 기록에는 가져온 이력이 포함될 수 있습니다. 보고서와 실행은 같은 실행 ID를 공유합니다. 예전 실행 합계만으로는 각 시도의 결과를 알 수 없습니다.')}</p>
          </details>
          <section aria-label={t('Recent operation history', '최근 작업 이력')} className="operation-log">
            <h3>{t('Recent operation history', '최근 작업 이력')}</h3>
            <p className="muted">{t('Latest five records per source, in recorded order.', '출처별로 최근 다섯 건을 기록 순서대로 표시합니다.')}</p>
            <h4>{t('Project runs', '프로젝트 실행')}</h4>
            {project?.runs.length ? <ol>{project.runs.slice(-5).reverse().map(run=>
              <li key={run.id}>{names[run.stage]} · {status(run.status)} · {run.mode === 'deterministic' ? t('Deterministic', '결정론적') : run.mode === 'mock' ? intake.mock : intake.live}</li>)}</ol> :
              <p>{t('No recorded runs.', '기록된 실행이 없습니다.')}</p>}
            <h4>{intake.history}</h4>
            {receipts?.length ? <ol>{receipts.slice(0,5).map(r=><li key={r.id}>{intake.methods[r.method]} · {intake.outcomes[r.outcome]}</li>)}</ol> :
              <p>{receipts ? t('No retained intake receipts.', '보관된 소재 영수증이 없습니다.') : t('Unknown', '미확인')}</p>}
          </section>
        </> : <p>{t('Open a project to inspect its retained operations.', '프로젝트를 열면 해당 작업 기록을 확인할 수 있습니다.')}</p>}
      </section>
      <section className="panel"><h2>{t('Service status', '서비스 상태')}</h2>
        <dl className="operations-details">
          <dt>{t('Generation configuration', '생성 설정')}</dt>
          <dd>{configuration?.deploymentMode === 'public-demo' ? t('Public demo · AI disabled', '공개 데모 · AI 생성 꺼짐') : configuration ? [configuration.mode === 'live' ? t('Live', '실제') : t('Mock', '모의'),
            configuration.provider, configuration.model, configuration.available ? t('Available', '사용 가능') : t('Unavailable', '사용 불가')].join(' · ')
            : t('Unknown', '미확인')}</dd>
          <dt>{t('Backend health', '백엔드 상태')}</dt>
          <dd role="status">{!health ? t('Not checked', '미확인') : health.state === 'pending' ? t('Checking…', '확인 중…')
            : [health.state === 'ok' ? t('Service reachable', '서비스 응답 정상') : t('Health check failed', '상태 확인 실패'), health.at && stamp(health.at)].join(' · ')}</dd>
          <dt>{t('Deployed version', '배포 버전')}</dt><dd>{health?.commit ? <code>{health.commit}</code> : t('Not reported by the service', '서비스에서 제공하지 않음')}</dd>
        </dl>
        <button disabled={health?.state === 'pending'} onClick={() => void check()}>{t('Check service health', '서비스 상태 확인')}</button>
      </section>
    </div>
  </section>;
}
