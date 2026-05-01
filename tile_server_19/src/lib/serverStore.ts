import { createHash, createHmac, randomUUID } from "node:crypto";
import { existsSync, type Dirent } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PNG } from "pngjs";
import sharp from "sharp";

import { MAP_DEFAULT_GRID_SIZE, SLOT_COUNT, TILE_SIZE } from "./constants";
import { ensureDatabaseSchema, getDatabase, getDatabaseConnectionErrorMessage } from "./database";
import {
  getOpenRouterApiKey,
  getR2Bucket,
  getR2Token,
  getR2UserAccessKey,
  getR2UserSecret,
  getVaxAdminKey,
  getVaxServer
} from "./env";
import {
  createEmptyMapCells,
  createEmptyMapLayers,
  createEmptyMapSpecialGrid,
  createMapSpritePlacement,
  createMapTilePlacement,
  flattenMapLayers,
  getMapLayerDimensions,
  isMapSpritePlacement,
  isMapTilePlacement,
  normalizeMapLayers,
  normalizeMapDimension,
  normalizeMapSpecialGrid,
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
import {
  getDefaultSpriteMount,
  getSpriteBoundingBox,
  getSpriteTileFootprint
} from "./sprites";
import type {
  CharacterEventRecord,
  ClipboardSlotRecord,
  ExportArtifact,
  ItemRecord,
  LoadedImagePayload,
  MapLayerCell,
  MapLayerStack,
  MapRecord,
  MapTileOptions,
  PersonalityEventRecord,
  PersonalityRecord,
  CursorAssetRecord,
  SpriteEventRecord,
  SpriteRecord,
  SpriteStateRecord,
  SlotRecord,
  TileRecord,
  ZoneEventRecord
} from "../types";

const APP_ROOT = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const WORKSPACE_ROOT = path.resolve(APP_ROOT, "..");
const DATA_DIR = path.join(APP_ROOT, "data");
const PERSONALITY_BASE_PROMPT_PATH = path.join(DATA_DIR, "prompts", "personlity_base.md");
const PERSONALITY_MODEL_OPTIONS_PATH = path.join(DATA_DIR, "prompts", "model_options.json");
const RANDOM_PERSONALITY_PROMPT_PATH = path.join(DATA_DIR, "prompts", "random_personality.md");
const PERSONALITY_SCHEMA_PROMPT_PATH = path.join(DATA_DIR, "prompts", "personality_schema.md");
const PERSONALITY_PROFILE_IMAGE_ROUTE_PREFIX = "/__personalities/profile";
const TEMP_DIR = path.join(DATA_DIR, "temp");
const MAPS_DIR = path.join(DATA_DIR, "maps");
const CLIPBOARD_DB_PATH = path.join(TEMP_DIR, "clipboard-slots.json");
const TILE_DB_PATH = path.join(DATA_DIR, "all_tiles.json");
const LEGACY_TILE_DB_PATH = path.join(WORKSPACE_ROOT, "tile_server", "all_tiles.json");
const EXPORTS_DIR = path.join(APP_ROOT, "exports");
const PUBLIC_CURSORS_DIR = path.join(APP_ROOT, "public", "cursors");
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
  aboutPrompt?: string;
  cells?: string[][];
  height?: number;
  layers?: StoredMapCell[][][];
  name?: string;
  special?: number[][];
  slug?: string;
  tileMap?: Record<string, StoredMapTileReference>;
  updatedAt?: string;
  width?: number;
}

type StoredSpriteRecord = Omit<SpriteRecord, "id" | "path" | "thumbnail">;

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
  impassible: boolean | null;
  source_path: string | null;
  sprite_metadata: unknown;
  sub_folder: string;
  tile_slots: unknown;
  updated_at: Date | string;
}

interface StoredMapRow {
  about_prompt: string | null;
  created_at: Date | string;
  deleted: boolean;
  height: number;
  id: string;
  is_instance: boolean;
  mini_map: Buffer | null;
  name: string;
  slug: string;
  special_grid: unknown;
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

interface StoredItemRow {
  base_value: number | null;
  character: string | null;
  deleted?: boolean | null;
  description: string | null;
  durability: number | null;
  etag: string | null;
  gives_light: number | null;
  height: number | null;
  id: number;
  inserted_at: Date | string;
  is_consumable: boolean | null;
  is_container: boolean | null;
  item_type: string;
  layer: number | null;
  level: number | null;
  long_description: string | null;
  model: string | null;
  mount_point: string | null;
  name: string;
  on_acquire: string | null;
  on_activate: string | null;
  on_consume: string | null;
  on_drop: string | null;
  on_use: string | null;
  quality: string | null;
  rarity: string | null;
  slug: string;
  source: string | null;
  source_kind: string | null;
  storage_capacity: number | null;
  textures: string[] | null;
  thumbnail: string | null;
  thumbnail2x: string | null;
  type: string | null;
  updated_at: Date | string;
  weapon_grip: string | null;
  width: number | null;
}

interface StoredPersonalityRow {
  accent: string | null;
  age: number | null;
  aggression: number | null;
  altruism: number | null;
  areas_of_expertise: string | null;
  backstory: string | null;
  base_hp: number | null;
  character_slug: string;
  chat_model: string | null;
  chat_provider: string | null;
  clothing_style: string | null;
  courage: number | null;
  custom_profile_pic: string | null;
  distinguishing_feature: string | null;
  emotional_range: string | null;
  family_description: string | null;
  fears: string | null;
  gender: string | null;
  goals: string | null;
  gold: number | null;
  goodness: number | null;
  hidden_desires: string | null;
  honesty: number | null;
  impulsiveness: number | null;
  inserted_at: Date | string;
  llm_prompt_base: string | null;
  loyalty: number | null;
  mannerisms: string | null;
  name: string;
  other_world_knowledge: string | null;
  optimism: number | null;
  physical_description: string | null;
  reputation: number | null;
  role: string | null;
  secrets_you_know: string | null;
  smalltalk_topics_enjoyed: string | null;
  sociability: number | null;
  specialties: string | null;
  speech_pattern: string | null;
  speech_style: string | null;
  summary: string | null;
  temperament: string | null;
  things_you_can_share: string | null;
  titles: string | null;
  updated_at: Date | string;
  voice_id: string | null;
}

interface StoredPersonalityEventRow {
  enabled: boolean | null;
  event_details: unknown;
  event_type: string;
  id: number | string;
  inserted_at: Date | string;
  lua_script: string | null;
  name: string;
  personality_id: string;
  response_context: string | null;
  updated_at: Date | string;
}

interface StoredZoneEventRow {
  enabled: boolean | null;
  id: number | string;
  inserted_at: Date | string;
  lua_script: string | null;
  updated_at: Date | string;
  zone_event: string;
  zone_name: string;
}

interface StoredCharacterEventRow {
  character_event: string;
  character_name: string;
  enabled: boolean | null;
  id: number | string;
  inserted_at: Date | string;
  lua_script: string | null;
  updated_at: Date | string;
}

interface StoredSpriteEventRow {
  enabled: boolean | null;
  event_id: string;
  id: number | string;
  inserted_at: Date | string;
  lua_script: string | null;
  sprite_id: string;
  updated_at: Date | string;
}

interface StoredSpriteStateRow {
  file_name: string;
  id: string;
  image_data: Buffer;
  inserted_at: Date | string;
  sprite_id: string;
  state_id: string;
  state_metadata: unknown;
  updated_at: Date | string;
}

interface ItemFieldLookups {
  mountPoints: string[];
  rarities: string[];
  weaponGrips: string[];
}

const PERSONALITY_EDITABLE_FIELDS = [
  "accent",
  "age",
  "aggression",
  "altruism",
  "areas_of_expertise",
  "backstory",
  "base_hp",
  "chat_model",
  "chat_provider",
  "clothing_style",
  "courage",
  "custom_profile_pic",
  "distinguishing_feature",
  "emotional_range",
  "family_description",
  "fears",
  "gender",
  "goals",
  "gold",
  "goodness",
  "hidden_desires",
  "honesty",
  "impulsiveness",
  "loyalty",
  "mannerisms",
  "name",
  "other_world_knowledge",
  "optimism",
  "physical_description",
  "reputation",
  "role",
  "secrets_you_know",
  "smalltalk_topics_enjoyed",
  "sociability",
  "specialties",
  "speech_pattern",
  "speech_style",
  "summary",
  "temperament",
  "things_you_can_share",
  "titles",
  "voice_id"
] as const;

type EditablePersonalityField = (typeof PERSONALITY_EDITABLE_FIELDS)[number];

const PERSONALITY_LLM_GENERATED_FIELDS = [
  "accent",
  "age",
  "aggression",
  "altruism",
  "areas_of_expertise",
  "backstory",
  "base_hp",
  "clothing_style",
  "courage",
  "custom_profile_pic",
  "distinguishing_feature",
  "emotional_range",
  "family_description",
  "fears",
  "gender",
  "goals",
  "gold",
  "goodness",
  "hidden_desires",
  "honesty",
  "impulsiveness",
  "loyalty",
  "mannerisms",
  "name",
  "other_world_knowledge",
  "optimism",
  "physical_description",
  "reputation",
  "role",
  "secrets_you_know",
  "smalltalk_topics_enjoyed",
  "sociability",
  "specialties",
  "speech_pattern",
  "speech_style",
  "summary",
  "temperament",
  "things_you_can_share",
  "titles",
  "voice_id"
] as const satisfies ReadonlyArray<EditablePersonalityField>;

type GeneratedPersonalityField = (typeof PERSONALITY_LLM_GENERATED_FIELDS)[number];

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

function hasPromptBaseValue(value: PersonalityRecord[keyof PersonalityRecord]) {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  return value != null;
}

function formatPromptBaseValue(
  label: string,
  value: PersonalityRecord[keyof PersonalityRecord],
  type: "number" | "range" | "text"
) {
  if (type === "text") {
    return `Your ${label}: ${String(value).trim()}`;
  }

  if (type === "range") {
    return `Your ${label}: ${Number(value)} out of 100`;
  }

  return `Your ${label}: ${Number(value)}`;
}

function normalizeGeneratedTextValue(
  value: unknown,
  fallbackValue: string | null
) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return fallbackValue;
  }

  const normalizedValue = value.trim();
  return normalizedValue ? normalizedValue : null;
}

const PERSONALITY_PROMPT_SYSTEM_FIELDS = new Set<keyof PersonalityRecord>([
  "character_slug",
  "custom_profile_pic",
  "chat_model",
  "chat_provider",
  "inserted_at",
  "llm_prompt_base",
  "updated_at",
  "voice_id"
]);

const PERSONALITY_PROMPT_SECTION_FIELDS = [
  {
    fields: [
      { field: "name", label: "name", type: "text" },
      { field: "titles", label: "titles", type: "text" },
      { field: "role", label: "role", type: "text" },
      { field: "gender", label: "gender", type: "text" },
      { field: "age", label: "age", type: "number" }
    ],
    title: "Identity"
  },
  {
    fields: [
      { field: "base_hp", label: "base HP", type: "number" },
      { field: "gold", label: "gold", type: "number" }
    ],
    title: "Core Stats"
  },
  {
    fields: [
      { field: "temperament", label: "temperament", type: "text" },
      { field: "emotional_range", label: "emotional range", type: "text" },
      { field: "speech_pattern", label: "speech pattern", type: "text" },
      { field: "accent", label: "accent", type: "text" },
      { field: "reputation", label: "reputation", type: "range" },
      { field: "aggression", label: "aggression level", type: "range" },
      { field: "altruism", label: "altruism level", type: "range" },
      { field: "honesty", label: "honesty level", type: "range" },
      { field: "courage", label: "courage level", type: "range" },
      { field: "impulsiveness", label: "impulsiveness level", type: "range" },
      { field: "optimism", label: "optimism level", type: "range" },
      { field: "sociability", label: "sociability level", type: "range" },
      { field: "loyalty", label: "loyalty level", type: "range" },
      { field: "goodness", label: "goodness level", type: "range" }
    ],
    title: "Behavior"
  },
  {
    fields: [
      { field: "summary", label: "summary", type: "text" },
      { field: "goals", label: "goals", type: "text" },
      { field: "backstory", label: "backstory", type: "text" },
      { field: "hidden_desires", label: "hidden desires", type: "text" },
      { field: "fears", label: "fears", type: "text" },
      { field: "family_description", label: "family description", type: "text" },
      { field: "areas_of_expertise", label: "areas of expertise", type: "text" },
      { field: "specialties", label: "specialties", type: "text" }
    ],
    title: "Motivation"
  },
  {
    fields: [
      { field: "secrets_you_know", label: "secrets you know", type: "text" },
      { field: "things_you_can_share", label: "things you can share", type: "text" },
      { field: "smalltalk_topics_enjoyed", label: "smalltalk topics enjoyed", type: "text" },
      { field: "other_world_knowledge", label: "other world knowledge", type: "text" }
    ],
    title: "Personal Information"
  },
  {
    fields: [
      { field: "physical_description", label: "physical description", type: "text" },
      { field: "distinguishing_feature", label: "distinguishing feature", type: "text" },
      { field: "speech_style", label: "speech style", type: "text" },
      { field: "mannerisms", label: "mannerisms", type: "text" },
      { field: "clothing_style", label: "clothing style", type: "text" }
    ],
    title: "Presentation"
  }
] as const satisfies ReadonlyArray<{
  fields: ReadonlyArray<{
    field: Exclude<keyof PersonalityRecord, "character_slug" | "inserted_at" | "llm_prompt_base" | "updated_at" | "voice_id">;
    label: string;
    type: "number" | "range" | "text";
  }>;
  title: string;
}>;

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
        spriteRecord = createInitialSpriteRecord(relativePath, entry.name, spriteBuffer);
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
      impassible: true,
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
      impassible: true,
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
      impassible: normalizedTile.impassible,
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
      impassible: normalizedTile.impassible,
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
      impassible: normalizedSprite.impassible,
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
      impassible: normalizedSprite.impassible,
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
    bufferToPngDataUrl(row.image_data) || createTileThumbnail(slots),
    row.impassible ?? true
  );
}

async function mapRowToSpriteRecord(
  db: Awaited<ReturnType<typeof getDatabase>>,
  row: StoredAssetRow
) {
  if (!row.file_name) {
    return null;
  }

  const spriteRecord = parseSpriteRecord(row.sub_folder, `${path.parse(row.file_name).name}.json`, row.sprite_metadata);

  if (!spriteRecord) {
    return null;
  }

  if (!row.image_data) {
    return {
      ...spriteRecord,
      id: row.id,
      thumbnail: ""
    };
  }

  const nextSpriteRecord = applySpriteImageMetrics(spriteRecord, row.image_data);
  const currentSerialized = JSON.stringify(serializeStoredSpriteRecord(spriteRecord));
  const nextSerialized = JSON.stringify(serializeStoredSpriteRecord(nextSpriteRecord));

  if (currentSerialized !== nextSerialized) {
    await db("map_tiles")
      .where({ id: row.id })
      .update({
        asset_name: nextSpriteRecord.name,
        impassible: nextSpriteRecord.impassible,
        sprite_metadata: nextSerialized,
        updated_at: new Date().toISOString()
      });
  }

  return {
    ...nextSpriteRecord,
    id: row.id,
    thumbnail: bufferToPngDataUrl(row.image_data)
  };
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function normalizeInteger(value: unknown, fallbackValue: number, minimum?: number, maximum?: number) {
  const normalizedValue = normalizeOptionalNumber(value);

  if (normalizedValue == null) {
    return fallbackValue;
  }

  const roundedValue = Math.round(normalizedValue);

  if (typeof minimum === "number" && roundedValue < minimum) {
    return minimum;
  }

  if (typeof maximum === "number" && roundedValue > maximum) {
    return maximum;
  }

  return roundedValue;
}

function normalizeOptionalInteger(value: unknown, minimum?: number, maximum?: number) {
  const normalizedValue = normalizeOptionalNumber(value);

  if (normalizedValue == null) {
    return null;
  }

  const roundedValue = Math.round(normalizedValue);

  if (typeof minimum === "number" && roundedValue < minimum) {
    return minimum;
  }

  if (typeof maximum === "number" && roundedValue > maximum) {
    return maximum;
  }

  return roundedValue;
}

function normalizePersonalityGender(value: unknown): PersonalityRecord["gender"] {
  if (value === "M" || value === "F" || value === "NB") {
    return value;
  }

  return "NB";
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function mapRowToItemRecord(row: StoredItemRow): ItemRecord {
  return {
    base_value: normalizeOptionalNumber(row.base_value),
    character: normalizeOptionalText(row.character),
    description: normalizeOptionalText(row.description),
    durability: normalizeOptionalNumber(row.durability),
    etag: normalizeOptionalText(row.etag),
    gives_light: normalizeOptionalNumber(row.gives_light),
    height: normalizeOptionalNumber(row.height),
    id: Math.max(0, Math.round(normalizeOptionalNumber(row.id) ?? 0)),
    inserted_at: serializeStoredTimestamp(row.inserted_at),
    is_consumable: normalizeOptionalBoolean(row.is_consumable),
    is_container: normalizeOptionalBoolean(row.is_container),
    item_type: typeof row.item_type === "string" && row.item_type.trim() ? row.item_type.trim() : "unknown",
    layer: normalizeOptionalNumber(row.layer),
    level: normalizeOptionalNumber(row.level),
    long_description: normalizeOptionalText(row.long_description),
    model: normalizeOptionalText(row.model),
    mount_point: normalizeOptionalText(row.mount_point),
    name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : `Item ${row.id}`,
    on_acquire: normalizeOptionalText(row.on_acquire),
    on_activate: normalizeOptionalText(row.on_activate),
    on_consume: normalizeOptionalText(row.on_consume),
    on_drop: normalizeOptionalText(row.on_drop),
    on_use: normalizeOptionalText(row.on_use),
    quality: normalizeOptionalText(row.quality),
    rarity: normalizeOptionalText(row.rarity),
    slug: typeof row.slug === "string" && row.slug.trim() ? row.slug.trim() : String(row.id),
    source: normalizeOptionalText(row.source),
    source_kind: normalizeOptionalText(row.source_kind),
    storage_capacity: normalizeOptionalNumber(row.storage_capacity),
    textures: normalizeStringArray(row.textures),
    thumbnail: normalizeOptionalText(row.thumbnail),
    thumbnail2x: normalizeOptionalText(row.thumbnail2x),
    type: normalizeOptionalText(row.type),
    updated_at: serializeStoredTimestamp(row.updated_at),
    weapon_grip: normalizeOptionalText(row.weapon_grip),
    width: normalizeOptionalNumber(row.width)
  };
}

function mapRowToPersonalityRecord(row: StoredPersonalityRow): PersonalityRecord {
  const storedCustomProfilePic = normalizeOptionalText(row.custom_profile_pic);

  return {
    accent: normalizeOptionalText(row.accent),
    age: normalizeOptionalInteger(row.age, 0),
    aggression: normalizeInteger(row.aggression, 50, 1, 100),
    altruism: normalizeInteger(row.altruism, 50, 1, 100),
    areas_of_expertise: normalizeOptionalText(row.areas_of_expertise),
    backstory: normalizeOptionalText(row.backstory),
    base_hp: normalizeInteger(row.base_hp, 100, 1),
    character_slug:
      typeof row.character_slug === "string" && row.character_slug.trim()
        ? row.character_slug.trim()
        : "unknown_personality",
    chat_model: normalizeOptionalText(row.chat_model),
    chat_provider: normalizeOptionalText(row.chat_provider),
    clothing_style: normalizeOptionalText(row.clothing_style),
    courage: normalizeInteger(row.courage, 50, 1, 100),
    custom_profile_pic:
      storedCustomProfilePic && isManagedPersonalityProfileImageUrl(row.character_slug, storedCustomProfilePic)
        ? getPersonalityProfileImageProxyUrl(row.character_slug, row.updated_at)
        : storedCustomProfilePic,
    distinguishing_feature: normalizeOptionalText(row.distinguishing_feature),
    emotional_range: normalizeOptionalText(row.emotional_range),
    family_description: normalizeOptionalText(row.family_description),
    fears: normalizeOptionalText(row.fears),
    gender: normalizePersonalityGender(row.gender),
    goals: normalizeOptionalText(row.goals),
    gold: normalizeInteger(row.gold, 0, 0),
    goodness: normalizeInteger(row.goodness, 50, 1, 100),
    hidden_desires: normalizeOptionalText(row.hidden_desires),
    honesty: normalizeInteger(row.honesty, 50, 1, 100),
    impulsiveness: normalizeInteger(row.impulsiveness, 50, 1, 100),
    inserted_at: serializeStoredTimestamp(row.inserted_at),
    llm_prompt_base: normalizeOptionalText(row.llm_prompt_base),
    loyalty: normalizeInteger(row.loyalty, 50, 1, 100),
    mannerisms: normalizeOptionalText(row.mannerisms),
    name:
      typeof row.name === "string" && row.name.trim()
        ? row.name.trim()
        : row.character_slug.trim() || "Unnamed Personality",
    other_world_knowledge: normalizeOptionalText(row.other_world_knowledge),
    optimism: normalizeInteger(row.optimism, 50, 1, 100),
    physical_description: normalizeOptionalText(row.physical_description),
    reputation: normalizeInteger(row.reputation, 50, 1, 100),
    role: normalizeOptionalText(row.role),
    secrets_you_know: normalizeOptionalText(row.secrets_you_know),
    smalltalk_topics_enjoyed: normalizeOptionalText(row.smalltalk_topics_enjoyed),
    sociability: normalizeInteger(row.sociability, 50, 1, 100),
    specialties: normalizeOptionalText(row.specialties),
    speech_pattern: normalizeOptionalText(row.speech_pattern),
    speech_style: normalizeOptionalText(row.speech_style),
    summary: normalizeOptionalText(row.summary),
    temperament: normalizeOptionalText(row.temperament),
    things_you_can_share: normalizeOptionalText(row.things_you_can_share),
    titles: normalizeOptionalText(row.titles),
    updated_at: serializeStoredTimestamp(row.updated_at),
    voice_id: normalizeOptionalText(row.voice_id)
  };
}

function normalizePersonalityEventDetails(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function mapRowToPersonalityEventRecord(row: StoredPersonalityEventRow): PersonalityEventRecord {
  return {
    enabled: row.enabled !== false,
    event_details: normalizePersonalityEventDetails(row.event_details),
    event_type: "tool",
    id: String(row.id),
    inserted_at: serializeStoredTimestamp(row.inserted_at),
    lua_script: typeof row.lua_script === "string" ? row.lua_script : "",
    name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : `event_${row.id}`,
    personality_id: row.personality_id,
    response_context: typeof row.response_context === "string" ? row.response_context : "",
    updated_at: serializeStoredTimestamp(row.updated_at)
  };
}

function mapRowToZoneEventRecord(row: StoredZoneEventRow): ZoneEventRecord {
  return {
    enabled: row.enabled !== false,
    id: String(row.id),
    inserted_at: serializeStoredTimestamp(row.inserted_at),
    lua_script: typeof row.lua_script === "string" ? row.lua_script : "",
    updated_at: serializeStoredTimestamp(row.updated_at),
    zone_event:
      typeof row.zone_event === "string" && row.zone_event.trim()
        ? row.zone_event.trim()
        : `event_${row.id}`,
    zone_name: typeof row.zone_name === "string" ? row.zone_name.trim() : ""
  };
}

function mapRowToCharacterEventRecord(row: StoredCharacterEventRow): CharacterEventRecord {
  return {
    character_event:
      typeof row.character_event === "string" && row.character_event.trim()
        ? row.character_event.trim()
        : `event_${row.id}`,
    character_name: typeof row.character_name === "string" ? row.character_name.trim() : "",
    enabled: row.enabled !== false,
    id: String(row.id),
    inserted_at: serializeStoredTimestamp(row.inserted_at),
    lua_script: typeof row.lua_script === "string" ? row.lua_script : "",
    updated_at: serializeStoredTimestamp(row.updated_at)
  };
}

function mapRowToSpriteEventRecord(row: StoredSpriteEventRow): SpriteEventRecord {
  return {
    enabled: row.enabled !== false,
    event_id:
      typeof row.event_id === "string" && row.event_id.trim()
        ? row.event_id.trim()
        : `event_${row.id}`,
    id: String(row.id),
    inserted_at: serializeStoredTimestamp(row.inserted_at),
    lua_script: typeof row.lua_script === "string" ? row.lua_script : "",
    sprite_id: row.sprite_id,
    updated_at: serializeStoredTimestamp(row.updated_at)
  };
}

function mapRowToSpriteStateRecord(row: StoredSpriteStateRow): SpriteStateRecord {
  return {
    file_name: row.file_name,
    id: row.id,
    inserted_at: serializeStoredTimestamp(row.inserted_at),
    sprite_id: row.sprite_id,
    state_id:
      typeof row.state_id === "string" && row.state_id.trim()
        ? row.state_id.trim()
        : `state_${row.id}`,
    state_metadata:
      row.state_metadata && typeof row.state_metadata === "object"
        ? (row.state_metadata as Record<string, unknown>)
        : {},
    thumbnail: bufferToPngDataUrl(row.image_data),
    updated_at: serializeStoredTimestamp(row.updated_at)
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

async function ensureItemsDeletedColumn() {
  const db = await getDatabase();
  const hasItemsTable = await db.schema.hasTable("items");

  if (!hasItemsTable) {
    return false;
  }

  const hasDeletedColumn = await db.schema.hasColumn("items", "deleted");

  if (!hasDeletedColumn) {
    await db.schema.alterTable("items", (table) => {
      table.boolean("deleted").notNullable().defaultTo(false);
    });
  }

  return true;
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

function createInitialSpriteRecord(relativePath: string, fileName: string, imageBuffer: Buffer) {
  const { height, width } = getSpriteSizeFromBuffer(imageBuffer);
  const defaultMount = getDefaultSpriteMount(width, height);

  return applySpriteImageMetrics(
    {
      bounding_h: height,
      bounding_w: width,
      bounding_x: -defaultMount.mount_x,
      bounding_y: -defaultMount.mount_y,
      casts_shadow: true,
      filename: fileName,
      id: "",
      image_h: height,
      image_w: width,
      impassible: false,
      is_flat: false,
      is_locked: false,
      item_id: 0,
      mount_x: defaultMount.mount_x,
      mount_y: defaultMount.mount_y,
      mouseover_cursor: "",
      name: path.parse(fileName).name,
      on_activate: "",
      offset_x: 0,
      offset_y: 0,
      path: relativePath,
      thumbnail: "",
      tile_h: height / TILE_SIZE,
      tile_w: width / TILE_SIZE
    },
    imageBuffer
  );
}

function normalizeFiniteNumber(value: unknown, fallbackValue: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallbackValue;
}

function normalizeSpriteRecord(record: SpriteRecord): SpriteRecord {
  const normalizedPath = normalizeTileRecordPath(record.path);
  const normalizedFilename = sanitizeSpriteFilename(record.filename);
  const imageWidth = Math.max(1, normalizeFiniteNumber(record.image_w, TILE_SIZE));
  const imageHeight = Math.max(1, normalizeFiniteNumber(record.image_h, TILE_SIZE));
  const defaultMount = getDefaultSpriteMount(imageWidth, imageHeight);
  const mountX = normalizeFiniteNumber(record.mount_x, defaultMount.mount_x);
  const mountY = normalizeFiniteNumber(record.mount_y, defaultMount.mount_y);
  const mouseoverCursor =
    typeof record.mouseover_cursor === "string"
      ? path.posix.basename(record.mouseover_cursor.trim())
      : "";

  return {
    bounding_h: Math.max(0, normalizeFiniteNumber(record.bounding_h, imageHeight)),
    bounding_w: Math.max(0, normalizeFiniteNumber(record.bounding_w, imageWidth)),
    bounding_x: normalizeFiniteNumber(record.bounding_x, -mountX),
    bounding_y: normalizeFiniteNumber(record.bounding_y, -mountY),
    casts_shadow: typeof record.casts_shadow === "boolean" ? record.casts_shadow : true,
    filename: normalizedFilename,
    id: typeof record.id === "string" ? record.id.trim() : "",
    image_h: imageHeight,
    image_w: imageWidth,
    impassible: Boolean(record.impassible),
    is_flat: Boolean(record.is_flat),
    is_locked: typeof record.is_locked === "boolean" ? record.is_locked : false,
    item_id: Math.max(0, Math.round(normalizeFiniteNumber(record.item_id, 0))),
    mount_x: mountX,
    mount_y: mountY,
    mouseover_cursor: mouseoverCursor,
    name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : path.parse(normalizedFilename).name,
    on_activate: typeof record.on_activate === "string" ? record.on_activate : "",
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
  const fallbackImageWidth = normalizeFiniteNumber(record.image_w, TILE_SIZE);
  const fallbackImageHeight = normalizeFiniteNumber(record.image_h, TILE_SIZE);
  const defaultMount = getDefaultSpriteMount(fallbackImageWidth, fallbackImageHeight);

  try {
    return normalizeSpriteRecord({
      bounding_h: normalizeFiniteNumber(record.bounding_h, fallbackImageHeight),
      bounding_w: normalizeFiniteNumber(record.bounding_w, fallbackImageWidth),
      bounding_x: normalizeFiniteNumber(record.bounding_x, -defaultMount.mount_x),
      bounding_y: normalizeFiniteNumber(record.bounding_y, -defaultMount.mount_y),
      casts_shadow: typeof record.casts_shadow === "boolean" ? record.casts_shadow : true,
      filename,
      id: "",
      image_h: fallbackImageHeight,
      image_w: fallbackImageWidth,
      impassible: Boolean(record.impassible),
      is_flat: Boolean(record.is_flat),
      is_locked: typeof record.is_locked === "boolean" ? record.is_locked : false,
      item_id: normalizeFiniteNumber(record.item_id, 0),
      mount_x: normalizeFiniteNumber(record.mount_x, defaultMount.mount_x),
      mount_y: normalizeFiniteNumber(record.mount_y, defaultMount.mount_y),
      mouseover_cursor: typeof record.mouseover_cursor === "string" ? record.mouseover_cursor : "",
      name: typeof record.name === "string" ? record.name : path.parse(filename).name,
      on_activate: typeof record.on_activate === "string" ? record.on_activate : "",
      offset_x: normalizeFiniteNumber(record.offset_x, 0),
      offset_y: normalizeFiniteNumber(record.offset_y, 0),
      path: relativePath,
      thumbnail: "",
      tile_h: normalizeFiniteNumber(record.tile_h, fallbackImageHeight / TILE_SIZE),
      tile_w: normalizeFiniteNumber(record.tile_w, fallbackImageWidth / TILE_SIZE)
    });
  } catch {
    return null;
  }
}

function serializeStoredSpriteRecord(spriteRecord: SpriteRecord): StoredSpriteRecord {
  const normalized = normalizeSpriteRecord(spriteRecord);

  return {
    bounding_h: normalized.bounding_h,
    bounding_w: normalized.bounding_w,
    bounding_x: normalized.bounding_x,
    bounding_y: normalized.bounding_y,
    casts_shadow: normalized.casts_shadow,
    filename: normalized.filename,
    image_h: normalized.image_h,
    image_w: normalized.image_w,
    impassible: normalized.impassible,
    is_flat: normalized.is_flat,
    is_locked: normalized.is_locked,
    item_id: normalized.item_id,
    mount_x: normalized.mount_x,
    mount_y: normalized.mount_y,
    mouseover_cursor: normalized.mouseover_cursor,
    name: normalized.name,
    on_activate: normalized.on_activate,
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

function applySpriteImageMetrics(spriteRecord: SpriteRecord, imageBuffer: Buffer) {
  const png = PNG.sync.read(imageBuffer);
  const spriteWithImageSize = normalizeSpriteRecord({
    ...spriteRecord,
    image_h: png.height,
    image_w: png.width
  });
  const tileFootprint = getSpriteTileFootprint(spriteWithImageSize);
  const boundingBox = getSpriteBoundingBox(spriteWithImageSize, (x, y) => {
    const pixelIndex = (png.width * y + x) * 4;
    return png.data[pixelIndex + 3] ?? 0;
  });

  return normalizeSpriteRecord({
    ...spriteWithImageSize,
    ...boundingBox,
    ...tileFootprint
  });
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
    await writeSpriteRecord(createInitialSpriteRecord(relativePath, entry.name, spriteBuffer));
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
      const nextSpriteRecord = applySpriteImageMetrics(spriteRecord, spriteBuffer);
      collectedSprites.set(getSpriteRecordKey(spriteRecord), {
        ...nextSpriteRecord,
        thumbnail: createSpriteThumbnailDataUrl(spriteBuffer, nextSpriteRecord.filename)
      });
    } catch {
      continue;
    }
  }
}

function getCursorAssetLabel(relativePath: string) {
  const parsedPath = path.posix.parse(relativePath);
  const variantPath = parsedPath.dir
    .split("/")
    .filter((segment) => segment && segment !== "PNG" && segment !== "Vector")
    .join(" / ");
  const cursorName = parsedPath.name
    .split("_")
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");

  return variantPath ? `${cursorName} (${variantPath})` : cursorName;
}

function getCursorAssetSortPriority(asset: CursorAssetRecord) {
  if (asset.url.startsWith("/cursors/PNG/Basic/Default/")) {
    return 0;
  }

  if (asset.url.startsWith("/cursors/PNG/Outline/Default/")) {
    return 1;
  }

  if (asset.url.startsWith("/cursors/PNG/Basic/Double/")) {
    return 2;
  }

  if (asset.url.startsWith("/cursors/PNG/")) {
    return 3;
  }

  if (asset.url.startsWith("/cursors/Vector/")) {
    return 4;
  }

  return 5;
}

async function collectCursorAssetRecords(directoryPath: string, relativePath = ""): Promise<CursorAssetRecord[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const cursorAssets: CursorAssetRecord[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const nextRelativePath = relativePath ? path.posix.join(relativePath, entry.name) : entry.name;
    const nextDirectoryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      cursorAssets.push(...await collectCursorAssetRecords(nextDirectoryPath, nextRelativePath));
      continue;
    }

    if (!entry.isFile() || ![".png", ".svg"].includes(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    cursorAssets.push({
      fileName: path.posix.basename(nextRelativePath),
      label: getCursorAssetLabel(nextRelativePath),
      url: `/cursors/${nextRelativePath}`
    });
  }

  return cursorAssets;
}

function isTileRecord(candidate: unknown): candidate is TileRecord {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }

  const record = candidate as Partial<TileRecord>;

  return (
    (typeof record.impassible === "boolean" || typeof record.impassible === "undefined") &&
    typeof record.name === "string" &&
    typeof record.slug === "string" &&
    typeof record.source === "string" &&
    Array.isArray(record.slots)
  );
}

function normalizeTileRecord(record: TileRecord): TileRecord {
  return {
    impassible: typeof record.impassible === "boolean" ? record.impassible : true,
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
  const special = normalizeMapSpecialGrid(record.special, width, height);

  return {
    aboutPrompt: typeof record.aboutPrompt === "string" ? record.aboutPrompt.trim() : "",
    cells: flattenMapLayers(layers, width, height),
    height,
    isInstance: record.isInstance ?? false,
    layers,
    miniMap: typeof record.miniMap === "string" ? record.miniMap.trim() : "",
    name: record.name.trim(),
    special,
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

function decodeStoredMapSpecialGrid(value: unknown) {
  if (Array.isArray(value)) {
    return value as number[][];
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed as number[][] : undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function parseStoredMapRecord(record: StoredMapRecord): MapRecord {
  const tileMap = record.tileMap && typeof record.tileMap === "object" ? record.tileMap : {};

  return normalizeMapRecord({
    aboutPrompt: typeof record.aboutPrompt === "string" ? record.aboutPrompt : "",
    cells: Array.isArray(record.cells) ? record.cells : undefined,
    height: record.height ?? MAP_DEFAULT_GRID_SIZE,
    isInstance: false,
    layers: decodeStoredMapLayers(record.layers, tileMap),
    miniMap: "",
    name: typeof record.name === "string" ? record.name : "",
    special: normalizeMapSpecialGrid(decodeStoredMapSpecialGrid(record.special), record.width, record.height),
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
    aboutPrompt: normalized.aboutPrompt,
    height: normalized.height,
    layers: storedLayers,
    name: normalized.name,
    special: normalized.special,
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
    aboutPrompt: "",
    cells: flattenMapLayers(createEmptyMapLayers(MAP_DEFAULT_GRID_SIZE, MAP_DEFAULT_GRID_SIZE)),
    height: MAP_DEFAULT_GRID_SIZE,
    isInstance: false,
    layers: createEmptyMapLayers(MAP_DEFAULT_GRID_SIZE, MAP_DEFAULT_GRID_SIZE),
    miniMap: "",
    name: "Starter Camp",
    special: createEmptyMapSpecialGrid(MAP_DEFAULT_GRID_SIZE, MAP_DEFAULT_GRID_SIZE),
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
  const miniMapBuffer = normalizedMap.miniMap ? extractPngBuffer(normalizedMap.miniMap) : null;
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
        about_prompt: normalizedMap.aboutPrompt,
        deleted: false,
        height: normalizedMap.height,
        id: randomUUID(),
        is_instance: normalizedMap.isInstance,
        mini_map: miniMapBuffer,
        name: normalizedMap.name,
        special_grid: JSON.stringify(normalizedMap.special),
        slug: normalizedMap.slug,
        updated_at: normalizedMap.updatedAt || now,
        width: normalizedMap.width
      } satisfies Partial<StoredMapRow>)
      .onConflict("slug")
      .merge({
        about_prompt: normalizedMap.aboutPrompt,
        deleted: false,
        height: normalizedMap.height,
        is_instance: normalizedMap.isInstance,
        mini_map: miniMapBuffer,
        name: normalizedMap.name,
        special_grid: JSON.stringify(normalizedMap.special),
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
    aboutPrompt: "",
    cells: flattenMapLayers(createEmptyMapLayers(MAP_DEFAULT_GRID_SIZE, MAP_DEFAULT_GRID_SIZE)),
    height: MAP_DEFAULT_GRID_SIZE,
    isInstance: false,
    layers: createEmptyMapLayers(MAP_DEFAULT_GRID_SIZE, MAP_DEFAULT_GRID_SIZE),
    miniMap: "",
    name: "Starter Camp",
    special: createEmptyMapSpecialGrid(MAP_DEFAULT_GRID_SIZE, MAP_DEFAULT_GRID_SIZE),
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

  const spriteRecords = await Promise.all(rows.map((row) => mapRowToSpriteRecord(db, row)));

  return spriteRecords
    .filter((spriteRecord): spriteRecord is SpriteRecord => spriteRecord !== null);
}

export async function readCursorAssetRecords(): Promise<CursorAssetRecord[]> {
  if (!existsSync(PUBLIC_CURSORS_DIR)) {
    return [];
  }

  const cursorAssets = await collectCursorAssetRecords(PUBLIC_CURSORS_DIR);

  return cursorAssets.sort((left, right) => {
    const priorityComparison = getCursorAssetSortPriority(left) - getCursorAssetSortPriority(right);

    if (priorityComparison !== 0) {
      return priorityComparison;
    }

    return left.label.localeCompare(right.label) || left.url.localeCompare(right.url);
  });
}

export async function readPersonalityRecords() {
  await ensureAssetDatabaseReady();
  const db = await getDatabase();
  const rows = await db<StoredPersonalityRow>("personalities")
    .select("*")
    .orderBy([
      { column: "name", order: "asc" },
      { column: "character_slug", order: "asc" }
    ]);

  return rows.map(mapRowToPersonalityRecord);
}

const DEFAULT_PERSONALITY_TOOL_EVENT_DETAILS = {
  description: "",
  name: "new_tool",
  parameters: {
    additionalProperties: false,
    properties: {},
    type: "object"
  },
  strict: true,
  type: "function"
} satisfies Record<string, unknown>;

function normalizePersonalityEventId(value: unknown) {
  const numericId = typeof value === "number" ? value : Number(String(value ?? "").trim());

  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new Error("Valid event id is required.");
  }

  return numericId;
}

function normalizePersonalityEventName(value: unknown) {
  const normalizedName = normalizeOptionalText(value);

  if (!normalizedName) {
    throw new Error("Event name is required.");
  }

  return normalizedName;
}

function normalizeZoneEventId(value: unknown) {
  const numericId = typeof value === "number" ? value : Number(String(value ?? "").trim());

  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new Error("Valid event id is required.");
  }

  return numericId;
}

function normalizeZoneEventName(value: unknown) {
  const normalizedName = normalizeOptionalText(value);

  if (!normalizedName) {
    throw new Error("Event name is required.");
  }

  return normalizedName;
}

function normalizeZoneName(value: unknown) {
  const normalizedName = normalizeOptionalText(value);

  if (!normalizedName) {
    throw new Error("Map name is required.");
  }

  return normalizedName;
}

function normalizeCharacterEventId(value: unknown) {
  const numericId = typeof value === "number" ? value : Number(String(value ?? "").trim());

  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new Error("Valid event id is required.");
  }

  return numericId;
}

function normalizeCharacterEventName(value: unknown) {
  const normalizedName = normalizeOptionalText(value);

  if (!normalizedName) {
    throw new Error("Event name is required.");
  }

  return normalizedName;
}

function normalizeCharacterName(value: unknown) {
  const normalizedName = normalizeOptionalText(value);

  if (!normalizedName) {
    throw new Error("Character name is required.");
  }

  return normalizedName;
}

function normalizeSpriteEventId(value: unknown) {
  const numericId = typeof value === "number" ? value : Number(String(value ?? "").trim());

  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new Error("Valid event id is required.");
  }

  return numericId;
}

function normalizeSpriteEventName(value: unknown) {
  const normalizedName = normalizeOptionalText(value);

  if (!normalizedName) {
    throw new Error("Event name is required.");
  }

  return normalizedName;
}

function normalizeSpriteStateId(value: unknown) {
  const normalizedName = normalizeUnderscoreName(String(value ?? "")).toLowerCase();

  if (!normalizedName) {
    throw new Error("State name is required.");
  }

  return normalizedName;
}

function createSpriteStateFileName(spriteFilename: string, stateId: string) {
  const normalizedStateId = normalizeSpriteStateId(stateId);
  const spriteStem = path.parse(sanitizeSpriteFilename(spriteFilename)).name;

  return sanitizeSpriteFilename(`${spriteStem}_${normalizedStateId}${SPRITE_IMAGE_EXTENSION}`);
}

function normalizePersonalityToolEventDetails(value: unknown, eventName: string) {
  const details = normalizePersonalityEventDetails(value);

  return {
    ...details,
    name: typeof details.name === "string" && details.name.trim() ? details.name.trim() : eventName,
    type: "function"
  };
}

function createUniquePersonalityEventName(existingRows: Array<Pick<StoredPersonalityEventRow, "name">>) {
  const takenNames = new Set(existingRows.map((row) => row.name.trim()).filter(Boolean));
  let nextName = "new_tool";
  let suffix = 2;

  while (takenNames.has(nextName)) {
    nextName = `new_tool_${suffix}`;
    suffix += 1;
  }

  return nextName;
}

async function assertPersonalityRecordExists(db: Awaited<ReturnType<typeof getDatabase>>, characterSlug: string) {
  const existingPersonality = await db<StoredPersonalityRow>("personalities")
    .select("character_slug")
    .first()
    .where({ character_slug: characterSlug });

  if (!existingPersonality) {
    throw new Error("Personality not found.");
  }
}

async function assertZoneEventsTableExists(db: Awaited<ReturnType<typeof getDatabase>>) {
  const hasZoneEventsTable = await db.schema.hasTable("zone_events");

  if (!hasZoneEventsTable) {
    throw new Error("zone_events table not found.");
  }
}

async function assertCharacterEventsTableExists(db: Awaited<ReturnType<typeof getDatabase>>) {
  const hasCharacterEventsTable = await db.schema.hasTable("character_events");

  if (!hasCharacterEventsTable) {
    throw new Error("character_events table not found.");
  }
}

async function readSpriteAssetId(
  db: Awaited<ReturnType<typeof getDatabase>>,
  spritePath: string,
  spriteFilename: string
) {
  const spriteRow = await readSpriteAssetRow(db, spritePath, spriteFilename);

  return spriteRow.id;
}

async function readSpriteAssetRow(
  db: Awaited<ReturnType<typeof getDatabase>>,
  spritePath: string,
  spriteFilename: string
) {
  const normalizedPath = normalizeTileLibraryPath(spritePath);
  const normalizedFilename = sanitizeSpriteFilename(spriteFilename);

  if (!normalizedPath) {
    throw new Error("Sprite path is required.");
  }

  const spriteRow = await db<StoredAssetRow>("map_tiles")
    .select("*")
    .first()
    .where({
      asset_key: getSpriteAssetKey(normalizedPath, normalizedFilename),
      asset_type: "sprite",
      deleted: false
    });

  if (!spriteRow) {
    throw new Error("Sprite not found.");
  }

  return spriteRow;
}

export async function readZoneEventRecords(zoneName: string): Promise<ZoneEventRecord[]> {
  await ensureAssetDatabaseReady();
  const normalizedZoneName = normalizeZoneName(zoneName);
  const db = await getDatabase();

  await assertZoneEventsTableExists(db);

  const rows = await db<StoredZoneEventRow>("zone_events")
    .select("*")
    .where({ zone_name: normalizedZoneName })
    .orderBy([
      { column: "enabled", order: "desc" },
      { column: "zone_event", order: "asc" },
      { column: "id", order: "asc" }
    ]);

  return rows.map(mapRowToZoneEventRecord);
}

export async function createZoneEventRecord(zoneName: string, zoneEvent: string) {
  await ensureAssetDatabaseReady();
  const normalizedZoneName = normalizeZoneName(zoneName);
  const normalizedZoneEvent = normalizeZoneEventName(zoneEvent);
  const db = await getDatabase();

  await assertZoneEventsTableExists(db);

  const existingEvent = await db<StoredZoneEventRow>("zone_events")
    .select("id")
    .first()
    .where({ zone_event: normalizedZoneEvent, zone_name: normalizedZoneName });

  if (existingEvent) {
    throw new Error(`Event ${normalizedZoneEvent} already exists for ${normalizedZoneName}.`);
  }

  const timestamp = new Date();
  const [createdEvent] = await db<StoredZoneEventRow>("zone_events")
    .insert({
      enabled: true,
      inserted_at: timestamp,
      lua_script: "return \"\"",
      updated_at: timestamp,
      zone_event: normalizedZoneEvent,
      zone_name: normalizedZoneName
    })
    .returning("*");

  if (!createdEvent) {
    throw new Error("Could not create zone event.");
  }

  return mapRowToZoneEventRecord(createdEvent);
}

export async function updateZoneEventRecord(
  zoneName: string,
  fields: Partial<ZoneEventRecord> & { id?: string | number }
) {
  await ensureAssetDatabaseReady();
  const normalizedZoneName = normalizeZoneName(zoneName);
  const eventId = normalizeZoneEventId(fields.id);
  const normalizedZoneEvent = normalizeZoneEventName(fields.zone_event);
  const luaScript = typeof fields.lua_script === "string" ? fields.lua_script : "";
  const enabled = fields.enabled !== false;
  const db = await getDatabase();

  await assertZoneEventsTableExists(db);

  const conflictingEvent = await db<StoredZoneEventRow>("zone_events")
    .select("id")
    .first()
    .where({ zone_event: normalizedZoneEvent, zone_name: normalizedZoneName })
    .whereNot({ id: eventId });

  if (conflictingEvent) {
    throw new Error(`Event ${normalizedZoneEvent} already exists for ${normalizedZoneName}.`);
  }

  const [updatedEvent] = await db<StoredZoneEventRow>("zone_events")
    .where({ id: eventId, zone_name: normalizedZoneName })
    .update({
      enabled,
      lua_script: luaScript,
      updated_at: new Date(),
      zone_event: normalizedZoneEvent
    })
    .returning("*");

  if (!updatedEvent) {
    throw new Error("Zone event not found.");
  }

  return mapRowToZoneEventRecord(updatedEvent);
}

export async function readCharacterEventRecords(characterName: string): Promise<CharacterEventRecord[]> {
  await ensureAssetDatabaseReady();
  const normalizedCharacterName = normalizeCharacterName(characterName);
  const db = await getDatabase();

  await assertCharacterEventsTableExists(db);

  const rows = await db<StoredCharacterEventRow>("character_events")
    .select("*")
    .where({ character_name: normalizedCharacterName })
    .orderBy([
      { column: "enabled", order: "desc" },
      { column: "character_event", order: "asc" },
      { column: "id", order: "asc" }
    ]);

  return rows.map(mapRowToCharacterEventRecord);
}

export async function createCharacterEventRecord(characterName: string, characterEvent: string) {
  await ensureAssetDatabaseReady();
  const normalizedCharacterName = normalizeCharacterName(characterName);
  const normalizedCharacterEvent = normalizeCharacterEventName(characterEvent);
  const db = await getDatabase();

  await assertCharacterEventsTableExists(db);

  const existingEvent = await db<StoredCharacterEventRow>("character_events")
    .select("id")
    .first()
    .where({ character_event: normalizedCharacterEvent, character_name: normalizedCharacterName });

  if (existingEvent) {
    throw new Error(`Event ${normalizedCharacterEvent} already exists for ${normalizedCharacterName}.`);
  }

  const timestamp = new Date();
  const [createdEvent] = await db<StoredCharacterEventRow>("character_events")
    .insert({
      character_event: normalizedCharacterEvent,
      character_name: normalizedCharacterName,
      enabled: true,
      inserted_at: timestamp,
      lua_script: "return \"\"",
      updated_at: timestamp
    })
    .returning("*");

  if (!createdEvent) {
    throw new Error("Could not create character event.");
  }

  return mapRowToCharacterEventRecord(createdEvent);
}

export async function updateCharacterEventRecord(
  characterName: string,
  fields: Partial<CharacterEventRecord> & { id?: string | number }
) {
  await ensureAssetDatabaseReady();
  const normalizedCharacterName = normalizeCharacterName(characterName);
  const eventId = normalizeCharacterEventId(fields.id);
  const normalizedCharacterEvent = normalizeCharacterEventName(fields.character_event);
  const luaScript = typeof fields.lua_script === "string" ? fields.lua_script : "";
  const enabled = fields.enabled !== false;
  const db = await getDatabase();

  await assertCharacterEventsTableExists(db);

  const conflictingEvent = await db<StoredCharacterEventRow>("character_events")
    .select("id")
    .first()
    .where({ character_event: normalizedCharacterEvent, character_name: normalizedCharacterName })
    .whereNot({ id: eventId });

  if (conflictingEvent) {
    throw new Error(`Event ${normalizedCharacterEvent} already exists for ${normalizedCharacterName}.`);
  }

  const [updatedEvent] = await db<StoredCharacterEventRow>("character_events")
    .where({ id: eventId, character_name: normalizedCharacterName })
    .update({
      character_event: normalizedCharacterEvent,
      enabled,
      lua_script: luaScript,
      updated_at: new Date()
    })
    .returning("*");

  if (!updatedEvent) {
    throw new Error("Character event not found.");
  }

  return mapRowToCharacterEventRecord(updatedEvent);
}

async function upsertDefaultSpriteState(
  db: Awaited<ReturnType<typeof getDatabase>>,
  spriteRow: Pick<StoredAssetRow, "file_name" | "id" | "image_data">
) {
  if (!spriteRow.file_name || !spriteRow.image_data?.length) {
    return null;
  }

  const timestamp = new Date();
  const [stateRow] = await db<StoredSpriteStateRow>("sprite_states")
    .insert({
      file_name: spriteRow.file_name,
      id: randomUUID(),
      image_data: spriteRow.image_data,
      inserted_at: timestamp,
      sprite_id: spriteRow.id,
      state_id: "default",
      state_metadata: JSON.stringify({}),
      updated_at: timestamp
    })
    .onConflict(["sprite_id", "state_id"])
    .merge({
      file_name: spriteRow.file_name,
      image_data: spriteRow.image_data,
      updated_at: timestamp
    })
    .returning("*");

  return stateRow ?? null;
}

async function ensureDefaultSpriteState(
  db: Awaited<ReturnType<typeof getDatabase>>,
  spriteRow: StoredAssetRow
) {
  const existingDefaultState = await db<StoredSpriteStateRow>("sprite_states")
    .select("*")
    .first()
    .where({ sprite_id: spriteRow.id, state_id: "default" });

  if (existingDefaultState) {
    return existingDefaultState;
  }

  return upsertDefaultSpriteState(db, spriteRow);
}

export async function readSpriteStateRecords(spritePath: string, spriteFilename: string): Promise<SpriteStateRecord[]> {
  await ensureAssetDatabaseReady();
  const db = await getDatabase();
  const spriteRow = await readSpriteAssetRow(db, spritePath, spriteFilename);

  await ensureDefaultSpriteState(db, spriteRow);

  const rows = await db<StoredSpriteStateRow>("sprite_states")
    .select("*")
    .where({ sprite_id: spriteRow.id })
    .orderByRaw("case when state_id = 'default' then 0 else 1 end asc")
    .orderBy("state_id", "asc");

  return rows.map(mapRowToSpriteStateRecord);
}

export async function createSpriteStateRecord(
  spritePath: string,
  spriteFilename: string,
  stateId: string,
  sourceStateId = "default"
) {
  await ensureAssetDatabaseReady();
  const normalizedStateId = normalizeSpriteStateId(stateId);

  if (normalizedStateId === "default") {
    throw new Error("The default state already exists.");
  }

  const db = await getDatabase();
  const spriteRow = await readSpriteAssetRow(db, spritePath, spriteFilename);
  const existingState = await db<StoredSpriteStateRow>("sprite_states")
    .select("id")
    .first()
    .where({ sprite_id: spriteRow.id, state_id: normalizedStateId });

  if (existingState) {
    throw new Error(`State ${normalizedStateId} already exists for this sprite.`);
  }

  await ensureDefaultSpriteState(db, spriteRow);

  const normalizedSourceStateId = normalizeSpriteStateId(sourceStateId || "default");
  const sourceState = await db<StoredSpriteStateRow>("sprite_states")
    .select("*")
    .first()
    .where({ sprite_id: spriteRow.id, state_id: normalizedSourceStateId });
  const sourceImageData = sourceState?.image_data ?? spriteRow.image_data;

  if (!sourceImageData?.length) {
    throw new Error("Sprite image is missing in the database.");
  }

  const timestamp = new Date();
  const [createdState] = await db<StoredSpriteStateRow>("sprite_states")
    .insert({
      file_name: createSpriteStateFileName(spriteFilename, normalizedStateId),
      id: randomUUID(),
      image_data: sourceImageData,
      inserted_at: timestamp,
      sprite_id: spriteRow.id,
      state_id: normalizedStateId,
      state_metadata: JSON.stringify({}),
      updated_at: timestamp
    })
    .returning("*");

  if (!createdState) {
    throw new Error("Could not create sprite state.");
  }

  return mapRowToSpriteStateRecord(createdState);
}

export async function saveSpriteStateImage(
  spritePath: string,
  spriteFilename: string,
  stateId: string,
  replacementFile: File
) {
  await ensureAssetDatabaseReady();
  const normalizedStateId = normalizeSpriteStateId(stateId);
  const normalizedFileName = sanitizeSpriteFilename(replacementFile.name);
  const imageBuffer = Buffer.from(await replacementFile.arrayBuffer());
  const db = await getDatabase();
  const spriteRow = await readSpriteAssetRow(db, spritePath, spriteFilename);
  const timestamp = new Date();
  const [stateRow] = await db<StoredSpriteStateRow>("sprite_states")
    .insert({
      file_name: normalizedFileName,
      id: randomUUID(),
      image_data: imageBuffer,
      inserted_at: timestamp,
      sprite_id: spriteRow.id,
      state_id: normalizedStateId,
      state_metadata: JSON.stringify({}),
      updated_at: timestamp
    })
    .onConflict(["sprite_id", "state_id"])
    .merge({
      file_name: normalizedFileName,
      image_data: imageBuffer,
      updated_at: timestamp
    })
    .returning("*");

  if (!stateRow) {
    throw new Error("Could not save sprite state image.");
  }

  if (normalizedStateId === "default") {
    await db<StoredAssetRow>("map_tiles")
      .where({ id: spriteRow.id })
      .update({
        file_name: spriteFilename,
        image_data: imageBuffer,
        updated_at: timestamp
      });
  }

  return mapRowToSpriteStateRecord(stateRow);
}

export async function readSpriteEventRecords(spritePath: string, spriteFilename: string): Promise<SpriteEventRecord[]> {
  await ensureAssetDatabaseReady();
  const db = await getDatabase();
  const spriteId = await readSpriteAssetId(db, spritePath, spriteFilename);

  const rows = await db<StoredSpriteEventRow>("sprite_events")
    .select("*")
    .where({ sprite_id: spriteId })
    .orderBy([
      { column: "enabled", order: "desc" },
      { column: "event_id", order: "asc" },
      { column: "id", order: "asc" }
    ]);

  return rows.map(mapRowToSpriteEventRecord);
}

export async function createSpriteEventRecord(spritePath: string, spriteFilename: string, eventId: string) {
  await ensureAssetDatabaseReady();
  const normalizedEventId = normalizeSpriteEventName(eventId);
  const db = await getDatabase();
  const spriteId = await readSpriteAssetId(db, spritePath, spriteFilename);
  const existingEvent = await db<StoredSpriteEventRow>("sprite_events")
    .select("id")
    .first()
    .where({ event_id: normalizedEventId, sprite_id: spriteId });

  if (existingEvent) {
    throw new Error(`Event ${normalizedEventId} already exists for this sprite.`);
  }

  const timestamp = new Date();
  const [createdEvent] = await db<StoredSpriteEventRow>("sprite_events")
    .insert({
      enabled: true,
      event_id: normalizedEventId,
      inserted_at: timestamp,
      lua_script: "return \"\"",
      sprite_id: spriteId,
      updated_at: timestamp
    })
    .returning("*");

  if (!createdEvent) {
    throw new Error("Could not create sprite event.");
  }

  return mapRowToSpriteEventRecord(createdEvent);
}

export async function updateSpriteEventRecord(
  spritePath: string,
  spriteFilename: string,
  fields: Partial<SpriteEventRecord> & { id?: string | number }
) {
  await ensureAssetDatabaseReady();
  const eventRecordId = normalizeSpriteEventId(fields.id);
  const normalizedEventId = normalizeSpriteEventName(fields.event_id);
  const luaScript = typeof fields.lua_script === "string" ? fields.lua_script : "";
  const enabled = fields.enabled !== false;
  const db = await getDatabase();
  const spriteId = await readSpriteAssetId(db, spritePath, spriteFilename);
  const conflictingEvent = await db<StoredSpriteEventRow>("sprite_events")
    .select("id")
    .first()
    .where({ event_id: normalizedEventId, sprite_id: spriteId })
    .whereNot({ id: eventRecordId });

  if (conflictingEvent) {
    throw new Error(`Event ${normalizedEventId} already exists for this sprite.`);
  }

  const [updatedEvent] = await db<StoredSpriteEventRow>("sprite_events")
    .where({ id: eventRecordId, sprite_id: spriteId })
    .update({
      enabled,
      event_id: normalizedEventId,
      lua_script: luaScript,
      updated_at: new Date()
    })
    .returning("*");

  if (!updatedEvent) {
    throw new Error("Sprite event not found.");
  }

  return mapRowToSpriteEventRecord(updatedEvent);
}

export async function readPersonalityEventRecords(characterSlug: string): Promise<PersonalityEventRecord[]> {
  await ensureAssetDatabaseReady();
  const normalizedCharacterSlug = assertPersonalitySlug(characterSlug);
  const db = await getDatabase();

  await assertPersonalityRecordExists(db, normalizedCharacterSlug);

  const rows = await db<StoredPersonalityEventRow>("personality_events")
    .select("*")
    .where({ personality_id: normalizedCharacterSlug })
    .orderBy([
      { column: "enabled", order: "desc" },
      { column: "name", order: "asc" },
      { column: "id", order: "asc" }
    ]);

  return rows.map(mapRowToPersonalityEventRecord);
}

export async function createPersonalityEventRecord(characterSlug: string) {
  await ensureAssetDatabaseReady();
  const normalizedCharacterSlug = assertPersonalitySlug(characterSlug);
  const db = await getDatabase();

  await assertPersonalityRecordExists(db, normalizedCharacterSlug);

  const existingRows = await db<StoredPersonalityEventRow>("personality_events")
    .select("name")
    .where({ personality_id: normalizedCharacterSlug });
  const eventName = createUniquePersonalityEventName(existingRows);
  const eventDetails = {
    ...DEFAULT_PERSONALITY_TOOL_EVENT_DETAILS,
    name: eventName
  };

  const [createdEvent] = await db<StoredPersonalityEventRow>("personality_events")
    .insert({
      enabled: true,
      event_details: eventDetails,
      event_type: "tool",
      inserted_at: db.fn.now() as unknown as Date | string,
      lua_script: "return \"\"",
      name: eventName,
      personality_id: normalizedCharacterSlug,
      response_context: "",
      updated_at: db.fn.now() as unknown as Date | string
    })
    .returning("*");

  if (!createdEvent) {
    throw new Error("Could not create personality event.");
  }

  return mapRowToPersonalityEventRecord(createdEvent);
}

export async function updatePersonalityEventRecord(
  characterSlug: string,
  fields: Partial<PersonalityEventRecord> & { id?: string | number }
) {
  await ensureAssetDatabaseReady();
  const normalizedCharacterSlug = assertPersonalitySlug(characterSlug);
  const eventId = normalizePersonalityEventId(fields.id);
  const eventType = fields.event_type ?? "tool";

  if (eventType !== "tool") {
    throw new Error('Event type must be "tool".');
  }

  const eventName = normalizePersonalityEventName(fields.name);
  const eventDetails = normalizePersonalityToolEventDetails(fields.event_details, eventName);
  const luaScript = typeof fields.lua_script === "string" ? fields.lua_script : "";
  const responseContext = typeof fields.response_context === "string" ? fields.response_context.trim() : "";
  const enabled = fields.enabled !== false;
  const db = await getDatabase();

  await assertPersonalityRecordExists(db, normalizedCharacterSlug);

  const [updatedEvent] = await db<StoredPersonalityEventRow>("personality_events")
    .where({ id: eventId, personality_id: normalizedCharacterSlug })
    .update({
      enabled,
      event_details: eventDetails,
      event_type: "tool",
      lua_script: luaScript,
      name: eventName,
      response_context: responseContext,
      updated_at: db.fn.now() as unknown as Date | string
    })
    .returning("*");

  if (!updatedEvent) {
    throw new Error("Personality event not found.");
  }

  return mapRowToPersonalityEventRecord(updatedEvent);
}

function createPersonalitySlugStem(name: string) {
  const normalizedStem = normalizeUnderscoreName(name).toLowerCase();

  if (!normalizedStem) {
    throw new Error("Personality name must contain at least one letter or number.");
  }

  return /^[a-z]/u.test(normalizedStem) ? normalizedStem : `personality_${normalizedStem}`;
}

function createUniquePersonalitySlug(existingSlugs: Iterable<string>, name: string) {
  const takenSlugs = new Set(
    Array.from(existingSlugs, (slug) => slug.trim().toLowerCase()).filter(Boolean)
  );
  const baseSlug = createPersonalitySlugStem(name);
  let nextSlug = baseSlug;
  let suffix = 2;

  while (takenSlugs.has(nextSlug)) {
    nextSlug = `${baseSlug}_${suffix}`;
    suffix += 1;
  }

  return nextSlug;
}

function assertPersonalitySlug(value: string) {
  const normalizedValue = value.trim();

  if (!/^[a-z][a-z0-9_]*$/u.test(normalizedValue)) {
    throw new Error("character_slug must be lowercase snake_case.");
  }

  return normalizedValue;
}

function normalizePersonalityTextInput(
  value: unknown,
  fieldName: string,
  required = false
) {
  const normalizedValue = normalizeOptionalText(value);

  if (required && !normalizedValue) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalizedValue;
}

function normalizePersonalityIntegerInput(
  value: unknown,
  fieldName: string,
  options: { allowNull?: boolean; max?: number; min?: number } = {}
) {
  if (value == null) {
    if (options.allowNull) {
      return null;
    }

    throw new Error(`${fieldName} is required.`);
  }

  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer.`);
  }

  if (typeof options.min === "number" && value < options.min) {
    throw new Error(`${fieldName} must be at least ${options.min}.`);
  }

  if (typeof options.max === "number" && value > options.max) {
    throw new Error(`${fieldName} must be at most ${options.max}.`);
  }

  return value;
}

async function ComputePromptBase(personality: PersonalityRecord) {
  const template = (await readFile(PERSONALITY_BASE_PROMPT_PATH, "utf8")).trim();
  const sections = PERSONALITY_PROMPT_SECTION_FIELDS
    .map((section) => {
      const lines = section.fields
        .filter((fieldConfig) => !PERSONALITY_PROMPT_SYSTEM_FIELDS.has(fieldConfig.field))
        .map((fieldConfig) => {
          const value = personality[fieldConfig.field];

          if (!hasPromptBaseValue(value)) {
            return "";
          }

          return formatPromptBaseValue(fieldConfig.label, value, fieldConfig.type);
        })
        .filter(Boolean);

      if (!lines.length) {
        return "";
      }

      return [section.title, ...lines].join("\n");
    })
    .filter(Boolean);

  return [template, ...sections].filter(Boolean).join("\n\n");
}

async function saveComputedPromptBase(
  db: Awaited<ReturnType<typeof getDatabase>>,
  personality: PersonalityRecord
) {
  const computedPromptBase = await ComputePromptBase(personality);

  if (computedPromptBase === (personality.llm_prompt_base ?? "")) {
    return personality;
  }

  const [updatedRow] = await db<StoredPersonalityRow>("personalities")
    .where({ character_slug: personality.character_slug })
    .update({
      llm_prompt_base: computedPromptBase,
      updated_at: db.fn.now() as unknown as Date | string
    })
    .returning("*");

  if (!updatedRow) {
    throw new Error("Could not save personality prompt base.");
  }

  return mapRowToPersonalityRecord(updatedRow);
}

function formatPersonalityPromptValue(value: PersonalityRecord[keyof PersonalityRecord]) {
  if (typeof value === "string") {
    const normalizedValue = value.trim();
    return normalizedValue || "unknown";
  }

  if (typeof value === "number") {
    return value;
  }

  if (value == null) {
    return "unknown";
  }

  return String(value);
}

function buildRandomPersonalityPrompt(personality: PersonalityRecord, template: string, schemaPrompt: string) {
  const detailFields = {
    character_slug: personality.character_slug,
    name: personality.name,
    ...Object.fromEntries(
      PERSONALITY_LLM_GENERATED_FIELDS
        .filter((field) => field !== "name")
        .map((field) => [field, formatPersonalityPromptValue(personality[field])])
    )
  };

  return [
    template.trim(),
    "",
    `Character name: ${personality.name}`,
    `Character slug: ${personality.character_slug}`,
    "",
    "Currently known details, with unknown values called out explicitly:",
    JSON.stringify(detailFields, null, 2),
    "",
    "Return only a JSON object that matches this schema exactly. Do not wrap the JSON in markdown fences.",
    schemaPrompt.trim(),
    "",
    "Use the provided name exactly as the character's name. Fill in every field in the schema. Use null only when a text or age field is truly unknown."
  ].join("\n");
}

function coerceGeneratedInteger(
  value: unknown,
  fallbackValue: number,
  options: { max?: number; min?: number } = {}
) {
  const rawValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(rawValue)) {
    return fallbackValue;
  }

  let nextValue = Math.round(rawValue);

  if (typeof options.min === "number" && nextValue < options.min) {
    nextValue = options.min;
  }

  if (typeof options.max === "number" && nextValue > options.max) {
    nextValue = options.max;
  }

  return nextValue;
}

function normalizeGeneratedGender(
  value: unknown,
  fallbackValue: PersonalityRecord["gender"]
): PersonalityRecord["gender"] {
  if (typeof value !== "string") {
    return fallbackValue;
  }

  const normalizedValue = value.trim().toUpperCase();

  return normalizedValue === "M" || normalizedValue === "F" || normalizedValue === "NB"
    ? normalizedValue
    : fallbackValue;
}

function extractOpenRouterResponseText(content: unknown) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }

      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }

      return "";
    })
    .join("\n")
    .trim();
}

function extractJsonObjectFromText(responseText: string) {
  const normalizedText = responseText.trim();

  if (!normalizedText) {
    throw new Error("OpenRouter returned an empty response.");
  }

  try {
    return JSON.parse(normalizedText) as unknown;
  } catch {
    // Fall through to fenced and substring extraction.
  }

  const fencedMatch = normalizedText.match(/```(?:json)?\s*([\s\S]*?)```/iu);

  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1]) as unknown;
    } catch {
      // Fall through to substring extraction.
    }
  }

  const objectStartIndex = normalizedText.indexOf("{");
  const objectEndIndex = normalizedText.lastIndexOf("}");

  if (objectStartIndex !== -1 && objectEndIndex !== -1 && objectEndIndex > objectStartIndex) {
    return JSON.parse(normalizedText.slice(objectStartIndex, objectEndIndex + 1)) as unknown;
  }

  throw new Error("OpenRouter did not return parseable JSON.");
}

function extractOpenRouterErrorDetails(value: unknown): string[] {
  if (typeof value === "string") {
    const normalizedValue = value.trim();
    return normalizedValue ? [normalizedValue] : [];
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const detailKeys = [
    "message",
    "code",
    "raw",
    "provider_name",
    "metadata",
    "provider_error",
    "details"
  ] as const;

  return detailKeys.flatMap((key) => extractOpenRouterErrorDetails(record[key]));
}

function buildOpenRouterErrorMessage(responseBody: Record<string, unknown>, responseText: string, status: number) {
  const details = Array.from(
    new Set([
      ...extractOpenRouterErrorDetails(responseBody.error),
      ...extractOpenRouterErrorDetails(responseBody),
      responseText.trim()
    ].filter(Boolean))
  );

  if (!details.length) {
    return `OpenRouter request failed (${status}).`;
  }

  const [primaryDetail, ...extraDetails] = details;
  const extraDetailText = extraDetails.filter((detail) => detail !== primaryDetail).join(" | ");

  return extraDetailText
    ? `OpenRouter request failed (${status}): ${primaryDetail} | ${extraDetailText}`
    : `OpenRouter request failed (${status}): ${primaryDetail}`;
}

function getPersonalityProfileImageUrl(characterSlug: string) {
  const normalizedCharacterSlug = assertPersonalitySlug(characterSlug);
  const bucketRoot = getR2Bucket();

  if (!bucketRoot) {
    throw new Error("R2_BUCKET is not configured.");
  }

  return new URL(`personalities/profile/${normalizedCharacterSlug}.jpg`, `${bucketRoot}/`).toString();
}

function getPersonalityProfileImageProxyUrl(characterSlug: string, updatedAt?: Date | string | null) {
  const normalizedCharacterSlug = assertPersonalitySlug(characterSlug);
  const basePath = `${PERSONALITY_PROFILE_IMAGE_ROUTE_PREFIX}/${normalizedCharacterSlug}.jpg`;

  if (!updatedAt) {
    return basePath;
  }

  const serializedUpdatedAt = serializeStoredTimestamp(updatedAt);
  return `${basePath}?v=${encodeURIComponent(serializedUpdatedAt)}`;
}

function getStoredPersonalityProfileImageUrl(characterSlug: string) {
  return getPersonalityProfileImageProxyUrl(characterSlug);
}

function isManagedPersonalityProfileImageUrl(characterSlug: string, imageUrl: string) {
  const normalizedImageUrl = imageUrl.trim();

  if (!normalizedImageUrl) {
    return false;
  }

  const directStorageUrl = getPersonalityProfileImageUrl(characterSlug);
  const proxyUrl = getPersonalityProfileImageProxyUrl(characterSlug);

  return normalizedImageUrl === directStorageUrl || normalizedImageUrl.startsWith(proxyUrl);
}

function createHexSha256(value: Buffer | Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function createHmacBuffer(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function buildR2SignedHeaders(
  objectUrl: URL,
  method: "GET" | "PUT",
  body: Buffer,
  contentType?: string | null
) {
  const accessKeyId = getR2UserAccessKey();
  const secretAccessKey = getR2UserSecret();

  if (!accessKeyId) {
    throw new Error("R2_USER_ACCESSKEY is not configured.");
  }

  if (!secretAccessKey) {
    throw new Error("R2_USER_SECRET is not configured.");
  }

  const now = new Date();
  const isoTimestamp = now.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
  const dateStamp = isoTimestamp.slice(0, 8);
  const payloadHash = createHexSha256(body);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const canonicalHeaders = new Map<string, string>([
    ["host", objectUrl.host],
    ["x-amz-content-sha256", payloadHash],
    ["x-amz-date", isoTimestamp]
  ]);

  if (method === "PUT" && contentType) {
    canonicalHeaders.set("content-type", contentType);
  }

  const signedHeaderNames = [...canonicalHeaders.keys()].sort();
  const canonicalHeaderText = signedHeaderNames
    .map((headerName) => `${headerName}:${canonicalHeaders.get(headerName) ?? ""}`.trim())
    .join("\n");
  const canonicalRequest = [
    method,
    objectUrl.pathname,
    objectUrl.searchParams.toString(),
    `${canonicalHeaderText}\n`,
    signedHeaderNames.join(";"),
    payloadHash
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    isoTimestamp,
    credentialScope,
    createHexSha256(canonicalRequest)
  ].join("\n");
  const signingKey = createHmacBuffer(
    createHmacBuffer(
      createHmacBuffer(createHmacBuffer(`AWS4${secretAccessKey}`, dateStamp), "auto"),
      "s3"
    ),
    "aws4_request"
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const headers = new Headers({
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderNames.join(";")}, Signature=${signature}`,
    Host: objectUrl.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": isoTimestamp
  });

  if (method === "PUT" && contentType) {
    headers.set("Content-Type", contentType);
  }

  return headers;
}

async function fetchR2Object(
  objectUrl: string,
  options: {
    body?: Buffer;
    contentType?: string | null;
    method: "GET" | "PUT";
  }
) {
  const normalizedUrl = new URL(objectUrl);
  const requestBody = options.body ?? Buffer.alloc(0);
  const headers = buildR2SignedHeaders(normalizedUrl, options.method, requestBody, options.contentType);

  try {
    return await fetch(normalizedUrl, {
      body: options.method === "PUT" ? new Uint8Array(requestBody) : undefined,
      headers,
      method: options.method
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch failed";
    throw new Error(`Request to R2 failed: ${message}`);
  }
}

async function uploadPersonalityProfileImageToR2(characterSlug: string, imageBuffer: Buffer) {
  const bucketRoot = getR2Bucket();

  if (!bucketRoot) {
    throw new Error("R2_BUCKET is not configured.");
  }

  const token = getR2Token();

  if (!token && !getR2UserAccessKey()) {
    throw new Error("R2 credentials are not configured.");
  }

  const targetUrl = getPersonalityProfileImageUrl(characterSlug);
  const response = await fetchR2Object(targetUrl, {
    body: imageBuffer,
    contentType: "image/jpeg",
    method: "PUT"
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(responseText.trim() || `Could not upload profile image to R2 (${response.status}).`);
  }

  return targetUrl;
}

export async function downloadPersonalityProfileImage(characterSlug: string) {
  const normalizedCharacterSlug = assertPersonalitySlug(characterSlug);
  const targetUrl = getPersonalityProfileImageUrl(normalizedCharacterSlug);
  const response = await fetchR2Object(targetUrl, { method: "GET" });

  if (response.status === 404) {
    throw new Error("Profile image not found.");
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(responseText.trim() || `Could not download profile image from R2 (${response.status}).`);
  }

  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type")?.trim() || "image/jpeg",
    etag: response.headers.get("etag")?.trim() || null,
    lastModified: response.headers.get("last-modified")?.trim() || null
  };
}

async function loadPersonalityRandomizeModelOptions() {
  const fileContents = await readFile(PERSONALITY_MODEL_OPTIONS_PATH, "utf8");
  const parsedContents = JSON.parse(fileContents) as unknown;

  if (!Array.isArray(parsedContents)) {
    throw new Error("Personality model options must be a JSON array.");
  }

  const modelOptions = parsedContents.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );

  if (!modelOptions.length) {
    throw new Error("No personality model options were configured.");
  }

  return modelOptions;
}

function buildGeneratedPersonalityUpdates(
  parsedResponse: unknown,
  personality: PersonalityRecord
): Partial<Pick<PersonalityRecord, GeneratedPersonalityField>> {
  if (!parsedResponse || typeof parsedResponse !== "object" || Array.isArray(parsedResponse)) {
    throw new Error("OpenRouter returned JSON, but it was not a personality object.");
  }

  const responseObject = parsedResponse as Record<string, unknown>;

  return {
    accent: normalizeGeneratedTextValue(responseObject.accent, personality.accent),
    age:
      responseObject.age === null
        ? null
        : responseObject.age === undefined
          ? personality.age
          : coerceGeneratedInteger(responseObject.age, personality.age ?? 0, { min: 0 }),
    aggression: coerceGeneratedInteger(responseObject.aggression, personality.aggression, { max: 100, min: 1 }),
    altruism: coerceGeneratedInteger(responseObject.altruism, personality.altruism, { max: 100, min: 1 }),
    areas_of_expertise: normalizeGeneratedTextValue(
      responseObject.areas_of_expertise,
      personality.areas_of_expertise
    ),
    backstory: normalizeGeneratedTextValue(responseObject.backstory, personality.backstory),
    base_hp: coerceGeneratedInteger(responseObject.base_hp, personality.base_hp, { min: 1 }),
    clothing_style: normalizeGeneratedTextValue(responseObject.clothing_style, personality.clothing_style),
    courage: coerceGeneratedInteger(responseObject.courage, personality.courage, { max: 100, min: 1 }),
    distinguishing_feature: normalizeGeneratedTextValue(
      responseObject.distinguishing_feature,
      personality.distinguishing_feature
    ),
    emotional_range: normalizeGeneratedTextValue(responseObject.emotional_range, personality.emotional_range),
    family_description: normalizeGeneratedTextValue(
      responseObject.family_description,
      personality.family_description
    ),
    fears: normalizeGeneratedTextValue(responseObject.fears, personality.fears),
    gender: normalizeGeneratedGender(responseObject.gender, personality.gender),
    goals: normalizeGeneratedTextValue(responseObject.goals, personality.goals),
    gold: coerceGeneratedInteger(responseObject.gold, personality.gold, { min: 0 }),
    goodness: coerceGeneratedInteger(responseObject.goodness, personality.goodness, { max: 100, min: 1 }),
    hidden_desires: normalizeGeneratedTextValue(responseObject.hidden_desires, personality.hidden_desires),
    honesty: coerceGeneratedInteger(responseObject.honesty, personality.honesty, { max: 100, min: 1 }),
    impulsiveness: coerceGeneratedInteger(responseObject.impulsiveness, personality.impulsiveness, {
      max: 100,
      min: 1
    }),
    loyalty: coerceGeneratedInteger(responseObject.loyalty, personality.loyalty, { max: 100, min: 1 }),
    mannerisms: normalizeGeneratedTextValue(responseObject.mannerisms, personality.mannerisms),
    name: normalizeGeneratedTextValue(responseObject.name, personality.name) ?? personality.name,
    other_world_knowledge: normalizeGeneratedTextValue(
      responseObject.other_world_knowledge,
      personality.other_world_knowledge
    ),
    optimism: coerceGeneratedInteger(responseObject.optimism, personality.optimism, { max: 100, min: 1 }),
    physical_description: normalizeGeneratedTextValue(
      responseObject.physical_description,
      personality.physical_description
    ),
    reputation: coerceGeneratedInteger(responseObject.reputation, personality.reputation, { max: 100, min: 1 }),
    role: normalizeGeneratedTextValue(responseObject.role, personality.role),
    secrets_you_know: normalizeGeneratedTextValue(responseObject.secrets_you_know, personality.secrets_you_know),
    smalltalk_topics_enjoyed: normalizeGeneratedTextValue(
      responseObject.smalltalk_topics_enjoyed,
      personality.smalltalk_topics_enjoyed
    ),
    sociability: coerceGeneratedInteger(responseObject.sociability, personality.sociability, { max: 100, min: 1 }),
    specialties: normalizeGeneratedTextValue(responseObject.specialties, personality.specialties),
    speech_pattern: normalizeGeneratedTextValue(responseObject.speech_pattern, personality.speech_pattern),
    speech_style: normalizeGeneratedTextValue(responseObject.speech_style, personality.speech_style),
    summary: normalizeGeneratedTextValue(responseObject.summary, personality.summary),
    temperament: normalizeGeneratedTextValue(responseObject.temperament, personality.temperament),
    things_you_can_share: normalizeGeneratedTextValue(
      responseObject.things_you_can_share,
      personality.things_you_can_share
    ),
    titles: normalizeGeneratedTextValue(responseObject.titles, personality.titles),
    voice_id: normalizeGeneratedTextValue(responseObject.voice_id, personality.voice_id)
  };
}

async function readStoredPersonalityRowBySlug(characterSlug: string) {
  await ensureAssetDatabaseReady();
  const normalizedCharacterSlug = assertPersonalitySlug(characterSlug);
  const db = await getDatabase();
  const row = await db<StoredPersonalityRow>("personalities")
    .select("*")
    .first()
    .where({ character_slug: normalizedCharacterSlug });

  if (!row) {
    throw new Error("Personality not found.");
  }

  return row;
}

export async function prepareRandomPersonalityPrompt(characterSlug: string) {
  const [personalityRow, promptTemplateBuffer, schemaPromptBuffer, modelOptions] = await Promise.all([
    readStoredPersonalityRowBySlug(characterSlug),
    readFile(RANDOM_PERSONALITY_PROMPT_PATH, "utf8"),
    readFile(PERSONALITY_SCHEMA_PROMPT_PATH, "utf8"),
    loadPersonalityRandomizeModelOptions()
  ]);

  const personality = mapRowToPersonalityRecord(personalityRow);
  const prompt = buildRandomPersonalityPrompt(personality, promptTemplateBuffer, schemaPromptBuffer);

  return {
    character_slug: personality.character_slug,
    defaultModel: modelOptions[0],
    modelOptions,
    prompt
  };
}

export async function randomizePersonalityThroughOpenRouter(characterSlug: string, prompt: string, model: string) {
  const normalizedPrompt = prompt.trim();
  const normalizedModel = model.trim();

  if (!normalizedPrompt) {
    throw new Error("Prompt is required.");
  }

  if (!normalizedModel) {
    throw new Error("Model is required.");
  }

  const apiKey = getOpenRouterApiKey();

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const allowedModels = await loadPersonalityRandomizeModelOptions();

  if (!allowedModels.includes(normalizedModel)) {
    throw new Error("Selected model is not in the configured personality model options.");
  }

  const personality = mapRowToPersonalityRecord(await readStoredPersonalityRowBySlug(characterSlug));
  let response: Response;

  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      body: JSON.stringify({
        messages: [{ content: normalizedPrompt, role: "user" }],
        model: normalizedModel,
        response_format: { type: "json_object" }
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch failed";
    throw new Error(`Request to OpenRouter failed: ${message}`);
  }

  const responseText = await response.text().catch(() => "");
  let responseBody: Record<string, unknown> = {};

  if (responseText.trim()) {
    try {
      responseBody = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      responseBody = {};
    }
  }

  if (!response.ok) {
    throw new Error(buildOpenRouterErrorMessage(responseBody, responseText, response.status));
  }

  const choices = Array.isArray(responseBody.choices) ? responseBody.choices : [];
  const firstChoice = choices[0];
  const messageContent =
    firstChoice && typeof firstChoice === "object" && "message" in firstChoice && firstChoice.message
      ? (firstChoice.message as Record<string, unknown>).content
      : "";
  const generatedText = extractOpenRouterResponseText(messageContent);
  const parsedResponse = extractJsonObjectFromText(generatedText);
  const generatedUpdates = buildGeneratedPersonalityUpdates(parsedResponse, personality);

  return updatePersonalityRecord(personality.character_slug, generatedUpdates);
}

export async function uploadPersonalityProfileImage(characterSlug: string, file: File) {
  const normalizedCharacterSlug = assertPersonalitySlug(characterSlug);
  const normalizedFileName = file.name.trim().toLowerCase();
  const fileExtension = path.extname(normalizedFileName);

  if (!file.type.startsWith("image/") && !IMAGE_EXTENSIONS.has(fileExtension)) {
    throw new Error("Profile image uploads require a PNG, JPG, WEBP, or GIF file.");
  }

  let jpegBuffer: Buffer;

  try {
    jpegBuffer = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: "warning" })
      .rotate()
      .resize(256, 256, {
        fit: "cover",
        kernel: sharp.kernel.mks2021,
        position: "centre"
      })
      .jpeg({
        force: true,
        mozjpeg: true,
        quality: 88
      })
      .toBuffer();
  } catch {
    throw new Error("Could not decode the uploaded profile image.");
  }

  const imageUrl = await uploadPersonalityProfileImageToR2(normalizedCharacterSlug, jpegBuffer);
  return updatePersonalityRecord(normalizedCharacterSlug, {
    custom_profile_pic: getStoredPersonalityProfileImageUrl(normalizedCharacterSlug)
  });
}

export async function createPersonalityRecord(name: string) {
  await ensureAssetDatabaseReady();
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error("Personality name is required.");
  }

  const db = await getDatabase();
  const existingRows = await db<StoredPersonalityRow>("personalities").select("character_slug");
  const characterSlug = createUniquePersonalitySlug(
    existingRows.map((row) => row.character_slug),
    normalizedName
  );

  const [createdPersonality] = await db<StoredPersonalityRow>("personalities")
    .insert({
      aggression: 50,
      altruism: 50,
      base_hp: 100,
      character_slug: characterSlug,
      courage: 50,
      gender: "NB",
      gold: 0,
      goodness: 50,
      honesty: 50,
      impulsiveness: 50,
      inserted_at: db.fn.now() as unknown as Date | string,
      loyalty: 50,
      name: normalizedName,
      optimism: 50,
      reputation: 50,
      sociability: 50,
      updated_at: db.fn.now() as unknown as Date | string
    })
    .returning("*");

  if (!createdPersonality) {
    throw new Error("Could not create personality.");
  }

  return saveComputedPromptBase(db, mapRowToPersonalityRecord(createdPersonality));
}

export async function updatePersonalityRecord(
  characterSlug: string,
  fields: Partial<PersonalityRecord>
) {
  await ensureAssetDatabaseReady();
  const normalizedCharacterSlug = assertPersonalitySlug(characterSlug);
  const db = await getDatabase();
  const existingPersonality = await db<StoredPersonalityRow>("personalities")
    .select("*")
    .first()
    .where({ character_slug: normalizedCharacterSlug });

  if (!existingPersonality) {
    throw new Error("Personality not found.");
  }

  const updates: Partial<StoredPersonalityRow> = {};

  if ("name" in fields) {
    updates.name = normalizePersonalityTextInput(fields.name, "Name", true) ?? "";
  }

  if ("voice_id" in fields) {
    updates.voice_id = normalizePersonalityTextInput(fields.voice_id, "Voice ID");
  }

  if ("chat_provider" in fields) {
    updates.chat_provider = normalizePersonalityTextInput(fields.chat_provider, "Chat Provider");
  }

  if ("chat_model" in fields) {
    updates.chat_model = normalizePersonalityTextInput(fields.chat_model, "Chat Model");
  }

  if ("role" in fields) {
    updates.role = normalizePersonalityTextInput(fields.role, "Role");
  }

  if ("titles" in fields) {
    updates.titles = normalizePersonalityTextInput(fields.titles, "Titles");
  }

  if ("gender" in fields) {
    if (fields.gender !== "M" && fields.gender !== "F" && fields.gender !== "NB") {
      throw new Error('Gender must be one of "M", "F", or "NB".');
    }

    updates.gender = fields.gender;
  }

  if ("age" in fields) {
    updates.age = normalizePersonalityIntegerInput(fields.age, "Age", { allowNull: true, min: 0 });
  }

  if ("base_hp" in fields) {
    updates.base_hp = normalizePersonalityIntegerInput(fields.base_hp, "Base HP", { min: 1 });
  }

  if ("gold" in fields) {
    updates.gold = normalizePersonalityIntegerInput(fields.gold, "Gold", { min: 0 });
  }

  if ("reputation" in fields) {
    updates.reputation = normalizePersonalityIntegerInput(fields.reputation, "Reputation", {
      max: 100,
      min: 1
    });
  }

  if ("aggression" in fields) {
    updates.aggression = normalizePersonalityIntegerInput(fields.aggression, "Aggression", {
      max: 100,
      min: 1
    });
  }

  if ("altruism" in fields) {
    updates.altruism = normalizePersonalityIntegerInput(fields.altruism, "Altruism", {
      max: 100,
      min: 1
    });
  }

  if ("honesty" in fields) {
    updates.honesty = normalizePersonalityIntegerInput(fields.honesty, "Honesty", {
      max: 100,
      min: 1
    });
  }

  if ("courage" in fields) {
    updates.courage = normalizePersonalityIntegerInput(fields.courage, "Courage", {
      max: 100,
      min: 1
    });
  }

  if ("impulsiveness" in fields) {
    updates.impulsiveness = normalizePersonalityIntegerInput(fields.impulsiveness, "Impulsiveness", {
      max: 100,
      min: 1
    });
  }

  if ("optimism" in fields) {
    updates.optimism = normalizePersonalityIntegerInput(fields.optimism, "Optimism", {
      max: 100,
      min: 1
    });
  }

  if ("sociability" in fields) {
    updates.sociability = normalizePersonalityIntegerInput(fields.sociability, "Sociability", {
      max: 100,
      min: 1
    });
  }

  if ("loyalty" in fields) {
    updates.loyalty = normalizePersonalityIntegerInput(fields.loyalty, "Loyalty", {
      max: 100,
      min: 1
    });
  }

  if ("goodness" in fields) {
    updates.goodness = normalizePersonalityIntegerInput(fields.goodness, "Goodness", {
      max: 100,
      min: 1
    });
  }

  if ("temperament" in fields) {
    updates.temperament = normalizePersonalityTextInput(fields.temperament, "Temperament");
  }

  if ("emotional_range" in fields) {
    updates.emotional_range = normalizePersonalityTextInput(fields.emotional_range, "Emotional range");
  }

  if ("speech_pattern" in fields) {
    updates.speech_pattern = normalizePersonalityTextInput(fields.speech_pattern, "Speech pattern");
  }

  if ("goals" in fields) {
    updates.goals = normalizePersonalityTextInput(fields.goals, "Goals");
  }

  if ("backstory" in fields) {
    updates.backstory = normalizePersonalityTextInput(fields.backstory, "Backstory");
  }

  if ("hidden_desires" in fields) {
    updates.hidden_desires = normalizePersonalityTextInput(fields.hidden_desires, "Hidden desires");
  }

  if ("fears" in fields) {
    updates.fears = normalizePersonalityTextInput(fields.fears, "Fears");
  }

  if ("family_description" in fields) {
    updates.family_description = normalizePersonalityTextInput(fields.family_description, "Family description");
  }

  if ("areas_of_expertise" in fields) {
    updates.areas_of_expertise = normalizePersonalityTextInput(fields.areas_of_expertise, "Areas of expertise");
  }

  if ("specialties" in fields) {
    updates.specialties = normalizePersonalityTextInput(fields.specialties, "Specialties");
  }

  if ("secrets_you_know" in fields) {
    updates.secrets_you_know = normalizePersonalityTextInput(fields.secrets_you_know, "Secrets you know");
  }

  if ("things_you_can_share" in fields) {
    updates.things_you_can_share = normalizePersonalityTextInput(
      fields.things_you_can_share,
      "Things you can share"
    );
  }

  if ("smalltalk_topics_enjoyed" in fields) {
    updates.smalltalk_topics_enjoyed = normalizePersonalityTextInput(
      fields.smalltalk_topics_enjoyed,
      "Smalltalk topics enjoyed"
    );
  }

  if ("other_world_knowledge" in fields) {
    updates.other_world_knowledge = normalizePersonalityTextInput(
      fields.other_world_knowledge,
      "Other world knowledge"
    );
  }

  if ("physical_description" in fields) {
    updates.physical_description = normalizePersonalityTextInput(fields.physical_description, "Physical description");
  }

  if ("distinguishing_feature" in fields) {
    updates.distinguishing_feature = normalizePersonalityTextInput(
      fields.distinguishing_feature,
      "Distinguishing feature"
    );
  }

  if ("speech_style" in fields) {
    updates.speech_style = normalizePersonalityTextInput(fields.speech_style, "Speech style");
  }

  if ("accent" in fields) {
    updates.accent = normalizePersonalityTextInput(fields.accent, "Accent");
  }

  if ("mannerisms" in fields) {
    updates.mannerisms = normalizePersonalityTextInput(fields.mannerisms, "Mannerisms");
  }

  if ("clothing_style" in fields) {
    updates.clothing_style = normalizePersonalityTextInput(fields.clothing_style, "Clothing style");
  }

  if ("custom_profile_pic" in fields) {
    updates.custom_profile_pic = normalizePersonalityTextInput(fields.custom_profile_pic, "Custom profile pic");
  }

  if ("summary" in fields) {
    updates.summary = normalizePersonalityTextInput(fields.summary, "Summary");
  }

  if (!Object.keys(updates).length) {
    throw new Error("At least one personality field is required.");
  }

  updates.updated_at = db.fn.now() as unknown as Date | string;

  const [updatedPersonality] = await db<StoredPersonalityRow>("personalities")
    .where({ character_slug: normalizedCharacterSlug })
    .update(updates)
    .returning("*");

  if (!updatedPersonality) {
    throw new Error("Could not update personality.");
  }

  return saveComputedPromptBase(db, mapRowToPersonalityRecord(updatedPersonality));
}

export async function readItemRecords() {
  await ensureAssetDatabaseReady();
  const hasItemsTable = await ensureItemsDeletedColumn();

  if (!hasItemsTable) {
    return [] as ItemRecord[];
  }

  const db = await getDatabase();

  const rows = await db<StoredItemRow>("items")
    .select("*")
    .where({ deleted: false })
    .orderBy([
      { column: "name", order: "asc" },
      { column: "id", order: "asc" }
    ]);

  return rows.map(mapRowToItemRecord);
}

export async function deleteItemRecord(itemId: number) {
  await ensureAssetDatabaseReady();
  const hasItemsTable = await ensureItemsDeletedColumn();

  if (!hasItemsTable) {
    throw new Error("Items table not found.");
  }

  const normalizedItemId = Math.round(itemId);

  if (!Number.isFinite(normalizedItemId) || normalizedItemId <= 0) {
    throw new Error("Valid item id is required.");
  }

  const db = await getDatabase();
  const existingItem = await db<StoredItemRow>("items")
    .select("id")
    .first()
    .where({ id: normalizedItemId, deleted: false });

  if (!existingItem) {
    throw new Error("Item not found.");
  }

  await db("items").where({ id: normalizedItemId }).update({
    deleted: true,
    updated_at: db.fn.now()
  });

  return { id: normalizedItemId };
}

export async function moveItemRecordCategory(itemId: number, nextItemType: string) {
  await ensureAssetDatabaseReady();
  const hasItemsTable = await ensureItemsDeletedColumn();

  if (!hasItemsTable) {
    throw new Error("Items table not found.");
  }

  const normalizedItemId = Math.round(itemId);
  const normalizedItemType = nextItemType.trim();

  if (!Number.isFinite(normalizedItemId) || normalizedItemId <= 0) {
    throw new Error("Valid item id is required.");
  }

  if (!normalizedItemType) {
    throw new Error("Item category is required.");
  }

  const db = await getDatabase();
  const existingItem = await db<StoredItemRow>("items")
    .select("*")
    .first()
    .where({ id: normalizedItemId, deleted: false });

  if (!existingItem) {
    throw new Error("Item not found.");
  }

  const [updatedItem] = await db<StoredItemRow>("items")
    .where({ id: normalizedItemId })
    .update({
      item_type: normalizedItemType,
      updated_at: db.fn.now()
    })
    .returning("*");

  if (!updatedItem) {
    throw new Error("Could not update item category.");
  }

  return mapRowToItemRecord(updatedItem);
}

function mapApiItemToItemRecord(item: Partial<StoredItemRow>) {
  const normalizedId = Math.round(normalizeOptionalNumber(item.id) ?? 0);
  const normalizedName = typeof item.name === "string" && item.name.trim() ? item.name.trim() : "New Item";
  const normalizedItemType =
    typeof item.item_type === "string" && item.item_type.trim() ? item.item_type.trim() : "unknown";
  const normalizedSlug =
    typeof item.slug === "string" && item.slug.trim()
      ? item.slug.trim()
      : slugifyName(normalizedName) || String(normalizedId || normalizedName);
  const now = new Date().toISOString();

  return mapRowToItemRecord({
    base_value: normalizeOptionalNumber(item.base_value),
    character: normalizeOptionalText(item.character),
    description: normalizeOptionalText(item.description),
    durability: normalizeOptionalNumber(item.durability),
    etag: normalizeOptionalText(item.etag),
    gives_light: normalizeOptionalNumber(item.gives_light),
    height: normalizeOptionalNumber(item.height),
    id: normalizedId,
    inserted_at: item.inserted_at ?? now,
    is_consumable: normalizeOptionalBoolean(item.is_consumable),
    is_container: normalizeOptionalBoolean(item.is_container),
    item_type: normalizedItemType,
    layer: normalizeOptionalNumber(item.layer),
    level: normalizeOptionalNumber(item.level),
    long_description: normalizeOptionalText(item.long_description),
    model: normalizeOptionalText(item.model),
    mount_point: normalizeOptionalText(item.mount_point),
    name: normalizedName,
    on_acquire: normalizeOptionalText(item.on_acquire),
    on_activate: normalizeOptionalText(item.on_activate),
    on_consume: normalizeOptionalText(item.on_consume),
    on_drop: normalizeOptionalText(item.on_drop),
    on_use: normalizeOptionalText(item.on_use),
    quality: normalizeOptionalText(item.quality),
    rarity: normalizeOptionalText(item.rarity),
    slug: normalizedSlug,
    source: normalizeOptionalText(item.source),
    source_kind: normalizeOptionalText(item.source_kind),
    storage_capacity: normalizeOptionalNumber(item.storage_capacity),
    textures: normalizeStringArray(item.textures),
    thumbnail: normalizeOptionalText(item.thumbnail),
    thumbnail2x: normalizeOptionalText(item.thumbnail2x),
    type: normalizeOptionalText(item.type),
    updated_at: item.updated_at ?? now,
    weapon_grip: normalizeOptionalText(item.weapon_grip),
    width: normalizeOptionalNumber(item.width)
  });
}

export async function createRemoteItemRecord(name: string, itemType: string) {
  const normalizedName = name.trim();
  const normalizedItemType = itemType.trim();

  if (!normalizedName) {
    throw new Error("Item name is required.");
  }

  if (!normalizedItemType) {
    throw new Error("Item category is required.");
  }

  const vaxServer = getVaxServer();
  const vaxAdminKey = getVaxAdminKey();

  if (!vaxServer) {
    throw new Error("VAX_SERVER is not configured.");
  }

  const requestBody: Record<string, unknown> = {
    item_type: normalizedItemType,
    name: normalizedName
  };

  if (normalizedItemType === "body_mounted") {
    requestBody.mount_point = "body_point";
  }

  if (normalizedItemType === "weapon") {
    requestBody.mount_point = "hand_right_point";
    requestBody.weapon_grip = "one_handed";
  }

  let response: Response;

  try {
    response = await fetch(`${vaxServer}/api/admin/items`, {
      body: JSON.stringify(requestBody),
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": vaxAdminKey
      },
      method: "POST"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch failed";
    throw new Error(`Request to VAX server failed: ${message}`);
  }

  const responseText = await response.text().catch(() => "");
  let responseBody: Partial<{ error: string; item: Partial<StoredItemRow>; message: string }> = {};

  if (responseText.trim()) {
    try {
      responseBody = JSON.parse(responseText) as typeof responseBody;
    } catch {
      responseBody = {};
    }
  }

  if (!response.ok) {
    throw new Error((responseBody.message ?? responseBody.error ?? responseText.trim()) || "Could not create item.");
  }

  if (!responseBody.item) {
    throw new Error("The item server did not return the created item.");
  }

  return mapApiItemToItemRecord(responseBody.item);
}

export async function loadItemFieldLookups(): Promise<ItemFieldLookups> {
  const vaxServer = getVaxServer();

  if (!vaxServer) {
    throw new Error("VAX_SERVER is not configured.");
  }

  async function loadLookup<T extends string>(pathName: string, fieldName: string) {
    let response: Response;

    try {
      response = await fetch(`${vaxServer}${pathName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "fetch failed";
      throw new Error(`Request to VAX server failed: ${message}`);
    }

    const responseText = await response.text().catch(() => "");

    if (!response.ok) {
      throw new Error(responseText.trim() || "Could not load item lookups.");
    }

    let responseBody: Record<string, unknown>;

    try {
      responseBody = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      throw new Error("The item lookup response was not valid JSON.");
    }

    const values = responseBody[fieldName];

    if (!Array.isArray(values)) {
      throw new Error(`The item lookup "${fieldName}" was missing.`);
    }

    return values
      .filter((value): value is T => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim());
  }

  const [rarities, mountPoints, weaponGrips] = await Promise.all([
    loadLookup("/lookup/rarities.json", "rarities"),
    loadLookup("/lookup/mountpoints.json", "mount_points"),
    loadLookup("/lookup/weapon_grips.json", "weapon_grips")
  ]);

  return { mountPoints, rarities, weaponGrips };
}

export async function updateRemoteItemRecord(
  itemId: number,
  fields: Partial<
    Pick<
      ItemRecord,
      "base_value" | "description" | "durability" | "gives_light" | "is_consumable" | "is_container" | "level" | "long_description" | "mount_point" | "quality" | "rarity" | "storage_capacity" | "weapon_grip"
    >
  >
) {
  const normalizedItemId = await assertItemExists(itemId);
  const vaxServer = getVaxServer();
  const vaxAdminKey = getVaxAdminKey();

  if (!vaxServer) {
    throw new Error("VAX_SERVER is not configured.");
  }

  const requestBody: Record<string, string | number | boolean | null> = {};

  if ("base_value" in fields) {
    requestBody.base_value = normalizeOptionalNumber(fields.base_value) ?? null;
  }

  if ("description" in fields) {
    requestBody.description = normalizeOptionalText(fields.description) ?? null;
  }

  if ("durability" in fields) {
    requestBody.durability = normalizeOptionalNumber(fields.durability) ?? null;
  }

  if ("gives_light" in fields) {
    requestBody.gives_light = normalizeOptionalNumber(fields.gives_light) ?? null;
  }

  if ("is_consumable" in fields) {
    requestBody.is_consumable = normalizeOptionalBoolean(fields.is_consumable) ?? null;
  }

  if ("is_container" in fields) {
    requestBody.is_container = normalizeOptionalBoolean(fields.is_container) ?? null;
  }

  if ("level" in fields) {
    requestBody.level = normalizeOptionalNumber(fields.level) ?? null;
  }

  if ("long_description" in fields) {
    requestBody.long_description = normalizeOptionalText(fields.long_description) ?? null;
  }

  if ("mount_point" in fields) {
    requestBody.mount_point = normalizeOptionalText(fields.mount_point) ?? null;
  }

  if ("quality" in fields) {
    requestBody.quality = normalizeOptionalText(fields.quality) ?? null;
  }

  if ("rarity" in fields) {
    requestBody.rarity = normalizeOptionalText(fields.rarity) ?? null;
  }

  if ("storage_capacity" in fields) {
    requestBody.storage_capacity = normalizeOptionalNumber(fields.storage_capacity) ?? null;
  }

  if ("weapon_grip" in fields) {
    requestBody.weapon_grip = normalizeOptionalText(fields.weapon_grip) ?? null;
  }

  if (!Object.keys(requestBody).length) {
    throw new Error("At least one item field is required.");
  }

  let response: Response;

  try {
    response = await fetch(`${vaxServer}/api/admin/items/${normalizedItemId}`, {
      body: JSON.stringify(requestBody),
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": vaxAdminKey
      },
      method: "PATCH"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch failed";
    throw new Error(`Request to VAX server failed: ${message}`);
  }

  const responseText = await response.text().catch(() => "");
  let responseBody: Partial<{ error: string; item: Partial<StoredItemRow>; message: string }> & Partial<StoredItemRow> = {};

  if (responseText.trim()) {
    try {
      responseBody = JSON.parse(responseText) as typeof responseBody;
    } catch {
      responseBody = {};
    }
  }

  if (!response.ok) {
    throw new Error((responseBody.message ?? responseBody.error ?? responseText.trim()) || "Could not update item.");
  }

  const responseItem = "item" in responseBody && responseBody.item ? responseBody.item : responseBody;

  if (!responseItem || typeof responseItem !== "object") {
    throw new Error("The item server did not return the updated item.");
  }

  return mapApiItemToItemRecord(responseItem);
}

async function assertItemExists(itemId: number) {
  await ensureAssetDatabaseReady();
  const hasItemsTable = await ensureItemsDeletedColumn();

  if (!hasItemsTable) {
    throw new Error("Items table not found.");
  }

  const normalizedItemId = Math.round(itemId);

  if (!Number.isFinite(normalizedItemId) || normalizedItemId <= 0) {
    throw new Error("Valid item id is required.");
  }

  const db = await getDatabase();
  const existingItem = await db<StoredItemRow>("items")
    .select("id")
    .first()
    .where({ id: normalizedItemId, deleted: false });

  if (!existingItem) {
    throw new Error("Item not found.");
  }

  return normalizedItemId;
}

async function uploadItemAssetToVax(
  itemId: number,
  file: File,
  targetPath: string,
  contentType: string,
  fallbackErrorMessage: string
) {
  const normalizedItemId = await assertItemExists(itemId);
  const vaxServer = getVaxServer();
  const vaxAdminKey = getVaxAdminKey();

  if (!vaxServer) {
    throw new Error("VAX_SERVER is not configured.");
  }

  let response: Response;

  try {
    response = await fetch(`${vaxServer}/items/${normalizedItemId}/${targetPath}`, {
      body: Buffer.from(await file.arrayBuffer()),
      headers: {
        "Content-Type": contentType,
        "x-admin-key": vaxAdminKey
      },
      method: "PUT"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch failed";
    throw new Error(`Request to VAX server failed: ${message}`);
  }

  const responseText = await response.text().catch(() => "");

  if (!response.ok) {
    try {
      const responseBody = JSON.parse(responseText) as Partial<{ error: string; message: string }>;
      throw new Error(responseBody.message ?? responseBody.error ?? fallbackErrorMessage);
    } catch {
      throw new Error(responseText.trim() || fallbackErrorMessage);
    }
  }

  return { id: normalizedItemId, ok: true };
}

async function resizeItemImageContain(buffer: Buffer, targetSize: number) {
  return sharp(buffer, { failOn: "warning" })
    .rotate()
    .resize(targetSize, targetSize, {
      background: { alpha: 0, b: 0, g: 0, r: 0 },
      fit: "contain",
      kernel: sharp.kernel.mks2021
    })
    .png({
      adaptiveFiltering: true,
      compressionLevel: 9,
      force: true,
      palette: false
    })
    .toBuffer();
}

export async function uploadItemModelFile(itemId: number, file: File) {
  const normalizedFileName = file.name.trim().toLowerCase();

  if (normalizedFileName.endsWith(".glb")) {
    return uploadItemAssetToVax(itemId, file, "model.glb", "model/gltf-binary", "Could not upload model.");
  }

  if (normalizedFileName.endsWith(".gltf")) {
    return uploadItemAssetToVax(itemId, file, "model.gltf", "model/gltf+json", "Could not upload model.");
  }

  throw new Error("Model uploads require a .glb or .gltf file.");
}

export async function uploadItemTextureFile(itemId: number, file: File) {
  const normalizedFileName = file.name.trim().toLowerCase();

  if (file.type !== "image/png" && !normalizedFileName.endsWith(".png")) {
    throw new Error("Texture uploads currently require a PNG file.");
  }

  return uploadItemAssetToVax(itemId, file, "texture.png", "image/png", "Could not upload texture.");
}

export async function uploadItemThumbnailFile(itemId: number, file: File) {
  const normalizedFileName = file.name.trim().toLowerCase();
  const fileExtension = path.extname(normalizedFileName);

  if (!file.type.startsWith("image/") && !IMAGE_EXTENSIONS.has(fileExtension)) {
    throw new Error("Image uploads require a PNG, JPG, WEBP, or GIF file.");
  }

  let resizedImageBuffer: Buffer;

  try {
    resizedImageBuffer = await resizeItemImageContain(Buffer.from(await file.arrayBuffer()), 128);
  } catch {
    throw new Error("Could not decode the uploaded image.");
  }

  const normalizedItemId = await assertItemExists(itemId);
  const vaxServer = getVaxServer();
  const vaxAdminKey = getVaxAdminKey();

  if (!vaxServer) {
    throw new Error("VAX_SERVER is not configured.");
  }

  let response: Response;

  try {
    response = await fetch(`${vaxServer}/items/${normalizedItemId}/image.png`, {
      body: new Uint8Array(resizedImageBuffer),
      headers: {
        "Content-Type": "image/png",
        "x-admin-key": vaxAdminKey
      },
      method: "PUT"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch failed";
    throw new Error(`Request to VAX server failed: ${message}`);
  }

  const responseText = await response.text().catch(() => "");

  if (!response.ok) {
    try {
      const responseBody = JSON.parse(responseText) as Partial<{ error: string; message: string }>;
      throw new Error(responseBody.message ?? responseBody.error ?? "Could not upload item image.");
    } catch {
      throw new Error(responseText.trim() || "Could not upload item image.");
    }
  }

  try {
    const responseBody = JSON.parse(responseText) as Partial<{ thumbnail: string }>;

    return {
      id: normalizedItemId,
      ok: true,
      thumbnail: typeof responseBody.thumbnail === "string" ? responseBody.thumbnail : null
    };
  } catch {
    return { id: normalizedItemId, ok: true, thumbnail: null };
  }
}

export async function saveItemPreviewImage(itemId: number, imageDataUrl: string) {
  const normalizedItemId = await assertItemExists(itemId);

  const vaxServer = getVaxServer();
  const vaxAdminKey = getVaxAdminKey();

  if (!vaxServer) {
    throw new Error("VAX_SERVER is not configured.");
  }

  const imageBuffer = extractPngBuffer(imageDataUrl);
  const imagePng = PNG.sync.read(imageBuffer);

  if (imagePng.width !== 128 || imagePng.height !== 128) {
    throw new Error("Preview captures must be 128x128 PNG images.");
  }

  let response: Response;

  try {
    response = await fetch(`${vaxServer}/items/${normalizedItemId}/image.png`, {
      body: imageBuffer,
      headers: {
        "Content-Type": "image/png",
        "x-admin-key": vaxAdminKey
      },
      method: "PUT"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch failed";
    throw new Error(`Request to VAX server failed: ${message}`);
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(responseText.trim() || "Could not replace item image.");
  }

  return { id: normalizedItemId, ok: true };
}

export async function ensureTileLibraryFolder(relativePath: string) {
  const normalizedPath = normalizeTileRecordPath(relativePath);
  await ensureAssetDatabaseReady();
  const db = await getDatabase();
  await ensureFolderAncestors(normalizedPath);
  await upsertFolderAsset(db, normalizedPath);
  return normalizedPath;
}

export async function createTileRecord(name: string, tilePath: string, impassible = false) {
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
    "",
    impassible
  );

  const db = await getDatabase();
  await upsertTileAsset(db, nextTile);

  return nextTile;
}

export async function duplicateTileRecord(input: { name: string; slug: string }) {
  const nextName = normalizeUnderscoreName(input.name);
  const sourceSlug = input.slug.trim();

  if (!sourceSlug) {
    throw new Error("Choose a tile before duplicating it.");
  }

  if (!nextName) {
    throw new Error("Tile name is required.");
  }

  await ensureAssetDatabaseReady();
  const db = await getDatabase();
  const existingTile = await db<StoredAssetRow>("map_tiles")
    .select("*")
    .first()
    .where({ asset_key: getTileAssetKey(sourceSlug), deleted: false });

  if (!existingTile) {
    throw new Error("Tile not found.");
  }

  const currentTile = mapRowToTileRecord(existingTile);
  const tileRecords = await readTileRecords();
  const nextTile = normalizeTilePayload(
    nextName,
    currentTile.path,
    createUniqueSlug(tileRecords, nextName),
    currentTile.source,
    currentTile.slots,
    currentTile.thumbnail || createTileThumbnail(currentTile.slots),
    currentTile.impassible
  );

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

  const spriteRecord = {
    ...createInitialSpriteRecord(normalizedPath, spriteFilename, fileBuffer),
    thumbnail: createSpriteThumbnailDataUrl(fileBuffer, spriteFilename)
  };
  await upsertSpriteAsset(db, spriteRecord, fileBuffer);
  const createdSprite = await db<StoredAssetRow>("map_tiles")
    .select("id")
    .first()
    .where({ asset_key: getSpriteAssetKey(normalizedPath, spriteFilename), deleted: false });

  return {
    ...spriteRecord,
    id: createdSprite?.id ?? spriteRecord.id
  };
}

export async function importTileFile(file: File, tilePath: string) {
  const normalizedPath = normalizeTileLibraryPath(tilePath);

  if (!normalizedPath) {
    throw new Error("Choose a tile library folder before importing a tile.");
  }

  if (path.extname(file.name).toLowerCase() !== SPRITE_IMAGE_EXTENSION) {
    throw new Error("Tile imports currently require a PNG file.");
  }

  const normalizedName = normalizeUnderscoreName(path.parse(file.name).name);

  if (!normalizedName) {
    throw new Error("Tile filename must include a valid name.");
  }

  await ensureTileLibraryFolder(normalizedPath);

  const tileRecords = await readTileRecords();
  const baseSlug = slugifyName(normalizedName);
  const existingTile = tileRecords.find(
    (candidate) =>
      normalizeTileLibraryPath(candidate.path) === normalizedPath &&
      (candidate.slug === baseSlug || candidate.name === normalizedName)
  );
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const { height, width } = PNG.sync.read(fileBuffer);
  const pixels = `data:image/png;base64,${fileBuffer.toString("base64")}`;
  const slots = normalizeSlotRecords([
    {
      layers: [pixels],
      pixels,
      size: Math.max(width, height),
      source_x: 0,
      source_y: 0
    }
  ]);
  const nextTile = normalizeTilePayload(
    normalizedName,
    normalizedPath,
    existingTile?.slug ?? createUniqueSlug(tileRecords, normalizedName),
    file.name,
    slots,
    "",
    existingTile?.impassible ?? false
  );
  const db = await getDatabase();

  await upsertTileAsset(db, nextTile);

  return nextTile;
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
  } else {
    if (!existingSprite?.image_data) {
      throw new Error("Sprite image is missing in the database.");
    }

    thumbnailBuffer = existingSprite.image_data;
  }

  nextSprite = applySpriteImageMetrics(nextSprite, thumbnailBuffer);

  await upsertSpriteAsset(db, nextSprite, thumbnailBuffer);
  const savedSpriteRow = await db<StoredAssetRow>("map_tiles")
    .select("*")
    .first()
    .where({ asset_key: getSpriteAssetKey(normalizedPath, nextSprite.filename), deleted: false });

  if (savedSpriteRow) {
    await upsertDefaultSpriteState(db, {
      ...savedSpriteRow,
      file_name: nextSprite.filename,
      image_data: thumbnailBuffer
    });
  }

  return {
    ...nextSprite,
    id: existingSprite?.id ?? nextSprite.id,
    thumbnail: createSpriteThumbnailDataUrl(thumbnailBuffer, nextSprite.filename)
  };
}

export async function saveTileRecord(input: {
  impassible: boolean;
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
    createTileThumbnail(input.slots),
    input.impassible
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
      .select([
        "id",
        "slug",
        "name",
        "about_prompt",
        "width",
        "height",
        "deleted",
        "mini_map",
        "is_instance",
        "special_grid",
        "created_at",
        "updated_at"
      ])
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
      aboutPrompt: storedMap.about_prompt ?? "",
      cells: flattenMapLayers(layers, storedMap.width, storedMap.height),
      height: storedMap.height,
      isInstance: storedMap.is_instance,
      layers,
      miniMap: bufferToPngDataUrl(storedMap.mini_map),
      name: storedMap.name,
      special: normalizeMapSpecialGrid(decodeStoredMapSpecialGrid(storedMap.special_grid), storedMap.width, storedMap.height),
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
    aboutPrompt: "",
    cells: flattenMapLayers(createEmptyMapLayers(normalizedWidth, normalizedHeight)),
    height: normalizedHeight,
    isInstance: false,
    layers: createEmptyMapLayers(normalizedWidth, normalizedHeight),
    miniMap: "",
    name,
    special: createEmptyMapSpecialGrid(normalizedWidth, normalizedHeight),
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
  thumbnail = "",
  impassible = true
): TileRecord {
  return {
    impassible: Boolean(impassible),
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
  miniMap = "",
  aboutPrompt = "",
  isInstance = false,
  width?: number,
  height?: number,
  special?: number[][]
): MapRecord {
  const dimensions = getMapLayerDimensions(layers);
  const normalizedWidth = normalizeMapDimension(width ?? dimensions.width);
  const normalizedHeight = normalizeMapDimension(height ?? dimensions.height);
  const normalizedLayers = normalizeMapLayers(layers, normalizedWidth, normalizedHeight);
  const normalizedSpecial = normalizeMapSpecialGrid(special, normalizedWidth, normalizedHeight);

  return {
    aboutPrompt: aboutPrompt.trim(),
    cells: flattenMapLayers(normalizedLayers, normalizedWidth, normalizedHeight),
    height: normalizedHeight,
    isInstance,
    layers: normalizedLayers,
    miniMap: miniMap.trim(),
    name: name.trim(),
    special: normalizedSpecial,
    slug: slug.trim(),
    updatedAt: new Date().toISOString(),
    width: normalizedWidth
  };
}
