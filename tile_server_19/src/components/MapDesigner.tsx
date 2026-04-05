"use client";

import {
  memo,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition
} from "react";
import {
  faEraser,
  faEye,
  faEyeSlash,
  faPenToSquare,
  faTrashCan
} from "@awesome.me/kit-a62459359b/icons/classic/solid";

import { createMapAction, saveMapAction } from "../actions/mapActions";
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
  serializeMapTileOptionsKey
} from "../lib/map";
import { normalizeUnderscoreName } from "../lib/naming";
import { describeSlot, sanitizeSlotRecord, type SlotKey } from "../lib/slots";
import {
  getTileLibrarySpriteKey,
  normalizeTileLibraryPath,
  splitTileLibraryPath,
  TILE_LIBRARY_LAYERS
} from "../lib/tileLibrary";
import { useImageCache } from "../lib/useImageCache";
import { actionButtonClass } from "./buttonStyles";
import { CheckerboardFrame } from "./CheckerboardFrame";
import { FontAwesomeIcon } from "./FontAwesomeIcon";
import { Panel } from "./Panel";
import { SectionEyebrow } from "./SectionEyebrow";
import {
  canvasViewportClass,
  closeButtonClass,
  compactTextInputClass,
  emptyStateCardClass,
  iconButtonClass,
  modalSurfaceClass,
  previewCanvasClass,
  previewSelectionButtonClass,
  sectionCardClass,
  secondaryButtonClass,
  selectableCardClass,
  selectablePanelClass,
  statusChipClass,
  textInputClass,
  visibilityOptionButtonClass,
  zoomButtonClass
} from "./uiStyles";
import type { MapTileOptions, SpriteRecord, TileCell, TileRecord } from "../types";

const MAP_PREVIEW_SIZE = 128;
const VISIBILITY_OPTIONS = [
  { label: "Hide", value: 0 },
  { label: "20%", value: 0.2 },
  { label: "50%", value: 0.5 },
  { label: "100%", value: 1 }
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

interface MapWorkspaceProps {
  activeLayerIndex: number;
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
  hoverLabel: string;
  hoverCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  layerPreviewCanvasRefs: React.MutableRefObject<Array<HTMLCanvasElement | null>>;
  layerVisibilities: number[];
  mapCanvasHeight: number;
  mapCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  mapCanvasWidth: number;
  mapFrameRef: React.RefObject<HTMLDivElement | null>;
  onCanvasClick(event: React.MouseEvent<HTMLCanvasElement>): void;
  onCanvasMouseDown(event: React.MouseEvent<HTMLCanvasElement>): void;
  onCanvasMouseLeave(): void;
  onCanvasMouseMove(event: React.MouseEvent<HTMLCanvasElement>): void;
  onCanvasMouseUp(): void;
  onClearAllLayers(): void;
  onClearLayer(layerIndex: number): void;
  onSelectBrushSlot(slotNum: number): void;
  onSelectLayer(layerIndex: number): void;
  onSetLayerVisibility(layerIndex: number, visibility: number): void;
  onZoomIn(): void;
  onZoomOut(): void;
  previewCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  scalePercent: number;
  selectedBrushLabel: string;
}

const MapWorkspace = memo(function MapWorkspace({
  activeLayerIndex,
  activeBrushSlotNum,
  activeLayerTitle,
  activeOpacityValue,
  brushSlotOptions,
  canZoomIn,
  canZoomOut,
  hoverLabel,
  hoverCanvasRef,
  layerPreviewCanvasRefs,
  layerVisibilities,
  mapCanvasHeight,
  mapCanvasRef,
  mapCanvasWidth,
  mapFrameRef,
  onCanvasClick,
  onCanvasMouseDown,
  onCanvasMouseLeave,
  onCanvasMouseMove,
  onCanvasMouseUp,
  onClearAllLayers,
  onClearLayer,
  onSelectBrushSlot,
  onSelectLayer,
  onSetLayerVisibility,
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
              className="block max-h-none max-w-none bg-white/82 [image-rendering:pixelated]"
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
          <div className={statusChipClass}>
            {hoverLabel}
          </div>
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
          </div>
        </div>

        {brushSlotOptions.length ? (
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
            className={`${previewCanvasClass} h-32 w-32`}
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
                    className="block h-32 w-32 [image-rendering:pixelated]"
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
            Opacity {Math.round(activeOpacityValue * 100)}% • Brush: {selectedBrushLabel}
          </div>
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

function drawMapCellBackgroundAtSize(
  context: CanvasRenderingContext2D,
  drawX: number,
  drawY: number,
  tileSize: number
) {
  const half = tileSize / 2;

  context.fillStyle = "#fffdf8";
  context.fillRect(drawX, drawY, tileSize, tileSize);
  context.fillStyle = "#efe7d4";
  context.fillRect(drawX, drawY, half, half);
  context.fillRect(drawX + half, drawY + half, half, half);
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

export function MapDesigner() {
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
    tiles,
    upsertMap
  } = useStudio();
  const initialMapDesignerUiState = getMapDesignerUiState(activeMapSlug);
  const [activeLayerIndex, setActiveLayerIndex] = useState(initialMapDesignerUiState.activeLayerIndex);
  const [hoverCell, setHoverCell] = useState<TileCell | null>(null);
  const [layerVisibilities, setLayerVisibilities] = useState<number[]>(initialMapDesignerUiState.layerVisibilities);
  const [mapScalePercent, setMapScalePercent] = useState<number | null>(
    initialMapDesignerUiState.zoomPercent
  );
  const [mapStatus, setMapStatus] = useState(
    "Choose a brush tile or sprite, pick a layer, and paint on the stacked map. Save writes to the database."
  );
  const [mapQuery, setMapQuery] = useState("");
  const [newMapName, setNewMapName] = useState("");
  const [newMapWidth, setNewMapWidth] = useState(String(MAP_DEFAULT_GRID_SIZE));
  const [newMapHeight, setNewMapHeight] = useState(String(MAP_DEFAULT_GRID_SIZE));
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [saveConfirmationMessage, setSaveConfirmationMessage] = useState("");
  const [brushOptions, setBrushOptions] = useState(DEFAULT_MAP_BRUSH_OPTIONS);
  const [, startTransition] = useTransition();
  const drawingRef = useRef(false);
  const lastPaintedCellKeyRef = useRef("");
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
  const imageCache = useImageCache();
  const createNameInputRef = useRef<HTMLInputElement | null>(null);
  const deferredMapQuery = useDeferredValue(mapQuery.trim().toLowerCase());
  const normalizedNewMapName = normalizeUnderscoreName(newMapName);
  const normalizedNewMapWidth = normalizeMapDimension(newMapWidth);
  const normalizedNewMapHeight = normalizeMapDimension(newMapHeight);
  const draftLayers = getMapDraftLayers(
    activeMapSlug,
    activeMap?.layers,
    activeMap?.width,
    activeMap?.height
  );
  const { height: mapHeight, width: mapWidth } = getMapLayerDimensions(draftLayers, activeMap?.cells);
  const savedLayers = activeMap
    ? normalizeMapLayers(activeMap.layers, activeMap.width, activeMap.height, activeMap.cells)
    : null;
  const hasMapDraftChanges = savedLayers ? JSON.stringify(draftLayers) !== JSON.stringify(savedLayers) : false;
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
    (tileSlotsBySlug.get(tileRecord.slug) ?? []).map((slotRecord) => slotRecord?.pixels ?? "")
  );
  const spriteThumbnailUrls = sprites.map((spriteRecord) => spriteRecord.thumbnail ?? "");

  useEffect(() => {
    if (activeMap) {
      setMapStatus(`Editing ${activeMap.name} (${activeMap.width}x${activeMap.height}).`);
    }
  }, [activeMap]);

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
  }, [mapCanvasHeight, mapCanvasWidth]);

  useEffect(() => {
    if (mapScalePercent !== null) {
      return;
    }

    const mapFrame = mapFrameRef.current;

    if (!mapFrame || mapFrame.clientWidth <= 0 || mapFrame.clientHeight <= 0) {
      return;
    }

    setMapScalePercent(getAutoFitMapScalePercent(mapFrame, mapCanvasWidth, mapCanvasHeight));
  }, [mapCanvasHeight, mapCanvasWidth, mapScalePercent]);

  useEffect(() => {
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
  }, [activeMapSlug]);

  useEffect(() => {
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
  }, [mapCanvasHeight, mapCanvasWidth, mapScalePercent]);

  useEffect(() => {
    if (!activeMapSlug) {
      return;
    }

    setMapDesignerUiState(activeMapSlug, {
      activeLayerIndex,
      layerVisibilities,
      zoomPercent: mapScalePercent
    });
  }, [activeLayerIndex, activeMapSlug, layerVisibilities, mapScalePercent, setMapDesignerUiState]);

  useEffect(() => {
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
  }, [activeMapSlug, mapCanvasHeight, mapCanvasWidth, mapScalePercent]);

  useEffect(() => {
    return () => {
      if (!activeMapSlug) {
        return;
      }

      setMapDesignerUiState(activeMapSlug, {
        activeLayerIndex,
        layerVisibilities,
        scrollLeft: lastKnownScrollRef.current.scrollLeft,
        scrollTop: lastKnownScrollRef.current.scrollTop,
        zoomPercent: mapScalePercentRef.current
      });
    };
  }, [activeLayerIndex, activeMapSlug, layerVisibilities, setMapDesignerUiState]);

  useEffect(() => {
    if (haveStringListsChanged(tileSourceUrlsRef.current, tileSlotUrls)) {
      tileSourceUrlsRef.current = tileSlotUrls;
      fallbackTileCanvasCacheRef.current.clear();
      renderedPlacementCanvasCacheRef.current.clear();
    }

    const nextAssetImageUrls = [...tileSlotUrls, ...spriteThumbnailUrls].filter(Boolean);

    if (!haveStringListsChanged(assetImageUrlsRef.current, nextAssetImageUrls)) {
      return;
    }

    assetImageUrlsRef.current = nextAssetImageUrls;
    let cancelled = false;

    void Promise.all(nextAssetImageUrls.map((imageUrl) => imageCache.ensureImage(imageUrl))).finally(() => {
      if (cancelled) {
        return;
      }
    });

    return () => {
      cancelled = true;
    };
  });

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
      const renderSlot = selectedSlot?.pixels ? selectedSlot : mainSlot;
      const tileImage = renderSlot?.pixels ? imageCache.getCachedImage(renderSlot.pixels) : null;

      if (!tileImage && simplified) {
        context.fillStyle = "rgba(216, 135, 83, 0.2)";
        context.fillRect(drawX, drawY, drawWidth, drawHeight);
        return;
      }

      const sourceKey = tileImage ? renderSlot?.pixels ?? placement.tileSlug : `fallback:${tileRecord.name}`;
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
      tileDrawSize: number,
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
      const scale = tileDrawSize / TILE_SIZE;
      const anchorCenterX = drawX + tileDrawSize / 2;
      const anchorCenterY = drawY + tileDrawSize / 2;
      const spriteDrawWidth = spriteRecord.image_w * scale;
      const spriteDrawHeight = spriteRecord.image_h * scale;
      const spriteDrawX =
        anchorCenterX - spriteRecord.mount_x * scale + spriteRecord.offset_x * scale;
      const spriteDrawY =
        anchorCenterY - spriteRecord.mount_y * scale + spriteRecord.offset_y * scale;

      if (!spriteImage) {
        if (!simplified) {
          return;
        }

        context.fillStyle = "rgba(216, 135, 83, 0.2)";
        context.fillRect(spriteDrawX, spriteDrawY, spriteDrawWidth, spriteDrawHeight);
        context.strokeStyle = "rgba(20, 33, 39, 0.38)";
        context.lineWidth = Math.max(1, tileDrawSize * 0.03);
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
        hoverCell?: TileCell | null;
        offsetX?: number;
        offsetY?: number;
        showGrid?: boolean;
        simplifiedFallback?: boolean;
        tileDrawSize?: number;
      }
    ) => {
      const tileDrawSize = options?.tileDrawSize ?? TILE_SIZE;
      const offsetX = options?.offsetX ?? 0;
      const offsetY = options?.offsetY ?? 0;
      const showGrid = options?.showGrid ?? true;
      const simplifiedFallback = options?.simplifiedFallback ?? false;
      const clearCanvas = options?.clearCanvas ?? true;

      if (clearCanvas) {
        context.clearRect(0, 0, context.canvas.width, context.canvas.height);
      }

      for (let tileY = 0; tileY < mapHeight; tileY += 1) {
        for (let tileX = 0; tileX < mapWidth; tileX += 1) {
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

        for (let tileY = 0; tileY < mapHeight; tileY += 1) {
          for (let tileX = 0; tileX < mapWidth; tileX += 1) {
            const placement = layers[layerIndex]?.[tileY]?.[tileX] ?? null;
            const drawX = offsetX + tileX * tileDrawSize;
            const drawY = offsetY + tileY * tileDrawSize;

            if (!placement) {
              continue;
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
              renderSpritePlacement(context, placement, drawX, drawY, tileDrawSize, simplifiedFallback);
            }

            context.restore();
          }
        }
      }

      for (let tileY = 0; tileY < mapHeight; tileY += 1) {
        for (let tileX = 0; tileX < mapWidth; tileX += 1) {
          const drawX = offsetX + tileX * tileDrawSize;
          const drawY = offsetY + tileY * tileDrawSize;

          if (showGrid) {
            context.strokeStyle = "rgba(20, 33, 39, 0.12)";
            context.lineWidth = 1;
            context.strokeRect(drawX + 0.5, drawY + 0.5, tileDrawSize - 1, tileDrawSize - 1);
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
      const scale = Math.min(MAP_PREVIEW_SIZE / mapCanvasWidth, MAP_PREVIEW_SIZE / mapCanvasHeight);
      const scaledWidth = Math.max(1, Math.round(mapCanvasWidth * scale));
      const scaledHeight = Math.max(1, Math.round(mapCanvasHeight * scale));
      const offsetX = Math.floor((MAP_PREVIEW_SIZE - scaledWidth) / 2);
      const offsetY = Math.floor((MAP_PREVIEW_SIZE - scaledHeight) / 2);

      renderMapGrid(context, layers, opacityForLayer, {
        clearCanvas: false,
        offsetX,
        offsetY,
        showGrid: false,
        tileDrawSize: TILE_SIZE * scale
      });
    }
  );

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
      showGrid: true
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
    renderMapCanvas();
  }, [draftLayers, layerVisibilities, mapCanvasHeight, mapCanvasWidth, mapHeight, mapWidth, renderMapCanvas]);

  useEffect(() => {
    renderPreviewCanvases();
  }, [draftLayers, layerVisibilities, mapCanvasHeight, mapCanvasWidth, mapHeight, mapWidth, renderPreviewCanvases]);

  useEffect(() => {
    renderHoverCanvas();
  }, [activeBrushSpriteKey, hoverCell, mapCanvasHeight, mapCanvasWidth, renderHoverCanvas, sprites]);

  function paintCell(nextCell: TileCell) {
    if (!activeMapSlug) {
      return;
    }

    const nextLayers = draftLayers.map((layerCells) => layerCells.map((row) => row.slice()));
    const nextLayer = nextLayers[activeLayerIndex];
    const nextRow = nextLayer?.[nextCell.tileY];

    if (!nextRow) {
      return;
    }

    nextRow[nextCell.tileX] = activeBrushTileSlug
      ? createMapTilePlacement(activeBrushTileSlug, brushOptions, activeBrushTileSlotNum)
      : activeBrushSpriteKey
        ? createMapSpritePlacement(activeBrushSpriteKey)
        : null;
    setMapDraftLayers(activeMapSlug, nextLayers, mapWidth, mapHeight);
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

    startTransition(() => {
      void saveMapAction({
        height: mapHeight,
        layers: draftLayers,
        name: activeMap.name,
        slug: activeMap.slug,
        width: mapWidth
      })
        .then((savedMap) => {
          upsertMap(savedMap);
          setMapDraftLayers(savedMap.slug, savedMap.layers, savedMap.width, savedMap.height);
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
  }

  const currentScale =
    mapScalePercent ?? mapScalePercentRef.current ?? MAP_MIN_SCALE_PERCENT;
  const selectedLayer = TILE_LIBRARY_LAYERS[activeLayerIndex] ?? TILE_LIBRARY_LAYERS[0];
  const selectedLayerFolder = selectedLayer?.folder ?? "";
  const activeBrushTile = tiles.find((tileRecord) => tileRecord.slug === activeBrushTileSlug) ?? null;
  const activeBrushSprite = spritesByKey.get(activeBrushSpriteKey) ?? null;
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
  const hoverLabel = hoverCell
    ? (() => {
        const layerDetails = draftLayers
          .map((layerCells, layerIndex) => {
            const placement = layerCells?.[hoverCell.tileY]?.[hoverCell.tileX] ?? null;

            if (isMapTilePlacement(placement)) {
              const tileRecord = tilesBySlug.get(placement.tileSlug) ?? null;
              const optionLabels = describeMapTileOptions(placement.options);
              const slotLabel = getSlotLabel(placement.slotNum);

              return `L${layerIndex} ${tileRecord?.slug ?? placement.tileSlug} [${slotLabel}]${
                optionLabels.length ? ` (${optionLabels.join(", ")})` : ""
              }`;
            }

            if (isMapSpritePlacement(placement)) {
              const spriteRecord = spritesByKey.get(placement.spriteKey) ?? null;
              return `L${layerIndex} Sprite ${spriteRecord?.name ?? placement.spriteKey}`;
            }

            return null;
          })
          .filter((detail): detail is string => Boolean(detail));

        return layerDetails.length
          ? `Hover ${hoverCell.tileX}, ${hoverCell.tileY} • ${layerDetails.join(" • ")}`
          : `Hover ${hoverCell.tileX}, ${hoverCell.tileY} • Empty`;
      })()
    : "Hover a cell to inspect it.";
  const filteredMaps = maps.filter((mapRecord) => {
    if (!deferredMapQuery) {
      return true;
    }

    return (
      mapRecord.name.toLowerCase().includes(deferredMapQuery) ||
      mapRecord.slug.toLowerCase().includes(deferredMapQuery)
    );
  });
  const visibleBrushTiles = tiles
    .filter((tileRecord) => {
      const tilePath = normalizeTileLibraryPath(tileRecord.path);

      return tilePath === selectedLayerFolder || tilePath.startsWith(`${selectedLayerFolder}/`);
    })
    .slice()
    .sort(
      (left, right) =>
        normalizeTileLibraryPath(left.path).localeCompare(normalizeTileLibraryPath(right.path)) ||
        left.slug.localeCompare(right.slug)
    );
  const visibleBrushSprites = sprites
    .filter((spriteRecord) => {
      const spritePath = normalizeTileLibraryPath(spriteRecord.path);

      return spritePath === selectedLayerFolder || spritePath.startsWith(`${selectedLayerFolder}/`);
    })
    .slice()
    .sort(
      (left, right) =>
        normalizeTileLibraryPath(left.path).localeCompare(normalizeTileLibraryPath(right.path)) ||
        left.name.localeCompare(right.name) ||
        left.filename.localeCompare(right.filename)
    );

  return (
    <div className="min-h-0">
      <div className="grid min-h-0 gap-4">
        <Panel
          actions={
            <button
              className={actionButtonClass}
              onClick={() => {
                setIsCreateDialogOpen(true);
              }}
              type="button"
            >
              Create
            </button>
          }
          title="Map Library"
        >
          <div className="flex flex-wrap items-center gap-3">
            <input
              className={textInputClass}
              onChange={(event) => {
                setMapQuery(event.currentTarget.value);
              }}
              placeholder="Filter maps"
              value={mapQuery}
            />
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredMaps.map((mapRecord) => (
              <button
                className={`${selectableCardClass(
                  mapRecord.slug === activeMapSlug,
                  "border-[#c3d0cb]/80 bg-[linear-gradient(180deg,rgba(255,253,248,0.96),rgba(244,239,226,0.84))] hover:border-[#d88753]/55 hover:bg-white"
                )} flex min-h-[4.5rem] flex-col justify-between gap-2 px-3 py-3 text-left`}
                key={mapRecord.slug}
                onClick={() => {
                  setActiveMapSlug(mapRecord.slug);
                }}
                type="button"
              >
                <div className="grid gap-1">
                  <strong className="truncate text-sm font-semibold theme-text-primary">
                    {mapRecord.name}
                  </strong>
                  <span className="font-mono text-xs theme-text-muted">{mapRecord.slug}</span>
                </div>
                <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] theme-text-muted">
                  {mapRecord.width}x{mapRecord.height}
                </span>
              </button>
            ))}
          </div>
          {!filteredMaps.length ? (
            <div className="text-sm theme-text-muted">No maps match that filter.</div>
          ) : null}
        </Panel>

        <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(18rem,0.7fr)_minmax(0,1.65fr)]">
          <div className="grid min-h-0 gap-4">
            <Panel
              description={`Pick a tile or sprite from ${selectedLayer.index} - ${selectedLayer.description}, then paint it onto the active layer.`}
              title="Brush Palette"
            >
              <div className="grid gap-4">
                <div className={`${sectionCardClass} ${activeBrushTile ? "" : "opacity-65"}`}>
                  <SectionEyebrow>Brush Effects</SectionEyebrow>
                  <div className="mb-3 text-xs theme-text-muted">
                    {activeBrushTile
                      ? "Flip, rotate, multiply, and tint apply to tile brushes."
                      : "Sprite brushes use their own image and mount point, so tile effects are disabled."}
                  </div>
                  <div className="brush-palette-effects grid gap-2 sm:grid-cols-2">
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

                <div className="grid gap-3">
                  <SectionEyebrow>Tiles</SectionEyebrow>
                  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                    <button
                      className={`${selectableCardClass(
                        mapBrushAssetKey === "",
                        "border-[#c3d0cb]/85 bg-white/90 hover:border-[#d88753]/55 hover:bg-white"
                      )} grid justify-items-center gap-2 p-3 text-center`}
                      onClick={() => {
                        setMapBrushAssetKey("");
                      }}
                      type="button"
                    >
                      <div className="grid h-32 max-h-32 w-full max-w-32 place-self-center place-items-center overflow-hidden theme-bg-brand theme-text-inverse-soft">
                        <FontAwesomeIcon className="h-10 w-10" icon={faEraser} title="Erase" />
                      </div>
                      <div className="text-center text-sm font-normal leading-tight theme-text-muted">
                        <div>Tool</div>
                        <div>eraser</div>
                      </div>
                    </button>

                    {visibleBrushTiles.map((tileRecord) => {
                      const mainSlot = tileMainSlotsBySlug.get(tileRecord.slug) ?? null;
                      const pathSegments = splitTileLibraryPath(tileRecord.path);
                      const folderLabel =
                        pathSegments.length > 1 ? pathSegments[pathSegments.length - 1] : selectedLayer.folder;

                      return (
                        <div
                          className={`${selectableCardClass(
                            activeBrushTileSlug === tileRecord.slug,
                            "border-[#c3d0cb]/85 bg-white/90 hover:border-[#d88753]/55 hover:bg-white"
                          )} grid justify-items-center gap-2 p-3 text-center`}
                          key={tileRecord.slug}
                        >
                          <button
                            className="grid w-full justify-items-center gap-2 text-center"
                            onClick={() => {
                              setMapBrushAssetKey(getTileBrushAssetKeyWithSlot(tileRecord.slug, 0));
                            }}
                            type="button"
                          >
                            <CheckerboardFrame className="h-32 max-h-32 w-full max-w-32 place-self-center" size="md">
                              {mainSlot?.pixels ? (
                                <img
                                  alt={tileRecord.name}
                                  className="max-h-32 max-w-32 object-contain"
                                  src={mainSlot.pixels}
                                />
                              ) : (
                                <span>No Main</span>
                              )}
                            </CheckerboardFrame>
                          </button>
                          <div className="flex w-full items-start gap-2">
                            <button
                              className="grid h-7 w-7 shrink-0 place-items-center border theme-border-panel theme-text-muted transition theme-hover-border-accent theme-hover-text-accent"
                              onClick={() => {
                                setActiveTileSlug(tileRecord.slug);
                                openPaintEditor(tileRecord, "main");
                              }}
                              title={`Edit ${tileRecord.name} main slot`}
                              type="button"
                            >
                              <FontAwesomeIcon className="h-3.5 w-3.5" icon={faPenToSquare} />
                            </button>
                            <button
                              className="min-w-0 flex-1 text-left text-sm font-normal leading-tight theme-text-muted"
                              onClick={() => {
                                setMapBrushAssetKey(getTileBrushAssetKeyWithSlot(tileRecord.slug, 0));
                              }}
                              type="button"
                            >
                              <div className="truncate">{folderLabel}</div>
                              <div className="truncate">{tileRecord.slug}</div>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {!visibleBrushTiles.length ? (
                    <div className="text-sm theme-text-muted">
                      No tiles are available in {selectedLayer.folder}/ yet.
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3">
                  <SectionEyebrow>Sprites</SectionEyebrow>
                  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                    {visibleBrushSprites.map((spriteRecord) => {
                      const spriteKey = getTileLibrarySpriteKey(spriteRecord.path, spriteRecord.filename);
                      const pathSegments = splitTileLibraryPath(spriteRecord.path);
                      const folderLabel =
                        pathSegments.length > 1 ? pathSegments[pathSegments.length - 1] : selectedLayer.folder;

                      return (
                        <button
                          className={`${selectableCardClass(
                            getSpriteBrushAssetKey(spriteKey) === mapBrushAssetKey,
                            "border-[#c3d0cb]/85 bg-white/90 hover:border-[#d88753]/55 hover:bg-white"
                          )} grid justify-items-center gap-2 p-3 text-center`}
                          key={spriteKey}
                          onClick={() => {
                            setMapBrushAssetKey(getSpriteBrushAssetKey(spriteKey));
                          }}
                          type="button"
                        >
                          <CheckerboardFrame className="h-32 max-h-32 w-full max-w-32 place-self-center" size="md">
                            {spriteRecord.thumbnail ? (
                              <img
                                alt={spriteRecord.name}
                                className="max-h-32 max-w-32 object-contain"
                                src={spriteRecord.thumbnail}
                              />
                            ) : (
                              <span>No Image</span>
                            )}
                          </CheckerboardFrame>
                          <div className="w-full text-left text-sm font-normal leading-tight theme-text-muted">
                            <div className="truncate">{folderLabel}</div>
                            <div className="truncate">{spriteRecord.name}</div>
                            <div className="truncate font-mono text-[11px]">{spriteRecord.filename}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {!visibleBrushSprites.length ? (
                    <div className={emptyStateCardClass}>
                      No sprites are available in {selectedLayer.folder}/ yet.
                    </div>
                  ) : null}
                </div>
              </div>
            </Panel>
          </div>

          <Panel
            actions={
              <div className="grid justify-items-start gap-1">
                <button
                  className={actionButtonClass}
                  disabled={!activeMap || !hasMapDraftChanges || busyLabel === "Saving map"}
                  onClick={handleSaveMap}
                  type="button"
                >
                  Save Map
                </button>
                {saveConfirmationMessage ? (
                  <div className="text-xs font-medium theme-text-muted">
                    {saveConfirmationMessage}
                  </div>
                ) : null}
              </div>
            }
            description={`Paint directly on the ${mapWidth}x${mapHeight} layered map canvas. The scale controls only change the viewing size.`}
            footer={
              <div className="flex flex-wrap items-center gap-3">
                <div className={statusChipClass}>
                  {busyLabel
                    ? `${busyLabel}...`
                    : activeBrushTile || activeBrushSprite
                      ? `Brush: ${selectedBrushLabel}`
                      : "Brush: eraser"}
                </div>
              </div>
            }
            title="Map Canvas"
          >
            <MapWorkspace
              activeLayerIndex={activeLayerIndex}
              activeBrushSlotNum={activeBrushTileSlotNum}
              activeLayerTitle={activeLayerTitle}
              activeOpacityValue={activeOpacityValue}
              brushSlotOptions={availableBrushSlotOptions}
              canZoomIn={currentScale > MAP_MIN_SCALE_PERCENT}
              canZoomOut={currentScale < MAP_MAX_SCALE_PERCENT}
              hoverLabel={hoverLabel}
              hoverCanvasRef={hoverCanvasRef}
              layerPreviewCanvasRefs={layerPreviewCanvasRefs}
              layerVisibilities={layerVisibilities}
              mapCanvasHeight={mapCanvasHeight}
              mapCanvasRef={mapCanvasRef}
              mapCanvasWidth={mapCanvasWidth}
              mapFrameRef={mapFrameRef}
              onCanvasClick={(event) => {
                const nextCell = getMapCellFromPointerEvent(
                  event.currentTarget,
                  event.nativeEvent,
                  mapWidth,
                  mapHeight
                );

                if (nextCell) {
                  paintCell(nextCell);
                }
              }}
              onCanvasMouseDown={(event) => {
                beginPaint();
                handlePointerUpdate(event);
              }}
              onCanvasMouseLeave={() => {
                finishPaint();
                setHoverCell(null);
              }}
              onCanvasMouseMove={handlePointerUpdate}
              onCanvasMouseUp={finishPaint}
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
        </div>
      </div>

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
