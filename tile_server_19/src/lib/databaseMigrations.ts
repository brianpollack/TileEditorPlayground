import type { Knex } from "knex";

const MAPS_TABLE_NAME = "map_maps";
const MAP_PATHS_TABLE_NAME = "map_paths";
const MIGRATIONS_TABLE_NAME = "tile_server_schema_migrations";
const PERSONALITIES_TABLE_NAME = "personalities";

type DatabaseMigration = {
  id: string;
  run(db: Knex): Promise<void>;
};

async function ensureMigrationsTable(db: Knex) {
  const hasMigrationsTable = await db.schema.hasTable(MIGRATIONS_TABLE_NAME);

  if (!hasMigrationsTable) {
    await db.schema.createTable(MIGRATIONS_TABLE_NAME, (table) => {
      table.text("id").primary();
      table.timestamp("applied_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
    });
  }
}

async function hasMigrationRun(db: Knex, migrationId: string) {
  const row = await db(MIGRATIONS_TABLE_NAME).select("id").first().where({ id: migrationId });

  return Boolean(row);
}

async function recordMigration(db: Knex, migrationId: string) {
  await db(MIGRATIONS_TABLE_NAME)
    .insert({
      applied_at: db.fn.now(),
      id: migrationId
    })
    .onConflict("id")
    .ignore();
}

const migrations: DatabaseMigration[] = [
  {
    id: "20260503_01_add_map_paths",
    async run(db) {
      await db.raw("create unique index if not exists map_maps_name_unique_idx on map_maps (name)");

      const hasMapPathsTable = await db.schema.hasTable(MAP_PATHS_TABLE_NAME);

      if (!hasMapPathsTable) {
        await db.schema.createTable(MAP_PATHS_TABLE_NAME, (table) => {
          table.uuid("id").primary();
          table
            .text("map_name")
            .notNullable()
            .references("name")
            .inTable(MAPS_TABLE_NAME)
            .onUpdate("CASCADE")
            .onDelete("CASCADE");
          table.text("name").notNullable();
          table.jsonb("points").notNullable().defaultTo(db.raw("'[]'::jsonb"));
          table.timestamp("inserted_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
          table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(db.fn.now());
          table.unique(["map_name", "name"]);
        });
      }

      await db.raw(
        "create index if not exists map_paths_map_name_updated_idx on map_paths (map_name, updated_at desc)"
      );
    }
  },
  {
    id: "20260503_02_add_personality_greeting",
    async run(db) {
      const hasPersonalityGreetingColumn = await db.schema.hasColumn(PERSONALITIES_TABLE_NAME, "greeting");

      if (!hasPersonalityGreetingColumn) {
        await db.schema.alterTable(PERSONALITIES_TABLE_NAME, (table) => {
          table.text("greeting");
        });
      }
    }
  },
  {
    id: "20260503_03_add_map_path_slugs",
    async run(db) {
      const hasMapPathSlugColumn = await db.schema.hasColumn(MAP_PATHS_TABLE_NAME, "map_slug");

      if (!hasMapPathSlugColumn) {
        await db.schema.alterTable(MAP_PATHS_TABLE_NAME, (table) => {
          table.text("map_slug");
        });
      }

      await db.raw(`
        update map_paths
        set map_slug = map_maps.slug
        from map_maps
        where map_paths.map_name = map_maps.name
          and (map_paths.map_slug is null or map_paths.map_slug = '')
      `);
      await db.raw(
        "create index if not exists map_paths_map_slug_updated_idx on map_paths (map_slug, updated_at desc)"
      );
      await db.raw(
        "create unique index if not exists map_paths_map_slug_name_unique_idx on map_paths (map_slug, name) where map_slug is not null"
      );
    }
  }
];

export async function runDatabaseMigrations(db: Knex) {
  await ensureMigrationsTable(db);

  for (const migration of migrations) {
    if (await hasMigrationRun(db, migration.id)) {
      continue;
    }

    await migration.run(db);
    await recordMigration(db, migration.id);
  }
}
