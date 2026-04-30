"use client";

import {
  memo,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useTransition
} from "react";
import type { Ace } from "ace-builds";
import AceEditor from "react-ace";
import "ace-builds/src-noconflict/mode-lua";
import "ace-builds/src-noconflict/theme-tomorrow_night";
import {
  faChevronRight,
  faEraser,
  faEye,
  faEyeDropper,
  faEyeSlash,
  faFolderArrowUp,
  faFolder,
  faPenToSquare,
  faTrashCan
} from "@awesome.me/kit-a62459359b/icons/classic/solid";

import {
  prepareMapAiRunAction,
  runMapAiModelAction
} from "../actions/mapAiActions";
import {
  createMapZoneEventAction,
  createMapAction,
  exportTerrainMapAction,
  readMapZoneEventsAction,
  resizeMapAction,
  saveMapZoneEventAction,
  saveMapAction
} from "../actions/mapActions";
import { useStudio } from "../app/StudioContext";
import {
  MAP_DEFAULT_GRID_SIZE,
  MAP_LAYER_COUNT,
  MAP_MAX_SCALE_PERCENT,
  MAP_MIN_SCALE_PERCENT,
  MAP_SCALE_STEP_PERCENT,
  TILE_SIZE
} from "../lib/constants";
import {
  MAP_AI_SUPPORTED_MODELS,
  type MapAiSelectionSummary
} from "../lib/mapAi";
import {
  clampMapScalePercent,
  createEmptyMapCells,
  createEmptyMapLayers,
  createMapSpritePlacement,
  createMapTilePlacement,
  describeMapTileOptions,
  drawMapTileFallback,
  getAutoFitMapScalePercent,
  getMapCanvasHeight,
  getMapCanvasWidth,
  getMapCellFromPointerEvent,
  getMapLayerDimensions,
  isMapSpritePlacement,
  isMapTilePlacement,
  normalizeMapLayers,
  normalizeMapDimension,
  normalizeMapTileOptions,
  resizeMapLayersExpandingEdges,
  serializeMapTileOptionsKey
} from "../lib/map";
import {
  createLuaErrorAnnotations,
  formatLuaScript,
  openLuaScriptingGuide,
  validateLuaScript
} from "../lib/luaEditor";
import {
  useLuaAceSupport,
  useLuaEventDefinitions
} from "../lib/luaApiHelper";
import {
  createLuaEventDraft,
  mergeLuaEventOptions,
  sortLuaEvents,
  type LuaEventDraftState,
  type LuaEventOption
} from "../lib/luaEventHelpers";
import { normalizeUnderscoreName } from "../lib/naming";
import { describeSlot, sanitizeSlotRecord, type SlotKey } from "../lib/slots";
import {
  formatTileLibraryPath,
  getTileLibraryParentPath,
  getTileLibrarySegmentLabel,
  getTileLibrarySpriteKey,
  normalizeTileLibraryPath,
  splitTileLibraryPath,
  TILE_LIBRARY_LAYERS
} from "../lib/tileLibrary";
import { useImageCache } from "../lib/useImageCache";
import { actionButtonClass } from "./buttonStyles";
import { CheckerboardFrame } from "./CheckerboardFrame";
import { FontAwesomeIcon } from "./FontAwesomeIcon";
import { LuaEventDefinitionHelp } from "./LuaEventDefinitionHelp";
import { Panel } from "./Panel";
import { SectionEyebrow } from "./SectionEyebrow";
import {
  assetListActionButtonClass,
  assetListCheckerThumbClass,
  assetListEyebrowClass,
  assetListMetaClass,
  assetListMonoClass,
  assetListRowClass,
  assetListSubtitleClass,
  assetListThumbClass,
  assetListTitleClass,
  compactBrushEffectsClass,
  canvasViewportClass,
  closeButtonClass,
  compactTextInputClass,
  emptyStateCardClass,
  gridVisibilitySwitchClass,
  gridVisibilitySwitchInputClass,
  gridVisibilitySwitchLabelClass,
  gridVisibilitySwitchTrackClass,
  iconButtonClass,
  modalSurfaceClass,
  panelTabButtonClass,
  previewSelectionButtonClass,
  sectionCardClass,
  secondaryButtonClass,
  selectablePanelClass,
  scrollableAssetListClass,
  statusChipClass,
  smoothPreviewCanvasClass,
  textInputClass,
  visibilityOptionButtonClass,
  zoomButtonClass
} from "./uiStyles";
import type {
  MapAssetPlacement,
  MapLayerStack,
  MapTileOptions,
  SpriteRecord,
  TileCell,
  TileRecord,
  ZoneEventRecord
} from "../types";

const MAP_PREVIEW_SIZE = 128;
const MAP_MINI_MAP_MAX_SIZE = 512;
const AI_PREVIEW_SIZE = 1024;
const VISIBILITY_OPTIONS = [
  { label: "Hide", value: 0 },
  { label: "20%", value: 0.2 },
  { label: "50%", value: 0.5 },
  { label: "100%", value: 1 }
] as const;
const AI_TOOL_OPTIONS = [
  {
    description: "Add clicked tiles to the current AI mask.",
    id: "mask",
    label: "Mask"
  },
  {
    description: "Remove clicked tiles from the current AI mask.",
    id: "erase",
    label: "Erase"
  },
  {
    description: "Drag across the canvas to prepare the AI image and edit mask.",
    id: "select",
    label: "Select"
  }
] as const;
const BRUSH_OPTION_DEFINITIONS = [
  { id: "flipHorizontal", label: "Flip Horizontal" },
  { id: "flipVertical", label: "Flip Vertical" },
  { id: "rotate90", label: "Rotate 90" },
  { id: "rotate180", label: "Rotate 180" },
  { id: "rotate270", label: "Rotate 270" },
  { id: "multiply", label: "Multiply" },
  { id: "color", label: "Color" }
] as const;
const DEFAULT_MAP_BRUSH_OPTIONS = normalizeMapTileOptions(undefined);
type MapAiTool = (typeof AI_TOOL_OPTIONS)[number]["id"];
type MapSidebarTab = "ai" | "brushes" | "events";

interface MapAiSelection {
  bottomTileY: number;
  leftTileX: number;
  pixelHeight: number;
  pixelWidth: number;
  rightTileX: number;
  tileHeight: number;
  tileWidth: number;
  topTileY: number;
}

interface MapAiModelStatus {
  detail: string;
  modelId: string;
  modelLabel: string;
  requestId: string;
  status: "error" | "idle" | "running" | "skipped" | "success";
}

interface MapAiPreviewSnapshot {
  assetImageUrls: string[];
  layerVisibilities: number[];
  layers: MapLayerStack;
  maskedCells: Set<string>;
  selection: MapAiSelection;
}

interface MapWorkspaceProps {
  activeLayerIndex: number;
  activeModeLabel: string;
  activeMapAboutPrompt: string;
  activeSidebarTab: MapSidebarTab;
  activeAiTool: MapAiTool;
  activeBrushSlotNum: number;
  activeLayerTitle: string;
  activeOpacityValue: number;
  brushSlotOptions: Array<{
    label: string;
    previewUrl: string;
    slotNum: number;
  }>;
  canZoomIn: boolean;
  canZoomOut: boolean;
  hoverCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  isGridVisible: boolean;
  layerPreviewCanvasRefs: React.MutableRefObject<Array<HTMLCanvasElement | null>>;
  layerVisibilities: number[];
  mapCanvasHeight: number;
  mapCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  mapCanvasWidth: number;
  mapCursorClassName: string;
  mapFrameRef: React.RefObject<HTMLDivElement | null>;
  onCanvasClick(event: React.MouseEvent<HTMLCanvasElement>): void;
  onCanvasMouseDown(event: React.MouseEvent<HTMLCanvasElement>): void;
  onCanvasMouseLeave(): void;
  onCanvasMouseMove(event: React.MouseEvent<HTMLCanvasElement>): void;
  onCanvasMouseUp(): void;
  onChangeActiveMapAboutPrompt(value: string): void;
  onClearAllLayers(): void;
  onClearLayer(layerIndex: number): void;
  onSelectBrushSlot(slotNum: number): void;
  onSelectLayer(layerIndex: number): void;
  onSetLayerVisibility(layerIndex: number, visibility: number): void;
  onToggleGridVisibility(): void;
  onZoomActual(): void;
  onZoomIn(): void;
  onZoomOut(): void;
  previewCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  scalePercent: number;
  selectedBrushLabel: string;
}

const MapWorkspace = memo(function MapWorkspace({
  activeLayerIndex,
  activeModeLabel,
  activeMapAboutPrompt,
  activeSidebarTab,
  activeAiTool,
  activeBrushSlotNum,
  activeLayerTitle,
  activeOpacityValue,
  brushSlotOptions,
  canZoomIn,
  canZoomOut,
  hoverCanvasRef,
  isGridVisible,
  layerPreviewCanvasRefs,
  layerVisibilities,
  mapCanvasHeight,
  mapCanvasRef,
  mapCanvasWidth,
  mapCursorClassName,
  mapFrameRef,
  onCanvasClick,
  onCanvasMouseDown,
  onCanvasMouseLeave,
  onCanvasMouseMove,
  onCanvasMouseUp,
  onChangeActiveMapAboutPrompt,
  onClearAllLayers,
  onClearLayer,
  onSelectBrushSlot,
  onSelectLayer,
  onSetLayerVisibility,
  onToggleGridVisibility,
  onZoomActual,
  onZoomIn,
  onZoomOut,
  previewCanvasRef,
  scalePercent,
  selectedBrushLabel
}: MapWorkspaceProps) {
  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="grid min-h-0 content-start gap-3">
        <div
          className={`${canvasViewportClass} h-[clamp(28rem,70vh,58rem)] p-4`}
          ref={mapFrameRef}
        >
          <div className="relative inline-block">
            <canvas
              className={`block max-h-none max-w-none bg-white/82 [image-rendering:pixelated] ${mapCursorClassName}`}
              height={mapCanvasHeight}
              onClick={onCanvasClick}
              onMouseDown={onCanvasMouseDown}
              onMouseLeave={onCanvasMouseLeave}
              onMouseMove={onCanvasMouseMove}
              onMouseUp={onCanvasMouseUp}
              ref={mapCanvasRef}
              width={mapCanvasWidth}
            />
            <canvas
              className="pointer-events-none absolute inset-0 h-full w-full [image-rendering:pixelated]"
              height={mapCanvasHeight}
              ref={hoverCanvasRef}
              width={mapCanvasWidth}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className={gridVisibilitySwitchClass}>
            <input
              checked={isGridVisible}
              className={gridVisibilitySwitchInputClass}
              onChange={onToggleGridVisibility}
              type="checkbox"
            />
            <div className={gridVisibilitySwitchTrackClass} />
            <span className={gridVisibilitySwitchLabelClass(isGridVisible)}>
              Gridlines {isGridVisible ? "On" : "Off"}
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className={zoomButtonClass}
              disabled={!canZoomIn}
              onClick={onZoomOut}
              type="button"
            >
              -
            </button>
            <span className="text-sm font-medium theme-text-primary">Scale {scalePercent}%</span>
            <button
              className={zoomButtonClass}
              disabled={!canZoomOut}
              onClick={onZoomIn}
              type="button"
            >
              +
            </button>
            <button
              className={zoomButtonClass}
              onClick={onZoomActual}
              type="button"
            >
              100
            </button>
          </div>
        </div>

        <div className="grid gap-2">
          <label
            className="text-xs font-extrabold uppercase tracking-[0.12em] theme-text-muted"
            htmlFor="map-about-prompt"
          >
            About Prompt
          </label>
          <textarea
            className={`${textInputClass} min-h-28 w-full resize-y`}
            id="map-about-prompt"
            onChange={(event) => {
              onChangeActiveMapAboutPrompt(event.currentTarget.value);
            }}
            placeholder="Add background, lore, or guidance for this map..."
            value={activeMapAboutPrompt}
          />
        </div>

        {activeSidebarTab === "brushes" && brushSlotOptions.length ? (
          <div className={`${sectionCardClass} grid gap-3`}>
            <SectionEyebrow>Tile Variant</SectionEyebrow>
            <div className="flex flex-wrap gap-2">
              {brushSlotOptions.map((option) => {
                const selected = option.slotNum === activeBrushSlotNum;

                return (
                  <button
                    className={`flex min-h-11 items-center gap-2 border px-2 py-2 text-left transition ${
                      selected
                        ? "theme-border-accent theme-bg-accent-soft theme-text-primary"
                        : "theme-border-panel theme-bg-panel theme-text-muted theme-hover-border-accent theme-hover-text-primary"
                    }`}
                    key={option.slotNum}
                    onClick={() => {
                      onSelectBrushSlot(option.slotNum);
                    }}
                    type="button"
                  >
                    <CheckerboardFrame className="h-9 w-9 border theme-border-panel-faint">
                      <img
                        alt={option.label}
                        className="h-8 w-8 object-contain [image-rendering:pixelated]"
                        src={option.previewUrl}
                      />
                    </CheckerboardFrame>
                    <span className="text-sm font-medium">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid content-start gap-4">
        <div className={sectionCardClass}>
          <SectionEyebrow>Preview</SectionEyebrow>
          <canvas
            className={`${smoothPreviewCanvasClass} h-32 w-32`}
            ref={previewCanvasRef}
          />
        </div>

        {TILE_LIBRARY_LAYERS.map((layer, layerIndex) => {
          const selected = activeLayerIndex === layerIndex;

          return (
            <div
              className={selectablePanelClass(selected)}
              key={layer.folder}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  className="text-left text-xs font-extrabold uppercase tracking-[0.12em] theme-text-primary"
                  onClick={() => {
                    onSelectLayer(layerIndex);
                  }}
                  type="button"
                >
                  {layer.index} - {layer.description}
                </button>
                <button
                  className={iconButtonClass}
                  onClick={() => {
                    onClearLayer(layerIndex);
                  }}
                  title={`Clear ${layer.description}`}
                  type="button"
                >
                  <FontAwesomeIcon className="h-3.5 w-3.5" icon={faTrashCan} />
                </button>
              </div>
              <div className="flex items-start gap-2">
                <button
                  className={previewSelectionButtonClass(selected)}
                  onClick={() => {
                    onSelectLayer(layerIndex);
                  }}
                  title={`Select ${layer.description}`}
                  type="button"
                >
                  <canvas
                    className={`${smoothPreviewCanvasClass} h-32 w-32`}
                    ref={(node) => {
                      layerPreviewCanvasRefs.current[layerIndex] = node;
                    }}
                  />
                </button>
                <div className="grid min-w-0 flex-1 gap-1">
                  {VISIBILITY_OPTIONS.map((option) => {
                    const active = (layerVisibilities[layerIndex] ?? 1) === option.value;

                    return (
                      <button
                        className={visibilityOptionButtonClass(active)}
                        key={option.label}
                        onClick={() => {
                          onSetLayerVisibility(layerIndex, option.value);
                        }}
                        type="button"
                      >
                        <FontAwesomeIcon
                          className="h-3 w-3"
                          icon={option.value === 0 ? faEyeSlash : faEye}
                        />
                        <span>{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}

        <div className={sectionCardClass}>
          <SectionEyebrow>Active Layer</SectionEyebrow>
          <div className="text-sm font-semibold theme-text-primary">{activeLayerTitle}</div>
          <div className="text-xs theme-text-muted">
            Opacity {Math.round(activeOpacityValue * 100)}% • {activeModeLabel}
          </div>
          {activeSidebarTab === "ai" ? (
            <div className="text-xs theme-text-muted">
              AI tool: {AI_TOOL_OPTIONS.find((option) => option.id === activeAiTool)?.label ?? "Mask"}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button className={actionButtonClass} onClick={onClearAllLayers} type="button">
              Clear Map
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

function ensureCanvasSize(canvas: HTMLCanvasElement, width: number, height: number) {
  if (canvas.width !== width) {
    canvas.width = width;
  }

  if (canvas.height !== height) {
    canvas.height = height;
  }
}

function drawPreviewBackground(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "rgba(255,253,248,0.96)";
  context.fillRect(0, 0, width, height);
}

function getMapCellKey(tileX: number, tileY: number) {
  return `${tileX},${tileY}`;
}

function cloneMapPlacement(placement: MapAssetPlacement) {
  return placement.kind === "tile"
    ? createMapTilePlacement(placement.tileSlug, placement.options, placement.slotNum)
    : createMapSpritePlacement(placement.spriteKey);
}

function cloneMapLayers(layers: MapLayerStack): MapLayerStack {
  return layers.map((layerCells) =>
    layerCells.map((row) =>
      row.map((placement) => (placement ? cloneMapPlacement(placement) : null))
    )
  );
}

function getCellsInLine(startCell: TileCell, endCell: TileCell) {
  const cells: TileCell[] = [];
  let currentX = startCell.tileX;
  let currentY = startCell.tileY;
  const deltaX = Math.abs(endCell.tileX - startCell.tileX);
  const deltaY = Math.abs(endCell.tileY - startCell.tileY);
  const stepX = startCell.tileX < endCell.tileX ? 1 : -1;
  const stepY = startCell.tileY < endCell.tileY ? 1 : -1;
  let error = deltaX - deltaY;

  while (true) {
    cells.push({ tileX: currentX, tileY: currentY });

    if (currentX === endCell.tileX && currentY === endCell.tileY) {
      break;
    }

    const doubledError = error * 2;

    if (doubledError > -deltaY) {
      error -= deltaY;
      currentX += stepX;
    }

    if (doubledError < deltaX) {
      error += deltaX;
      currentY += stepY;
    }
  }

  return cells;
}

function getAiSelectionFromCells(anchorCell: TileCell, focusCell: TileCell): MapAiSelection {
  const leftTileX = Math.min(anchorCell.tileX, focusCell.tileX);
  const rightTileX = Math.max(anchorCell.tileX, focusCell.tileX);
  const topTileY = Math.min(anchorCell.tileY, focusCell.tileY);
  const bottomTileY = Math.max(anchorCell.tileY, focusCell.tileY);
  const tileWidth = rightTileX - leftTileX + 1;
  const tileHeight = bottomTileY - topTileY + 1;

  return {
    bottomTileY,
    leftTileX,
    pixelHeight: tileHeight * TILE_SIZE,
    pixelWidth: tileWidth * TILE_SIZE,
    rightTileX,
    tileHeight,
    tileWidth,
    topTileY
  };
}

function formatAiSelectionSize(selection: MapAiSelection | null) {
  if (!selection) {
    return "No selection";
  }

  return `${selection.pixelWidth}x${selection.pixelHeight}`;
}

function toMapAiSelectionSummary(selection: MapAiSelection | null): MapAiSelectionSummary | null {
  if (!selection) {
    return null;
  }

  return {
    pixelHeight: selection.pixelHeight,
    pixelWidth: selection.pixelWidth,
    tileHeight: selection.tileHeight,
    tileWidth: selection.tileWidth
  };
}

function getDefaultAiSelectedModelIds() {
  return MAP_AI_SUPPORTED_MODELS.map((model) => model.id);
}

function getDefaultAiModelDetail(supportsNegativePrompt: boolean) {
  return supportsNegativePrompt
    ? "Ready to run with image, mask, prompt, and optional negative prompt."
    : "Ready to run with image, mask, and prompt.";
}

function createInitialAiModelStatuses() {
  return MAP_AI_SUPPORTED_MODELS.map((model) => ({
    detail: getDefaultAiModelDetail(model.supportsNegativePrompt),
    modelId: model.id,
    modelLabel: model.label,
    requestId: "",
    status: "idle" as const
  }));
}

function getClampedTileIndex(position: number, maxTiles: number) {
  return Math.max(0, Math.min(maxTiles - 1, Math.floor(position / TILE_SIZE)));
}

function getScaledTileBounds(index: number, tileCount: number, outputSize: number) {
  const start = Math.round((index * outputSize) / Math.max(1, tileCount));
  const end = Math.round(((index + 1) * outputSize) / Math.max(1, tileCount));

  return {
    end,
    size: Math.max(1, end - start),
    start
  };
}

function drawMapCellBackgroundAtSize(
  context: CanvasRenderingContext2D,
  drawX: number,
  drawY: number,
  tileSize: number
) {
  drawMapCellBackgroundRect(context, drawX, drawY, tileSize, tileSize);
}

function drawMapCellBackgroundRect(
  context: CanvasRenderingContext2D,
  drawX: number,
  drawY: number,
  drawWidth: number,
  drawHeight: number
) {
  const halfWidth = drawWidth / 2;
  const halfHeight = drawHeight / 2;

  context.fillStyle = "#fffdf8";
  context.fillRect(drawX, drawY, drawWidth, drawHeight);
  context.fillStyle = "#efe7d4";
  context.fillRect(drawX, drawY, halfWidth, halfHeight);
  context.fillRect(drawX + halfWidth, drawY + halfHeight, halfWidth, halfHeight);
}

function getPlacementRotationDegrees(options: Partial<MapTileOptions> | undefined) {
  const normalizedOptions = normalizeMapTileOptions(options);

  return (
    (normalizedOptions.rotate90 ? 90 : 0) +
    (normalizedOptions.rotate180 ? 180 : 0) +
    (normalizedOptions.rotate270 ? 270 : 0)
  ) % 360;
}

function getSpriteBrushOutlineRect(
  spriteRecord: SpriteRecord,
  anchorTileX: number,
  anchorTileY: number,
  tileDrawSize: number,
  offsetX = 0,
  offsetY = 0
) {
  const anchorCenterX = offsetX + anchorTileX * tileDrawSize + tileDrawSize / 2;
  const anchorCenterY = offsetY + anchorTileY * tileDrawSize + tileDrawSize / 2;
  const outlineWidth = Math.max(tileDrawSize, spriteRecord.tile_w * tileDrawSize);
  const outlineHeight = Math.max(tileDrawSize, spriteRecord.tile_h * tileDrawSize);
  const mountScaleX = outlineWidth / Math.max(1, spriteRecord.image_w);
  const mountScaleY = outlineHeight / Math.max(1, spriteRecord.image_h);

  return {
    height: outlineHeight,
    width: outlineWidth,
    x: anchorCenterX - spriteRecord.mount_x * mountScaleX,
    y: anchorCenterY - spriteRecord.mount_y * mountScaleY
  };
}

function getSpritePlacementTileBounds(
  spriteRecord: SpriteRecord,
  anchorTileX: number,
  anchorTileY: number
) {
  const anchorCenterX = anchorTileX * TILE_SIZE + TILE_SIZE / 2;
  const anchorCenterY = anchorTileY * TILE_SIZE + TILE_SIZE / 2;
  const left = anchorCenterX - spriteRecord.mount_x + spriteRecord.offset_x;
  const top = anchorCenterY - spriteRecord.mount_y + spriteRecord.offset_y;
  const right = left + spriteRecord.image_w;
  const bottom = top + spriteRecord.image_h;

  return {
    bottomTileY: Math.ceil(bottom / TILE_SIZE) - 1,
    leftTileX: Math.floor(left / TILE_SIZE),
    rightTileX: Math.ceil(right / TILE_SIZE) - 1,
    topTileY: Math.floor(top / TILE_SIZE)
  };
}

function getTileBrushAssetKey(tileSlug: string) {
  return getTileBrushAssetKeyWithSlot(tileSlug, 0);
}

function getSpriteBrushAssetKey(spriteKey: string) {
  return spriteKey.trim() ? `sprite:${spriteKey.trim()}` : "";
}

function normalizeBrushTileSlotNum(slotNum: number) {
  return Number.isFinite(slotNum) && slotNum >= 0 ? Math.max(0, Math.round(slotNum)) : 0;
}

function getTileBrushAssetKeyWithSlot(tileSlug: string, slotNum: number) {
  const normalizedTileSlug = tileSlug.trim();

  if (!normalizedTileSlug) {
    return "";
  }

  return `tile:${normalizedTileSlug}:slot:${normalizeBrushTileSlotNum(slotNum)}`;
}

function parseTileBrushAssetKey(brushAssetKey: string) {
  if (!brushAssetKey.startsWith("tile:")) {
    return null;
  }

  const rawValue = brushAssetKey.slice("tile:".length).trim();

  if (!rawValue) {
    return null;
  }

  const slotSeparatorIndex = rawValue.lastIndexOf(":slot:");

  if (slotSeparatorIndex === -1) {
    return {
      slotNum: 0,
      tileSlug: rawValue
    };
  }

  const tileSlug = rawValue.slice(0, slotSeparatorIndex).trim();
  const rawSlotNum = rawValue.slice(slotSeparatorIndex + ":slot:".length).trim();

  if (!tileSlug) {
    return null;
  }

  return {
    slotNum: normalizeBrushTileSlotNum(Number.parseInt(rawSlotNum, 10)),
    tileSlug
  };
}

function getBrushTileSlug(brushAssetKey: string) {
  return parseTileBrushAssetKey(brushAssetKey)?.tileSlug ?? "";
}

function getBrushTileSlotNum(brushAssetKey: string) {
  return parseTileBrushAssetKey(brushAssetKey)?.slotNum ?? 0;
}

function getBrushSpriteKey(brushAssetKey: string) {
  return brushAssetKey.startsWith("sprite:") ? brushAssetKey.slice("sprite:".length).trim() : "";
}

function getSlotLabel(slotNum: number) {
  if (slotNum <= 0) {
    return describeSlot("main");
  }

  const normalizedSlotNum = Math.min(4, Math.max(1, Math.round(slotNum)));
  return describeSlot(String(normalizedSlotNum - 1) as SlotKey);
}

function haveStringListsChanged(previousValues: string[], nextValues: string[]) {
  return (
    previousValues.length !== nextValues.length ||
    previousValues.some((value, index) => value !== nextValues[index])
  );
}

interface MapDesignerProps {
  initialMode?: string;
}

export function MapDesigner({ initialMode = "" }: MapDesignerProps) {
  const [activeSidebarTab, setActiveSidebarTab] = useState<MapSidebarTab>("brushes");
  const [isEditingSelectedMap, setIsEditingSelectedMap] = useState(() => initialMode.trim() === "map");
  const {
    activeMap,
    activeMapSlug,
    getMapDesignerUiState,
    getMapDraftLayers,
    getTileDraftSlots,
    mapBrushAssetKey,
    maps,
    openPaintEditor,
    setActiveMapSlug,
    setActiveTileSlug,
    setMapDesignerUiState,
    setMapDraftLayers,
    setMapBrushAssetKey,
    sprites,
    tileLibraryFolders,
    tiles,
    upsertMap
  } = useStudio();
  const {
    enableBasicAutocompletion,
    enableLiveAutocompletion,
    enableSnippets,
    handleEditorLoad: handleLuaEditorLoad,
    helperWarning: luaHelperWarning
  } = useLuaAceSupport();
  const initialMapDesignerUiState = getMapDesignerUiState(activeMapSlug);
  const [activeLayerIndex, setActiveLayerIndex] = useState(initialMapDesignerUiState.activeLayerIndex);
  const [hoverCell, setHoverCell] = useState<TileCell | null>(null);
  const [isGridVisible, setGridVisible] = useState(initialMapDesignerUiState.isGridVisible);
  const [layerVisibilities, setLayerVisibilities] = useState<number[]>(initialMapDesignerUiState.layerVisibilities);
  const [mapScalePercent, setMapScalePercent] = useState<number | null>(
    initialMapDesignerUiState.zoomPercent
  );
  const [mapStatus, setMapStatus] = useState(
    "Choose a brush tile or sprite, pick a layer, and paint on the stacked map. Save writes to the database."
  );
  const [hasMounted, setHasMounted] = useState(false);
  const [mapQuery, setMapQuery] = useState("");
  const [activeAiTool, setActiveAiTool] = useState<MapAiTool>("mask");
  const [maskedCells, setMaskedCells] = useState<Set<string>>(() => new Set());
  const [aiSelection, setAiSelection] = useState<MapAiSelection | null>(null);
  const [aiSelectionDraft, setAiSelectionDraft] = useState<{
    anchorCell: TileCell;
    focusCell: TileCell;
  } | null>(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isAiRunningModalOpen, setIsAiRunningModalOpen] = useState(false);
  const [aiPreviewImageUrl, setAiPreviewImageUrl] = useState("");
  const [aiPreviewMaskUrl, setAiPreviewMaskUrl] = useState("");
  const [aiPreviewSnapshot, setAiPreviewSnapshot] = useState<MapAiPreviewSnapshot | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiNegativePrompt, setAiNegativePrompt] = useState("");
  const [aiPreviewStatus, setAiPreviewStatus] = useState("");
  const [aiRunDirectoryName, setAiRunDirectoryName] = useState("");
  const [aiSelectedModelIds, setAiSelectedModelIds] = useState<string[]>(() => getDefaultAiSelectedModelIds());
  const [aiModelStatuses, setAiModelStatuses] = useState<MapAiModelStatus[]>(() => createInitialAiModelStatuses());
  const [isAiSubmitting, setAiSubmitting] = useState(false);
  const [newMapName, setNewMapName] = useState("");
  const [newMapWidth, setNewMapWidth] = useState(String(MAP_DEFAULT_GRID_SIZE));
  const [newMapHeight, setNewMapHeight] = useState(String(MAP_DEFAULT_GRID_SIZE));
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [resizeMapWidth, setResizeMapWidth] = useState(String(MAP_DEFAULT_GRID_SIZE));
  const [resizeMapHeight, setResizeMapHeight] = useState(String(MAP_DEFAULT_GRID_SIZE));
  const [isResizeDialogOpen, setIsResizeDialogOpen] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [zoneEvents, setZoneEvents] = useState<ZoneEventRecord[]>([]);
  const [activeZoneEventName, setActiveZoneEventName] = useState("");
  const [zoneEventDraft, setZoneEventDraft] = useState<LuaEventDraftState>(() => createLuaEventDraft(null));
  const [zoneEventStatus, setZoneEventStatus] = useState("");
  const [isZoneEventsLoading, setZoneEventsLoading] = useState(false);
  const [isZoneEventSaving, setZoneEventSaving] = useState(false);
  const [isZoneEventFormatting, setZoneEventFormatting] = useState(false);
  const [zoneEventLuaAnnotations, setZoneEventLuaAnnotations] = useState<Ace.Annotation[]>([]);
  const [saveConfirmationMessage, setSaveConfirmationMessage] = useState("");
  const [mapAboutPromptDrafts, setMapAboutPromptDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(maps.map((mapRecord) => [mapRecord.slug, mapRecord.aboutPrompt ?? ""]))
  );
  const [areMapAssetsReady, setMapAssetsReady] = useState(false);
  const [brushOptions, setBrushOptions] = useState(DEFAULT_MAP_BRUSH_OPTIONS);
  const [brushLibraryPath, setBrushLibraryPath] = useState("");
  const [isBrushEyedropperActive, setBrushEyedropperActive] = useState(false);
  const [, startTransition] = useTransition();
  const drawingRef = useRef(false);
  const lastPaintedCellKeyRef = useRef("");
  const lastPlacedPlacementRef = useRef<{ cell: TileCell; placement: MapAssetPlacement } | null>(null);
  const lastKnownScrollRef = useRef({
    scrollLeft: initialMapDesignerUiState.scrollLeft,
    scrollTop: initialMapDesignerUiState.scrollTop
  });
  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapFrameRef = useRef<HTMLDivElement | null>(null);
  const mapScalePercentRef = useRef<number | null>(initialMapDesignerUiState.zoomPercent);
  const pendingScrollRestoreRef = useRef<{
    scrollLeft: number;
    scrollTop: number;
  } | null>({
    scrollLeft: initialMapDesignerUiState.scrollLeft,
    scrollTop: initialMapDesignerUiState.scrollTop
  });
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hoverCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const layerPreviewCanvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const fallbackTileCanvasCacheRef = useRef(new Map<string, HTMLCanvasElement>());
  const renderedPlacementCanvasCacheRef = useRef(new Map<string, HTMLCanvasElement>());
  const saveConfirmationTimeoutRef = useRef<number | null>(null);
  const assetImageUrlsRef = useRef<string[]>([]);
  const tileSourceUrlsRef = useRef<string[]>([]);
  const mapAssetLoadVersionRef = useRef(0);
  const aiPreviewRenderVersionRef = useRef(0);
  const imageCache = useImageCache({ maxEntries: 2000, maxTransientEntries: 2000 });
  const createNameInputRef = useRef<HTMLInputElement | null>(null);
  const resizeWidthInputRef = useRef<HTMLInputElement | null>(null);
  const deferredMapQuery = useDeferredValue(mapQuery.trim().toLowerCase());
  const { eventDefinitions: zoneEventDefinitions, helperWarning: zoneEventDefinitionWarning } =
    useLuaEventDefinitions("zone");
  const normalizedNewMapName = normalizeUnderscoreName(newMapName);
  const normalizedNewMapWidth = normalizeMapDimension(newMapWidth);
  const normalizedNewMapHeight = normalizeMapDimension(newMapHeight);
  const normalizedResizeMapWidth = normalizeMapDimension(resizeMapWidth);
  const normalizedResizeMapHeight = normalizeMapDimension(resizeMapHeight);
  const draftLayers = getMapDraftLayers(
    activeMapSlug,
    activeMap?.layers,
    activeMap?.width,
    activeMap?.height
  );
  const activeMapAboutPrompt = activeMap
    ? (mapAboutPromptDrafts[activeMap.slug] ?? activeMap.aboutPrompt ?? "")
    : "";
  const { height: mapHeight, width: mapWidth } = getMapLayerDimensions(draftLayers, activeMap?.cells);
  const savedLayers = activeMap
    ? normalizeMapLayers(activeMap.layers, activeMap.width, activeMap.height, activeMap.cells)
    : null;
  const hasMapLayerDraftChanges = savedLayers
    ? JSON.stringify(draftLayers) !== JSON.stringify(savedLayers)
    : false;
  const hasMapAboutPromptDraftChanges = activeMap
    ? activeMapAboutPrompt !== (activeMap.aboutPrompt ?? "")
    : false;
  const hasMapDraftChanges = hasMapLayerDraftChanges || hasMapAboutPromptDraftChanges;
  const mapCanvasWidth = getMapCanvasWidth(mapWidth);
  const mapCanvasHeight = getMapCanvasHeight(mapHeight);
  const tilesBySlug = new Map(tiles.map((tileRecord) => [tileRecord.slug, tileRecord]));
  const spritesByKey = new Map(
    sprites.map((spriteRecord) => [
      getTileLibrarySpriteKey(spriteRecord.path, spriteRecord.filename),
      spriteRecord
    ])
  );
  const tileSlotsBySlug = new Map(
    tiles.map((tileRecord) => [
      tileRecord.slug,
      getTileDraftSlots(tileRecord.slug, tileRecord.slots).map((slotRecord) => sanitizeSlotRecord(slotRecord))
    ])
  );
  const tileMainSlotsBySlug = new Map(
    tiles.map((tileRecord) => [tileRecord.slug, tileSlotsBySlug.get(tileRecord.slug)?.[0] ?? null])
  );
  const activeBrushTileSlug = getBrushTileSlug(mapBrushAssetKey);
  const activeBrushTileSlotNum = getBrushTileSlotNum(mapBrushAssetKey);
  const activeBrushSpriteKey = getBrushSpriteKey(mapBrushAssetKey);
  const brushOptionLabels = describeMapTileOptions(brushOptions);
  const tileSlotUrls = tiles.flatMap((tileRecord) =>
    (tileSlotsBySlug.get(tileRecord.slug) ?? []).map(
      (slotRecord) => slotRecord?.pixels || slotRecord?.layers?.[0] || ""
    )
  );
  const spriteThumbnailUrls = sprites.map((spriteRecord) => spriteRecord.thumbnail ?? "");
  const zoneEventOptions = useMemo<LuaEventOption<ZoneEventRecord>[]>(
    () => mergeLuaEventOptions(zoneEventDefinitions, zoneEvents, (eventRecord) => eventRecord.zone_event),
    [zoneEventDefinitions, zoneEvents]
  );
  const activeZoneEventOption = useMemo(
    () => zoneEventOptions.find((eventOption) => eventOption.eventName === activeZoneEventName) ?? null,
    [activeZoneEventName, zoneEventOptions]
  );
  const activeZoneEvent = activeZoneEventOption?.record ?? null;
  const isEditingMap = isEditingSelectedMap && Boolean(activeMap);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (activeMap) {
      setMapStatus(`Editing ${activeMap.name} (${activeMap.width}x${activeMap.height}).`);
    }
  }, [activeMap]);

  useEffect(() => {
    if (!isEditingSelectedMap || activeMap) {
      return;
    }

    setIsEditingSelectedMap(false);
  }, [activeMap, isEditingSelectedMap]);

  useEffect(() => {
    setZoneEventDraft(createLuaEventDraft(activeZoneEvent));
    setZoneEventLuaAnnotations([]);
  }, [activeZoneEvent?.id, activeZoneEventOption?.eventName]);

  useEffect(() => {
    setActiveZoneEventName((currentEventName) =>
      zoneEventOptions.some((eventOption) => eventOption.eventName === currentEventName)
        ? currentEventName
        : zoneEventOptions[0]?.eventName ?? ""
    );
  }, [zoneEventOptions]);

  useEffect(() => {
    if (!activeMap) {
      return;
    }

    setMapAboutPromptDrafts((currentDrafts) => {
      if (activeMap.slug in currentDrafts) {
        return currentDrafts;
      }

      return {
        ...currentDrafts,
        [activeMap.slug]: activeMap.aboutPrompt ?? ""
      };
    });
  }, [activeMap]);

  useEffect(() => {
    setMaskedCells(new Set());
    setAiSelection(null);
    setAiSelectionDraft(null);
    setAiPreviewImageUrl("");
    setAiPreviewMaskUrl("");
    setAiPreviewSnapshot(null);
    setAiPreviewStatus("");
    setAiPrompt("");
    setAiNegativePrompt("");
    setAiRunDirectoryName("");
    setAiSelectedModelIds(getDefaultAiSelectedModelIds());
    setAiModelStatuses(createInitialAiModelStatuses());
    setAiSubmitting(false);
    setIsAiModalOpen(false);
    setIsAiRunningModalOpen(false);
    setZoneEvents([]);
    setActiveZoneEventName("");
    setZoneEventDraft(createLuaEventDraft(null));
    setZoneEventStatus("");
    setZoneEventsLoading(false);
    setZoneEventSaving(false);
    setZoneEventFormatting(false);
    setZoneEventLuaAnnotations([]);
    setBrushEyedropperActive(false);
    lastPlacedPlacementRef.current = null;
  }, [activeMapSlug]);

  useEffect(() => {
    if (activeSidebarTab !== "events") {
      return;
    }

    if (!activeMap?.name) {
      setZoneEvents([]);
      setActiveZoneEventName("");
      setZoneEventDraft(createLuaEventDraft(null));
      setZoneEventLuaAnnotations([]);
      setZoneEventStatus("");
      return;
    }

    setZoneEventsLoading(true);
    setZoneEventStatus("");

    void readMapZoneEventsAction(activeMap.name)
      .then((nextEvents) => {
        setZoneEvents(sortLuaEvents(nextEvents, (eventRecord) => eventRecord.zone_event));
      })
      .catch((error: unknown) => {
        setZoneEvents([]);
        setActiveZoneEventName("");
        setZoneEventDraft(createLuaEventDraft(null));
        setZoneEventLuaAnnotations([]);
        setZoneEventStatus(error instanceof Error ? error.message : "Could not load zone events.");
      })
      .finally(() => {
        setZoneEventsLoading(false);
      });
  }, [activeMap?.name, activeSidebarTab]);

  useEffect(() => {
    return () => {
      if (saveConfirmationTimeoutRef.current !== null) {
        window.clearTimeout(saveConfirmationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    mapScalePercentRef.current = mapScalePercent;
  }, [mapScalePercent]);

  useEffect(() => {
    const storedUiState = getMapDesignerUiState(activeMapSlug);

    lastKnownScrollRef.current = {
      scrollLeft: storedUiState.scrollLeft,
      scrollTop: storedUiState.scrollTop
    };
    pendingScrollRestoreRef.current = {
      scrollLeft: storedUiState.scrollLeft,
      scrollTop: storedUiState.scrollTop
    };
    setActiveLayerIndex(storedUiState.activeLayerIndex);
    setGridVisible(storedUiState.isGridVisible);
    setLayerVisibilities(storedUiState.layerVisibilities);
    setMapScalePercent(storedUiState.zoomPercent);
  }, [activeMapSlug]);

  useEffect(() => {
    if (activeLayerIndex < MAP_LAYER_COUNT) {
      return;
    }

    setActiveLayerIndex(0);
  }, [activeLayerIndex]);

  useEffect(() => {
    if (!isCreateDialogOpen) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      createNameInputRef.current?.focus();
      createNameInputRef.current?.select();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCreateDialogOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCreateDialogOpen]);

  useEffect(() => {
    if (!isResizeDialogOpen) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      resizeWidthInputRef.current?.focus();
      resizeWidthInputRef.current?.select();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsResizeDialogOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isResizeDialogOpen]);

  useEffect(() => {
    if (!isAiModalOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAiModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAiModalOpen]);

  useEffect(() => {
    if (!isEditingMap) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      setMapScalePercent((currentScale) => {
        if (currentScale !== null) {
          return currentScale;
        }

        return getAutoFitMapScalePercent(mapFrameRef.current, mapCanvasWidth, mapCanvasHeight);
      });
    });

    if (mapFrameRef.current) {
      resizeObserver.observe(mapFrameRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [activeSidebarTab, isEditingMap, mapCanvasHeight, mapCanvasWidth]);

  useEffect(() => {
    if (!isEditingMap) {
      return;
    }

    if (mapScalePercent !== null) {
      return;
    }

    const mapFrame = mapFrameRef.current;

    if (!mapFrame || mapFrame.clientWidth <= 0 || mapFrame.clientHeight <= 0) {
      return;
    }

    setMapScalePercent(getAutoFitMapScalePercent(mapFrame, mapCanvasWidth, mapCanvasHeight));
  }, [activeSidebarTab, isEditingMap, mapCanvasHeight, mapCanvasWidth, mapScalePercent]);

  useEffect(() => {
    if (!isEditingMap) {
      return;
    }

    const mapFrame = mapFrameRef.current;

    if (!mapFrame) {
      return;
    }

    const handleScroll = () => {
      lastKnownScrollRef.current = {
        scrollLeft: mapFrame.scrollLeft,
        scrollTop: mapFrame.scrollTop
      };
    };

    handleScroll();
    mapFrame.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      mapFrame.removeEventListener("scroll", handleScroll);
    };
  }, [activeMapSlug, activeSidebarTab, isEditingMap]);

  useEffect(() => {
    if (!isEditingMap) {
      return;
    }

    const mapCanvas = mapCanvasRef.current;
    const mapFrame = mapFrameRef.current;

    if (!mapCanvas) {
      return;
    }

    if (
      mapScalePercent === null &&
      (!mapFrame || mapFrame.clientWidth <= 0 || mapFrame.clientHeight <= 0)
    ) {
      return;
    }

    const scalePercent =
      mapScalePercent === null
        ? getAutoFitMapScalePercent(mapFrame, mapCanvasWidth, mapCanvasHeight)
        : mapScalePercent;
    const nextScale = clampMapScalePercent(scalePercent);
    const nextCanvasWidth = Math.round((mapCanvasWidth * nextScale) / 100);
    const nextCanvasHeight = Math.round((mapCanvasHeight * nextScale) / 100);

    mapCanvas.style.width = `${nextCanvasWidth}px`;
    mapCanvas.style.height = `${nextCanvasHeight}px`;
  }, [activeSidebarTab, isEditingMap, mapCanvasHeight, mapCanvasWidth, mapScalePercent]);

  useEffect(() => {
    if (!activeMapSlug) {
      return;
    }

    setMapDesignerUiState(activeMapSlug, {
      activeLayerIndex,
      isGridVisible,
      layerVisibilities,
      zoomPercent: mapScalePercent
    });
  }, [activeLayerIndex, activeMapSlug, isGridVisible, layerVisibilities, mapScalePercent]);

  useEffect(() => {
    if (!isEditingMap) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const nextScroll = pendingScrollRestoreRef.current;
    const mapFrame = mapFrameRef.current;

    if (!nextScroll || !mapFrame) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const maxScrollLeft = Math.max(0, mapFrame.scrollWidth - mapFrame.clientWidth);
      const maxScrollTop = Math.max(0, mapFrame.scrollHeight - mapFrame.clientHeight);

      mapFrame.scrollLeft = Math.min(maxScrollLeft, Math.max(0, nextScroll.scrollLeft));
      mapFrame.scrollTop = Math.min(maxScrollTop, Math.max(0, nextScroll.scrollTop));
      lastKnownScrollRef.current = {
        scrollLeft: mapFrame.scrollLeft,
        scrollTop: mapFrame.scrollTop
      };
      pendingScrollRestoreRef.current = null;
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [activeMapSlug, activeSidebarTab, isEditingMap, mapCanvasHeight, mapCanvasWidth, mapScalePercent]);

  useEffect(() => {
    return () => {
      if (!activeMapSlug) {
        return;
      }

      setMapDesignerUiState(activeMapSlug, {
        activeLayerIndex,
        isGridVisible,
        layerVisibilities,
        scrollLeft: lastKnownScrollRef.current.scrollLeft,
        scrollTop: lastKnownScrollRef.current.scrollTop,
        zoomPercent: mapScalePercentRef.current
      });
    };
  }, [activeLayerIndex, activeMapSlug, isGridVisible, layerVisibilities]);

  const renderTilePlacement = useEffectEvent(
    (
      context: CanvasRenderingContext2D,
      placement: { kind: "tile"; options: MapTileOptions; slotNum: number; tileSlug: string } | null,
      drawX: number,
      drawY: number,
      drawWidth: number,
      drawHeight: number,
      simplified = false
    ) => {
      if (!placement?.tileSlug) {
        return;
      }

      const tileRecord = tilesBySlug.get(placement.tileSlug) ?? null;

      if (!tileRecord) {
        return;
      }

      const tileSlots = tileSlotsBySlug.get(placement.tileSlug) ?? [];
      const selectedSlot = tileSlots[placement.slotNum] ?? null;
      const mainSlot = tileSlots[0] ?? null;
      const renderSlot =
        selectedSlot?.pixels || selectedSlot?.layers?.[0]
          ? selectedSlot
          : mainSlot;
      const renderSlotSource = renderSlot?.pixels || renderSlot?.layers?.[0] || "";
      const tileImage = renderSlotSource ? imageCache.getCachedImage(renderSlotSource) : null;

      if (!tileImage && simplified) {
        context.fillStyle = "rgba(216, 135, 83, 0.2)";
        context.fillRect(drawX, drawY, drawWidth, drawHeight);
        return;
      }

      const sourceKey = tileImage ? renderSlotSource : `fallback:${tileRecord.name}`;
      const variantKey = `${placement.tileSlug}:${placement.slotNum}:${sourceKey}:${serializeMapTileOptionsKey(placement.options)}`;
      let variantCanvas = renderedPlacementCanvasCacheRef.current.get(variantKey) ?? null;

      if (!variantCanvas) {
        const baseCanvasKey = tileImage ? `image:${sourceKey}` : `fallback:${tileRecord.slug}:${tileRecord.name}`;
        let baseCanvas = fallbackTileCanvasCacheRef.current.get(baseCanvasKey) ?? null;

        if (!baseCanvas) {
          baseCanvas = document.createElement("canvas");
          ensureCanvasSize(baseCanvas, TILE_SIZE, TILE_SIZE);
          const baseContext = baseCanvas.getContext("2d");

          if (!baseContext) {
            return;
          }

          baseContext.clearRect(0, 0, TILE_SIZE, TILE_SIZE);

          if (tileImage) {
            baseContext.drawImage(tileImage, 0, 0, TILE_SIZE, TILE_SIZE);
          } else {
            drawMapTileFallback(baseContext, tileRecord, 0, 0);
          }

          fallbackTileCanvasCacheRef.current.set(baseCanvasKey, baseCanvas);
        }

        variantCanvas = document.createElement("canvas");
        ensureCanvasSize(variantCanvas, TILE_SIZE, TILE_SIZE);
        const variantContext = variantCanvas.getContext("2d");

        if (!variantContext) {
          return;
        }

        variantContext.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
        variantContext.save();
        variantContext.translate(TILE_SIZE / 2, TILE_SIZE / 2);
        variantContext.scale(
          placement.options.flipHorizontal ? -1 : 1,
          placement.options.flipVertical ? -1 : 1
        );
        variantContext.rotate((getPlacementRotationDegrees(placement.options) * Math.PI) / 180);
        variantContext.drawImage(baseCanvas, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
        variantContext.restore();

        if (placement.options.multiply) {
          const multipliedCanvas = document.createElement("canvas");
          ensureCanvasSize(multipliedCanvas, TILE_SIZE, TILE_SIZE);
          const multipliedContext = multipliedCanvas.getContext("2d");

          if (!multipliedContext) {
            return;
          }

          multipliedContext.drawImage(variantCanvas, 0, 0);
          multipliedContext.globalCompositeOperation = "multiply";
          multipliedContext.fillStyle = placement.options.colorValue;
          multipliedContext.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
          multipliedContext.globalCompositeOperation = "destination-in";
          multipliedContext.drawImage(variantCanvas, 0, 0);
          variantContext.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
          variantContext.drawImage(multipliedCanvas, 0, 0);
        }

        if (placement.options.color) {
          variantContext.save();
          variantContext.globalAlpha = placement.options.multiply ? 0.35 : 1;
          variantContext.globalCompositeOperation = "source-atop";
          variantContext.fillStyle = placement.options.colorValue;
          variantContext.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
          variantContext.restore();
        }

        renderedPlacementCanvasCacheRef.current.set(variantKey, variantCanvas);
      }

      context.drawImage(variantCanvas, drawX, drawY, drawWidth, drawHeight);
    }
  );

  const renderSpritePlacement = useEffectEvent(
    (
      context: CanvasRenderingContext2D,
      placement: { kind: "sprite"; spriteKey: string } | null,
      drawX: number,
      drawY: number,
      tileDrawWidth: number,
      tileDrawHeight = tileDrawWidth,
      simplified = false
    ) => {
      if (!placement?.spriteKey) {
        return;
      }

      const spriteRecord = spritesByKey.get(placement.spriteKey) ?? null;

      if (!spriteRecord) {
        return;
      }

      const spriteImage = spriteRecord.thumbnail
        ? imageCache.getCachedImage(spriteRecord.thumbnail)
        : null;
      const scaleX = tileDrawWidth / TILE_SIZE;
      const scaleY = tileDrawHeight / TILE_SIZE;
      const anchorCenterX = drawX + tileDrawWidth / 2;
      const anchorCenterY = drawY + tileDrawHeight / 2;
      const spriteDrawWidth = spriteRecord.image_w * scaleX;
      const spriteDrawHeight = spriteRecord.image_h * scaleY;
      const spriteDrawX =
        anchorCenterX - spriteRecord.mount_x * scaleX + spriteRecord.offset_x * scaleX;
      const spriteDrawY =
        anchorCenterY - spriteRecord.mount_y * scaleY + spriteRecord.offset_y * scaleY;

      if (!spriteImage) {
        if (!simplified) {
          return;
        }

        context.fillStyle = "rgba(216, 135, 83, 0.2)";
        context.fillRect(spriteDrawX, spriteDrawY, spriteDrawWidth, spriteDrawHeight);
        context.strokeStyle = "rgba(20, 33, 39, 0.38)";
        context.lineWidth = Math.max(1, Math.min(tileDrawWidth, tileDrawHeight) * 0.03);
        context.strokeRect(spriteDrawX, spriteDrawY, spriteDrawWidth, spriteDrawHeight);
        return;
      }

      context.save();
      context.imageSmoothingEnabled = false;
      context.drawImage(spriteImage, spriteDrawX, spriteDrawY, spriteDrawWidth, spriteDrawHeight);
      context.restore();
    }
  );

  const renderMapGrid = useEffectEvent(
    (
      context: CanvasRenderingContext2D,
      layers: typeof draftLayers,
      opacityForLayer: (layerIndex: number) => number,
      options?: {
        clearCanvas?: boolean;
        height?: number;
        hoverCell?: TileCell | null;
        offsetX?: number;
        offsetY?: number;
        showGrid?: boolean;
        simplifiedFallback?: boolean;
        tileDrawSize?: number;
        width?: number;
      }
    ) => {
      const tileDrawSize = options?.tileDrawSize ?? TILE_SIZE;
      const offsetX = options?.offsetX ?? 0;
      const offsetY = options?.offsetY ?? 0;
      const showGrid = options?.showGrid ?? true;
      const simplifiedFallback = options?.simplifiedFallback ?? false;
      const clearCanvas = options?.clearCanvas ?? true;
      const renderWidth = options?.width ?? mapWidth;
      const renderHeight = options?.height ?? mapHeight;

      if (clearCanvas) {
        context.clearRect(0, 0, context.canvas.width, context.canvas.height);
      }

      const impassibleCellKeys = showGrid ? new Set<string>() : null;

      for (let tileY = 0; tileY < renderHeight; tileY += 1) {
        for (let tileX = 0; tileX < renderWidth; tileX += 1) {
          const drawX = offsetX + tileX * tileDrawSize;
          const drawY = offsetY + tileY * tileDrawSize;

          drawMapCellBackgroundAtSize(context, drawX, drawY, tileDrawSize);
        }
      }

      for (let layerIndex = 0; layerIndex < MAP_LAYER_COUNT; layerIndex += 1) {
        const opacity = opacityForLayer(layerIndex);

        if (opacity <= 0) {
          continue;
        }

        for (let tileY = 0; tileY < renderHeight; tileY += 1) {
          for (let tileX = 0; tileX < renderWidth; tileX += 1) {
            const placement = layers[layerIndex]?.[tileY]?.[tileX] ?? null;
            const drawX = offsetX + tileX * tileDrawSize;
            const drawY = offsetY + tileY * tileDrawSize;

            if (!placement) {
              continue;
            }

            if (impassibleCellKeys) {
              if (isMapTilePlacement(placement)) {
                const tileRecord = tilesBySlug.get(placement.tileSlug) ?? null;

                if (tileRecord?.impassible) {
                  impassibleCellKeys.add(getMapCellKey(tileX, tileY));
                }
              } else if (isMapSpritePlacement(placement)) {
                const spriteRecord = spritesByKey.get(placement.spriteKey) ?? null;

                if (spriteRecord?.impassible) {
                  const bounds = getSpritePlacementTileBounds(spriteRecord, tileX, tileY);
                  const startTileX = Math.max(0, bounds.leftTileX);
                  const endTileX = Math.min(renderWidth - 1, bounds.rightTileX);
                  const startTileY = Math.max(0, bounds.topTileY);
                  const endTileY = Math.min(renderHeight - 1, bounds.bottomTileY);

                  for (let occupiedTileY = startTileY; occupiedTileY <= endTileY; occupiedTileY += 1) {
                    for (let occupiedTileX = startTileX; occupiedTileX <= endTileX; occupiedTileX += 1) {
                      impassibleCellKeys.add(getMapCellKey(occupiedTileX, occupiedTileY));
                    }
                  }
                }
              }
            }

            context.save();
            context.globalAlpha = opacity;

            if (isMapTilePlacement(placement)) {
              renderTilePlacement(
                context,
                placement,
                drawX,
                drawY,
                tileDrawSize,
                tileDrawSize,
                simplifiedFallback
              );
            } else if (isMapSpritePlacement(placement)) {
              renderSpritePlacement(
                context,
                placement,
                drawX,
                drawY,
                tileDrawSize,
                tileDrawSize,
                simplifiedFallback
              );
            }

            context.restore();
          }
        }
      }

      for (let tileY = 0; tileY < renderHeight; tileY += 1) {
        for (let tileX = 0; tileX < renderWidth; tileX += 1) {
          const drawX = offsetX + tileX * tileDrawSize;
          const drawY = offsetY + tileY * tileDrawSize;

          if (showGrid) {
            context.strokeStyle = "rgba(20, 33, 39, 0.12)";
            context.lineWidth = 1;
            context.strokeRect(drawX + 0.5, drawY + 0.5, tileDrawSize - 1, tileDrawSize - 1);

            if (impassibleCellKeys?.has(getMapCellKey(tileX, tileY))) {
              context.strokeStyle = "rgba(240, 0, 0, 0.2)";
              context.lineWidth = Math.max(1.5, tileDrawSize * 0.08);
              context.strokeRect(drawX + 1, drawY + 1, Math.max(1, tileDrawSize - 2), Math.max(1, tileDrawSize - 2));
            }
          }

          if (
            options?.hoverCell &&
            options.hoverCell.tileX === tileX &&
            options.hoverCell.tileY === tileY
          ) {
            context.strokeStyle = "#f1c97b";
            context.lineWidth = 5;

            if (activeBrushSprite) {
              const outlineRect = getSpriteBrushOutlineRect(
                activeBrushSprite,
                tileX,
                tileY,
                tileDrawSize,
                offsetX,
                offsetY
              );

              context.strokeRect(
                outlineRect.x + 2.5,
                outlineRect.y + 2.5,
                Math.max(1, outlineRect.width - 5),
                Math.max(1, outlineRect.height - 5)
              );
            } else {
              context.strokeRect(drawX + 2.5, drawY + 2.5, tileDrawSize - 5, tileDrawSize - 5);
            }
          }
        }
      }
    }
  );

  const renderPreviewCanvas = useEffectEvent(
    (
      canvas: HTMLCanvasElement | null,
      layers: typeof draftLayers,
      opacityForLayer: (layerIndex: number) => number
    ) => {
      if (!canvas) {
        return;
      }

      ensureCanvasSize(canvas, MAP_PREVIEW_SIZE, MAP_PREVIEW_SIZE);
      const context = canvas.getContext("2d");

      if (!context) {
        return;
      }

      drawPreviewBackground(context, MAP_PREVIEW_SIZE, MAP_PREVIEW_SIZE);

      const sourceCanvas = document.createElement("canvas");
      ensureCanvasSize(sourceCanvas, mapCanvasWidth, mapCanvasHeight);
      const sourceContext = sourceCanvas.getContext("2d");

      if (!sourceContext) {
        return;
      }

      renderMapGrid(sourceContext, layers, opacityForLayer, {
        showGrid: false,
        simplifiedFallback: !areMapAssetsReady
      });

      const scale = Math.min(MAP_PREVIEW_SIZE / mapCanvasWidth, MAP_PREVIEW_SIZE / mapCanvasHeight);
      const scaledWidth = Math.max(1, Math.round(mapCanvasWidth * scale));
      const scaledHeight = Math.max(1, Math.round(mapCanvasHeight * scale));
      const offsetX = Math.floor((MAP_PREVIEW_SIZE - scaledWidth) / 2);
      const offsetY = Math.floor((MAP_PREVIEW_SIZE - scaledHeight) / 2);

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(
        sourceCanvas,
        0,
        0,
        mapCanvasWidth,
        mapCanvasHeight,
        offsetX,
        offsetY,
        scaledWidth,
        scaledHeight
      );
    }
  );

  const renderMiniMapDataUrl = useEffectEvent(
    async (
      layers: typeof draftLayers = draftLayers,
      width = mapWidth,
      height = mapHeight
    ) => {
      const miniMapCanvasWidth = getMapCanvasWidth(width);
      const miniMapCanvasHeight = getMapCanvasHeight(height);
      const assetImageUrls = [...tileSlotUrls, ...spriteThumbnailUrls].filter(Boolean);

      await Promise.all(assetImageUrls.map((imageUrl) => imageCache.ensureImage(imageUrl)));

      const sourceCanvas = document.createElement("canvas");
      ensureCanvasSize(sourceCanvas, miniMapCanvasWidth, miniMapCanvasHeight);
      const sourceContext = sourceCanvas.getContext("2d");

      if (!sourceContext) {
        throw new Error("Could not render the map mini-map source.");
      }

      renderMapGrid(sourceContext, layers, () => 1, {
        height,
        showGrid: false,
        width
      });

      const scale = Math.min(
        MAP_MINI_MAP_MAX_SIZE / miniMapCanvasWidth,
        MAP_MINI_MAP_MAX_SIZE / miniMapCanvasHeight
      );
      const outputWidth = Math.max(1, Math.round(miniMapCanvasWidth * scale));
      const outputHeight = Math.max(1, Math.round(miniMapCanvasHeight * scale));
      const outputCanvas = document.createElement("canvas");
      ensureCanvasSize(outputCanvas, outputWidth, outputHeight);
      const outputContext = outputCanvas.getContext("2d");

      if (!outputContext) {
        throw new Error("Could not render the map mini-map output.");
      }

      outputContext.imageSmoothingEnabled = true;
      outputContext.imageSmoothingQuality = "high";
      outputContext.clearRect(0, 0, outputWidth, outputHeight);
      outputContext.drawImage(
        sourceCanvas,
        0,
        0,
        miniMapCanvasWidth,
        miniMapCanvasHeight,
        0,
        0,
        outputWidth,
        outputHeight
      );

      return outputCanvas.toDataURL("image/png");
    }
  );

  const renderTerrainExportDataUrl = useEffectEvent(async () => {
    await Promise.all(
      [...tileSlotUrls, ...spriteThumbnailUrls].filter(Boolean).map((imageUrl) => imageCache.ensureImage(imageUrl))
    );

    const outputCanvas = document.createElement("canvas");
    ensureCanvasSize(outputCanvas, mapCanvasWidth, mapCanvasHeight);
    const outputContext = outputCanvas.getContext("2d");

    if (!outputContext) {
      throw new Error("Could not render the terrain export.");
    }

    outputContext.imageSmoothingEnabled = false;
    renderMapGrid(outputContext, draftLayers, (layerIndex) => layerVisibilities[layerIndex] ?? 1, {
      showGrid: false
    });

    return outputCanvas.toDataURL("image/png");
  });

  const renderAiPreviewData = useEffectEvent(async (snapshot: MapAiPreviewSnapshot) => {
    await Promise.all(snapshot.assetImageUrls.map((imageUrl) => imageCache.ensureImage(imageUrl)));

    const imageCanvas = document.createElement("canvas");
    ensureCanvasSize(imageCanvas, AI_PREVIEW_SIZE, AI_PREVIEW_SIZE);
    const imageContext = imageCanvas.getContext("2d");

    if (!imageContext) {
      throw new Error("Could not render the AI image preview.");
    }

    imageContext.clearRect(0, 0, AI_PREVIEW_SIZE, AI_PREVIEW_SIZE);
    imageContext.imageSmoothingEnabled = true;
    imageContext.imageSmoothingQuality = "high";

    for (let tileY = snapshot.selection.topTileY; tileY <= snapshot.selection.bottomTileY; tileY += 1) {
      const relativeTileY = tileY - snapshot.selection.topTileY;
      const yBounds = getScaledTileBounds(relativeTileY, snapshot.selection.tileHeight, AI_PREVIEW_SIZE);

      for (let tileX = snapshot.selection.leftTileX; tileX <= snapshot.selection.rightTileX; tileX += 1) {
        const relativeTileX = tileX - snapshot.selection.leftTileX;
        const xBounds = getScaledTileBounds(relativeTileX, snapshot.selection.tileWidth, AI_PREVIEW_SIZE);

        drawMapCellBackgroundRect(
          imageContext,
          xBounds.start,
          yBounds.start,
          xBounds.size,
          yBounds.size
        );
      }
    }

    for (let layerIndex = 0; layerIndex < MAP_LAYER_COUNT; layerIndex += 1) {
      const opacity = snapshot.layerVisibilities[layerIndex] ?? 1;

      if (opacity <= 0) {
        continue;
      }

      for (let tileY = snapshot.selection.topTileY; tileY <= snapshot.selection.bottomTileY; tileY += 1) {
        const relativeTileY = tileY - snapshot.selection.topTileY;
        const yBounds = getScaledTileBounds(relativeTileY, snapshot.selection.tileHeight, AI_PREVIEW_SIZE);

        for (let tileX = snapshot.selection.leftTileX; tileX <= snapshot.selection.rightTileX; tileX += 1) {
          const placement = snapshot.layers[layerIndex]?.[tileY]?.[tileX] ?? null;

          if (!placement) {
            continue;
          }

          const relativeTileX = tileX - snapshot.selection.leftTileX;
          const xBounds = getScaledTileBounds(relativeTileX, snapshot.selection.tileWidth, AI_PREVIEW_SIZE);

          imageContext.save();
          imageContext.globalAlpha = opacity;

          if (isMapTilePlacement(placement)) {
            renderTilePlacement(
              imageContext,
              placement,
              xBounds.start,
              yBounds.start,
              xBounds.size,
              yBounds.size
            );
          } else if (isMapSpritePlacement(placement)) {
            renderSpritePlacement(
              imageContext,
              placement,
              xBounds.start,
              yBounds.start,
              xBounds.size,
              yBounds.size
            );
          }

          imageContext.restore();
        }
      }
    }

    const maskCanvas = document.createElement("canvas");
    ensureCanvasSize(maskCanvas, AI_PREVIEW_SIZE, AI_PREVIEW_SIZE);
    const maskContext = maskCanvas.getContext("2d");

    if (!maskContext) {
      throw new Error("Could not render the AI edit mask.");
    }

    maskContext.fillStyle = "#000000";
    maskContext.fillRect(0, 0, AI_PREVIEW_SIZE, AI_PREVIEW_SIZE);
    maskContext.fillStyle = "#ffffff";

    snapshot.maskedCells.forEach((cellKey) => {
      const [rawTileX, rawTileY] = cellKey.split(",");
      const tileX = Number.parseInt(rawTileX ?? "", 10);
      const tileY = Number.parseInt(rawTileY ?? "", 10);

      if (
        !Number.isFinite(tileX) ||
        !Number.isFinite(tileY) ||
        tileX < snapshot.selection.leftTileX ||
        tileX > snapshot.selection.rightTileX ||
        tileY < snapshot.selection.topTileY ||
        tileY > snapshot.selection.bottomTileY
      ) {
        return;
      }

      maskContext.fillRect(
        getScaledTileBounds(tileX - snapshot.selection.leftTileX, snapshot.selection.tileWidth, AI_PREVIEW_SIZE).start,
        getScaledTileBounds(tileY - snapshot.selection.topTileY, snapshot.selection.tileHeight, AI_PREVIEW_SIZE).start,
        getScaledTileBounds(tileX - snapshot.selection.leftTileX, snapshot.selection.tileWidth, AI_PREVIEW_SIZE).size,
        getScaledTileBounds(tileY - snapshot.selection.topTileY, snapshot.selection.tileHeight, AI_PREVIEW_SIZE).size
      );
    });

    return {
      imageUrl: imageCanvas.toDataURL("image/png"),
      maskUrl: maskCanvas.toDataURL("image/png")
    };
  });

  const renderHoverCanvas = useEffectEvent(() => {
    const hoverCanvas = hoverCanvasRef.current;

    if (!hoverCanvas) {
      return;
    }

    ensureCanvasSize(hoverCanvas, mapCanvasWidth, mapCanvasHeight);
    const context = hoverCanvas.getContext("2d");

    if (!context) {
      return;
    }

    context.clearRect(0, 0, hoverCanvas.width, hoverCanvas.height);

    if (activeSidebarTab === "ai") {
      maskedCells.forEach((cellKey) => {
        const [rawTileX, rawTileY] = cellKey.split(",");
        const tileX = Number.parseInt(rawTileX ?? "", 10);
        const tileY = Number.parseInt(rawTileY ?? "", 10);

        if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
          return;
        }

        context.fillStyle = "rgba(0, 0, 0, 0.8)";
        context.fillRect(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      });

      const activeSelectionDraft = aiSelectionDraft
        ? getAiSelectionFromCells(aiSelectionDraft.anchorCell, aiSelectionDraft.focusCell)
        : null;
      const visibleSelection = activeSelectionDraft ?? aiSelection;

      if (visibleSelection) {
        const drawX = visibleSelection.leftTileX * TILE_SIZE;
        const drawY = visibleSelection.topTileY * TILE_SIZE;

        context.save();
        context.fillStyle = "rgba(241, 201, 123, 0.18)";
        context.strokeStyle = "#f1c97b";
        context.lineWidth = 5;
        context.fillRect(drawX, drawY, visibleSelection.pixelWidth, visibleSelection.pixelHeight);
        context.strokeRect(
          drawX + 2.5,
          drawY + 2.5,
          Math.max(1, visibleSelection.pixelWidth - 5),
          Math.max(1, visibleSelection.pixelHeight - 5)
        );
        context.font = "700 24px Inter, sans-serif";
        context.textAlign = "left";
        context.textBaseline = "middle";
        const label = formatAiSelectionSize(visibleSelection);
        const labelWidth = Math.ceil(context.measureText(label).width) + 28;
        const labelHeight = 38;
        const labelX = drawX + 10;
        const labelY = Math.max(10, drawY + 10);

        context.fillStyle = "rgba(20, 33, 39, 0.88)";
        context.fillRect(labelX, labelY, labelWidth, labelHeight);
        context.fillStyle = "#fffdf8";
        context.fillText(label, labelX + 14, labelY + labelHeight / 2);
        context.restore();
      }

      if (hoverCell) {
        context.save();
        context.strokeStyle = activeAiTool === "erase" ? "#d88753" : "#f1c97b";
        context.lineWidth = 4;
        context.strokeRect(
          hoverCell.tileX * TILE_SIZE + 2,
          hoverCell.tileY * TILE_SIZE + 2,
          TILE_SIZE - 4,
          TILE_SIZE - 4
        );
        context.restore();
      }

      return;
    }

    if (!hoverCell) {
      return;
    }

    const drawX = hoverCell.tileX * TILE_SIZE;
    const drawY = hoverCell.tileY * TILE_SIZE;

    context.strokeStyle = "#f1c97b";
    context.lineWidth = 5;

    if (activeBrushSprite) {
      const outlineRect = getSpriteBrushOutlineRect(
        activeBrushSprite,
        hoverCell.tileX,
        hoverCell.tileY,
        TILE_SIZE
      );

      context.strokeRect(
        outlineRect.x + 2.5,
        outlineRect.y + 2.5,
        Math.max(1, outlineRect.width - 5),
        Math.max(1, outlineRect.height - 5)
      );
      return;
    }

    context.strokeRect(drawX + 2.5, drawY + 2.5, TILE_SIZE - 5, TILE_SIZE - 5);
  });

  const renderMapCanvas = useEffectEvent(() => {
    const mapCanvas = mapCanvasRef.current;

    if (!mapCanvas) {
      return;
    }

    const context = mapCanvas.getContext("2d");

    if (!context) {
      return;
    }

    renderMapGrid(context, draftLayers, (layerIndex) => layerVisibilities[layerIndex] ?? 1, {
      showGrid: isGridVisible,
      simplifiedFallback: !areMapAssetsReady
    });
  });

  const renderPreviewCanvases = useEffectEvent(() => {
    renderPreviewCanvas(previewCanvasRef.current, draftLayers, (layerIndex) => layerVisibilities[layerIndex] ?? 1);

    layerPreviewCanvasRefs.current.forEach((previewCanvas, layerIndex) => {
      const emptyLayer = createEmptyMapCells(mapWidth, mapHeight);
      const isolatedLayers = draftLayers.map((layerCells, index) =>
        index === layerIndex ? layerCells : emptyLayer
      );
      renderPreviewCanvas(previewCanvas, isolatedLayers, (index) => (index === layerIndex ? 1 : 0));
    });
  });

  useEffect(() => {
    if (haveStringListsChanged(tileSourceUrlsRef.current, tileSlotUrls)) {
      tileSourceUrlsRef.current = tileSlotUrls;
      fallbackTileCanvasCacheRef.current.clear();
      renderedPlacementCanvasCacheRef.current.clear();
    }

    const nextAssetImageUrls = [...tileSlotUrls, ...spriteThumbnailUrls].filter(Boolean);
    const assetImageUrlsChanged = haveStringListsChanged(assetImageUrlsRef.current, nextAssetImageUrls);

    if (!assetImageUrlsChanged) {
      return;
    }

    const loadVersion = mapAssetLoadVersionRef.current + 1;

    mapAssetLoadVersionRef.current = loadVersion;
    setMapAssetsReady(nextAssetImageUrls.length === 0);
    assetImageUrlsRef.current = nextAssetImageUrls;

    if (nextAssetImageUrls.length === 0) {
      renderMapCanvas();
      renderPreviewCanvases();
      return;
    }

    let cancelled = false;
    let pendingAssetCount = nextAssetImageUrls.length;
    const finishAssetLoad = () => {
      if (cancelled || mapAssetLoadVersionRef.current !== loadVersion) {
        return;
      }

      pendingAssetCount -= 1;
      renderMapCanvas();
      renderPreviewCanvases();

      if (pendingAssetCount <= 0) {
        setMapAssetsReady(true);
      }
    };

    nextAssetImageUrls.forEach((imageUrl) => {
      void imageCache.ensureImage(imageUrl).then(finishAssetLoad, finishAssetLoad);
    });

    return () => {
      cancelled = true;
    };
  }, [imageCache, isEditingMap, renderMapCanvas, renderPreviewCanvases, spriteThumbnailUrls, tileSlotUrls]);

  useEffect(() => {
    if (!isEditingMap) {
      return;
    }

    renderMapCanvas();
  }, [
    activeSidebarTab,
    areMapAssetsReady,
    draftLayers,
    isEditingMap,
    isGridVisible,
    layerVisibilities,
    mapCanvasHeight,
    mapCanvasWidth,
    mapHeight,
    mapWidth,
    renderMapCanvas
  ]);

  useEffect(() => {
    if (!isEditingMap) {
      return;
    }

    renderPreviewCanvases();
  }, [
    activeSidebarTab,
    areMapAssetsReady,
    draftLayers,
    isEditingMap,
    layerVisibilities,
    mapCanvasHeight,
    mapCanvasWidth,
    mapHeight,
    mapWidth,
    renderPreviewCanvases
  ]);

  useEffect(() => {
    if (!isEditingMap) {
      return;
    }

    renderHoverCanvas();
  }, [
    activeAiTool,
    activeBrushSpriteKey,
    activeSidebarTab,
    aiSelection,
    aiSelectionDraft,
    hoverCell,
    isEditingMap,
    mapCanvasHeight,
    mapCanvasWidth,
    maskedCells,
    renderHoverCanvas,
    sprites
  ]);

  useEffect(() => {
    if (!isAiModalOpen || !aiPreviewSnapshot) {
      return;
    }

    const renderVersion = aiPreviewRenderVersionRef.current + 1;
    aiPreviewRenderVersionRef.current = renderVersion;
    setAiPreviewStatus("Rendering 1024x1024 previews...");

    void renderAiPreviewData(aiPreviewSnapshot)
      .then((previewData) => {
        if (aiPreviewRenderVersionRef.current !== renderVersion) {
          return;
        }

        setAiPreviewImageUrl(previewData.imageUrl);
        setAiPreviewMaskUrl(previewData.maskUrl);
        setAiPreviewStatus("");
      })
      .catch((error: unknown) => {
        if (aiPreviewRenderVersionRef.current !== renderVersion) {
          return;
        }

        setAiPreviewStatus(
          error instanceof Error ? error.message : "Could not render the AI previews."
        );
      });
  }, [aiPreviewSnapshot, isAiModalOpen, renderAiPreviewData]);

  useEffect(() => {
    if (activeSidebarTab !== "ai" || activeAiTool !== "select" || !aiSelectionDraft) {
      return;
    }

    const handleWindowMouseMove = (event: MouseEvent) => {
      if (!drawingRef.current) {
        return;
      }

      const nextCell = getClampedMapCellFromClientPoint(event.clientX, event.clientY);

      if (!nextCell) {
        return;
      }

      setHoverCell(nextCell);
      setAiSelectionDraft((currentDraft) =>
        currentDraft
          ? {
              ...currentDraft,
              focusCell: nextCell
            }
          : currentDraft
      );
    };

    const handleWindowMouseUp = (event: MouseEvent) => {
      const nextCell = getClampedMapCellFromClientPoint(event.clientX, event.clientY);
      const focusCell = nextCell ?? aiSelectionDraft.focusCell;

      finalizeAiSelection(aiSelectionDraft.anchorCell, focusCell);
      finishPaint();
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [activeAiTool, activeSidebarTab, aiSelectionDraft, mapHeight, mapWidth]);

  function getActiveBrushPlacement() {
    return activeBrushTileSlug
      ? createMapTilePlacement(activeBrushTileSlug, brushOptions, activeBrushTileSlotNum)
      : activeBrushSpriteKey
        ? createMapSpritePlacement(activeBrushSpriteKey)
        : null;
  }

  function paintCell(nextCell: TileCell, placementOverride?: MapAssetPlacement | null) {
    if (!activeMapSlug) {
      return;
    }

    const nextLayers = draftLayers.map((layerCells) => layerCells.map((row) => row.slice()));
    const nextLayer = nextLayers[activeLayerIndex];
    const nextRow = nextLayer?.[nextCell.tileY];
    const nextPlacement = placementOverride ?? getActiveBrushPlacement();

    if (!nextRow) {
      return;
    }

    nextRow[nextCell.tileX] = nextPlacement ? cloneMapPlacement(nextPlacement) : null;
    setMapDraftLayers(activeMapSlug, nextLayers, mapWidth, mapHeight);

    if (nextPlacement) {
      lastPlacedPlacementRef.current = {
        cell: nextCell,
        placement: cloneMapPlacement(nextPlacement) as MapAssetPlacement
      };
    }
  }

  function paintLineFromLastPlacement(targetCell: TileCell) {
    if (!activeMapSlug || !lastPlacedPlacementRef.current) {
      return false;
    }

    const linePlacement = cloneMapPlacement(lastPlacedPlacementRef.current.placement);

    if (!linePlacement) {
      return false;
    }

    const nextLayers = draftLayers.map((layerCells) => layerCells.map((row) => row.slice()));
    const nextLayer = nextLayers[activeLayerIndex];

    if (!nextLayer) {
      return false;
    }

    for (const lineCell of getCellsInLine(lastPlacedPlacementRef.current.cell, targetCell)) {
      const nextRow = nextLayer[lineCell.tileY];

      if (nextRow) {
        nextRow[lineCell.tileX] = cloneMapPlacement(linePlacement);
      }
    }

    setMapDraftLayers(activeMapSlug, nextLayers, mapWidth, mapHeight);
    lastPlacedPlacementRef.current = {
      cell: targetCell,
      placement: cloneMapPlacement(linePlacement) as MapAssetPlacement
    };
    return true;
  }

  function sampleBrushFromCell(nextCell: TileCell) {
    const sampledPlacement = draftLayers[activeLayerIndex]?.[nextCell.tileY]?.[nextCell.tileX] ?? null;

    if (isMapTilePlacement(sampledPlacement)) {
      setMapBrushAssetKey(getTileBrushAssetKeyWithSlot(sampledPlacement.tileSlug, sampledPlacement.slotNum));
      setBrushOptions(normalizeMapTileOptions(sampledPlacement.options));
      setMapStatus(
        `Sampled ${sampledPlacement.tileSlug} ${getSlotLabel(sampledPlacement.slotNum)} from ${nextCell.tileX},${nextCell.tileY}.`
      );
    } else if (isMapSpritePlacement(sampledPlacement)) {
      setMapBrushAssetKey(getSpriteBrushAssetKey(sampledPlacement.spriteKey));
      setBrushOptions(DEFAULT_MAP_BRUSH_OPTIONS);
      setMapStatus(`Sampled sprite ${sampledPlacement.spriteKey} from ${nextCell.tileX},${nextCell.tileY}.`);
    } else {
      setMapBrushAssetKey("");
      setBrushOptions(DEFAULT_MAP_BRUSH_OPTIONS);
      setMapStatus(`Sampled empty cell at ${nextCell.tileX},${nextCell.tileY}. Brush set to eraser.`);
    }

    setBrushEyedropperActive(false);
  }

  function clearLayer(layerIndex: number) {
    if (!activeMapSlug) {
      return;
    }

    const nextLayers = draftLayers.map((layerCells, index) =>
      index === layerIndex ? createEmptyMapCells(mapWidth, mapHeight) : layerCells.map((row) => row.slice())
    );
    setMapDraftLayers(activeMapSlug, nextLayers, mapWidth, mapHeight);
  }

  function applyAiMaskCell(nextCell: TileCell, tool: Extract<MapAiTool, "erase" | "mask">) {
    const cellKey = getMapCellKey(nextCell.tileX, nextCell.tileY);

    if (lastPaintedCellKeyRef.current === cellKey) {
      return;
    }

    lastPaintedCellKeyRef.current = cellKey;
    setMaskedCells((currentCells) => {
      const nextCells = new Set(currentCells);

      if (tool === "mask") {
        nextCells.add(cellKey);
      } else {
        nextCells.delete(cellKey);
      }

      return nextCells;
    });
  }

  function finalizeAiSelection(anchorCell: TileCell, focusCell: TileCell) {
    const nextSelection = getAiSelectionFromCells(anchorCell, focusCell);

    setAiSelection(nextSelection);
    setAiSelectionDraft(null);
    setAiPreviewSnapshot({
      assetImageUrls: [...tileSlotUrls, ...spriteThumbnailUrls].filter(Boolean),
      layerVisibilities: [...layerVisibilities],
      layers: cloneMapLayers(draftLayers),
      maskedCells: new Set(maskedCells),
      selection: nextSelection
    });
    setIsAiModalOpen(true);
    setMapStatus(
      `Prepared AI selection ${formatAiSelectionSize(nextSelection)} from ${nextSelection.tileWidth}x${nextSelection.tileHeight} tiles.`
    );
  }

  function getClampedMapCellFromClientPoint(clientX: number, clientY: number): TileCell | null {
    const mapCanvas = mapCanvasRef.current;

    if (!mapCanvas || mapWidth <= 0 || mapHeight <= 0) {
      return null;
    }

    const rect = mapCanvas.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const scaleX = mapCanvas.width / rect.width;
    const scaleY = mapCanvas.height / rect.height;
    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;

    return {
      tileX: getClampedTileIndex(canvasX, mapWidth),
      tileY: getClampedTileIndex(canvasY, mapHeight)
    };
  }

  function beginPaint() {
    drawingRef.current = true;
    lastPaintedCellKeyRef.current = "";
  }

  function finishPaint() {
    drawingRef.current = false;
    lastPaintedCellKeyRef.current = "";
  }

  function handlePointerUpdate(event: React.MouseEvent<HTMLCanvasElement>) {
    const nextCell = getMapCellFromPointerEvent(
      event.currentTarget,
      event.nativeEvent,
      mapWidth,
      mapHeight
    );

    setHoverCell(nextCell);

    if (activeSidebarTab === "ai") {
      if (activeAiTool === "select") {
        if (drawingRef.current && nextCell && aiSelectionDraft) {
          setAiSelectionDraft({
            ...aiSelectionDraft,
            focusCell: nextCell
          });
        }

        return;
      }

      if (!drawingRef.current || !nextCell) {
        return;
      }

      applyAiMaskCell(nextCell, activeAiTool);
      return;
    }

    if (!drawingRef.current || !nextCell) {
      return;
    }

    const cellKey = `${nextCell.tileX},${nextCell.tileY}`;

    if (lastPaintedCellKeyRef.current === cellKey) {
      return;
    }

    lastPaintedCellKeyRef.current = cellKey;
    paintCell(nextCell);
  }

  function handleCreateMap() {
    const nextName = normalizedNewMapName;

    if (!nextName) {
      setMapStatus("Name the map before creating it.");
      return;
    }

    setBusyLabel("Creating map");

    startTransition(() => {
      void createMapAction(nextName, normalizedNewMapWidth, normalizedNewMapHeight)
        .then((createdMap) => {
          upsertMap(createdMap);
          setMapDraftLayers(createdMap.slug, createdMap.layers, createdMap.width, createdMap.height);
          setIsCreateDialogOpen(false);
          setNewMapName("");
          setNewMapWidth(String(MAP_DEFAULT_GRID_SIZE));
          setNewMapHeight(String(MAP_DEFAULT_GRID_SIZE));
          setActiveMapSlug(createdMap.slug);
          setActiveSidebarTab("brushes");
          setIsEditingSelectedMap(true);
          setMapStatus(`Created ${createdMap.name} (${createdMap.width}x${createdMap.height}).`);
        })
        .catch((error: unknown) => {
          setMapStatus(error instanceof Error ? error.message : "Could not create map.");
        })
        .finally(() => {
          setBusyLabel("");
      });
    });
  }

  function handleResizeMap() {
    if (!activeMap) {
      setMapStatus("Choose a map before resizing.");
      return;
    }

    const nextWidth = normalizedResizeMapWidth;
    const nextHeight = normalizedResizeMapHeight;

    if (nextWidth < mapWidth || nextHeight < mapHeight) {
      setMapStatus("Reducing map size is not supported yet.");
      return;
    }

    if (nextWidth === mapWidth && nextHeight === mapHeight) {
      setMapStatus(`Map is already ${mapWidth}x${mapHeight}.`);
      setIsResizeDialogOpen(false);
      return;
    }

    let nextLayers: typeof draftLayers;

    try {
      nextLayers = resizeMapLayersExpandingEdges(
        draftLayers,
        mapWidth,
        mapHeight,
        nextWidth,
        nextHeight
      );
    } catch (error) {
      setMapStatus(error instanceof Error ? error.message : "Could not resize map.");
      return;
    }

    if (saveConfirmationTimeoutRef.current !== null) {
      window.clearTimeout(saveConfirmationTimeoutRef.current);
      saveConfirmationTimeoutRef.current = null;
    }

    setSaveConfirmationMessage("");
    setBusyLabel("Resizing map");

    void renderMiniMapDataUrl(nextLayers, nextWidth, nextHeight)
      .then((miniMap) => {
        startTransition(() => {
          void resizeMapAction({
            aboutPrompt: activeMapAboutPrompt,
            currentHeight: mapHeight,
            currentWidth: mapWidth,
            height: nextHeight,
            isInstance: activeMap.isInstance,
            layers: nextLayers,
            miniMap,
            name: activeMap.name,
            slug: activeMap.slug,
            width: nextWidth
          })
            .then((savedMap) => {
              upsertMap(savedMap);
              setMapDraftLayers(savedMap.slug, savedMap.layers, savedMap.width, savedMap.height);
              setMapAboutPromptDrafts((currentDrafts) => ({
                ...currentDrafts,
                [savedMap.slug]: savedMap.aboutPrompt
              }));
              setIsResizeDialogOpen(false);
              setMapStatus(
                `Resized ${savedMap.name} to ${savedMap.width}x${savedMap.height} at ${savedMap.updatedAt}.`
              );
              setSaveConfirmationMessage("map resized");
              saveConfirmationTimeoutRef.current = window.setTimeout(() => {
                setSaveConfirmationMessage("");
                saveConfirmationTimeoutRef.current = null;
              }, 3000);
            })
            .catch((error: unknown) => {
              setMapStatus(error instanceof Error ? error.message : "Could not resize map.");
            })
            .finally(() => {
              setBusyLabel("");
            });
        });
      })
      .catch((error: unknown) => {
        setMapStatus(error instanceof Error ? error.message : "Could not render map mini-map.");
        setBusyLabel("");
      });
  }

  function handleSaveMap() {
    if (!activeMap) {
      setMapStatus("Choose a map before saving.");
      return;
    }

    if (saveConfirmationTimeoutRef.current !== null) {
      window.clearTimeout(saveConfirmationTimeoutRef.current);
      saveConfirmationTimeoutRef.current = null;
    }

    setSaveConfirmationMessage("");
    setBusyLabel("Saving map");

    void renderMiniMapDataUrl()
      .then((miniMap) => {
        startTransition(() => {
          void saveMapAction({
            aboutPrompt: activeMapAboutPrompt,
            height: mapHeight,
            isInstance: activeMap.isInstance,
            layers: draftLayers,
            miniMap,
            name: activeMap.name,
            slug: activeMap.slug,
            width: mapWidth
          })
            .then((savedMap) => {
              upsertMap(savedMap);
              setMapDraftLayers(savedMap.slug, savedMap.layers, savedMap.width, savedMap.height);
              setMapAboutPromptDrafts((currentDrafts) => ({
                ...currentDrafts,
                [savedMap.slug]: savedMap.aboutPrompt
              }));
              setMapStatus(
                `Saved ${savedMap.name} (${savedMap.width}x${savedMap.height}) at ${savedMap.updatedAt}.`
              );
              setSaveConfirmationMessage("map saved");
              saveConfirmationTimeoutRef.current = window.setTimeout(() => {
                setSaveConfirmationMessage("");
                saveConfirmationTimeoutRef.current = null;
              }, 3000);
            })
            .catch((error: unknown) => {
              setMapStatus(error instanceof Error ? error.message : "Could not save map.");
            })
            .finally(() => {
              setBusyLabel("");
            });
        });
      })
      .catch((error: unknown) => {
        setMapStatus(error instanceof Error ? error.message : "Could not render map mini-map.");
        setBusyLabel("");
      });
  }

  function handleExportTerrain() {
    if (!activeMap) {
      setMapStatus("Choose a map before exporting terrain.");
      return;
    }

    setBusyLabel("Exporting terrain");

    void renderTerrainExportDataUrl()
      .then((dataUrl) => exportTerrainMapAction({ dataUrl }))
      .then(() => {
        setMapStatus(`Exported terrain for ${activeMap.name} to ./output/current_map.png.`);
      })
      .catch((error: unknown) => {
        setMapStatus(error instanceof Error ? error.message : "Could not export the terrain map.");
      })
      .finally(() => {
        setBusyLabel("");
      });
  }

  function handleSaveZoneEvent() {
    if (!activeMap || !activeZoneEventOption || isZoneEventSaving) {
      return;
    }

    const validationResult = validateLuaScript(zoneEventDraft.luaScript);

    if (!validationResult.ok) {
      setZoneEventLuaAnnotations(createLuaErrorAnnotations(validationResult));
      setZoneEventStatus(validationResult.error.message);
      return;
    }

    setZoneEventLuaAnnotations([]);
    setZoneEventSaving(true);
    setZoneEventStatus("");

    void (async () => {
      try {
        const createdOrExistingEvent =
          activeZoneEvent ??
          (await createMapZoneEventAction({
            eventName: activeZoneEventOption.eventName,
            mapName: activeMap.name
          }));
        const savedEvent =
          createdOrExistingEvent.enabled === zoneEventDraft.enabled &&
          createdOrExistingEvent.lua_script === zoneEventDraft.luaScript
            ? createdOrExistingEvent
            : await saveMapZoneEventAction({
                enabled: zoneEventDraft.enabled,
                eventName: activeZoneEventOption.eventName,
                id: createdOrExistingEvent.id,
                luaScript: zoneEventDraft.luaScript,
                mapName: activeMap.name
              });

        setZoneEvents((currentEvents) =>
          sortLuaEvents(
            [
              ...currentEvents.filter((eventRecord) => eventRecord.id !== savedEvent.id),
              savedEvent
            ],
            (eventRecord) => eventRecord.zone_event
          )
        );
        setZoneEventDraft(createLuaEventDraft(savedEvent));
        setZoneEventStatus("Event saved.");
      } catch (error: unknown) {
        setZoneEventStatus(error instanceof Error ? error.message : "Could not save zone event.");
      } finally {
        setZoneEventSaving(false);
      }
    })();
  }

  function handleFormatZoneEventLua() {
    const validationResult = validateLuaScript(zoneEventDraft.luaScript);

    if (!validationResult.ok) {
      setZoneEventLuaAnnotations(createLuaErrorAnnotations(validationResult));
      setZoneEventStatus(validationResult.error.message);
      return;
    }

    setZoneEventFormatting(true);
    setZoneEventLuaAnnotations([]);
    setZoneEventStatus("");

    void formatLuaScript(zoneEventDraft.luaScript)
      .then((formattedScript) => {
        setZoneEventDraft((currentDraft) => ({
          ...currentDraft,
          luaScript: formattedScript
        }));
        setZoneEventStatus("Lua formatted.");
      })
      .catch((error: unknown) => {
        setZoneEventStatus(error instanceof Error ? error.message : "Could not format Lua script.");
      })
      .finally(() => {
        setZoneEventFormatting(false);
      });
  }

  function updateAiModelStatus(
    modelId: string,
    nextStatus: Partial<MapAiModelStatus> & Pick<MapAiModelStatus, "status">
  ) {
    setAiModelStatuses((currentStatuses) =>
      currentStatuses.map((status) =>
        status.modelId === modelId
          ? {
              ...status,
              ...nextStatus
            }
          : status
      )
    );
  }

  function handleSubmitAiEdit() {
    if (!activeMap) {
      setAiPreviewStatus("Choose a map before submitting an AI edit.");
      return;
    }

    if (!aiPreviewImageUrl || !aiPreviewMaskUrl || !aiSelection) {
      setAiPreviewStatus("Create an AI selection before submitting.");
      return;
    }

    if (!aiPrompt.trim()) {
      setAiPreviewStatus("Description is required before submitting.");
      return;
    }

    setIsAiModalOpen(false);
    setIsAiRunningModalOpen(true);
    setAiSubmitting(false);
    setAiPreviewStatus("Choose one or more models, then press Start.");
    setAiRunDirectoryName("");
    setAiSelectedModelIds(getDefaultAiSelectedModelIds());
    setAiModelStatuses(createInitialAiModelStatuses());
  }

  async function handleStartAiEdit() {
    if (!activeMap) {
      setAiPreviewStatus("Choose a map before starting an AI edit.");
      return;
    }

    if (!aiPreviewImageUrl || !aiPreviewMaskUrl || !aiSelection) {
      setAiPreviewStatus("Create an AI selection before starting.");
      return;
    }

    if (!aiPrompt.trim()) {
      setAiPreviewStatus("Description is required before starting.");
      return;
    }

    if (!aiSelectedModelIds.length) {
      setAiPreviewStatus("Select at least one model before starting.");
      return;
    }

    const selectedModelIds = [...aiSelectedModelIds];

    setAiSubmitting(true);
    setAiPreviewStatus("Preparing AI run folder...");
    setAiRunDirectoryName("");
    setAiModelStatuses(
      MAP_AI_SUPPORTED_MODELS.map((model) => ({
        detail: selectedModelIds.includes(model.id)
          ? model.supportsNegativePrompt
            ? "Queued with prompt, image, mask, and optional negative prompt."
            : "Queued with prompt, image, and mask."
          : "Not selected for this run.",
        modelId: model.id,
        modelLabel: model.label,
        requestId: "",
        status: selectedModelIds.includes(model.id) ? "idle" : "skipped"
      }))
    );

    try {
      const selectionSummary = toMapAiSelectionSummary(aiSelection);
      const preparedRun = await prepareMapAiRunAction({
        imageDataUrl: aiPreviewImageUrl,
        mapName: activeMap.name,
        mapSlug: activeMap.slug,
        maskDataUrl: aiPreviewMaskUrl,
        negativePrompt: aiNegativePrompt,
        prompt: aiPrompt,
        selection: selectionSummary
      });

      setAiRunDirectoryName(preparedRun.runDirectoryName);

      for (const modelId of selectedModelIds) {
        const model = MAP_AI_SUPPORTED_MODELS.find((candidate) => candidate.id === modelId);

        if (!model) {
          continue;
        }

        updateAiModelStatus(model.id, {
          detail: `Submitting ${model.label}...`,
          requestId: "",
          status: "running"
        });
        setAiPreviewStatus(`Running ${model.label}...`);

        try {
          const result = await runMapAiModelAction({
            imageDataUrl: aiPreviewImageUrl,
            mapName: activeMap.name,
            mapSlug: activeMap.slug,
            maskDataUrl: aiPreviewMaskUrl,
            modelId: model.id,
            negativePrompt: aiNegativePrompt,
            prompt: aiPrompt,
            runDirectoryName: preparedRun.runDirectoryName,
            selection: selectionSummary
          });

          updateAiModelStatus(model.id, {
            detail: `Saved output to ${result.outputImagePath} in ${Math.round(result.durationMs)}ms.`,
            requestId: result.requestId,
            status: "success"
          });
        } catch (error) {
          updateAiModelStatus(model.id, {
            detail: error instanceof Error ? error.message : "Model run failed.",
            requestId: "",
            status: "error"
          });
        }
      }

      setAiPreviewStatus(`Completed AI run in ../output/tile_map_ai/${preparedRun.runDirectoryName}/`);
      setMapStatus(`Completed AI run for ${activeMap.name}.`);
    } catch (error) {
      setAiPreviewStatus(error instanceof Error ? error.message : "Could not submit the AI edit.");
      setIsAiRunningModalOpen(true);
    } finally {
      setAiSubmitting(false);
    }
  }

  const currentScale =
    mapScalePercent ?? mapScalePercentRef.current ?? MAP_MIN_SCALE_PERCENT;
  const selectedLayer = TILE_LIBRARY_LAYERS[activeLayerIndex] ?? TILE_LIBRARY_LAYERS[0];
  const selectedLayerFolder = selectedLayer?.folder ?? "";
  const normalizedBrushLibraryPath = normalizeTileLibraryPath(brushLibraryPath);
  const currentBrushLibraryPath =
    normalizedBrushLibraryPath === selectedLayerFolder ||
    normalizedBrushLibraryPath.startsWith(`${selectedLayerFolder}/`)
      ? normalizedBrushLibraryPath
      : selectedLayerFolder;
  const currentBrushPathSegments = splitTileLibraryPath(currentBrushLibraryPath);
  const brushLibraryParentPath = getTileLibraryParentPath(currentBrushLibraryPath);
  const isAtBrushLayerRoot = currentBrushLibraryPath === selectedLayerFolder;
  const activeBrushTile = tiles.find((tileRecord) => tileRecord.slug === activeBrushTileSlug) ?? null;
  const activeBrushSprite = spritesByKey.get(activeBrushSpriteKey) ?? null;
  const aiSelectedModelCount = aiSelectedModelIds.length;
  const activeLayerTitle = `${activeLayerIndex} - ${TILE_LIBRARY_LAYERS[activeLayerIndex]?.description ?? "Layer"}`;
  const activeOpacityValue = layerVisibilities[activeLayerIndex] ?? 1;
  const activeBrushTileSlots = activeBrushTile ? tileSlotsBySlug.get(activeBrushTile.slug) ?? [] : [];
  const availableBrushSlotOptions = activeBrushTileSlots.flatMap((slotRecord, slotNum) =>
    slotRecord?.pixels
      ? [
          {
            label: getSlotLabel(slotNum),
            previewUrl: slotRecord.pixels,
            slotNum
          }
        ]
      : []
  );
  const selectedBrushLabel = activeBrushTile
    ? [activeBrushTile.name, getSlotLabel(activeBrushTileSlotNum), ...brushOptionLabels].join(" • ")
    : activeBrushSprite
      ? `${activeBrushSprite.name} • Sprite`
      : "Eraser";
  const aiSelectionSizeLabel = formatAiSelectionSize(aiSelection);
  const aiModeLabel = `AI: ${AI_TOOL_OPTIONS.find((option) => option.id === activeAiTool)?.label ?? "Mask"}`;
  const activeModeLabel =
    activeSidebarTab === "ai"
      ? aiModeLabel
      : isBrushEyedropperActive
        ? "Brush: eyedropper"
      : activeBrushTile || activeBrushSprite
        ? `Brush: ${selectedBrushLabel}`
        : "Brush: eraser";
  const canvasDescription =
    activeSidebarTab === "ai"
      ? `Use ${AI_TOOL_OPTIONS.find((option) => option.id === activeAiTool)?.label ?? "Mask"} on the ${mapWidth}x${mapHeight} map canvas. The scale controls only change the viewing size.`
      : isBrushEyedropperActive
        ? `Click a cell on the ${mapWidth}x${mapHeight} layered map canvas to sample its brush and return to painting.`
      : `Paint directly on the ${mapWidth}x${mapHeight} layered map canvas. The scale controls only change the viewing size.`;
  const mapCursorClassName = activeSidebarTab === "ai" || isBrushEyedropperActive ? "cursor-crosshair" : "";
  const filteredMaps = maps.filter((mapRecord) => {
    if (!deferredMapQuery) {
      return true;
    }

    return (
      mapRecord.name.toLowerCase().includes(deferredMapQuery) ||
      mapRecord.slug.toLowerCase().includes(deferredMapQuery)
    );
  });
  const allBrushFolderPaths = Array.from(
    new Set([
      ...tileLibraryFolders,
      ...tiles.flatMap((tileRecord) => {
        const tilePathSegments = splitTileLibraryPath(tileRecord.path);
        return tilePathSegments.map((_, index) => tilePathSegments.slice(0, index + 1).join("/"));
      }),
      ...sprites.flatMap((spriteRecord) => {
        const spritePathSegments = splitTileLibraryPath(spriteRecord.path);
        return spritePathSegments.map((_, index) => spritePathSegments.slice(0, index + 1).join("/"));
      })
    ])
  ).filter(
    (folderPath) => folderPath === selectedLayerFolder || folderPath.startsWith(`${selectedLayerFolder}/`)
  );
  const visibleBrushFolders = allBrushFolderPaths
    .filter((folderPath) => {
      if (folderPath === currentBrushLibraryPath) {
        return false;
      }

      const folderSegments = splitTileLibraryPath(folderPath);

      if (folderSegments.length !== currentBrushPathSegments.length + 1) {
        return false;
      }

      return currentBrushPathSegments.every((segment, index) => folderSegments[index] === segment);
    })
    .sort((left, right) => left.localeCompare(right));
  const visibleBrushTiles = tiles
    .filter((tileRecord) => {
      const tilePath = normalizeTileLibraryPath(tileRecord.path);

      return tilePath === currentBrushLibraryPath;
    })
    .slice()
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.slug.localeCompare(right.slug)
    );
  const visibleBrushSprites = sprites
    .filter((spriteRecord) => {
      const spritePath = normalizeTileLibraryPath(spriteRecord.path);

      return spritePath === currentBrushLibraryPath;
    })
    .slice()
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.filename.localeCompare(right.filename)
    );

  useEffect(() => {
    setBrushLibraryPath(selectedLayerFolder);
  }, [selectedLayerFolder]);

  function handleOpenMapForEditing(mapSlug: string) {
    setActiveMapSlug(mapSlug);
    setActiveSidebarTab("brushes");
    setIsEditingSelectedMap(true);
  }

  function handleBackToMapSelection() {
    setActiveSidebarTab("brushes");
    setIsEditingSelectedMap(false);
  }

  const eventEditorPanel = (
    <Panel
      className="xl:h-[calc(100vh-7rem)]"
      description={
        activeZoneEventOption
          ? `${activeMap?.name ?? ""} • ${activeZoneEventOption.eventName}`
          : activeMap
            ? `Select a zone event for ${activeMap.name}.`
            : "Choose a map before editing zone events."
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          {zoneEventStatus ? (
            <div
              className={
                zoneEventStatus === "Event saved." ||
                zoneEventStatus === "Lua formatted."
                  ? "text-sm theme-text-muted"
                  : "text-sm text-[#b42318]"
              }
            >
              {zoneEventStatus}
            </div>
          ) : (
            <div />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              className={secondaryButtonClass}
              onClick={openLuaScriptingGuide}
              type="button"
            >
              Scripting Guide
            </button>
            <button
              className={secondaryButtonClass}
              disabled={!activeZoneEventOption || isZoneEventSaving || isZoneEventFormatting}
              onClick={handleFormatZoneEventLua}
              type="button"
            >
              {isZoneEventFormatting ? "Formatting..." : "Format Lua"}
            </button>
            <button
              className={actionButtonClass}
              disabled={!activeZoneEventOption || isZoneEventSaving || isZoneEventFormatting}
              onClick={handleSaveZoneEvent}
              type="button"
            >
              {isZoneEventSaving ? "Saving..." : "Save Event"}
            </button>
          </div>
        </div>
      }
      title={activeZoneEventOption ? activeZoneEventOption.eventName : "Event Editor"}
    >
      {activeZoneEventOption ? (
        <div className="grid min-h-0 gap-4 overflow-y-auto pr-1">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_10rem]">
            <div className="grid gap-1">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] theme-text-muted">
                Event Name
              </span>
              <div className="font-mono text-sm theme-text-primary">{activeZoneEventOption.eventName}</div>
            </div>

            <label className="flex items-end gap-2 pb-3 text-sm theme-text-muted">
              <input
                checked={zoneEventDraft.enabled}
                onChange={(event) => {
                  setZoneEventDraft((currentDraft) => ({
                    ...currentDraft,
                    enabled: event.currentTarget.checked
                  }));
                  setZoneEventLuaAnnotations([]);
                  if (zoneEventStatus) {
                    setZoneEventStatus("");
                  }
                }}
                type="checkbox"
              />
              Enabled
            </label>
          </div>

          <LuaEventDefinitionHelp eventDefinition={activeZoneEventOption.definition} />

          <div className="grid gap-3">
            <SectionEyebrow>Lua Script</SectionEyebrow>
            <div className="overflow-hidden border theme-border-panel">
              <AceEditor
                className="w-full"
                enableBasicAutocompletion={enableBasicAutocompletion}
                enableLiveAutocompletion={enableLiveAutocompletion}
                enableSnippets={enableSnippets}
                fontSize={13}
                height="640px"
                mode="lua"
                name={`map-zone-event-lua-${activeZoneEventOption.eventName}`}
                onChange={(value) => {
                  setZoneEventDraft((currentDraft) => ({
                    ...currentDraft,
                    luaScript: value
                  }));
                  setZoneEventLuaAnnotations([]);
                  if (zoneEventStatus) {
                    setZoneEventStatus("");
                  }
                }}
                annotations={zoneEventLuaAnnotations}
                onLoad={handleLuaEditorLoad}
                setOptions={{
                  showFoldWidgets: false,
                  tabSize: 2,
                  useWorker: false,
                  useSoftTabs: true
                }}
                theme="tomorrow_night"
                value={zoneEventDraft.luaScript}
                width="100%"
                wrapEnabled
              />
            </div>
            {luaHelperWarning ? <div className="text-sm text-[#b42318]">{luaHelperWarning}</div> : null}
            {!luaHelperWarning && zoneEventDefinitionWarning ? (
              <div className="text-sm text-[#b42318]">{zoneEventDefinitionWarning}</div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex min-h-[20rem] items-center justify-center text-sm theme-text-muted">
          Select an event to edit.
        </div>
      )}
    </Panel>
  );

  const mapCanvasPanel = (
    <Panel
      actions={
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={actionButtonClass}
              disabled={!activeMap || !hasMapDraftChanges || Boolean(busyLabel)}
              onClick={handleSaveMap}
              type="button"
            >
              Save Map
            </button>
            <button
              className={secondaryButtonClass}
              disabled={!activeMap || Boolean(busyLabel)}
              onClick={() => {
                setResizeMapWidth(String(mapWidth));
                setResizeMapHeight(String(mapHeight));
                setIsResizeDialogOpen(true);
              }}
              type="button"
            >
              Resize
            </button>
          </div>
          {saveConfirmationMessage ? (
            <div className="text-xs font-medium theme-text-muted">
              {saveConfirmationMessage}
            </div>
          ) : null}
        </div>
      }
      description={canvasDescription}
      footer={
        <div className="flex flex-wrap items-center gap-3">
          <div className={statusChipClass}>
            {busyLabel ? `${busyLabel}...` : activeModeLabel}
          </div>
          {activeSidebarTab === "ai" ? (
            <div className={statusChipClass}>Selection: {aiSelectionSizeLabel}</div>
          ) : null}
        </div>
      }
      title="Map Canvas"
    >
      <MapWorkspace
        activeLayerIndex={activeLayerIndex}
        activeModeLabel={activeModeLabel}
        activeMapAboutPrompt={activeMapAboutPrompt}
        activeSidebarTab={activeSidebarTab}
        activeAiTool={activeAiTool}
        activeBrushSlotNum={activeBrushTileSlotNum}
        activeLayerTitle={activeLayerTitle}
        activeOpacityValue={activeOpacityValue}
        brushSlotOptions={availableBrushSlotOptions}
        canZoomIn={currentScale > MAP_MIN_SCALE_PERCENT}
        canZoomOut={currentScale < MAP_MAX_SCALE_PERCENT}
        hoverCanvasRef={hoverCanvasRef}
        isGridVisible={isGridVisible}
        layerPreviewCanvasRefs={layerPreviewCanvasRefs}
        layerVisibilities={layerVisibilities}
        mapCanvasHeight={mapCanvasHeight}
        mapCanvasRef={mapCanvasRef}
        mapCanvasWidth={mapCanvasWidth}
        mapCursorClassName={mapCursorClassName}
        mapFrameRef={mapFrameRef}
        onCanvasClick={() => {}}
        onCanvasMouseDown={(event) => {
          const nextCell = getMapCellFromPointerEvent(
            event.currentTarget,
            event.nativeEvent,
            mapWidth,
            mapHeight
          );

          if (!nextCell) {
            return;
          }

          setHoverCell(nextCell);

          if (activeSidebarTab === "ai") {
            beginPaint();

            if (activeAiTool === "select") {
              setAiSelectionDraft({
                anchorCell: nextCell,
                focusCell: nextCell
              });
              return;
            }

            applyAiMaskCell(nextCell, activeAiTool);
            return;
          }

          if (isBrushEyedropperActive) {
            sampleBrushFromCell(nextCell);
            return;
          }

          if (event.shiftKey && paintLineFromLastPlacement(nextCell)) {
            return;
          }

          beginPaint();
          paintCell(nextCell);
          lastPaintedCellKeyRef.current = getMapCellKey(nextCell.tileX, nextCell.tileY);
        }}
        onCanvasMouseLeave={() => {
          if (activeSidebarTab === "ai" && activeAiTool === "select" && drawingRef.current) {
            return;
          }

          finishPaint();
          setHoverCell(null);
        }}
        onCanvasMouseMove={handlePointerUpdate}
        onCanvasMouseUp={() => {
          if (activeSidebarTab === "ai" && activeAiTool === "select") {
            return;
          }

          finishPaint();
        }}
        onChangeActiveMapAboutPrompt={(value) => {
          if (!activeMap) {
            return;
          }

          setMapAboutPromptDrafts((currentDrafts) => ({
            ...currentDrafts,
            [activeMap.slug]: value
          }));
        }}
        onClearAllLayers={() => {
          setMapDraftLayers(activeMapSlug, createEmptyMapLayers(mapWidth, mapHeight), mapWidth, mapHeight);
          setMapStatus(`Cleared every layer from the current draft map (${mapWidth}x${mapHeight}).`);
        }}
        onClearLayer={(layerIndex) => {
          clearLayer(layerIndex);
          setMapStatus(`Cleared ${TILE_LIBRARY_LAYERS[layerIndex]?.description ?? `Layer ${layerIndex}`}.`);
        }}
        onSelectBrushSlot={(slotNum) => {
          if (!activeBrushTile) {
            return;
          }

          setMapBrushAssetKey(getTileBrushAssetKeyWithSlot(activeBrushTile.slug, slotNum));
        }}
        onSelectLayer={setActiveLayerIndex}
        onSetLayerVisibility={(layerIndex, visibility) => {
          setLayerVisibilities((currentVisibilities) => {
            const nextVisibilities = currentVisibilities.slice();
            nextVisibilities[layerIndex] = visibility;
            return nextVisibilities;
          });
        }}
        onToggleGridVisibility={() => {
          setGridVisible((currentValue) => !currentValue);
        }}
        onZoomActual={() => {
          setMapScalePercent(100);
        }}
        onZoomIn={() => {
          setMapScalePercent((value) =>
            clampMapScalePercent(
              (value ??
                getAutoFitMapScalePercent(
                  mapFrameRef.current,
                  mapCanvasWidth,
                  mapCanvasHeight
                )) +
                MAP_SCALE_STEP_PERCENT
            )
          );
        }}
        onZoomOut={() => {
          setMapScalePercent((value) =>
            clampMapScalePercent(
              (value ??
                getAutoFitMapScalePercent(
                  mapFrameRef.current,
                  mapCanvasWidth,
                  mapCanvasHeight
                )) -
                MAP_SCALE_STEP_PERCENT
            )
          );
        }}
        previewCanvasRef={previewCanvasRef}
        scalePercent={currentScale}
        selectedBrushLabel={selectedBrushLabel}
      />
    </Panel>
  );

  const editingWorkspacePanel = activeSidebarTab === "events" ? eventEditorPanel : mapCanvasPanel;

  return (
    <div className="min-h-0">
      <div
        className={`grid min-h-0 gap-4 ${
          isEditingMap ? "xl:grid-cols-[20rem_minmax(0,1fr)]" : "xl:grid-cols-[minmax(20rem,28rem)]"
        }`}
      >
        <div className="min-h-0 xl:h-[calc(100vh-7rem)]">
          <Panel
            className="h-full"
            actions={
              isEditingMap ? (
                <button className={secondaryButtonClass} onClick={handleBackToMapSelection} type="button">
                  Back
                </button>
              ) : (
                <button
                  className={actionButtonClass}
                  onClick={() => {
                    setIsCreateDialogOpen(true);
                  }}
                  type="button"
                >
                  Create
                </button>
              )
            }
            description={isEditingMap ? (activeMap?.name ?? "") : "Choose an existing map or create a new one."}
            title={isEditingMap ? "Editing Map" : "Map Tools"}
          >
            {!isEditingMap ? (
              <>
                <div className="flex flex-col items-stretch gap-2">
                  <input
                    autoComplete="off"
                    className={`${textInputClass} min-w-0 w-full`}
                    onChange={(event) => {
                      setMapQuery(event.currentTarget.value);
                    }}
                    placeholder="Filter maps"
                    suppressHydrationWarning
                    value={mapQuery}
                  />
                </div>
                <div className={scrollableAssetListClass}>
                  {filteredMaps.map((mapRecord) => (
                    <button
                      className={assetListRowClass(hasMounted && mapRecord.slug === activeMapSlug)}
                      key={mapRecord.slug}
                      onClick={() => {
                        handleOpenMapForEditing(mapRecord.slug);
                      }}
                      type="button"
                    >
                      <div className={assetListMetaClass}>
                        <strong className={assetListTitleClass}>{mapRecord.name}</strong>
                        <span className={assetListMonoClass}>
                          {mapRecord.slug} • {mapRecord.width}x{mapRecord.height}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                {!filteredMaps.length ? (
                  <div className="text-sm theme-text-muted">No maps match that filter.</div>
                ) : null}
              </>
            ) : (
              <>
                <div className="panel-tabs">
                  <button
                    className={panelTabButtonClass(activeSidebarTab === "events")}
                    onClick={() => {
                      setActiveSidebarTab("events");
                    }}
                    type="button"
                  >
                    Events
                  </button>
                  <button
                    className={panelTabButtonClass(activeSidebarTab === "brushes")}
                    onClick={() => {
                      setActiveSidebarTab("brushes");
                    }}
                    type="button"
                  >
                    Brushes
                  </button>
                  <button
                    className={panelTabButtonClass(activeSidebarTab === "ai")}
                    onClick={() => {
                      setActiveSidebarTab("ai");
                    }}
                    type="button"
                  >
                    AI
                  </button>
                </div>

                {activeSidebarTab === "events" ? (
                  <div className="grid min-h-0 gap-3">
                    <div className="grid min-h-0 gap-2">
                      <SectionEyebrow>Events</SectionEyebrow>
                      <div className={scrollableAssetListClass}>
                        {zoneEventOptions.map((eventOption) => {
                          const isConfigured = Boolean(eventOption.record);
                          const displayColor = isConfigured ? "#000000" : "#909090";

                          return (
                            <button
                              className={assetListRowClass(eventOption.eventName === activeZoneEventName)}
                              key={eventOption.eventName}
                              onClick={() => {
                                setActiveZoneEventName(eventOption.eventName);
                                setZoneEventStatus("");
                              }}
                              type="button"
                            >
                              <div className={assetListMetaClass}>
                                <span className={assetListTitleClass} style={{ color: displayColor }}>
                                  {eventOption.eventName}
                                </span>
                                <span className={assetListSubtitleClass} style={{ color: displayColor }}>
                                  {isConfigured
                                    ? eventOption.record?.enabled
                                      ? "Configured • Enabled"
                                      : "Configured • Disabled"
                                    : "Available • Not configured"}
                                </span>
                                <span className={assetListSubtitleClass} style={{ color: displayColor }}>
                                  {eventOption.description || "No helper description is available for this event."}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {isZoneEventsLoading ? (
                      <div className="text-sm theme-text-muted">Loading zone events...</div>
                    ) : null}
                    {!isZoneEventsLoading && activeMap && !zoneEventOptions.length ? (
                      <div className={emptyStateCardClass}>No events are available for {activeMap.name}.</div>
                    ) : null}
                    {zoneEventStatus && zoneEventStatus !== "Event saved." ? (
                      <div className="text-sm text-[#b42318]">{zoneEventStatus}</div>
                    ) : null}
                  </div>
                ) : activeSidebarTab === "brushes" ? (
                  <div className="grid min-h-0 gap-3">
                    <div className={`grid gap-2 ${activeBrushTile ? "" : "opacity-65"}`}>
                      <SectionEyebrow>Brush Effects</SectionEyebrow>
                      <div className="text-xs theme-text-muted">
                        {activeBrushTile
                          ? "Flip, rotate, multiply, and tint apply to tile brushes."
                          : "Tile effects are disabled for sprite brushes."}
                      </div>
                      <div className={compactBrushEffectsClass}>
                        {BRUSH_OPTION_DEFINITIONS.map((option) => (
                          <label key={option.id}>
                            <input
                              checked={brushOptions[option.id]}
                              disabled={!activeBrushTile}
                              onChange={(event) => {
                                const isChecked = event.currentTarget.checked;

                                setBrushOptions((currentOptions) =>
                                  normalizeMapTileOptions({
                                    ...currentOptions,
                                    [option.id]: isChecked
                                  })
                                );
                              }}
                              type="checkbox"
                            />
                            <span>{option.label}</span>
                            {option.id === "color" ? (
                              <input
                                disabled={!activeBrushTile}
                                onChange={(event) => {
                                  const nextColorValue = event.currentTarget.value;

                                  setBrushOptions((currentOptions) =>
                                    normalizeMapTileOptions({
                                      ...currentOptions,
                                      colorValue: nextColorValue
                                    })
                                  );
                                }}
                                type="color"
                                value={brushOptions.colorValue}
                              />
                            ) : null}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="grid min-h-0 gap-2">
                      <SectionEyebrow>Brushes</SectionEyebrow>
                      <div className="text-xs theme-text-muted">
                        {formatTileLibraryPath(currentBrushLibraryPath)}
                      </div>
                      <div className={scrollableAssetListClass}>
                        <button
                          className={assetListRowClass(mapBrushAssetKey === "")}
                          onClick={() => {
                            setBrushEyedropperActive(false);
                            setMapBrushAssetKey("");
                          }}
                          type="button"
                        >
                          <div className={`${assetListThumbClass} theme-bg-brand theme-text-inverse-soft`}>
                            <FontAwesomeIcon className="h-5 w-5" icon={faEraser} title="Erase" />
                          </div>
                          <div className={assetListMetaClass}>
                            <span className={assetListTitleClass}>Eraser</span>
                            <span className={assetListSubtitleClass}>Clear painted cells</span>
                          </div>
                        </button>
                        <button
                          className={assetListRowClass(isBrushEyedropperActive)}
                          onClick={() => {
                            setBrushEyedropperActive(true);
                            setMapStatus("Eyedropper ready. Click a map cell to sample its tile, sprite, and tile effects.");
                          }}
                          type="button"
                        >
                          <div className={`${assetListThumbClass} theme-bg-panel theme-text-primary`}>
                            <FontAwesomeIcon className="h-5 w-5" icon={faEyeDropper} title="Eyedropper" />
                          </div>
                          <div className={assetListMetaClass}>
                            <span className={assetListTitleClass}>Eye Dropper</span>
                            <span className={assetListSubtitleClass}>Sample the next clicked map cell</span>
                          </div>
                        </button>

                        {!isAtBrushLayerRoot ? (
                          <button
                            className={`${assetListRowClass(false)} group theme-hover-border-accent theme-hover-bg-panel`}
                            onClick={() => {
                              setBrushLibraryPath(brushLibraryParentPath || selectedLayerFolder);
                            }}
                            type="button"
                          >
                            <div className={`${assetListThumbClass} theme-bg-panel theme-text-primary transition group-hover:theme-text-accent`}>
                              <FontAwesomeIcon className="h-4 w-4" icon={faFolderArrowUp} />
                            </div>
                            <div className={assetListMetaClass}>
                              <span className={assetListTitleClass}>Back</span>
                              <span className={assetListSubtitleClass}>
                                {getTileLibrarySegmentLabel(brushLibraryParentPath || selectedLayerFolder)}
                              </span>
                            </div>
                            <div className="ml-auto theme-text-muted transition group-hover:theme-text-accent">
                              <FontAwesomeIcon className="h-3.5 w-3.5" icon={faChevronRight} />
                            </div>
                          </button>
                        ) : null}

                        {visibleBrushFolders.length ? <div className={assetListEyebrowClass}>Folders</div> : null}
                        {visibleBrushFolders.map((folderPath) => (
                          <button
                            className={assetListRowClass(false)}
                            key={folderPath}
                            onClick={() => {
                              setBrushLibraryPath(folderPath);
                            }}
                            type="button"
                          >
                            <div className={`${assetListThumbClass} theme-bg-panel theme-text-primary`}>
                              <FontAwesomeIcon className="h-4 w-4" icon={faFolder} />
                            </div>
                            <div className={assetListMetaClass}>
                              <span className={assetListTitleClass}>{getTileLibrarySegmentLabel(folderPath)}</span>
                              <span className={assetListSubtitleClass}>Folder</span>
                              <span className={assetListMonoClass}>{folderPath}</span>
                            </div>
                            <div className="ml-auto theme-text-muted">
                              <FontAwesomeIcon className="h-3.5 w-3.5" icon={faChevronRight} />
                            </div>
                          </button>
                        ))}

                        {visibleBrushTiles.length ? <div className={assetListEyebrowClass}>Tiles</div> : null}
                        {visibleBrushTiles.map((tileRecord) => {
                          const mainSlot = tileMainSlotsBySlug.get(tileRecord.slug) ?? null;

                          return (
                            <div className="relative" key={tileRecord.slug}>
                              <button
                                className={`${assetListRowClass(activeBrushTileSlug === tileRecord.slug)} pr-10`}
                                onClick={() => {
                                  setBrushEyedropperActive(false);
                                  setMapBrushAssetKey(getTileBrushAssetKeyWithSlot(tileRecord.slug, 0));
                                }}
                                type="button"
                              >
                                <CheckerboardFrame className={assetListCheckerThumbClass} size="md">
                                  {mainSlot?.pixels ? (
                                    <img
                                      alt={tileRecord.name}
                                      className="h-full w-full object-contain [image-rendering:pixelated]"
                                      src={mainSlot.pixels}
                                    />
                                  ) : null}
                                </CheckerboardFrame>
                                <div className={assetListMetaClass}>
                                  <span className={assetListTitleClass}>{tileRecord.name}</span>
                                  <span className={assetListMonoClass}>{tileRecord.slug}</span>
                                </div>
                              </button>
                              <button
                                className={`${assetListActionButtonClass} absolute right-1 top-1/2 -translate-y-1/2`}
                                onClick={() => {
                                  setActiveTileSlug(tileRecord.slug);
                                  openPaintEditor(tileRecord, "main");
                                }}
                                title={`Edit ${tileRecord.name} main slot`}
                                type="button"
                              >
                                <FontAwesomeIcon className="h-3.5 w-3.5" icon={faPenToSquare} />
                              </button>
                            </div>
                          );
                        })}

                        {visibleBrushSprites.length ? <div className={assetListEyebrowClass}>Sprites</div> : null}
                        {visibleBrushSprites.map((spriteRecord) => {
                          const spriteKey = getTileLibrarySpriteKey(spriteRecord.path, spriteRecord.filename);

                          return (
                            <button
                              className={assetListRowClass(getSpriteBrushAssetKey(spriteKey) === mapBrushAssetKey)}
                              key={spriteKey}
                              onClick={() => {
                                setBrushEyedropperActive(false);
                                setMapBrushAssetKey(getSpriteBrushAssetKey(spriteKey));
                              }}
                              type="button"
                            >
                              <CheckerboardFrame className={assetListCheckerThumbClass} size="md">
                                {spriteRecord.thumbnail ? (
                                  <img
                                    alt={spriteRecord.name}
                                    className="h-full w-full object-contain"
                                    src={spriteRecord.thumbnail}
                                  />
                                ) : null}
                              </CheckerboardFrame>
                              <div className={assetListMetaClass}>
                                <span className={assetListTitleClass}>{spriteRecord.name}</span>
                                <span className={assetListMonoClass}>{spriteRecord.filename}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {!visibleBrushFolders.length && !visibleBrushTiles.length && !visibleBrushSprites.length ? (
                        <div className={emptyStateCardClass}>
                          No brush assets are available in {formatTileLibraryPath(currentBrushLibraryPath)} yet.
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="grid min-h-0 gap-3">
                    <div className="grid gap-2">
                      {AI_TOOL_OPTIONS.map((toolOption) => {
                        const isActive = activeAiTool === toolOption.id;

                        return (
                          <button
                            className={assetListRowClass(isActive)}
                            key={toolOption.id}
                            onClick={() => {
                              setActiveAiTool(toolOption.id);
                              setMapStatus(
                                toolOption.id === "select"
                                  ? "Drag across the map canvas to create the AI image and edit mask."
                                  : toolOption.id === "mask"
                                    ? "Click or drag on the map canvas to add squares to the AI mask."
                                    : "Click or drag on the map canvas to erase squares from the AI mask."
                              );
                            }}
                            type="button"
                          >
                            <div className={assetListMetaClass}>
                              <span className={assetListTitleClass}>{toolOption.label}</span>
                              <span className={assetListSubtitleClass}>{toolOption.description}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <button
                      className={actionButtonClass}
                      onClick={() => {
                        setActiveAiTool("select");
                        finalizeAiSelection(
                          { tileX: 0, tileY: 0 },
                          { tileX: Math.max(0, mapWidth - 1), tileY: Math.max(0, mapHeight - 1) }
                        );
                      }}
                      type="button"
                    >
                      Select All
                    </button>

                    <div className={sectionCardClass}>
                      <SectionEyebrow>Mask</SectionEyebrow>
                      <div className="text-sm font-semibold theme-text-primary">
                        {maskedCells.size} tiles masked
                      </div>
                      <div className="text-xs leading-5 theme-text-muted">
                        Masked tiles are shown as 80% black over the map, independent of the painted layers beneath them.
                      </div>
                    </div>

                    <div className={sectionCardClass}>
                      <SectionEyebrow>Selection</SectionEyebrow>
                      <div className="text-sm font-semibold theme-text-primary">{aiSelectionSizeLabel}</div>
                      <div className="text-xs leading-5 theme-text-muted">
                        The size label always uses the real tile size of {TILE_SIZE}px, not the current zoom level.
                      </div>
                    </div>

                    <button
                      className={actionButtonClass}
                      disabled={!activeMap || Boolean(busyLabel)}
                      onClick={handleExportTerrain}
                      type="button"
                    >
                      Export Terrain
                    </button>
                  </div>
                )}
              </>
            )}
          </Panel>
        </div>

        {isEditingMap ? editingWorkspacePanel : null}
      </div>

      {isAiModalOpen && aiSelection ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 overflow-y-auto theme-bg-overlay px-4 py-4"
          role="dialog"
        >
          <div
            className="fixed inset-0"
            onClick={() => {
              setIsAiModalOpen(false);
            }}
          />
          <div className="flex min-h-full items-center justify-center">
            <div className={`${modalSurfaceClass} relative max-h-[96vh] max-w-[min(96vw,1580px)] overflow-hidden`}>
              <div className="border-b theme-border-panel-faint px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-serif text-[1.4rem] leading-tight theme-text-primary">
                      AI Edit Prep
                    </h2>
                    <p className="mt-1 text-sm leading-6 theme-text-muted">
                      Selection {formatAiSelectionSize(aiSelection)} scaled into two 1024x1024 outputs.
                    </p>
                  </div>
                  <button
                    className={`${closeButtonClass} min-h-11 min-w-11 theme-bg-panel`}
                    onClick={() => {
                      setIsAiModalOpen(false);
                    }}
                    type="button"
                  >
                    X
                  </button>
                </div>
              </div>

              <div className="grid max-h-[calc(96vh-9rem)] gap-5 overflow-y-auto px-6 py-6">
                <div className="grid gap-5 xl:grid-cols-2">
                  <div className="grid gap-2">
                    <SectionEyebrow>Image</SectionEyebrow>
                    <div className="aspect-square border theme-border-panel theme-bg-input">
                      {aiPreviewImageUrl ? (
                        <img
                          alt="AI selection preview"
                          className="h-full w-full object-contain"
                          src={aiPreviewImageUrl}
                        />
                      ) : (
                        <div className="grid h-full place-items-center px-4 text-sm theme-text-muted">
                          {aiPreviewStatus || "Rendering image preview..."}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <SectionEyebrow>Edit Mask</SectionEyebrow>
                    <div className="aspect-square border theme-border-panel theme-bg-input">
                      {aiPreviewMaskUrl ? (
                        <img
                          alt="AI edit mask preview"
                          className="h-full w-full object-contain"
                          src={aiPreviewMaskUrl}
                        />
                      ) : (
                        <div className="grid h-full place-items-center px-4 text-sm theme-text-muted">
                          {aiPreviewStatus || "Rendering mask preview..."}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="grid gap-2">
                    <label
                      className="text-xs font-extrabold uppercase tracking-[0.12em] theme-text-muted"
                      htmlFor="ai-prompt"
                    >
                      Description
                    </label>
                    <textarea
                      className={`${textInputClass} min-h-28 w-full resize-y`}
                      id="ai-prompt"
                      onChange={(event) => {
                        setAiPrompt(event.currentTarget.value);
                      }}
                      placeholder="Describe the AI edit you want to make..."
                      value={aiPrompt}
                    />
                  </div>

                  <div className="grid gap-2">
                    <label
                      className="text-xs font-extrabold uppercase tracking-[0.12em] theme-text-muted"
                      htmlFor="ai-negative-prompt"
                    >
                      Negative Prompt
                    </label>
                    <textarea
                      className={`${textInputClass} min-h-28 w-full resize-y`}
                      id="ai-negative-prompt"
                      onChange={(event) => {
                        setAiNegativePrompt(event.currentTarget.value);
                      }}
                      placeholder="Describe what the AI edit should avoid..."
                      value={aiNegativePrompt}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs theme-text-muted">
                      Run opens model selection. Start will only run the checked fal edit models and write each result to ../output/tile_map_ai/.
                    </div>
                    <button
                      className={actionButtonClass}
                      disabled={isAiSubmitting || !aiPrompt.trim() || !aiPreviewImageUrl || !aiPreviewMaskUrl}
                      onClick={() => {
                        void handleSubmitAiEdit();
                      }}
                      type="button"
                    >
                      {isAiSubmitting ? "Running..." : "Run"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isAiRunningModalOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 overflow-y-auto theme-bg-overlay px-4 py-4"
          role="dialog"
        >
          <div
            className="fixed inset-0"
            onClick={() => {
              setIsAiRunningModalOpen(false);
            }}
          />
          <div className="flex min-h-full items-center justify-center">
            <div className={`${modalSurfaceClass} relative max-h-[96vh] max-w-[min(96vw,1100px)] overflow-hidden`}>
              <div className="border-b theme-border-panel-faint px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-serif text-[1.4rem] leading-tight theme-text-primary">
                      AI Running
                    </h2>
                    <p className="mt-1 text-sm leading-6 theme-text-muted">
                      {aiPreviewStatus || "Choose the models you want to run, then press Start."}
                    </p>
                  </div>
                  <button
                    className={`${closeButtonClass} min-h-11 min-w-11 theme-bg-panel`}
                    onClick={() => {
                      setIsAiRunningModalOpen(false);
                    }}
                    type="button"
                  >
                    X
                  </button>
                </div>
              </div>

              <div className="grid max-h-[calc(96vh-9rem)] gap-5 overflow-y-auto px-6 py-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm theme-text-muted">
                    {isAiSubmitting
                      ? `Running ${aiSelectedModelCount} selected model${aiSelectedModelCount === 1 ? "" : "s"}.`
                      : `${aiSelectedModelCount} model${aiSelectedModelCount === 1 ? "" : "s"} selected.`}
                  </div>
                  <button
                    className={actionButtonClass}
                    disabled={isAiSubmitting || aiSelectedModelCount === 0}
                    onClick={() => {
                      void handleStartAiEdit();
                    }}
                    type="button"
                  >
                    {isAiSubmitting ? "Running..." : "Start"}
                  </button>
                </div>

                {aiRunDirectoryName ? (
                  <div className="text-sm theme-text-muted">
                    Output folder: <span className="font-mono">../output/tile_map_ai/{aiRunDirectoryName}/</span>
                  </div>
                ) : null}

                <div className="grid gap-2">
                  {aiModelStatuses.map((modelStatus) => (
                    <div
                      className={assetListRowClass(modelStatus.status === "success")}
                      key={modelStatus.modelId}
                    >
                      <label className="flex min-w-0 items-start gap-3">
                        <input
                          checked={aiSelectedModelIds.includes(modelStatus.modelId)}
                          disabled={isAiSubmitting}
                          onChange={(event) => {
                            const isChecked = event.currentTarget.checked;

                            setAiSelectedModelIds((currentModelIds) =>
                              isChecked
                                ? currentModelIds.includes(modelStatus.modelId)
                                  ? currentModelIds
                                  : [...currentModelIds, modelStatus.modelId]
                                : currentModelIds.filter((modelId) => modelId !== modelStatus.modelId)
                            );
                            setAiModelStatuses(createInitialAiModelStatuses());
                            setAiRunDirectoryName("");
                            setAiPreviewStatus("Choose one or more models, then press Start.");
                          }}
                          type="checkbox"
                        />
                        <div className={assetListMetaClass}>
                          <span className={assetListTitleClass}>{modelStatus.modelLabel}</span>
                          <span className={assetListSubtitleClass}>
                            {modelStatus.status === "running"
                              ? "Running"
                              : modelStatus.status === "success"
                                ? "Completed"
                                : modelStatus.status === "error"
                                  ? "Failed"
                                  : modelStatus.status === "skipped"
                                    ? "Not selected"
                                    : "Idle"}
                            {modelStatus.requestId ? ` • ${modelStatus.requestId}` : ""}
                          </span>
                          <span className={assetListMonoClass}>{modelStatus.detail}</span>
                        </div>
                      </label>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <button
                    className={secondaryButtonClass}
                    onClick={() => {
                      setIsAiRunningModalOpen(false);
                    }}
                    type="button"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isResizeDialogOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 overflow-y-auto theme-bg-overlay px-4 py-8"
          role="dialog"
        >
          <div
            className="fixed inset-0"
            onClick={() => {
              setIsResizeDialogOpen(false);
            }}
          />
          <div className="flex min-h-full items-center justify-center">
            <div className={`${modalSurfaceClass} relative max-w-xl`}>
              <div className="border-b theme-border-panel-faint px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-serif text-[1.4rem] leading-tight theme-text-primary">
                      Resize Map
                    </h2>
                    <p className="mt-1 text-sm leading-6 theme-text-muted">
                      Expand the active map and fill new space by repeating the current last column
                      and last row. Shrinking is disabled for now.
                    </p>
                  </div>
                  <button
                    className={`${closeButtonClass} min-h-11 min-w-11 theme-bg-panel`}
                    onClick={() => {
                      setIsResizeDialogOpen(false);
                    }}
                    type="button"
                  >
                    X
                  </button>
                </div>
              </div>

              <div className="grid gap-4 px-6 py-6">
                <div className="text-xs theme-text-muted">
                  Current size: {mapWidth}x{mapHeight}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    className={`${compactTextInputClass} w-24 text-center`}
                    inputMode="numeric"
                    onChange={(event) => {
                      setResizeMapWidth(event.currentTarget.value);
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        normalizedResizeMapWidth >= mapWidth &&
                        normalizedResizeMapHeight >= mapHeight
                      ) {
                        event.preventDefault();
                        handleResizeMap();
                      }
                    }}
                    placeholder="W"
                    ref={resizeWidthInputRef}
                    value={resizeMapWidth}
                  />
                  <input
                    className={`${compactTextInputClass} w-24 text-center`}
                    inputMode="numeric"
                    onChange={(event) => {
                      setResizeMapHeight(event.currentTarget.value);
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        normalizedResizeMapWidth >= mapWidth &&
                        normalizedResizeMapHeight >= mapHeight
                      ) {
                        event.preventDefault();
                        handleResizeMap();
                      }
                    }}
                    placeholder="H"
                    value={resizeMapHeight}
                  />
                </div>

                <div className="text-xs theme-text-muted">
                  New map size: {normalizedResizeMapWidth}x{normalizedResizeMapHeight}
                </div>
                {normalizedResizeMapWidth < mapWidth || normalizedResizeMapHeight < mapHeight ? (
                  <div className="text-xs theme-text-muted">
                    Reducing the map size is not supported yet. Enter values at least as large as{" "}
                    {mapWidth}x{mapHeight}.
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t theme-border-panel-faint theme-bg-paper-soft px-6 py-4">
                <button
                  className={secondaryButtonClass}
                  onClick={() => {
                    setIsResizeDialogOpen(false);
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={actionButtonClass}
                  disabled={
                    Boolean(busyLabel) ||
                    normalizedResizeMapWidth < mapWidth ||
                    normalizedResizeMapHeight < mapHeight
                  }
                  onClick={handleResizeMap}
                  type="button"
                >
                  Resize
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateDialogOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 overflow-y-auto theme-bg-overlay px-4 py-8"
          role="dialog"
        >
          <div
            className="fixed inset-0"
            onClick={() => {
              setIsCreateDialogOpen(false);
            }}
          />
          <div className="flex min-h-full items-center justify-center">
            <div className={`${modalSurfaceClass} relative max-w-2xl`}>
              <div className="border-b theme-border-panel-faint px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-serif text-[1.4rem] leading-tight theme-text-primary">
                      Create Map
                    </h2>
                    <p className="mt-1 text-sm leading-6 theme-text-muted">
                      Name the map and choose its grid size before creating the server-backed map.
                    </p>
                  </div>
                  <button
                    className={`${closeButtonClass} min-h-11 min-w-11 theme-bg-panel`}
                    onClick={() => {
                      setIsCreateDialogOpen(false);
                    }}
                    type="button"
                  >
                    X
                  </button>
                </div>
              </div>

              <div className="grid gap-4 px-6 py-6">
                <div className="grid gap-2">
                  <label
                    className="text-xs font-extrabold uppercase tracking-[0.12em] theme-text-muted"
                    htmlFor="new-map-name"
                  >
                    New map name
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      className={textInputClass}
                      id="new-map-name"
                      onChange={(event) => {
                        setNewMapName(event.currentTarget.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && normalizedNewMapName) {
                          event.preventDefault();
                          handleCreateMap();
                        }
                      }}
                      placeholder="New map name"
                      ref={createNameInputRef}
                      value={newMapName}
                    />
                    <input
                      className={`${compactTextInputClass} w-24 text-center`}
                      inputMode="numeric"
                      onChange={(event) => {
                        setNewMapWidth(event.currentTarget.value);
                      }}
                      placeholder="W"
                      value={newMapWidth}
                    />
                    <input
                      className={`${compactTextInputClass} w-24 text-center`}
                      inputMode="numeric"
                      onChange={(event) => {
                        setNewMapHeight(event.currentTarget.value);
                      }}
                      placeholder="H"
                      value={newMapHeight}
                    />
                  </div>
                </div>

                {newMapName && newMapName !== normalizedNewMapName ? (
                  <div className="text-xs theme-text-muted">
                    New map will be created as{" "}
                    <span className="font-mono">{normalizedNewMapName}</span>
                  </div>
                ) : null}

                <div className="text-xs theme-text-muted">
                  New map size: {normalizedNewMapWidth}x{normalizedNewMapHeight}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t theme-border-panel-faint theme-bg-paper-soft px-6 py-4">
                <button
                  className={secondaryButtonClass}
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={actionButtonClass}
                  disabled={!normalizedNewMapName}
                  onClick={handleCreateMap}
                  type="button"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
