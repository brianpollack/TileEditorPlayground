import { randomUUID } from "node:crypto";
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
const PERSONALITIES_TABLE_NAME = "personalities";
const PERSONALITY_EVENTS_TABLE_NAME = "personality_events";
const SPRITE_EVENTS_TABLE_NAME = "sprite_events";
const SPRITE_STATES_TABLE_NAME = "sprite_states";

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
      table.boolean("impassible").notNullable().defaultTo(true);
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

  const hasImpassibleColumn = await db.schema.hasColumn(DATABASE_TABLE_NAME, "impassible");

  if (!hasImpassibleColumn) {
    await db.schema.alterTable(DATABASE_TABLE_NAME, (table) => {
      table.boolean("impassible").defaultTo(true);
    });
    await db(DATABASE_TABLE_NAME).whereNull("impassible").update({ impassible: true });
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
      table.text("about_prompt");
      table.integer("width").notNullable();
      table.integer("height").notNullable();
      table.boolean("deleted").notNullable().defaultTo(false);
      table.binary("mini_map");
      table.boolean("is_instance").notNullable().defaultTo(false);
      table.jsonb("special_grid").notNullable().defaultTo(db.raw("'[]'::jsonb"));
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

  const hasMapAboutPromptColumn = await db.schema.hasColumn(MAPS_TABLE_NAME, "about_prompt");

  if (!hasMapAboutPromptColumn) {
    await db.schema.alterTable(MAPS_TABLE_NAME, (table) => {
      table.text("about_prompt");
    });
  }

  const hasMapMiniMapColumn = await db.schema.hasColumn(MAPS_TABLE_NAME, "mini_map");

  if (!hasMapMiniMapColumn) {
    await db.schema.alterTable(MAPS_TABLE_NAME, (table) => {
      table.binary("mini_map");
    });
  }

  const hasMapIsInstanceColumn = await db.schema.hasColumn(MAPS_TABLE_NAME, "is_instance");

  if (!hasMapIsInstanceColumn) {
    await db.schema.alterTable(MAPS_TABLE_NAME, (table) => {
      table.boolean("is_instance").notNullable().defaultTo(false);
    });
  }

  const hasMapSpecialGridColumn = await db.schema.hasColumn(MAPS_TABLE_NAME, "special_grid");

  if (!hasMapSpecialGridColumn) {
    await db.schema.alterTable(MAPS_TABLE_NAME, (table) => {
      table.jsonb("special_grid").notNullable().defaultTo(db.raw("'[]'::jsonb"));
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

  const hasPersonalitiesTable = await db.schema.hasTable(PERSONALITIES_TABLE_NAME);

  if (!hasPersonalitiesTable) {
    await db.schema.createTable(PERSONALITIES_TABLE_NAME, (table) => {
      table.text("character_slug").primary();
      table.text("voice_id");
      table.text("chat_provider");
      table.text("chat_model");
      table.integer("base_hp").notNullable().defaultTo(100);
      table.integer("gold").notNullable().defaultTo(0);
      table.text("name").notNullable();
      table.text("role");
      table.text("titles");
      table.text("gender").notNullable().defaultTo("NB");
      table.integer("age");
      table.integer("reputation").notNullable().defaultTo(50);
      table.text("temperament");
      table.text("emotional_range");
      table.text("speech_pattern");
      table.integer("aggression").notNullable().defaultTo(50);
      table.integer("altruism").notNullable().defaultTo(50);
      table.integer("honesty").notNullable().defaultTo(50);
      table.integer("courage").notNullable().defaultTo(50);
      table.integer("impulsiveness").notNullable().defaultTo(50);
      table.integer("optimism").notNullable().defaultTo(50);
      table.integer("sociability").notNullable().defaultTo(50);
      table.integer("loyalty").notNullable().defaultTo(50);
      table.integer("goodness").notNullable().defaultTo(50);
      table.text("goals");
      table.text("backstory").defaultTo("");
      table.text("hidden_desires");
      table.text("fears");
      table.text("family_description");
      table.text("areas_of_expertise");
      table.text("specialties");
      table.text("custom_profile_pic");
      table.text("secrets_you_know").defaultTo("");
      table.text("things_you_can_share").defaultTo("");
      table.text("smalltalk_topics_enjoyed").defaultTo("");
      table.text("other_world_knowledge").defaultTo("");
      table.text("physical_description");
      table.text("distinguishing_feature");
      table.text("speech_style");
      table.text("accent");
      table.text("mannerisms");
      table.text("clothing_style");
      table.text("summary");
      table.text("llm_prompt_base");
      table.timestamp("inserted_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
    });
  }

  const personalityTextColumnsWithEmptyDefault = [
    "backstory",
    "secrets_you_know",
    "things_you_can_share",
    "smalltalk_topics_enjoyed",
    "other_world_knowledge"
  ] as const;

  for (const columnName of personalityTextColumnsWithEmptyDefault) {
    const hasColumn = await db.schema.hasColumn(PERSONALITIES_TABLE_NAME, columnName);

    if (!hasColumn) {
      await db.schema.alterTable(PERSONALITIES_TABLE_NAME, (table) => {
        table.text(columnName).defaultTo("");
      });
    }

    await db(PERSONALITIES_TABLE_NAME).whereNull(columnName).update({ [columnName]: "" });
  }

  const hasCustomProfilePicColumn = await db.schema.hasColumn(PERSONALITIES_TABLE_NAME, "custom_profile_pic");

  if (!hasCustomProfilePicColumn) {
    await db.schema.alterTable(PERSONALITIES_TABLE_NAME, (table) => {
      table.text("custom_profile_pic");
    });
  }

  const personalityChatTextColumns = ["chat_provider", "chat_model"] as const;

  for (const columnName of personalityChatTextColumns) {
    const hasColumn = await db.schema.hasColumn(PERSONALITIES_TABLE_NAME, columnName);

    if (!hasColumn) {
      await db.schema.alterTable(PERSONALITIES_TABLE_NAME, (table) => {
        table.text(columnName);
      });
    }
  }

  const hasPersonalityEventsTable = await db.schema.hasTable(PERSONALITY_EVENTS_TABLE_NAME);

  if (!hasPersonalityEventsTable) {
    await db.schema.createTable(PERSONALITY_EVENTS_TABLE_NAME, (table) => {
      table.bigIncrements("id").primary();
      table.text("personality_id").notNullable();
      table.text("event_type").notNullable();
      table.text("name").notNullable();
      table.jsonb("event_details").notNullable().defaultTo(db.raw("'{}'::jsonb"));
      table.text("lua_script").notNullable();
      table.boolean("enabled").notNullable().defaultTo(true);
      table.text("response_context").notNullable().defaultTo("");
      table.timestamp("inserted_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
    });
  }

  const hasPersonalityEventResponseContextColumn = await db.schema.hasColumn(
    PERSONALITY_EVENTS_TABLE_NAME,
    "response_context"
  );

  if (!hasPersonalityEventResponseContextColumn) {
    await db.schema.alterTable(PERSONALITY_EVENTS_TABLE_NAME, (table) => {
      table.text("response_context").notNullable().defaultTo("");
    });
  }

  const hasSpriteEventsTable = await db.schema.hasTable(SPRITE_EVENTS_TABLE_NAME);

  if (!hasSpriteEventsTable) {
    await db.schema.createTable(SPRITE_EVENTS_TABLE_NAME, (table) => {
      table.bigIncrements("id").primary();
      table.uuid("sprite_id").notNullable().references("id").inTable(DATABASE_TABLE_NAME).onDelete("CASCADE");
      table.text("event_id").notNullable();
      table.text("lua_script").notNullable();
      table.boolean("enabled").notNullable().defaultTo(true);
      table.timestamp("inserted_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
      table.unique(["sprite_id", "event_id"]);
    });
  }

  await db.raw(
    "create unique index if not exists sprite_events_sprite_event_idx on sprite_events (sprite_id, event_id)"
  );

  const hasSpriteStatesTable = await db.schema.hasTable(SPRITE_STATES_TABLE_NAME);

  if (!hasSpriteStatesTable) {
    await db.schema.createTable(SPRITE_STATES_TABLE_NAME, (table) => {
      table.uuid("id").primary();
      table.uuid("sprite_id").notNullable().references("id").inTable(DATABASE_TABLE_NAME).onDelete("CASCADE");
      table.text("state_id").notNullable();
      table.text("file_name").notNullable();
      table.binary("image_data").notNullable();
      table.jsonb("state_metadata").notNullable().defaultTo(db.raw("'{}'::jsonb"));
      table.timestamp("inserted_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
      table.unique(["sprite_id", "state_id"]);
    });
  }

  await db.raw(
    "create unique index if not exists sprite_states_sprite_state_idx on sprite_states (sprite_id, state_id)"
  );

  const existingDefaultSpriteStates = await db(SPRITE_STATES_TABLE_NAME)
    .select("sprite_id")
    .where({ state_id: "default" });
  const spriteIdsWithDefaultState = new Set(
    existingDefaultSpriteStates
      .map((row: { sprite_id?: unknown }) => (typeof row.sprite_id === "string" ? row.sprite_id : ""))
      .filter(Boolean)
  );
  const missingDefaultSpriteStateQuery = db(DATABASE_TABLE_NAME)
    .select("id", "file_name", "image_data", "created_at", "updated_at")
    .where({ asset_type: "sprite", deleted: false })
    .whereNotNull("file_name")
    .whereNotNull("image_data");

  if (spriteIdsWithDefaultState.size > 0) {
    missingDefaultSpriteStateQuery.whereNotIn("id", Array.from(spriteIdsWithDefaultState));
  }

  const spritesMissingDefaultState = await missingDefaultSpriteStateQuery;

  for (const spriteRow of spritesMissingDefaultState as Array<{
    created_at?: Date | string;
    file_name: string;
    id: string;
    image_data: Buffer;
    updated_at?: Date | string;
  }>) {
    await db(SPRITE_STATES_TABLE_NAME)
      .insert({
        file_name: spriteRow.file_name,
        id: randomUUID(),
        image_data: spriteRow.image_data,
        inserted_at: spriteRow.created_at ?? db.fn.now(),
        sprite_id: spriteRow.id,
        state_id: "default",
        state_metadata: JSON.stringify({}),
        updated_at: spriteRow.updated_at ?? db.fn.now()
      })
      .onConflict(["sprite_id", "state_id"])
      .ignore();
  }

  await db.raw(`
    update map_tiles
    set
      sprite_metadata = jsonb_set(sprite_metadata, '{mouseover_cursor}', '""'::jsonb, true),
      updated_at = updated_at
    where asset_type = 'sprite'
      and sprite_metadata is not null
      and jsonb_typeof(sprite_metadata) = 'object'
      and not jsonb_exists(sprite_metadata, 'mouseover_cursor')
  `);

  await db.raw(`
    update map_tiles
    set
      sprite_metadata = jsonb_set(
        sprite_metadata,
        '{mouseover_cursor}',
        to_jsonb(regexp_replace(sprite_metadata ->> 'mouseover_cursor', '^.*/', '')),
        true
      ),
      updated_at = updated_at
    where asset_type = 'sprite'
      and sprite_metadata is not null
      and jsonb_typeof(sprite_metadata) = 'object'
      and jsonb_typeof(sprite_metadata -> 'mouseover_cursor') = 'string'
      and sprite_metadata ->> 'mouseover_cursor' like '%/%'
  `);

  await db.raw(`
    insert into sprite_events (sprite_id, event_id, lua_script, enabled, inserted_at, updated_at)
    select
      id,
      'on_activate',
      sprite_metadata ->> 'on_activate',
      true,
      created_at,
      updated_at
    from map_tiles
    where asset_type = 'sprite'
      and sprite_metadata is not null
      and jsonb_typeof(sprite_metadata) = 'object'
      and coalesce(sprite_metadata ->> 'on_activate', '') <> ''
    on conflict (sprite_id, event_id) do nothing
  `);

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
  await db.raw(
    "create index if not exists personalities_gender_idx on personalities (gender)"
  );
  await db.raw(
    "create index if not exists personalities_role_idx on personalities (role)"
  );
  await db.raw(
    "create index if not exists personality_events_personality_idx on personality_events (personality_id, updated_at desc)"
  );
  await db.raw(
    "create index if not exists sprite_events_sprite_idx on sprite_events (sprite_id, updated_at desc)"
  );
}
