"use client";

import { memo } from "react";
import { faPenToSquare, faTrashCan } from "@awesome.me/kit-a62459359b/icons/classic/solid";

import { PREVIEW_SIZE, TILE_SIZE } from "../lib/constants";
import { describeSlot, type SlotKey } from "../lib/slots";
import { actionButtonClass } from "./buttonStyles";
import { CheckerboardFrame } from "./CheckerboardFrame";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { FileDropTarget } from "./FileDropTarget";
import { FontAwesomeIcon } from "./FontAwesomeIcon";
import { Panel } from "./Panel";
import { SectionEyebrow } from "./SectionEyebrow";
import {
  canvasViewportClass,
  darkCanvasClass,
  destructiveButtonClass,
  secondaryButtonClass
} from "./uiStyles";
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
            <FileDropTarget idleLabel="Drop From Finder" onFileSelected={onFileSelected} />
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
          <SectionEyebrow>Selector Size</SectionEyebrow>
          {SELECTOR_SIZES.map((size) => {
            const disabled = selectedSlotKey === "main" && size !== TILE_SIZE;

            return (
              <button
                className={`min-h-10 border px-3 py-2 text-sm font-semibold transition ${
                  activeSelectorSize === size
                    ? "theme-border-accent theme-bg-panel theme-text-primary theme-ring-inset-accent"
                    : "theme-border-panel theme-bg-input-soft theme-text-muted theme-hover-bg-panel theme-hover-text-primary"
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

        <div className={`relative flex min-h-[24rem] items-center justify-center ${canvasViewportClass}`}>
          <canvas
            className={`${sourceImage ? "block" : "hidden"} ${darkCanvasClass} max-w-full`}
            onClick={onSourceCanvasClick}
            onMouseMove={onSourceCanvasMouseMove}
            ref={sourceCanvasRef}
          />
          {!sourceImage ? (
            <div className="absolute inset-0 grid place-items-center gap-1 p-6 text-center text-sm theme-text-muted">
              <strong className="font-serif text-[1.35rem] theme-text-primary">
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
            className={`block h-auto w-full ${darkCanvasClass}`}
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
                  className={`flex min-w-0 flex-col gap-2 border theme-bg-canvas p-2 text-left transition ${
                    selected
                      ? "theme-border-accent theme-ring-inset-accent"
                      : slotRecord
                        ? "theme-border-success theme-hover-border-info"
                        : "theme-border-panel-quiet theme-hover-border-info"
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
                      <CheckerboardFrame
                        className={`aspect-square w-full text-center text-[0.95rem] font-extrabold ${
                          selected ? "theme-text-accent" : "theme-text-inverse-soft"
                        }`}
                        size="md"
                      >
                        {describeSlot(slotKey as SlotKey)}
                      </CheckerboardFrame>
                    )}
                    <div className={`grid gap-0.5 ${selected ? "theme-text-accent" : "theme-text-inverse-soft"}`}>
                      <strong className="truncate text-xs">{describeSlot(slotKey as SlotKey)}</strong>
                      <span className={`truncate text-[10px] ${selected ? "theme-text-accent" : "theme-text-inverse-muted"}`}>
                        {slotRecord
                          ? `${slotRecord.size}px @ ${slotRecord.source_x}, ${slotRecord.source_y}`
                          : "Empty"}
                      </span>
                    </div>
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      className="grid h-6 w-6 place-items-center border theme-border-inverse-soft bg-white/8 theme-text-inverse-soft transition theme-hover-border-info hover:text-[var(--info)]"
                      onClick={() => {
                        onOpenPaintEditor(slotKey as SlotKey);
                      }}
                      title={`Edit ${describeSlot(slotKey as SlotKey)}`}
                      type="button"
                    >
                      <FontAwesomeIcon className="h-3.5 w-3.5" icon={faPenToSquare} />
                    </button>
                    <button
                      className="grid h-6 w-6 place-items-center border theme-border-inverse-soft bg-white/8 theme-text-inverse-soft transition theme-hover-border-accent theme-hover-text-accent disabled:cursor-not-allowed disabled:opacity-40"
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
            <div className="absolute inset-0 z-20 grid place-items-center border theme-border-panel-faint theme-bg-empty-state px-6 text-center">
              <div className="grid gap-2">
                <strong className="font-serif text-[1.3rem] theme-text-success">
                  Select a tile
                </strong>
                <span className="text-sm leading-6 theme-text-success-soft">
                  Choose a tile from the Tile Library before editing slots or previewing output.
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </Panel>

      {slotPendingClear && activeTile ? (
        <ConfirmationDialog
          actions={
            <>
              <button className={secondaryButtonClass} onClick={onCancelClearSlot} type="button">
                Cancel
              </button>
              <button className={destructiveButtonClass} onClick={onConfirmClearSlot} type="button">
                Clear Slot
              </button>
            </>
          }
          description={
            <>
              Remove {describeSlot(slotPendingClear)} from{" "}
              <span className="font-semibold theme-text-primary">{activeTile.slug}</span>? This only
              clears the working draft until you save the tile.
            </>
          }
          title="Clear Slot?"
        />
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
