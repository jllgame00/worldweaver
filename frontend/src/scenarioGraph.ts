import { studioCopy as c } from './scenarioCopy';
import type { Project, ScenarioEdge } from './project.generated';

export interface Position { nodeId: string; x: number; y: number }
export const cardWidth = 178;
export const cardHeight = 60;

export function arrange(project: Project): Position[] {
  const depths = new Map<string, number>();
  const incoming = new Map(project.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const { from, to, kind } of project.edges) {
    if (kind === 'reference' || !incoming.has(from) || !incoming.has(to)) continue;
    outgoing.set(from, [...outgoing.get(from) ?? [], to]);
    incoming.set(to, incoming.get(to)! + 1);
  }
  const queue = project.nodes.filter(({ id }) => !incoming.get(id)).map(({ id }) => id);
  for (let i = 0; i < queue.length; i++) {
    const from = queue[i]!;
    for (const to of outgoing.get(from) ?? []) {
      depths.set(to, Math.max(depths.get(to) ?? 0, (depths.get(from) ?? 0) + 1));
      incoming.set(to, incoming.get(to)! - 1);
      if (!incoming.get(to)) queue.push(to);
    }
  }
  const rows = new Map<number, number>();
  return project.nodes.map(({ id }) => {
    const column = depths.get(id) ?? 0;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    return { nodeId: id, x: 30 + column * 240, y: 30 + row * 120 };
  });
}

export function connectionError(project: Project, edge: ScenarioEdge): string | undefined {
  if (edge.from === edge.to) return c.selfEdge;
  if (edge.kind === 'reference') return;
  const pending = [edge.to];
  const seen = new Set<string>();
  while (pending.length) {
    const node = pending.pop()!;
    if (node === edge.from) return c.cycle;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const other of project.edges) {
      if (other.id !== edge.id && other.kind !== 'reference' && other.from === node) pending.push(other.to);
    }
  }
}

export function removeQuests(project: Project, ids: Set<string>) {
  if (!ids.size) return;
  project.quests = project.quests.filter((q) => !ids.has(q.id));
  const keep = (t: { kind: string; key: string }) => t.kind !== 'quest' || !ids.has(t.key);
  for (const q of project.quests) {
    if (q.prerequisiteIds) q.prerequisiteIds = q.prerequisiteIds.filter((id) => !ids.has(id));
    if (q.completion) q.completion = q.completion.filter(keep);
    if (q.failure) q.failure = q.failure.filter(keep);
  }
  for (const owner of [...project.nodes, ...project.edges]) {
    if (owner.conditions) owner.conditions = owner.conditions.filter(keep);
    if (owner.consequences) owner.consequences = owner.consequences.filter(keep);
  }
}

function removeNode(project: Project, nodeId: string) {
  removeQuests(project, new Set(project.quests.filter((q) => q.nodeId === nodeId).map((q) => q.id)));
  project.nodes = project.nodes.filter((n) => n.id !== nodeId);
  project.edges = project.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
  project.endings = project.endings.filter((e) => e.nodeId !== nodeId);
  for (const owner of [...project.nodes, ...project.edges]) {
    owner.requiresVisited = owner.requiresVisited.filter((id) => id !== nodeId);
  }
  if (project.scenario) project.scenario.layout = project.scenario.layout.filter((pos) => pos.nodeId !== nodeId);
}

export function deleteEntity(p: Project, id: string) {
  if (p.nodes.some((n) => n.id === id)) removeNode(p, id);
  else if (p.edges.some((e) => e.id === id)) p.edges = p.edges.filter((e) => e.id !== id);
  else if (p.scenario) {
    p.scenario.chapters = p.scenario.chapters.filter((chapter) => chapter.id !== id);
    for (const node of p.nodes) if (node.chapterId === id) delete node.chapterId;
  }
}

export function deletionImpact(project: Project, id: string): { id: string; name: string }[] {
  const next = structuredClone(project);
  deleteEntity(next, id);
  function records(p: Project) {
    return [...p.nodes, ...p.edges, ...p.quests, ...p.endings, ...p.scenario?.chapters ?? []];
  }
  const after = new Map(records(next).map((r) => [r.id, JSON.stringify(r)]));
  return records(project).filter((r) => JSON.stringify(r) !== after.get(r.id)).map((r) => ({
    id: r.id, name: 'label' in r ? r.label : 'consequence' in r ? r.consequence :
      'nodeId' in r ? r.title ?? r.objective : r.title,
  }));
}
