# Tile Server 19 Style Guide

Implementation guide for keeping UI code readable, DRY, and theme-driven.

This project uses:

- semantic theme tokens in [`src/styles/theme.ts`](./src/styles/theme.ts)
- semantic CSS classes and scoped feature selectors in [`src/styles/app.css`](./src/styles/app.css)
- shared cross-screen UI recipes in [`src/components/uiStyles.ts`](./src/components/uiStyles.ts)
- small reusable presentation components in [`src/components/`](./src/components)

The goal is to avoid repeated utility bundles, raw color values in JSX, and copy-pasted UI patterns.

## Core Rules

1. Never put raw color values in JSX class strings.

- Do not write classes like `border-[#c3d0cb]`, `text-[#4a6069]`, `bg-white/90`, or color-based arbitrary values in component markup.
- Do not introduce new inline `rgba(...)` or hex colors in `className`.
- If a color is needed, add or reuse a semantic token and class first.

2. Use semantic names, not appearance names.

- Good: `theme-border-panel`, `theme-text-muted`, `theme-bg-brand`
- Bad: `gray-border`, `orange-text`, `soft-green-bg`

3. Follow the styling hierarchy in this order.

- Theme token in `theme.ts`
- Semantic CSS class in `app.css`
- Shared recipe in `uiStyles.ts`
- Feature-scoped selector in `app.css`
- Small reusable component in `src/components/`

4. If markup and behavior repeat, extract a component.

- Examples: `FileDropTarget`, `ConfirmationDialog`, `CheckerboardFrame`, `SectionEyebrow`

5. If only styling repeats, extract CSS before extracting more React.

- Prefer a shared semantic class or a scoped selector over repeating large `className` strings.

6. Use feature-scoped selectors for stable repeated subtrees.

- Example: `.brush-palette-effects > label`
- This is appropriate when a local feature has repeated DOM with the same structure.
- Keep selectors scoped and intentional. Avoid broad descendant rules across unrelated screens.

## Styling Decision Framework

Use a semantic theme class when:

- the value is a text tone, border tone, background surface, overlay, emphasis state, or shadow
- the same visual meaning appears across multiple screens

Use a shared recipe from `uiStyles.ts` when:

- a full UI pattern is reused across screens
- examples include inputs, cards, panel chrome, menus, button shells, empty states

Use a scoped selector in `app.css` when:

- repeated structure is local to one feature
- the DOM shape is stable
- the JSX is getting noisy with repeated layout utilities

Use a React component when:

- structure and behavior repeat together
- there is stateful or eventful logic worth centralizing

Leave styling local only when:

- the layout is truly one-off
- the styling does not introduce a new reusable meaning

## DRY Standards

### JSX

- Keep `className` focused on layout and composition, not repeated theme bundles.
- If the same 5 to 10 classes appear more than twice, stop and consolidate.
- Prefer semantic wrappers over repeating utility chains in each child.

### Components

- Keep shell structure centralized in shared components like `Panel` and `PanelHeader`.
- Avoid large “do everything” generic components.
- Prefer small focused primitives.

### Theme

- Add new color tokens only when there is a distinct use-case.
- If two colors serve the same UI purpose, consolidate to one semantic token.
- Tokens should describe purpose, not hue.

### Reviews

Flag these during review:

- raw color values in JSX classes
- repeated utility bundles
- copy-pasted dialog/drop-target/menu/card structures
- one-off button variants that should be shared
- new feature sections that should use a scoped root class

## Canonical Files

These are the first files to update before adding new styling approaches:

- [`src/styles/theme.ts`](./src/styles/theme.ts): source of truth for semantic tokens
- [`src/styles/app.css`](./src/styles/app.css): semantic classes and scoped selectors
- [`src/components/uiStyles.ts`](./src/components/uiStyles.ts): shared cross-screen UI recipes
- [`src/components/buttonStyles.ts`](./src/components/buttonStyles.ts): primary action button recipe

## Critical Theme Tokens

Defined in [`src/styles/theme.ts`](./src/styles/theme.ts).

### Primary color roles

- `brand`: primary action surfaces and strong active states
- `brandHover`: brand outline/hover accent
- `accent`: highlighted selection, focus, and destructive emphasis
- `accentSoft`: softer accent support color
- `accentSurface`: accent-backed selected surface
- `info`: informational blue accent

### Surface roles

- `panel`: main UI surface
- `paper`: warm supporting surface
- `paperSoft`: app background surface
- `readOnlySurface`: read-only input surface
- `disabledSurface`: disabled control surface
- `canvas`: dark canvas surface
- `canvasMuted`: secondary dark canvas surface
- `overlay`: modal and overlay backdrop base
- `emptyState`: empty-state overlay surface

### Text roles

- `ink`: primary text
- `inkSoft`: secondary/muted text
- `inkSubtle`: subdued breadcrumb/support text
- `inkReadonly`: text on read-only fields
- `inkDisabled`: text on disabled controls
- `inkSuccess`: positive but muted success-like heading text
- `inkSuccessSoft`: softer variant for supporting success text

### Border roles

- `line`: standard panel/input border
- `moss`: supportive success/organic accent border
- `mossSoft`: subtle green supporting surface
- `warning`: warning/highlight stroke

## Critical Semantic Classes

Defined in [`src/styles/app.css`](./src/styles/app.css).

### Text

- `theme-text-primary`
- `theme-text-muted`
- `theme-text-subtle`
- `theme-text-readonly`
- `theme-text-accent`
- `theme-text-brand`
- `theme-text-inverse`
- `theme-text-inverse-soft`
- `theme-text-inverse-muted`
- `theme-text-success`
- `theme-text-success-soft`
- `theme-text-disabled`

### Borders

- `theme-border-panel`
- `theme-border-panel-soft`
- `theme-border-panel-faint`
- `theme-border-panel-quiet`
- `theme-border-accent`
- `theme-border-accent-soft`
- `theme-border-brand`
- `theme-border-info`
- `theme-border-success`
- `theme-border-disabled`
- `theme-border-inverse-soft`
- `theme-border-transparent`

### Backgrounds and Surfaces

- `theme-bg-input`
- `theme-bg-input-soft`
- `theme-bg-input-readonly`
- `theme-bg-panel`
- `theme-bg-paper`
- `theme-bg-paper-soft`
- `theme-bg-brand`
- `theme-bg-brand-muted`
- `theme-bg-accent`
- `theme-bg-accent-soft`
- `theme-bg-disabled`
- `theme-bg-canvas`
- `theme-bg-overlay`
- `theme-bg-overlay-soft`
- `theme-bg-empty-state`

### Interaction

- `theme-hover-text-primary`
- `theme-hover-text-accent`
- `theme-hover-border-accent`
- `theme-hover-border-accent-soft`
- `theme-hover-border-info`
- `theme-hover-bg-panel`
- `theme-hover-bg-input`
- `theme-focus-border-accent`
- `theme-disabled-surface`

### Shadows and Rings

- `theme-shadow-card`
- `theme-shadow-lift`
- `theme-shadow-modal`
- `theme-shadow-soft`
- `theme-ring-inset-accent`
- `theme-ring-inset-accent-strong`

### Complex Surfaces

- `theme-surface-panel`
- `theme-surface-panel-header`
- `theme-surface-panel-footer`
- `theme-surface-canvas-viewport`
- `theme-surface-modal`
- `theme-surface-floating`
- `theme-surface-menu`
- `theme-surface-checker-sm`
- `theme-surface-checker-md`
- `theme-button-primary`

## Critical Shared Recipes

Defined in [`src/components/uiStyles.ts`](./src/components/uiStyles.ts).

### Panels and layout

- `panelSurfaceClass`
- `panelHeaderClass`
- `panelFooterClass`
- `sectionCardClass`
- `toolSectionCardClass`
- `canvasViewportClass`

### Text and structure

- `sectionEyebrowClass`
- `statusChipClass`

### Inputs and controls

- `textInputClass`
- `compactTextInputClass`
- `readOnlyInputClass`
- `zoomButtonClass`
- `secondaryButtonClass`
- `closeButtonClass`
- `iconButtonClass`
- `destructiveButtonClass`

### Floating UI and overlays

- `modalSurfaceClass`
- `modalBackdropClass`
- `floatingPanelSurfaceClass`
- `menuSurfaceClass`
- `menuItemButtonClass`
- `overflowMenuButtonClass`

### Cards and previews

- `previewCanvasClass`
- `previewFrameClass`
- `badgePillClass`
- `emptyStateCardClass`
- `darkCanvasClass`

### Stateful helpers

- `dragDropTargetClass(active, disabled)`
- `checkerboardSurfaceClass(size)`
- `selectablePanelClass(active, inactiveClass?)`
- `previewSelectionButtonClass(active)`
- `visibilityOptionButtonClass(active)`
- `selectableCardClass(active, inactiveClass?)`

## Critical Reusable Components

Use these before inventing new local markup patterns:

- [`src/components/Panel.tsx`](./src/components/Panel.tsx)
- [`src/components/PanelHeader.tsx`](./src/components/PanelHeader.tsx)
- [`src/components/FileDropTarget.tsx`](./src/components/FileDropTarget.tsx)
- [`src/components/ConfirmationDialog.tsx`](./src/components/ConfirmationDialog.tsx)
- [`src/components/CheckerboardFrame.tsx`](./src/components/CheckerboardFrame.tsx)
- [`src/components/SectionEyebrow.tsx`](./src/components/SectionEyebrow.tsx)

## Feature-Scoped Selectors

Use feature-scoped selectors sparingly but intentionally.

Current example:

- `.brush-palette-effects > label`

This pattern is appropriate when:

- the markup is repeated within one feature
- the structure is stable
- extracting a generic component would add noise instead of clarity

Do not use feature-scoped selectors for:

- app-wide generic behavior
- unstable nested markup
- styles that already belong in `uiStyles.ts`

## Good vs Bad

### Good

```tsx
<div className={sectionCardClass}>
  <SectionEyebrow>Brush Effects</SectionEyebrow>
  <div className="brush-palette-effects grid gap-2 sm:grid-cols-2">
    <label>
      <input type="checkbox" />
      <span>Color</span>
      <input type="color" />
    </label>
  </div>
</div>
```

### Bad

```tsx
<label className="flex min-h-10 items-center gap-3 border border-[#c3d0cb] bg-white px-3 py-2 text-sm text-[#142127]">
```

## Canvas And Rendering Note

This guide applies first to CSS and JSX styling.

Canvas drawing code may still contain direct color values where the color is part of rendering logic rather than DOM styling. When those colors represent UI chrome rather than image content, they should eventually be migrated to semantic theme constants as well.

## Working Rule For New Code

Before adding new styling, ask:

1. Is this a color or surface role that already exists in the theme?
2. If not, should I add a new semantic token in `theme.ts`?
3. Is this a repeated pattern that belongs in `uiStyles.ts`?
4. Is this local repeated structure better expressed as a scoped selector?
5. Is this repeated markup+behavior better expressed as a component?

If the answer to any of those is yes, do that first instead of adding more raw utility strings.
