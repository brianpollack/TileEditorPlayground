"use client";

import { memo } from "react";
import { faUpDownLeftRight } from "@awesome.me/kit-a62459359b/icons/classic/solid";

import { TILE_SIZE } from "../lib/constants";
import { actionButtonClass } from "./buttonStyles";
import { FileDropTarget } from "./FileDropTarget";
import { FontAwesomeIcon } from "./FontAwesomeIcon";
import { Panel } from "./Panel";
import { SectionEyebrow } from "./SectionEyebrow";
import {
  canvasViewportClass,
  compactTextInputClass,
  darkCanvasClass,
  readOnlyInputClass
} from "./uiStyles";
import type { SpriteRecord } from "../types";

interface SpriteEditorWorkspaceProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isMoveToolActive: boolean;
  isMoveToolDragging: boolean;
  isSaving: boolean;
  onBrowseImage(): void;
  onFileSelected(file: File): void;
  onSaveSprite(): void;
  onSourceCanvasMouseDown(event: React.MouseEvent<HTMLCanvasElement>): void;
  onSourceCanvasMouseLeave(): void;
  onSourceCanvasMouseMove(event: React.MouseEvent<HTMLCanvasElement>): void;
  onSourceCanvasMouseUp(): void;
  onSpriteBooleanChange(field: "impassible" | "is_flat", value: boolean): void;
  onSpriteNumberChange(
    field: "item_id" | "mount_x" | "mount_y" | "offset_x" | "offset_y" | "tile_h" | "tile_w",
    value: string
  ): void;
  onSpriteTextChange(field: "name", value: string): void;
  onToggleMoveTool(): void;
  sourceCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  sourceImage: HTMLImageElement | null;
  spriteRecord: SpriteRecord | null;
  statusMessage: string;
}

function SpriteEditorWorkspaceImpl({
  fileInputRef,
  isMoveToolActive,
  isMoveToolDragging,
  isSaving,
  onBrowseImage,
  onFileSelected,
  onSaveSprite,
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
  statusMessage
}: SpriteEditorWorkspaceProps) {
  const metadataFieldClass = `${compactTextInputClass} w-full max-w-[200px]`;
  const readOnlyMetadataFieldClass = `${metadataFieldClass} ${readOnlyInputClass}`;

  return (
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
            disabled={!spriteRecord || isSaving}
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm theme-text-muted">
                    <span>Filename</span>
                    <input className={readOnlyMetadataFieldClass} readOnly value={spriteRecord.filename} />
                  </label>
                  <label className="grid gap-1 text-sm theme-text-muted">
                    <span>Image Width</span>
                    <input className={readOnlyMetadataFieldClass} readOnly value={String(spriteRecord.image_w)} />
                  </label>
                  <label className="grid gap-1 text-sm theme-text-muted">
                    <span>Image Height</span>
                    <input className={readOnlyMetadataFieldClass} readOnly value={String(spriteRecord.image_h)} />
                  </label>
                </div>
              </div>

              <div className="grid content-start gap-3">
                <SectionEyebrow>Editable</SectionEyebrow>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm theme-text-muted">
                    <span>Name</span>
                    <input
                      className={metadataFieldClass}
                      onChange={(event) => {
                        onSpriteTextChange("name", event.currentTarget.value);
                      }}
                      value={spriteRecord.name}
                    />
                  </label>
                  <label className="grid gap-1 text-sm theme-text-muted">
                    <span>Tile Width</span>
                    <input
                      className={metadataFieldClass}
                      onChange={(event) => {
                        onSpriteNumberChange("tile_w", event.currentTarget.value);
                      }}
                      type="number"
                      value={String(spriteRecord.tile_w)}
                    />
                  </label>
                  <label className="grid gap-1 text-sm theme-text-muted">
                    <span>Tile Height</span>
                    <input
                      className={metadataFieldClass}
                      onChange={(event) => {
                        onSpriteNumberChange("tile_h", event.currentTarget.value);
                      }}
                      type="number"
                      value={String(spriteRecord.tile_h)}
                    />
                  </label>
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
                  <label className="grid gap-1 text-sm theme-text-muted">
                    <span>Mount X</span>
                    <input
                      className={metadataFieldClass}
                      onChange={(event) => {
                        onSpriteNumberChange("mount_x", event.currentTarget.value);
                      }}
                      type="number"
                      value={String(spriteRecord.mount_x)}
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
                      value={String(spriteRecord.mount_y)}
                    />
                  </label>
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
                      checked={spriteRecord.impassible}
                      onChange={(event) => {
                        onSpriteBooleanChange("impassible", event.currentTarget.checked);
                      }}
                      type="checkbox"
                    />
                    Impassible
                  </label>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

export const SpriteEditorWorkspace = memo(
  SpriteEditorWorkspaceImpl,
  (prev, next) =>
    prev.isSaving === next.isSaving &&
    prev.sourceImage === next.sourceImage &&
    prev.spriteRecord === next.spriteRecord &&
    prev.statusMessage === next.statusMessage
);
