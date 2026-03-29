import {
  MAP_DEFAULT_GRID_SIZE,
  MAP_MAX_SCALE_PERCENT,
  MAP_MIN_SCALE_PERCENT,
  TILE_SIZE
} from "./constants";
import { theme } from "../styles/theme";
import type { TileCell, TileRecord } from "../types";

const MAP_MIN_GRID_SIZE = 1;
const MAP_MAX_GRID_SIZE = 200;

export function normalizeMapDimension(value: number | string | undefined) {
  const numericValue =
    typeof value === "string" ? Number.parseInt(value, 10) : Number(value ?? MAP_DEFAULT_GRID_SIZE);

  if (!Number.isFinite(numericValue)) {
    return MAP_DEFAULT_GRID_SIZE;
  }

  return Math.min(MAP_MAX_GRID_SIZE, Math.max(MAP_MIN_GRID_SIZE, Math.round(numericValue)));
}

export function createEmptyMapCells(width = MAP_DEFAULT_GRID_SIZE, height = MAP_DEFAULT_GRID_SIZE) {
  const normalizedWidth = normalizeMapDimension(width);
  const normalizedHeight = normalizeMapDimension(height);

  return Array.from({ length: normalizedHeight }, () =>
    Array.from({ length: normalizedWidth }, () => "")
  );
}

export function getMapDimensions(cells: string[][] | undefined) {
  if (!Array.isArray(cells) || cells.length === 0) {
    return {
      height: MAP_DEFAULT_GRID_SIZE,
      width: MAP_DEFAULT_GRID_SIZE
    };
  }

  const height = normalizeMapDimension(cells.length);
  const widestRow = cells.reduce((maxWidth, row) => {
    if (!Array.isArray(row)) {
      return maxWidth;
    }

    return Math.max(maxWidth, row.length);
  }, 0);

  return {
    height,
    width: normalizeMapDimension(widestRow || MAP_DEFAULT_GRID_SIZE)
  };
}

export function normalizeMapCells(
  cells: string[][] | undefined,
  width?: number,
  height?: number
) {
  const inferredDimensions = getMapDimensions(cells);
  const normalizedWidth = normalizeMapDimension(width ?? inferredDimensions.width);
  const normalizedHeight = normalizeMapDimension(height ?? inferredDimensions.height);
  const safeCells = Array.isArray(cells) ? cells.slice(0, normalizedHeight) : [];

  while (safeCells.length < normalizedHeight) {
    safeCells.push([]);
  }

  return safeCells.map((row) => {
    const safeRow = Array.isArray(row) ? row.slice(0, normalizedWidth) : [];

    while (safeRow.length < normalizedWidth) {
      safeRow.push("");
    }

    return safeRow.map((cell) => (typeof cell === "string" ? cell : ""));
  });
}

export function clampMapScalePercent(scalePercent: number) {
  return Math.min(MAP_MAX_SCALE_PERCENT, Math.max(MAP_MIN_SCALE_PERCENT, scalePercent));
}

export function getMapCanvasWidth(width: number) {
  return normalizeMapDimension(width) * TILE_SIZE;
}

export function getMapCanvasHeight(height: number) {
  return normalizeMapDimension(height) * TILE_SIZE;
}

export function getAutoFitMapScalePercent(
  mapFrame: HTMLDivElement | null,
  canvasWidth: number,
  canvasHeight: number
) {
  if (!mapFrame) {
    return MAP_MIN_SCALE_PERCENT;
  }

  const availableWidth = Math.max(320, mapFrame.clientWidth - 36);
  const availableHeight = Math.max(320, mapFrame.clientHeight - 36);
  const percent = Math.round(
    Math.min((availableWidth / canvasWidth) * 100, (availableHeight / canvasHeight) * 100)
  );

  return clampMapScalePercent(percent);
}

export function getMapCellFromPointerEvent(
  canvas: HTMLCanvasElement,
  event: MouseEvent,
  mapWidth: number,
  mapHeight: number
): TileCell | null {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = Math.floor((event.clientX - rect.left) * scaleX);
  const canvasY = Math.floor((event.clientY - rect.top) * scaleY);
  const tileX = Math.floor(canvasX / TILE_SIZE);
  const tileY = Math.floor(canvasY / TILE_SIZE);

  if (tileX < 0 || tileX >= mapWidth || tileY < 0 || tileY >= mapHeight) {
    return null;
  }

  return { tileX, tileY };
}

export function drawMapCellBackground(
  context: CanvasRenderingContext2D,
  drawX: number,
  drawY: number
) {
  const half = TILE_SIZE / 2;

  context.fillStyle = theme.colors.panel;
  context.fillRect(drawX, drawY, TILE_SIZE, TILE_SIZE);
  context.fillStyle = theme.colors.paperDeep;
  context.fillRect(drawX, drawY, half, half);
  context.fillRect(drawX + half, drawY + half, half, half);
}

export function drawMapTileFallback(
  context: CanvasRenderingContext2D,
  tileRecord: TileRecord,
  drawX: number,
  drawY: number
) {
  drawMapCellBackground(context, drawX, drawY);
  context.fillStyle = "rgba(216, 135, 83, 0.2)";
  context.fillRect(drawX, drawY, TILE_SIZE, TILE_SIZE);
  context.fillStyle = theme.colors.accent;
  context.font = `700 22px ${theme.fonts.body}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(
    tileRecord.name.slice(0, 2).toUpperCase(),
    drawX + TILE_SIZE / 2,
    drawY + TILE_SIZE / 2
  );
}
