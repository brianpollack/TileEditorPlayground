export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const textInputClass =
  "min-h-11 min-w-[16rem] flex-1 border border-[#c3d0cb] bg-white/90 px-3 py-2 text-[#142127] outline-none transition focus:border-[#d88753]";

export const compactTextInputClass =
  "min-h-11 border border-[#c3d0cb] bg-white/90 px-3 py-2 text-[#142127] outline-none transition focus:border-[#d88753]";

export const canvasViewportClass =
  "overflow-auto border border-[#c3d0cb]/80 bg-[linear-gradient(180deg,rgba(244,239,226,0.82),rgba(215,236,233,0.36))]";

export const statusChipClass =
  "inline-flex min-h-10 items-center bg-[#13262f]/8 px-3 py-2 text-sm leading-6 text-[#4a6069]";

export const zoomButtonClass =
  "min-h-10 min-w-10 border border-[#c3d0cb] bg-white/92 px-3 py-2 text-sm font-semibold text-[#142127] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45";

export const sectionCardClass = "grid gap-2 border border-[#c3d0cb]/75 bg-white/88 p-3";

export const toolSectionCardClass = "grid gap-3 border border-[#c3d0cb]/75 bg-white/85 p-3";

export const previewCanvasClass = "block border border-[#c3d0cb] [image-rendering:pixelated]";

export const iconButtonClass =
  "grid h-6 w-6 place-items-center border border-[#c3d0cb] text-[#4a6069] transition hover:border-[#d88753] hover:text-[#d88753]";

export const closeButtonClass =
  "min-h-9 min-w-9 border border-[#c3d0cb] bg-white/90 px-3 text-sm font-semibold text-[#4a6069] transition hover:border-[#d88753] hover:text-[#142127]";

export const secondaryButtonClass =
  "min-h-10 border border-[#c3d0cb] bg-white/92 px-4 py-2 text-sm font-semibold text-[#142127] transition hover:bg-white";

export const modalSurfaceClass =
  "w-full border border-[#c3d0cb] bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,253,248,0.94))] shadow-[0_24px_60px_rgba(20,33,39,0.28)]";

export const floatingPanelSurfaceClass =
  "fixed z-[80] w-[28rem] border border-[#c3d0cb] bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,253,248,0.94))] shadow-[0_24px_60px_rgba(20,33,39,0.28)]";

export function selectablePanelClass(
  active: boolean,
  inactiveClass = "border-[#c3d0cb]/75 bg-white/88"
) {
  return cx(
    "grid gap-2 border p-3 transition",
    active
      ? "border-[#d88753] bg-white shadow-[inset_0_0_0_1px_rgba(216,135,83,0.25)]"
      : inactiveClass
  );
}

export function previewSelectionButtonClass(active: boolean) {
  return cx(
    "grid w-fit place-items-center border transition",
    active ? "border-[#d88753]" : "border-[#c3d0cb] hover:border-[#4b86ff]"
  );
}

export function visibilityOptionButtonClass(active: boolean) {
  return cx(
    "flex min-h-7 items-center justify-center gap-1 border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.04em] transition",
    active
      ? "border-[#16324f] bg-[#16324f] text-white"
      : "border-[#c3d0cb] bg-white text-[#4a6069] hover:border-[#4b86ff] hover:text-[#142127]"
  );
}

export function selectableCardClass(
  active: boolean,
  inactiveClass = "border-[#c3d0cb]/80 bg-white/90 hover:border-[#d88753]/55 hover:bg-white"
) {
  return cx(
    "border transition",
    active
      ? "border-[#d88753] bg-white shadow-[inset_0_0_0_1px_rgba(216,135,83,0.25)]"
      : inactiveClass
  );
}
