import { useFormatter, useLocalized } from './locale';

const englishNumber = new Intl.NumberFormat('en');

export const semanticCopy = {
  region: 'Semantic review',
  title: 'Optional semantic review',
  preview: 'Review semantic evidence',
  selectSource: 'Select a source with reviewable text.',
  unavailable: 'Provider configuration or review budget is unavailable.',
  provider: 'Provider',
  model: 'Model',
  scope: 'Verification scope',
  revision: (revision: number) => 'revision ' + englishNumber.format(revision),
  requests: 'Maximum provider requests',
  tokens: 'Maximum output tokens',
  estimate: 'Estimated cost',
  mockCost: 'No charge (mock provider)',
  pricing: 'Pricing unavailable',
  excerpts: (count: number) => 'View the ' + englishNumber.format(count) + ' source excerpts to be submitted',
  authorize: 'Authorize one live review',
  simulate: 'Run one mock review',
  cancel: 'Cancel semantic review',
  cancelled: 'Review cancelled. Provider dispatch and usage are unknown.',
  cancelReceipt: 'One review request submitted. Provider dispatch and usage unknown.',
  saveFailed: 'The review could not be saved for this revision.',
  returned: (count: number) =>
    englishNumber.format(count) + ' editorial finding' + (count === 1 ? '' : 's') + ' returned for review.',
  failure: 'Semantic review could not complete.',
  invalid: 'The semantic review returned invalid evidence or usage metadata. Its findings were discarded.',
  uncertainty: 'Uncertainty',
} as const;

export function useSemanticCopy() {
  const { number } = useFormatter();
  return useLocalized(semanticCopy, {
    region: '의미 검토',
    title: '의미 검토 (선택 사항)',
    preview: '의미 검토 근거 보기',
    selectSource: '검토할 텍스트가 있는 원본을 선택하세요.',
    unavailable: '공급자 설정 또는 검토 예산을 사용할 수 없습니다.',
    provider: '공급자',
    model: '모델',
    scope: '검증 범위',
    revision: (revision) => '리비전 ' + number(revision),
    requests: '최대 공급자 요청 수',
    tokens: '최대 출력 토큰 수',
    estimate: '예상 비용',
    mockCost: '요금 없음 (모의 공급자)',
    pricing: '요금 정보 없음',
    excerpts: (count) => '제출할 원본 발췌문 ' + number(count) + '개 보기',
    authorize: '실제 검토 요청 1회 승인',
    simulate: '모의 검토 1회 실행',
    cancel: '의미 검토 취소',
    cancelled: '검토를 취소했습니다. 공급자에 요청이 전송되었는지와 사용량은 확인되지 않았습니다.',
    cancelReceipt: '검토 한 건을 요청했습니다. 공급자 전송 여부 및 사용량은 확인되지 않았습니다.',
    saveFailed: '이 리비전에 대한 검토를 저장하지 못했습니다.',
    returned: (count) => '검토할 편집 소견 ' + number(count) + '개를 받았습니다.',
    failure: '의미 검토를 완료하지 못했습니다.',
    invalid: '의미 검토의 근거 또는 사용량 정보가 유효하지 않아 소견을 폐기했습니다.',
    uncertainty: '불확실성',
  });
}
