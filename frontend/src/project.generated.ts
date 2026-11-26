// Generated from docs/project-v1.schema.json. Run npm run generate:types after changing the schema.

/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * @minItems 2
 * @maxItems 2
 *
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "Point".
 */
export type Point = [number, number];

export interface Project {
  id: Id;
  schemaVersion: "1.0.0";
  title: string;
  revision: number;
  versions: {
    content: number;
    candidates: number;
    narrative: number;
    scenario: number;
    world: number;
  };
  basis: Basis;
  synthetic?: boolean;
  approval?: {
    runId: Id;
    revision: number;
  };
  userContent: UserContent[];
  canonicalFacts: CanonicalFact[];
  storyCandidates: [] | [StoryCandidate, StoryCandidate, StoryCandidate];
  narrative?: Narrative;
  characters: Character[];
  factions: Faction[];
  nodes: ScenarioNode[];
  edges: ScenarioEdge[];
  quests: Quest[];
  endings: Ending[];
  world?: World;
  findings: ValidationFinding[];
  runs: AgentRun[];
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "Basis".
 */
export interface Basis {
  candidates?: {
    content: number;
  };
  narrative?: {
    candidates: number;
    content: number;
  };
  scenario?: {
    narrative: number;
    content: number;
  };
  world?: {
    scenario: number;
    narrative: number;
    content: number;
  };
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "UserContent".
 */
export interface UserContent {
  id: Id;
  category:
    | "genre"
    | "theme"
    | "character"
    | "faction"
    | "creature"
    | "item"
    | "location"
    | "history"
    | "mechanic"
    | "ending"
    | "constraint"
    | "idea";
  treatment: "mandatory" | "optional" | "excluded";
  text: string;
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "CanonicalFact".
 */
export interface CanonicalFact {
  id: Id;
  statement: string;
  sourceContentId?: Id;
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "StoryCandidate".
 */
export interface StoryCandidate {
  id: Id;
  story: Story;
  coverage: Coverage[];
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "Story".
 */
export interface Story {
  title: string;
  genre: string;
  tone: string;
  premise: string;
  conflict: string;
  motivation: string;
  opposition: string;
  background: string;
  /**
   * @minItems 1
   */
  progression: [string, ...string[]];
  /**
   * @minItems 1
   */
  possibleEndings: [string, ...string[]];
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "Coverage".
 */
export interface Coverage {
  contentId: Id;
  disposition: "incorporated" | "unused" | "conflict" | "excluded";
  reason: string;
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "Narrative".
 */
export interface Narrative {
  id: Id;
  sourceCandidateId: Id;
  story: Story;
  approved: boolean;
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "Character".
 */
export interface Character {
  id: Id;
  name: string;
  role: string;
  factionId?: Id;
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "Faction".
 */
export interface Faction {
  id: Id;
  name: string;
  aim: string;
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "ScenarioNode".
 */
export interface ScenarioNode {
  id: Id;
  kind: "prologue" | "chapter" | "event" | "quest" | "choice" | "ending";
  title: string;
  description: string;
  mandatory: boolean;
  objective?: string;
  characterIds: Id[];
  locationId?: Id;
  requiresVisited: Id[];
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "ScenarioEdge".
 */
export interface ScenarioEdge {
  id: Id;
  from: Id;
  to: Id;
  label: string;
  requiresVisited: Id[];
  travel: "required" | "none";
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "Quest".
 */
export interface Quest {
  id: Id;
  nodeId: Id;
  objective: string;
  outcome: string;
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "Ending".
 */
export interface Ending {
  id: Id;
  nodeId: Id;
  consequence: string;
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "World".
 */
export interface World {
  id: Id;
  seed: number;
  generatorVersion: string;
  tiles: string[];
  regions: Region[];
  features: TerrainFeature[];
  locations: Location[];
  routes: TravelRoute[];
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "Region".
 */
export interface Region {
  id: Id;
  name: string;
  /**
   * @minItems 1
   */
  cells: [Point, ...Point[]];
  controllerId?: Id;
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "TerrainFeature".
 */
export interface TerrainFeature {
  id: Id;
  name: string;
  kind: "river" | "ridge" | "grove" | "dunes";
  /**
   * @minItems 1
   */
  cells: [Point, ...Point[]];
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "Location".
 */
export interface Location {
  id: Id;
  name: string;
  kind: "city" | "village" | "dungeon" | "landmark" | "port";
  preference: "any-land" | "plain" | "forest" | "mountain" | "desert";
  position?: Point;
  regionId?: Id;
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "TravelRoute".
 */
export interface TravelRoute {
  id: Id;
  from: Id;
  to: Id;
  mode: "road" | "sea";
  /**
   * @minItems 2
   */
  path: [Point, Point, ...Point[]];
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "ValidationFinding".
 */
export interface ValidationFinding {
  id: Id;
  rule: string;
  origin: "deterministic" | "editorial";
  severity: "error" | "warning" | "info";
  entityIds: Id[];
  explanation: string;
  suggestedRepair: string;
  status: "open" | "proposed" | "declined" | "resolved" | "superseded";
  checkedRevision: number;
  runId: Id;
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "AgentRun".
 */
export interface AgentRun {
  id: Id;
  stage: "candidates" | "scenario" | "world" | "verify";
  baseRevision: number;
  mode: "deterministic" | "mock" | "live";
  status: "running" | "proposed" | "verified" | "unresolved" | "failed" | "cancelled" | "stale";
  repairAttempts: number;
  receipts: Receipt[];
  calls: number;
  tokens?: number;
  durationMs?: number;
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "Receipt".
 */
export interface Receipt {
  tool: string;
  outcome: "passed" | "failed" | "advice" | "cancelled";
  detail: string;
}
