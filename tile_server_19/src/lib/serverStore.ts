import { randomUUID } from "node:crypto";
import { existsSync, type Dirent } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PNG } from "pngjs";

import { MAP_DEFAULT_GRID_SIZE, SLOT_COUNT, TILE_SIZE } from "./constants";
import { ensureDatabaseSchema, getDatabase, getDatabaseConnectionErrorMessage } from "./database";
import {
  createEmptyMapCells,
  createEmptyMapLayers,
  createMapSpritePlacement,
  createMapTilePlacement,
  flattenMapLayers,
  getMapLayerDimensions,
  isMapSpritePlacement,
  isMapTilePlacement,
  normalizeMapLayers,
  normalizeMapDimension,
  normalizeMapTileOptions,
  serializeMapTileOptionsKey
} from "./map";
import { normalizeUnderscoreName } from "./naming";
import { normalizeSlotRecords } from "./slots";
import {
  getTileLibraryAncestorPaths,
  getTileLibrarySpriteKey,
  normalizeTileLibraryPath,
  normalizeTileRecordPath,
  TILE_LIBRARY_LAYERS,
  tileLibraryPathSupportsSprites
} from "./tileLibrary";
import type {
  ClipboardSlotRecord,
  ExportArtifact,
  LoadedImagePayload,
  MapLayerCell,
  MapLayerStack,
  MapRecord,
  MapTileOptions,
  SpriteRecord,
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
const SPRITE_IMAGE_EXTENSION = ".png";
const THUMBNAIL_TILE_SIZE = 16;
const MAP_SCHEMA_REF = "./starter-camp.jsonschema";

type StoredMapCell = number | string | null;
type StoredMapTileReference =
  | string
  | {
      options?: Partial<MapTileOptions>;
      sprite?: string;
      tile?: string;
    };

interface StoredMapRecord {
  $schema?: string;
  cells?: string[][];
  height?: number;
  layers?: StoredMapCell[][][];
  name?: string;
  slug?: string;
  tileMap?: Record<string, StoredMapTileReference>;
  updatedAt?: string;
  width?: number;
}

type StoredSpriteRecord = Omit<SpriteRecord, "path" | "thumbnail">;

type AssetType = "folder" | "sprite" | "tile";

interface StoredAssetRow {
  asset_key: string;
  asset_name: string;
  asset_slug: string | null;
  asset_type: AssetType;
  created_at: Date | string;
  deleted: boolean;
  file_name: string | null;
  id: string;
  image_data: Buffer | null;
  source_path: string | null;
  sprite_metadata: unknown;
  sub_folder: string;
  tile_slots: unknown;
  updated_at: Date | string;
}

interface StoredMapRow {
  created_at: Date | string;
  deleted: boolean;
  height: number;
  id: string;
  name: string;
  slug: string;
  updated_at: Date | string;
  width: number;
}

interface StoredMapPlacementRow {
  asset_type: "sprite" | "tile";
  color_enabled: boolean;
  color_value: string;
  flip_horizontal: boolean;
  flip_vertical: boolean;
  layer_index: number;
  map_id: string;
  multiply_enabled: boolean;
  rotate_quarter_turns: number;
  slot_num: number;
  sprite_asset_id: string | null;
  sprite_file_name: string | null;
  sprite_sub_folder: string | null;
  tile_asset_id: string | null;
  tile_slug: string | null;
  tile_x: number;
  tile_y: number;
}

interface StoredMapPlacementInsertRow {
  asset_type: "sprite" | "tile";
  color_enabled: boolean;
  color_value: string;
  created_at: string;
  flip_horizontal: boolean;
  flip_vertical: boolean;
  id: string;
  layer_index: number;
  map_id: string;
  multiply_enabled: boolean;
  rotate_quarter_turns: number;
  slot_num: number;
  sprite_asset_id: string | null;
  tile_asset_id: string | null;
  tile_x: number;
  tile_y: number;
  updated_at: string;
}

export interface AssetDatabaseStatus {
  available: boolean;
  message: string;
}

let assetDatabaseReadyPromise: Promise<void> | null = null;
let mapDatabaseReadyPromise: Promise<void> | null = null;

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

function getAssetDatabaseErrorMessage(error: unknown) {
  return `Database unavailable, can't continue. ${getDatabaseConnectionErrorMessage(error)}`;
}

function serializeStoredTimestamp(value: Date | string | undefined) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

function getFolderAssetKey(folderPath: string) {
  return `folder:${normalizeTileRecordPath(folderPath)}`;
}

function getTileAssetKey(slug: string) {
  return `tile:${slug.trim()}`;
}

function getSpriteAssetKey(spritePath: string, fileName: string) {
  return `sprite:${getTileLibrarySpriteKey(spritePath, fileName)}`;
}

function bufferToPngDataUrl(buffer: Buffer | null) {
  if (!buffer?.length) {
    return "";
  }

  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function getTileThumbnailBuffer(tileRecord: TileRecord) {
  const thumbnailDataUrl = tileRecord.thumbnail.trim() || createTileThumbnail(tileRecord.slots);
  return extractPngBuffer(thumbnailDataUrl);
}

function prefixDeletedAssetName(name: string) {
  return name.startsWith("_") ? name : `_${name}`;
}

async function readLegacyTileFile() {
  if (existsSync(TILE_DB_PATH)) {
    const fileContents = await readFile(TILE_DB_PATH, "utf8");
    const parsed = JSON.parse(fileContents);

    if (Array.isArray(parsed)) {
      return parsed.filter(isTileRecord).map(normalizeTileRecord);
    }
  }

  if (existsSync(LEGACY_TILE_DB_PATH)) {
    const fileContents = await readFile(LEGACY_TILE_DB_PATH, "utf8");
    const parsed = JSON.parse(fileContents);

    if (Array.isArray(parsed)) {
      return parsed.filter(isTileRecord).map(normalizeTileRecord);
    }
  }

  return [];
}

async function collectLegacyFolderPaths(relativePath: string, collectedPaths: Set<string>) {
  const absolutePath = getSafeProjectPath(relativePath);

  if (!existsSync(absolutePath)) {
    return;
  }

  const entries = await readdir(absolutePath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const childPath = normalizeTileRecordPath(path.posix.join(relativePath, entry.name));
    collectedPaths.add(childPath);
    await collectLegacyFolderPaths(childPath, collectedPaths);
  }
}

async function collectLegacySpriteAssets(
  relativePath: string,
  collectedSprites: Map<string, { buffer: Buffer; record: SpriteRecord }>
) {
  const absolutePath = getSafeProjectPath(relativePath);

  if (!existsSync(absolutePath)) {
    return;
  }

  const entries = await readdir(absolutePath, { withFileTypes: true });

  if (tileLibraryPathSupportsSprites(relativePath)) {
    for (const entry of entries) {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== SPRITE_IMAGE_EXTENSION) {
        continue;
      }

      const spritePath = path.posix.join(relativePath, entry.name);
      const spriteBuffer = await readFile(getSafeProjectPath(spritePath));
      const spriteJsonPath = getSafeProjectPath(getSpriteJsonPath(relativePath, entry.name));
      let spriteRecord: SpriteRecord | null = null;

      if (existsSync(spriteJsonPath)) {
        try {
          spriteRecord = parseSpriteRecord(
            relativePath,
            `${path.parse(entry.name).name}.json`,
            JSON.parse(await readFile(spriteJsonPath, "utf8"))
          );
        } catch {
          spriteRecord = null;
        }
      }

      if (!spriteRecord) {
        const { height, width } = getSpriteSizeFromBuffer(spriteBuffer);
        spriteRecord = createInitialSpriteRecord(relativePath, entry.name, width, height);
      }

      collectedSprites.set(getSpriteRecordKey(spriteRecord), {
        buffer: spriteBuffer,
        record: spriteRecord
      });
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    await collectLegacySpriteAssets(
      normalizeTileRecordPath(path.posix.join(relativePath, entry.name)),
      collectedSprites
    );
  }
}

async function ensureFolderAncestors(folderPath: string) {
  const normalizedPath = normalizeTileRecordPath(folderPath);

  if (!normalizedPath) {
    return;
  }

  const db = await getDatabase();
  const segments = normalizedPath.split("/");
  let nextPath = "";

  for (const segment of segments) {
    nextPath = nextPath ? `${nextPath}/${segment}` : segment;
    await upsertFolderAsset(db, nextPath);
  }
}

async function upsertFolderAsset(
  db: Awaited<ReturnType<typeof getDatabase>>,
  folderPath: string
) {
  const normalizedPath = normalizeTileRecordPath(folderPath);

  if (!normalizedPath) {
    return "";
  }

  const now = new Date().toISOString();
  await db("map_tiles")
    .insert({
      asset_key: getFolderAssetKey(normalizedPath),
      asset_name: path.posix.basename(normalizedPath),
      asset_slug: null,
      asset_type: "folder",
      created_at: now,
      deleted: false,
      file_name: null,
      id: randomUUID(),
      image_data: null,
      source_path: null,
      sprite_metadata: null,
      sub_folder: normalizedPath,
      tile_slots: null,
      updated_at: now
    } satisfies Partial<StoredAssetRow>)
    .onConflict("asset_key")
    .merge({
      asset_name: path.posix.basename(normalizedPath),
      deleted: false,
      sub_folder: normalizedPath,
      updated_at: now
    });

  return normalizedPath;
}

async function upsertTileAsset(
  db: Awaited<ReturnType<typeof getDatabase>>,
  tileRecord: TileRecord
) {
  const normalizedTile = normalizeTileRecord(tileRecord);
  const now = new Date().toISOString();
  const serializedSlots = JSON.stringify(normalizedTile.slots);

  await ensureFolderAncestors(normalizedTile.path);

  await db("map_tiles")
    .insert({
      asset_key: getTileAssetKey(normalizedTile.slug),
      asset_name: normalizedTile.name,
      asset_slug: normalizedTile.slug,
      asset_type: "tile",
      created_at: now,
      deleted: false,
      file_name: null,
      id: randomUUID(),
      image_data: getTileThumbnailBuffer(normalizedTile),
      source_path: normalizedTile.source,
      sprite_metadata: null,
      sub_folder: normalizedTile.path,
      tile_slots: serializedSlots,
      updated_at: now
    } satisfies Partial<StoredAssetRow>)
    .onConflict("asset_key")
    .merge({
      asset_name: normalizedTile.name,
      asset_slug: normalizedTile.slug,
      deleted: false,
      image_data: getTileThumbnailBuffer(normalizedTile),
      source_path: normalizedTile.source,
      sub_folder: normalizedTile.path,
      tile_slots: serializedSlots,
      updated_at: now
    });
}

async function upsertSpriteAsset(
  db: Awaited<ReturnType<typeof getDatabase>>,
  spriteRecord: SpriteRecord,
  imageBuffer: Buffer
) {
  const normalizedSprite = normalizeSpriteRecord(spriteRecord);
  const now = new Date().toISOString();
  const serializedSpriteMetadata = JSON.stringify(serializeStoredSpriteRecord(normalizedSprite));

  await ensureFolderAncestors(normalizedSprite.path);

  await db("map_tiles")
    .insert({
      asset_key: getSpriteAssetKey(normalizedSprite.path, normalizedSprite.filename),
      asset_name: normalizedSprite.name,
      asset_slug: null,
      asset_type: "sprite",
      created_at: now,
      deleted: false,
      file_name: normalizedSprite.filename,
      id: randomUUID(),
      image_data: imageBuffer,
      source_path: null,
      sprite_metadata: serializedSpriteMetadata,
      sub_folder: normalizedSprite.path,
      tile_slots: null,
      updated_at: now
    } satisfies Partial<StoredAssetRow>)
    .onConflict("asset_key")
    .merge({
      asset_name: normalizedSprite.name,
      deleted: false,
      file_name: normalizedSprite.filename,
      image_data: imageBuffer,
      sprite_metadata: serializedSpriteMetadata,
      sub_folder: normalizedSprite.path,
      updated_at: now
    });
}

function mapRowToTileRecord(row: StoredAssetRow): TileRecord {
  const slots = normalizeSlotRecords(Array.isArray(row.tile_slots) ? (row.tile_slots as Array<SlotRecord | null>) : undefined);

  return normalizeTilePayload(
    row.asset_name,
    row.sub_folder,
    row.asset_slug ?? "",
    row.source_path ?? "",
    slots,
    bufferToPngDataUrl(row.image_data) || createTileThumbnail(slots)
  );
}

function mapRowToSpriteRecord(row: StoredAssetRow) {
  if (!row.file_name) {
    return null;
  }

  const spriteRecord = parseSpriteRecord(row.sub_folder, `${path.parse(row.file_name).name}.json`, row.sprite_metadata);

  if (!spriteRecord) {
    return null;
  }

  return {
    ...spriteRecord,
    thumbnail: bufferToPngDataUrl(row.image_data)
  };
}

async function importLegacyAssetLibrary() {
  const db = await getDatabase();
  const legacyFolderPaths = new Set<string>(TILE_LIBRARY_LAYERS.map((layer) => layer.folder));

  for (const layer of TILE_LIBRARY_LAYERS) {
    await collectLegacyFolderPaths(layer.folder, legacyFolderPaths);
  }

  for (const folderPath of Array.from(legacyFolderPaths).sort((left, right) => left.localeCompare(right))) {
    await upsertFolderAsset(db, folderPath);
  }

  const legacyTiles = await readLegacyTileFile();

  for (const tileRecord of legacyTiles) {
    await upsertTileAsset(db, tileRecord);
  }

  const legacySprites = new Map<string, { buffer: Buffer; record: SpriteRecord }>();

  for (const layer of TILE_LIBRARY_LAYERS) {
    await collectLegacySpriteAssets(layer.folder, legacySprites);
  }

  for (const spriteAsset of legacySprites.values()) {
    await upsertSpriteAsset(db, spriteAsset.record, spriteAsset.buffer);
  }
}

async function initializeAssetDatabase() {
  const db = await getDatabase();
  await ensureDatabaseSchema(db);

  for (const layer of TILE_LIBRARY_LAYERS) {
    await upsertFolderAsset(db, layer.folder);
  }

  const existingAssets = await db("map_tiles")
    .whereIn("asset_type", ["tile", "sprite"])
    .andWhere({ deleted: false })
    .count<{ count: string }[]>({ count: "*" });
  const assetCount = Number(existingAssets[0]?.count ?? 0);

  if (assetCount === 0) {
    await importLegacyAssetLibrary();
  }
}

async function ensureAssetDatabaseReady() {
  if (!assetDatabaseReadyPromise) {
    assetDatabaseReadyPromise = initializeAssetDatabase().catch((error) => {
      assetDatabaseReadyPromise = null;
      throw error;
    });
  }

  return assetDatabaseReadyPromise;
}

export async function getAssetDatabaseStatus(): Promise<AssetDatabaseStatus> {
  try {
    await ensureAssetDatabaseReady();
    return {
      available: true,
      message: ""
    };
  } catch (error) {
    return {
      available: false,
      message: getAssetDatabaseErrorMessage(error)
    };
  }
}

async function readTileLibraryFoldersRecursively(
  relativePath: string,
  collectedPaths: Set<string>,
  collectedSprites?: Map<string, SpriteRecord>
) {
  const absolutePath = getSafeProjectPath(relativePath);
  const entries = await readdir(absolutePath, { withFileTypes: true });

  await ensureSpriteMetadataForDirectory(relativePath, entries);

  if (collectedSprites) {
    const refreshedEntries = await readdir(absolutePath, { withFileTypes: true });
    await collectSpriteRecordsForDirectory(relativePath, refreshedEntries, collectedSprites);
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const childPath = normalizeTileRecordPath(path.posix.join(relativePath, entry.name));
    collectedPaths.add(childPath);
    await readTileLibraryFoldersRecursively(childPath, collectedPaths, collectedSprites);
  }
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

function getSpriteRecordKey(spriteRecord: Pick<SpriteRecord, "filename" | "path">) {
  return `${normalizeTileRecordPath(spriteRecord.path)}/${spriteRecord.filename}`;
}

function sanitizeSpriteFilename(fileName: string) {
  const parsed = path.parse(fileName.trim());
  const extension = parsed.ext.toLowerCase();
  const normalizedStem = normalizeUnderscoreName(parsed.name);

  if (!normalizedStem) {
    throw new Error("Sprite filename is required.");
  }

  if (extension !== SPRITE_IMAGE_EXTENSION) {
    throw new Error("Sprite imports currently require a PNG file.");
  }

  return `${normalizedStem}${extension}`;
}

function createInitialSpriteRecord(relativePath: string, fileName: string, imageWidth: number, imageHeight: number) {
  return normalizeSpriteRecord({
    filename: fileName,
    image_h: imageHeight,
    image_w: imageWidth,
    impassible: false,
    is_flat: false,
    item_id: 0,
    mount_x: imageWidth / 2,
    mount_y: imageHeight / 2,
    name: path.parse(fileName).name,
    offset_x: 0,
    offset_y: 0,
    path: relativePath,
    thumbnail: "",
    tile_h: imageHeight / TILE_SIZE,
    tile_w: imageWidth / TILE_SIZE
  });
}

function normalizeFiniteNumber(value: unknown, fallbackValue: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallbackValue;
}

function normalizeSpriteRecord(record: SpriteRecord): SpriteRecord {
  const normalizedPath = normalizeTileRecordPath(record.path);
  const normalizedFilename = sanitizeSpriteFilename(record.filename);
  const imageWidth = Math.max(1, normalizeFiniteNumber(record.image_w, TILE_SIZE));
  const imageHeight = Math.max(1, normalizeFiniteNumber(record.image_h, TILE_SIZE));

  return {
    filename: normalizedFilename,
    image_h: imageHeight,
    image_w: imageWidth,
    impassible: Boolean(record.impassible),
    is_flat: Boolean(record.is_flat),
    item_id: Math.max(0, Math.round(normalizeFiniteNumber(record.item_id, 0))),
    mount_x: normalizeFiniteNumber(record.mount_x, imageWidth / 2),
    mount_y: normalizeFiniteNumber(record.mount_y, imageHeight / 2),
    name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : path.parse(normalizedFilename).name,
    offset_x: normalizeFiniteNumber(record.offset_x, 0),
    offset_y: normalizeFiniteNumber(record.offset_y, 0),
    path: normalizedPath,
    thumbnail: typeof record.thumbnail === "string" ? record.thumbnail.trim() : "",
    tile_h: normalizeFiniteNumber(record.tile_h, imageHeight / TILE_SIZE),
    tile_w: normalizeFiniteNumber(record.tile_w, imageWidth / TILE_SIZE)
  };
}

function parseSpriteRecord(relativePath: string, jsonFileName: string, candidate: unknown): SpriteRecord | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const record = candidate as Partial<StoredSpriteRecord>;
  const fallbackFilename = `${path.parse(jsonFileName).name}${SPRITE_IMAGE_EXTENSION}`;
  const filename =
    typeof record.filename === "string" && record.filename.trim() ? record.filename.trim() : fallbackFilename;

  try {
    return normalizeSpriteRecord({
      filename,
      image_h: normalizeFiniteNumber(record.image_h, TILE_SIZE),
      image_w: normalizeFiniteNumber(record.image_w, TILE_SIZE),
      impassible: Boolean(record.impassible),
      is_flat: Boolean(record.is_flat),
      item_id: normalizeFiniteNumber(record.item_id, 0),
      mount_x: normalizeFiniteNumber(record.mount_x, normalizeFiniteNumber(record.image_w, TILE_SIZE) / 2),
      mount_y: normalizeFiniteNumber(record.mount_y, normalizeFiniteNumber(record.image_h, TILE_SIZE) / 2),
      name: typeof record.name === "string" ? record.name : path.parse(filename).name,
      offset_x: normalizeFiniteNumber(record.offset_x, 0),
      offset_y: normalizeFiniteNumber(record.offset_y, 0),
      path: relativePath,
      thumbnail: "",
      tile_h: normalizeFiniteNumber(record.tile_h, normalizeFiniteNumber(record.image_h, TILE_SIZE) / TILE_SIZE),
      tile_w: normalizeFiniteNumber(record.tile_w, normalizeFiniteNumber(record.image_w, TILE_SIZE) / TILE_SIZE)
    });
  } catch {
    return null;
  }
}

function serializeStoredSpriteRecord(spriteRecord: SpriteRecord): StoredSpriteRecord {
  const normalized = normalizeSpriteRecord(spriteRecord);

  return {
    filename: normalized.filename,
    image_h: normalized.image_h,
    image_w: normalized.image_w,
    impassible: normalized.impassible,
    is_flat: normalized.is_flat,
    item_id: normalized.item_id,
    mount_x: normalized.mount_x,
    mount_y: normalized.mount_y,
    name: normalized.name,
    offset_x: normalized.offset_x,
    offset_y: normalized.offset_y,
    tile_h: normalized.tile_h,
    tile_w: normalized.tile_w
  };
}

function getSpriteJsonPath(relativePath: string, spriteFileName: string) {
  return path.posix.join(relativePath, `${path.parse(spriteFileName).name}.json`);
}

async function writeSpriteRecord(spriteRecord: SpriteRecord) {
  const normalized = normalizeSpriteRecord(spriteRecord);
  const jsonPath = getSafeProjectPath(getSpriteJsonPath(normalized.path, normalized.filename));
  const storedRecord = serializeStoredSpriteRecord(normalized);

  await writeFile(jsonPath, `${JSON.stringify(storedRecord, null, 2)}\n`, "utf8");
}

function getSpriteSizeFromBuffer(buffer: Buffer) {
  const png = PNG.sync.read(buffer);
  return { height: png.height, width: png.width };
}

function createSpriteThumbnailDataUrl(buffer: Buffer, fileName: string) {
  const mimeType = getImageMimeType(fileName);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function ensureSpriteMetadataForDirectory(relativePath: string, entries: Dirent[]) {
  if (!tileLibraryPathSupportsSprites(relativePath)) {
    return;
  }

  const jsonNames = new Set(
    entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => entry.name.toLowerCase())
  );

  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== SPRITE_IMAGE_EXTENSION) {
      continue;
    }

    const expectedJsonName = `${path.parse(entry.name).name}.json`.toLowerCase();

    if (jsonNames.has(expectedJsonName)) {
      continue;
    }

    const spritePath = path.posix.join(relativePath, entry.name);
    const spriteBuffer = await readFile(getSafeProjectPath(spritePath));
    const { height, width } = getSpriteSizeFromBuffer(spriteBuffer);
    await writeSpriteRecord(createInitialSpriteRecord(relativePath, entry.name, width, height));
  }
}

async function collectSpriteRecordsForDirectory(
  relativePath: string,
  entries: Dirent[],
  collectedSprites: Map<string, SpriteRecord>
) {
  if (!tileLibraryPathSupportsSprites(relativePath)) {
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".json") {
      continue;
    }

    try {
      const spriteJsonPath = getSafeProjectPath(path.posix.join(relativePath, entry.name));
      const parsed = JSON.parse(await readFile(spriteJsonPath, "utf8")) as unknown;
      const spriteRecord = parseSpriteRecord(relativePath, entry.name, parsed);

      if (!spriteRecord) {
        continue;
      }

      const spriteImagePath = getSafeProjectPath(path.posix.join(relativePath, spriteRecord.filename));

      if (!existsSync(spriteImagePath)) {
        continue;
      }

      const spriteBuffer = await readFile(spriteImagePath);
      collectedSprites.set(getSpriteRecordKey(spriteRecord), {
        ...spriteRecord,
        thumbnail: createSpriteThumbnailDataUrl(spriteBuffer, spriteRecord.filename)
      });
    } catch {
      continue;
    }
  }
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
    path: normalizeTileRecordPath(record.path),
    slug: record.slug.trim(),
    source: record.source.trim(),
    slots: normalizeSlotRecords(record.slots),
    thumbnail: typeof record.thumbnail === "string" ? record.thumbnail.trim() : ""
  };
}

function normalizeMapRecord(record: MapRecord): MapRecord {
  const dimensions = getMapLayerDimensions(record.layers, record.cells);
  const width = normalizeMapDimension(record.width ?? dimensions.width);
  const height = normalizeMapDimension(record.height ?? dimensions.height);
  const layers = normalizeMapLayers(record.layers, width, height, record.cells);

  return {
    cells: flattenMapLayers(layers, width, height),
    height,
    layers,
    name: record.name.trim(),
    slug: record.slug.trim(),
    updatedAt: record.updatedAt || new Date().toISOString(),
    width
  };
}

function getSlugFromStoredTileReference(reference: string | undefined) {
  const normalizedReference = normalizeTileLibraryPath(reference ?? "");
  const segments = normalizedReference.split("/").filter(Boolean);
  return segments.at(-1) ?? (reference?.trim() ?? "");
}

function getSpriteKeyFromStoredReference(reference: string | undefined) {
  const trimmedReference = reference?.trim() ?? "";

  if (!trimmedReference) {
    return "";
  }

  const lastSlashIndex = trimmedReference.lastIndexOf("/");

  if (lastSlashIndex === -1) {
    return trimmedReference;
  }

  return getTileLibrarySpriteKey(
    trimmedReference.slice(0, lastSlashIndex),
    trimmedReference.slice(lastSlashIndex + 1)
  );
}

function normalizeStoredMapTileReferenceOptions(options: Partial<MapTileOptions> | undefined) {
  return normalizeMapTileOptions(options);
}

function getRotateQuarterTurnsFromOptions(options: Partial<MapTileOptions> | undefined) {
  const normalizedOptions = normalizeMapTileOptions(options);

  if (normalizedOptions.rotate270) {
    return 3;
  }

  if (normalizedOptions.rotate180) {
    return 2;
  }

  if (normalizedOptions.rotate90) {
    return 1;
  }

  return 0;
}

function createMapTileOptionsFromPlacementRow(row: Pick<
  StoredMapPlacementRow,
  | "color_enabled"
  | "color_value"
  | "flip_horizontal"
  | "flip_vertical"
  | "multiply_enabled"
  | "rotate_quarter_turns"
>) {
  const normalizedQuarterTurns = ((Math.round(row.rotate_quarter_turns) % 4) + 4) % 4;

  return normalizeMapTileOptions({
    color: row.color_enabled,
    colorValue: row.color_value,
    flipHorizontal: row.flip_horizontal,
    flipVertical: row.flip_vertical,
    multiply: row.multiply_enabled,
    rotate180: normalizedQuarterTurns === 2,
    rotate270: normalizedQuarterTurns === 3,
    rotate90: normalizedQuarterTurns === 1
  });
}

function createMapPlacementFromRow(row: StoredMapPlacementRow): MapLayerCell {
  if (row.asset_type === "sprite") {
    if (!row.sprite_sub_folder || !row.sprite_file_name) {
      return null;
    }

    return createMapSpritePlacement(getTileLibrarySpriteKey(row.sprite_sub_folder, row.sprite_file_name));
  }

  if (!row.tile_slug) {
    return null;
  }

  return createMapTilePlacement(
    row.tile_slug,
    createMapTileOptionsFromPlacementRow(row),
    row.slot_num
  );
}

function decodeStoredMapTileReference(reference: StoredMapTileReference | undefined): MapLayerCell {
  if (!reference) {
    return null;
  }

  if (typeof reference === "string") {
    if (reference.trim().toLowerCase().endsWith(SPRITE_IMAGE_EXTENSION)) {
      return createMapSpritePlacement(getSpriteKeyFromStoredReference(reference));
    }

    return createMapTilePlacement(getSlugFromStoredTileReference(reference));
  }

  if (typeof reference.sprite === "string" && reference.sprite.trim()) {
    return createMapSpritePlacement(getSpriteKeyFromStoredReference(reference.sprite));
  }

  return createMapTilePlacement(
    getSlugFromStoredTileReference(reference.tile),
    normalizeStoredMapTileReferenceOptions(reference.options)
  );
}

function buildStoredMapTileReference(placement: MapLayerCell, tilePathBySlug: Map<string, string>) {
  if (isMapSpritePlacement(placement)) {
    return {
      sprite: getSpriteKeyFromStoredReference(placement.spriteKey)
    } satisfies Exclude<StoredMapTileReference, string>;
  }

  const tilePath = tilePathBySlug.get(placement?.tileSlug ?? "") ?? placement?.tileSlug ?? "";

  return {
    options: normalizeStoredMapTileReferenceOptions(placement?.options),
    tile: tilePath
  };
}

function decodeStoredMapCell(cell: StoredMapCell, tileMap: Record<string, StoredMapTileReference>) {
  if (cell === null || cell === 0 || cell === "0" || cell === "") {
    return null;
  }

  if (typeof cell === "number") {
    return decodeStoredMapTileReference(tileMap[String(cell)]);
  }

  const trimmedCell = cell.trim();

  if (!trimmedCell) {
    return null;
  }

  if (trimmedCell in tileMap) {
    return decodeStoredMapTileReference(tileMap[trimmedCell]);
  }

  if (trimmedCell.toLowerCase().endsWith(SPRITE_IMAGE_EXTENSION)) {
    return createMapSpritePlacement(getSpriteKeyFromStoredReference(trimmedCell));
  }

  if (trimmedCell.includes("/")) {
    return createMapTilePlacement(getSlugFromStoredTileReference(trimmedCell));
  }

  return createMapTilePlacement(trimmedCell);
}

function decodeStoredMapLayers(
  layers: StoredMapRecord["layers"],
  tileMap: Record<string, StoredMapTileReference>
): MapLayerStack | undefined {
  if (!Array.isArray(layers)) {
    return undefined;
  }

  return layers.map((layerRows) =>
    Array.isArray(layerRows)
      ? layerRows.map((row) =>
          Array.isArray(row) ? row.map((cell) => decodeStoredMapCell(cell as StoredMapCell, tileMap)) : []
        )
      : []
  );
}

function parseStoredMapRecord(record: StoredMapRecord): MapRecord {
  const tileMap = record.tileMap && typeof record.tileMap === "object" ? record.tileMap : {};

  return normalizeMapRecord({
    cells: Array.isArray(record.cells) ? record.cells : undefined,
    height: record.height ?? MAP_DEFAULT_GRID_SIZE,
    layers: decodeStoredMapLayers(record.layers, tileMap),
    name: typeof record.name === "string" ? record.name : "",
    slug: typeof record.slug === "string" ? record.slug : "",
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
    width: record.width ?? MAP_DEFAULT_GRID_SIZE
  } as MapRecord);
}

function buildStoredMapRecord(
  mapRecord: MapRecord,
  tileRecords: TileRecord[],
  spriteRecords: SpriteRecord[]
): StoredMapRecord {
  const normalized = normalizeMapRecord(mapRecord);
  const tilePathBySlug = new Map(
    tileRecords.map((tileRecord) => [
      tileRecord.slug,
      normalizeTileLibraryPath(`${tileRecord.path}/${tileRecord.slug}`)
    ])
  );
  const spritePathByKey = new Map(
    spriteRecords.map((spriteRecord) => {
      const spriteKey = getTileLibrarySpriteKey(spriteRecord.path, spriteRecord.filename);
      return [spriteKey, spriteKey] as const;
    })
  );
  const tileIdByReference = new Map<string, number>();
  const tileMap: Record<string, StoredMapTileReference> = {};
  let nextTileId = 1;

  const storedLayers = normalized.layers.map((layerRows) =>
    layerRows.map((row) =>
      row.map((placement) => {
        if (!placement) {
          return 0;
        }

        const referenceKey = isMapTilePlacement(placement)
          ? `tile:${tilePathBySlug.get(placement.tileSlug) ?? placement.tileSlug}:${serializeMapTileOptionsKey(
              placement.options
            )}`
          : `sprite:${spritePathByKey.get(placement.spriteKey) ?? getSpriteKeyFromStoredReference(placement.spriteKey)}`;
        const existingTileId = tileIdByReference.get(referenceKey);

        if (existingTileId) {
          return existingTileId;
        }

        const tileId = nextTileId;
        nextTileId += 1;
        tileIdByReference.set(referenceKey, tileId);
        tileMap[String(tileId)] = buildStoredMapTileReference(placement, tilePathBySlug);
        return tileId;
      })
    )
  );

  return {
    $schema: MAP_SCHEMA_REF,
    height: normalized.height,
    layers: storedLayers,
    name: normalized.name,
    slug: normalized.slug,
    tileMap,
    updatedAt: normalized.updatedAt,
    width: normalized.width
  };
}

async function writeStoredMapFile(mapRecord: MapRecord) {
  const normalized = normalizeMapRecord(mapRecord);
  const [tileRecords, spriteRecords] = await Promise.all([readTileRecords(), readSpriteRecords()]);
  const storedRecord = buildStoredMapRecord(normalized, tileRecords, spriteRecords);
  const filePath = path.join(MAPS_DIR, `${normalized.slug}.json`);

  await writeFile(filePath, `${JSON.stringify(storedRecord, null, 2)}\n`, "utf8");
}

async function ensureTileDatabase() {
  await mkdir(DATA_DIR, { recursive: true });
  await Promise.all(
    TILE_LIBRARY_LAYERS.map((layer) =>
      mkdir(path.join(WORKSPACE_ROOT, layer.folder), { recursive: true })
    )
  );

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
    cells: flattenMapLayers(createEmptyMapLayers(MAP_DEFAULT_GRID_SIZE, MAP_DEFAULT_GRID_SIZE)),
    height: MAP_DEFAULT_GRID_SIZE,
    layers: createEmptyMapLayers(MAP_DEFAULT_GRID_SIZE, MAP_DEFAULT_GRID_SIZE),
    name: "Starter Camp",
    slug: "starter-camp",
    updatedAt: new Date().toISOString(),
    width: MAP_DEFAULT_GRID_SIZE
  };

  await writeStoredMapFile(starterMap);
}

async function readLegacyMapFiles() {
  await mkdir(MAPS_DIR, { recursive: true });
  const entries = await readdir(MAPS_DIR, { withFileTypes: true });
  const maps = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        try {
          const filePath = path.join(MAPS_DIR, entry.name);
          const fileContents = await readFile(filePath, "utf8");
          return parseStoredMapRecord(JSON.parse(fileContents) as StoredMapRecord);
        } catch {
          return null;
        }
      })
  );

  return maps.filter((mapRecord): mapRecord is MapRecord => mapRecord !== null);
}

async function upsertMapRecordToDatabase(mapRecord: MapRecord) {
  await ensureAssetDatabaseReady();
  const db = await getDatabase();
  const normalizedMap = normalizeMapRecord(mapRecord);
  const now = new Date().toISOString();
  const tileSlugs = new Set<string>();
  const spriteKeys = new Set<string>();

  normalizedMap.layers.forEach((layerRows) => {
    layerRows.forEach((row) => {
      row.forEach((placement) => {
        if (isMapTilePlacement(placement)) {
          tileSlugs.add(placement.tileSlug);
        } else if (isMapSpritePlacement(placement)) {
          spriteKeys.add(placement.spriteKey);
        }
      });
    });
  });

  const [tileAssetRows, spriteAssetRows] = await Promise.all([
    tileSlugs.size
      ? db<StoredAssetRow>("map_tiles")
          .select("id", "asset_slug")
          .where({ asset_type: "tile" })
          .whereIn("asset_slug", Array.from(tileSlugs))
      : Promise.resolve([] as Pick<StoredAssetRow, "asset_slug" | "id">[]),
    spriteKeys.size
      ? db<StoredAssetRow>("map_tiles")
          .select("id", "asset_key")
          .where({ asset_type: "sprite" })
          .whereIn(
            "asset_key",
            Array.from(spriteKeys).map((spriteKey) => `sprite:${spriteKey}`)
          )
      : Promise.resolve([] as Pick<StoredAssetRow, "asset_key" | "id">[])
  ]);
  const tileAssetIdBySlug = new Map(
    tileAssetRows
      .filter((row) => typeof row.asset_slug === "string" && row.asset_slug.trim())
      .map((row) => [row.asset_slug as string, row.id] as const)
  );
  const spriteAssetIdByKey = new Map(
    spriteAssetRows
      .filter((row) => typeof row.asset_key === "string" && row.asset_key.trim())
      .map((row) => [row.asset_key.replace(/^sprite:/u, ""), row.id] as const)
  );

  await db.transaction(async (transaction) => {
    const [storedMap] = await transaction<StoredMapRow>("map_maps")
      .insert({
        deleted: false,
        height: normalizedMap.height,
        id: randomUUID(),
        name: normalizedMap.name,
        slug: normalizedMap.slug,
        updated_at: normalizedMap.updatedAt || now,
        width: normalizedMap.width
      } satisfies Partial<StoredMapRow>)
      .onConflict("slug")
      .merge({
        deleted: false,
        height: normalizedMap.height,
        name: normalizedMap.name,
        updated_at: normalizedMap.updatedAt || now,
        width: normalizedMap.width
      })
      .returning(["id"]);
    const mapId = storedMap?.id;

    if (!mapId) {
      throw new Error(`Could not persist map ${normalizedMap.slug}.`);
    }

    await transaction("map_map_assets").where({ map_id: mapId }).delete();

    const placementRows: StoredMapPlacementInsertRow[] = [];

    normalizedMap.layers.forEach((layerRows, layerIndex) => {
      layerRows.forEach((row, tileY) => {
        row.forEach((placement, tileX) => {
          if (!placement) {
            return;
          }

          if (isMapTilePlacement(placement)) {
            const tileAssetId = tileAssetIdBySlug.get(placement.tileSlug);

            if (!tileAssetId) {
              throw new Error(`Map references unknown tile ${placement.tileSlug}.`);
            }

            placementRows.push({
              asset_type: "tile",
              color_enabled: placement.options.color,
              color_value: placement.options.colorValue,
              created_at: now,
              flip_horizontal: placement.options.flipHorizontal,
              flip_vertical: placement.options.flipVertical,
              id: randomUUID(),
              layer_index: layerIndex,
              map_id: mapId,
              multiply_enabled: placement.options.multiply,
              rotate_quarter_turns: getRotateQuarterTurnsFromOptions(placement.options),
              slot_num: placement.slotNum ?? 0,
              sprite_asset_id: null,
              tile_asset_id: tileAssetId,
              tile_x: tileX,
              tile_y: tileY,
              updated_at: now
            });
            return;
          }

          const spriteAssetId = spriteAssetIdByKey.get(placement.spriteKey);

          if (!spriteAssetId) {
            throw new Error(`Map references unknown sprite ${placement.spriteKey}.`);
          }

          placementRows.push({
            asset_type: "sprite",
            color_enabled: false,
            color_value: "#ffffff",
            created_at: now,
            flip_horizontal: false,
            flip_vertical: false,
            id: randomUUID(),
            layer_index: layerIndex,
            map_id: mapId,
            multiply_enabled: false,
            rotate_quarter_turns: 0,
            slot_num: 0,
            sprite_asset_id: spriteAssetId,
            tile_asset_id: null,
            tile_x: tileX,
            tile_y: tileY,
            updated_at: now
          });
        });
      });
    });

    if (placementRows.length > 0) {
      await transaction("map_map_assets").insert(placementRows);
    }
  });
}

async function importLegacyMapLibrary() {
  const legacyMaps = await readLegacyMapFiles();

  if (legacyMaps.length > 0) {
    for (const mapRecord of legacyMaps) {
      await upsertMapRecordToDatabase(mapRecord);
    }

    return;
  }

  await upsertMapRecordToDatabase({
    cells: flattenMapLayers(createEmptyMapLayers(MAP_DEFAULT_GRID_SIZE, MAP_DEFAULT_GRID_SIZE)),
    height: MAP_DEFAULT_GRID_SIZE,
    layers: createEmptyMapLayers(MAP_DEFAULT_GRID_SIZE, MAP_DEFAULT_GRID_SIZE),
    name: "Starter Camp",
    slug: "starter-camp",
    updatedAt: new Date().toISOString(),
    width: MAP_DEFAULT_GRID_SIZE
  });
}

async function initializeMapDatabase() {
  await ensureAssetDatabaseReady();
  const db = await getDatabase();
  await ensureDatabaseSchema(db);
  const existingMaps = await db("map_maps").count<{ count: string }[]>({ count: "*" });
  const mapCount = Number(existingMaps[0]?.count ?? 0);

  if (mapCount === 0) {
    await importLegacyMapLibrary();
  }
}

async function ensureMapDatabaseReady() {
  if (!mapDatabaseReadyPromise) {
    mapDatabaseReadyPromise = initializeMapDatabase().catch((error) => {
      mapDatabaseReadyPromise = null;
      throw error;
    });
  }

  return mapDatabaseReadyPromise;
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
  await ensureAssetDatabaseReady();
  const db = await getDatabase();
  const rows = await db<StoredAssetRow>("map_tiles")
    .select("*")
    .where({ asset_type: "tile", deleted: false })
    .orderBy([
      { column: "sub_folder", order: "asc" },
      { column: "asset_name", order: "asc" },
      { column: "asset_slug", order: "asc" }
    ]);

  return rows.map(mapRowToTileRecord);
}

export async function writeTileRecords(tileRecords: TileRecord[]) {
  await ensureAssetDatabaseReady();
  const db = await getDatabase();

  for (const tileRecord of tileRecords) {
    await upsertTileAsset(db, tileRecord);
  }
}

export async function readTileLibraryFolders() {
  await ensureAssetDatabaseReady();
  const db = await getDatabase();
  const rows = await db<StoredAssetRow>("map_tiles")
    .select("sub_folder")
    .where({ asset_type: "folder", deleted: false })
    .orderBy("sub_folder", "asc");

  return rows.map((row) => normalizeTileRecordPath(row.sub_folder)).filter(Boolean);
}

export async function readTileLibraryFolderAssetCounts() {
  await ensureAssetDatabaseReady();
  const db = await getDatabase();
  const result = await db.raw<{
    rows: Array<{
      asset_count: number | string;
      folder_path: string;
    }>;
  }>(`
    with expanded_assets as (
      select array_to_string(asset_segments[1:depth], '/') as folder_path
      from (
        select regexp_split_to_array(sub_folder, '/') as asset_segments
        from map_tiles
        where asset_type in ('tile', 'sprite') and deleted = false
      ) asset_rows
      cross join lateral generate_series(1, array_length(asset_segments, 1)) as depth
    ),
    grouped_assets as (
      select folder_path, count(*)::int as asset_count
      from expanded_assets
      group by folder_path
    )
    select folders.sub_folder as folder_path, coalesce(grouped_assets.asset_count, 0)::int as asset_count
    from map_tiles folders
    left join grouped_assets on grouped_assets.folder_path = folders.sub_folder
    where folders.asset_type = 'folder' and folders.deleted = false
    order by folders.sub_folder asc
  `);

  return Object.fromEntries(
    result.rows.map((row) => [normalizeTileRecordPath(row.folder_path), Number(row.asset_count)])
  ) satisfies Record<string, number>;
}

export async function readSpriteRecords() {
  await ensureAssetDatabaseReady();
  const db = await getDatabase();
  const rows = await db<StoredAssetRow>("map_tiles")
    .select("*")
    .where({ asset_type: "sprite", deleted: false })
    .orderBy([
      { column: "sub_folder", order: "asc" },
      { column: "asset_name", order: "asc" },
      { column: "file_name", order: "asc" }
    ]);

  return rows
    .map(mapRowToSpriteRecord)
    .filter((spriteRecord): spriteRecord is SpriteRecord => spriteRecord !== null);
}

export async function ensureTileLibraryFolder(relativePath: string) {
  const normalizedPath = normalizeTileRecordPath(relativePath);
  await ensureAssetDatabaseReady();
  const db = await getDatabase();
  await ensureFolderAncestors(normalizedPath);
  await upsertFolderAsset(db, normalizedPath);
  return normalizedPath;
}

export async function createTileRecord(name: string, tilePath: string) {
  const nextName = normalizeUnderscoreName(name);
  const nextPath = normalizeTileLibraryPath(tilePath);

  if (!nextName) {
    throw new Error("Tile name is required.");
  }

  if (!nextPath) {
    throw new Error("Choose a tile library folder before creating a tile.");
  }

  await ensureTileLibraryFolder(nextPath);
  const tileRecords = await readTileRecords();
  const nextTile = normalizeTilePayload(
    nextName,
    nextPath,
    createUniqueSlug(tileRecords, nextName),
    "",
    normalizeSlotRecords(undefined),
    ""
  );

  const db = await getDatabase();
  await upsertTileAsset(db, nextTile);

  return nextTile;
}

export async function importSpriteFile(file: File, spritePath: string) {
  const normalizedPath = normalizeTileLibraryPath(spritePath);

  if (!normalizedPath) {
    throw new Error("Choose a tile library folder before importing a sprite.");
  }

  if (!tileLibraryPathSupportsSprites(normalizedPath)) {
    throw new Error("Sprites can only be imported into layers above layer_0.");
  }

  await ensureTileLibraryFolder(normalizedPath);

  const spriteFilename = sanitizeSpriteFilename(file.name);
  const db = await getDatabase();
  const existingSprite = await db<StoredAssetRow>("map_tiles")
    .select("id")
    .first()
    .where({ asset_key: getSpriteAssetKey(normalizedPath, spriteFilename), deleted: false });

  if (existingSprite) {
    throw new Error(`A sprite named ${spriteFilename} already exists in this folder.`);
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const { height, width } = getSpriteSizeFromBuffer(fileBuffer);

  const spriteRecord = {
    ...createInitialSpriteRecord(normalizedPath, spriteFilename, width, height),
    thumbnail: createSpriteThumbnailDataUrl(fileBuffer, spriteFilename)
  };
  await upsertSpriteAsset(db, spriteRecord, fileBuffer);

  return spriteRecord;
}

export async function saveSpriteRecord(input: SpriteRecord, replacementFile?: File | null) {
  const normalizedSprite = normalizeSpriteRecord(input);
  const normalizedPath = normalizeTileLibraryPath(normalizedSprite.path);

  if (!normalizedPath) {
    throw new Error("Choose a tile library folder before saving a sprite.");
  }

  if (!tileLibraryPathSupportsSprites(normalizedPath)) {
    throw new Error("Sprites can only be saved into layers above layer_0.");
  }

  await ensureAssetDatabaseReady();
  const db = await getDatabase();
  const existingSprite = await db<StoredAssetRow>("map_tiles")
    .select("*")
    .first()
    .where({ asset_key: getSpriteAssetKey(normalizedPath, normalizedSprite.filename), deleted: false });
  let thumbnailBuffer: Buffer | null = null;
  let nextSprite = normalizedSprite;

  if (replacementFile) {
    if (path.extname(replacementFile.name).toLowerCase() !== SPRITE_IMAGE_EXTENSION) {
      throw new Error("Sprite replacement images currently require a PNG file.");
    }

    thumbnailBuffer = Buffer.from(await replacementFile.arrayBuffer());
    const { height, width } = getSpriteSizeFromBuffer(thumbnailBuffer);

    nextSprite = normalizeSpriteRecord({
      ...normalizedSprite,
      image_h: height,
      image_w: width
    });
  } else {
    if (!existingSprite?.image_data) {
      throw new Error("Sprite image is missing in the database.");
    }

    thumbnailBuffer = existingSprite.image_data;
  }

  await upsertSpriteAsset(db, nextSprite, thumbnailBuffer);

  return {
    ...nextSprite,
    thumbnail: createSpriteThumbnailDataUrl(thumbnailBuffer, nextSprite.filename)
  };
}

export async function saveTileRecord(input: {
  slots: Array<SlotRecord | null>;
  slug: string;
  source: string;
}) {
  await ensureAssetDatabaseReady();
  const db = await getDatabase();
  const existingTile = await db<StoredAssetRow>("map_tiles")
    .select("*")
    .first()
    .where({ asset_key: getTileAssetKey(input.slug.trim()), deleted: false });

  if (!existingTile) {
    throw new Error("Tile not found.");
  }

  const currentTile = mapRowToTileRecord(existingTile);
  const nextTile = normalizeTilePayload(
    currentTile.name,
    currentTile.path,
    currentTile.slug,
    input.source,
    input.slots,
    createTileThumbnail(input.slots)
  );

  await upsertTileAsset(db, nextTile);
  return nextTile;
}

export async function deleteAssetRecord(input: {
  assetType: "sprite" | "tile";
  filename?: string;
  path?: string;
  slug?: string;
}) {
  await ensureAssetDatabaseReady();
  const db = await getDatabase();
  const now = new Date().toISOString();

  if (input.assetType === "tile") {
    const tileSlug = input.slug?.trim() ?? "";

    if (!tileSlug) {
      throw new Error("Tile slug is required.");
    }

    const existingTile = await db<StoredAssetRow>("map_tiles")
      .select("*")
      .first()
      .where({ asset_key: getTileAssetKey(tileSlug), deleted: false });

    if (!existingTile) {
      throw new Error("Tile not found.");
    }

    const nextAssetName = prefixDeletedAssetName(existingTile.asset_name);

    await db("map_tiles")
      .where({ id: existingTile.id })
      .update({
        asset_name: nextAssetName,
        deleted: true,
        updated_at: now
      });

    return {
      assetType: "tile" as const,
      path: existingTile.sub_folder,
      slug: tileSlug
    };
  }

  const spritePath = normalizeTileLibraryPath(input.path);
  const spriteFilename = input.filename?.trim() ?? "";

  if (!spritePath || !spriteFilename) {
    throw new Error("Sprite path and filename are required.");
  }

  const existingSprite = await db<StoredAssetRow>("map_tiles")
    .select("*")
    .first()
    .where({ asset_key: getSpriteAssetKey(spritePath, spriteFilename), deleted: false });

  if (!existingSprite) {
    throw new Error("Sprite not found.");
  }

  const nextAssetName = prefixDeletedAssetName(existingSprite.asset_name);
  const currentSpriteMetadata =
    existingSprite.sprite_metadata && typeof existingSprite.sprite_metadata === "object"
      ? { ...(existingSprite.sprite_metadata as Record<string, unknown>) }
      : {};

  if (typeof currentSpriteMetadata.name === "string") {
    currentSpriteMetadata.name = prefixDeletedAssetName(currentSpriteMetadata.name);
  } else {
    currentSpriteMetadata.name = nextAssetName;
  }

  await db("map_tiles")
    .where({ id: existingSprite.id })
    .update({
      asset_name: nextAssetName,
      deleted: true,
      sprite_metadata: JSON.stringify(currentSpriteMetadata),
      updated_at: now
    });

  return {
    assetType: "sprite" as const,
    filename: spriteFilename,
    path: spritePath,
    spriteKey: getTileLibrarySpriteKey(spritePath, spriteFilename)
  };
}

export async function readMapRecords() {
  await ensureMapDatabaseReady();
  const db = await getDatabase();
  const [storedMaps, storedPlacements] = await Promise.all([
    db<StoredMapRow>("map_maps")
      .select(["id", "slug", "name", "width", "height", "deleted", "created_at", "updated_at"])
      .where({ deleted: false })
      .orderBy("updated_at", "desc"),
    db("map_map_assets as placements")
      .innerJoin("map_maps as maps", "placements.map_id", "maps.id")
      .leftJoin("map_tiles as tile_assets", "placements.tile_asset_id", "tile_assets.id")
      .leftJoin("map_tiles as sprite_assets", "placements.sprite_asset_id", "sprite_assets.id")
      .select([
        "placements.map_id",
        "placements.layer_index",
        "placements.tile_x",
        "placements.tile_y",
        "placements.asset_type",
        "placements.tile_asset_id",
        "placements.sprite_asset_id",
        "placements.slot_num",
        "placements.color_enabled",
        "placements.color_value",
        "placements.multiply_enabled",
        "placements.flip_horizontal",
        "placements.flip_vertical",
        "placements.rotate_quarter_turns",
        "tile_assets.asset_slug as tile_slug",
        "sprite_assets.sub_folder as sprite_sub_folder",
        "sprite_assets.file_name as sprite_file_name"
      ])
      .where("maps.deleted", false)
      .orderBy([
        { column: "placements.map_id", order: "asc" },
        { column: "placements.layer_index", order: "asc" },
        { column: "placements.tile_y", order: "asc" },
        { column: "placements.tile_x", order: "asc" }
      ])
  ]);
  const placementsByMapId = new Map<string, StoredMapPlacementRow[]>();

  for (const placement of storedPlacements as StoredMapPlacementRow[]) {
    const existingPlacements = placementsByMapId.get(placement.map_id);

    if (existingPlacements) {
      existingPlacements.push(placement);
      continue;
    }

    placementsByMapId.set(placement.map_id, [placement]);
  }

  return storedMaps.map((storedMap) => {
    const layers = createEmptyMapLayers(storedMap.width, storedMap.height);
    const placements = placementsByMapId.get(storedMap.id) ?? [];

    for (const placement of placements) {
      if (
        placement.layer_index < 0 ||
        placement.layer_index >= layers.length ||
        placement.tile_y < 0 ||
        placement.tile_y >= storedMap.height ||
        placement.tile_x < 0 ||
        placement.tile_x >= storedMap.width
      ) {
        continue;
      }

      layers[placement.layer_index][placement.tile_y][placement.tile_x] = createMapPlacementFromRow(
        placement
      );
    }

    return normalizeMapRecord({
      cells: flattenMapLayers(layers, storedMap.width, storedMap.height),
      height: storedMap.height,
      layers,
      name: storedMap.name,
      slug: storedMap.slug,
      updatedAt: serializeStoredTimestamp(storedMap.updated_at),
      width: storedMap.width
    });
  });
}

export async function writeMapRecord(mapRecord: MapRecord) {
  await ensureMapDatabaseReady();
  await upsertMapRecordToDatabase(mapRecord);
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
    cells: flattenMapLayers(createEmptyMapLayers(normalizedWidth, normalizedHeight)),
    height: normalizedHeight,
    layers: createEmptyMapLayers(normalizedWidth, normalizedHeight),
    name,
    slug,
    updatedAt: new Date().toISOString(),
    width: normalizedWidth
  };
}

export function normalizeTilePayload(
  name: string,
  path: string,
  slug: string,
  source: string,
  slots: Array<SlotRecord | null>,
  thumbnail = ""
): TileRecord {
  return {
    name: name.trim(),
    path: normalizeTileRecordPath(path),
    slug: slug.trim(),
    source: source.trim(),
    slots: normalizeSlotRecords(slots),
    thumbnail: thumbnail.trim()
  };
}

export function normalizeMapPayload(
  name: string,
  slug: string,
  layers: MapLayerStack,
  width?: number,
  height?: number
): MapRecord {
  const dimensions = getMapLayerDimensions(layers);
  const normalizedWidth = normalizeMapDimension(width ?? dimensions.width);
  const normalizedHeight = normalizeMapDimension(height ?? dimensions.height);
  const normalizedLayers = normalizeMapLayers(layers, normalizedWidth, normalizedHeight);

  return {
    cells: flattenMapLayers(normalizedLayers, normalizedWidth, normalizedHeight),
    height: normalizedHeight,
    layers: normalizedLayers,
    name: name.trim(),
    slug: slug.trim(),
    updatedAt: new Date().toISOString(),
    width: normalizedWidth
  };
}
