import {
  MAP_DEFAULT_GRID_SIZE,
  MAP_SPECIAL_IMPASSIBLE,
  MAP_LAYER_COUNT,
  MAP_MAX_SCALE_PERCENT,
  MAP_MIN_SCALE_PERCENT,
  TILE_SIZE
} from "./constants";
import { theme } from "../styles/theme";
import type {
  MapAssetPlacement,
  MapLayerCell,
  MapLayerGrid,
  MapLayerStack,
  MapSpecialGrid,
  MapSpritePlacement,
  MapTileOptions,
  MapTilePlacement,
  TileCell,
  TileRecord
} from "../types";

const MAP_MIN_GRID_SIZE = 1;
const MAP_MAX_GRID_SIZE = 200;
const DEFAULT_MAP_COLOR = "#ffffff";

function cloneMapLayerCell(cell: MapLayerCell): MapLayerCell {
  if (!cell) {
    return null;
  }

  if (cell.kind === "sprite") {
    return {
      kind: "sprite",
      spriteKey: cell.spriteKey
    };
  }

  return {
    kind: "tile",
    options: { ...cell.options },
    slotNum: cell.slotNum,
    tileSlug: cell.tileSlug
  };
}

function normalizeHexColor(value: string | undefined) {
  const trimmedValue = value?.trim() ?? "";

  if (/^#[0-9a-f]{6}$/iu.test(trimmedValue)) {
    return trimmedValue.toLowerCase();
  }

  if (/^#[0-9a-f]{3}$/iu.test(trimmedValue)) {
    return `#${trimmedValue
      .slice(1)
      .split("")
      .map((character) => `${character}${character}`)
      .join("")
      .toLowerCase()}`;
  }

  return DEFAULT_MAP_COLOR;
}

export function normalizeMapDimension(value: number | string | undefined) {
  const numericValue =
    typeof value === "string" ? Number.parseInt(value, 10) : Number(value ?? MAP_DEFAULT_GRID_SIZE);

  if (!Number.isFinite(numericValue)) {
    return MAP_DEFAULT_GRID_SIZE;
  }

  return Math.min(MAP_MAX_GRID_SIZE, Math.max(MAP_MIN_GRID_SIZE, Math.round(numericValue)));
}

export function normalizeMapTileOptions(options: Partial<MapTileOptions> | undefined): MapTileOptions {
  return {
    color: options?.color === true,
    colorValue: normalizeHexColor(options?.colorValue),
    flipHorizontal: options?.flipHorizontal === true,
    flipVertical: options?.flipVertical === true,
    multiply: options?.multiply === true,
    rotate180: options?.rotate180 === true,
    rotate270: options?.rotate270 === true,
    rotate90: options?.rotate90 === true
  };
}

export function createMapTilePlacement(
  tileSlug: string,
  options?: Partial<MapTileOptions>,
  slotNum = 0
): MapTilePlacement | null {
  const normalizedTileSlug = tileSlug.trim();

  if (!normalizedTileSlug) {
    return null;
  }

  return {
    kind: "tile",
    options: normalizeMapTileOptions(options),
    slotNum:
      Number.isFinite(slotNum) && slotNum >= 0
        ? Math.max(0, Math.round(slotNum))
        : 0,
    tileSlug: normalizedTileSlug
  };
}

export function createMapSpritePlacement(spriteKey: string): MapSpritePlacement | null {
  const normalizedSpriteKey = spriteKey.trim();

  if (!normalizedSpriteKey) {
    return null;
  }

  return {
    kind: "sprite",
    spriteKey: normalizedSpriteKey
  };
}

export function normalizeMapLayerCell(cell: unknown): MapLayerCell {
  if (typeof cell === "string") {
    const trimmedCell = cell.trim();

    if (!trimmedCell) {
      return null;
    }

    if (trimmedCell.toLowerCase().endsWith(".png")) {
      return createMapSpritePlacement(trimmedCell);
    }

    return createMapTilePlacement(trimmedCell);
  }

  if (!cell || typeof cell !== "object") {
    return null;
  }

  const candidate = cell as Partial<MapTilePlacement> & Partial<MapSpritePlacement>;

  if (candidate.kind === "sprite" || typeof candidate.spriteKey === "string") {
    return createMapSpritePlacement(candidate.spriteKey ?? "");
  }

  return createMapTilePlacement(
    candidate.tileSlug ?? "",
    candidate.options,
    typeof candidate.slotNum === "number" ? candidate.slotNum : 0
  );
}

export function isMapTilePlacement(
  placement: MapAssetPlacement | null | undefined
): placement is MapTilePlacement {
  return placement?.kind === "tile";
}

export function isMapSpritePlacement(
  placement: MapAssetPlacement | null | undefined
): placement is MapSpritePlacement {
  return placement?.kind === "sprite";
}

export function serializeMapTileOptionsKey(options: Partial<MapTileOptions> | undefined) {
  const normalizedOptions = normalizeMapTileOptions(options);
  return JSON.stringify(normalizedOptions);
}

export function describeMapTileOptions(options: Partial<MapTileOptions> | undefined) {
  const normalizedOptions = normalizeMapTileOptions(options);
  const labels: string[] = [];

  if (normalizedOptions.flipHorizontal) {
    labels.push("Flip Horizontal");
  }

  if (normalizedOptions.flipVertical) {
    labels.push("Flip Vertical");
  }

  if (normalizedOptions.rotate90) {
    labels.push("Rotate 90");
  }

  if (normalizedOptions.rotate180) {
    labels.push("Rotate 180");
  }

  if (normalizedOptions.rotate270) {
    labels.push("Rotate 270");
  }

  if (normalizedOptions.multiply) {
    labels.push(`Multiply ${normalizedOptions.colorValue}`);
  }

  if (normalizedOptions.color) {
    labels.push(`Color ${normalizedOptions.colorValue}`);
  }

  return labels;
}

export function createEmptyMapCells(
  width = MAP_DEFAULT_GRID_SIZE,
  height = MAP_DEFAULT_GRID_SIZE
): MapLayerGrid {
  const normalizedWidth = normalizeMapDimension(width);
  const normalizedHeight = normalizeMapDimension(height);

  return Array.from({ length: normalizedHeight }, () =>
    Array.from({ length: normalizedWidth }, () => null)
  );
}

export function createEmptyMapLayers(width = MAP_DEFAULT_GRID_SIZE, height = MAP_DEFAULT_GRID_SIZE): MapLayerStack {
  return Array.from({ length: MAP_LAYER_COUNT }, () => createEmptyMapCells(width, height));
}

export function createEmptyMapSpecialGrid(
  width = MAP_DEFAULT_GRID_SIZE,
  height = MAP_DEFAULT_GRID_SIZE
): MapSpecialGrid {
  const normalizedWidth = normalizeMapDimension(width);
  const normalizedHeight = normalizeMapDimension(height);

  return Array.from({ length: normalizedHeight }, () =>
    Array.from({ length: normalizedWidth }, () => 0)
  );
}

function normalizeMapSpecialCode(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

export function normalizeMapSpecialGrid(
  special: Array<Array<number | null | undefined>> | undefined,
  width?: number,
  height?: number
): MapSpecialGrid {
  const normalizedWidth = normalizeMapDimension(width);
  const normalizedHeight = normalizeMapDimension(height);
  const safeRows = Array.isArray(special) ? special.slice(0, normalizedHeight) : [];

  while (safeRows.length < normalizedHeight) {
    safeRows.push([]);
  }

  return safeRows.map((row) => {
    const safeRow = Array.isArray(row) ? row.slice(0, normalizedWidth) : [];

    while (safeRow.length < normalizedWidth) {
      safeRow.push(0);
    }

    return safeRow.map((value) => normalizeMapSpecialCode(value));
  });
}

export function resizeMapSpecialGridExpandingEdges(
  special: Array<Array<number | null | undefined>> | undefined,
  currentWidth: number,
  currentHeight: number,
  nextWidth: number,
  nextHeight: number
): MapSpecialGrid {
  const normalizedCurrentWidth = normalizeMapDimension(currentWidth);
  const normalizedCurrentHeight = normalizeMapDimension(currentHeight);
  const normalizedNextWidth = normalizeMapDimension(nextWidth);
  const normalizedNextHeight = normalizeMapDimension(nextHeight);

  if (normalizedNextWidth < normalizedCurrentWidth || normalizedNextHeight < normalizedCurrentHeight) {
    throw new Error("Reducing map size is not supported yet.");
  }

  const normalizedSpecial = normalizeMapSpecialGrid(
    special,
    normalizedCurrentWidth,
    normalizedCurrentHeight
  );

  const expandedRows = normalizedSpecial.map((row) => {
    const safeRow = row.slice(0, normalizedCurrentWidth);
    const fillCell = safeRow.at(-1) ?? 0;

    while (safeRow.length < normalizedNextWidth) {
      safeRow.push(fillCell);
    }

    return safeRow.map((cell) => normalizeMapSpecialCode(cell));
  });

  const expandedLastRow =
    expandedRows.at(-1)?.map((cell) => normalizeMapSpecialCode(cell)) ??
    Array.from({ length: normalizedNextWidth }, () => 0);

  while (expandedRows.length < normalizedNextHeight) {
    expandedRows.push(expandedLastRow.map((cell) => normalizeMapSpecialCode(cell)));
  }

  return expandedRows;
}

export function isMapSpecialImpassible(value: unknown) {
  return normalizeMapSpecialCode(value) === MAP_SPECIAL_IMPASSIBLE;
}

export function resizeMapLayersExpandingEdges(
  layers: Array<Array<Array<MapLayerCell | string | null>>> | undefined,
  currentWidth: number,
  currentHeight: number,
  nextWidth: number,
  nextHeight: number
): MapLayerStack {
  const normalizedCurrentWidth = normalizeMapDimension(currentWidth);
  const normalizedCurrentHeight = normalizeMapDimension(currentHeight);
  const normalizedNextWidth = normalizeMapDimension(nextWidth);
  const normalizedNextHeight = normalizeMapDimension(nextHeight);

  if (normalizedNextWidth < normalizedCurrentWidth || normalizedNextHeight < normalizedCurrentHeight) {
    throw new Error("Reducing map size is not supported yet.");
  }

  const normalizedLayers = normalizeMapLayers(
    layers,
    normalizedCurrentWidth,
    normalizedCurrentHeight
  );

  return normalizedLayers.map((layerCells) => {
    const expandedRows = layerCells.map((row) => {
      const safeRow = row.slice(0, normalizedCurrentWidth);
      const fillCell = safeRow.at(-1) ?? null;

      while (safeRow.length < normalizedNextWidth) {
        safeRow.push(cloneMapLayerCell(fillCell));
      }

      return safeRow.map((cell) => cloneMapLayerCell(cell));
    });

    const expandedLastRow =
      expandedRows.at(-1)?.map((cell) => cloneMapLayerCell(cell)) ??
      Array.from({ length: normalizedNextWidth }, () => null);

    while (expandedRows.length < normalizedNextHeight) {
      expandedRows.push(expandedLastRow.map((cell) => cloneMapLayerCell(cell)));
    }

    return expandedRows;
  });
}

export function getMapDimensions(cells: Array<Array<MapLayerCell | string | null>> | undefined) {
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
  cells: Array<Array<MapLayerCell | string | null>> | undefined,
  width?: number,
  height?: number
): MapLayerGrid {
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
      safeRow.push(null);
    }

    return safeRow.map((cell) => normalizeMapLayerCell(cell));
  });
}

export function getMapLayerDimensions(
  layers: Array<Array<Array<MapLayerCell | string | null>>> | undefined,
  fallbackCells?: string[][]
) {
  if (!Array.isArray(layers) || layers.length === 0) {
    return getMapDimensions(fallbackCells);
  }

  return layers.reduce(
    (currentDimensions, layerCells) => {
      const nextDimensions = getMapDimensions(layerCells);

      return {
        height: Math.max(currentDimensions.height, nextDimensions.height),
        width: Math.max(currentDimensions.width, nextDimensions.width)
      };
    },
    getMapDimensions(fallbackCells)
  );
}

export function normalizeMapLayers(
  layers: Array<Array<Array<MapLayerCell | string | null>>> | undefined,
  width?: number,
  height?: number,
  fallbackCells?: string[][]
): MapLayerStack {
  const inferredDimensions = getMapLayerDimensions(layers, fallbackCells);
  const normalizedWidth = normalizeMapDimension(width ?? inferredDimensions.width);
  const normalizedHeight = normalizeMapDimension(height ?? inferredDimensions.height);
  const safeLayers = Array.from({ length: MAP_LAYER_COUNT }, (_, layerIndex) =>
    Array.isArray(layers) ? layers[layerIndex] : undefined
  );

  return safeLayers.map((layerCells, layerIndex) =>
    normalizeMapCells(
      Array.isArray(layerCells) ? layerCells : layerIndex === 0 ? fallbackCells : undefined,
      normalizedWidth,
      normalizedHeight
    )
  );
}

export function flattenMapLayers(
  layers: Array<Array<Array<MapLayerCell | string | null>>> | undefined,
  width?: number,
  height?: number
) {
  const normalizedLayers = normalizeMapLayers(layers, width, height);
  const normalizedWidth = normalizedLayers[0]?.[0]?.length ?? normalizeMapDimension(width);
  const normalizedHeight = normalizedLayers[0]?.length ?? normalizeMapDimension(height);
  const flattenedCells = Array.from({ length: normalizedHeight }, () =>
    Array.from({ length: normalizedWidth }, () => "")
  );

  for (let tileY = 0; tileY < normalizedHeight; tileY += 1) {
    for (let tileX = 0; tileX < normalizedWidth; tileX += 1) {
      for (let layerIndex = MAP_LAYER_COUNT - 1; layerIndex >= 0; layerIndex -= 1) {
        const placement = normalizedLayers[layerIndex]?.[tileY]?.[tileX];

        if (isMapTilePlacement(placement)) {
          flattenedCells[tileY][tileX] = placement.tileSlug;
          break;
        }

        if (isMapSpritePlacement(placement)) {
          flattenedCells[tileY][tileX] = placement.spriteKey;
          break;
        }
      }
    }
  }

  return flattenedCells;
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
