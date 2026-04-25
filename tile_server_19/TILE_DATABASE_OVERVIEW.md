# Tile Database Overview

Short reference for how tile and map image data is stored today.

For the full schema, see [DATABASE.md](/Users/brian/Projects/GameTiles/tile_server_19/DATABASE.md).

## Main Tables

### `map_tiles`

Holds the tile library assets. One table stores three asset kinds:

- `folder`
- `tile`
- `sprite`

Important columns:

- `asset_type`: tells us whether the row is a folder, tile, or sprite
- `sub_folder`: tile-library folder path
- `asset_slug`: stable tile id for `tile` rows
- `file_name`: sprite filename for `sprite` rows
- `image_data bytea`: binary PNG payload for thumbnails or sprites
- `tile_slots jsonb`: the real editable tile image payload for `tile` rows
- `sprite_metadata jsonb`: sprite placement and behavior metadata for `sprite` rows

### `map_maps`

Stores one row per saved map.

Important columns:

- `slug`, `name`, `width`, `height`
- `mini_map bytea`: PNG bytes for the generated map preview

### `map_map_assets`

Stores the actual painted contents of a map.

Each row is one occupied cell on one layer.

Important columns:

- `map_id`
- `layer_index`
- `tile_x`, `tile_y`
- `asset_type`: `tile` or `sprite`
- `tile_asset_id` or `sprite_asset_id`
- `slot_num`: which tile variant/alt image to use
- flip/color/rotation fields for brush effects

## Where PNG Bytes Live

There are two different storage styles:

### Binary `bytea` columns

Used for raw PNG bytes:

- `map_tiles.image_data`
  - for `tile` rows: the tile's thumbnail strip PNG
  - for `sprite` rows: the actual sprite PNG
- `map_maps.mini_map`
  - the rendered map preview PNG

### JSONB slot payloads

Used for the real editable tile imagery:

- `map_tiles.tile_slots`

Each tile has 5 slots:

- slot `0`: main
- slots `1..4`: alternate/accent images

Each slot stores:

- `layers`: layered PNG data URLs used by Paint Mode
- `pixels`: flattened PNG data URL used for rendering

So tile alt images are not separate rows and not separate files. They live inside `tile_slots`.

## How Alt Images Work

When a map cell uses a tile, the map does not store the tile image itself.

It stores:

- which tile row to use: `map_map_assets.tile_asset_id`
- which slot inside that tile to use: `map_map_assets.slot_num`

Render lookup:

1. Load the `map_map_assets` placement row.
2. Follow `tile_asset_id` to the matching `map_tiles` row.
3. Read `tile_slots[slot_num]`.
4. Use that slot's `pixels` data URL as the rendered tile image.

Current fallback behavior:

- if the requested slot is missing or empty, the app falls back to slot `0`

## Practical Summary

- `map_tiles.image_data` is mostly for thumbnails and sprite binaries
- `map_tiles.tile_slots` holds the actual tile artwork, including alternates
- `map_map_assets.slot_num` chooses which alternate tile image a map cell uses
- `map_maps.mini_map` stores the map preview image
