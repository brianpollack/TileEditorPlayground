"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { faCopy, faUpDownLeftRight } from "@awesome.me/kit-a62459359b/icons/classic/solid";

import { readCursorAssetsAction } from "../actions/cursorActions";
import { TILE_SIZE } from "../lib/constants";
import { actionButtonClass } from "./buttonStyles";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { FileDropTarget } from "./FileDropTarget";
import { FontAwesomeIcon } from "./FontAwesomeIcon";
import { Panel } from "./Panel";
import { SectionEyebrow } from "./SectionEyebrow";
import {
  canvasViewportClass,
  compactTextInputClass,
  darkCanvasClass
} from "./uiStyles";
import type { CursorAssetRecord, SpriteRecord, SpriteStateRecord } from "../types";

const SPRITE_AUTO_LAYOUT_Y_OFFSET = 64;

function createCursorCssValue(cursorUrl: string) {
  return cursorUrl ? `url("${cursorUrl}") 0 0, auto` : "auto";
}

function getCursorFileName(cursorValue: string) {
  const trimmedValue = cursorValue.trim();
  const lastSlashIndex = trimmedValue.lastIndexOf("/");

  return lastSlashIndex === -1 ? trimmedValue : trimmedValue.slice(lastSlashIndex + 1);
}

interface SpriteEditorWorkspaceProps {
  activeSpriteStateId: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isMoveToolActive: boolean;
  isMoveToolDragging: boolean;
  isSaving: boolean;
  onAutoLayout(): void;
  onBrowseImage(): void;
  onCreateSpriteState(stateName: string): Promise<void>;
  onEditEvents(): void;
  onFileSelected(file: File): void;
  onSaveSprite(): void;
  onSelectSpriteState(stateId: string): void;
  onSourceCanvasMouseDown(event: React.MouseEvent<HTMLCanvasElement>): void;
  onSourceCanvasMouseLeave(): void;
  onSourceCanvasMouseMove(event: React.MouseEvent<HTMLCanvasElement>): void;
  onSourceCanvasMouseUp(): void;
  onSpriteBooleanChange(field: "casts_shadow" | "impassible" | "is_flat" | "is_locked", value: boolean): void;
  onSpriteNumberChange(
    field: "item_id" | "mount_x" | "mount_y" | "offset_x" | "offset_y" | "tile_h" | "tile_w",
    value: string
  ): void;
  onSpriteTextChange(field: "mouseover_cursor" | "name", value: string): void;
  onToggleMoveTool(): void;
  sourceCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  sourceImage: HTMLImageElement | null;
  spriteRecord: SpriteRecord | null;
  spriteStates: SpriteStateRecord[];
  statusMessage: string;
}

function SpriteEditorWorkspaceImpl({
  activeSpriteStateId,
  fileInputRef,
  isMoveToolActive,
  isMoveToolDragging,
  isSaving,
  onAutoLayout,
  onBrowseImage,
  onCreateSpriteState,
  onEditEvents,
  onFileSelected,
  onSaveSprite,
  onSelectSpriteState,
  onSourceCanvasMouseDown,
  onSourceCanvasMouseLeave,
  onSourceCanvasMouseMove,
  onSourceCanvasMouseUp,
  onSpriteBooleanChange,
  onSpriteNumberChange,
  onSpriteTextChange,
  onToggleMoveTool,
  sourceCanvasRef,
  sourceImage,
  spriteRecord,
  spriteStates,
  statusMessage
}: SpriteEditorWorkspaceProps) {
  const [cursorAssets, setCursorAssets] = useState<CursorAssetRecord[]>([]);
  const [cursorAssetsStatus, setCursorAssetsStatus] = useState("");
  const [hasCopiedSpriteId, setHasCopiedSpriteId] = useState(false);
  const [isNewStateDialogOpen, setNewStateDialogOpen] = useState(false);
  const [isNewStateSaving, setNewStateSaving] = useState(false);
  const [newStateError, setNewStateError] = useState("");
  const [newStateName, setNewStateName] = useState("");
  const metadataFieldClass = `${compactTextInputClass} w-full max-w-[200px]`;
  const roundedTileWidth = spriteRecord ? Math.ceil(spriteRecord.tile_w) : 0;
  const roundedTileHeight = spriteRecord ? Math.ceil(spriteRecord.tile_h) : 0;
  const selectedCursor = getCursorFileName(spriteRecord?.mouseover_cursor ?? "");
  const selectedCursorAsset = useMemo(
    () => cursorAssets.find((cursorAsset) => cursorAsset.fileName === selectedCursor) ?? null,
    [cursorAssets, selectedCursor]
  );
  const cursorSelectAssets =
    selectedCursor && !selectedCursorAsset
      ? [
          {
            fileName: selectedCursor,
            label: `Current (${selectedCursor})`,
            url: ""
          },
          ...cursorAssets
        ]
      : cursorAssets;
  const selectedCursorUrl = selectedCursorAsset?.url ?? "";
  const spriteStateTabs = useMemo(() => {
    const stateIds = ["default"];
    const seenStateIds = new Set(stateIds);

    spriteStates.forEach((spriteState) => {
      const stateId = spriteState.state_id.trim();

      if (stateId && !seenStateIds.has(stateId)) {
        stateIds.push(stateId);
        seenStateIds.add(stateId);
      }
    });

    return stateIds;
  }, [spriteStates]);

  useEffect(() => {
    let isCancelled = false;

    void readCursorAssetsAction()
      .then((assets) => {
        if (isCancelled) {
          return;
        }

        setCursorAssets(assets);
        setCursorAssetsStatus("");
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setCursorAssetsStatus(error instanceof Error ? error.message : "Could not load cursors.");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    setHasCopiedSpriteId(false);
  }, [spriteRecord?.id]);

  function copySpriteIdToClipboard() {
    const spriteId = spriteRecord?.id.trim();

    if (!spriteId || !navigator.clipboard?.writeText) {
      return;
    }

    void navigator.clipboard.writeText(spriteId).then(() => {
      setHasCopiedSpriteId(true);
      window.setTimeout(() => {
        setHasCopiedSpriteId(false);
      }, 1500);
    });
  }

  async function submitNewSpriteState() {
    setNewStateError("");
    setNewStateSaving(true);

    try {
      await onCreateSpriteState(newStateName);
      setNewStateName("");
      setNewStateDialogOpen(false);
    } catch (error: unknown) {
      setNewStateError(error instanceof Error ? error.message : "Could not create sprite state.");
    } finally {
      setNewStateSaving(false);
    }
  }

  return (
    <>
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
            <button
              className={actionButtonClass}
              disabled={!spriteRecord || isSaving || activeSpriteStateId !== "default"}
              onClick={onSaveSprite}
              type="button"
            >
              {isSaving ? "Saving..." : "Save Sprite"}
            </button>
            <input
              accept="image/png,.png"
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
        <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b theme-border-panel-soft">
          <div aria-label="Sprite states" className="flex min-w-0 flex-wrap items-center gap-1" role="tablist">
            {spriteStateTabs.map((stateId) => {
              const isActive = activeSpriteStateId === stateId;

              return (
                <button
                  aria-selected={isActive}
                  className={`min-h-9 border-b-2 px-3 text-sm font-semibold transition ${
                    isActive
                      ? "theme-border-brand theme-text-primary"
                      : "border-transparent theme-text-muted hover:theme-text-primary"
                  }`}
                  key={stateId}
                  onClick={() => {
                    onSelectSpriteState(stateId);
                  }}
                  role="tab"
                  type="button"
                >
                  {stateId}
                </button>
              );
            })}
          </div>
          <button
            className="min-h-9 rounded-[4px] border theme-border-panel theme-bg-input px-3 text-sm font-semibold theme-text-primary transition theme-hover-bg-panel disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!spriteRecord}
            onClick={() => {
              setNewStateError("");
              setNewStateName("");
              setNewStateDialogOpen(true);
            }}
            type="button"
          >
            + new
          </button>
        </div>
        <div className={`relative flex min-h-[24rem] items-center justify-center ${canvasViewportClass}`}>
          <button
            className={`absolute left-3 top-3 z-10 min-h-10 rounded-[4px] border px-3 py-2 text-sm font-semibold transition ${
              isMoveToolActive
                ? "theme-border-brand theme-bg-brand theme-text-inverse"
                : "theme-border-panel theme-bg-input theme-text-primary theme-hover-bg-panel"
            }`}
            disabled={!spriteRecord}
            onClick={onToggleMoveTool}
            type="button"
          >
            <span className="flex items-center gap-2">
              <FontAwesomeIcon className="h-4 w-4" icon={faUpDownLeftRight} />
              Sprite Move
            </span>
          </button>
          <canvas
            className={`${sourceImage ? "block" : "hidden"} ${darkCanvasClass} max-w-full ${
              isMoveToolDragging ? "cursor-grabbing" : isMoveToolActive ? "cursor-move" : "cursor-default"
            }`}
            onMouseDown={onSourceCanvasMouseDown}
            onMouseLeave={onSourceCanvasMouseLeave}
            onMouseMove={onSourceCanvasMouseMove}
            onMouseUp={onSourceCanvasMouseUp}
            ref={sourceCanvasRef}
          />
          {!sourceImage ? (
            <div className="absolute inset-0 grid place-items-center gap-1 p-6 text-center text-sm theme-text-muted">
              <strong className="font-serif text-[1.35rem] theme-text-primary">
                Sprite image goes here
              </strong>
              <span>Use Browse Image or drop a replacement image from Finder.</span>
            </div>
          ) : null}
        </div>

        {statusMessage ? <div className="text-sm theme-text-muted">{statusMessage}</div> : null}

        {spriteRecord ? (
          <div className="grid gap-4 border theme-border-panel-soft theme-bg-input p-4">
            <div className="grid gap-1">
              <strong className="text-sm theme-text-primary">Sprite Metadata</strong>
              <span className="text-xs theme-text-muted">
                The image is shown with a {TILE_SIZE}x{TILE_SIZE} grid overlay at 25% opacity.
              </span>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="grid content-start gap-3">
                <SectionEyebrow>Read Only</SectionEyebrow>
                <div className="grid gap-3">
                  <div className="grid gap-1 text-sm theme-text-muted">
                    <span>Sprite ID</span>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1 break-all font-mono text-sm leading-7 theme-text-primary">
                        {spriteRecord.id || "Not saved"}
                      </div>
                      <button
                        aria-label="Copy Sprite ID"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-[4px] border theme-border-panel theme-bg-input theme-text-muted transition theme-hover-bg-panel hover:theme-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!spriteRecord.id}
                        onClick={copySpriteIdToClipboard}
                        title={hasCopiedSpriteId ? "Copied" : "Copy Sprite ID"}
                        type="button"
                      >
                        <FontAwesomeIcon className="h-3.5 w-3.5" icon={faCopy} />
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-1 text-sm theme-text-muted">
                    <span>Filename</span>
                    <div className="break-all text-sm leading-6 theme-text-primary">
                      {spriteRecord.filename}
                    </div>
                  </div>
                  <div className="grid gap-1 text-sm theme-text-muted">
                    <span>Image Size</span>
                    <div className="text-sm leading-6 theme-text-primary">
                      {spriteRecord.image_w} x {spriteRecord.image_h}
                    </div>
                  </div>
                  <div className="grid gap-1 text-sm theme-text-muted">
                    <span>Name</span>
                    <div className="text-sm leading-6 theme-text-primary">
                      {spriteRecord.name}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1 text-sm theme-text-muted">
                      <span>Tile Width</span>
                      <div className="text-sm leading-6 theme-text-primary">
                        {roundedTileWidth}
                      </div>
                    </div>
                    <div className="grid gap-1 text-sm theme-text-muted">
                      <span>Tile Height</span>
                      <div className="text-sm leading-6 theme-text-primary">
                        {roundedTileHeight}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-1 text-sm theme-text-muted">
                    <span>Bounding Box</span>
                    <div className="text-sm leading-6 theme-text-primary">
                      {spriteRecord.bounding_x}, {spriteRecord.bounding_y}, {spriteRecord.bounding_w}, {spriteRecord.bounding_h}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid content-start gap-3">
                <SectionEyebrow>Editable</SectionEyebrow>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm theme-text-muted">
                    <span>Item ID</span>
                    <input
                      className={metadataFieldClass}
                      onChange={(event) => {
                        onSpriteNumberChange("item_id", event.currentTarget.value);
                      }}
                      type="number"
                      value={String(spriteRecord.item_id)}
                    />
                  </label>
                  <div />
                  <div className="grid gap-3 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                    <label className="grid gap-1 text-sm theme-text-muted">
                      <span>Offset X</span>
                      <input
                        className={metadataFieldClass}
                        onChange={(event) => {
                          onSpriteNumberChange("offset_x", event.currentTarget.value);
                        }}
                        type="number"
                        value={String(spriteRecord.offset_x)}
                      />
                    </label>
                    <label className="grid gap-1 text-sm theme-text-muted">
                      <span>Offset Y</span>
                      <input
                        className={metadataFieldClass}
                        onChange={(event) => {
                          onSpriteNumberChange("offset_y", event.currentTarget.value);
                        }}
                        type="number"
                        value={String(spriteRecord.offset_y)}
                      />
                    </label>
                    <span
                      aria-hidden="true"
                      className={`${actionButtonClass} invisible w-fit`}
                    >
                      Auto Layout
                    </span>
                  </div>
                  <div className="grid gap-3 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                    <label className="grid gap-1 text-sm theme-text-muted">
                      <span>Mount X</span>
                      <input
                        className={metadataFieldClass}
                        onChange={(event) => {
                          onSpriteNumberChange("mount_x", event.currentTarget.value);
                        }}
                        type="number"
                        value={String(Math.trunc(spriteRecord.mount_x))}
                      />
                    </label>
                    <label className="grid gap-1 text-sm theme-text-muted">
                      <span>Mount Y</span>
                      <input
                        className={metadataFieldClass}
                        onChange={(event) => {
                          onSpriteNumberChange("mount_y", event.currentTarget.value);
                        }}
                        type="number"
                        value={String(Math.trunc(spriteRecord.mount_y))}
                      />
                    </label>
                    <button
                      className={`${actionButtonClass} w-fit`}
                      onClick={onAutoLayout}
                      type="button"
                    >
                      Auto Layout
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-5 pt-1">
                  <label className="flex items-center gap-2 text-sm theme-text-muted">
                    <input
                      checked={spriteRecord.is_flat}
                      onChange={(event) => {
                        onSpriteBooleanChange("is_flat", event.currentTarget.checked);
                      }}
                      type="checkbox"
                    />
                    Flat
                  </label>
                  <label className="flex items-center gap-2 text-sm theme-text-muted">
                    <input
                      checked={spriteRecord.casts_shadow}
                      onChange={(event) => {
                        onSpriteBooleanChange("casts_shadow", event.currentTarget.checked);
                      }}
                      type="checkbox"
                    />
                    Casts Shadow
                  </label>
                  <label className="flex items-center gap-2 text-sm theme-text-muted">
                    <input
                      checked={spriteRecord.impassible}
                      onChange={(event) => {
                        onSpriteBooleanChange("impassible", event.currentTarget.checked);
                      }}
                      type="checkbox"
                    />
                    Impassible
                  </label>
                  <label className="flex items-center gap-2 text-sm theme-text-muted">
                    <input
                      checked={spriteRecord.is_locked}
                      onChange={(event) => {
                        onSpriteBooleanChange("is_locked", event.currentTarget.checked);
                      }}
                      type="checkbox"
                    />
                    Locked
                  </label>
                </div>

                <div className="grid gap-2 pt-1">
                  <label className="grid gap-1 text-sm theme-text-muted">
                    <span>Mouseover Cursor</span>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_4.5rem] sm:items-end">
                      <select
                        className={compactTextInputClass}
                        onChange={(event) => {
                          onSpriteTextChange("mouseover_cursor", event.currentTarget.value);
                        }}
                        value={selectedCursor}
                      >
                        <option value="">Default cursor</option>
                        {cursorSelectAssets.map((cursorAsset) => (
                          <option key={`${cursorAsset.fileName}:${cursorAsset.url}`} value={cursorAsset.fileName}>
                            {cursorAsset.label}
                          </option>
                        ))}
                      </select>
                      <div
                        className="grid h-[4.5rem] w-[4.5rem] place-items-center border theme-border-panel theme-bg-panel"
                        style={{
                          cursor: createCursorCssValue(selectedCursorUrl)
                        }}
                        title={selectedCursor || "Default cursor"}
                      >
                        {selectedCursorUrl ? (
                          <img
                            alt=""
                            className="max-h-10 max-w-10 object-contain"
                            src={selectedCursorUrl}
                          />
                        ) : (
                          <span className="text-xs theme-text-muted">Auto</span>
                        )}
                      </div>
                    </div>
                  </label>
                  {cursorAssetsStatus ? <div className="text-sm text-[#b42318]">{cursorAssetsStatus}</div> : null}
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <SectionEyebrow>Events</SectionEyebrow>
              <div className="flex justify-end">
                <button
                  className={actionButtonClass}
                  onClick={onEditEvents}
                  type="button"
                >
                  Add / Edit Events
                </button>
              </div>
            </div>
          </div>
        ) : null}
        </div>
      </Panel>
      {isNewStateDialogOpen ? (
        <ConfirmationDialog
          actions={
            <>
              <button
                className="min-h-10 rounded-[4px] border theme-border-panel theme-bg-input px-4 py-2 text-sm font-semibold theme-text-primary transition theme-hover-bg-panel"
                disabled={isNewStateSaving}
                onClick={() => {
                  setNewStateDialogOpen(false);
                  setNewStateError("");
                  setNewStateName("");
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className={actionButtonClass}
                disabled={isNewStateSaving || !newStateName.trim()}
                onClick={() => {
                  void submitNewSpriteState();
                }}
                type="button"
              >
                {isNewStateSaving ? "Creating..." : "Create"}
              </button>
            </>
          }
          title="New Sprite State"
        >
          <label className="grid gap-1 text-sm theme-text-muted">
            <span>State Name</span>
            <input
              autoFocus
              className={compactTextInputClass}
              onChange={(event) => {
                setNewStateName(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && newStateName.trim()) {
                  event.preventDefault();
                  void submitNewSpriteState();
                }
              }}
              placeholder="unlocked"
              value={newStateName}
            />
          </label>
          {newStateError ? <div className="text-sm text-[#b42318]">{newStateError}</div> : null}
        </ConfirmationDialog>
      ) : null}
    </>
  );
}

export const SpriteEditorWorkspace = memo(
  SpriteEditorWorkspaceImpl,
  (prev, next) =>
    prev.isSaving === next.isSaving &&
    prev.activeSpriteStateId === next.activeSpriteStateId &&
    prev.sourceImage === next.sourceImage &&
    prev.spriteRecord === next.spriteRecord &&
    prev.spriteStates === next.spriteStates &&
    prev.statusMessage === next.statusMessage
);
