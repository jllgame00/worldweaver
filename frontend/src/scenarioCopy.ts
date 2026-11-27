import { useLocale, useLocalized, type Translation } from './locale';
import type { Location, Project, Scenario, ScenarioNode, StateTerm } from './project.generated';

export const studioCopy = {
  minimap: 'Graph minimap', minimapKeys: 'Arrow keys pan the graph. Home fits the graph.', fitSelection: 'Fit selection',
  applyLayout: 'Apply layout', layoutPreview: 'Previewing automatic layout', showInspector: 'Show inspector', hideInspector: 'Hide inspector',
  evidence: 'Ending path evidence', examplePath: 'Example path from scenario validation', incomplete: 'The progression search was incomplete.',
  noPath: 'No example path is available for this ending.', pathScope: 'Checks visits and game state. Physical travel and story quality require separate review.',
  participants: 'Appearances and references', referenceHint: 'A reference connects related scenes for the author. Players do not traverse it.',
  visitHint: 'Players must visit every selected scene before entering.', addReference: 'Link a related scene', reviewVisits: 'Review entry conditions',
  prologueVisits: (title: string, names: string) => title + ' starts with an empty visit history. Entry requires ' + names + '.',
  connectionsLegend: 'Connection legend', travelLine: 'Required travel', filters: 'Chapters and quests',
  checkSaved: 'Check saved progression', saveBeforeCheck: 'Save your edits to check the updated entry conditions.',
  fieldPath: 'Field path', referenceId: 'Referenced ID', expectedType: 'Expected type', actualType: 'Actual type',
  witnessPath: 'Play path',
  navigation: 'Scenario navigation', filterChapter: 'Filter chapters', filterNodes: 'Filter node types', filterQuests: 'Filter quests',
  all: 'All', empty: 'No matching nodes.', affected: 'Affected records', nodes: 'Nodes', edits: 'Edit chapter',
  graph: 'Graph', outline: 'Outline', graphName: 'Scenario graph', outlineName: 'Scenario outline',
  inspector: 'Inspector', fit: 'Fit graph', zoomIn: 'Zoom in', zoomOut: 'Zoom out',
  autoLayout: 'Auto-layout', chapter: 'Chapter', chapters: 'Chapters', unassigned: 'Unassigned',
  addChapter: 'Add chapter', addNode: 'Add node', addQuest: 'Add quest', addEdge: 'Connect nodes',
  deleteChapter: 'Delete chapter', deleteNode: 'Delete node', deleteEdge: 'Delete connection',
  confirmDeletion: 'Confirm deletion', cancel: 'Cancel', remove: 'Remove',
  deleteChapterDetail: 'Nodes in this chapter will become unassigned.',
  deleteNodeDetail: 'This removes the node, its quest or ending record, incident connections, and references to them.',
  deleteEdgeDetail: 'This removes the connection between these nodes.',
  nodeType: 'Node type', title: 'Title', description: 'Description', purpose: 'Purpose', summary: 'Summary',
  objective: 'Objective', outcome: 'Outcome', characters: 'Characters', factions: 'Factions', place: 'Location',
  mandatory: 'Mandatory', visited: 'Previously visited nodes', conditions: 'Entry conditions', effects: 'Consequences',
  quest: 'Quest', questType: 'Quest type', questTitle: 'Quest title', questDescription: 'Quest description',
  questObjective: 'Quest objective', questOutcome: 'Quest outcome', prerequisites: 'Prerequisite quests',
  questComplete: 'Completion conditions', questFail: 'Failure conditions', reward: 'Reward',
  questLocations: 'Quest locations', questCharacters: 'Quest characters', questFactions: 'Quest factions',
  ending: 'Ending consequence', edgeLabel: 'Choice label', from: 'Source node', to: 'Destination node',
  edgeType: 'Connection type', travel: 'Travel', travelRequired: 'Required journey', sceneCut: 'Scene cut',
  fromNode: 'Inspect source', toNode: 'Inspect destination', saveEdge: 'Save connection', saveNode: 'Save node',
  saveChapter: 'Save chapter', moveUp: 'Move chapter earlier', moveDown: 'Move chapter later',
  revise: 'Revise selected node', reviseQuest: 'Revise selected quest', reviseChapter: 'Revise selected chapter',
  linked: 'Connections', none: 'None', findings: 'Scenario findings', node: 'Node',
  inspect: 'Inspect', termKind: 'Type', termKey: 'Key', termValue: 'Value', addTerm: 'Add condition',
  noSelection: 'Select a node, connection or chapter to inspect it.',
  cycle: 'This progression would create a cycle. Choose another source or destination.',
  selfEdge: 'A connection needs two different nodes.', search: 'Find a graph entity',
  back: 'Return to previous selection', addEffect: 'Add consequence',
  replaceKind: 'Changing this type removes its related quest or ending record and its references.', confirmChange: 'Confirm type change',
  showLocation: 'Show location on atlas', showJourney: 'Show journey on atlas',
  inspectNamed: (name: string) => 'Inspect ' + name,
} as const;




const studioCopyKo = {
  minimap: '그래프 미니맵', minimapKeys: '방향키로 이동하고 Home 키로 그래프 전체를 봅니다.', fitSelection: '선택 항목 맞춤',
  applyLayout: '배치 적용', layoutPreview: '자동 배치 미리보기', showInspector: '상세 편집 열기', hideInspector: '상세 편집 접기',
  evidence: '결말 경로 근거', examplePath: '시나리오 검사에서 확인한 예시 경로', incomplete: '진행 경로 탐색이 완료되지 않았습니다.',
  noPath: '이 결말에서 확인할 수 있는 예시 경로가 없습니다.', pathScope: '방문 이력과 게임 상태를 검사합니다. 실제 이동 가능성과 이야기의 설득력은 별도로 검토합니다.',
  participants: '등장과 참고 연결', referenceHint: '참고 연결은 작가가 관련 장면을 함께 보는 데 사용합니다. 플레이어는 이 선을 따라 이동하지 않습니다.',
  visitHint: '플레이어가 선택한 장면을 모두 방문한 뒤에 진입할 수 있습니다.', addReference: '관련 장면 연결', reviewVisits: '진입 조건 검토',
  prologueVisits: (title, names) => '「' + title + '」에서 시작할 때 방문 기록은 비어 있습니다. 진입하려면 ' + names + ' 방문이 필요합니다.',
  connectionsLegend: '연결선 범례', travelLine: '필수 이동', filters: '장과 퀘스트',
  checkSaved: '저장된 진행 경로 검사', saveBeforeCheck: '바꾼 진입 조건을 검사하려면 먼저 편집 내용을 저장하세요.',
  fieldPath: '필드 경로', referenceId: '참조 ID', expectedType: '필요한 유형', actualType: '실제 유형',
  witnessPath: '플레이 경로',
  navigation: '시나리오 탐색', filterChapter: '장 필터', filterNodes: '노드 유형 필터', filterQuests: '퀘스트 필터',
  all: '전체', empty: '조건에 맞는 노드가 없습니다.', affected: '영향받는 기록', nodes: '노드', edits: '장 편집',
  graph: '그래프', outline: '개요', graphName: '시나리오 그래프', outlineName: '시나리오 개요',
  inspector: '상세 편집', fit: '그래프 맞춤', zoomIn: '확대', zoomOut: '축소',
  autoLayout: '자동 배치', chapter: '장', chapters: '장 목록', unassigned: '미지정',
  addChapter: '장 추가', addNode: '노드 추가', addQuest: '퀘스트 추가', addEdge: '노드 연결',
  deleteChapter: '장 삭제', deleteNode: '노드 삭제', deleteEdge: '연결 삭제',
  confirmDeletion: '삭제 확인', cancel: '취소', remove: '제거',
  deleteChapterDetail: '이 장의 노드는 미지정 상태로 이동합니다.',
  deleteNodeDetail: '노드와 관련 퀘스트 또는 결말, 연결 및 참조를 삭제합니다.',
  deleteEdgeDetail: '두 노드 사이의 연결을 삭제합니다.',
  nodeType: '노드 유형', title: '제목', description: '설명', purpose: '목적', summary: '요약',
  objective: '목표', outcome: '결과', characters: '인물', factions: '세력', place: '장소',
  mandatory: '필수', visited: '이전에 방문한 노드', conditions: '진입 조건', effects: '결과 효과',
  quest: '퀘스트', questType: '퀘스트 유형', questTitle: '퀘스트 제목', questDescription: '퀘스트 설명',
  questObjective: '퀘스트 목표', questOutcome: '퀘스트 결과', prerequisites: '선행 퀘스트',
  questComplete: '완료 조건', questFail: '실패 조건', reward: '보상',
  questLocations: '퀘스트 장소', questCharacters: '퀘스트 인물', questFactions: '퀘스트 세력',
  ending: '결말의 여파', edgeLabel: '선택지 이름', from: '출발 노드', to: '도착 노드',
  edgeType: '연결 유형', travel: '이동', travelRequired: '이동 필요', sceneCut: '장면 전환',
  fromNode: '출발 노드 보기', toNode: '도착 노드 보기', saveEdge: '연결 저장', saveNode: '노드 저장',
  saveChapter: '장 저장', moveUp: '장 앞으로 이동', moveDown: '장 뒤로 이동',
  revise: '선택한 노드 수정', reviseQuest: '선택한 퀘스트 수정', reviseChapter: '선택한 장 수정',
  linked: '연결', none: '없음', findings: '시나리오 검증 결과', node: '노드',
  inspect: '보기', termKind: '유형', termKey: '키', termValue: '값', addTerm: '조건 추가',
  noSelection: '노드, 연결 또는 장을 선택해 세부 내용을 확인하세요.',
  cycle: '이 연결은 순환을 만듭니다. 다른 출발 또는 도착 노드를 선택하세요.',
  selfEdge: '서로 다른 노드 두 개를 연결해야 합니다.', search: '그래프 항목 찾기',
  back: '이전 선택으로 돌아가기', addEffect: '효과 추가',
  replaceKind: '유형을 바꾸면 관련 퀘스트 또는 결말 기록과 그 참조가 삭제됩니다.', confirmChange: '유형 변경 확인',
  showLocation: '지도에서 장소 보기', showJourney: '지도에서 이동 경로 보기',
  inspectNamed: (name) => name + ' 보기',
} satisfies Translation<typeof studioCopy>;

export const nodeKinds = ['prologue', 'chapter', 'event', 'quest', 'choice', 'ending', 'dialogue', 'encounter', 'condition', 'transition'] as const;
export const edgeKinds = ['progression', 'optional', 'reference'] as const;
export const questKinds = ['main', 'side'] as const;
export const stateKinds = ['quest', 'item', 'decision', 'relationship', 'flag', 'character', 'location'] as const;

const kindLabels = {
  prologue: '프롤로그', chapter: '장', event: '사건', quest: '퀘스트', choice: '선택', ending: '결말',
  dialogue: '대화', encounter: '조우', condition: '조건', transition: '전환',
  progression: '진행', optional: '선택 진행', reference: '참조',
  main: '주요', side: '보조', 'main quest': '주요 퀘스트', 'side quest': '보조 퀘스트',
  item: '아이템', decision: '결정', relationship: '관계', flag: '플래그',
  character: '인물', faction: '세력', location: '장소', node: '노드', edge: '연결',
  'quest node': '퀘스트 노드', 'ending node': '결말 노드', visited: '방문 기록',
  city: '도시', village: '마을', dungeon: '던전', landmark: '명소', port: '항구',
  town: '소도시', capital: '수도', ruin: '유적', fortress: '요새', forest: '숲',
  underground: '지하', reservoir: '저수지', near: '인접', beneath: '아래', separates: '사이 가름', travel: '이동',
  mandatory: '필수', excluded: '제외',
} satisfies Record<
  ScenarioNode['kind'] | typeof edgeKinds[number] | typeof questKinds[number] | StateTerm['kind']
  | Location['kind'] | Scenario['geography'][number]['relation'] | Project['userContent'][number]['treatment']
  | 'main quest' | 'side quest' | 'node' | 'edge' | 'faction' | 'quest node' | 'ending node' | 'visited',
  string
>;

export function useStudioCopy() {
  return useLocalized(studioCopy, studioCopyKo);
}

export function useScenarioKind() {
  const locale = useLocale();
  return (key: string) => locale === 'ko' && Object.hasOwn(kindLabels, key)
    ? kindLabels[key as keyof typeof kindLabels] : key;
}

const fieldsKo: Record<string, string> = {
  id: 'ID', title: '제목', name: '이름', description: '설명', kind: '유형',
  purpose: '목적', summary: '요약', objective: '목표', outcome: '결과', consequence: '결말의 여파',
  label: '선택지 이름', from: '출발 노드', to: '도착 노드', travel: '이동', mandatory: '필수',
  requiresVisited: '이전에 방문한 노드', conditions: '진입 조건', consequences: '결과 효과',
  completion: '완료 조건', failure: '실패 조건', reward: '보상', role: '역할', aim: '목적',
  chapterId: '장 ID', nodeId: '노드 ID', locationId: '장소 ID', factionId: '세력 ID',
  factionIds: '세력 ID', characterIds: '인물 ID', locationIds: '장소 ID', prerequisiteIds: '선행 퀘스트 ID',
};

export function useScenarioFieldLabel() {
  const locale = useLocale();
  return (field: string, fallback = field) =>
    locale === 'ko' && Object.hasOwn(fieldsKo, field) ? fieldsKo[field]! : fallback;
}
