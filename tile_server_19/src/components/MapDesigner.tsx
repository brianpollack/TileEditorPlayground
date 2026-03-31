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
  createMapTilePlacement,
  describeMapTileOptions,
  drawMapTileFallback,
  getAutoFitMapScalePercent,
  getMapCanvasHeight,
  getMapCanvasWidth,
  getMapCellFromPointerEvent,
  getMapLayerDimensions,
  normalizeMapDimension,
  normalizeMapTileOptions,
  serializeMapTileOptionsKey
} from "../lib/map";
import { normalizeUnderscoreName } from "../lib/naming";
import { sanitizeSlotRecord } from "../lib/slots";
import { normalizeTileLibraryPath, splitTileLibraryPath, TILE_LIBRARY_LAYERS } from "../lib/tileLibrary";
import { useImageCache } from "../lib/useImageCache";
import { actionButtonClass } from "./buttonStyles";
import { FontAwesomeIcon } from "./FontAwesomeIcon";
import { Panel } from "./Panel";
import {
  canvasViewportClass,
  closeButtonClass,
  compactTextInputClass,
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
import type { MapTileOptions, TileCell, TileRecord } from "../types";

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
  activeLayerTitle: string;
  activeOpacityValue: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  hoverLabel: string;
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
  activeLayerTitle,
  activeOpacityValue,
  canZoomIn,
  canZoomOut,
  hoverLabel,
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
            <span className="text-sm font-medium text-[#142127]">Scale {scalePercent}%</span>
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
      </div>

      <div className="grid content-start gap-4">
        <div className={sectionCardClass}>
          <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#4a6069]">
            Preview
          </div>
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
                  className="text-left text-xs font-extrabold uppercase tracking-[0.12em] text-[#142127]"
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
          <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#4a6069]">
            Active Layer
          </div>
          <div className="text-sm font-semibold text-[#142127]">{activeLayerTitle}</div>
          <div className="text-xs text-[#4a6069]">
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

export function MapDesigner() {
  const {
    activeMap,
    activeMapSlug,
    getMapDesignerUiState,
    getMapDraftLayers,
    getTileDraftSlots,
    mapBrushTileSlug,
    maps,
    openPaintEditor,
    setActiveMapSlug,
    setActiveTileSlug,
    setMapDesignerUiState,
    setMapDraftLayers,
    setMapBrushTileSlug,
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
    "Choose a brush tile, pick a layer, and paint on the stacked map. Save writes JSON through a server function."
  );
  const [mapQuery, setMapQuery] = useState("");
  const [newMapName, setNewMapName] = useState("");
  const [newMapWidth, setNewMapWidth] = useState(String(MAP_DEFAULT_GRID_SIZE));
  const [newMapHeight, setNewMapHeight] = useState(String(MAP_DEFAULT_GRID_SIZE));
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
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
  const layerPreviewCanvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const fallbackTileCanvasCacheRef = useRef(new Map<string, HTMLCanvasElement>());
  const renderedPlacementCanvasCacheRef = useRef(new Map<string, HTMLCanvasElement>());
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
  const mapCanvasWidth = getMapCanvasWidth(mapWidth);
  const mapCanvasHeight = getMapCanvasHeight(mapHeight);
  const tilesBySlug = new Map(tiles.map((tileRecord) => [tileRecord.slug, tileRecord]));
  const tileMainSlotsBySlug = new Map(
    tiles.map((tileRecord) => [
      tileRecord.slug,
      sanitizeSlotRecord(getTileDraftSlots(tileRecord.slug, tileRecord.slots)[0])
    ])
  );
  const brushOptionLabels = describeMapTileOptions(brushOptions);

  useEffect(() => {
    if (activeMap) {
      setMapStatus(`Editing ${activeMap.name} (${activeMap.width}x${activeMap.height}).`);
    }
  }, [activeMap]);

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

  const renderTilePlacement = useEffectEvent(
    (
      context: CanvasRenderingContext2D,
      placement: { options: MapTileOptions; tileSlug: string } | null,
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

      const mainSlot = tileMainSlotsBySlug.get(placement.tileSlug) ?? null;
      const tileImage = mainSlot?.pixels ? imageCache.getCachedImage(mainSlot.pixels) : null;

      if (!tileImage && simplified) {
        context.fillStyle = "rgba(216, 135, 83, 0.2)";
        context.fillRect(drawX, drawY, drawWidth, drawHeight);
        return;
      }

      const sourceKey = tileImage ? mainSlot?.pixels ?? placement.tileSlug : `fallback:${tileRecord.name}`;
      const variantKey = `${placement.tileSlug}:${sourceKey}:${serializeMapTileOptionsKey(placement.options)}`;
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

          for (let layerIndex = 0; layerIndex < MAP_LAYER_COUNT; layerIndex += 1) {
            const placement = layers[layerIndex]?.[tileY]?.[tileX] ?? null;
            const opacity = opacityForLayer(layerIndex);

            if (!placement?.tileSlug || opacity <= 0) {
              continue;
            }

            context.save();
            context.globalAlpha = opacity;
            renderTilePlacement(
              context,
              placement,
              drawX,
              drawY,
              tileDrawSize,
              tileDrawSize,
              simplifiedFallback
            );
            context.restore();
          }

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
            context.strokeRect(drawX + 2.5, drawY + 2.5, tileDrawSize - 5, tileDrawSize - 5);
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
      sourceCanvas.width = mapCanvasWidth;
      sourceCanvas.height = mapCanvasHeight;
      const sourceContext = sourceCanvas.getContext("2d");

      if (!sourceContext) {
        return;
      }

      renderMapGrid(sourceContext, layers, opacityForLayer, {
        showGrid: false
      });

      const scale = Math.min(MAP_PREVIEW_SIZE / mapCanvasWidth, MAP_PREVIEW_SIZE / mapCanvasHeight);
      const scaledWidth = Math.max(1, Math.round(mapCanvasWidth * scale));
      const scaledHeight = Math.max(1, Math.round(mapCanvasHeight * scale));
      const offsetX = Math.floor((MAP_PREVIEW_SIZE - scaledWidth) / 2);
      const offsetY = Math.floor((MAP_PREVIEW_SIZE - scaledHeight) / 2);

      context.save();
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
      context.restore();
    }
  );

  const ensureBrushImagesLoaded = useEffectEvent(async () => {
    const mainSlotUrls = tiles
      .map((tileRecord) => tileMainSlotsBySlug.get(tileRecord.slug)?.pixels ?? "")
      .filter(Boolean);

    await Promise.all(mainSlotUrls.map((imageUrl) => imageCache.ensureImage(imageUrl)));
  });

  const renderMapCanvas = useEffectEvent(async () => {
    const mapCanvas = mapCanvasRef.current;

    if (!mapCanvas) {
      return;
    }

    const context = mapCanvas.getContext("2d");

    if (!context) {
      return;
    }

    await ensureBrushImagesLoaded();
    renderMapGrid(context, draftLayers, (layerIndex) => layerVisibilities[layerIndex] ?? 1, {
      hoverCell,
      showGrid: true
    });
  });

  const renderPreviewCanvases = useEffectEvent(async () => {
    await ensureBrushImagesLoaded();
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
    void renderMapCanvas();
  }, [draftLayers, hoverCell, layerVisibilities, mapCanvasHeight, mapCanvasWidth, mapHeight, mapWidth, renderMapCanvas, tiles]);

  useEffect(() => {
    void renderPreviewCanvases();
  }, [draftLayers, layerVisibilities, mapCanvasHeight, mapCanvasWidth, mapHeight, mapWidth, renderPreviewCanvases, tiles]);

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

    nextRow[nextCell.tileX] = mapBrushTileSlug ? createMapTilePlacement(mapBrushTileSlug, brushOptions) : null;
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
  const activeBrushTile = tiles.find((tileRecord) => tileRecord.slug === mapBrushTileSlug) ?? null;
  const activeLayerTitle = `${activeLayerIndex} - ${TILE_LIBRARY_LAYERS[activeLayerIndex]?.description ?? "Layer"}`;
  const activeOpacityValue = layerVisibilities[activeLayerIndex] ?? 1;
  const selectedBrushLabel = activeBrushTile
    ? brushOptionLabels.length
      ? `${activeBrushTile.name} • ${brushOptionLabels.join(", ")}`
      : activeBrushTile.name
    : "Eraser";
  const hoverLabel = hoverCell
    ? (() => {
        const layerDetails = draftLayers
          .map((layerCells, layerIndex) => {
            const placement = layerCells?.[hoverCell.tileY]?.[hoverCell.tileX] ?? null;

            if (!placement?.tileSlug) {
              return null;
            }

            const tileRecord = tilesBySlug.get(placement.tileSlug) ?? null;
            const optionLabels = describeMapTileOptions(placement.options);

            return `L${layerIndex} ${tileRecord?.slug ?? placement.tileSlug}${
              optionLabels.length ? ` (${optionLabels.join(", ")})` : ""
            }`;
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
                  <strong className="truncate text-sm font-semibold text-[#142127]">
                    {mapRecord.name}
                  </strong>
                  <span className="font-mono text-xs text-[#4a6069]">{mapRecord.slug}</span>
                </div>
                <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#4a6069]">
                  {mapRecord.width}x{mapRecord.height}
                </span>
              </button>
            ))}
          </div>
          {!filteredMaps.length ? (
            <div className="text-sm text-[#4a6069]">No maps match that filter.</div>
          ) : null}
        </Panel>

        <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(18rem,0.7fr)_minmax(0,1.65fr)]">
          <div className="grid min-h-0 gap-4">
            <Panel
              description={`Pick a brush tile from ${selectedLayer.index} - ${selectedLayer.description}, then combine flip, rotation, and tint options before painting.`}
              title="Brush Palette"
            >
              <div className="grid gap-4">
              <div className={sectionCardClass}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#4a6069]">
                    Brush Effects
                  </div>
                  <input
                    className="h-9 w-14 cursor-pointer border border-[#c3d0cb] bg-white"
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
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {BRUSH_OPTION_DEFINITIONS.map((option) => (
                    <label
                      className="flex min-h-10 items-center gap-3 border border-[#c3d0cb] bg-white px-3 py-2 text-sm text-[#142127]"
                      key={option.id}
                    >
                      <input
                        checked={brushOptions[option.id]}
                        className="h-4 w-4 accent-[#d88753]"
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
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              <button
                className={`${selectableCardClass(
                  mapBrushTileSlug === "",
                  "border-[#c3d0cb]/85 bg-white/90 hover:border-[#d88753]/55 hover:bg-white"
                )} grid justify-items-center gap-2 p-3 text-center`}
                onClick={() => {
                  setMapBrushTileSlug("");
                }}
                type="button"
              >
                <div className="grid h-32 max-h-32 w-full max-w-32 place-self-center place-items-center overflow-hidden bg-[linear-gradient(135deg,rgba(19,38,47,0.92),rgba(36,66,79,0.88))] text-[#fffdf8]/84">
                  <FontAwesomeIcon className="h-10 w-10" icon={faEraser} title="Erase" />
                </div>
                <div className="text-center text-sm font-normal leading-tight text-[#4a6069]">
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
                      tileRecord.slug === mapBrushTileSlug,
                      "border-[#c3d0cb]/85 bg-white/90 hover:border-[#d88753]/55 hover:bg-white"
                    )} grid justify-items-center gap-2 p-3 text-center`}
                    key={tileRecord.slug}
                  >
                    <button
                      className="grid w-full justify-items-center gap-2 text-center"
                      onClick={() => {
                        setMapBrushTileSlug(tileRecord.slug);
                      }}
                      type="button"
                    >
                      <div className="grid h-32 max-h-32 w-full max-w-32 place-self-center place-items-center overflow-hidden bg-[linear-gradient(45deg,rgba(231,220,197,0.6)_25%,rgba(255,255,255,0.9)_25%,rgba(255,255,255,0.9)_75%,rgba(231,220,197,0.6)_75%),linear-gradient(45deg,rgba(231,220,197,0.6)_25%,rgba(255,255,255,0.9)_25%,rgba(255,255,255,0.9)_75%,rgba(231,220,197,0.6)_75%)] bg-[length:24px_24px] bg-[position:0_0,12px_12px]">
                        {mainSlot?.pixels ? (
                          <img
                            alt={tileRecord.name}
                            className="max-h-32 max-w-32 object-contain"
                            src={mainSlot.pixels}
                          />
                        ) : (
                          <span>No Main</span>
                        )}
                      </div>
                    </button>
                    <div className="flex w-full items-start gap-2">
                      <button
                        className="grid h-7 w-7 shrink-0 place-items-center border border-[#c3d0cb] text-[#4a6069] transition hover:border-[#d88753] hover:text-[#d88753]"
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
                        className="min-w-0 flex-1 text-left text-sm font-normal leading-tight text-[#4a6069]"
                        onClick={() => {
                          setMapBrushTileSlug(tileRecord.slug);
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
              </div>
              {!visibleBrushTiles.length ? (
                <div className="text-sm text-[#4a6069]">
                  No tiles are available in {selectedLayer.folder}/ yet.
                </div>
              ) : null}
            </Panel>
          </div>

          <Panel
            actions={
              <button className={actionButtonClass} onClick={handleSaveMap} type="button">
                Save Map
              </button>
            }
            description={`Paint directly on the ${mapWidth}x${mapHeight} layered map canvas. The scale controls only change the viewing size.`}
            footer={
              <div className="flex flex-wrap items-center gap-3">
                <div className={statusChipClass}>
                  {busyLabel
                    ? `${busyLabel}...`
                    : activeBrushTile
                      ? `Brush: ${selectedBrushLabel}`
                      : "Brush: eraser"}
                </div>
              </div>
            }
            title="Map Canvas"
          >
            <MapWorkspace
              activeLayerIndex={activeLayerIndex}
              activeLayerTitle={activeLayerTitle}
              activeOpacityValue={activeOpacityValue}
              canZoomIn={currentScale > MAP_MIN_SCALE_PERCENT}
              canZoomOut={currentScale < MAP_MAX_SCALE_PERCENT}
              hoverLabel={hoverLabel}
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
          className="fixed inset-0 z-50 overflow-y-auto bg-[rgba(20,33,39,0.55)] px-4 py-8"
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
              <div className="border-b border-[#c3d0cb]/65 px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-serif text-[1.4rem] leading-tight text-[#142127]">
                      Create Map
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-[#4a6069]">
                      Name the map and choose its grid size before creating the server-backed JSON
                      file.
                    </p>
                  </div>
                  <button
                    className={`${closeButtonClass} min-h-11 min-w-11 bg-white`}
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
                    className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#4a6069]"
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
                  <div className="text-xs text-[#4a6069]">
                    New map will be created as{" "}
                    <span className="font-mono">{normalizedNewMapName}</span>
                  </div>
                ) : null}

                <div className="text-xs text-[#4a6069]">
                  New map size: {normalizedNewMapWidth}x{normalizedNewMapHeight}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#c3d0cb]/65 bg-[rgba(244,239,226,0.58)] px-6 py-4">
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
