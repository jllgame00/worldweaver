import type { AgentRun, CanonicalFact, Project, Story, StoryCandidate, UserContent } from './project.generated';

export type CandidateBatch = Exclude<Project['storyCandidates'], []>;

export function newId(kind: string): string {
  return `${kind}-${crypto.randomUUID()}`;
}

export function createProject(title: string): Project {
  return {
    id: newId('project'), schemaVersion: '1.0.0', title, revision: 0,
    versions: { content: 0, candidates: 0, narrative: 0, scenario: 0, world: 0 }, basis: {},
    userContent: [], canonicalFacts: [], storyCandidates: [], characters: [], factions: [], nodes: [], edges: [], quests: [], endings: [], findings: [], runs: [],
  };
}

export function candidatesFresh(project: Project): boolean {
  return project.storyCandidates.length === 3 && project.basis.candidates?.content === project.versions.content;
}

export function candidateBatchMode(project: Project): AgentRun['mode'] | undefined {
  return project.runs.slice().reverse().find(({ stage, status }) => stage === 'candidates' && status === 'proposed')?.mode;
}

export function narrativeFresh(project: Project): boolean {
  return !!project.narrative && candidatesFresh(project) && project.basis.narrative?.content === project.versions.content
    && project.basis.narrative.candidates === project.versions.candidates;
}

export function sourceDirection(project: Project): StoryCandidate | undefined {
  return project.storyCandidates.find(({ id }) => id === project.narrative?.sourceCandidateId);
}

export function mandatoryConflict(project: Project): boolean {
  return sourceDirection(project)?.coverage.some(({ contentId, disposition }) =>
    disposition === 'conflict' && project.userContent.some(({ id, treatment }) => id === contentId && treatment === 'mandatory'),
  ) ?? false;
}

export function fragmentInUse(project: Project, id: string): boolean {
  return project.canonicalFacts.some(({ sourceContentId }) => sourceContentId === id)
    || project.storyCandidates.some(({ coverage }) => coverage.some(({ contentId }) => contentId === id));
}

export function advance(project: Project, stages: (keyof Project['versions'])[]): Project {
  const { approval: _approval, ...next } = project;
  const versions = { ...project.versions };
  stages.forEach((stage) => { versions[stage] += 1; });
  return {
    ...next, revision: project.revision + 1, versions,
    findings: project.findings.map((finding) => ({ ...finding, status: 'superseded' })),
  };
}

export function editContent(project: Project, patch: { userContent: UserContent[] } | { canonicalFacts: CanonicalFact[] }): Project {
  return { ...advance(project, ['content']), ...patch };
}

export function acceptBatch(project: Project, candidates: CandidateBatch, run: AgentRun): Project {
  const { narrative, basis: { narrative: _basis, ...basis }, ...next } = advance(project, project.narrative ? ['candidates', 'narrative'] : ['candidates']);
  return {
    ...next, basis: { ...basis, candidates: { content: project.versions.content } }, storyCandidates: candidates,
    runs: [...project.runs, run],
  };
}

export function chooseDirection(project: Project, candidate: StoryCandidate): Project {
  if (project.narrative?.sourceCandidateId === candidate.id) return project;
  return {
    ...advance(project, ['narrative']),
    basis: { ...project.basis, narrative: { content: project.versions.content, candidates: project.versions.candidates } },
    narrative: { id: newId('narrative'), sourceCandidateId: candidate.id, story: structuredClone(candidate.story), approved: false },
  };
}

export function editNarrative(project: Project, story: Story): Project {
  if (!project.narrative) return project;
  return { ...advance(project, ['narrative']), narrative: { ...project.narrative, story, approved: false } };
}

export function approveNarrative(project: Project): Project {
  if (!project.narrative || !narrativeFresh(project) || mandatoryConflict(project)) return project;
  return { ...advance(project, ['narrative']), narrative: { ...project.narrative, approved: true } };
}
