# Workspace design

The primary task is to follow a player's possible journey and change the design where it breaks. Keep the current project title, save state and studio navigation visible. Give the graph and atlas most of the viewport. The inspector follows the active selection and links to its counterpart.

~~~mermaid
flowchart LR
  D[Dashboard] --> C[Content]
  C --> K[Compare three candidates]
  K --> N[Edit and approve narrative]
  N --> G[Scenario editor]
  G --> W[Seeded atlas]
  G <--> I[Linked view]
  W <--> I
  I --> V[Verification]
  V -->|Review and edit| I
  V --> X[Export]
  D -->|Open local or import JSON| I
~~~

Resume at the last available studio for an incomplete project. A draft backup is available at every stage.

## Screen wireframes

Each sketch shows reading order and the main action. Labels are illustrative. Keep UI copy externalizable pending a localization decision.

~~~text
1  PROJECTS                          [Import JSON] [New project]
   Title                    Last saved          Stage       Open
   Salt Census              Today               Scenario      >

2  NEW PROJECT / CONTENT                         [Save draft]
   Project title  _______________________
   Category [Location v]     Treatment [Mandatory v]
   Fragment [____________________________________] [Add]
   Your fragments                    Pinned facts [Edit]
                                             [Generate directions]

3  STORY DIRECTIONS                       [Back to fragments]
   Field          The Missing Ward   Borrowed Tide   Last Survey
   Decision       ...                ...             ...
   Consequence    ...                ...             ...
   Coverage       [Inspect]          [Inspect]       [Inspect]
                  [Choose]           [Choose]        [Choose]

4  NARRATIVE / selected candidate               Saved locally
   Premise and conflict [Edit]       Source direction [View]
   Act progression      [Edit]       Pinned facts
   Possible endings     [Edit]       Coverage issues
                                          [Approve and build graph]

5  SCENARIO                    [Add node] [Connect] [List view]
   Prologue ── Choice ─┬─ Quest A     | Selected event
                       └─ Quest B     | Objective, place, prerequisites
   [Fit] [−] [+]                     | [Edit] [Show on map]

6  ATLAS                           Seed [42] [Preview regenerate]
   Parchment map                      | Gazetteer [Find a place]
     Mill ●──── road ────● Archive    | Archive · village
         ~~~ river                    | Routes and linked events
   [Fit] [−] [+]                      | [Open event]

7  LINKED WORKSPACE                     [Graph | Both | Atlas]
   Graph                 | Atlas                   | Inspector
   ◆ Measure the gate    | ◎ Gatehouse             | 2 events here
   └─ Publish record     | road to Salt Hall       | [Open event]
   Select by title or keyboard in either pane.     | [Verify]

8  VERIFICATION                 [Run checks]   1 open error
   Filter [Errors] [Advice]       | Required journey has no road
   Travel · Gate to Salt Hall     | Entities [Edge] [Location]
   Advice · Courier's motive      | Before / proposed after
                                 | [Review repair] [Recheck]

9  EXPORT                                       Local save ✓
   Portable project (JSON)         [Download editable project]
   Design document (Markdown)      [Preview] [Download document]
   Revision and outstanding issues appear in the preview.
~~~

## Interactions and recovery

- Use a charcoal workspace, warm parchment atlas, high-contrast body text and muted copper for selection. Pair selection with an outline and label, and severity with an icon and text. Use a readable sans for controls and an editorial serif for narrative headings. Reserve display type for short titles.
- Start the content form with one fragment, optional categories collapsed. A missing field gets inline help and focus. During generation show stage and Cancel. On failure keep edits and offer retry with the same input or return to content.
- An editable narrative starts from the selected candidate. Show a diff before replacing edited downstream work. Keep the last saved version available when saving fails, and offer draft JSON download.
- Graph editing supports adding, connecting and removing nodes with a keyboard-accessible inspector. Explain a rejected connection at its endpoints. Move focus to a remaining node after deletion. Atlas controls support pan, zoom, fit and a searchable place list with equivalent details.
- In linked view, selection highlights once without moving keyboard focus across panes. Multiple events at one place form a selectable list. An unplaced draft location shows its name and placement state. Returning from a finding restores the selected entity.
- Desktop uses side-by-side editors and a collapsible inspector. At narrow widths use one active pane with Graph/Atlas tabs retaining the same selection, a stacked candidate comparison by field, and a detail sheet. Keep zoom buttons and text lists available without dragging. Announce save state and findings to assistive technology.
- Separate review of editorial advice from blocking errors. A major proposal opens a before/after preview with accept and decline actions. Draft export includes open issues. Verification for an approved design follows the [workflow](AGENT_WORKFLOW.md).

## Phase 2 editor

The desktop Scenario Studio has three panes. The left rail selects chapters, filters visible nodes by chapter, node type or quest type, and adds chapters, nodes, quests or connections. The center switches between a directed SVG graph and a searchable outline. The inspector edits the selected record and its linked quest or ending. Narrow layouts move the navigation above the graph and stack the inspector below it.

Drag a node or focus it and press an arrow key to move it. Drag the canvas background to pan. Zoom, fit and auto-layout controls sit above the graph. Chapter boundaries group the nodes, and dashed and dotted connections distinguish optional progression and references. The outline and inspector link each choice to its destination without dragging.

Node and chapter deletion previews list affected titles and IDs. A confirmed edit removes or unlinks those dependencies together. Validation findings link to affected records, including a quest or ending through its owner node. Draft fields stay in the inspector when a save fails. Layout changes use a separate transaction from story edits.
