import type { Point } from './project.generated';
export type { AtlasSettings, AtlasConstraint } from './project.generated';
export interface AtlasIssue {
  code: string;
  severity: 'error' | 'warning' | 'info';
  ids: string[];
  message: string;
  repair: string;
  cell?: Point;
}
