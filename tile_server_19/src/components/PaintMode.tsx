"use client";

import { memo, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  faBrush,
  faCropSimple,
  faDroplet,
  faEyeDropper,
  faEraser,
  faEye,
  faEyeSlash,
  faFillDrip,
  faFloppyDisk,
  faPencil,
  faStamp,
  faTrashCan,
  faVectorSquare
} from "@awesome.me/kit-a62459359b/icons/classic/solid";

import { saveTileAction } from "../actions/tileActions";
import { useStudio } from "../app/StudioContext";
import { SLOT_LAYER_COUNT, TILE_SIZE } from "../lib/constants";
import { loadImageFromUrl } from "../lib/images";
import { extractOctreePalette } from "../lib/octreePalette";
import {
  describeSlot,
  getSlotIndex,
  normalizeSlotLayers,
  type SlotKey
} from "../lib/slots";
import { actionButtonClass } from "./buttonStyles";
import { FontAwesomeIcon } from "./FontAwesomeIcon";
import { Panel } from "./Panel";
import {
  canvasViewportClass,
  compactTextInputClass,
  previewCanvasClass,
  previewSelectionButtonClass,
  sectionCardClass,
  secondaryButtonClass,
  selectablePanelClass,
  statusChipClass,
  toolSectionCardClass,
  visibilityOptionButtonClass,
  zoomButtonClass
} from "./uiStyles";
import type { PaintEditorSession, PaintLayerIndex, PaintToolId } from "../types";

type PaintTool = PaintToolId;
type MarqueeSelection = {
  endX: number;
  endY: number;
  startX: number;
  startY: number;
};
type StampPreview = {
  height: number;
  left: number;
  top: number;
  width: number;
};
type LoadedStampSource = {
  height: number;
  image: HTMLImageElement;
  width: number;
};

const PAINT_SCALE = 6;
const PAINT_ZOOM_MAX_PERCENT = 300;
const PAINT_ZOOM_MIN_PERCENT = 50;
const PAINT_ZOOM_STEP_PERCENT = 10;
const FIXED_QUICK_COLORS = ["#000000", "#ffffff"];
const FALLBACK_QUICK_COLORS = [
  "#142127",
  "#d88753",
  "#4b86ff",
  "#5a7b4d",
  "#f1c97b",
  "#efe7d4",
  "#c3d0cb",
  "#8ea3ad",
  "#24424f",
  "#7f5539",
  "#a8c686",
  "#f4c95d",
  "#7d5ba6"
];
const STAMP_GRID_COLOR = "rgba(255, 215, 64, 0.95)";
const STAMP_OVERLAY_OPACITY = 0.7;
const EDGER_TRIM_PIXELS = 2;
const LANCZOS_RADIUS = 3;
const EYEDROPPER_CURSOR =
  'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2724%27 height=%2724%27 viewBox=%270 0 24 24%27%3E%3Cg fill=%27none%27 stroke=%27%23142127%27 stroke-width=%271.8%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M14.3 3.2l6.5 6.5-2.1 2.1-6.5-6.5z%27/%3E%3Cpath d=%27M4.5 19.5l3.4-.8 8.3-8.3-2.6-2.6-8.3 8.3z%27/%3E%3Cpath d=%27M3.8 20.2l1.8-1.8%27/%3E%3C/g%3E%3C/svg%3E") 4 20, crosshair';
const VISIBILITY_OPTIONS = [
  { label: "Hide", value: 0 },
  { label: "20%", value: 0.2 },
  { label: "50%", value: 0.5 },
  { label: "100%", value: 1 }
] as const;

function getPaintToolDescription(tool: PaintTool | null | undefined) {
  if (!tool) {
    return "Select a tool.";
  }

  switch (tool) {
    case "brush":
      return "Brush (B) paints a small 3x3 area on the active layer.";
    case "eraser":
      return "Eraser (E) clears pixels from the active layer.";
    case "eyedropper":
      return "Color (I) selects the color from a spot on the image.";
    case "fill":
      return "Fill floods a connected area on the active layer with the current color.";
    case "marquee":
      return "Marquee (M) drags a box, then lets you copy [C] or erase [E] the selected region.";
    case "pencil":
      return "Pencil (P) draws single pixels on the active layer.";
    case "stamp":
      return "Stamp (S) places the selected clipboard slot into the active layer.";
    default:
      return "Select a tool.";
  }
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hexToRgba(hex: string) {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : normalized;

  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return [red, green, blue, 255] as const;
}

function colorsMatch(data: Uint8ClampedArray, index: number, rgba: readonly number[]) {
  return (
    data[index] === rgba[0] &&
    data[index + 1] === rgba[1] &&
    data[index + 2] === rgba[2] &&
    data[index + 3] === rgba[3]
  );
}

function rgbaToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function floodFill(imageData: ImageData, startX: number, startY: number, fillColor: readonly number[]) {
  const { data, height, width } = imageData;
  const targetIndex = (startY * width + startX) * 4;
  const targetColor = [
    data[targetIndex] ?? 0,
    data[targetIndex + 1] ?? 0,
    data[targetIndex + 2] ?? 0,
    data[targetIndex + 3] ?? 0
  ] as const;

  if (
    targetColor[0] === fillColor[0] &&
    targetColor[1] === fillColor[1] &&
    targetColor[2] === fillColor[2] &&
    targetColor[3] === fillColor[3]
  ) {
    return imageData;
  }

  const queue = [[startX, startY]];

  while (queue.length > 0) {
    const next = queue.pop();

    if (!next) {
      continue;
    }

    const [x, y] = next;

    if (x < 0 || x >= width || y < 0 || y >= height) {
      continue;
    }

    const index = (y * width + x) * 4;

    if (!colorsMatch(data, index, targetColor)) {
      continue;
    }

    data[index] = fillColor[0];
    data[index + 1] = fillColor[1];
    data[index + 2] = fillColor[2];
    data[index + 3] = fillColor[3];

    queue.push([x + 1, y]);
    queue.push([x - 1, y]);
    queue.push([x, y + 1]);
    queue.push([x, y - 1]);
  }

  return imageData;
}

function sinc(value: number) {
  if (value === 0) {
    return 1;
  }

  const scaledValue = Math.PI * value;
  return Math.sin(scaledValue) / scaledValue;
}

function lanczosKernel(distance: number, radius: number) {
  const absoluteDistance = Math.abs(distance);

  if (absoluteDistance >= radius) {
    return 0;
  }

  return sinc(absoluteDistance) * sinc(absoluteDistance / radius);
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampEdgerTrimPixels(value: number) {
  return Math.max(1, Math.min(Math.floor(TILE_SIZE / 2) - 1, Math.floor(value)));
}

function resampleImageDataLanczos(
  sourceImageData: ImageData,
  targetWidth: number,
  targetHeight: number,
  radius: number
) {
  const outputImageData = new ImageData(targetWidth, targetHeight);
  const sourceData = sourceImageData.data;
  const outputData = outputImageData.data;
  const scaleX = sourceImageData.width / targetWidth;
  const scaleY = sourceImageData.height / targetHeight;

  for (let targetY = 0; targetY < targetHeight; targetY += 1) {
    const sourceY = (targetY + 0.5) * scaleY - 0.5;
    const yStart = Math.max(0, Math.floor(sourceY - radius + 1));
    const yEnd = Math.min(sourceImageData.height - 1, Math.ceil(sourceY + radius - 1));

    for (let targetX = 0; targetX < targetWidth; targetX += 1) {
      const sourceX = (targetX + 0.5) * scaleX - 0.5;
      const xStart = Math.max(0, Math.floor(sourceX - radius + 1));
      const xEnd = Math.min(sourceImageData.width - 1, Math.ceil(sourceX + radius - 1));
      let redSum = 0;
      let greenSum = 0;
      let blueSum = 0;
      let alphaWeightSum = 0;
      let weightSum = 0;

      for (let sampleY = yStart; sampleY <= yEnd; sampleY += 1) {
        const kernelY = lanczosKernel(sourceY - sampleY, radius);

        if (kernelY === 0) {
          continue;
        }

        for (let sampleX = xStart; sampleX <= xEnd; sampleX += 1) {
          const kernelX = lanczosKernel(sourceX - sampleX, radius);
          const weight = kernelX * kernelY;

          if (weight === 0) {
            continue;
          }

          const sourceIndex = (sampleY * sourceImageData.width + sampleX) * 4;
          const sampleAlpha = (sourceData[sourceIndex + 3] ?? 0) / 255;
          const weightedAlpha = sampleAlpha * weight;

          redSum += (sourceData[sourceIndex] ?? 0) * weightedAlpha;
          greenSum += (sourceData[sourceIndex + 1] ?? 0) * weightedAlpha;
          blueSum += (sourceData[sourceIndex + 2] ?? 0) * weightedAlpha;
          alphaWeightSum += weightedAlpha;
          weightSum += weight;
        }
      }

      const outputIndex = (targetY * targetWidth + targetX) * 4;

      if (alphaWeightSum > 0 && weightSum > 0) {
        outputData[outputIndex] = clampChannel(redSum / alphaWeightSum);
        outputData[outputIndex + 1] = clampChannel(greenSum / alphaWeightSum);
        outputData[outputIndex + 2] = clampChannel(blueSum / alphaWeightSum);
        outputData[outputIndex + 3] = clampChannel((alphaWeightSum / weightSum) * 255);
      } else {
        outputData[outputIndex] = 0;
        outputData[outputIndex + 1] = 0;
        outputData[outputIndex + 2] = 0;
        outputData[outputIndex + 3] = 0;
      }
    }
  }

  return outputImageData;
}

function drawCheckerboard(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  squareSize: number
) {
  context.fillStyle = "#efe7d4";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#ddd3bc";

  for (let y = 0; y < height; y += squareSize) {
    for (let x = (y / squareSize) % 2 === 0 ? 0 : squareSize; x < width; x += squareSize * 2) {
      context.fillRect(x, y, squareSize, squareSize);
    }
  }
}

function ensureCanvasSize(canvas: HTMLCanvasElement, width: number, height: number) {
  if (canvas.width !== width) {
    canvas.width = width;
  }

  if (canvas.height !== height) {
    canvas.height = height;
  }
}

function isCanvasBlank(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");

  if (!context) {
    return true;
  }

  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;

  for (let index = 3; index < data.length; index += 4) {
    if ((data[index] ?? 0) !== 0) {
      return false;
    }
  }

  return true;
}

interface PaintModeProps {
  session: PaintEditorSession;
}

interface PaintWorkspaceProps {
  canZoomIn: boolean;
  canZoomOut: boolean;
  editorCanvasRef: { current: HTMLCanvasElement | null };
  editorDisplaySize: number;
  editorViewportRef: { current: HTMLDivElement | null };
  isLoading: boolean;
  layerPreviewCanvasRefs: { current: Array<HTMLCanvasElement | null> };
  layerVisibilities: number[];
  layerVisibilitySignature: string;
  onClearLayer: (layerIndex: number) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerLeave: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onSelectLayer: (layerIndex: number) => void;
  onSetLayerVisibility: (layerIndex: number, visibility: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  preview128CanvasRef: { current: HTMLCanvasElement | null };
  preview64CanvasRef: { current: HTMLCanvasElement | null };
  selectedLayerIndex: PaintLayerIndex;
  selectedTool: PaintTool;
  zoomPercent: number;
}

// The canvas-heavy workspace is memoized so clipboard-only app-shell updates
// can refresh status/tool chrome without forcing the editor and previews to rerender.
const PaintWorkspace = memo(function PaintWorkspace({
  canZoomIn,
  canZoomOut,
  editorCanvasRef,
  editorDisplaySize,
  editorViewportRef,
  isLoading,
  layerPreviewCanvasRefs,
  layerVisibilities,
  onClearLayer,
  onPointerCancel,
  onPointerDown,
  onPointerLeave,
  onPointerMove,
  onPointerUp,
  onSelectLayer,
  onSetLayerVisibility,
  onZoomIn,
  onZoomOut,
  preview128CanvasRef,
  preview64CanvasRef,
  selectedLayerIndex,
  selectedTool,
  zoomPercent
}: PaintWorkspaceProps) {
  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="grid min-h-0 content-start gap-3">
        <div
          className={`${canvasViewportClass} h-[clamp(28rem,70vh,58rem)] p-3`}
          ref={editorViewportRef}
        >
          <canvas
            className={`block h-auto max-w-none [image-rendering:pixelated] ${isLoading ? "opacity-60" : ""}`}
            onPointerCancel={onPointerCancel}
            onPointerDown={onPointerDown}
            onPointerLeave={onPointerLeave}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            ref={editorCanvasRef}
            style={{
              cursor: selectedTool === "eyedropper" ? EYEDROPPER_CURSOR : "crosshair",
              height: `${editorDisplaySize}px`,
              width: `${editorDisplaySize}px`
            }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className={statusChipClass}>
            Zoom {zoomPercent}%
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
            <span className="text-sm font-medium text-[#142127]">Zoom {zoomPercent}% ([ / ])</span>
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
          <div className="flex items-start gap-3">
            <div className="grid gap-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#4a6069]">
                128x128
              </div>
              <canvas
                className={`${previewCanvasClass} h-32 w-32`}
                ref={preview128CanvasRef}
              />
            </div>
            <div className="grid gap-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#4a6069]">
                64x64
              </div>
              <canvas
                className={`${previewCanvasClass} h-16 w-16`}
                ref={preview64CanvasRef}
              />
            </div>
          </div>
        </div>

        {Array.from({ length: SLOT_LAYER_COUNT }, (_, layerIndex) => {
          const selected = selectedLayerIndex === layerIndex;

          return (
            <div
              className={selectablePanelClass(selected)}
              key={layerIndex}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  className="text-left text-xs font-extrabold uppercase tracking-[0.12em] text-[#142127]"
                  onClick={() => {
                    onSelectLayer(layerIndex);
                  }}
                  type="button"
                >
                  Layer {layerIndex}
                </button>
                <button
                  className="grid h-6 w-6 place-items-center border border-[#c3d0cb] text-[#4a6069] transition hover:border-[#d88753] hover:text-[#d88753]"
                  onClick={() => {
                    onClearLayer(layerIndex);
                  }}
                  title={`Clear Layer ${layerIndex}`}
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
                  title={`Select Layer ${layerIndex}`}
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
      </div>
    </div>
  );
}, function arePaintWorkspacePropsEqual(previousProps, nextProps) {
  // Only paint-facing props belong in this comparison. If clipboard status, selected slot,
  // or manager-open state were added here, marquee copy would start rerendering the canvases.
  return (
    previousProps.canZoomIn === nextProps.canZoomIn &&
    previousProps.canZoomOut === nextProps.canZoomOut &&
    previousProps.editorDisplaySize === nextProps.editorDisplaySize &&
    previousProps.isLoading === nextProps.isLoading &&
    previousProps.layerVisibilitySignature === nextProps.layerVisibilitySignature &&
    previousProps.selectedLayerIndex === nextProps.selectedLayerIndex &&
    previousProps.selectedTool === nextProps.selectedTool &&
    previousProps.zoomPercent === nextProps.zoomPercent
  );
});

export function PaintMode({ session }: PaintModeProps) {
  const {
    clipboardSlots,
    getPaintEditorUiState,
    getTileDraftSlots,
    isClipboardManagerOpen,
    putClipboardSlot,
    selectedClipboardSlotIndex,
    setClipboardManagerOpen,
    setPaintEditorUiState,
    setTileDraftSlots,
    tiles,
    updateTileDraftSlot,
    upsertTile
  } = useStudio();
  const [paintStatus, setPaintStatus] = useState(
    "Painting updates stay in the tile draft until you save the tile in Tile Editor."
  );
  const [quickColors, setQuickColors] = useState(() =>
    [...FIXED_QUICK_COLORS, ...FALLBACK_QUICK_COLORS].slice(0, 15)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isEdgerConfirmOpen, setIsEdgerConfirmOpen] = useState(false);
  const [edgerTrimPixelsInput, setEdgerTrimPixelsInput] = useState(String(EDGER_TRIM_PIXELS));
  const [marqueeSelection, setMarqueeSelection] = useState<MarqueeSelection | null>(null);
  const [stampPreview, setStampPreview] = useState<StampPreview | null>(null);
  const [stampSource, setStampSource] = useState<LoadedStampSource | null>(null);
  const [, startTransition] = useTransition();
  const previousToolRef = useRef<PaintTool>("pencil");
  const drawingRef = useRef(false);
  const marqueeSelectingRef = useRef(false);
  const marqueeSelectionRef = useRef<MarqueeSelection | null>(null);
  const editorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const editorViewportRef = useRef<HTMLDivElement | null>(null);
  const hoverAnchorRef = useRef<{ xRatio: number; yRatio: number } | null>(null);
  const lastPaintedPixelKeyRef = useRef("");
  const pendingZoomAnchorRef = useRef<{ xRatio: number; yRatio: number } | null>(null);
  const preview128CanvasRef = useRef<HTMLCanvasElement | null>(null);
  const preview64CanvasRef = useRef<HTMLCanvasElement | null>(null);
  const layerPreviewCanvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const layerCanvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  // Local paint commits already updated the live layer canvases. When the draft state echoes
  // the same layers back into this component, skip the PNG decode/reload cycle to avoid flashes.
  const lastCommittedLayerSignatureRef = useRef<string | null>(null);
  const tileRecord = tiles.find((candidate) => candidate.slug === session.tileSlug) ?? null;
  const draftSlots = getTileDraftSlots(session.tileSlug, tileRecord?.slots);
  const slotIndex = getSlotIndex(session.slotKey as SlotKey);
  const slotRecord = draftSlots[slotIndex] ?? null;
  const paintEditorUiState = getPaintEditorUiState(session.id);
  const layerVisibilities = paintEditorUiState.layerVisibilities;
  const paintColor = paintEditorUiState.paintColor;
  const selectedLayerIndex = paintEditorUiState.selectedLayerIndex;
  const selectedTool = paintEditorUiState.selectedTool;
  const selectedClipboardSlot =
    typeof selectedClipboardSlotIndex === "number" ? clipboardSlots[selectedClipboardSlotIndex] ?? null : null;
  const selectedClipboardSlotIndexRef = useRef<number | null>(selectedClipboardSlotIndex);
  const selectedClipboardSlotRef = useRef(selectedClipboardSlot);
  const isClipboardManagerOpenRef = useRef(isClipboardManagerOpen);
  const slotLayers = useMemo(
    () => normalizeSlotLayers(slotRecord?.layers, slotRecord?.pixels ?? ""),
    [slotRecord?.layers, slotRecord?.pixels]
  );
  const slotLayerSignature = useMemo(() => JSON.stringify(slotLayers), [slotLayers]);
  const layerVisibilitySignature = layerVisibilities.join(",");
  const zoomPercent = paintEditorUiState.zoomPercent;
  const editorDisplaySize = Math.round((TILE_SIZE * PAINT_SCALE * zoomPercent) / 100);

  useEffect(() => {
    // Marquee copy can update clipboard selection and manager state without changing any
    // paint pixels. Keep the latest clipboard targets in refs so the memoized workspace
    // can continue using fresh clipboard behavior even when its render is skipped.
    selectedClipboardSlotIndexRef.current = selectedClipboardSlotIndex;
    selectedClipboardSlotRef.current = selectedClipboardSlot;
    isClipboardManagerOpenRef.current = isClipboardManagerOpen;
  }, [isClipboardManagerOpen, selectedClipboardSlot, selectedClipboardSlotIndex]);

  function updatePaintEditorUiState(nextState: Partial<{
    layerVisibilities: number[];
    paintColor: string;
    selectedLayerIndex: PaintLayerIndex;
    selectedTool: PaintTool;
    zoomPercent: number;
  }>) {
    setPaintEditorUiState(session.id, nextState);
  }

  function handleSelectLayer(layerIndex: number) {
    if (layerIndex < 0 || layerIndex >= SLOT_LAYER_COUNT) {
      return;
    }

    updatePaintEditorUiState({
      selectedLayerIndex: layerIndex as PaintLayerIndex
    });
  }

  function updateLayerVisibilities(updater: (currentLayerVisibilities: number[]) => number[]) {
    updatePaintEditorUiState({
      layerVisibilities: updater(layerVisibilities.slice())
    });
  }

  function getLayerCanvas(layerIndex: number) {
    let canvas = layerCanvasRefs.current[layerIndex];

    if (!canvas) {
      canvas = document.createElement("canvas");
      ensureCanvasSize(canvas, TILE_SIZE, TILE_SIZE);
      layerCanvasRefs.current[layerIndex] = canvas;
    }

    return canvas;
  }

  function refreshQuickColors() {
    const finalCanvas = document.createElement("canvas");
    ensureCanvasSize(finalCanvas, TILE_SIZE, TILE_SIZE);
    const finalContext = finalCanvas.getContext("2d");

    if (!finalContext) {
      return;
    }

    finalContext.clearRect(0, 0, TILE_SIZE, TILE_SIZE);

    for (let layerIndex = 0; layerIndex < SLOT_LAYER_COUNT; layerIndex += 1) {
      finalContext.drawImage(getLayerCanvas(layerIndex), 0, 0);
    }

    const imagePalette = extractOctreePalette(
      finalContext.getImageData(0, 0, TILE_SIZE, TILE_SIZE),
      13,
      FALLBACK_QUICK_COLORS
    );
    const nextQuickColors = [...FIXED_QUICK_COLORS];

    for (const color of imagePalette) {
      if (!nextQuickColors.includes(color)) {
        nextQuickColors.push(color);
      }
    }

    for (const fallbackColor of FALLBACK_QUICK_COLORS) {
      if (nextQuickColors.length >= 15) {
        break;
      }

      if (!nextQuickColors.includes(fallbackColor)) {
        nextQuickColors.push(fallbackColor);
      }
    }

    setQuickColors((currentQuickColors) => {
      const normalizedQuickColors = nextQuickColors.slice(0, 15);
      return arraysEqual(currentQuickColors, normalizedQuickColors)
        ? currentQuickColors
        : normalizedQuickColors;
    });
  }

  function setCurrentMarqueeSelection(nextSelection: MarqueeSelection | null) {
    marqueeSelectionRef.current = nextSelection;
    setMarqueeSelection(nextSelection);
  }

  function clearMarqueeSelection() {
    setCurrentMarqueeSelection(null);
  }

  function getNormalizedMarqueeSelection(selection: MarqueeSelection) {
    const left = Math.max(0, Math.min(selection.startX, selection.endX));
    const top = Math.max(0, Math.min(selection.startY, selection.endY));
    const right = Math.min(TILE_SIZE - 1, Math.max(selection.startX, selection.endX));
    const bottom = Math.min(TILE_SIZE - 1, Math.max(selection.startY, selection.endY));

    return {
      bottom,
      height: bottom - top + 1,
      left,
      right,
      top,
      width: right - left + 1
    };
  }

  function getStampPreviewAtPixel(pixelX: number, pixelY: number) {
    if (!stampSource) {
      return null;
    }

    const width = Math.min(stampSource.width, TILE_SIZE - pixelX);
    const height = Math.min(stampSource.height, TILE_SIZE - pixelY);

    if (width <= 0 || height <= 0) {
      return null;
    }

    return {
      height,
      left: pixelX,
      top: pixelY,
      width
    };
  }

  function clearStampPreview() {
    setStampPreview((currentPreview) => (currentPreview ? null : currentPreview));
  }

  function exitStampTool() {
    clearStampPreview();

    if (selectedTool !== "stamp") {
      return;
    }

    const fallbackTool =
      previousToolRef.current === "eyedropper" || previousToolRef.current === "stamp"
        ? "pencil"
        : previousToolRef.current;

    updatePaintEditorUiState({ selectedTool: fallbackTool });
  }

  function updateStampPreviewFromPixel(pixelX: number, pixelY: number) {
    const nextPreview = getStampPreviewAtPixel(pixelX, pixelY);

    setStampPreview((currentPreview) => {
      if (
        currentPreview?.left === nextPreview?.left &&
        currentPreview?.top === nextPreview?.top &&
        currentPreview?.width === nextPreview?.width &&
        currentPreview?.height === nextPreview?.height
      ) {
        return currentPreview;
      }

      return nextPreview;
    });
  }

  function getVisibleEditorLayerIndices() {
    return Array.from({ length: selectedLayerIndex + 1 }, (_, index) => index).filter(
      (layerIndex) => (layerVisibilities[layerIndex] ?? 1) > 0
    );
  }

  function drawComposite(
    context: CanvasRenderingContext2D,
    layers: number[],
    opacityForLayer: (layerIndex: number) => number,
    shouldClear = true
  ) {
    if (shouldClear) {
      context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    }

    for (const layerIndex of layers) {
      const opacity = opacityForLayer(layerIndex);

      if (opacity <= 0) {
        continue;
      }

      context.save();
      context.globalAlpha = opacity;
      context.drawImage(getLayerCanvas(layerIndex), 0, 0, context.canvas.width, context.canvas.height);
      context.restore();
    }
  }

  function drawLayerPreviews() {
    layerPreviewCanvasRefs.current.forEach((previewCanvas, layerIndex) => {
      if (!previewCanvas) {
        return;
      }

      ensureCanvasSize(previewCanvas, TILE_SIZE, TILE_SIZE);
      const previewContext = previewCanvas.getContext("2d");

      if (!previewContext) {
        return;
      }

      drawCheckerboard(previewContext, TILE_SIZE, TILE_SIZE, 16);
      previewContext.drawImage(getLayerCanvas(layerIndex), 0, 0, TILE_SIZE, TILE_SIZE);
    });
  }

  function drawEditorCanvas() {
    const editorCanvas = editorCanvasRef.current;

    if (!editorCanvas) {
      return;
    }

    ensureCanvasSize(editorCanvas, TILE_SIZE * PAINT_SCALE, TILE_SIZE * PAINT_SCALE);
    const editorContext = editorCanvas.getContext("2d");

    if (!editorContext) {
      return;
    }

    drawCheckerboard(editorContext, editorCanvas.width, editorCanvas.height, PAINT_SCALE * 4);

    const visibleLayers = getVisibleEditorLayerIndices();

    drawComposite(
      editorContext,
      visibleLayers,
      (layerIndex) => layerVisibilities[layerIndex] ?? 1,
      false
    );

    if (selectedTool === "stamp" && stampPreview && stampSource) {
      editorContext.save();
      editorContext.globalAlpha = STAMP_OVERLAY_OPACITY;
      editorContext.imageSmoothingEnabled = false;
      editorContext.drawImage(
        stampSource.image,
        0,
        0,
        stampPreview.width,
        stampPreview.height,
        stampPreview.left * PAINT_SCALE,
        stampPreview.top * PAINT_SCALE,
        stampPreview.width * PAINT_SCALE,
        stampPreview.height * PAINT_SCALE
      );
      editorContext.restore();
    }

    editorContext.strokeStyle = "rgba(20, 33, 39, 0.18)";
    editorContext.lineWidth = 1;

    for (let index = 0; index <= TILE_SIZE; index += 1) {
      const position = index * PAINT_SCALE + 0.5;

      editorContext.beginPath();
      editorContext.moveTo(position, 0);
      editorContext.lineTo(position, editorCanvas.height);
      editorContext.stroke();

      editorContext.beginPath();
      editorContext.moveTo(0, position);
      editorContext.lineTo(editorCanvas.width, position);
      editorContext.stroke();
    }

    if (marqueeSelectionRef.current) {
      const normalizedSelection = getNormalizedMarqueeSelection(marqueeSelectionRef.current);
      const selectionX = normalizedSelection.left * PAINT_SCALE + 0.5;
      const selectionY = normalizedSelection.top * PAINT_SCALE + 0.5;
      const selectionWidth = normalizedSelection.width * PAINT_SCALE - 1;
      const selectionHeight = normalizedSelection.height * PAINT_SCALE - 1;

      editorContext.save();
      editorContext.setLineDash([6, 4]);
      editorContext.lineWidth = 2;
      editorContext.strokeStyle = "#4b86ff";
      editorContext.strokeRect(selectionX, selectionY, selectionWidth, selectionHeight);
      editorContext.restore();
    }

    if (selectedTool === "stamp" && stampPreview) {
      const previewLeft = stampPreview.left * PAINT_SCALE + 0.5;
      const previewTop = stampPreview.top * PAINT_SCALE + 0.5;
      const previewWidth = stampPreview.width * PAINT_SCALE;
      const previewHeight = stampPreview.height * PAINT_SCALE;

      editorContext.save();
      editorContext.strokeStyle = STAMP_GRID_COLOR;
      editorContext.lineWidth = 1;

      for (let offsetX = 0; offsetX <= stampPreview.width; offsetX += 1) {
        const x = (stampPreview.left + offsetX) * PAINT_SCALE + 0.5;
        editorContext.beginPath();
        editorContext.moveTo(x, previewTop);
        editorContext.lineTo(x, previewTop + previewHeight - 1);
        editorContext.stroke();
      }

      for (let offsetY = 0; offsetY <= stampPreview.height; offsetY += 1) {
        const y = (stampPreview.top + offsetY) * PAINT_SCALE + 0.5;
        editorContext.beginPath();
        editorContext.moveTo(previewLeft, y);
        editorContext.lineTo(previewLeft + previewWidth - 1, y);
        editorContext.stroke();
      }

      editorContext.strokeRect(previewLeft, previewTop, previewWidth - 1, previewHeight - 1);
      editorContext.restore();
    }
  }

  function drawFinalPreviews() {
    [preview128CanvasRef.current, preview64CanvasRef.current].forEach((previewCanvas, previewIndex) => {
      if (!previewCanvas) {
        return;
      }

      const previewSize = previewIndex === 0 ? 128 : 64;
      ensureCanvasSize(previewCanvas, previewSize, previewSize);
      const previewContext = previewCanvas.getContext("2d");

      if (!previewContext) {
        return;
      }

      drawCheckerboard(previewContext, previewSize, previewSize, Math.max(8, previewSize / 8));
      drawComposite(
        previewContext,
        [0, 1, 2, 3, 4],
        () => 1,
        false
      );
    });
  }

  function redrawAllCanvases() {
    drawLayerPreviews();
    drawEditorCanvas();
    drawFinalPreviews();
  }

  function getNormalizedLayersFromCanvases() {
    const nextLayers = Array.from({ length: SLOT_LAYER_COUNT }, (_, layerIndex) => {
      const layerCanvas = getLayerCanvas(layerIndex);
      return isCanvasBlank(layerCanvas) ? null : layerCanvas.toDataURL("image/png");
    });

    return normalizeSlotLayers(nextLayers, nextLayers[0] ?? "");
  }

  function buildCompositeImageDataForEdger() {
    const compositeCanvas = document.createElement("canvas");
    ensureCanvasSize(compositeCanvas, TILE_SIZE, TILE_SIZE);
    const compositeContext = compositeCanvas.getContext("2d");

    if (!compositeContext) {
      return null;
    }

    drawComposite(
      compositeContext,
      Array.from({ length: selectedLayerIndex }, (_, layerIndex) => layerIndex),
      () => 1
    );

    return compositeContext.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
  }

  function buildSlotRecordFromCanvases() {
    const nextLayers = getNormalizedLayersFromCanvases();

    const finalCanvas = document.createElement("canvas");
    ensureCanvasSize(finalCanvas, TILE_SIZE, TILE_SIZE);
    const finalContext = finalCanvas.getContext("2d");

    if (!finalContext) {
      throw new Error("Could not create a final slot canvas.");
    }

    drawComposite(finalContext, [0, 1, 2, 3, 4], () => 1);

    return {
      layers: normalizeSlotLayers(nextLayers, nextLayers[0] ?? ""),
      pixels: finalCanvas.toDataURL("image/png"),
      size: slotRecord?.size ?? TILE_SIZE,
      source_x: slotRecord?.source_x ?? 0,
      source_y: slotRecord?.source_y ?? 0
    };
  }

  function commitLayerChange(statusMessage: string) {
    const nextSlotRecord = buildSlotRecordFromCanvases();
    lastCommittedLayerSignatureRef.current = JSON.stringify(nextSlotRecord.layers);
    updateTileDraftSlot(session.tileSlug, session.slotKey as SlotKey, nextSlotRecord);
    refreshQuickColors();
    setPaintStatus(statusMessage);
  }

  useEffect(() => {
    if (lastCommittedLayerSignatureRef.current === slotLayerSignature) {
      lastCommittedLayerSignatureRef.current = null;
      return;
    }

    let cancelled = false;

    async function loadLayerCanvases() {
      setIsLoading(true);

      for (let layerIndex = 0; layerIndex < SLOT_LAYER_COUNT; layerIndex += 1) {
        const layerCanvas = getLayerCanvas(layerIndex);
        const layerContext = layerCanvas.getContext("2d");

        if (!layerContext) {
          continue;
        }

        layerContext.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
        const layerPixels = slotLayers[layerIndex];

        if (!layerPixels) {
          continue;
        }

        try {
          const image = await loadImageFromUrl(layerPixels);

          if (cancelled) {
            return;
          }

          layerContext.drawImage(image, 0, 0, TILE_SIZE, TILE_SIZE);
        } catch {
          if (!cancelled) {
            setPaintStatus(`Could not decode Layer ${layerIndex}.`);
          }
        }
      }

      if (!cancelled) {
        redrawAllCanvases();
        refreshQuickColors();
        setIsLoading(false);
      }
    }

    void loadLayerCanvases();

    return () => {
      cancelled = true;
    };
  }, [slotLayerSignature]);

  useEffect(() => {
    let cancelled = false;

    async function loadStampSource() {
      if (selectedTool !== "stamp") {
        return;
      }

      if (!selectedClipboardSlot?.image) {
        setStampSource(null);
        return;
      }

      try {
        const image = await loadImageFromUrl(selectedClipboardSlot.image);

        if (cancelled) {
          return;
        }

        setStampSource({
          height: Math.min(TILE_SIZE, image.naturalHeight || image.height),
          image,
          width: Math.min(TILE_SIZE, image.naturalWidth || image.width)
        });
      } catch {
        if (!cancelled) {
          setStampSource(null);

          if (selectedTool === "stamp") {
            setPaintStatus("Could not load the selected clipboard slot for stamping.");
          }
        }
      }
    }

    void loadStampSource();

    return () => {
      cancelled = true;
    };
  }, [selectedClipboardSlot?.image, selectedTool]);

  useEffect(() => {
    // Marquee and stamp preview changes are transient overlays. Redraw only the main editor
    // surface here so clipboard updates do not ripple through the layer and final previews.
    drawEditorCanvas();
  }, [layerVisibilities, marqueeSelection, selectedLayerIndex, selectedTool, stampPreview, stampSource]);

  useEffect(() => {
    if (selectedTool !== "stamp") {
      clearStampPreview();
      return;
    }

    if (typeof selectedClipboardSlotIndex !== "number" || !selectedClipboardSlot) {
      clearStampPreview();
      setPaintStatus("Select a filled clipboard slot, then click in Paint Mode to stamp it.");
      return;
    }

    if (!stampSource) {
      return;
    }

    setPaintStatus(
      `Click to stamp clipboard slot ${selectedClipboardSlotIndex + 1} into Layer ${selectedLayerIndex}. Stamp stays active until the pointer leaves the canvas or you pick another tool.`
    );
  }, [selectedClipboardSlot, selectedClipboardSlotIndex, selectedLayerIndex, selectedTool, stampSource]);

  useEffect(() => {
    if (selectedTool !== "marquee") {
      return;
    }

    if (!marqueeSelection || marqueeSelectingRef.current) {
      return;
    }

    const normalizedSelection = getNormalizedMarqueeSelection(marqueeSelection);
    setPaintStatus(
      `Marquee selected ${normalizedSelection.width}x${normalizedSelection.height} pixels. Press [C] to copy to clipboard or [E] to erase from Layer ${selectedLayerIndex}.`
    );
  }, [marqueeSelection, selectedLayerIndex, selectedTool]);

  function setActiveTool(nextTool: PaintTool) {
    if (nextTool !== "marquee") {
      marqueeSelectingRef.current = false;
      clearMarqueeSelection();
    }

    if (nextTool !== "stamp") {
      clearStampPreview();
    }

    if (nextTool === "eyedropper" || nextTool === "stamp") {
      if (selectedTool !== nextTool && selectedTool !== "eyedropper" && selectedTool !== "stamp") {
        previousToolRef.current = selectedTool;
      }
    } else {
      previousToolRef.current = nextTool;
    }

    updatePaintEditorUiState({ selectedTool: nextTool });
  }

  function clampZoomPercent(nextZoomPercent: number) {
    return Math.min(PAINT_ZOOM_MAX_PERCENT, Math.max(PAINT_ZOOM_MIN_PERCENT, nextZoomPercent));
  }

  function getZoomAnchor() {
    if (hoverAnchorRef.current) {
      return hoverAnchorRef.current;
    }

    const editorViewport = editorViewportRef.current;
    const editorCanvas = editorCanvasRef.current;

    if (!editorViewport || !editorCanvas || editorCanvas.offsetWidth <= 0 || editorCanvas.offsetHeight <= 0) {
      return { xRatio: 0.5, yRatio: 0.5 };
    }

    const anchorX = editorViewport.scrollLeft + editorViewport.clientWidth / 2 - editorCanvas.offsetLeft;
    const anchorY = editorViewport.scrollTop + editorViewport.clientHeight / 2 - editorCanvas.offsetTop;

    return {
      xRatio: Math.min(1, Math.max(0, anchorX / editorCanvas.offsetWidth)),
      yRatio: Math.min(1, Math.max(0, anchorY / editorCanvas.offsetHeight))
    };
  }

  function updateZoom(nextZoomPercent: number) {
    const clampedZoomPercent = clampZoomPercent(nextZoomPercent);

    if (clampedZoomPercent === zoomPercent) {
      return;
    }

    pendingZoomAnchorRef.current = getZoomAnchor();
    updatePaintEditorUiState({ zoomPercent: clampedZoomPercent });
  }

  function updateHoverAnchor(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      hoverAnchorRef.current = null;
      return;
    }

    hoverAnchorRef.current = {
      xRatio: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      yRatio: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    };
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (selectedTool === "marquee" && !marqueeSelectingRef.current && marqueeSelectionRef.current) {
        switch (event.key.toLowerCase()) {
          case "c":
            event.preventDefault();
            if (copyMarqueeSelectionToClipboard(marqueeSelectionRef.current)) {
              clearMarqueeSelection();
            }
            return;
          case "e":
            event.preventDefault();
            eraseMarqueeSelectionFromLayer(marqueeSelectionRef.current);
            return;
          default:
            break;
        }
      }

      switch (event.key.toLowerCase()) {
        case "p":
          event.preventDefault();
          setActiveTool("pencil");
          break;
        case "b":
          event.preventDefault();
          setActiveTool("brush");
          break;
        case "e":
          event.preventDefault();
          setActiveTool("eraser");
          break;
        case "i":
          event.preventDefault();
          setActiveTool("eyedropper");
          break;
        case "m":
          event.preventDefault();
          setActiveTool("marquee");
          break;
        case "s":
          event.preventDefault();
          setActiveTool("stamp");
          break;
        case "[":
          event.preventDefault();
          updateZoom(zoomPercent - PAINT_ZOOM_STEP_PERCENT);
          break;
        case "]":
          event.preventDefault();
          updateZoom(zoomPercent + PAINT_ZOOM_STEP_PERCENT);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedLayerIndex, selectedTool, zoomPercent]);

  useEffect(() => {
    const nextAnchor = pendingZoomAnchorRef.current;
    const editorViewport = editorViewportRef.current;
    const editorCanvas = editorCanvasRef.current;

    if (!nextAnchor || !editorViewport || !editorCanvas) {
      return;
    }

    pendingZoomAnchorRef.current = null;

    const adjustScroll = () => {
      const targetScrollLeft =
        editorCanvas.offsetLeft + nextAnchor.xRatio * editorCanvas.offsetWidth - editorViewport.clientWidth / 2;
      const targetScrollTop =
        editorCanvas.offsetTop + nextAnchor.yRatio * editorCanvas.offsetHeight - editorViewport.clientHeight / 2;
      const maxScrollLeft = Math.max(0, editorViewport.scrollWidth - editorViewport.clientWidth);
      const maxScrollTop = Math.max(0, editorViewport.scrollHeight - editorViewport.clientHeight);

      editorViewport.scrollLeft = Math.min(maxScrollLeft, Math.max(0, targetScrollLeft));
      editorViewport.scrollTop = Math.min(maxScrollTop, Math.max(0, targetScrollTop));
    };

    const frameId = window.requestAnimationFrame(adjustScroll);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [zoomPercent]);

  function getSelectedLayerContext() {
    return getLayerCanvas(selectedLayerIndex).getContext("2d");
  }

  function getVisibleEditorColor(pixelX: number, pixelY: number) {
    for (let layerIndex = selectedLayerIndex; layerIndex >= 0; layerIndex -= 1) {
      if (layerIndex !== selectedLayerIndex && (layerVisibilities[layerIndex] ?? 1) <= 0) {
        continue;
      }

      const layerContext = getLayerCanvas(layerIndex).getContext("2d");

      if (!layerContext) {
        continue;
      }

      const { data } = layerContext.getImageData(pixelX, pixelY, 1, 1);
      const alpha = data[3] ?? 0;

      if (alpha <= 0) {
        continue;
      }

      return rgbaToHex(data[0] ?? 0, data[1] ?? 0, data[2] ?? 0);
    }

    return null;
  }

  function getPixelFromPointer(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const pixelX = Math.max(
      0,
      Math.min(TILE_SIZE - 1, Math.floor(((event.clientX - rect.left) / rect.width) * TILE_SIZE))
    );
    const pixelY = Math.max(
      0,
      Math.min(TILE_SIZE - 1, Math.floor(((event.clientY - rect.top) / rect.height) * TILE_SIZE))
    );

    return { pixelX, pixelY };
  }

  function paintPixel(pixelX: number, pixelY: number) {
    const context = getSelectedLayerContext();

    if (!context) {
      return;
    }

    if (selectedTool === "eyedropper") {
      const sampledColor = getVisibleEditorColor(pixelX, pixelY);
      const previousTool = previousToolRef.current === "eyedropper" ? "pencil" : previousToolRef.current;

      if (!sampledColor) {
        setPaintStatus(`No visible color to sample at ${pixelX}, ${pixelY}.`);
        updatePaintEditorUiState({ selectedTool: previousTool });
        return;
      }

      updatePaintEditorUiState({ paintColor: sampledColor });
      setPaintStatus(`Sampled ${sampledColor} from ${session.title}.`);
      updatePaintEditorUiState({ selectedTool: previousTool });
      return;
    }

    const nextColor = hexToRgba(paintColor);

    if (selectedTool === "fill") {
      const imageData = context.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
      context.putImageData(floodFill(imageData, pixelX, pixelY, nextColor), 0, 0);
      redrawAllCanvases();
      commitLayerChange(`Filled ${session.title} Layer ${selectedLayerIndex} with ${paintColor}.`);
      return;
    }

    const brushRadius = selectedTool === "brush" ? 1 : 0;
    context.fillStyle = paintColor;

    for (let offsetY = -brushRadius; offsetY <= brushRadius; offsetY += 1) {
      for (let offsetX = -brushRadius; offsetX <= brushRadius; offsetX += 1) {
        const targetX = pixelX + offsetX;
        const targetY = pixelY + offsetY;

        if (targetX < 0 || targetX >= TILE_SIZE || targetY < 0 || targetY >= TILE_SIZE) {
          continue;
        }

        if (selectedTool === "eraser") {
          context.clearRect(targetX, targetY, 1, 1);
        } else {
          context.fillRect(targetX, targetY, 1, 1);
        }
      }
    }

    redrawAllCanvases();
  }

  function applyEdgerToCurrentLayer(trimPixels: number) {
    const layerCanvas = getLayerCanvas(selectedLayerIndex);
    const context = layerCanvas.getContext("2d");

    if (!context) {
      setPaintStatus("Could not access the active layer for Edger.");
      return;
    }

    const sourceImageData = buildCompositeImageDataForEdger();

    if (!sourceImageData) {
      setPaintStatus("Could not build the source image for Edger.");
      return;
    }

    const croppedSize = TILE_SIZE - trimPixels * 2;

    if (croppedSize <= 0) {
      setPaintStatus("Edger could not trim this layer safely.");
      return;
    }
    const sourceCanvas = document.createElement("canvas");
    ensureCanvasSize(sourceCanvas, TILE_SIZE, TILE_SIZE);
    const sourceContext = sourceCanvas.getContext("2d");

    if (!sourceContext) {
      setPaintStatus("Could not prepare the source canvas for Edger.");
      return;
    }

    sourceContext.putImageData(sourceImageData, 0, 0);

    const croppedSourceImageData = sourceContext.getImageData(
      trimPixels,
      trimPixels,
      croppedSize,
      croppedSize
    );
    const resampledImageData = resampleImageDataLanczos(croppedSourceImageData, TILE_SIZE, TILE_SIZE, LANCZOS_RADIUS);

    context.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
    context.putImageData(resampledImageData, 0, 0);
    redrawAllCanvases();
    commitLayerChange(
      `Edger rebuilt Layer ${selectedLayerIndex} from the layers below it, trimming ${trimPixels}px from each side and resampling back to ${TILE_SIZE}x${TILE_SIZE}.`
    );
  }

  function handleConfirmEdger() {
    const parsedTrimPixels = Number.parseInt(edgerTrimPixelsInput, 10);
    const trimPixels = clampEdgerTrimPixels(
      Number.isFinite(parsedTrimPixels) ? parsedTrimPixels : EDGER_TRIM_PIXELS
    );

    setEdgerTrimPixelsInput(String(trimPixels));
    setIsEdgerConfirmOpen(false);
    applyEdgerToCurrentLayer(trimPixels);
  }

  function stampClipboardPixels(pixelX: number, pixelY: number) {
    const clipboardSlotIndex = selectedClipboardSlotIndexRef.current;
    const clipboardSlot = selectedClipboardSlotRef.current;

    if (typeof clipboardSlotIndex !== "number" || !clipboardSlot) {
      setPaintStatus("Select a filled clipboard slot before using Stamp.");
      return;
    }

    if (!stampSource) {
      setPaintStatus("The selected clipboard slot is not ready to stamp yet.");
      return;
    }

    const context = getSelectedLayerContext();
    const nextPreview = getStampPreviewAtPixel(pixelX, pixelY);

    if (!context || !nextPreview) {
      setPaintStatus("Could not place the stamp at that location.");
      return;
    }

    context.save();
    context.imageSmoothingEnabled = false;
    context.drawImage(
      stampSource.image,
      0,
      0,
      nextPreview.width,
      nextPreview.height,
      nextPreview.left,
      nextPreview.top,
      nextPreview.width,
      nextPreview.height
    );
    context.restore();

    setStampPreview(nextPreview);
    redrawAllCanvases();
    commitLayerChange(
      `Stamped clipboard slot ${clipboardSlotIndex + 1} into ${session.title} Layer ${selectedLayerIndex}.`
    );
  }

  function copyMarqueeSelectionToClipboard(selection: MarqueeSelection) {
    const normalizedSelection = getNormalizedMarqueeSelection(selection);
    const compositeCanvas = document.createElement("canvas");
    const compositeContext = compositeCanvas.getContext("2d");

    ensureCanvasSize(compositeCanvas, TILE_SIZE, TILE_SIZE);

    if (!compositeContext) {
      setPaintStatus("Could not prepare the selection for the clipboard.");
      return false;
    }

    drawComposite(compositeContext, getVisibleEditorLayerIndices(), () => 1);

    const selectionCanvas = document.createElement("canvas");
    const selectionContext = selectionCanvas.getContext("2d");

    ensureCanvasSize(selectionCanvas, normalizedSelection.width, normalizedSelection.height);

    if (!selectionContext) {
      setPaintStatus("Could not prepare the selection for the clipboard.");
      return false;
    }

    selectionContext.clearRect(0, 0, normalizedSelection.width, normalizedSelection.height);
    selectionContext.drawImage(
      compositeCanvas,
      normalizedSelection.left,
      normalizedSelection.top,
      normalizedSelection.width,
      normalizedSelection.height,
      0,
      0,
      normalizedSelection.width,
      normalizedSelection.height
    );

    if (!isClipboardManagerOpenRef.current) {
      setClipboardManagerOpen(true);
    }

    const copyResult = putClipboardSlot(
      selectionCanvas.toDataURL("image/png"),
      selectedClipboardSlotIndexRef.current
    );

    if (!copyResult.ok || typeof copyResult.slotIndex !== "number") {
      setPaintStatus("Clipboard manager is full. Clear a slot or choose an existing slot first.");
      return false;
    }

    setPaintStatus(
      `Copied ${normalizedSelection.width}x${normalizedSelection.height} pixels to clipboard slot ${
        copyResult.slotIndex + 1
      }.`
    );
    return true;
  }

  function eraseMarqueeSelectionFromLayer(selection: MarqueeSelection) {
    const normalizedSelection = getNormalizedMarqueeSelection(selection);
    const context = getSelectedLayerContext();

    if (!context) {
      setPaintStatus("Could not erase the selected marquee area.");
      return;
    }

    context.clearRect(
      normalizedSelection.left,
      normalizedSelection.top,
      normalizedSelection.width,
      normalizedSelection.height
    );
    clearMarqueeSelection();
    redrawAllCanvases();
    commitLayerChange(
      `Erased ${normalizedSelection.width}x${normalizedSelection.height} pixels from ${session.title} Layer ${selectedLayerIndex}.`
    );
  }

  function finishStroke() {
    if (!drawingRef.current) {
      return;
    }

    drawingRef.current = false;
    lastPaintedPixelKeyRef.current = "";
    commitLayerChange(`Updated ${session.title} Layer ${selectedLayerIndex} using ${selectedTool}.`);
  }

  function finishMarqueeSelection() {
    if (!marqueeSelectingRef.current) {
      return;
    }

    marqueeSelectingRef.current = false;
    const completedSelection = marqueeSelectionRef.current;

    if (!completedSelection) {
      return;
    }

    const normalizedSelection = getNormalizedMarqueeSelection(completedSelection);
    setPaintStatus(
      `Marquee selected ${normalizedSelection.width}x${normalizedSelection.height} pixels. Press [C] to copy to clipboard or [E] to erase from Layer ${selectedLayerIndex}.`
    );
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    updateHoverAnchor(event);
    const { pixelX, pixelY } = getPixelFromPointer(event);
    const pixelKey = `${pixelX}:${pixelY}`;

    if (selectedTool === "stamp") {
      updateStampPreviewFromPixel(pixelX, pixelY);
      stampClipboardPixels(pixelX, pixelY);
      return;
    }

    if (selectedTool === "fill" || selectedTool === "eyedropper") {
      paintPixel(pixelX, pixelY);
      return;
    }

    if (selectedTool === "marquee") {
      event.currentTarget.setPointerCapture(event.pointerId);
      marqueeSelectingRef.current = true;
      setCurrentMarqueeSelection({
        endX: pixelX,
        endY: pixelY,
        startX: pixelX,
        startY: pixelY
      });
      setPaintStatus("Drag a box to copy pixels into the clipboard manager.");
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPaintedPixelKeyRef.current = pixelKey;
    paintPixel(pixelX, pixelY);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    updateHoverAnchor(event);

    if (selectedTool === "stamp") {
      const { pixelX, pixelY } = getPixelFromPointer(event);
      updateStampPreviewFromPixel(pixelX, pixelY);
      return;
    }

    if (marqueeSelectingRef.current) {
      const { pixelX, pixelY } = getPixelFromPointer(event);
      const currentSelection = marqueeSelectionRef.current;

      if (!currentSelection) {
        return;
      }

      setCurrentMarqueeSelection({
        ...currentSelection,
        endX: pixelX,
        endY: pixelY
      });
      return;
    }

    if (!drawingRef.current) {
      return;
    }

    const { pixelX, pixelY } = getPixelFromPointer(event);
    const pixelKey = `${pixelX}:${pixelY}`;

    if (lastPaintedPixelKeyRef.current === pixelKey) {
      return;
    }

    lastPaintedPixelKeyRef.current = pixelKey;
    paintPixel(pixelX, pixelY);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    updateHoverAnchor(event);

    if (marqueeSelectingRef.current) {
      const { pixelX, pixelY } = getPixelFromPointer(event);
      const currentSelection = marqueeSelectionRef.current;

      if (currentSelection) {
        setCurrentMarqueeSelection({
          ...currentSelection,
          endX: pixelX,
          endY: pixelY
        });
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      finishMarqueeSelection();
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    finishStroke();
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    finishMarqueeSelection();
    finishStroke();
  }

  function handlePointerLeave(event: React.PointerEvent<HTMLCanvasElement>) {
    hoverAnchorRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }

    if (selectedTool === "stamp") {
      exitStampTool();
    }

    finishMarqueeSelection();
    finishStroke();
  }

  function handleClearLayer(layerIndex: number) {
    if (layerIndex === 0) {
      return;
    }

    const layerCanvas = getLayerCanvas(layerIndex);
    const layerContext = layerCanvas.getContext("2d");

    if (!layerContext) {
      return;
    }

    layerContext.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
    redrawAllCanvases();
    commitLayerChange(`Cleared Layer ${layerIndex} in ${session.title}.`);
  }

  function handleSaveTile() {
    if (!tileRecord) {
      setPaintStatus("This tile no longer exists in the tile library.");
      return;
    }

    setIsSaving(true);
    startTransition(() => {
      void (async () => {
        try {
          const nextDraftSlots = getTileDraftSlots(session.tileSlug, tileRecord.slots).slice();
          nextDraftSlots[slotIndex] = buildSlotRecordFromCanvases();
          setTileDraftSlots(session.tileSlug, nextDraftSlots);

          const savedTile = await saveTileAction({
            slots: nextDraftSlots,
            slug: session.tileSlug,
            source: tileRecord.source
          });

          upsertTile(savedTile);
          // Keep the live draft/canvas state in place after save. Replacing it with the
          // server-returned slot payload can force a redundant layer reload even when the
          // editor already holds the same pixels locally.
          setTileDraftSlots(savedTile.slug, nextDraftSlots);
          setPaintStatus(
            `Saved ${savedTile.name} (${savedTile.slug}). Layer data and the combined slot image are now on the server.`
          );
        } catch (error: unknown) {
          setPaintStatus(
            error instanceof Error ? error.message : "Could not save this tile from Paint Mode."
          );
        } finally {
          setIsSaving(false);
        }
      })();
    });
  }

  if (!tileRecord) {
    return (
      <Panel title="Paint Mode">
        <p className="text-sm text-[#4a6069]">This slot no longer exists in the tile library.</p>
      </Panel>
    );
  }

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <Panel
        description={getPaintToolDescription(selectedTool)}
        title="Painting Tools"
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: faPencil, id: "pencil" as const, label: "Pencil", shortcut: "P" },
              { icon: faBrush, id: "brush" as const, label: "Brush", shortcut: "B" },
              { icon: faEraser, id: "eraser" as const, label: "Eraser", shortcut: "E" },
              { icon: faEyeDropper, id: "eyedropper" as const, label: "Color", shortcut: "I" },
              { icon: faVectorSquare, id: "marquee" as const, label: "Marquee", shortcut: "M" },
              { icon: faStamp, id: "stamp" as const, label: "Stamp", shortcut: "S" },
              { icon: faFillDrip, id: "fill" as const, label: "Fill", shortcut: "" }
            ].map((tool) => {
              const active = selectedTool === tool.id;

              return (
                <button
                  className={`relative flex min-h-[3.25rem] items-center justify-center border px-2 py-[6px] text-center transition ${
                    active
                      ? "border-[#d88753] bg-white text-[#142127] shadow-[inset_0_0_0_1px_rgba(216,135,83,0.25)]"
                      : "border-[#c3d0cb]/80 bg-white/88 text-[#4a6069] hover:border-[#4b86ff] hover:bg-white hover:text-[#142127]"
                  }`}
                  key={tool.id}
                  onClick={() => {
                    setActiveTool(tool.id);
                  }}
                  type="button"
                >
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
                    <FontAwesomeIcon className="h-4 w-4" icon={tool.icon} />
                  </span>
                  <span className="text-[11px] font-semibold leading-tight">{tool.label}</span>
                  {tool.shortcut ? (
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-[#c3d0cb] bg-white/80 px-1.5 py-0.5 text-[10px] leading-none text-[#4a6069]">
                      {tool.shortcut}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {selectedTool === "marquee" && marqueeSelection && !marqueeSelectingRef.current ? (
            <div className={toolSectionCardClass}>
              <div className="text-sm font-semibold text-[#142127]">Marquee Selection</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="min-h-10 border border-[#c3d0cb] bg-white px-3 py-2 text-sm font-semibold text-[#142127] transition hover:border-[#4b86ff] hover:bg-white"
                  onClick={() => {
                    if (copyMarqueeSelectionToClipboard(marqueeSelection)) {
                      clearMarqueeSelection();
                    }
                  }}
                  type="button"
                >
                  Copy to Clipboard [C]
                </button>
                <button
                  className="min-h-10 border border-[#c3d0cb] bg-white px-3 py-2 text-sm font-semibold text-[#142127] transition hover:border-[#d88753] hover:bg-white"
                  onClick={() => {
                    eraseMarqueeSelectionFromLayer(marqueeSelection);
                  }}
                  type="button"
                >
                  Erase [E]
                </button>
              </div>
            </div>
          ) : null}

          <div className={toolSectionCardClass}>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#142127]">
              <FontAwesomeIcon className="h-4 w-4 text-[#4b86ff]" icon={faDroplet} />
              Color Selection
            </div>
            <input
              className="h-11 w-full cursor-pointer border border-[#c3d0cb] bg-white"
              onChange={(event) => {
                updatePaintEditorUiState({ paintColor: event.currentTarget.value });
              }}
              type="color"
              value={paintColor}
            />
            <div className="grid grid-cols-5 gap-2">
              {quickColors.map((presetColor) => (
                <button
                  className={`h-8 w-8 border transition ${
                    paintColor === presetColor
                      ? "border-[#142127] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.9)]"
                      : "border-[#c3d0cb]"
                  }`}
                  key={presetColor}
                  onClick={() => {
                    updatePaintEditorUiState({ paintColor: presetColor });
                  }}
                  style={{ backgroundColor: presetColor }}
                  title={presetColor}
                  type="button"
                />
              ))}
            </div>
          </div>

          <div className={toolSectionCardClass}>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#142127]">
              <FontAwesomeIcon className="h-4 w-4 text-[#d88753]" icon={faCropSimple} />
              Advanced Tools
            </div>
            <button
              className="min-h-10 border border-[#c3d0cb] bg-white px-3 py-2 text-sm font-semibold text-[#142127] transition hover:border-[#d88753] hover:bg-white"
              onClick={() => {
                setIsEdgerConfirmOpen(true);
              }}
              type="button"
            >
              Run Edger On Layer {selectedLayerIndex}
            </button>
          </div>

          <div className={`${toolSectionCardClass} gap-2 text-sm text-[#4a6069]`}>
            <div className="font-semibold text-[#142127]">{session.title}</div>
            <div>Editing Layer {selectedLayerIndex}.</div>
            <div>
              {slotRecord
                ? `Original capture: ${slotRecord.size}px @ ${slotRecord.source_x}, ${slotRecord.source_y}`
                : "Starting from an empty slot."}
            </div>
            <div>
              {typeof selectedClipboardSlotIndex === "number" && selectedClipboardSlot
                ? `Stamp source: clipboard slot ${selectedClipboardSlotIndex + 1}.`
                : "Stamp source: select a filled clipboard slot in the Clipboard Manager."}
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        actions={
          <button className={actionButtonClass} disabled={isSaving} onClick={handleSaveTile} type="button">
            <span className="inline-flex items-center gap-2">
              <FontAwesomeIcon className="h-4 w-4" icon={faFloppyDisk} />
              <span>{isSaving ? "Saving..." : "Save Tile"}</span>
            </span>
          </button>
        }
        description={paintStatus}
        title={session.title}
      >
        <PaintWorkspace
          canZoomIn={zoomPercent > PAINT_ZOOM_MIN_PERCENT}
          canZoomOut={zoomPercent < PAINT_ZOOM_MAX_PERCENT}
          editorCanvasRef={editorCanvasRef}
          editorDisplaySize={editorDisplaySize}
          editorViewportRef={editorViewportRef}
          isLoading={isLoading}
          layerPreviewCanvasRefs={layerPreviewCanvasRefs}
          layerVisibilities={layerVisibilities}
          layerVisibilitySignature={layerVisibilitySignature}
          onClearLayer={handleClearLayer}
          onPointerCancel={handlePointerCancel}
          onPointerDown={handlePointerDown}
          onPointerLeave={handlePointerLeave}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onSelectLayer={handleSelectLayer}
          onSetLayerVisibility={(layerIndex, visibility) => {
            updateLayerVisibilities((currentVisibilities) => {
              const nextVisibilities = currentVisibilities.slice();
              nextVisibilities[layerIndex] = visibility;
              return nextVisibilities;
            });
          }}
          onZoomIn={() => {
            updateZoom(zoomPercent + PAINT_ZOOM_STEP_PERCENT);
          }}
          onZoomOut={() => {
            updateZoom(zoomPercent - PAINT_ZOOM_STEP_PERCENT);
          }}
          preview128CanvasRef={preview128CanvasRef}
          preview64CanvasRef={preview64CanvasRef}
          selectedLayerIndex={selectedLayerIndex}
          selectedTool={selectedTool}
          zoomPercent={zoomPercent}
        />
      </Panel>

      {isEdgerConfirmOpen ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[rgba(20,33,39,0.45)] p-4">
          <div className="w-full max-w-md border border-[#c3d0cb] bg-[linear-gradient(180deg,rgba(255,253,248,0.99),rgba(255,251,244,0.97))] p-5 shadow-[0_24px_60px_rgba(20,33,39,0.28)]">
            <div className="grid gap-3">
              <div className="text-lg font-semibold text-[#142127]">Run Edger?</div>
              <div className="text-sm text-[#4a6069]">
                Are you sure you would like to run the Edger tool which will erase the contents of layer {selectedLayerIndex} and replace it with the new image?
              </div>
              <label className="grid gap-1 text-sm text-[#4a6069]">
                <span className="font-semibold text-[#142127]">Edger Mode Size</span>
                <input
                  className={compactTextInputClass}
                  inputMode="numeric"
                  min={1}
                  onChange={(event) => {
                    setEdgerTrimPixelsInput(event.currentTarget.value);
                  }}
                  type="number"
                  value={edgerTrimPixelsInput}
                />
              </label>
              <div className="flex justify-end gap-3">
                <button
                  className={secondaryButtonClass}
                  onClick={() => {
                    setIsEdgerConfirmOpen(false);
                  }}
                  type="button"
                >
                  No
                </button>
                <button
                  className="min-h-10 border border-[#d88753] bg-[#d88753] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#c77641]"
                  onClick={handleConfirmEdger}
                  type="button"
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
