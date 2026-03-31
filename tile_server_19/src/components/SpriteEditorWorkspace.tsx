"use client";

import { memo, useState } from "react";
import { faUpDownLeftRight } from "@awesome.me/kit-a62459359b/icons/classic/solid";

import { TILE_SIZE } from "../lib/constants";
import { actionButtonClass } from "./buttonStyles";
import { FontAwesomeIcon } from "./FontAwesomeIcon";
import { Panel } from "./Panel";
import {
  canvasViewportClass,
  compactTextInputClass
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
                ? "border-[#16324f] bg-[#16324f] text-white"
                : "border-[#c3d0cb] bg-white/94 text-[#142127] hover:bg-white"
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
            className={`${sourceImage ? "block" : "hidden"} max-w-full [image-rendering:pixelated] ${
              isMoveToolDragging ? "cursor-grabbing" : isMoveToolActive ? "cursor-move" : "cursor-default"
            }`}
            onMouseDown={onSourceCanvasMouseDown}
            onMouseLeave={onSourceCanvasMouseLeave}
            onMouseMove={onSourceCanvasMouseMove}
            onMouseUp={onSourceCanvasMouseUp}
            ref={sourceCanvasRef}
          />
          {!sourceImage ? (
            <div className="absolute inset-0 grid place-items-center gap-1 p-6 text-center text-sm text-[#4a6069]">
              <strong className="font-serif text-[1.35rem] text-[#142127]">
                Sprite image goes here
              </strong>
              <span>Use Browse Image or drop a replacement image from Finder.</span>
            </div>
          ) : null}
        </div>

        {statusMessage ? <div className="text-sm text-[#4a6069]">{statusMessage}</div> : null}

        {spriteRecord ? (
          <div className="grid gap-4 border border-[#c3d0cb]/75 bg-white/88 p-4">
            <div className="grid gap-1">
              <strong className="text-sm text-[#142127]">Sprite Metadata</strong>
              <span className="text-xs text-[#4a6069]">
                The image is shown with a {TILE_SIZE}x{TILE_SIZE} grid overlay at 25% opacity.
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="grid gap-1 text-sm text-[#4a6069]">
                <span>Filename</span>
                <input className={`${compactTextInputClass} bg-[#e6e8e7] text-[#5d6a65]`} readOnly value={spriteRecord.filename} />
              </label>
              <label className="grid gap-1 text-sm text-[#4a6069]">
                <span>Image Width</span>
                <input className={`${compactTextInputClass} bg-[#e6e8e7] text-[#5d6a65]`} readOnly value={String(spriteRecord.image_w)} />
              </label>
              <label className="grid gap-1 text-sm text-[#4a6069]">
                <span>Image Height</span>
                <input className={`${compactTextInputClass} bg-[#e6e8e7] text-[#5d6a65]`} readOnly value={String(spriteRecord.image_h)} />
              </label>
              <label className="grid gap-1 text-sm text-[#4a6069] md:col-span-2 xl:col-span-1">
                <span>Name</span>
                <input
                  className={compactTextInputClass}
                  onChange={(event) => {
                    onSpriteTextChange("name", event.currentTarget.value);
                  }}
                  value={spriteRecord.name}
                />
              </label>
              <label className="grid gap-1 text-sm text-[#4a6069]">
                <span>Tile Width</span>
                <input
                  className={compactTextInputClass}
                  onChange={(event) => {
                    onSpriteNumberChange("tile_w", event.currentTarget.value);
                  }}
                  type="number"
                  value={String(spriteRecord.tile_w)}
                />
              </label>
              <label className="grid gap-1 text-sm text-[#4a6069]">
                <span>Tile Height</span>
                <input
                  className={compactTextInputClass}
                  onChange={(event) => {
                    onSpriteNumberChange("tile_h", event.currentTarget.value);
                  }}
                  type="number"
                  value={String(spriteRecord.tile_h)}
                />
              </label>
              <label className="grid gap-1 text-sm text-[#4a6069]">
                <span>Item ID</span>
                <input
                  className={compactTextInputClass}
                  onChange={(event) => {
                    onSpriteNumberChange("item_id", event.currentTarget.value);
                  }}
                  type="number"
                  value={String(spriteRecord.item_id)}
                />
              </label>
              <label className="grid gap-1 text-sm text-[#4a6069]">
                <span>Offset X</span>
                <input
                  className={compactTextInputClass}
                  onChange={(event) => {
                    onSpriteNumberChange("offset_x", event.currentTarget.value);
                  }}
                  type="number"
                  value={String(spriteRecord.offset_x)}
                />
              </label>
              <label className="grid gap-1 text-sm text-[#4a6069]">
                <span>Offset Y</span>
                <input
                  className={compactTextInputClass}
                  onChange={(event) => {
                    onSpriteNumberChange("offset_y", event.currentTarget.value);
                  }}
                  type="number"
                  value={String(spriteRecord.offset_y)}
                />
              </label>
              <label className="grid gap-1 text-sm text-[#4a6069]">
                <span>Mount X</span>
                <input
                  className={compactTextInputClass}
                  onChange={(event) => {
                    onSpriteNumberChange("mount_x", event.currentTarget.value);
                  }}
                  type="number"
                  value={String(spriteRecord.mount_x)}
                />
              </label>
              <label className="grid gap-1 text-sm text-[#4a6069]">
                <span>Mount Y</span>
                <input
                  className={compactTextInputClass}
                  onChange={(event) => {
                    onSpriteNumberChange("mount_y", event.currentTarget.value);
                  }}
                  type="number"
                  value={String(spriteRecord.mount_y)}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-5">
              <label className="flex items-center gap-2 text-sm text-[#4a6069]">
                <input
                  checked={spriteRecord.is_flat}
                  onChange={(event) => {
                    onSpriteBooleanChange("is_flat", event.currentTarget.checked);
                  }}
                  type="checkbox"
                />
                Flat
              </label>
              <label className="flex items-center gap-2 text-sm text-[#4a6069]">
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
