import type { AgentRun, Coverage, Story, UserContent } from './project.generated';

export const categories = {
  idea: 'Free-form idea', genre: 'Genre', theme: 'Theme / atmosphere', character: 'Character', faction: 'Faction',
  creature: 'Creature', item: 'Item / artifact', location: 'Location', history: 'Historical event',
  mechanic: 'Mechanic', ending: 'Desired ending', constraint: 'Narrative constraint',
} satisfies Record<UserContent['category'], string>;

export const treatments = {
  mandatory: 'Mandatory', optional: 'Optional', excluded: 'Excluded',
} satisfies Record<UserContent['treatment'], string>;

export const dispositions = {
  incorporated: 'Incorporated', unused: 'Unused', conflict: 'Conflict', excluded: 'Excluded',
} satisfies Record<Coverage['disposition'], string>;

export const storyLabels = {
  title: 'Narrative title', genre: 'Genre', tone: 'Tone', premise: 'Premise', conflict: 'Central conflict',
  motivation: 'Player motivation', opposition: 'Opposing force', background: 'Background',
  progression: 'Act progression', possibleEndings: 'Possible endings',
} satisfies Record<keyof Story, string>;

const generationModes = {
  deterministic: 'Deterministic', mock: 'Development mock', live: 'Live AI',
} satisfies Record<AgentRun['mode'], string>;

export const copy = {
  brand: 'WORLDWEAVER', workspace: 'Narrative studio', projects: 'Projects',
  newProject: 'New project', projectTitle: 'Project title', createProject: 'Create project', cancel: 'Cancel',
  localProjects: 'My projects', openProject: 'Open', open: (title: string) => `Open ${title}`,
  emptyProjects: 'Start with a place, a character, or a single idea.',
  loadingProjects: 'Opening local storage…', unreadableProjects: 'Some local projects could not be read.',
  content: 'Content', directions: 'Story directions', narrative: 'Narrative', revision: (count: number) => `Revision ${count}`,
  studioNav: 'Project studio', saved: 'Saved locally', saving: 'Saving…', unsaved: 'Unsaved changes', retrySave: 'Retry save',
  storageUnavailable: 'Local storage is unavailable. Open it again to continue.',
  saveFailure: 'The draft could not be saved. Your changes are still open.',
  saveConflict: 'Another tab saved this project. Download this draft or reopen the saved project.',
  downloadDraft: 'Download draft JSON', reopenSaved: 'Reopen saved project',
  contentTitle: 'Project content', contentIntro: 'Give the story a starting point. Mark what it must include and what it should leave out.',
  fragments: 'Fragments', category: 'Category', treatment: 'Treatment', fragment: 'Fragment', addFragment: 'Add fragment',
  emptyFragments: 'Add a fragment to generate story directions.', fragmentPlaceholder: 'A place, a character, a rule, an ending…',
  edit: 'Edit', remove: 'Remove', save: 'Save changes',
  editFragment: 'Edit fragment', removeFragment: 'Remove fragment',
  removeFragmentConfirm: 'Remove this fragment from the project?',
  fragmentInUse: 'This fragment is referenced by a pinned fact or a generated direction.',
  pinnedFacts: 'Pinned facts', factIntro: 'Set truths that stay fixed across directions.', factStatement: 'Fact statement',
  sourceFragment: 'Source fragment', standalone: 'Standalone fact', pinFact: 'Pin fact', editFact: 'Edit fact', removeFact: 'Remove fact',
  removeFactConfirm: 'Remove this pinned fact from the project?', emptyFacts: 'No facts pinned.',
  blank: 'Enter text to continue.', generate: 'Generate directions', mockProvider: 'Development mock provider',
  liveProvider: (model: string) => `Live AI provider · ${model}`,
  chatkhuProvider: (model: string) => `ChatKHU Gateway · ${model}`,
  checkingGeneration: 'Checking generation availability…', retryStatus: 'Check generation again',
  providerUnavailable: 'The configured generation provider is unavailable.',
  providerStatusFailed: 'Generation availability could not be confirmed.',
  generating: 'Generating three story directions…', cancelGeneration: 'Cancel generation',
  generationSaved: 'Three story directions generated and saved.',
  cancelled: 'Generation cancelled.', staleResponse: 'The generated directions were discarded because the project changed.',
  requestFailed: 'Generation could not reach the service. You can retry with the same fragments.',
  invalidResponse: 'Generation returned an invalid result. You can retry with the same fragments.',
  currentDirections: 'Three story directions', directionsIntro: 'Compare the central conflicts and consequences, then open a direction to read it in full.',
  directionSource: (mode?: AgentRun['mode']) => `Direction source · ${mode ? generationModes[mode] : 'Unknown'}`,
  proposalSource: (mode: AgentRun['mode']) => `Proposed batch · ${generationModes[mode]}`,
  noDirections: 'Generate directions from your project content.',
  staleDirections: 'The fragments or facts changed. Generate current directions before choosing a new draft.',
  staleNarrative: 'The fragments or facts changed. Generate and choose a current direction before approving.',
  stale: 'Stale', approved: 'Approved narrative', draft: 'Narrative draft',
  choose: 'Choose direction', inspect: 'Inspect direction', selected: 'Selected direction',
  backToDirections: 'Back to directions', backToNarrative: 'Back to narrative',
  coverage: 'Fragment coverage', coverageIntro: 'Coverage describes how the source direction used each fragment.',
  historicalCoverage: 'Coverage refers to the fragments as they were when this direction was generated.',
  noCoverage: 'No fragment coverage was recorded.',
  replacementTitle: 'Review replacement directions', replacementPrompt: 'Accepting this batch removes the current narrative, its edits, and its source direction.',
  switchTitle: 'Change the source direction?', switchPrompt: 'Choosing this direction replaces the current narrative and its edits.',
  currentDraft: 'Current narrative', proposedDirection: 'Proposed direction', keepDraft: 'Keep current draft',
  replaceDirections: 'Replace directions', replaceNarrative: 'Replace narrative',
  editorIntro: 'Edit the selected story before approving it for the next stage.',
  noNarrative: 'Choose a direction to start the narrative.',
  sourceDirection: 'Source direction', viewSource: 'View source direction', saveEdits: 'Save narrative edits',
  review: 'Editorial review', approve: 'Approve narrative', reviewed: 'I reviewed this narrative against the pinned facts and current fragments.',
  unsavedNarrative: 'Save your narrative edits before approving.', needsReview: 'Read the story against the current fragments and facts before approval.',
  mandatoryConflict: 'The source direction has a mandatory fragment conflict. Resolve it in the content and generate again.',
  addBeat: 'Add progression beat', addEnding: 'Add ending', numberedEntry: (name: string, position: number) => `${name} ${position}`,
  removeEntry: (name: string, position: number) => `Remove ${name.toLowerCase()} ${position}`,
} as const;
