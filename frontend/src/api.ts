import { copy } from './copy';
import { designSnapshot } from './project';
import type { AgentRun, Project } from './project.generated';
import { generationFailure, isCandidateResult, isGenerationStatus } from './validation';
import type { CandidateResult, GenerationStatus } from './validation';

export function generationIntent(configuration: GenerationStatus) {
  return configuration.provider === 'chatkhu'
    ? `chatkhu:${configuration.api}:${configuration.model}`
    : `${configuration.mode}:${configuration.model}`;
}

export class GenerationError extends Error {
  constructor(message: string, readonly run?: AgentRun, readonly configurationChanged = false, readonly code?: string) {
    super(message);
  }
}

export async function fetchGenerationStatus(signal: AbortSignal): Promise<GenerationStatus> {
  const response = await fetch('/api/generation', { signal, cache: 'no-store' });
  const body: unknown = await response.json();
  if (!response.ok || !isGenerationStatus(body)) throw new GenerationError(copy.providerStatusFailed);
  return body;
}

export async function generateDirections(project: Project, configuration: GenerationStatus, signal: AbortSignal): Promise<CandidateResult> {
  const fingerprint = generationIntent(configuration);
  let response: Response;
  try {
    response = await fetch('/api/candidates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Worldweaver-Generation': fingerprint },
      body: JSON.stringify(designSnapshot(project)), signal,
    });
  } catch {
    throw new GenerationError(copy.requestFailed, undefined, false, 'request_failed');
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const failure = generationFailure(body, project);
    const configurationChanged = response.status === 409 && failure?.code === 'generation_configuration_changed';
    const run = !configurationChanged && failure?.run?.mode === configuration.mode ? failure.run : undefined;
    throw new GenerationError(failure?.message ?? copy.requestFailed, run, configurationChanged, failure?.code ?? 'request_failed');
  }
  if (!isCandidateResult(body, project) || body.run.mode !== configuration.mode)
    throw new GenerationError(copy.invalidResponse, undefined, false, 'invalid_provider_response');
  return body;
}
