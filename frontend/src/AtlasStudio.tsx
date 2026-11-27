import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, World, AtlasSettings, AtlasConstraint } from './project.generated';
import { atlasPlaces, journeyRoutes, portableWorld, resolvedWorld } from './atlasPlaces';
import {
  acceptAtlas,
  atlasSourceProblem,
  atlasMarkdown,
  defaults,
  generateAtlas,
  reconcileWorld,
  requirements,
  sourceReady,
  worldIssues,
} from './atlasWorkflow';
import { buildRoutes, placeLocations } from './atlasSpatial';
import { readAtlasDraft, writeAtlasDraft, type AtlasDraft } from './atlasRecovery';
import { SaveConflict } from './storage';
import { downloadFile } from './scenarioWorkflow';
import AtlasMap from './AtlasMap';
import AtlasInspector from './AtlasInspector';
import { AtlasPlan } from './AtlasPlan';
import { useAtlasDiagnostic, useAtlasLabels } from './atlasCopy';
import { useFormatter, useLocale, useLocalized } from './locale';
import './atlasStudio.css';

const english = {
  title: 'World Atlas',
  approveScenario: 'Approve a scenario to place its locations.',
  localGeneration: 'Local procedural generation',
  reading: 'Reading or saving local atlas…',
  proposal: 'Working proposal',
  outdated: 'Outdated world',
  needsReview: 'World needs review',
  approved: 'Approved world',
  savedDraft: 'Saved world draft',
  stale: (base: string, current: string) => 'Working copy is based on project revision ' + base + '. Current revision is ' + current + '.',
  localOnly: 'The working copy is only in this tab. Browser storage failed. Keep the tab open and retry saving.',
  settings: 'Continent settings',
  worldName: 'World name',
  seed: 'Seed',
  size: 'Continent size',
  small: 'small',
  standard: 'standard',
  landform: 'Landform',
  continent: 'continent',
  islands: 'islands',
  scale: 'Scale (km per cell)',
  land: 'Land share',
  climate: 'Climate',
  temperate: 'temperate',
  arid: 'arid',
  cold: 'cold',
  density: ['Minimal', 'Low', 'Medium', 'High'],
  ruggedness: 'Terrain ruggedness',
  settlements: 'Settlement density',
  roads: 'Road density',
  politics: 'Political territory density',
  generate: 'Generate continent',
  confirmGenerate: 'Replace the current working proposal with a new generation?',
  undo: 'Undo atlas edit',
  redo: 'Redo atlas edit',
  recalculate: 'Recalculate routes',
  confirmReposition: 'Reposition unlocked locations and recalculate routes?',
  placeUnlocked: 'Place unlocked locations',
  reconcile: 'Reconcile with approved scenario',
  index: 'Atlas index',
  features: 'Terrain and waterways',
  find: 'Find a record',
  journeys: 'Scenario journeys',
  validation: 'Geography validation',
  validated: (count: string) => 'Validation complete · ' + count + ' blocking findings.',
  revalidate: 'Revalidate world',
  passed: 'Geography and required journeys passed.',
  review: 'Review terrain, political boundaries and journey meaning against the approved scenario.',
  acceptDraft: 'Accept world draft',
  approve: 'Approve world',
  confirmDiscard: 'Discard the working proposal and return to the saved project?',
  discard: 'Discard world proposal',
  exportMarkdown: 'Export atlas Markdown',
  exportProject: 'Export saved project JSON',
  cancel: 'Cancel generation',
  technical: 'Technical details',
};

type Notice = string | { error: string; saved?: string } | { findings: number };

interface Props {
  project: Project;
  selectedId?: string;
  openScenario: (id: string) => void;
  disabled: boolean;
  commit: (p: Project) => Promise<boolean>;
  current: () => Project | undefined;
  databaseName: string;
}
function journey(p: Project, w: World | undefined, edgeId?: string) {
  const edge = p.edges.find((e) => e.id === edgeId && e.travel === 'required' && e.kind !== 'reference');
  if (!w || !edge) return [];
  const from = p.nodes.find((n) => n.id === edge.from)?.locationId,
    to = p.nodes.find((n) => n.id === edge.to)?.locationId;
  return from && to ? journeyRoutes(w.routes)(from,to) : [];
}
export default function AtlasStudio({
  project: p,
  selectedId,
  openScenario,
  disabled,
  commit,
  current,
  databaseName,
}: Props) {
  const copy = useLocalized(english, {
    title: '세계 지도',
    approveScenario: '장소를 배치하려면 시나리오를 승인하세요.',
    localGeneration: '로컬 절차적 생성',
    reading: '로컬 지도를 읽거나 저장하는 중…',
    proposal: '작업 중인 제안',
    outdated: '이전 버전의 세계',
    needsReview: '세계 검토 필요',
    approved: '승인된 세계',
    savedDraft: '저장된 세계 초안',
    stale: (base, current) => '작업본은 프로젝트 리비전 ' + base + '에 기반합니다. 현재 리비전은 ' + current + '입니다.',
    localOnly: '이 탭에만 작업본이 있습니다. 브라우저에 저장하지 못했습니다. 탭을 열어 둔 채 다시 저장하세요.',
    settings: '대륙 설정',
    worldName: '세계 이름',
    seed: '시드',
    size: '대륙 크기',
    small: '소형',
    standard: '표준',
    landform: '육지 형태',
    continent: '대륙',
    islands: '섬',
    scale: '축척 (칸당 km)',
    land: '육지 비율',
    climate: '기후',
    temperate: '온대',
    arid: '건조',
    cold: '한랭',
    density: ['최소', '낮음', '보통', '높음'],
    ruggedness: '지형 기복',
    settlements: '정착지 밀도',
    roads: '도로 밀도',
    politics: '정치적 영토 밀도',
    generate: '대륙 생성',
    confirmGenerate: '새로 생성한 제안으로 현재 작업 중인 제안을 교체할까요?',
    undo: '지도 편집 실행 취소',
    redo: '지도 편집 다시 실행',
    recalculate: '경로 다시 계산',
    confirmReposition: '잠기지 않은 장소를 다시 배치하고 경로를 다시 계산할까요?',
    placeUnlocked: '잠기지 않은 장소 배치',
    reconcile: '승인된 시나리오와 조정',
    index: '지도 색인',
    features: '지형과 물길',
    find: '기록 찾기',
    journeys: '시나리오 여정',
    validation: '지리 검증',
    validated: (count) => '검증 완료 · 진행을 막는 문제 ' + count + '건.',
    revalidate: '세계 다시 검증',
    passed: '지리와 필수 여정이 검증을 통과했습니다.',
    review: '승인된 시나리오를 기준으로 지형, 정치적 경계, 여정의 의미를 검토하세요.',
    acceptDraft: '세계 초안 채택',
    approve: '세계 승인',
    confirmDiscard: '작업 중인 제안을 삭제하고 저장된 프로젝트로 돌아갈까요?',
    discard: '세계 제안 삭제',
    exportMarkdown: '지도 Markdown 내보내기',
    exportProject: '저장된 프로젝트 JSON 내보내기',
    cancel: '생성 취소',
    technical: '기술 상세 정보',
  });
  const labels = useAtlasLabels();
  const diagnostic = useAtlasDiagnostic();
  const locale = useLocale();
  const { number } = useFormatter();
  const [draft, setDraft] = useState<AtlasDraft>(),
    [notice, setNotice] = useState<Notice>(),
    [busy, setBusy] = useState(false),
    [stage, setStage] = useState('');
  const [writing, setWriting] = useState(true),
    [unsaved, setUnsaved] = useState(false);
  const last = useRef<string | undefined>(undefined),
    ctl = useRef<AbortController | null>(null);
  const canonical = useMemo(() => resolvedWorld(p), [p]);
  const w = draft?.world ?? (canonical?.settings ? canonical : undefined);
  const [seed, setSeed] = useState(p.world?.seed ?? 42),
    [name, setName] = useState(p.world?.name ?? p.narrative?.story.title ?? p.title);
  const [settings, setSettings] = useState<AtlasSettings>(p.world?.settings ?? defaults);
  const [custom, setCustom] = useState<AtlasConstraint[]>(p.world?.constraints ?? []);
  const [selected, select] = useState(selectedId),
    [query, setQuery] = useState('');
  const [history, setHistory] = useState<AtlasDraft[]>([]),
    [future, setFuture] = useState<AtlasDraft[]>([]);
  useEffect(() => { if (selectedId) select(selectedId); }, [selectedId]);
  useEffect(() => {
    let active = true;
    setWriting(true);
    void readAtlasDraft(databaseName, p.id)
      .then((record) => {
        if (!active) return;
        last.current = record?.token;
        const saved = record?.draft;
        setDraft(saved);
        if (saved) {
          setSeed(saved.world.seed);
          setName(saved.world.name ?? p.title);
          setSettings(saved.world.settings!);
          setCustom(saved.world.constraints ?? []);
        }
      })
      .catch(() => {
        if (active) setNotice('Could not open the local working copy. The saved project is still available.');
      })
      .finally(() => {
        if (active) setWriting(false);
      });
    return () => {
      active = false;
      ctl.current?.abort();
    };
  }, [databaseName, p.id]);
  const plan = useMemo(() => requirements(p, w?.constraints ?? custom), [p, w, custom]);
  const issues = useMemo(() => (w ? worldIssues(p, w) : []), [p, w]);
  const sites = w?.locations ?? atlasPlaces(p);
  const paths = useMemo(() => journey(p, w, selected), [p, w, selected]);
  const scenarioRoutes = useMemo(() => [...new Set(p.edges.flatMap((e) => journey(p, w, e.id)))], [p, w]);
  const stale = !!draft && draft.base !== p.revision;
  const blocked = issues.some((i) => i.severity === 'error') || stale;
  const sourceProblem = atlasSourceProblem(p);
  function sourceCurrent() {
    const source = current();
    if (source?.revision === p.revision && source.id === p.id) return true;
    setNotice('The source changed. Reopen this project before editing or approving it.');
    return false;
  }
  async function store(next: AtlasDraft | undefined, savedMessage = '') {
    setWriting(true);
    try {
      const record = await writeAtlasDraft(databaseName, p.id, last.current, next);
      last.current = record?.token;
      setUnsaved(false);
    } catch (e) {
      if (e instanceof SaveConflict) {
        setNotice(savedMessage
          ? { saved: savedMessage, error: 'Another tab changed the proposal. Reopen the project to check for a newer working copy.' }
          : { error: e.message });
        return false;
      }
      if (!next) {
        setNotice({ saved: savedMessage, error: 'Could not clear the saved working copy. Reopen the project to review it.' });
        return false;
      }
      setUnsaved(true);
    } finally {
      setWriting(false);
    }
    setDraft(next);
    return true;
  }
  async function mutate(build: () => World, base = draft?.base ?? p.revision) {
    if (!sourceCurrent()) return;
    try {
      const next = { ...build(), approved: false };
      setNotice(undefined);
      if (await store({ world: next, base })) {
        setHistory(w ? [...history.slice(-11), { world: w, base: draft?.base ?? p.revision }] : []);
        setFuture([]);
        setCustom(next.constraints ?? []);
      }
    } catch (e) {
      setNotice({ error: e instanceof Error ? e.message : 'Atlas edit failed.' });
    }
  }
  async function generate() {
    if (ctl.current || !sourceReady(p)) return;
    if (draft && !window.confirm(copy.confirmGenerate)) return;
    const controller = new AbortController();
    ctl.current = controller;
    setBusy(true);
    setNotice(undefined);
    try {
      // Use reviewed local edits (including locked positions) as the input to regeneration.
      const source = w ? { ...p, world: portableWorld(p, w) } : p;
      const next = await generateAtlas(
        source,
        name,
        seed,
        settings,
        w?.constraints ?? custom,
        setStage,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (current()?.revision !== p.revision || current()?.id !== p.id)
        throw Error('The source changed during generation. Reopen this project.');
      await mutate(() => next, p.revision);
    } catch (e) {
      if (!controller.signal.aborted) setNotice({ error: e instanceof Error ? e.message : 'Generation failed.' });
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        setStage('');
      }
      ctl.current = null;
    }
  }
  async function adopt(approve: boolean) {
    if (!w || !sourceCurrent()) return;
    setWriting(true);
    try {
      const next = acceptAtlas(p, w, draft?.base ?? p.revision, approve);
      // Claim the reviewed working-copy revision before attempting the canonical project transaction.
      if (draft) {
        const reserved = await writeAtlasDraft(databaseName, p.id, last.current, draft);
        last.current = reserved!.token;
        setUnsaved(false);
      } else if ((await readAtlasDraft(databaseName, p.id))?.token !== last.current) {
        throw new SaveConflict(
          'Another tab changed the working copy. Reopen the project before approving it.',
        );
      }
      if (!sourceCurrent()) return;
      if (await commit(next)) {
        const saved = approve ? 'World approval saved.' : 'World draft saved.';
        if (await store(undefined, saved)) {
          setHistory([]);
          setFuture([]);
          setNotice(saved);
        }
      } else setNotice('The project save failed. Your working proposal is still available.');
    } catch (e) {
      setNotice({ error: e instanceof Error ? e.message : 'Save failed.' });
    } finally {
      setWriting(false);
    }
  }
  async function restore(redo: boolean) {
    const stack = redo ? future : history,
      next = stack.at(-1);
    if (!w || !next || !sourceCurrent()) return;
    if (await store({ world: { ...next.world, approved: false }, base: next.base })) {
      const entry = { world: w, base: draft?.base ?? p.revision };
      setHistory(redo ? [...history, entry] : history.slice(0, -1));
      setFuture(redo ? future.slice(0, -1) : [...future, entry]);
    }
  }
  const density = (field: 'ruggedness' | 'settlements' | 'roads' | 'politics', label: string) => (
    <label>
      {label}
      <select
        value={settings[field]}
        onChange={(e) => setSettings({ ...settings, [field]: +e.target.value })}
      >
        {copy.density.map((v, i) => (
          <option key={i} value={i}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="atlas-studio">
      <header className="page-heading">
        <h1>{copy.title}</h1>
        <p>
          {p.scenario?.title ?? copy.approveScenario} · {copy.localGeneration}
        </p>
      </header>
      {w && (
        <strong>
          {writing
            ? copy.reading
            : draft
              ? copy.proposal
              : issues.some((i) => i.code === 'source')
                ? copy.outdated
                : blocked
                  ? copy.needsReview
                  : w.approved
                    ? copy.approved
                    : copy.savedDraft}
        </strong>
      )}
      {stale && (
        <p role="alert">
          {copy.stale(number(draft!.base), number(p.revision))}
        </p>
      )}
      {notice && (
        <div role="status" className="notice">
          {typeof notice === 'string'
            ? diagnostic(notice)
            : 'findings' in notice
              ? copy.validated(number(notice.findings))
              : <>
                  {notice.saved && diagnostic(notice.saved) + ' '}{diagnostic(notice.error)}
                  {locale === 'ko' && (
                    <details>
                      <summary>{copy.technical}</summary>
                      <code lang="en">{notice.error}</code>
                    </details>
                  )}
                </>}
        </div>
      )}
      {unsaved && (
        <p role="alert">
          {copy.localOnly}
        </p>
      )}
      <fieldset disabled={disabled || busy || writing} className="atlas-controls">
        <details className="panel" open={!w || undefined}>
          <summary>{copy.settings}</summary>
          <div className="atlas-fields">
            <label>
              {copy.worldName}
              <input value={name} maxLength={160} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              {copy.seed}
              <input
                type="number"
                min="0"
                max="4294967295"
                value={seed}
                onChange={(e) => setSeed(e.target.valueAsNumber)}
              />
            </label>
            <label>
              {copy.size}
              <select
                value={settings.size}
                onChange={(e) => setSettings({ ...settings, size: e.target.value as AtlasSettings['size'] })}
              >
                <option value="small">{copy.small}</option>
                <option value="standard">{copy.standard}</option>
              </select>
            </label>
            <label>
              {copy.landform}
              <select
                value={settings.landform ?? 'continent'}
                onChange={(e) =>
                  setSettings({ ...settings, landform: e.target.value as AtlasSettings['landform'] })
                }
              >
                <option value="continent">{copy.continent}</option>
                <option value="islands">{copy.islands}</option>
              </select>
            </label>
            <label>
              {copy.scale}
              <input
                type="number"
                min=".1"
                max="100"
                step=".1"
                value={settings.kmPerCell}
                onChange={(e) => setSettings({ ...settings, kmPerCell: +e.target.value })}
              />
            </label>
            <label>
              {copy.land} · {number(settings.land / 100, { style: 'percent' })}
              <input
                type="range"
                min="35"
                max="75"
                value={settings.land}
                onChange={(e) => setSettings({ ...settings, land: +e.target.value })}
              />
            </label>
            <label>
              {copy.climate}
              <select
                value={settings.climate}
                onChange={(e) =>
                  setSettings({ ...settings, climate: e.target.value as AtlasSettings['climate'] })
                }
              >
                <option value="temperate">{copy.temperate}</option>
                <option value="arid">{copy.arid}</option>
                <option value="cold">{copy.cold}</option>
              </select>
            </label>
            {density('ruggedness', copy.ruggedness)}
            {density('settlements', copy.settlements)}
            {density('roads', copy.roads)}
            {density('politics', copy.politics)}
            <button disabled={!sourceReady(p) || !name.trim()} onClick={() => void generate()}>
              {copy.generate}
            </button>
          </div>
          {sourceProblem && <p>{diagnostic(sourceProblem)}</p>}
        </details>
        <AtlasPlan
          world={w}
          sites={sites}
          constraints={plan}
          onChange={(items) => {
            if (!w) setCustom(items);
            else mutate(() => ({ ...w, constraints: requirements(p, items) }));
          }}
        />
        {w && (
          <>
            <div className="atlas-tools">
              <button disabled={!history.length} onClick={() => restore(false)}>
                {copy.undo}
              </button>
              <button disabled={!future.length} onClick={() => restore(true)}>
                {copy.redo}
              </button>
              <button onClick={() => mutate(() => ({ ...w, routes: buildRoutes(w, plan) }))}>
                {copy.recalculate}
              </button>
              <button
                onClick={() => {
                  if (window.confirm(copy.confirmReposition))
                    mutate(() => {
                      const next = { ...w, locations: placeLocations(w, w.locations, plan) };
                      return { ...next, routes: buildRoutes(next, plan) };
                    });
                }}
              >
                {copy.placeUnlocked}
              </button>
              {(stale || issues.some((i) => i.code === 'source' || i.code === 'requirements')) && (
                <button
                  disabled={!sourceReady(p)}
                  onClick={() => mutate(() => reconcileWorld(p, w), p.revision)}
                >
                  {copy.reconcile}
                </button>
              )}
            </div>
            <div className="atlas-workspace"><AtlasMap
              projectId={p.id}
              world={w}
              selected={paths[0] ?? selected}
              onSelect={select}
              issues={issues}
              scenarioLocationIds={[
                ...new Set([
                  ...p.nodes.flatMap((n) => (n.locationId ? [n.locationId] : [])),
                  ...p.quests.flatMap((q) => q.locationIds ?? []),
                  ...(p.scenario?.locations.map((l) => l.id) ?? []),
                ]),
              ]}
              scenarioRouteIds={paths.length ? paths : scenarioRoutes}
              requiredLocationIds={p.nodes.filter(node => node.mandatory && node.locationId).map(node => node.locationId!)
                .concat(plan.filter(c => c.strength === 'hard').flatMap(c => [c.from, ...(c.to ? [c.to] : []), ...(c.via ? [c.via] : [])]))}
            />
            <div className="atlas-records">
              <nav className="panel atlas-index" aria-label={copy.index}>
                <h2>{copy.index}</h2>
                <label>
                  {copy.find}
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
                </label>
                {(
                  [
                    ['locations', labels.locations, w.locations],
                    ['regions', labels.regions, w.regions],
                    ['features', copy.features, w.features],
                    ['territories', labels.territories, w.territories ?? []],
                    [
                      'routes',
                      labels.routes,
                      w.routes.map((r) => ({
                        id: r.id,
                        name:
                          (sites.find((v) => v.id === r.from)?.name ?? r.from) +
                          ' → ' +
                          (sites.find((v) => v.id === r.to)?.name ?? r.to),
                      })),
                    ],
                    [
                      'journeys',
                      copy.journeys,
                      p.edges
                        .filter((e) => e.travel === 'required' && e.kind !== 'reference')
                        .map((e) => ({ id: e.id, name: e.label })),
                    ],
                  ] as const
                ).map(([id, title, rows]) => (
                  <details key={id} open={id === 'locations' || undefined}>
                    <summary>
                      {title} ({number(rows.length)})
                    </summary>
                    {rows
                      .filter((v) => v.name.toLowerCase().includes(query.toLowerCase()))
                      .map((v) => (
                        <button key={v.id} aria-pressed={selected === v.id} onClick={() => select(v.id)}>
                          {v.name}
                        </button>
                      ))}
                  </details>
                ))}
              </nav>
              <AtlasInspector
                p={p}
                world={w}
                id={paths[0] ?? selected}
                select={select}
                openScenario={openScenario}
                change={mutate}
              />
            </div></div>
            <section className="panel">
              <h2>{copy.validation}</h2>
              <button
                onClick={() => {
                  const all = worldIssues(p, w);
                  setNotice({ findings: all.filter((i) => i.severity === 'error').length });
                }}
              >
                {copy.revalidate}
              </button>
              {issues.length === 0 ? (
                <p>{copy.passed}</p>
              ) : (
                <ul>
                  {issues.map((v, i) => (
                    <li key={i}>
                      <strong>
                        {labels.severity[v.severity]} · {v.code}
                      </strong>{' '}
                      {diagnostic(v.message, v.code)} {diagnostic(v.repair, v.code)}
                      {locale === 'ko' && (
                        <details>
                          <summary>{copy.technical}</summary>
                          <code lang="en">{v.message} {v.repair}</code>
                        </details>
                      )}
                      {v.ids.map((id) => (
                        <button key={id} onClick={() => select(id)}>
                          {sites.find((l) => l.id === id)?.name ?? id}
                        </button>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
              <p>{copy.review}</p>
              <div className="atlas-tools">
                <button disabled={!draft || blocked} onClick={() => void adopt(false)}>
                  {copy.acceptDraft}
                </button>
                <button disabled={blocked || (!draft && w.approved)} onClick={() => void adopt(true)}>
                  {copy.approve}
                </button>
                {draft && (
                  <button
                    onClick={async () => {
                      if (
                        window.confirm(copy.confirmDiscard) &&
                        (await store(undefined))
                      ) {
                        setHistory([]);
                        setFuture([]);
                        setCustom(p.world?.constraints ?? []);
                      }
                    }}
                  >
                    {copy.discard}
                  </button>
                )}
                <button onClick={() => downloadFile(p.id + '-atlas.md', atlasMarkdown(w, locale), 'text/markdown')}>
                  {copy.exportMarkdown}
                </button>
              </div>
            </section>
          </>
        )}
        <button onClick={() => downloadFile(p.id + '.json', JSON.stringify(p, null, 2), 'application/json')}>
          {copy.exportProject}
        </button>
      </fieldset>
      {busy && (
        <p role="status">
          {stage && diagnostic(stage)}
          <button
            onClick={() => {
              ctl.current?.abort();
              setBusy(false);
              setStage('');
              setNotice('Generation cancelled.');
            }}
          >
            {copy.cancel}
          </button>
        </p>
      )}
    </section>
  );
}
