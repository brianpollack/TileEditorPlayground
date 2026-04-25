export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const sectionEyebrowClass =
  "text-xs font-extrabold uppercase tracking-[0.12em] theme-text-muted";

export const panelSurfaceClass =
  "flex min-h-0 flex-col overflow-hidden border border-white/80 theme-surface-panel theme-shadow-card";

export const panelHeaderClass =
  "flex min-h-24 items-start justify-between gap-4 overflow-hidden border-b theme-border-panel-faint theme-surface-panel-header px-4 py-4";

export const panelFooterClass =
  "border-t theme-border-panel-faint theme-surface-panel-footer px-4 py-4";

export const textInputClass =
  "min-h-11 min-w-[16rem] flex-1 border theme-border-panel theme-bg-input px-3 py-2 theme-text-primary outline-none transition theme-focus-border-accent";

export const compactTextInputClass =
  "min-h-11 border theme-border-panel theme-bg-input px-3 py-2 theme-text-primary outline-none transition theme-focus-border-accent";

export const readOnlyInputClass = "!theme-bg-input-readonly !theme-text-readonly";

export const canvasViewportClass =
  "overflow-auto border theme-border-panel-quiet theme-surface-canvas-viewport";

export const statusChipClass =
  "inline-flex min-h-10 items-center bg-[color-mix(in_srgb,var(--canvas)_8%,transparent)] px-3 py-2 text-sm leading-6 theme-text-muted";

export const zoomButtonClass =
  "min-h-10 min-w-10 border theme-border-panel theme-bg-input px-3 py-2 text-sm font-semibold theme-text-primary transition theme-hover-bg-panel disabled:cursor-not-allowed disabled:opacity-45";

export const sectionCardClass = "grid gap-2 border theme-border-panel-soft theme-bg-input p-3";

export const toolSectionCardClass = "grid gap-3 border theme-border-panel-soft theme-bg-input-soft p-3";

export const previewCanvasClass = "block border theme-border-panel [image-rendering:pixelated]";
export const smoothPreviewCanvasClass = "block border theme-border-panel";

export const iconButtonClass =
  "grid h-6 w-6 place-items-center border theme-border-panel theme-text-muted transition theme-hover-border-accent theme-hover-text-accent";

export const closeButtonClass =
  "min-h-9 min-w-9 border theme-border-panel theme-bg-input px-3 text-sm font-semibold theme-text-muted transition theme-hover-border-accent theme-hover-text-primary";

export const secondaryButtonClass =
  "min-h-10 border theme-border-panel theme-bg-input px-4 py-2 text-sm font-semibold theme-text-primary transition theme-hover-bg-panel";

export const modalSurfaceClass =
  "w-full border theme-border-panel theme-surface-modal theme-shadow-modal";

export const modalBackdropClass =
  "fixed inset-0 z-50 grid place-items-center theme-bg-overlay px-4";

export const floatingPanelSurfaceClass =
  "fixed z-[80] w-[28rem] border theme-border-panel theme-surface-floating theme-shadow-modal";

export const menuSurfaceClass =
  "z-[90] min-w-36 border theme-border-panel theme-surface-menu theme-shadow-lift";

export const menuItemButtonClass =
  "block w-full px-3 py-2 text-left text-sm font-semibold theme-text-primary transition theme-hover-bg-input";

export const overflowMenuAnchorClass = "absolute top-2 right-2 z-30";

export const overflowMenuButtonClass =
  "inline-flex h-7 w-7 items-center justify-center rounded-full border theme-border-panel theme-bg-input text-sm font-bold theme-text-muted transition theme-hover-border-accent-soft theme-hover-text-primary";

export const badgePillClass =
  "inline-flex min-w-7 shrink-0 items-center justify-center rounded-full border theme-border-panel theme-bg-input px-2 py-0.5 text-xs font-bold theme-text-muted";

export const previewFrameClass = "border theme-border-panel theme-bg-input";

export const emptyStateCardClass =
  "border border-dashed theme-border-panel px-4 py-4 text-center text-sm theme-text-muted";

export const assetListClass = "asset-list";

export const scrollableAssetListClass = "asset-list asset-list--scroll";

export const assetListEyebrowClass = "asset-list__eyebrow";

export const assetListMetaClass = "asset-list__meta";

export const assetListTitleClass = "asset-list__title";

export const assetListSubtitleClass = "asset-list__subtitle";

export const assetListMonoClass = "asset-list__subtitle asset-list__mono";

export const assetListThumbClass = "asset-list__thumb";

export const assetListWideThumbClass = "asset-list__thumb asset-list__thumb--wide";

export const assetListCheckerThumbClass = "asset-list__thumb asset-list__thumb--checker";

export const assetListActionButtonClass = "asset-list__action";

export const compactBrushEffectsClass = "brush-palette-effects brush-palette-effects--compact grid gap-1 sm:grid-cols-2";

export const darkCanvasClass = "theme-bg-canvas [image-rendering:pixelated]";

export const destructiveButtonClass =
  "min-h-10 border theme-border-accent theme-bg-accent px-4 py-2 text-sm font-semibold theme-text-inverse transition hover:bg-[color-mix(in_srgb,var(--accent)_92%,black)]";

export function dragDropTargetClass(active: boolean, disabled = false) {
  return cx(
    "flex min-h-11 min-w-[10rem] items-center justify-center border border-dashed px-3 py-2 text-sm font-semibold transition",
    active
      ? "theme-border-accent theme-bg-panel theme-text-primary theme-ring-inset-accent"
      : "theme-border-panel theme-bg-input theme-text-muted",
    disabled && "cursor-not-allowed opacity-60"
  );
}

export function checkerboardSurfaceClass(size: "sm" | "md" = "sm") {
  return cx(
    "grid place-items-center overflow-hidden",
    size === "sm" ? "theme-surface-checker-sm" : "theme-surface-checker-md"
  );
}

export function selectablePanelClass(
  active: boolean,
  inactiveClass = "theme-border-panel-soft theme-bg-input"
) {
  return cx(
    "grid gap-2 border p-3 transition",
    active
      ? "theme-border-accent theme-bg-panel theme-ring-inset-accent"
      : inactiveClass
  );
}

export function previewSelectionButtonClass(active: boolean) {
  return cx(
    "grid w-fit place-items-center border transition",
    active ? "theme-border-accent" : "theme-border-panel theme-hover-border-info"
  );
}

export function visibilityOptionButtonClass(active: boolean) {
  return cx(
    "flex min-h-7 items-center justify-center gap-1 border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.04em] transition",
    active
      ? "theme-border-brand theme-bg-brand theme-text-inverse"
      : "theme-border-panel theme-bg-panel theme-text-muted theme-hover-border-info theme-hover-text-primary"
  );
}

export function panelTabButtonClass(active: boolean) {
  return cx(
    "panel-tab",
    active
      ? "panel-tab--active"
      : ""
  );
}

export const gridVisibilitySwitchClass = "inline-flex cursor-pointer items-center gap-3 select-none";

export const gridVisibilitySwitchInputClass = "peer sr-only";

export const gridVisibilitySwitchTrackClass =
  "relative h-5 w-9 rounded-full bg-[color-mix(in_srgb,var(--panel-header)_88%,white)] transition-colors after:absolute after:start-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-white/80 after:bg-white after:shadow-[0_1px_2px_rgba(15,23,42,0.22)] after:transition-transform after:content-[''] peer-focus-visible:ring-4 peer-focus-visible:ring-[color-mix(in_srgb,var(--accent)_20%,transparent)] peer-checked:bg-[var(--accent)] peer-checked:after:translate-x-full";

export function gridVisibilitySwitchLabelClass(active: boolean) {
  return cx(
    "text-sm font-medium transition-colors",
    active ? "theme-text-primary" : "theme-text-muted"
  );
}

export function selectableCardClass(
  active: boolean,
  inactiveClass = "theme-border-panel-quiet theme-bg-input theme-hover-border-accent-soft theme-hover-bg-panel"
) {
  return cx(
    "border transition",
    active
      ? "theme-border-accent theme-bg-panel theme-ring-inset-accent"
      : inactiveClass
  );
}

export function assetListRowClass(active: boolean, stacked = false) {
  return cx(
    "asset-list__row",
    active ? "asset-list__row--active" : "theme-border-panel-quiet",
    stacked && "asset-list__row--stacked"
  );
}
