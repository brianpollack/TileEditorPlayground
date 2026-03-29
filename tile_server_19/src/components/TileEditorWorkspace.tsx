"use client";

import { memo, useState } from "react";
import { faPenToSquare, faTrashCan } from "@awesome.me/kit-a62459359b/icons/classic/solid";

import { PREVIEW_SIZE, TILE_SIZE } from "../lib/constants";
import { describeSlot, type SlotKey } from "../lib/slots";
import { actionButtonClass } from "./buttonStyles";
import { FontAwesomeIcon } from "./FontAwesomeIcon";
import { Panel } from "./Panel";
import type { SlotRecord, TileRecord } from "../types";

const SELECTOR_SIZES = [128, 64, 32, 16] as const;

interface TileEditorWorkspaceProps {
  activeSelectorSize: number;
  activeTile: TileRecord | null;
  draftSlots: Array<SlotRecord | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  hasUnsavedSlotChanges: boolean;
  onBrowseImage(): void;
  onCancelClearSlot(): void;
  onClearDraftSlots(): void;
  onConfirmClearSlot(): void;
  onExport(): void;
  onFileSelected(file: File): void;
  onOpenPaintEditor(slotKey: SlotKey): void;
  onRequestClearSlot(slotKey: SlotKey): void;
  onSaveTile(): void;
  onSelectSlot(slotKey: SlotKey): void;
  onSelectorSizeChange(size: number): void;
  onSourceCanvasClick(event: React.MouseEvent<HTMLCanvasElement>): void;
  onSourceCanvasMouseMove(event: React.MouseEvent<HTMLCanvasElement>): void;
  previewCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  selectedSlotKey: SlotKey;
  slotPendingClear: SlotKey | null;
  sourceCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  sourceImage: HTMLImageElement | null;
}

function TileEditorWorkspaceImpl({
  activeSelectorSize,
  activeTile,
  draftSlots,
  fileInputRef,
  hasUnsavedSlotChanges,
  onBrowseImage,
  onCancelClearSlot,
  onClearDraftSlots,
  onConfirmClearSlot,
  onExport,
  onFileSelected,
  onOpenPaintEditor,
  onRequestClearSlot,
  onSaveTile,
  onSelectSlot,
  onSelectorSizeChange,
  onSourceCanvasClick,
  onSourceCanvasMouseMove,
  previewCanvasRef,
  selectedSlotKey,
  slotPendingClear,
  sourceCanvasRef,
  sourceImage
}: TileEditorWorkspaceProps) {
  const [isImageDropActive, setImageDropActive] = useState(false);

  function handleImageDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setImageDropActive(false);

    const nextFile = event.dataTransfer.files?.[0];

    if (nextFile) {
      onFileSelected(nextFile);
    }
  }

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-2">
      <Panel
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <button
              className={actionButtonClass}
              onClick={onBrowseImage}
              type="button"
            >
              Browse Image
            </button>
            <div
              className={`flex min-h-11 min-w-[10rem] items-center justify-center border border-dashed px-3 py-2 text-sm font-semibold transition ${
                isImageDropActive
                  ? "border-[#d88753] bg-white text-[#142127] shadow-[inset_0_0_0_1px_rgba(216,135,83,0.22)]"
                  : "border-[#c3d0cb] bg-white/86 text-[#4a6069]"
              }`}
              onDragEnter={(event) => {
                event.preventDefault();
                setImageDropActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setImageDropActive(false);
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                if (!isImageDropActive) {
                  setImageDropActive(true);
                }
              }}
              onDrop={handleImageDrop}
            >
              Drop From Finder
            </div>
            <input
              accept="image/*"
              hidden
              onChange={(event) => {
                const nextFile = event.currentTarget.files?.[0];

                if (nextFile) {
                  onFileSelected(nextFile);
                }

                event.currentTarget.value = "";
              }}
              ref={fileInputRef}
              type="file"
            />
          </div>
        }
        title="Source Image"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#4a6069]">
            Selector Size
          </span>
          {SELECTOR_SIZES.map((size) => {
            const disabled = selectedSlotKey === "main" && size !== TILE_SIZE;

            return (
              <button
                className={`min-h-10 border px-3 py-2 text-sm font-semibold transition ${
                  activeSelectorSize === size
                    ? "border-[#d88753] bg-white text-[#142127] shadow-[inset_0_0_0_1px_rgba(216,135,83,0.25)]"
                    : "border-[#c3d0cb] bg-white/85 text-[#4a6069] hover:bg-white hover:text-[#142127]"
                }`}
                disabled={disabled}
                key={size}
                onClick={() => {
                  onSelectorSizeChange(size);
                }}
                type="button"
              >
                {size}x{size}
              </button>
            );
          })}
        </div>

        <div className="relative flex min-h-[24rem] items-center justify-center overflow-auto border border-[#c3d0cb]/80 bg-[linear-gradient(180deg,rgba(244,239,226,0.82),rgba(215,236,233,0.36))]">
          <canvas
            className={`${sourceImage ? "block" : "hidden"} max-w-full bg-[#0d161b] [image-rendering:pixelated]`}
            onClick={onSourceCanvasClick}
            onMouseMove={onSourceCanvasMouseMove}
            ref={sourceCanvasRef}
          />
          {!sourceImage ? (
            <div className="absolute inset-0 grid place-items-center gap-1 p-6 text-center text-sm text-[#4a6069]">
              <strong className="font-serif text-[1.35rem] text-[#142127]">
                Source image goes here
              </strong>
              <span>Use Browse Image or provide `?image=maps/example.png` in the URL.</span>
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel title="Slots and Preview">
        <div className="relative min-h-0">
          <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              className={actionButtonClass}
              disabled={!hasUnsavedSlotChanges}
              onClick={onSaveTile}
              type="button"
            >
              Save Tile
            </button>
            <button
              className={actionButtonClass}
              onClick={onExport}
              type="button"
            >
              Export Strip
            </button>
            <button
              className={actionButtonClass}
              onClick={onClearDraftSlots}
              type="button"
            >
              Clear
            </button>
          </div>

          <canvas
            className="block h-auto w-full bg-[#0d161b] [image-rendering:pixelated]"
            height={PREVIEW_SIZE}
            ref={previewCanvasRef}
            width={PREVIEW_SIZE}
          />

          <div className="grid grid-cols-5 gap-2">
            {(draftSlots as typeof draftSlots).map((slotRecord, index) => {
              const slotKey = index === 0 ? "main" : String(index - 1);
              const selected = selectedSlotKey === slotKey;

              return (
                <div
                  className={`flex min-w-0 flex-col gap-2 border bg-[#13262f]/96 p-2 text-left transition ${
                    selected
                      ? "border-[#d88753] shadow-[inset_0_0_0_1px_rgba(216,135,83,0.25)]"
                      : slotRecord
                        ? "border-[#5a7b4d]/45 hover:border-[#4b86ff]"
                        : "border-[#c3d0cb]/85 hover:border-[#4b86ff]"
                  }`}
                  key={slotKey}
                >
                  <button
                    className="grid gap-2 text-left"
                    onClick={() => {
                      onSelectSlot(slotKey as SlotKey);
                    }}
                    type="button"
                  >
                    {slotRecord?.pixels ? (
                      <img
                        alt={describeSlot(slotKey as SlotKey)}
                        className="aspect-square w-full bg-black object-contain"
                        src={slotRecord.pixels}
                      />
                    ) : (
                      <div
                        className={`grid aspect-square w-full place-items-center bg-[linear-gradient(45deg,rgba(255,255,255,0.05)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.05)_75%),linear-gradient(45deg,rgba(255,255,255,0.05)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.05)_75%)] bg-[length:24px_24px] bg-[position:0_0,12px_12px] text-center text-[0.95rem] font-extrabold ${
                          selected ? "text-[#d88753]" : "text-white/76"
                        }`}
                      >
                        {describeSlot(slotKey as SlotKey)}
                      </div>
                    )}
                    <div className={`grid gap-0.5 ${selected ? "text-[#d88753]" : "text-white/86"}`}>
                      <strong className="truncate text-xs">{describeSlot(slotKey as SlotKey)}</strong>
                      <span className={`truncate text-[10px] ${selected ? "text-[#d88753]" : "text-white/58"}`}>
                        {slotRecord
                          ? `${slotRecord.size}px @ ${slotRecord.source_x}, ${slotRecord.source_y}`
                          : "Empty"}
                      </span>
                    </div>
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      className="grid h-6 w-6 place-items-center border border-white/15 bg-white/8 text-white/80 transition hover:border-[#4b86ff] hover:text-[#4b86ff]"
                      onClick={() => {
                        onOpenPaintEditor(slotKey as SlotKey);
                      }}
                      title={`Edit ${describeSlot(slotKey as SlotKey)}`}
                      type="button"
                    >
                      <FontAwesomeIcon className="h-3.5 w-3.5" icon={faPenToSquare} />
                    </button>
                    <button
                      className="grid h-6 w-6 place-items-center border border-white/15 bg-white/8 text-white/80 transition hover:border-[#d88753] hover:text-[#d88753] disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!slotRecord}
                      onClick={() => {
                        onRequestClearSlot(slotKey as SlotKey);
                      }}
                      title={`Clear ${describeSlot(slotKey as SlotKey)}`}
                      type="button"
                    >
                      <FontAwesomeIcon className="h-3.5 w-3.5" icon={faTrashCan} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          </div>
          {!activeTile ? (
            <div className="absolute inset-0 z-20 grid place-items-center border border-[#c3d0cb]/70 bg-[rgba(236,239,238,0.9)] px-6 text-center">
              <div className="grid gap-2">
                <strong className="font-serif text-[1.3rem] text-[#5c6d68]">
                  Select a tile
                </strong>
                <span className="text-sm leading-6 text-[#6f817c]">
                  Choose a tile from the Tile Library before editing slots or previewing output.
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </Panel>

      {slotPendingClear && activeTile ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#0d161b]/55 px-4">
          <div className="w-full max-w-md border border-[#c3d0cb]/75 bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,253,248,0.94))] p-5 shadow-[0_18px_40px_rgba(20,33,39,0.24)]">
            <div className="grid gap-2">
              <h3 className="font-serif text-[1.45rem] text-[#142127]">Clear Slot?</h3>
              <p className="text-sm leading-6 text-[#4a6069]">
                Remove {describeSlot(slotPendingClear)} from <span className="font-semibold text-[#142127]">{activeTile.slug}</span>?
                This only clears the working draft until you save the tile.
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                className="min-h-10 border border-[#c3d0cb] bg-white/92 px-4 py-2 text-sm font-semibold text-[#142127] transition hover:bg-white"
                onClick={onCancelClearSlot}
                type="button"
              >
                Cancel
              </button>
              <button
                className="min-h-10 border border-[#d88753] bg-[#d88753] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#c97842]"
                onClick={onConfirmClearSlot}
                type="button"
              >
                Clear Slot
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const TileEditorWorkspace = memo(
  TileEditorWorkspaceImpl,
  (prev, next) =>
    prev.activeSelectorSize === next.activeSelectorSize &&
    prev.activeTile === next.activeTile &&
    prev.draftSlots === next.draftSlots &&
    prev.hasUnsavedSlotChanges === next.hasUnsavedSlotChanges &&
    prev.selectedSlotKey === next.selectedSlotKey &&
    prev.slotPendingClear === next.slotPendingClear &&
    prev.sourceImage === next.sourceImage
);
