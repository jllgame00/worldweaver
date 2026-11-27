import { useMemo } from 'react';
import { atlasPlaces, displayableGrid } from './atlasPlaces';
import { sourceIssues, sourceReady } from './atlasWorkflow';
import { useFormatter, useLocalized } from './locale';
import { candidatesFresh, narrativeFresh } from './project';
import type { Point } from './project.generated';
import { scenarioCurrent } from './scenarioWorkflow';
import type { SavedProject } from './storage';
import { StudioIcon } from './StudioIcon';
import { useWorkspaceCopy } from './workspaceLocale';

const english = {
  fragments:'Fragments', scenes:'Scenes', declared:'Scenario locations', canonical:'World locations', mapped:'Placed on atlas',
  narrative:'Narrative', scenario:'Scenario', atlas:'Atlas', reports:'Verification reports', counts:'Project contents',
  saved:'Last saved', none:'Not started', candidate:'Candidates ready', draft:'Saved draft', approved:'Approved',
  stale:'Source changed', review:'Needs review', legacy:'Saved terrain', noMap:'No saved atlas', missing:'Terrain unavailable',
  localHint:'Open World Atlas to check for a separate working copy.', id:'Project ID',
  preview:(title:string)=>'Saved terrain · '+title,
};
const korean = {
  fragments:'소재', scenes:'장면', declared:'시나리오 장소', canonical:'세계관 장소', mapped:'지도 배치 장소',
  narrative:'스토리', scenario:'시나리오', atlas:'세계 지도', reports:'검증 보고서', counts:'프로젝트 구성',
  saved:'마지막 저장', none:'시작 전', candidate:'후보 준비됨', draft:'저장된 초안', approved:'승인 완료',
  stale:'원본 변경', review:'검토 필요', legacy:'저장된 지형', noMap:'저장된 지도 없음', missing:'지형 확인 필요',
  localHint:'별도로 보관된 작업본은 세계 지도에서 확인할 수 있습니다.', id:'프로젝트 ID',
  preview:(title:string)=>'저장된 지형 · '+title,
};

// Paint horizontal runs directly from the saved cells. Each terrain group needs only one SVG path.
function TerrainThumbnail({tiles, label}: {tiles:string[]; label:string}) {
  const paths = useMemo(()=>{
    const groups = {land:'', woodland:'', highland:''};
    tiles.forEach((row,y)=>{
      for (const match of row.matchAll(/([pvfdmhs])\1*/g)) {
        const kind = match[1]!;
        const group = kind === 'f' ? 'woodland' : 'mhs'.includes(kind) ? 'highland' : 'land';
        groups[group] += 'M'+match.index+' '+(y+.5)+'h'+match[0].length;
      }
    });
    return groups;
  },[tiles]);
  return <svg className="saved-terrain" role="img" aria-label={label} viewBox={'0 0 '+tiles[0]!.length+' '+tiles.length}>
    {Object.entries(paths).map(([kind,d])=><path key={kind} className={kind} d={d} fill="none" strokeWidth="1" />)}
  </svg>;
}

export function ProjectEntry({record, repeated, disabled, open}: {
  record:SavedProject; repeated:boolean; disabled:boolean; open:(id:string)=>void;
}) {
  const {project:p,savedAt} = record;
  const c = useLocalized(english,korean), copy = useWorkspaceCopy(), format = useFormatter();
  const w = p.world, grid = w && displayableGrid(w.tiles);
  const sites = atlasPlaces(p);
  const inside = ([x,y]:Point) => Number.isInteger(x) && Number.isInteger(y) && x>=0 && y>=0 && x<(w?.tiles[y]?.length ?? 0);
  const placed = new Set(sites.filter(s=>(s.position && inside(s.position)) || s.area?.some(inside)).map(s=>s.id)).size;
  function narrativeStatus() {
    if (p.narrative) {
      if (!narrativeFresh(p)) return c.stale;
      return p.narrative.approved ? c.approved : c.draft;
    }
    if (!p.storyCandidates.length) return c.none;
    return candidatesFresh(p) ? c.candidate : c.stale;
  }
  function scenarioStatus() {
    if (!p.scenario) return c.none;
    if (!p.narrative?.approved) return c.review;
    if (!scenarioCurrent(p)) return c.stale;
    return p.scenario.approved ? c.approved : c.draft;
  }
  function atlasStatus() {
    if (!w) return c.noMap;
    if (!grid) return w.settings || w.tiles.length ? c.missing : c.noMap;
    if (!w.settings) return c.legacy;
    if (!sourceReady(p)) return c.review;
    if (sourceIssues(p,w).length) return c.stale;
    return w.approved ? c.approved : c.draft;
  }
  const stages = [[c.narrative,narrativeStatus()],[c.scenario,scenarioStatus()],[c.atlas,atlasStatus()]] as const;
  const counts: [string,number][] = [[c.fragments,p.userContent.length],[c.scenes,p.nodes.length],
    [c.declared,p.scenario?.locations.length ?? 0],[c.canonical,new Set(sites.map(s=>s.id)).size]];
  if (grid) counts.push([c.mapped,placed]);
  if (p.verificationHistory?.length) counts.push([c.reports,p.verificationHistory.length]);
  const summary = p.narrative?.story.premise || p.scenario?.summary || p.userContent[0]?.text;
  return <li className="saved-project">
    {grid && w ? <TerrainThumbnail tiles={w.tiles} label={c.preview(p.title)}/> :
      <div className="project-bookplate" aria-hidden="true"><StudioIcon name="narrative"/></div>}
    <div className="project-entry-body">
      <div className="entry-heading"><h3 className="creative">{p.title}</h3>
        <button type="button" className="primary" disabled={disabled} aria-label={copy.open(p.title)}
          aria-describedby={repeated ? 'saved-'+p.id : undefined} onClick={()=>open(p.id)}>{copy.openProject}<StudioIcon name="arrow"/></button></div>
      {summary && <p className="project-summary">{summary}</p>}
      <p className="entry-time">{c.saved} <time dateTime={new Date(savedAt).toISOString()}>{format.date(savedAt,{dateStyle:'medium',timeStyle:'short'})}</time></p>
      <dl className="project-stages">{stages.map(([name,state])=><div key={name} data-approved={state===c.approved}>
        <dt>{name}</dt><dd>{state}</dd></div>)}</dl>
      <dl className="entry-counts" aria-label={c.counts}>{counts.map(([name,n])=><div key={name}><dt>{name}</dt><dd>{format.number(n)}</dd></div>)}</dl>
      {!grid && <small className="draft-map-hint">{c.localHint}</small>}
      {repeated && <details><summary>{c.id}</summary><code id={'saved-'+p.id}>{p.id}</code></details>}
    </div>
  </li>;
}
