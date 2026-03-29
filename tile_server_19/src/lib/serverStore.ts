import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PNG } from "pngjs";

import { MAP_DEFAULT_GRID_SIZE, SLOT_COUNT, TILE_SIZE } from "./constants";
import {
  createEmptyMapCells,
  getMapDimensions,
  normalizeMapCells,
  normalizeMapDimension
} from "./map";
import { normalizeSlotRecords } from "./slots";
import type {
  ClipboardSlotRecord,
  ExportArtifact,
  LoadedImagePayload,
  MapRecord,
  SlotRecord,
  TileRecord
} from "../types";

const APP_ROOT = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const WORKSPACE_ROOT = path.resolve(APP_ROOT, "..");
const DATA_DIR = path.join(APP_ROOT, "data");
const TEMP_DIR = path.join(DATA_DIR, "temp");
const MAPS_DIR = path.join(DATA_DIR, "maps");
const CLIPBOARD_DB_PATH = path.join(TEMP_DIR, "clipboard-slots.json");
const TILE_DB_PATH = path.join(DATA_DIR, "all_tiles.json");
const LEGACY_TILE_DB_PATH = path.join(WORKSPACE_ROOT, "tile_server", "all_tiles.json");
const EXPORTS_DIR = path.join(APP_ROOT, "exports");
const IMAGE_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const THUMBNAIL_TILE_SIZE = 16;

function slugifyName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return slug || "tile";
}

function getSafeProjectPath(projectPath: string) {
  const resolvedPath = path.normalize(path.join(WORKSPACE_ROOT, projectPath));

  if (!resolvedPath.startsWith(WORKSPACE_ROOT)) {
    throw new Error("Requested file is outside the workspace.");
  }

  return resolvedPath;
}

function getImageMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  if (extension === ".gif") {
    return "image/gif";
  }

  return "image/png";
}

function isTileRecord(candidate: unknown): candidate is TileRecord {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }

  const record = candidate as Partial<TileRecord>;

  return (
    typeof record.name === "string" &&
    typeof record.slug === "string" &&
    typeof record.source === "string" &&
    Array.isArray(record.slots)
  );
}

function normalizeTileRecord(record: TileRecord): TileRecord {
  return {
    name: record.name.trim(),
    slug: record.slug.trim(),
    source: record.source.trim(),
    slots: normalizeSlotRecords(record.slots),
    thumbnail: typeof record.thumbnail === "string" ? record.thumbnail.trim() : ""
  };
}

function normalizeMapRecord(record: MapRecord): MapRecord {
  const dimensions = getMapDimensions(record.cells);
  const width = normalizeMapDimension(record.width ?? dimensions.width);
  const height = normalizeMapDimension(record.height ?? dimensions.height);

  return {
    cells: normalizeMapCells(record.cells, width, height),
    height,
    name: record.name.trim(),
    slug: record.slug.trim(),
    updatedAt: record.updatedAt || new Date().toISOString(),
    width
  };
}

async function ensureTileDatabase() {
  await mkdir(DATA_DIR, { recursive: true });

  if (existsSync(TILE_DB_PATH)) {
    return;
  }

  if (existsSync(LEGACY_TILE_DB_PATH)) {
    const legacyContents = await readFile(LEGACY_TILE_DB_PATH, "utf8");
    await writeFile(TILE_DB_PATH, `${legacyContents.trim()}\n`, "utf8");
    return;
  }

  await writeFile(TILE_DB_PATH, "[]\n", "utf8");
}

async function ensureStarterMap() {
  await mkdir(MAPS_DIR, { recursive: true });
  const starterMapPath = path.join(MAPS_DIR, "starter-camp.json");

  if (existsSync(starterMapPath)) {
    return;
  }

  const starterMap: MapRecord = {
    cells: createEmptyMapCells(MAP_DEFAULT_GRID_SIZE, MAP_DEFAULT_GRID_SIZE),
    height: MAP_DEFAULT_GRID_SIZE,
    name: "Starter Camp",
    slug: "starter-camp",
    updatedAt: new Date().toISOString(),
    width: MAP_DEFAULT_GRID_SIZE
  };

  await writeFile(starterMapPath, `${JSON.stringify(starterMap, null, 2)}\n`, "utf8");
}

function normalizeClipboardSlot(slot: unknown): ClipboardSlotRecord | null {
  if (!slot || typeof slot !== "object") {
    return null;
  }

  const record = slot as Partial<ClipboardSlotRecord>;

  if (typeof record.image !== "string" || typeof record.createdAt !== "string") {
    return null;
  }

  const trimmedImage = record.image.trim();
  const trimmedCreatedAt = record.createdAt.trim();

  if (!trimmedImage || !trimmedCreatedAt) {
    return null;
  }

  return {
    createdAt: trimmedCreatedAt,
    image: trimmedImage
  };
}

export function normalizeClipboardSlots(
  clipboardSlots: Array<ClipboardSlotRecord | null> | undefined
) {
  const normalizedSlots = Array.isArray(clipboardSlots) ? clipboardSlots.slice(0, 10) : [];

  while (normalizedSlots.length < 10) {
    normalizedSlots.push(null);
  }

  return normalizedSlots.map((slot) => normalizeClipboardSlot(slot));
}

async function ensureClipboardStore() {
  await mkdir(TEMP_DIR, { recursive: true });

  if (existsSync(CLIPBOARD_DB_PATH)) {
    return;
  }

  await writeFile(CLIPBOARD_DB_PATH, `${JSON.stringify(normalizeClipboardSlots(undefined), null, 2)}\n`, "utf8");
}

export async function readClipboardSlots() {
  await ensureClipboardStore();
  const fileContents = await readFile(CLIPBOARD_DB_PATH, "utf8");
  const parsed = JSON.parse(fileContents);

  return normalizeClipboardSlots(Array.isArray(parsed) ? parsed : undefined);
}

export async function writeClipboardSlots(clipboardSlots: Array<ClipboardSlotRecord | null>) {
  await ensureClipboardStore();
  await writeFile(
    CLIPBOARD_DB_PATH,
    `${JSON.stringify(normalizeClipboardSlots(clipboardSlots), null, 2)}\n`,
    "utf8"
  );
}

export async function readTileRecords() {
  await ensureTileDatabase();
  const fileContents = await readFile(TILE_DB_PATH, "utf8");
  const parsed = JSON.parse(fileContents);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isTileRecord).map(normalizeTileRecord);
}

export async function writeTileRecords(tileRecords: TileRecord[]) {
  await ensureTileDatabase();
  await writeFile(TILE_DB_PATH, `${JSON.stringify(tileRecords, null, 2)}\n`, "utf8");
}

export async function readMapRecords() {
  await ensureStarterMap();
  const entries = await readdir(MAPS_DIR, { withFileTypes: true });
  const maps = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const filePath = path.join(MAPS_DIR, entry.name);
        const fileContents = await readFile(filePath, "utf8");
        return normalizeMapRecord(JSON.parse(fileContents) as MapRecord);
      })
  );

  return maps.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function writeMapRecord(mapRecord: MapRecord) {
  await ensureStarterMap();
  const normalized = normalizeMapRecord(mapRecord);
  const filePath = path.join(MAPS_DIR, `${normalized.slug}.json`);

  await writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

export function createUniqueSlug(records: Array<{ slug: string }>, name: string) {
  const baseSlug = slugifyName(name);
  let nextSlug = baseSlug;
  let suffix = 2;

  while (records.some((record) => record.slug === nextSlug)) {
    nextSlug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return nextSlug;
}

export async function loadProjectImageSource(projectPath: string): Promise<LoadedImagePayload> {
  const trimmedPath = projectPath.trim();

  if (!trimmedPath) {
    throw new Error("Provide an image path.");
  }

  const resolvedPath = getSafeProjectPath(trimmedPath);
  const extension = path.extname(resolvedPath).toLowerCase();

  if (!IMAGE_EXTENSIONS.has(extension)) {
    throw new Error("Only PNG, JPG, WEBP, and GIF images are supported.");
  }

  const fileBuffer = await readFile(resolvedPath);
  const mimeType = getImageMimeType(resolvedPath);

  return {
    dataUrl: `data:${mimeType};base64,${fileBuffer.toString("base64")}`,
    name: path.basename(trimmedPath),
    sourcePath: trimmedPath
  };
}

function extractPngBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/u);

  if (!match) {
    throw new Error("Export currently supports PNG slot data only.");
  }

  return Buffer.from(match[1], "base64");
}

function scaleTileIntoStrip(sourcePng: PNG, targetPng: PNG, tileIndex: number, targetTileSize: number) {
  const destinationX = tileIndex * targetTileSize;

  for (let targetY = 0; targetY < targetTileSize; targetY += 1) {
    const sourceY = Math.min(
      sourcePng.height - 1,
      Math.floor((targetY / targetTileSize) * sourcePng.height)
    );

    for (let targetX = 0; targetX < targetTileSize; targetX += 1) {
      const sourceX = Math.min(
        sourcePng.width - 1,
        Math.floor((targetX / targetTileSize) * sourcePng.width)
      );
      const sourceIndex = (sourcePng.width * sourceY + sourceX) << 2;
      const targetIndex = (targetPng.width * targetY + destinationX + targetX) << 2;

      targetPng.data[targetIndex] = sourcePng.data[sourceIndex] ?? 0;
      targetPng.data[targetIndex + 1] = sourcePng.data[sourceIndex + 1] ?? 0;
      targetPng.data[targetIndex + 2] = sourcePng.data[sourceIndex + 2] ?? 0;
      targetPng.data[targetIndex + 3] = sourcePng.data[sourceIndex + 3] ?? 255;
    }
  }
}

export function createTileThumbnail(slots: Array<SlotRecord | null>) {
  const png = new PNG({
    height: THUMBNAIL_TILE_SIZE,
    width: SLOT_COUNT * THUMBNAIL_TILE_SIZE
  });

  normalizeSlotRecords(slots).forEach((slotRecord, index) => {
    if (!slotRecord?.pixels) {
      return;
    }

    const tilePng = PNG.sync.read(extractPngBuffer(slotRecord.pixels));
    scaleTileIntoStrip(tilePng, png, index, THUMBNAIL_TILE_SIZE);
  });

  const buffer = PNG.sync.write(png);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

export async function exportTileStrip(
  tileSlug: string,
  tileName: string,
  slots: Array<SlotRecord | null>
): Promise<ExportArtifact> {
  await mkdir(EXPORTS_DIR, { recursive: true });

  const png = new PNG({
    height: TILE_SIZE,
    width: SLOT_COUNT * TILE_SIZE
  });

  normalizeSlotRecords(slots).forEach((slotRecord, index) => {
    if (!slotRecord?.pixels) {
      return;
    }

    const tilePng = PNG.sync.read(extractPngBuffer(slotRecord.pixels));
    PNG.bitblt(tilePng, png, 0, 0, TILE_SIZE, TILE_SIZE, index * TILE_SIZE, 0);
  });

  const fileName = `${slugifyName(tileSlug || tileName)}-${Date.now()}.png`;
  const absolutePath = path.join(EXPORTS_DIR, fileName);
  const buffer = PNG.sync.write(png);

  await writeFile(absolutePath, buffer);

  return {
    absolutePath,
    dataUrl: `data:image/png;base64,${buffer.toString("base64")}`,
    fileName
  };
}

export function createMapRecord(
  name: string,
  slug: string,
  width = MAP_DEFAULT_GRID_SIZE,
  height = MAP_DEFAULT_GRID_SIZE
): MapRecord {
  const normalizedWidth = normalizeMapDimension(width);
  const normalizedHeight = normalizeMapDimension(height);

  return {
    cells: createEmptyMapCells(normalizedWidth, normalizedHeight),
    height: normalizedHeight,
    name,
    slug,
    updatedAt: new Date().toISOString(),
    width: normalizedWidth
  };
}

export function normalizeTilePayload(
  name: string,
  slug: string,
  source: string,
  slots: Array<SlotRecord | null>,
  thumbnail = ""
): TileRecord {
  return {
    name: name.trim(),
    slug: slug.trim(),
    source: source.trim(),
    slots: normalizeSlotRecords(slots),
    thumbnail: thumbnail.trim()
  };
}

export function normalizeMapPayload(
  name: string,
  slug: string,
  cells: string[][],
  width?: number,
  height?: number
): MapRecord {
  const dimensions = getMapDimensions(cells);
  const normalizedWidth = normalizeMapDimension(width ?? dimensions.width);
  const normalizedHeight = normalizeMapDimension(height ?? dimensions.height);

  return {
    cells: normalizeMapCells(cells, normalizedWidth, normalizedHeight),
    height: normalizedHeight,
    name: name.trim(),
    slug: slug.trim(),
    updatedAt: new Date().toISOString(),
    width: normalizedWidth
  };
}
