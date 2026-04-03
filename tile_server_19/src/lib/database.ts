import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import knex, { type Knex } from "knex";

const APP_ROOT = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const WORKSPACE_ROOT = path.resolve(APP_ROOT, "..");
const ENV_PATH = path.join(WORKSPACE_ROOT, ".env");
const DATABASE_TABLE_NAME = "map_tiles";
const MAPS_TABLE_NAME = "map_maps";
const MAP_ASSETS_TABLE_NAME = "map_map_assets";

let cachedConnectionString: string | null | undefined;
let databaseInstance: Knex | null = null;
let databaseConnectionPromise: Promise<Knex> | null = null;

function unquoteEnvValue(value: string) {
  const trimmedValue = value.trim();

  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1);
  }

  return trimmedValue;
}

function readNeonConnectionStringFromEnvFile() {
  if (!existsSync(ENV_PATH)) {
    return "";
  }

  const fileContents = readFileSync(ENV_PATH, "utf8");

  for (const line of fileContents.split(/\r?\n/u)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();

    if (key !== "NEON") {
      continue;
    }

    return unquoteEnvValue(trimmedLine.slice(separatorIndex + 1));
  }

  return "";
}

export function getDatabaseConnectionString() {
  if (cachedConnectionString !== undefined) {
    if (!cachedConnectionString) {
      throw new Error("NEON key missing.");
    }

    return cachedConnectionString;
  }

  const processValue = typeof process.env.NEON === "string" ? process.env.NEON.trim() : "";
  const envFileValue = readNeonConnectionStringFromEnvFile();
  cachedConnectionString = processValue || envFileValue;

  if (!cachedConnectionString) {
    throw new Error("NEON key missing.");
  }

  return cachedConnectionString;
}

export function getDatabaseConnectionErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Could not connect to Postgres.";
}

async function createDatabaseConnection() {
  const connection = getDatabaseConnectionString();
  const nextDatabase = knex({
    client: "pg",
    connection,
    pool: {
      min: 0,
      max: 4
    }
  });

  try {
    await nextDatabase.raw("select 1");
    databaseInstance = nextDatabase;
    return nextDatabase;
  } catch (error) {
    await nextDatabase.destroy().catch(() => undefined);
    throw error;
  }
}

export async function getDatabase() {
  if (databaseInstance) {
    return databaseInstance;
  }

  if (!databaseConnectionPromise) {
    databaseConnectionPromise = createDatabaseConnection().catch((error) => {
      databaseConnectionPromise = null;
      throw error;
    });
  }

  return databaseConnectionPromise;
}

export async function ensureDatabaseSchema(db: Knex) {
  const hasTable = await db.schema.hasTable(DATABASE_TABLE_NAME);

  if (!hasTable) {
    await db.schema.createTable(DATABASE_TABLE_NAME, (table) => {
      table.uuid("id").primary();
      table.text("asset_key").notNullable().unique();
      table.text("asset_name").notNullable();
      table.text("asset_type").notNullable();
      table.boolean("deleted").notNullable().defaultTo(false);
      table.text("sub_folder").notNullable();
      table.text("asset_slug");
      table.text("file_name");
      table.text("source_path");
      table.binary("image_data");
      table.jsonb("tile_slots");
      table.jsonb("sprite_metadata");
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
    });
  }

  const hasDeletedColumn = await db.schema.hasColumn(DATABASE_TABLE_NAME, "deleted");

  if (!hasDeletedColumn) {
    await db.schema.alterTable(DATABASE_TABLE_NAME, (table) => {
      table.boolean("deleted").notNullable().defaultTo(false);
    });
  }

  await db.raw(
    "create index if not exists map_tiles_asset_type_folder_name_idx on map_tiles (asset_type, sub_folder, asset_name)"
  );
  await db.raw(
    "create index if not exists map_tiles_asset_type_slug_idx on map_tiles (asset_type, asset_slug)"
  );
  await db.raw(
    "create index if not exists map_tiles_asset_type_file_idx on map_tiles (asset_type, sub_folder, file_name)"
  );

  const hasMapsTable = await db.schema.hasTable(MAPS_TABLE_NAME);

  if (!hasMapsTable) {
    await db.schema.createTable(MAPS_TABLE_NAME, (table) => {
      table.uuid("id").primary();
      table.text("slug").notNullable().unique();
      table.text("name").notNullable();
      table.integer("width").notNullable();
      table.integer("height").notNullable();
      table.boolean("deleted").notNullable().defaultTo(false);
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
    });
  }

  const hasMapDeletedColumn = await db.schema.hasColumn(MAPS_TABLE_NAME, "deleted");

  if (!hasMapDeletedColumn) {
    await db.schema.alterTable(MAPS_TABLE_NAME, (table) => {
      table.boolean("deleted").notNullable().defaultTo(false);
    });
  }

  const hasMapAssetsTable = await db.schema.hasTable(MAP_ASSETS_TABLE_NAME);

  if (!hasMapAssetsTable) {
    await db.schema.createTable(MAP_ASSETS_TABLE_NAME, (table) => {
      table.uuid("id").primary();
      table
        .uuid("map_id")
        .notNullable()
        .references("id")
        .inTable(MAPS_TABLE_NAME)
        .onDelete("CASCADE");
      table.integer("layer_index").notNullable();
      table.integer("tile_x").notNullable();
      table.integer("tile_y").notNullable();
      table.text("asset_type").notNullable();
      table.uuid("tile_asset_id").references("id").inTable(DATABASE_TABLE_NAME).onDelete("SET NULL");
      table.uuid("sprite_asset_id").references("id").inTable(DATABASE_TABLE_NAME).onDelete("SET NULL");
      table.integer("slot_num").notNullable().defaultTo(0);
      table.boolean("color_enabled").notNullable().defaultTo(false);
      table.text("color_value").notNullable().defaultTo("#ffffff");
      table.boolean("multiply_enabled").notNullable().defaultTo(false);
      table.boolean("flip_horizontal").notNullable().defaultTo(false);
      table.boolean("flip_vertical").notNullable().defaultTo(false);
      table.integer("rotate_quarter_turns").notNullable().defaultTo(0);
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
      table.unique(["map_id", "layer_index", "tile_x", "tile_y"]);
    });
  }

  await db.raw(
    "create index if not exists map_maps_deleted_updated_idx on map_maps (deleted, updated_at desc)"
  );
  await db.raw(
    "create index if not exists map_map_assets_map_layer_idx on map_map_assets (map_id, layer_index)"
  );
  await db.raw(
    "create index if not exists map_map_assets_tile_asset_idx on map_map_assets (tile_asset_id)"
  );
  await db.raw(
    "create index if not exists map_map_assets_sprite_asset_idx on map_map_assets (sprite_asset_id)"
  );
}
