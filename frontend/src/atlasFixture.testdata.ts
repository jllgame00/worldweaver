import fixture from '../../docs/examples/salt-census.json';
import type { Project } from './project.generated';
export function approvedProject(): Project {
  const p = structuredClone(fixture) as unknown as Project;
  p.scenario = {
    id: 's-estuary',
    title: '지하의 증인',
    summary: '합성 수문 조사',
    approved: true,
    sourceNarrativeId: p.narrative!.id,
    chapters: [{ id: 'ch-water', title: '장부', purpose: '조사', summary: '검증' }],
    locations: [{ id: 'vault', name: '지하 기록실', kind: 'dungeon', purpose: '증거 보관' }],
    geography: [
      {
        relation: 'beneath',
        from: 'vault',
        to: p.world!.locations[0]!.id,
        description: '기록실은 방앗간 아래에 있다.',
      },
    ],
    settings: {
      scale: 'short',
      chapterCount: 1,
      branching: 'branching',
      mainQuests: 'strong',
      sideQuests: 'some',
      endings: 'multiple',
      instructions: '',
    },
    layout: [],
    factIds: p.canonicalFacts.map((x) => x.id),
    contentIds: p.userContent.map((x) => x.id),
  };
  p.nodes.forEach((n) => {
    n.chapterId = 'ch-water';
  });
  return p;
}
