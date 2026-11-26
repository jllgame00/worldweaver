import { createProject, editContent, newId } from './project';
import type { UserContent } from './project.generated';

export const sampleTitle = '잊혀진 달';

const fragments: [UserContent['category'], UserContent['treatment'], string][] = [
  ['idea', 'mandatory', '세계를 구할수록 자신의 정체성을 잃어가는 방랑 기사의 이야기'],
  ['genre', 'mandatory', '다크 판타지 액션 RPG'],
  ['theme', 'mandatory', '기억과 정체성, 희생, 구원, 쇠락한 세계에서의 희망'],
  ['character', 'mandatory', '죽은 사람의 기억을 읽을 수 있는 방랑 기사'],
  ['faction', 'mandatory', '사라진 달의 귀환을 숭배하는 비밀 교단'],
  ['creature', 'optional', '기억을 잃어버린 인간이 변이하여 탄생한 괴물'],
  ['item', 'optional', '죽은 사람의 마지막 기억을 보존하는 검은 수정'],
  ['location', 'mandatory', '몰락한 왕국, 지하도시, 검은 숲'],
  ['history', 'mandatory', '100년 전 달이 사라지면서 대륙의 문명이 쇠퇴하기 시작했다.'],
  ['mechanic', 'mandatory', '마법을 사용할 때마다 자신의 기억을 잃는다.'],
  ['ending', 'optional', '세계의 구원과 주인공의 정체성 보존 사이에서 선택하는 여운이 남는 결말'],
  ['constraint', 'excluded', '시간 여행, 평행세계'],
];

const facts = [
  '달은 정확히 100년 전에 사라졌다.',
  '마법 사용으로 잃어버린 기억은 되돌릴 수 없다.',
  '주인공은 죽은 사람의 기억을 읽을 수 있지만 자신의 잃어버린 기억은 복구할 수 없다.',
];

export function createSampleProject() {
  const project = editContent(createProject(sampleTitle), {
    userContent: fragments.map(([category, treatment, text]) => ({ id: newId('fragment'), category, treatment, text })),
  });
  return editContent(project, {
    canonicalFacts: facts.map((statement) => ({ id: newId('fact'), statement })),
  });
}
