import { copy } from './copy';
import type { AgentRun, Project } from './project.generated';
import { generationFailure, isCandidateResult } from './validation';
import type { CandidateResult } from './validation';

export class GenerationError extends Error {
  constructor(message: string, readonly run?: AgentRun) {
    super(message);
  }
}

export async function generateDirections(project: Project, signal: AbortSignal): Promise<CandidateResult> {
  let response: Response;
  try {
    response = await fetch('/api/candidates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project), signal,
    });
  } catch {
    throw new GenerationError(copy.requestFailed);
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const failure = generationFailure(body, project);
    throw new GenerationError(failure?.message ?? copy.requestFailed, failure?.run);
  }
  if (!isCandidateResult(body, project)) throw new GenerationError(copy.invalidResponse);
  return body;
}
