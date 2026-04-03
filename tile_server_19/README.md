# Tile Server 19

AI-agent context for a local React 19 tile and map workshop. This file is intentionally written as implementation guidance, not marketing copy.

Database schema documentation lives in `DATABASE.md`. Whenever we change any table schema, column behavior, indexes, or serialization rules, update `DATABASE.md`, this `README.md`, and `memory.md` together.

## What This Project Is

This app is a local content-authoring tool for:

- building and maintaining a tile library
- slicing tiles from source images
- editing per-tile slots
- painting layered pixel art inside a slot
- assembling maps from saved tiles
- moving small image snippets through a floating clipboard manager

The app is optimized for local iteration, Postgres-backed project persistence, and draft-safe editing. The most important architectural idea is that the UI should not lose local work just because a panel unmounts, a tab changes, or a paint editor closes and reopens.

## Stack And Runtime

- React 19 client components plus Vite RSC wiring
- Vite as the dev/build tool
- Tailwind CSS v4 for utility styling
- server actions for writes to project data
- `pngjs` for thumbnail generation and strip export

Relevant entry points:

- `src/app/AppDocument.tsx`: server-rendered document, loads initial data from disk and query params
- `src/app/TileServerApp.tsx`: top-level client shell, global draft state owner, mode switcher
- `src/framework/entry.browser.tsx`: browser hydration and action callback plumbing
- `vite.config.ts`: Vite config plus custom clipboard persistence middleware
- `DATABASE.md`: current database tables, columns, indexes, and storage notes

## Project Shape

- `src/app/`: app shell and context
- `src/components/`: main editor UIs
- `src/actions/`: server actions invoked from the client
- `src/lib/`: normalization, storage, image, map, and slot helpers
- `src/styles/`: theme tokens and base CSS
- `DATABASE.md`: database schema reference and maintenance notes
- `memory.md`: repo-local agent reminder file
- `data/all_tiles.json`: persisted tile records
- `data/maps/*.json`: legacy map import source for database bootstrap
- `data/temp/clipboard-slots.json`: persisted clipboard slots for the floating clipboard manager
- `exports/`: generated exported tile strips
- `public/art_icons/`: bundled art assets and references

## Data Model

### Tile Records

Tiles are stored as `TileRecord` objects.

- `name`: display name
- `path`: library folder path such as `layer_5` or `layer_5/consumables`
- `slug`: unique stable id
- `source`: source image path used for slicing
- `slots`: fixed-length array of 5 slot records
- `thumbnail`: generated strip thumbnail used in the tile library

The five slots are:

- `main`
- accent `0`
- accent `1`
- accent `2`
- accent `3`

Internally, `main` maps to slot index `0`, and accent slots map to indices `1..4`.

### Slot Records

Each slot is a `SlotRecord`.

- `layers`: fixed-length array of 5 layer PNG data URLs
- `pixels`: flattened combined image for the slot
- `size`: original capture size
- `source_x`, `source_y`: selection origin in the source image

Important: `pixels` is the flattened composite, but Paint Mode also preserves the full layered representation in `layers`. Agents should preserve both.

### Map Records

Maps are stored as `MapRecord` objects.

- `layers`: fixed-length array of 9 map layers, each a 2D array of tile placements
- `cells`: flattened composite view derived from the visible layer stack for compatibility
- `width`, `height`: normalized dimensions
- `name`, `slug`
- `updatedAt`

Persisted maps are now stored in Postgres:

- `map_maps` stores one row per map
- `map_map_assets` stores one row per occupied map cell per layer
- `slotNum` on tile placements identifies which tile slot/variant was painted
- legacy `data/maps/*.json` files are only used for one-time import when the database has no maps yet

### Clipboard Slots

Clipboard entries are `ClipboardSlotRecord | null` in a fixed-length array of 10.

- `image`: PNG data URL
- `createdAt`: ISO timestamp

## Persistence Model

There are three persistence layers:

1. Server-backed project data in Postgres and local support files
2. Client draft state inside `TileServerApp`
3. Session restoration in `window.sessionStorage`

### Server-Backed Data

The project persists real content through `src/lib/serverStore.ts`.

- tile library assets are now read/written from Postgres `map_tiles`
- maps are now read/written from Postgres `map_maps` and `map_map_assets`
- clipboard slots are read/written from `data/temp/clipboard-slots.json`
- exported slot strips are written to `exports/`

Important server helpers:

- `readTileRecords`, `writeTileRecords`
- `readMapRecords`, `writeMapRecord`
- `readClipboardSlots`, `writeClipboardSlots`
- `createTileThumbnail`
- `exportTileStrip`
- `loadProjectImageSource`

### Client Draft State

The app does not edit server data directly in the UI. Instead, `TileServerApp` owns draft state and exposes it through `StudioContext`.

The main draft stores are:

- `draftSlotsByTileSlug`
- `draftLayersByMapSlug`
- `mapDesignerUiStateByMapSlug`
- `paintEditorUiStateById`
- `clipboardSlotsState`

This separation is critical:

- switching tabs should not throw away unsaved slot edits
- paint editors can mount and unmount without losing tool, zoom, or layer visibility state
- map painting is draft-first and save-later
- clipboard choices remain available while moving between modes

Performance note:

- `TileServerApp` owns global draft and UI state, so any change there can rerender every `StudioContext` consumer
- mode UIs with expensive canvases should keep a light shell connected to global state and move the heavy drawing surface into a memoized workspace child
- pass only paint-or-map-facing props into that workspace; keep unrelated global state like clipboard status, floating panel state, and other mode UI out of its render path
- if a handler inside a memoized workspace still needs the latest global value, prefer syncing that value into a ref instead of passing it as a rerender-triggering prop

### Session Restoration

`TileServerApp` writes a subset of UI and draft state into `sessionStorage` under:

- `tile-server-19:studio-state`

Restored values include:

- active map slug
- map brush tile slug
- clipboard slots
- selected clipboard slot index
- clipboard manager open state
- map draft layers
- map designer zoom and scroll state
- paint editor UI state by session id

This restoration is intentionally narrower than full app serialization. The server snapshot still supplies canonical tile and map records.

## Normalization Rules

Normalization is a core design rule in this repo. New code should reuse the existing helpers rather than hand-rolling shape cleanup.

Important helpers:

- `normalizeSlotLayers`
- `normalizeSlotRecords`
- `sanitizeSlotRecord`
- `normalizeMapCells`
- `normalizeMapDimension`
- `normalizePaintEditorUiState`
- `normalizeClipboardSlots`
- `normalizeTilePayload`
- `normalizeMapPayload`

Why this matters:

- slot arrays are always fixed-length
- layer arrays are always fixed-length
- map grids are always rectangular and bounded
- malformed stored data fails soft instead of breaking rendering
- UI state remains valid even when partial state is restored

If an agent bypasses normalization, the easiest regressions are off-by-one slot/layer bugs, broken previews, and restored state crashes.

## Global App Shell

`src/app/TileServerApp.tsx` is the real orchestrator.

It is responsible for:

- loading server-provided initial data into local React state
- owning all draft state
- switching between Tile Editor, Map Designer, and dynamic Paint Mode tabs
- syncing selected mode and active records into the URL
- restoring session state from `sessionStorage`
- persisting clipboard slot changes through a custom POST route
- auto-detecting clipboard images on browser focus and visibility changes

Mode routing details:

- top-level modes are `tile-workshop` and `map-designer`
- each paint tab gets a session id like `paint:<tileSlug>:<slotKey>`
- URL query params preserve active tile, active map, brush tile, mode, and open paint sessions
- hash routing is also used for switching between Tile and Map views

Useful query params:

- `?edit=<layerPath>/<tileSlug>`
- `?map=<mapSlug>`
- `?brush=<tileSlug>`
- `?image=<workspace-relative-image-path>`
- `?mode=tile|map|paint:<tileSlug>:<slotKey>`
- `?paint=<tileSlug>:<slotKey>,...`

## Primary Modes

## Tile Editor

Main file:

- `src/components/TileWorkshop.tsx`

Purpose:

- create and select tile records
- browse the folder-based tile library with layer breadcrumbs
- load a source image
- choose a capture rectangle
- fill any of the 5 slots from the current source selection
- preview the combined strip behavior
- save or export the tile
- open Paint Mode for any slot

Key behavior:

- the library root starts with `layer_0` through `layer_8`
- root layer labels are:
  - `0 - Base Terrain`
  - `1 - Decoration`
  - `2 - Environmental`
  - `3 - Non moveable items`
  - `4 - Critters`
  - `5 - Items`
  - `6 - Actors and Characters`
  - `7 - Effects`
  - `8 - Other`
- tiles are organized by `TileRecord.path` instead of encoding categories in the tile name
- the library browser shows subfolders first and tiles second in the same list
- source images can come from local file upload or `?image=...`
- the selection rectangle snaps near tile borders through `snapToTileBorder`
- the `main` slot forces full `128x128`
- accent slots can capture `128`, `64`, `32`, or `16`
- captures are padded into a `128x128` slot canvas via `createPaddedSlotRecord`
- slot changes go into `draftSlotsByTileSlug`, not directly to disk
- `Save Tile` writes the current draft slots through `saveTileAction`
- `Export Strip` creates a PNG strip in `exports/`

Preview logic:

- the large preview canvas shows a 10x10 synthetic scene
- the main slot repeats as the base tile
- accent slots are scattered using deterministic seeded placement via `buildPreviewPlacements`
- this preview is meant to show the effect of accent slots quickly, not to represent a real map

Agent notes:

- keep slot capture and slot save separate
- preserve the draft-vs-saved distinction
- when changing slot count or slot layout, update constants, normalizers, previews, and persistence together

## Map Designer

Main file:

- `src/components/MapDesigner.tsx`

Purpose:

- create map records
- choose a brush tile or eraser
- paint tiles directly onto a layered grid canvas
- save maps as JSON files

Key behavior:

- map drafts live in layered form and preserve 9 stackable layers
- actual writes happen only on `Save Map`
- erasing is implemented by setting the active layer cell to empty
- the brush palette uses each tile's main slot preview
- brush effects can combine flip, rotation, multiply, and color options before painting
- canvas scale is visual only; it does not change map dimensions
- hover state highlights the active cell and summarizes any saved effects on that stack position
- the map workspace includes a composite preview plus a per-layer rail modeled after Paint Mode

Map rules:

- grids are rectangular and normalized
- map dimensions are clamped between 1 and 200
- blank cells are allowed
- cells store tile placements and options, not embedded images

Agent notes:

- never store images in map cells
- use `normalizeMapCells` and `normalizeMapDimension`
- if adding map tools, keep `paintCell` and pointer mapping logic coherent

## Paint Mode

Main file:

- `src/components/PaintMode.tsx`

Purpose:

- edit one slot as layered pixel art
- preserve both composite pixels and discrete layers
- support fast slot-level refinement without leaving the app

Layer model:

- every slot has 5 layers
- all 5 layers are selectable and editable in Paint Mode
- saving Paint Mode rebuilds both:
  - `layers`: per-layer PNG data URLs
  - `pixels`: flattened combined slot image

Tools:

- pencil
- brush
- eraser
- eyedropper
- marquee
- stamp
- fill

Keyboard shortcuts:

- `P`: pencil
- `B`: brush
- `E`: eraser
- `I`: eyedropper
- `M`: marquee
- `S`: stamp
- `[` and `]`: zoom out / zoom in

Paint behavior:

- editing occurs on hidden per-layer canvases, not directly on the display canvas
- the main editor is a scaled composite view with a checkerboard background and pixel grid
- layer previews are separate small canvases
- final previews show combined output at `128x128` and `64x64`
- visibility controls affect editor previews but do not delete layer data
- quick colors are refreshed from the composite image using the octree palette extractor

Clipboard behavior inside Paint Mode:

- marquee selection copies visible pixels into the clipboard manager
- stamp uses the currently selected clipboard slot and pastes it into the active selected layer
- Edger is a confirmed action under Color Selection that rebuilds the selected layer from the composited layers beneath it
- if the clipboard manager is closed, Paint Mode opens it automatically
- copy targets the selected clipboard slot when possible

Save behavior:

- Paint Mode writes back into the tile draft immediately on layer changes
- explicit `Save Tile` persists the current slot draft to disk via `saveTileAction`

Agent notes:

- do not treat `pixels` as the source of truth once layers exist
- if changing zoom or canvas size logic, preserve scroll anchoring behavior
- keep `buildSlotRecordFromCanvases` and preview rendering in sync

Paint performance notes:

- Paint Mode is split into a light shell plus a memoized canvas workspace so clipboard-only updates do not redraw the editor, layer previews, and final previews
- marquee copy is allowed to update clipboard slots, selected clipboard slot, clipboard status, and the clipboard manager without forcing the paint workspace to rerender
- stamp reads the latest clipboard target through refs so the workspace can stay memoized while still using fresh clipboard data
- overlay state such as marquee boxes and stamp hover should repaint only the main editor canvas
- layer previews and final previews should redraw only when actual pixel content changes or slot data is loaded
- local paint commits should avoid a PNG decode and layer reload round-trip when the live canvases already hold the same pixels
- successful saves should update the saved tile record without replacing identical live draft layers in Paint Mode

## Clipboard Manager

Main file:

- `src/components/ClipboardManager.tsx`

Purpose:

- provide a floating 10-slot image clipboard shared across modes

Behavior:

- draggable floating panel
- fixed 10-slot layout
- selected slot acts as the preferred target for clipboard writes
- slots can be cleared individually
- panel can be toggled from the app shell
- app shell badge shows count of filled slots

Data flow:

- `TileServerApp` watches browser clipboard images when the page regains focus or becomes visible
- detected images are cropped to at most `128x128`
- unique images are auto-added to the first open slot
- clipboard changes are debounced and persisted by POSTing to `/__clipboard/save`
- `vite.config.ts` provides middleware for that route in both dev and preview

Important nuance:

- clipboard slots are both session-restored and persisted to `data/temp/clipboard-slots.json`
- this is more persistent than most UI state, but still treated as temp workspace data

## Design Philosophy

This project favors direct manipulation over abstract forms.

Core principles:

- canvas-first editing for maps and paint workflows
- local-first drafting before explicit saves
- deterministic normalization around all persisted content
- visual feedback should be immediate and legible
- keep domain models simple: maps store slugs, tiles store slots, slots store layers plus composite

This is not a large architecture with reducers, external state libraries, or remote APIs. Most complexity lives in a few editor components and the normalization/storage helpers around them.

## CSS And Visual Decisions

The visual system is intentionally warm and workshop-like rather than default app chrome.

Key decisions:

- Tailwind utility classes are used heavily inline in components
- shared design tokens live in `src/styles/theme.ts`
- global CSS is very small and mostly sets fonts, gradients, and base element behavior
- the UI uses layered paper/canvas gradients, warm borders, and soft shadows instead of flat grayscale
- canvases and pixel previews rely on `[image-rendering: pixelated]`
- editor panels use a consistent paper-card style through `Panel`
- the app shell is wide and desktop-forward, with responsive fallbacks rather than a fully separate mobile design

If changing styling:

- preserve the workshop/paper/canvas feel
- keep strong visual distinction between editable surfaces and navigation chrome
- do not casually flatten everything into generic app gray

## Build, Check, And Debug Commands

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

Run TypeScript checks:

```bash
npm run typecheck
```

Current testing situation:

- there is no formal automated test suite yet
- `npm run typecheck` is the main correctness check
- manual verification in the browser is important for editor interactions, canvas rendering, and persistence flows

## Debugging Notes

When debugging, check these areas first:

- URL query params and hash if the wrong mode opens
- `sessionStorage` key `tile-server-19:studio-state` if draft restoration behaves strangely
- `DATABASE.md` for current Postgres table shape and migration notes
- `map_tiles` for saved tile and sprite payload shape
- `map_maps` and `map_map_assets` for saved map payload shape
- `data/temp/clipboard-slots.json` for persisted clipboard state
- console errors around image decoding if previews go blank

Common failure modes:

- forgetting to normalize slot arrays or map dimensions
- updating draft state but not persisting through the matching save action
- changing slot/layer constants without updating rendering and serialization together
- breaking `useImageCache` assumptions and causing repeated image decode churn

## Safe Change Guidelines For Agents

Before modifying behavior:

- identify whether the feature lives in Tile Editor, Map Designer, Paint Mode, the Clipboard Manager, or the app shell
- preserve the draft-first editing model unless the change explicitly redesigns persistence
- route all saved payloads through the existing normalization helpers
- keep client draft state and server persistence concerns separate

When changing data shape:

- update types
- update normalizers
- update server store readers/writers
- update any preview builders
- update README context if the mental model changes

When changing UI behavior:

- check whether the same state is also reflected in URL params, `sessionStorage`, or clipboard persistence
- verify mount/unmount behavior, because editors are conditionally shown and hidden

When splitting modes or data access:

- put long-lived, cross-mode state in `TileServerApp`
- keep mode-specific drawing internals inside the mode component whenever possible
- if one part of a mode is expensive to rerender, split it into a memoized child with a narrow prop surface
- avoid connecting a canvas-heavy subtree directly to unrelated global stores
- separate transient overlay state from real pixel or map data changes
- if a global store update should not visually change a canvas, treat any resulting redraw as a bug

## Short Mental Model

If you only remember one thing, remember this:

- `TileServerApp` owns long-lived draft state
- editor components are clients of that state
- server actions persist canonical JSON snapshots
- normalization helpers are the guard rails
- Paint Mode edits a slot as layers, not just a flat image
