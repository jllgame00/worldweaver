import { useEffect, useState } from 'react';
import type { Project, ValidationFinding } from './project.generated';
import { reportApplies, verificationIdentity } from './verificationHistory';
import type { BibleIndex, BibleLink } from './worldBibleIndex';

export function useVerificationIdentity(project: Project) {
  const [checked, setChecked] = useState<{ project: Project; fingerprint: string }>();
  useEffect(() => {
    if (!project.verificationHistory?.length) return;
    let active = true;
    void verificationIdentity(project)
      .then((fingerprint) => {
        if (active) setChecked({ project, fingerprint });
      })
      .catch(() => {
        if (active) setChecked(undefined);
      });
    return () => {
      active = false;
    };
  }, [project]);
  return checked?.project === project ? checked.fingerprint : undefined;
}

export function bibleFindings(project: Project, id: string, fingerprint?: string) {
  type Row = { finding: ValidationFinding; current?: boolean };
  const rows = new Map<string, Row>();
  function include(f: ValidationFinding, current?: boolean) {
    if (!f.entityIds.includes(id) && f.causeNodeId !== id && f.referenceId !== id) return;
    const prior = rows.get(f.id);
    if (!prior || (current && !prior.current)) rows.set(f.id, { finding: f, current });
  }
  for (const entry of [...(project.verificationHistory ?? [])].reverse()) {
    for (const f of entry.findings) include(f, fingerprint ? reportApplies(entry, fingerprint) : undefined);
  }
  for (const f of [...project.findings].reverse()) include(f);
  return [...rows.values()];
}

export type GraphLink = BibleLink & { suggested?: true };
export function suggestedLinks(findings: ReturnType<typeof bibleFindings>, index: BibleIndex): GraphLink[] {
  const links = new Map<string, GraphLink>();
  for (const { finding, current } of findings) {
    const edge = finding.suggestedRelationship;
    if (!current || !edge || finding.origin !== 'editorial' || !['open', 'proposed'].includes(finding.status))
      continue;
    if (
      edge.fromId === edge.toId ||
      ![edge.fromId, edge.toId].every((id) => index.entities.has(id) && finding.entityIds.includes(id))
    )
      continue;
    const link = {
      from: edge.fromId,
      to: edge.toId,
      kind: edge.label,
      stored: false,
      suggested: true as const,
    };
    links.set(JSON.stringify(link), link);
  }
  return [...links.values()];
}
