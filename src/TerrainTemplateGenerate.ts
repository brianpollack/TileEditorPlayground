import { promises as fs } from "node:fs";
import path from "node:path";

import { Jimp, rgbaToInt } from "jimp";

import { MAPS_DIR, PROJECT_ROOT, REFERENCE_IMAGE_PATH } from "./config.js";
import
  {
    type OpenRouterCompletionResponse,
    sendOpenRouterImageGenerationRequest
  } from "./openrouter.js";

export const TILE_X = 128;
export const TILE_Y = 128;
export const NUM_TILES = 8;
export const REFERENCE_IMAGE_WIDTH = TILE_X * NUM_TILES;
export const REFERENCE_IMAGE_HEIGHT = TILE_Y * NUM_TILES;

export type TileType = "Grass" | "Dirt" | "Cobblestone" | "Water"

export interface TileCoordinate {
  x: number;
  y: number;
}

export type TileKey = `${number},${number}`;
export type TileMap = Map<TileKey, TileType>;
export interface TileGrid {
  height: number;
  tileMap: TileMap;
  width: number;
}

const TILE_TEXTURE_PATHS: Record<TileType, string> = {
  Cobblestone: path.join(PROJECT_ROOT, "raw/cobblestone.jpg"),
  Dirt: path.join(PROJECT_ROOT, "raw/dirt/GroundDirtForest017_COL_2K.jpg"),
  Grass: path.join(PROJECT_ROOT, "raw/grass/GroundGrassGreen003_COL_1K.jpg"),
  Water: path.join(PROJECT_ROOT, "raw/water.jpg")
};
const TILE_BORDER_COLOR = rgbaToInt(72, 46, 24, 255);

interface PixelWritableImage {
  setPixelColor(color: number, x: number, y: number): void;
}

function toTileKey(coordinate: TileCoordinate): TileKey {
  return `${coordinate.x},${coordinate.y}`;
}

function normalizeTileCharacter(character: string): TileType | null {
  if (character === "G") {
    return "Grass";
  }

  if (character === "D") {
    return "Dirt";
  }

  if (character === "C") {
    return "Cobblestone";
  }

  if (character === "W") {
    return "Water";
  }

  return null;
}

function tileTypeToCharacter(tileType: TileType): "G" | "D" | "C" | "W" {
  if (tileType === "Grass") {
    return "G";
  }

  if (tileType === "Dirt") {
    return "D";
  }

if (tileType === "Water") {
    return "W";
  }


  return "C";
}

function getPatternedTileType(columnIndex: number): TileType {
  if (columnIndex < 2) {
    return "Grass";
  }

  if (columnIndex < 4) {
    return "Dirt";
  }

  if (columnIndex < 6) {
    return "Grass";
  }

  return "Dirt";
}

export function createTerrainTemplateTileMap(): TileMap {
  const tileMap: TileMap = new Map<TileKey, TileType>();

  for (let y = 0; y < NUM_TILES; y += 1) {
    for (let x = 0; x < NUM_TILES; x += 1) {
      tileMap.set(toTileKey({ x, y }), getPatternedTileType(x));
    }
  }

  return tileMap;
}

export function createTerrainTemplateGrid(): TileGrid {
  return {
    height: NUM_TILES,
    tileMap: createTerrainTemplateTileMap(),
    width: NUM_TILES
  };
}

export function parseTileGridFromText(mapText: string): TileGrid {
  const rows = mapText
    .split(/\r?\n/u)
    .map((line) => {
      const tiles = Array.from(line.toUpperCase())
        .map(normalizeTileCharacter)
        .filter((tileType): tileType is TileType => tileType !== null);

      return tiles;
    })
    .filter((row) => row.length > 0);

  if (rows.length === 0) {
    throw new Error("Map file did not contain any valid tile rows.");
  }

  const width = rows[0]?.length ?? 0;

  if (width === 0) {
    throw new Error("Map file did not contain any valid tiles.");
  }

  for (const [index, row] of rows.entries()) {
    if (row.length !== width) {
      throw new Error(
        `Map file row ${index + 1} has ${row.length} valid tiles, expected ${width}.`
      );
    }
  }

  const tileMap: TileMap = new Map<TileKey, TileType>();

  rows.forEach((row, y) => {
    row.forEach((tileType, x) => {
      tileMap.set(toTileKey({ x, y }), tileType);
    });
  });

  return {
    height: rows.length,
    tileMap,
    width
  };
}

export async function parseTileGridFromMapFile(mapFilePath: string): Promise<TileGrid> {
  const resolvedMapFilePath = path.isAbsolute(mapFilePath)
    ? mapFilePath
    : mapFilePath.startsWith("maps/")
      ? path.join(PROJECT_ROOT, mapFilePath)
      : path.join(MAPS_DIR, mapFilePath);
  const mapText = await fs.readFile(resolvedMapFilePath, "utf8");

  return parseTileGridFromText(mapText);
}

export function serializeTerrainMap(tileGrid: TileGrid): string {
  const rows: string[] = [];

  for (let y = 0; y < tileGrid.height; y += 1) {
    const rowEntries: string[] = [];

    for (let x = 0; x < tileGrid.width; x += 1) {
      const tileType = tileGrid.tileMap.get(toTileKey({ x, y }));

      if (!tileType) {
        throw new Error(`Missing tile definition at (${x}, ${y})`);
      }

      rowEntries.push(`'${tileTypeToCharacter(tileType)}'`);
    }

    rows.push(`  [${rowEntries.join(", ")}]`);
  }

  return `[\n${rows.join(",\n")}\n]`;
}

export function serializeTileGridAsText(tileGrid: TileGrid): string {
  const rows: string[] = [];

  for (let y = 0; y < tileGrid.height; y += 1) {
    let row = "";

    for (let x = 0; x < tileGrid.width; x += 1) {
      const tileType = tileGrid.tileMap.get(toTileKey({ x, y }));

      if (!tileType) {
        throw new Error(`Missing tile definition at (${x}, ${y})`);
      }

      row += tileTypeToCharacter(tileType);
    }

    rows.push(row);
  }

  return `${rows.join("\n")}\n`;
}

export function appendTerrainMapToPrompt(
  prompt: string,
  tileGrid: TileGrid
): string {
  const terrainMap = serializeTerrainMap(tileGrid);

  return [
    prompt.trim(),
    "",
    "The following represents the terrain map. Use this as a reference for your output tile locations.",
    `TerrainMap = ${terrainMap}`
  ].join("\n");
}

async function loadTileTextures(): Promise<Record<TileType, Buffer>> {
  const cobblestoneTexture = await Jimp.read(TILE_TEXTURE_PATHS.Cobblestone);
  const grassTexture = await Jimp.read(TILE_TEXTURE_PATHS.Grass);
  const dirtTexture = await Jimp.read(TILE_TEXTURE_PATHS.Dirt);
  const waterTexture = await Jimp.read(TILE_TEXTURE_PATHS.Water);

  cobblestoneTexture.resize({ h: TILE_Y, w: TILE_X });
  grassTexture.resize({ h: TILE_Y, w: TILE_X });
  dirtTexture.resize({ h: TILE_Y, w: TILE_X });
  waterTexture.resize({ h: TILE_Y, w: TILE_X });

  return {
    Cobblestone: await cobblestoneTexture.getBuffer("image/png"),
    Dirt: await dirtTexture.getBuffer("image/png"),
    Grass: await grassTexture.getBuffer("image/png"),
    Water: await waterTexture.getBuffer("image/png")
  };
}

function drawTileBorder(image: PixelWritableImage, tileX: number, tileY: number): void {
  const startX = tileX * TILE_X;
  const startY = tileY * TILE_Y;
  const endX = startX + TILE_X - 1;
  const endY = startY + TILE_Y - 1;

  for (let x = startX; x <= endX; x += 1) {
    image.setPixelColor(TILE_BORDER_COLOR, x, startY);
    image.setPixelColor(TILE_BORDER_COLOR, x, endY);
  }

  for (let y = startY; y <= endY; y += 1) {
    image.setPixelColor(TILE_BORDER_COLOR, startX, y);
    image.setPixelColor(TILE_BORDER_COLOR, endX, y);
  }
}

export async function renderTileGrid(
  tileGrid: TileGrid,
  options?: {
    drawTileLines?: boolean;
  }
): Promise<Buffer> {
  const imageWidth = tileGrid.width * TILE_X;
  const imageHeight = tileGrid.height * TILE_Y;
  const tileTextures = await loadTileTextures();
  const image = new Jimp({ color: 0x000000ff, height: imageHeight, width: imageWidth });

  for (let y = 0; y < tileGrid.height; y += 1) {
    for (let x = 0; x < tileGrid.width; x += 1) {
      const tileType = tileGrid.tileMap.get(toTileKey({ x, y }));

      if (!tileType) {
        throw new Error(`Missing tile definition at (${x}, ${y})`);
      }

      const tileImage = await Jimp.read(tileTextures[tileType]);
      image.composite(tileImage, x * TILE_X, y * TILE_Y);

      if (options?.drawTileLines) {
        drawTileBorder(image, x, y);
      }
    }
  }

  return await image.getBuffer("image/png");
}

async function ensureDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function writeTileGridImage(
  tileGrid: TileGrid,
  outputPath: string,
  options?: {
    drawTileLines?: boolean;
  }
): Promise<void> {
  const png = await renderTileGrid(tileGrid, options);
  await ensureDirectory(outputPath);
  await fs.writeFile(outputPath, png);
}

export async function encodeImageAsDataUrl(imagePath: string): Promise<string> {
  const imageBuffer = await fs.readFile(imagePath);
  return `data:image/png;base64,${imageBuffer.toString("base64")}`;
}

export async function generateImageFromReference(input: {
  apiKey: string;
  drawTileLines?: boolean;
  model: string;
  modalities?: string[];
  prompt: string;
  referenceImagePath?: string;
  tileGrid?: TileGrid;
}): Promise<OpenRouterCompletionResponse> {
  const tileGrid = input.tileGrid ?? createTerrainTemplateGrid();
  const referenceImagePath = input.referenceImagePath ?? REFERENCE_IMAGE_PATH;
  // Keep this nearby for future experiments with explicit map-conditioned prompting.
  // const promptWithTerrainMap = appendTerrainMapToPrompt(input.prompt, tileGrid);

  await writeTileGridImage(
    tileGrid,
    referenceImagePath,
    input.drawTileLines === undefined ? undefined : { drawTileLines: input.drawTileLines }
  );

  return await sendOpenRouterImageGenerationRequest({
    apiKey: input.apiKey,
    imageConfig: {
      aspect_ratio: "1:1",
      image_size: "1K"
    },
    messages: [
      {
        content: [
          {
            text: input.prompt,
            type: "text"
          },
          {
            image_url: {
              url: await encodeImageAsDataUrl(referenceImagePath)
            },
            type: "image_url"
          }
        ],
        role: "user"
      }
    ],
    model: input.model,
    modalities: input.modalities ?? ["image", "text"]
  });
}
