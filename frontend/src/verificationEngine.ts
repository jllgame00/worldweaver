import { verificationMessages as v } from './verificationCopy';
import { newId, sourceDirection } from './project';
import { version } from './atlasWorkflow';
import type {
  AgentRun,
  Project,
  ValidationFinding,
  VerificationToolReceipt as SavedReceipt,
} from './project.generated';
import { structurallyValidProject } from './validation';
import { verificationIdentity } from './verificationHistory';
import { atlas, coverage, issue, progression, references, sources, targetScope } from './verificationTools';
import type { Issue, ToolOutput, Witness } from './verificationTools';

export type VerificationMode = 'quick' | 'targeted' | 'full';
export type VerificationTool = 'schema' | 'references' | 'sources' | 'progression' | 'atlas' | 'coverage';
export type VerificationToolReceipt = Omit<SavedReceipt, 'tool'> & { tool: VerificationTool };
export interface VerificationReport {
  mode: VerificationMode;
  targetId?: string;
  run: AgentRun;
  findings: ValidationFinding[];
  tools: VerificationToolReceipt[];
  paths: Witness[];
  statesExplored: number;
}
interface Options {
  mode: VerificationMode;
  targetId?: string;
  signal?: AbortSignal;
  isCurrent?: () => boolean;
  onStart?: (tool: VerificationTool) => void;
  onTool?: (receipt: VerificationToolReceipt) => void;
}

const core: VerificationTool[] = ['schema', 'references', 'sources', 'progression', 'atlas'];
function exceedsBudget(p: Project) {
  return (
    p.nodes.length > 1024 ||
    p.edges.length > 4096 ||
    new TextEncoder().encode(JSON.stringify({ ...p, verificationHistory: undefined })).length > 1024 * 1024
  );
}
function plan(mode: VerificationMode, scope?: ReturnType<typeof targetScope>): VerificationTool[] {
  if (mode === 'quick') return [...core];
  if (mode === 'full' || !scope) return [...core, 'coverage'];
  return [
    ...core.filter(
      (t) => (t !== 'progression' || scope.scenario || scope.atlas) && (t !== 'atlas' || scope.atlas),
    ),
    'coverage',
  ];
}

export function verificationPlan(
  mode: VerificationMode,
  targetId?: string,
  project?: Project,
): VerificationTool[] {
  return plan(
    mode,
    mode === 'targeted' && targetId && project && structurallyValidProject(project) && !exceedsBudget(project)
      ? targetScope(project, targetId)
      : undefined,
  );
}

async function findingId(f: Issue) {
  const stablePath = f.fieldPath?.replace(/^\/(nodes|edges|quests|endings|characters)\/\d+\//, '/$1/*/');
  const key = JSON.stringify([
    f.rule,
    [...f.entityIds].sort(),
    stablePath,
    f.spatialCell,
    f.blockedTransitions?.map((b) => [b.edgeId, b.key, b.required]),
    f.witnessPath,
  ]);
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)));
  return 'finding-' + Array.from(bytes.slice(0, 16), (x) => x.toString(16).padStart(2, '0')).join('');
}

export async function runVerification(project: Project, options: Options): Promise<VerificationReport> {
  const p = structuredClone(project),
    start = performance.now(),
    { mode, targetId, signal } = options;
  const run: AgentRun = {
    id: newId('verify'),
    stage: 'verify',
    mode: 'deterministic',
    baseRevision: p.revision,
    repairAttempts: 0,
    calls: 0,
    status: 'running',
    receipts: [],
  };
  const report: VerificationReport = {
    run,
    mode,
    ...(targetId && { targetId }),
    findings: [],
    tools: [],
    paths: [],
    statesExplored: 0,
  };
  const schemaValid = structurallyValidProject(p);
  const overBudget = schemaValid && exceedsBudget(p);
  const scope =
    mode === 'targeted' && targetId && schemaValid && !overBudget ? targetScope(p, targetId) : undefined;
  const invalidTarget = mode === 'targeted' && !scope;
  const planned = plan(mode, scope);
  let traversal: ToolOutput | undefined;
  let unavailable = false;
  const interrupted = (): 'cancelled' | 'stale' | undefined =>
    signal?.aborted ? 'cancelled' : options.isCurrent && !options.isCurrent() ? 'stale' : undefined;
  function skipReason(tool: VerificationTool) {
    const stopped = interrupted();
    if (stopped) return v.skippedAfter + stopped + '.';
    if (tool === 'schema') return;
    if (!schemaValid || overBudget || invalidTarget) return v.invalidScope;
    if (tool === 'coverage' && !sourceDirection(p)) return v.noCoverage;
    if (tool === 'progression' && !p.nodes.length) return v.noScenario;
    if (tool === 'atlas' && !p.world) return v.noAtlas;
    if (tool === 'atlas' && p.world && !p.world.approved && p.world.generatorVersion !== version)
      return v.legacyAtlas;
  }
  for (const tool of planned) {
    if (options.onStart) await new Promise((resolve) => setTimeout(resolve, 0));
    const t0 = performance.now();
    let status: VerificationToolReceipt['status'] = 'passed';
    let output: ToolOutput;
    const stopped = interrupted();
    try {
      const reason = skipReason(tool);
      if (!reason) options.onStart?.(tool);
      if (reason) output = { status: 'skipped', issues: [], detail: reason };
      else if (tool === 'schema') {
        const issues: Issue[] = [];
        if (!schemaValid) issues.push(issue('schema.structure', [], v.invalidSchema, v.restoreSchema));
        if (invalidTarget) issues.push(issue('scope.target', [], v.invalidTarget, v.selectExisting));
        output = {
          issues,
          ...(overBudget && { status: 'incomplete' as const }),
          detail: overBudget ? v.snapshotLimit : v.checkedSchema,
        };
      } else if (tool === 'references') output = references(p);
      else if (tool === 'sources')
        output = sources(p, p.approval ? await verificationIdentity(p) : undefined);
      else if (tool === 'coverage') output = coverage(p);
      else if (tool === 'atlas') output = atlas(p, traversal);
      else output = await progression(p, signal);
      const late = interrupted();
      if (!stopped && late) {
        status = 'cancelled';
        output = { issues: [], detail: v.discardedAfter + late + '.' };
      }
    } catch {
      if (interrupted()) {
        status = 'cancelled';
        output = { issues: [], detail: v.interrupted };
      } else {
        status = 'failed';
        unavailable = true;
        output = { issues: [], detail: v.toolError };
      }
    }
    if (tool === 'progression') {
      traversal = output;
      report.statesExplored = output.statesExplored ?? 0;
      report.paths = (output.paths ?? []).filter(
        (path) => !scope || scope.ids.has(path.endingId) || path.nodeIds.some((id) => scope.ids.has(id)),
      );
    }
    const issues = output.issues.filter(
      (f) =>
        !scope ||
        !f.entityIds.length ||
        f.entityIds.includes(p.id) ||
        f.entityIds.some((id) => scope.ids.has(id)) ||
        (f.causeNodeId && scope.ids.has(f.causeNodeId)) ||
        f.blockedTransitions?.some((b) => scope.ids.has(b.key)),
    );
    if (output.status) status = output.status;
    else if (issues.some((f) => f.severity === 'error')) status = 'failed';
    else if (output.blockedByPrerequisite) status = 'incomplete';
    const findings = await Promise.all(
      issues.map(async (f): Promise<ValidationFinding> => ({
        ...f,
        id: await findingId(f),
        origin: 'deterministic',
        runId: run.id,
        status: 'open',
        checkedRevision: p.revision,
      })),
    );
    const prior = new Set(report.findings.map((f) => f.id));
    for (const f of findings)
      if (!prior.has(f.id)) {
        report.findings.push(f);
        prior.add(f.id);
      }
    const receipt: VerificationToolReceipt = {
      tool,
      status,
      detail: output.detail,
      checkedRevision: p.revision,
      durationMs: Math.round(performance.now() - t0),
      findings: issues.length,
      entityIds: [...new Set([...(targetId ? [targetId] : []), ...issues.flatMap((f) => f.entityIds)])],
    };
    report.tools.push(receipt);
    if (status !== 'skipped')
      run.receipts.push({
        tool,
        outcome: status === 'passed' ? 'passed' : status === 'cancelled' ? 'cancelled' : 'failed',
        detail: receipt.detail,
      });
    options.onTool?.(receipt);
  }
  const clean = report.tools.length === planned.length && report.tools.every((r) => r.status === 'passed');
  run.status =
    interrupted() ??
    (unavailable ? 'failed' : !clean ? 'unresolved' : mode === 'full' ? 'verified' : 'proposed');
  run.durationMs = Math.round(performance.now() - start);
  return report;
}
