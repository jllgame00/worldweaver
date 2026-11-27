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
  scenario?: Scenario;
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
  stateEntities?: StateEntity[];
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
 * via the `definition` "Scenario".
 */
export interface Scenario {
  id: Id;
  title: string;
  summary: string;
  sourceNarrativeId: Id;
  approved: boolean;
  settings: ScenarioSettings;
  chapters: Chapter[];
  locations: {
    id: Id;
    name: string;
    kind: "city" | "village" | "dungeon" | "landmark" | "port";
    purpose: string;
  }[];
  geography: {
    from: Id;
    to: Id;
    via?: Id;
    relation: "near" | "beneath" | "separates" | "travel";
    description: string;
  }[];
  factIds: Id[];
  contentIds: Id[];
  layout: {
    nodeId: Id;
    x: number;
    y: number;
  }[];
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "ScenarioSettings".
 */
export interface ScenarioSettings {
  scale: "short" | "standard";
  chapterCount: number;
  branching: "linear" | "branching";
  mainQuests: "light" | "strong";
  sideQuests: "none" | "some";
  endings: "single" | "multiple";
  instructions: string;
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "Chapter".
 */
export interface Chapter {
  id: Id;
  title: string;
  purpose: string;
  summary: string;
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
 * via the `definition` "StateEntity".
 */
export interface StateEntity {
  id: Id;
  kind: "item" | "decision" | "flag";
  name: string;
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "ScenarioNode".
 */
export interface ScenarioNode {
  chapterId?: Id;
  purpose?: string;
  outcome?: string;
  factionIds?: Id[];
  conditions?: StateTerm[];
  consequences?: StateTerm[];
  id: Id;
  kind:
    | "prologue"
    | "chapter"
    | "event"
    | "quest"
    | "choice"
    | "ending"
    | "dialogue"
    | "encounter"
    | "condition"
    | "transition";
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
 * via the `definition` "StateTerm".
 */
export interface StateTerm {
  kind: "quest" | "item" | "decision" | "relationship" | "flag" | "character" | "location";
  key: Id;
  value: string;
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "ScenarioEdge".
 */
export interface ScenarioEdge {
  kind?: "progression" | "optional" | "reference";
  conditions?: StateTerm[];
  consequences?: StateTerm[];
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
  kind?: "main" | "side";
  title?: string;
  description?: string;
  prerequisiteIds?: Id[];
  completion?: StateTerm[];
  failure?: StateTerm[];
  reward?: string;
  characterIds?: Id[];
  factionIds?: Id[];
  locationIds?: Id[];
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
  name?: string;
  sourceNarrativeId?: Id;
  sourceScenarioId?: Id;
  narrativeRevision?: number;
  scenarioRevision?: number;
  approved?: boolean;
  settings?: AtlasSettings;
  constraints?: AtlasConstraint[];
  placements?: AtlasPlacement[];
  territories?: Territory[];
  elevation?: number[][];
  tiles: string[];
  regions: Region[];
  features: TerrainFeature[];
  locations: Location[];
  routes: TravelRoute[];
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "AtlasSettings".
 */
export interface AtlasSettings {
  size: "small" | "standard";
  kmPerCell: number;
  land: number;
  ruggedness: number;
  climate: "temperate" | "arid" | "cold";
  settlements: number;
  roads: number;
  politics: number;
  landform?: "continent" | "islands";
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "AtlasConstraint".
 */
export interface AtlasConstraint {
  from: Id;
  to?: Id;
  via?: Id;
  relation: "near" | "beneath" | "separates" | "travel" | "river" | "inside" | "outside" | "canal" | "aqueduct";
  strength: "hard" | "soft";
  origin: "owner" | "scenario" | "proposal";
  description: string;
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "AtlasPlacement".
 */
export interface AtlasPlacement {
  locationId: Id;
  label?: string;
  kind?:
    | "city"
    | "village"
    | "dungeon"
    | "landmark"
    | "port"
    | "town"
    | "capital"
    | "ruin"
    | "fortress"
    | "forest"
    | "underground"
    | "reservoir";
  preference?: "any-land" | "plain" | "forest" | "mountain" | "desert";
  regionId?: Id;
  position?: Point;
  description?: string;
  level?: number;
  area?: Point[];
  locked?: boolean;
  factionIds?: Id[];
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "Territory".
 */
export interface Territory {
  id: Id;
  name: string;
  regionIds: Id[];
  factionIds: Id[];
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
  description?: string;
  climateException?: {
    biome: string;
    rule: string;
  };
  controllerId?: Id;
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "TerrainFeature".
 */
export interface TerrainFeature {
  id: Id;
  name: string;
  kind: "river" | "ridge" | "grove" | "dunes" | "lake" | "basin";
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
  kind:
    | "city"
    | "village"
    | "dungeon"
    | "landmark"
    | "port"
    | "town"
    | "capital"
    | "ruin"
    | "fortress"
    | "forest"
    | "underground"
    | "reservoir";
  description?: string;
  level?: number;
  area?: Point[];
  locked?: boolean;
  factionIds?: Id[];
  generatedRole?: "settlement" | "harbor";
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
  mode: "road" | "sea" | "trail" | "pass" | "bridge" | "tunnel" | "canal" | "aqueduct";
  distanceKm?: number;
  crossings?: Point[];
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
  fieldPath?: string;
  causeNodeId?: Id;
  spatialCell?: Point;
  blockedTransitions?: BlockedTransition[];
  referenceId?: Id;
  expectedType?: string;
  actualType?: string;
  witnessPath?: Id[];
  status: "open" | "proposed" | "declined" | "resolved" | "superseded";
  checkedRevision: number;
  runId: Id;
}
/**
 * This interface was referenced by `Project`'s JSON-Schema
 * via the `definition` "BlockedTransition".
 */
export interface BlockedTransition {
  edgeId?: Id;
  targetId?: Id;
  fieldPath: string;
  kind: string;
  key: Id;
  actual: string | null;
  required: string;
  producerIds: Id[];
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
