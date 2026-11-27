import { useDiagnostic, useLocalized, type Translation } from './locale';
import { relinkCopy } from './referenceRepair';

const copy = {
  relink: relinkCopy,
  file: {
    title: 'Rejected scenario file',
    help: 'Save a local copy of the original rejected graph and its findings. The file includes creative content. Reopen it with the same project revision to continue reviewing it.',
    export: 'Export original rejected graph',
    open: 'Open rejected scenario file',
    exportFailed: 'Could not export the rejected proposal.',
    openFailed: 'Could not open the rejected proposal.',
    large: 'Diagnostic file is too large.',
    invalid: 'Invalid rejected proposal file.',
    invalidProposal: 'Invalid rejected proposal.',
    missingFinding: 'A rejected proposal must include a blocking finding.',
    wrongProject: 'Select a rejected scenario file from this project.',
  },
  editor: {
    original: 'Original rejection findings',
    findings: 'Proposal findings',
    title: 'Rejected proposal editor',
    help: 'Save changes in this working copy, then revalidate to review them for acceptance.',
    invalid: 'This edit contains an invalid field or reference.',
    edited: 'Working copy edited. Revalidate to update its findings.',
    revalidate: 'Revalidate edited proposal',
    restore: 'Restore original rejected proposal',
  },
  changes: {
    title: 'Edits to the rejected graph',
    removed: 'Removed',
    added: 'Added',
    none: 'None',
  },
  entities: {
    title: 'Proposal entities',
    character: 'Character',
    faction: 'Faction',
    location: 'Location',
    new: 'New',
    existing: 'Existing',
    updated: 'Updated',
    requires: 'Requires',
    sets: 'Sets',
    completion: 'Completion',
    failure: 'Failure',
    usedBy: 'Used by',
    removed: 'Removed from this design',
  },
};

const copyKo = {
  relink: {
    title: '거절된 제안의 참조 다시 연결',
    validate: '생성 없이 수정 사항 확인',
    choose: '대체할 기록 선택',
    invalid: '이 초안에서는 해당 참조를 다시 연결할 수 없습니다.',
    stale: '프로젝트가 변경되었습니다. 이 수정안은 이전 리비전에 해당합니다.',
    failed: '수정한 초안에 아직 검증 오류가 있습니다.',
    request: '로컬 검증에 실패했습니다.',
  },
  file: {
    title: '거절된 시나리오 파일',
    help: '거절된 원본 그래프와 검증 결과를 로컬 사본으로 저장할 수 있습니다. 파일에는 창작 내용이 포함됩니다. 같은 프로젝트 리비전에서 열어 검토를 계속하세요.',
    export: '거절된 원본 그래프 내보내기',
    open: '거절된 시나리오 파일 열기',
    exportFailed: '거절된 제안을 내보낼 수 없습니다.',
    openFailed: '거절된 제안을 열 수 없습니다.',
    large: '진단 파일이 크기 한도를 초과합니다.',
    invalid: '거절된 제안 파일의 형식이 올바르지 않습니다.',
    invalidProposal: '거절된 제안의 형식이 올바르지 않습니다.',
    missingFinding: '거절된 제안에는 진행을 막는 검증 결과가 있어야 합니다.',
    wrongProject: '이 프로젝트의 거절된 시나리오 파일을 선택하세요.',
  },
  editor: {
    original: '원래 제안의 거절 사유',
    findings: '제안 검증 결과',
    title: '거절된 제안 편집기',
    help: '이 작업 사본에 변경 사항을 저장한 뒤 다시 검증하고 반영 여부를 검토하세요.',
    invalid: '이 변경 사항에 유효하지 않은 필드나 참조가 있습니다.',
    edited: '작업 사본을 편집했습니다. 다시 검증하여 결과를 갱신하세요.',
    revalidate: '편집한 제안 다시 검증',
    restore: '거절된 원본 제안 복원',
  },
  changes: {
    title: '거절된 그래프의 변경 사항',
    removed: '제거됨',
    added: '추가됨',
    none: '없음',
  },
  entities: {
    title: '제안된 항목',
    character: '인물',
    faction: '세력',
    location: '장소',
    new: '신규',
    existing: '기존',
    updated: '수정됨',
    requires: '요구 조건',
    sets: '설정 효과',
    completion: '완료 조건',
    failure: '실패 조건',
    usedBy: '사용하는 항목',
    removed: '이 설계에서 제거된 항목',
  },
} satisfies Translation<typeof copy>;

export const scenarioRecoveryCopy = copy;

export function useScenarioRecoveryCopy() {
  return useLocalized(copy, copyKo);
}

export function useRecoveryDiagnostic() {
  const c = useScenarioRecoveryCopy();
  const diagnostic = useDiagnostic();
  return (detail: string) => {
    for (const group of ['relink', 'file', 'editor'] as const) {
      const key = Object.entries(copy[group]).find(([, message]) => message === detail)?.[0];
      if (key) return { message: (c[group] as Record<string, string>)[key]! };
    }
    return { message: diagnostic(detail), raw: detail };
  };
}
