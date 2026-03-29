import {
  EMPTY_TILE_LABEL,
  PREVIEW_GRID_TILES,
  SLOT_COUNT,
  SLOT_LAYER_COUNT,
  TILE_BORDER_SNAP_DISTANCE,
  TILE_SIZE
} from "./constants";
import { theme } from "../styles/theme";
import type { PreviewPlacement, SelectedRegion, SlotRecord } from "../types";

export type SlotKey = "main" | "0" | "1" | "2" | "3";

export function describeSlot(slotKey: SlotKey) {
  return slotKey === "main" ? "Main" : `Accent ${Number(slotKey) + 1}`;
}

export function normalizeSlotLayers(
  layers: Array<string | null> | undefined,
  basePixels = ""
) {
  const normalizedLayers = Array.isArray(layers) ? layers.slice(0, SLOT_LAYER_COUNT) : [];

  while (normalizedLayers.length < SLOT_LAYER_COUNT) {
    normalizedLayers.push(null);
  }

  if (!normalizedLayers[0] && basePixels) {
    normalizedLayers[0] = basePixels;
  }

  return normalizedLayers.map((layerPixels, index) => {
    if (typeof layerPixels !== "string" || !layerPixels.trim()) {
      return index === 0 && basePixels ? basePixels : null;
    }

    return layerPixels.trim();
  });
}

export function createTransparentSlotRecord(size = TILE_SIZE, sourceX = 0, sourceY = 0) {
  return {
    layers: normalizeSlotLayers(undefined),
    pixels: "",
    size,
    source_x: sourceX,
    source_y: sourceY
  };
}

export function sanitizeSlotRecord(slotRecord: unknown): SlotRecord | null {
  if (
    !slotRecord ||
    typeof slotRecord !== "object" ||
    !("pixels" in slotRecord) ||
    !("size" in slotRecord) ||
    !("source_x" in slotRecord) ||
    !("source_y" in slotRecord)
  ) {
    return null;
  }

  const record = slotRecord as Partial<SlotRecord>;

  if (
    typeof record.pixels !== "string" ||
    typeof record.size !== "number" ||
    typeof record.source_x !== "number" ||
    typeof record.source_y !== "number"
  ) {
    return null;
  }

  return {
    layers: normalizeSlotLayers(record.layers, record.pixels),
    pixels: record.pixels,
    size: record.size,
    source_x: record.source_x,
    source_y: record.source_y
  };
}

export function normalizeSlotRecords(slotRecords: Array<SlotRecord | null> | undefined) {
  const normalized = Array.isArray(slotRecords) ? slotRecords.slice(0, SLOT_COUNT) : [];

  while (normalized.length < SLOT_COUNT) {
    normalized.push(null);
  }

  return normalized.map((slotRecord) => sanitizeSlotRecord(slotRecord));
}

export function clampSelection(
  imageWidth: number,
  imageHeight: number,
  imageX: number,
  imageY: number,
  selectionSize: number
) {
  const maxX = Math.max(0, imageWidth - selectionSize);
  const maxY = Math.max(0, imageHeight - selectionSize);

  return {
    x: Math.min(Math.max(0, imageX), maxX),
    y: Math.min(Math.max(0, imageY), maxY)
  };
}

export function snapToTileBorder(coordinate: number) {
  const border = Math.round(coordinate / TILE_SIZE) * TILE_SIZE;

  if (Math.abs(border - coordinate) <= TILE_BORDER_SNAP_DISTANCE) {
    return border;
  }

  return coordinate;
}

export function getSlotIndex(slotKey: SlotKey) {
  return slotKey === "main" ? 0 : Number(slotKey) + 1;
}

export function createPaddedSlotRecord(
  sourceImage: CanvasImageSource,
  selection: SelectedRegion
): SlotRecord {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;

  if (!context) {
    throw new Error("Could not create a tile canvas.");
  }

  context.clearRect(0, 0, TILE_SIZE, TILE_SIZE);

  const offset = Math.floor((TILE_SIZE - selection.size) / 2);

  context.drawImage(
    sourceImage,
    selection.x,
    selection.y,
    selection.size,
    selection.size,
    offset,
    offset,
    selection.size,
    selection.size
  );

  return {
    layers: normalizeSlotLayers([canvas.toDataURL("image/png")]),
    pixels: canvas.toDataURL("image/png"),
    size: selection.size,
    source_x: selection.x,
    source_y: selection.y
  };
}

export function drawPlaceholderCell(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  label = EMPTY_TILE_LABEL
) {
  context.fillStyle = theme.colors.canvas;
  context.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  context.strokeStyle = "rgba(255,255,255,0.14)";
  context.lineWidth = 1;
  context.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
  context.fillStyle = "rgba(255,255,255,0.72)";
  context.font = `700 18px ${theme.fonts.body}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, x + TILE_SIZE / 2, y + TILE_SIZE / 2);
}

function hashSeed(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createRandom(seedValue: string) {
  let seed = hashSeed(seedValue) || 1;

  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

export function buildPreviewPlacements(seedValue: string): PreviewPlacement[] {
  const availableCells: Array<{ tileX: number; tileY: number }> = [];

  for (let tileY = 0; tileY < PREVIEW_GRID_TILES; tileY += 1) {
    for (let tileX = 0; tileX < PREVIEW_GRID_TILES; tileX += 1) {
      availableCells.push({ tileX, tileY });
    }
  }

  const nextRandom = createRandom(seedValue);
  const placements: PreviewPlacement[] = [];

  for (let slotIndex = 0; slotIndex < SLOT_COUNT - 1; slotIndex += 1) {
    const placementCount = 1 + Math.floor(nextRandom() * 4);

    for (let count = 0; count < placementCount && availableCells.length > 0; count += 1) {
      const chosenIndex = Math.floor(nextRandom() * availableCells.length);
      const chosenCell = availableCells.splice(chosenIndex, 1)[0];

      if (chosenCell) {
        placements.push({
          slotIndex,
          tileX: chosenCell.tileX,
          tileY: chosenCell.tileY
        });
      }
    }
  }

  return placements;
}
