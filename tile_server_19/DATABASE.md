# Database

This file documents the Postgres schema currently used by Tile Server 19.

Update this file whenever we add, remove, rename, or materially repurpose database tables, columns, indexes, or serialization rules.

## Connection

- Database provider: Neon / PostgreSQL
- Connection env var: `NEON`
- Env file location used by the app: `../.env`
- Startup behavior:
  If `NEON` is missing or the database cannot be reached, the web UI stops at a database error screen and does not continue into the editor.

## Table Naming

- All application tables should begin with `map_`.
- Current database table count in this repo: `3`

## Tables

### `map_tiles`

Primary asset table for the tile library.

This table currently stores three asset kinds in one table:

- `folder`
- `tile`
- `sprite`

That means the table is acting as both:

- the folder tree for the Tile Library
- the tile record store
- the sprite image and sprite metadata store

#### Columns

- `id uuid primary key`
  Stable row id generated in application code with `randomUUID()`.

- `asset_key text not null unique`
  Canonical unique key for the row.
  Examples:
  `folder:layer_2`
  `tile:grass`
  `sprite:layer_2/fat_tree.png`

- `asset_name text not null`
  Display name for the asset.
  For folders this is the folder segment name.
  For tiles this is the tile name.
  For sprites this is the sprite display name.

- `asset_type text not null`
  Discriminator for the row kind.
  Current values:
  `folder`, `tile`, `sprite`

- `deleted boolean not null default false`
  Soft-delete flag for library assets.
  Queries that power the active Tile Library should ignore rows where `deleted = true`.
  Current delete behavior does not physically remove a tile or sprite row; instead it sets `deleted = true` and prefixes `asset_name` with `_`.

- `sub_folder text not null`
  Library path such as `layer_0`, `layer_2`, or `layer_5/consumables`.
  For folders this is the folder path itself.
  For tiles and sprites this is the folder they live in.

- `asset_slug text null`
  Used for tile slug lookup.
  Present for `tile` rows.
  Typically `null` for `folder` and `sprite` rows.

- `file_name text null`
  Used for sprite file identity.
  Present for `sprite` rows, such as `fat_tree.png`.
  Typically `null` for `folder` and `tile` rows.

- `source_path text null`
  Original tile source image path used during tile slicing.
  Present for `tile` rows.
  Typically `null` for `folder` and `sprite` rows.

- `image_data bytea null`
  Binary image payload.

  Current use by asset type:
  - `tile`: stores the generated tile thumbnail strip as PNG bytes
  - `sprite`: stores the sprite PNG image bytes
  - `folder`: unused, `null`

- `tile_slots jsonb null`
  Tile slot payload for `tile` rows.
  This is the normalized five-slot tile structure serialized from the in-app `slots` array.
  It includes the layered PNG data URLs and flattened slot image data URLs.

- `sprite_metadata jsonb null`
  Sprite metadata payload for `sprite` rows.
  This is the normalized sprite JSON object excluding `path` and `thumbnail`, because those are derived elsewhere.

  Current JSON shape:

  - `filename`
    Sprite image filename, usually a PNG such as `fat_tree.png`.
    Used together with `sub_folder` to identify the sprite asset.

  - `name`
    Human-readable sprite name shown in the UI.

  - `image_w`, `image_h`
    Source sprite image width and height in pixels.
    Used for preview sizing, rendering scale, and editor display.

  - `tile_w`, `tile_h`
    Sprite footprint expressed in tile units rather than raw pixels.
    Used by map placement and brush-preview logic to understand how many tiles a sprite covers.
    These values are recalculated from the mount point and image dimensions whenever a sprite is saved or reloaded from the database.

  - `mount_x`, `mount_y`
    Sprite anchor point in source-image pixel coordinates.
    Used to align the sprite correctly to a map tile when painting or previewing.
    In the map, the selected grid cell acts as the sprite's anchor tile. The renderer takes the center of that tile, then subtracts `mount_x` and `mount_y` from the sprite image position to decide exactly where the sprite image should land across one or more tiles. This is what lets the "feet" or intended base of a tree, character, or object stay attached to the chosen tile while the rest of the sprite can extend above, below, left, or right of it.

  - `bounding_x`, `bounding_y`, `bounding_w`, `bounding_h`
    Tight sprite-content bounding box expressed relative to the mount point.
    `bounding_x` and `bounding_y` are offsets from the mount point, so they are often negative when the sprite extends left/up from the mount.
    `bounding_w` and `bounding_h` are the width and height of the trimmed box in source-image pixels.
    The box is derived by trimming edge columns and edge rows whose average alpha is at most 10% opaque, which is equivalent to treating them as at least 90% transparent.
    After trimming, the left/top/right/bottom edges are snapped to tile-space boundaries, and the stored width/height are derived from those snapped edges so the metadata stays aligned to the sprite's tile grid on all sides.
    These values are recalculated from `image_data` whenever a sprite is saved and are also backfilled during sprite reads if older metadata is missing or stale.

  - `on_activate`
    Sprite activation script or command text.
    Stored as text in `sprite_metadata`.
    Defaults to an empty string when missing.

  - `is_locked`
    Boolean flag indicating the sprite should be treated as locked for editing or interaction workflows.
    Defaults to `false` when missing.

  - `casts_shadow`
    Boolean flag indicating whether the sprite should be considered a shadow-casting object.
    Defaults to `true` when missing.

  - `offset_x`, `offset_y`
    Extra placement offsets in pixels.
    Used to nudge the sprite render position relative to the mount point.

  - `is_flat`
    Boolean flag indicating whether the sprite should behave like a flatter ground-aligned asset.
    Intended for rendering or placement behaviors that may differ from upright/tall sprites.

  - `impassible`
    Boolean flag marking whether the sprite should be treated as blocking movement.
    This is metadata for gameplay/pathing-aware systems rather than current image rendering.

  - `item_id`
    Numeric id reserved for linking a sprite to an item/system id.
    Useful when sprite assets need stable integration points beyond filename or display name.

  In short, `sprite_metadata` stores the sprite's editable placement, sizing, derived footprint/bounds metadata, and semantic behavior fields, while the actual sprite PNG bytes live in `image_data`.

- `created_at timestamptz not null default now()`
  Row creation timestamp.

- `updated_at timestamptz not null default now()`
  Row last-update timestamp.

#### Indexes

- unique index on `asset_key`
- `map_tiles_asset_type_folder_name_idx`
  `(asset_type, sub_folder, asset_name)`

- `map_tiles_asset_type_slug_idx`
  `(asset_type, asset_slug)`

- `map_tiles_asset_type_file_idx`
  `(asset_type, sub_folder, file_name)`

These support:

- folder browsing
- tile lookup by slug
- sprite lookup by folder plus filename

### `map_maps`

Primary map header table.

This table stores one row per map and keeps the top-level properties separated from the per-cell placement rows.

#### Columns

- `id uuid primary key`
  Stable row id generated in application code with `randomUUID()`.

- `slug text not null unique`
  Stable application-facing map id used in URLs and editor state.

- `name text not null`
  Human-readable map name shown in the UI.

- `width integer not null`
  Map width in tiles.

- `height integer not null`
  Map height in tiles.

- `deleted boolean not null default false`
  Soft-delete flag for maps.
  Active map queries should ignore rows where `deleted = true`.

- `mini_map bytea null`
  PNG image preview for the full published map.
  Current save behavior renders the composed map with gridlines disabled, then scales it to fit within `512x512` while preserving aspect ratio and using high-quality image smoothing before storing the bytes here.

- `is_instance boolean not null default false`
  Boolean flag reserved for instance maps.

- `created_at timestamptz not null default now()`
  Row creation timestamp.

- `updated_at timestamptz not null default now()`
  Row last-update timestamp.

#### Indexes

- unique index on `slug`
- `map_maps_deleted_updated_idx`
  `(deleted, updated_at desc)`

This supports:

- loading the active map list
- returning recently updated non-deleted maps first

### `map_map_assets`

Flat placement table for the contents of a map.

This table stores one row per occupied cell per layer.
Empty cells are not stored.

The design is intentionally flat:

- map identity lives in `map_maps`
- one placement row represents one tile or one sprite at a concrete coordinate
- placement options are stored in scalar columns instead of a JSON blob

#### Columns

- `id uuid primary key`
  Stable placement row id generated in application code with `randomUUID()`.

- `map_id uuid not null`
  Foreign key to `map_maps.id`.
  Uses `on delete cascade` so removing a map row can also remove its placements.

- `layer_index integer not null`
  Zero-based map layer index for this placement.

- `tile_x integer not null`
  Zero-based horizontal map coordinate.

- `tile_y integer not null`
  Zero-based vertical map coordinate.

- `asset_type text not null`
  Placement discriminator.
  Current values:
  `tile`, `sprite`

- `tile_asset_id uuid null`
  Foreign key to `map_tiles.id` for tile placements.
  Normally null for sprite rows.

- `sprite_asset_id uuid null`
  Foreign key to `map_tiles.id` for sprite placements.
  Normally null for tile rows.

- `slot_num integer not null default 0`
  Selected tile slot/variant index for tile placements.
  Current app behavior places slot `0` for the main tile image.
  The schema already supports future alternative placement:
  `0` = main
  `1` = alternative 1
  `2` = alternative 2
  and so on.
  Sprite rows currently use `0`.

  For map rendering, this is the field that tells the renderer which tile slot to use.
  The lookup path is:
  `map_map_assets.tile_asset_id` -> matching `map_tiles` row -> `map_tiles.tile_slots[slot_num]`
  The renderer then uses that selected slot's flattened `pixels` image data.
  If the requested slot does not have a usable flattened image, current app behavior falls back to slot `0` (`Main`).

- `color_enabled boolean not null default false`
  Whether the tile color overlay option is active.

- `color_value text not null default '#ffffff'`
  Hex color used by color or multiply brush options.

- `multiply_enabled boolean not null default false`
  Whether the multiply blend option is active.

- `flip_horizontal boolean not null default false`
  Whether the tile is mirrored horizontally.

- `flip_vertical boolean not null default false`
  Whether the tile is mirrored vertically.

- `rotate_quarter_turns integer not null default 0`
  Rotation stored as quarter turns to keep the schema flat.
  Current meaning:
  `0` = no rotation
  `1` = 90 degrees
  `2` = 180 degrees
  `3` = 270 degrees

- `created_at timestamptz not null default now()`
  Row creation timestamp.

- `updated_at timestamptz not null default now()`
  Row last-update timestamp.

#### Constraints

- unique `(map_id, layer_index, tile_x, tile_y)`

This means there can be at most one stored placement for a given map/layer/cell combination.

#### Indexes

- `map_map_assets_map_layer_idx`
  `(map_id, layer_index)`

- `map_map_assets_tile_asset_idx`
  `(tile_asset_id)`

- `map_map_assets_sprite_asset_idx`
  `(sprite_asset_id)`

These support:

- loading one map and its placements efficiently
- tracing tile usage across maps
- tracing sprite usage across maps

## Soft Delete Behavior

Tile and sprite deletes are currently soft deletes.

When a user deletes an asset from the Tile Library:

- the row remains in `map_tiles`
- `deleted` is set to `true`
- `asset_name` is renamed to `_` plus the prior name
- for sprites, `sprite_metadata.name` is also prefixed with `_`

Active asset queries should filter out `deleted = true` rows unless the task specifically needs deleted-history behavior.

## Tile Alternative Images

The tile alternative images are not stored as separate binary rows right now.

Instead, tile image variation data is embedded inside `map_tiles.tile_slots` for `tile` rows:

- each tile has five slots
- each slot stores layered PNG data URLs in `layers`
- each slot also stores a flattened combined PNG data URL in `pixels`

So the current storage model is:

- `image_data`:
  only the tile thumbnail strip PNG used in the Tile Library card

- `tile_slots`:
  the real editable tile imagery, including layered variants and flattened slot output

### How A Map Cell Finds An Alternate Tile Image

For a tile placement in a map, the renderer should resolve the image in this order:

1. Read the placement row from `map_map_assets`.
2. Confirm `asset_type = 'tile'`.
3. Use `tile_asset_id` to load the matching tile row in `map_tiles`.
4. Read `slot_num` from the same `map_map_assets` row.
5. Select `map_tiles.tile_slots[slot_num]`.
6. Use that slot's flattened `pixels` value as the tile image to render.

Current fallback rule in app code:

- if `tile_slots[slot_num]` is missing or does not have a usable `pixels` image, fall back to `tile_slots[0]`
- `tile_slots[0]` is the `Main` slot

So the map does not store the alternate image itself.
It stores:

- which tile row to use: `tile_asset_id`
- which variation inside that tile row to use: `slot_num`

The actual image bytes/data remain inside the referenced `map_tiles.tile_slots` payload.

In practice, the tile "alternative images" live inside the JSONB slot payload, not as separate files and not as separate rows.

If we later move tile slot image payloads out of JSONB and into binary columns or a separate table, this document should be updated immediately.

## Current Scope

Database-backed today:

- tile library folders
- tiles
- sprites
- tile library folder aggregate counts
- maps
- map cell placements and per-placement tile options

Still local/disk-backed today:

- clipboard slots in `data/temp/clipboard-slots.json`
- exports in `exports/`

## Migration Notes

- The app bootstraps `map_tiles` on startup.
- The app also bootstraps `map_maps` and `map_map_assets` on startup.
- If the asset table is empty, it imports legacy assets from:
  - `data/all_tiles.json`
  - legacy `layer_*` folders and sprite files
- If the maps table is empty, it imports legacy map JSON files from:
  - `data/maps/*.json`
- If no legacy maps exist, it creates a starter `Starter Camp` map in the database.
- Folder rows are also created for the library tree so folder browsing does not depend on the local filesystem.

## Maintenance Rule

Whenever the database schema changes, update all of:

- `DATABASE.md`
- `README.md`
- `memory.md`
