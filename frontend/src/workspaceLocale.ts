import { categories as enCategories, copy as enCopy, dispositions as enDispositions,
  storyLabels as enStoryLabels, treatments as enTreatments } from './copy';
import { useLocalized } from './locale';
import type { Translation } from './locale';
import type { AgentRun } from './project.generated';
import { scenarioCopy } from './studioWorkflowCopy';

const categories = {
  idea: '자유 아이디어', genre: '장르', theme: '주제와 분위기', character: '인물', faction: '세력',
  creature: '생물', item: '아이템과 유물', location: '장소', history: '역사적 사건',
  mechanic: '게임 규칙', ending: '희망 결말', constraint: '서사 제약',
} satisfies Translation<typeof enCategories>;
const treatments = { mandatory: '필수', optional: '선택', excluded: '제외' } satisfies Translation<typeof enTreatments>;
const dispositions = { incorporated: '반영', unused: '미사용', conflict: '충돌', excluded: '제외' } satisfies Translation<typeof enDispositions>;
const storyLabels = {
  title: '스토리 제목', genre: '장르', tone: '분위기', premise: '기본 설정', conflict: '핵심 갈등',
  motivation: '플레이어 동기', opposition: '대립 세력', background: '배경',
  progression: '막별 전개', possibleEndings: '가능한 결말',
} satisfies Translation<typeof enStoryLabels>;

const generationModes = { deterministic: '규칙 기반', mock: '개발용 모의 공급자', live: '실제 AI' };
const copy = {
  brand: 'WORLDWEAVER', workspace: '이야기 작업 공간', projects: '프로젝트',
  newProject: '새 프로젝트', projectTitle: '프로젝트 제목', createProject: '프로젝트 만들기', cancel: '취소',
  localProjects: '내 프로젝트', openProject: '열기', open: (title: string) => `${title} 열기`,
  emptyProjects: '장소, 인물 또는 하나의 아이디어에서 시작하세요.',
  loadingProjects: '브라우저에 저장된 프로젝트를 여는 중…', unreadableProjects: '일부 로컬 프로젝트를 읽을 수 없습니다.',
  content: '소재', directions: '스토리 후보', narrative: '스토리 설계', revision: (count: number) => `리비전 ${count.toLocaleString('ko')}`,
  studioNav: '프로젝트 스튜디오', saved: '저장 완료', saving: '저장 중…', unsaved: '저장되지 않은 변경', retrySave: '저장 다시 시도',
  storageUnavailable: '브라우저 저장소를 사용할 수 없습니다. 다시 열어 계속하세요.',
  saveFailure: '초안을 저장하지 못했습니다. 변경 사항은 현재 화면에 남아 있습니다.',
  saveConflict: '다른 탭에서 이 프로젝트를 저장했습니다. 초안을 내려받거나 최신 프로젝트를 다시 여세요.',
  downloadDraft: '초안 JSON 내려받기', reopenSaved: '저장된 프로젝트 다시 열기',
  contentTitle: '이야기 소재', contentIntro: '이야기의 출발점을 적고 꼭 반영할 소재와 제외할 소재를 표시하세요.',
  fragments: '소재 목록', category: '분류', treatment: '반영 방식', fragment: '소재 내용', addFragment: '소재 추가',
  emptyFragments: '스토리 후보를 생성하려면 소재를 추가하세요.', fragmentPlaceholder: '장소, 인물, 규칙, 결말 등',
  edit: '편집', remove: '삭제', save: '변경 사항 저장',
  editFragment: '소재 편집', removeFragment: '소재 삭제',
  removeFragmentConfirm: '프로젝트에서 이 소재를 삭제하시겠습니까?',
  fragmentInUse: '고정 설정 또는 생성된 스토리 후보에서 이 소재를 사용합니다.',
  pinnedFacts: '고정 설정', factIntro: '어떤 스토리 후보에서도 유지해야 할 설정을 정하세요.', factStatement: '설정 내용',
  sourceFragment: '출처 소재', standalone: '출처 소재 없음', pinFact: '설정 고정', editFact: '고정 설정 편집', removeFact: '고정 설정 삭제',
  removeFactConfirm: '프로젝트에서 이 고정 설정을 삭제하시겠습니까?', emptyFacts: '고정된 설정이 없습니다.',
  blank: '내용을 입력하세요.', generate: '스토리 후보 생성', mockProvider: '개발용 모의 공급자',
  liveProvider: (model: string) => `실제 AI 공급자 · ${model}`,
  chatkhuProvider: (model: string) => `ChatKHU Gateway · ${model}`,
  checkingGeneration: '생성 기능을 확인하는 중…', retryStatus: '생성 기능 다시 확인',
  providerUnavailable: '설정된 생성 공급자를 사용할 수 없습니다.',
  providerStatusFailed: '생성 기능을 사용할 수 있는지 확인하지 못했습니다.',
  generating: '스토리 후보 세 개를 생성하는 중…', cancelGeneration: '생성 취소',
  generationSaved: '스토리 후보 세 개를 생성해 저장했습니다.',
  cancelled: '생성을 취소했습니다.', staleResponse: '프로젝트가 바뀌어 생성된 후보를 반영하지 않았습니다.',
  requestFailed: '생성 서비스에 연결하지 못했습니다. 같은 소재로 다시 시도할 수 있습니다.',
  invalidResponse: '생성 결과가 유효하지 않습니다. 같은 소재로 다시 시도할 수 있습니다.',
  currentDirections: '스토리 후보 세 개', directionsIntro: '핵심 갈등과 결말의 결과를 비교하고 각 후보의 전체 내용을 살펴보세요.',
  directionSource: (mode?: AgentRun['mode']) => `후보 출처 · ${mode ? generationModes[mode] : '미확인'}`,
  proposalSource: (mode: AgentRun['mode']) => `후보 제안 · ${generationModes[mode]}`,
  noDirections: '프로젝트 소재에서 스토리 후보를 생성하세요.',
  staleDirections: '소재나 설정이 바뀌었습니다. 현재 내용으로 후보를 다시 생성한 뒤 선택하세요.',
  staleNarrative: '소재나 설정이 바뀌었습니다. 현재 내용으로 후보를 생성하고 선택한 뒤 승인하세요.',
  stale: '재검토 필요', approved: '최종 승인된 스토리', draft: '스토리 초안',
  choose: '후보 선택', inspect: '상세 보기', selected: '선택됨',
  backToDirections: '스토리 후보로 돌아가기', backToNarrative: '스토리 설계로 돌아가기',
  coverage: '소재 반영 내역', coverageIntro: '스토리 후보가 각 입력 소재를 어떻게 사용했는지 보여 줍니다.',
  historicalCoverage: '생성 당시의 소재를 기준으로 표시합니다.',
  noCoverage: '기록된 소재 반영 내역이 없습니다.',
  replacementTitle: '교체할 스토리 후보 검토', replacementPrompt: '이 후보 묶음을 채택하면 현재 스토리와 편집 내용 및 기존 원본 후보가 바뀝니다.',
  switchTitle: '원본 후보를 변경하시겠습니까?', switchPrompt: '이 후보를 선택하면 현재 스토리와 편집 내용이 교체됩니다.',
  currentDraft: '현재 초안', proposedDirection: '새 후보', keepDraft: '현재 초안 유지',
  replaceDirections: '후보 교체', replaceNarrative: '스토리 교체',
  editorIntro: '다음 단계로 진행하기 전에 선택한 스토리를 편집하고 승인하세요.',
  noNarrative: '스토리 후보를 선택해 설계를 시작하세요.',
  sourceDirection: '원본 후보', viewSource: '원본 후보 보기', saveEdits: '스토리 편집 내용 저장',
  review: '편집 검토', approve: '스토리 최종 승인', reviewed: '현재 소재와 고정 설정을 기준으로 스토리를 검토했습니다.',
  unsavedNarrative: '승인하기 전에 스토리 편집 내용을 저장하세요.', needsReview: '승인하기 전에 현재 소재와 고정 설정이 반영됐는지 확인하세요.',
  mandatoryConflict: '원본 후보가 필수 소재와 충돌합니다. 소재에서 충돌을 해결한 뒤 다시 생성하세요.',
  addBeat: '전개 항목 추가', addEnding: '결말 추가', numberedEntry: (name: string, position: number) => `${name} ${position}`,
  removeEntry: (name: string, position: number) => `${name} ${position} 삭제`,
} satisfies Translation<typeof enCopy>;

const shell = {
  scenario: 'Scenario Studio', atlas: 'World Atlas', bible: 'World Bible', verification: 'Verification Agent',
  import: scenarioCopy.import, large: scenarioCopy.large, duplicate: scenarioCopy.duplicate,
  importReview: scenarioCopy.importReview, importError: scenarioCopy.importError, generating: scenarioCopy.generating,
  unknownProvider: 'The configured generation provider is unavailable.',
};
const koShell = {
  scenario: '시나리오 설계', atlas: '세계 지도', bible: '세계관 사전', verification: '검증 에이전트',
  import: '프로젝트 JSON 가져오기', large: '가져올 파일은 16 MiB 이하여야 합니다.',
  duplicate: '이미 같은 프로젝트가 있습니다. 새 ID로 별도 사본을 가져오시겠습니까?',
  importReview: '시나리오를 가져왔습니다. 이 사본을 승인하려면 검증하고 검토하세요.',
  importError: '프로젝트를 가져오지 못했습니다. 파일 형식과 참조를 확인하세요.', generating: '제안을 생성하는 중…',
  unknownProvider: '생성 공급자를 사용할 수 없습니다. 기술 세부 정보에서 이유를 확인하세요.',
} satisfies Translation<typeof shell>;

export const useWorkspaceCopy = () => useLocalized(enCopy, copy);
export const useCategories = () => useLocalized(enCategories, categories);
export const useTreatments = () => useLocalized(enTreatments, treatments);
export const useDispositions = () => useLocalized(enDispositions, dispositions);
export const useStoryLabels = () => useLocalized(enStoryLabels, storyLabels);
export const useShellCopy = () => useLocalized(shell, koShell);
