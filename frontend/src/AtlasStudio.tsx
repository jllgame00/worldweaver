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
import './atlasStudio.css';

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
  const [draft, setDraft] = useState<AtlasDraft>(),
    [notice, setNotice] = useState(''),
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
        setNotice(
          savedMessage
            ? savedMessage +
                ' Another tab changed the proposal. Reopen the project to check for a newer working copy.'
            : e.message,
        );
        return false;
      }
      if (!next) {
        setNotice(
          (savedMessage + ' Could not clear the saved working copy. Reopen the project to review it.').trim(),
        );
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
      setNotice('');
      if (await store({ world: next, base })) {
        setHistory(w ? [...history.slice(-11), { world: w, base: draft?.base ?? p.revision }] : []);
        setFuture([]);
        setCustom(next.constraints ?? []);
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Atlas edit failed.');
    }
  }
  async function generate() {
    if (ctl.current || !sourceReady(p)) return;
    if (draft && !window.confirm('Replace the current working proposal with a new generation?')) return;
    const controller = new AbortController();
    ctl.current = controller;
    setBusy(true);
    setNotice('');
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
      if (!controller.signal.aborted) setNotice(e instanceof Error ? e.message : 'Generation failed.');
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
      setNotice(e instanceof Error ? e.message : 'Save failed.');
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
        {['Minimal', 'Low', 'Medium', 'High'].map((v, i) => (
          <option key={v} value={i}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="atlas-studio">
      <header className="page-heading">
        <h1>World Atlas</h1>
        <p>
          {p.scenario?.title ?? 'Approve a scenario to place its locations.'} · Local procedural generation
        </p>
      </header>
      {w && (
        <strong>
          {writing
            ? 'Reading or saving local atlas…'
            : draft
              ? 'Working proposal'
              : issues.some((i) => i.code === 'source')
                ? 'Outdated world'
                : blocked
                  ? 'World needs review'
                  : w.approved
                    ? 'Approved world'
                    : 'Saved world draft'}
        </strong>
      )}
      {stale && (
        <p role="alert">
          Working copy is based on project revision {draft!.base}. Current revision is {p.revision}.
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {unsaved && (
        <p role="alert">
          The working copy is only in this tab. Browser storage failed. Keep the tab open and retry saving.
        </p>
      )}
      <fieldset disabled={disabled || busy || writing} className="atlas-controls">
        <details className="panel" open={!w || undefined}>
          <summary>Continent settings</summary>
          <div className="atlas-fields">
            <label>
              World name
              <input value={name} maxLength={160} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Seed
              <input
                type="number"
                min="0"
                max="4294967295"
                value={seed}
                onChange={(e) => setSeed(e.target.valueAsNumber)}
              />
            </label>
            <label>
              Continent size
              <select
                value={settings.size}
                onChange={(e) => setSettings({ ...settings, size: e.target.value as AtlasSettings['size'] })}
              >
                <option>small</option>
                <option>standard</option>
              </select>
            </label>
            <label>
              Landform
              <select
                value={settings.landform ?? 'continent'}
                onChange={(e) =>
                  setSettings({ ...settings, landform: e.target.value as AtlasSettings['landform'] })
                }
              >
                <option>continent</option>
                <option>islands</option>
              </select>
            </label>
            <label>
              Scale (km per cell)
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
              Land share · {settings.land}%
              <input
                type="range"
                min="35"
                max="75"
                value={settings.land}
                onChange={(e) => setSettings({ ...settings, land: +e.target.value })}
              />
            </label>
            <label>
              Climate
              <select
                value={settings.climate}
                onChange={(e) =>
                  setSettings({ ...settings, climate: e.target.value as AtlasSettings['climate'] })
                }
              >
                <option>temperate</option>
                <option>arid</option>
                <option>cold</option>
              </select>
            </label>
            {density('ruggedness', 'Terrain ruggedness')}
            {density('settlements', 'Settlement density')}
            {density('roads', 'Road density')}
            {density('politics', 'Political territory density')}
            <button disabled={!sourceReady(p) || !name.trim()} onClick={() => void generate()}>
              Generate continent
            </button>
          </div>
          {atlasSourceProblem(p) && <p>{atlasSourceProblem(p)}</p>}
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
                Undo atlas edit
              </button>
              <button disabled={!future.length} onClick={() => restore(true)}>
                Redo atlas edit
              </button>
              <button onClick={() => mutate(() => ({ ...w, routes: buildRoutes(w, plan) }))}>
                Recalculate routes
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Reposition unlocked locations and recalculate routes?'))
                    mutate(() => {
                      const next = { ...w, locations: placeLocations(w, w.locations, plan) };
                      return { ...next, routes: buildRoutes(next, plan) };
                    });
                }}
              >
                Place unlocked locations
              </button>
              {(stale || issues.some((i) => i.code === 'source' || i.code === 'requirements')) && (
                <button
                  disabled={!sourceReady(p)}
                  onClick={() => mutate(() => reconcileWorld(p, w), p.revision)}
                >
                  Reconcile with approved scenario
                </button>
              )}
            </div>
            <AtlasMap
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
            />
            <div className="atlas-records">
              <nav className="panel atlas-index" aria-label="Atlas index">
                <h2>Atlas index</h2>
                <label>
                  Find a record
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
                </label>
                {(
                  [
                    ['Locations', w.locations],
                    ['Regions', w.regions],
                    ['Territories', w.territories ?? []],
                    [
                      'Routes',
                      w.routes.map((r) => ({
                        id: r.id,
                        name:
                          (sites.find((v) => v.id === r.from)?.name ?? r.from) +
                          ' → ' +
                          (sites.find((v) => v.id === r.to)?.name ?? r.to),
                      })),
                    ],
                    [
                      'Scenario journeys',
                      p.edges
                        .filter((e) => e.travel === 'required' && e.kind !== 'reference')
                        .map((e) => ({ id: e.id, name: e.label })),
                    ],
                  ] as const
                ).map(([title, rows]) => (
                  <details key={title} open={title === 'Locations' || undefined}>
                    <summary>
                      {title} ({rows.length})
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
            </div>
            <section className="panel">
              <h2>Geography validation</h2>
              <button
                onClick={() => {
                  const all = worldIssues(p, w);
                  setNotice(
                    'Validation complete · ' +
                      all.filter((i) => i.severity === 'error').length +
                      ' blocking findings.',
                  );
                }}
              >
                Revalidate world
              </button>
              {issues.length === 0 ? (
                <p>Geography and required journeys passed.</p>
              ) : (
                <ul>
                  {issues.map((v, i) => (
                    <li key={i}>
                      <strong>
                        {v.severity} · {v.code}
                      </strong>{' '}
                      {v.message} {v.repair}
                      {v.ids.map((id) => (
                        <button key={id} onClick={() => select(id)}>
                          {sites.find((l) => l.id === id)?.name ?? id}
                        </button>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
              <p>Review terrain, political boundaries and journey meaning against the approved scenario.</p>
              <div className="atlas-tools">
                <button disabled={!draft || blocked} onClick={() => void adopt(false)}>
                  Accept world draft
                </button>
                <button disabled={blocked || (!draft && w.approved)} onClick={() => void adopt(true)}>
                  Approve world
                </button>
                {draft && (
                  <button
                    onClick={async () => {
                      if (
                        window.confirm('Discard the working proposal and return to the saved project?') &&
                        (await store(undefined))
                      ) {
                        setHistory([]);
                        setFuture([]);
                        setCustom(p.world?.constraints ?? []);
                      }
                    }}
                  >
                    Discard world proposal
                  </button>
                )}
                <button onClick={() => downloadFile(p.id + '-atlas.md', atlasMarkdown(w), 'text/markdown')}>
                  Export atlas Markdown
                </button>
              </div>
            </section>
          </>
        )}
        <button onClick={() => downloadFile(p.id + '.json', JSON.stringify(p, null, 2), 'application/json')}>
          Export saved project JSON
        </button>
      </fieldset>
      {busy && (
        <p role="status">
          {stage}
          <button
            onClick={() => {
              ctl.current?.abort();
              setBusy(false);
              setStage('');
              setNotice('Generation cancelled.');
            }}
          >
            Cancel generation
          </button>
        </p>
      )}
    </section>
  );
}
