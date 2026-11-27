import { useLocalized } from './locale';
import type { Translation } from './locale';
import type { IntakeMethod, IntakeOutcome } from './intakeModel';

const en = {
  inputMode: 'Content input mode', edit: 'Edit fragments', paste: 'Paste ideas', original: 'Original input',
  storageIssue: 'This tab could not save the intake draft. Copy the original and draft before closing.',
  organize: 'Organize with rules', suggest: 'Suggest with AI', empty: 'Enter original text to start.',
  tooLarge: 'The input exceeds the AI limit. Local organization and manual editing are available.',
  unavailable: 'Organize with rules or edit fragments while AI is unavailable.',
  waiting: 'Waiting for the extraction result…', confirmation: 'Extraction confirmation',
  mock: 'Development mock', live: 'Live AI',
  budget: (tokens: string) => `The original text above will be submitted once. Maximum output: ${tokens} tokens.`,
  pricing: 'Provider pricing is unavailable here.', authorize: 'Authorize one extraction',
  review: 'Review draft fragments',
  impact: 'Selected fragments will be added to the project and source-dependent approvals may require review.',
  noFragments: 'No supported fragments were proposed. Your original is still available.',
  accept: 'Add selected fragments', reject: 'Reject draft',
  selectValid: (limit: string) => `Select at least one classified, nonblank fragment up to ${limit} characters.`,
  history: 'Intake history', dispatches: 'Dispatches', responses: 'Responses', unconfirmed: 'unconfirmed',
  untitled: 'Untitled fragment', include: 'Include fragment', needsReview: 'Needs review',
  reviewIdea: 'Review as free-form idea', evidence: (position: string) => `Source evidence · occurrence ${position}`,
  staleSource: 'The source or project changed. Organize the current text to review a fresh draft.',
  staleDraft: 'The project changed since this draft was created. Organize the original again to review against the current revision.',
  methods: {
    local: 'Local extraction', fallback: 'Deterministic fallback', mock: 'Development mock extraction', live: 'Live AI extraction',
  } satisfies Record<IntakeMethod, string>,
  outcomes: {
    pending: 'awaiting receipt', completed: 'completed', timeout: 'timed out', authentication: 'authentication failed',
    invalid: 'invalid output rejected', failed: 'failed', unconfirmed: 'dispatch and response unconfirmed',
    accepted: 'selected fragments added', rejected: 'draft rejected', stale: 'discarded as stale',
  } satisfies Record<IntakeOutcome, string>,
};

const ko = {
  inputMode: '이야기 소재 입력 방식', edit: '소재 직접 편집', paste: '아이디어 붙여넣기', original: '원문 입력',
  storageIssue: '이 탭에서 초안을 저장하지 못했습니다. 닫기 전에 원문과 초안을 복사하세요.',
  organize: '규칙으로 정리', suggest: 'AI로 제안', empty: '시작하려면 원문을 입력하세요.',
  tooLarge: 'AI 요청의 입력 한도를 초과했습니다. 규칙으로 정리하거나 직접 편집할 수 있습니다.',
  unavailable: 'AI를 사용할 수 없을 때는 규칙으로 정리하거나 소재를 직접 편집하세요.',
  waiting: '추출 결과를 기다리는 중…', confirmation: '추출 요청 확인',
  mock: '개발용 모의 응답', live: '실제 AI',
  budget: (tokens) => `위 원문을 한 번 전송합니다. 최대 출력은 ${tokens}토큰입니다.`,
  pricing: '공급자 요금은 여기에서 확인할 수 없습니다.', authorize: '추출 요청 1회 승인',
  review: '소재 초안 검토',
  impact: '선택한 소재를 프로젝트에 추가합니다. 이 소재의 영향을 받는 승인은 다시 검토해야 할 수 있습니다.',
  noFragments: '추출 가능한 소재가 제안되지 않았습니다. 원문은 그대로 남아 있습니다.',
  accept: '선택한 소재 추가', reject: '초안 거절',
  selectValid: (limit) => `분류가 지정되고 공백이 아닌 ${limit}자 이하의 소재를 하나 이상 선택하세요.`,
  history: '소재 정리 이력', dispatches: '발송', responses: '응답', unconfirmed: '미확인',
  untitled: '이름 없는 소재', include: '소재 포함', needsReview: '검토 필요',
  reviewIdea: '자유 아이디어로 검토', evidence: (position) => `원문 근거 · ${position}번째 인용`,
  staleSource: '원문이나 프로젝트가 바뀌었습니다. 현재 원문을 정리해 새 초안을 검토하세요.',
  staleDraft: '초안을 만든 이후 프로젝트가 바뀌었습니다. 원문을 다시 정리해 현재 리비전을 기준으로 검토하세요.',
  methods: { local: '로컬 정리', fallback: '규칙 기반 대체 정리', mock: '개발용 모의 추출', live: '실제 AI 추출' },
  outcomes: {
    pending: '영수증 대기 중', completed: '완료', timeout: '시간 초과', authentication: '인증 실패',
    invalid: '유효하지 않은 출력 거절', failed: '실패', unconfirmed: '발송 및 응답 미확인',
    accepted: '선택 소재 추가', rejected: '초안 거절', stale: '리비전이 달라 폐기',
  },
} satisfies Translation<typeof en>;

export const useIntakeCopy = () => useLocalized(en, ko);
