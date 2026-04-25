# Item Storage Overview

Short reference for how item records, item images, and item model files are stored today.

This app does not define the full `items` schema locally. It assumes an existing `items` table is already present, reads from it, and adds a `deleted` column if that column is missing.

## Main Storage Split

Items use two storage systems:

- Postgres `items` table for item metadata and asset references
- VAX asset server for binary item files such as images, models, and textures

That means items are not stored like tiles. Tile images live inside this app's Postgres payloads, but item files do not.

## Database Table

### `items`

This table is read directly by the app.

Important fields used by the app:

- `id`, `name`, `slug`
- `item_type`
- `description`, `long_description`
- `base_value`, `durability`, `level`, `storage_capacity`
- `mount_point`, `weapon_grip`, `rarity`, `quality`
- `is_consumable`, `is_container`, `gives_light`
- `width`, `height`, `layer`
- `thumbnail`, `thumbnail2x`
- `model`
- `textures`
- `etag`
- `source`, `source_kind`
- `inserted_at`, `updated_at`
- `deleted`

Practical meaning:

- `thumbnail` and `thumbnail2x` are references, not image bytes
- `model` is a reference/path to the item model, not the model bytes
- `textures` is a list of reference paths, not texture bytes

## Where Item Files Live

The actual item asset files are uploaded to the VAX server, not stored in this repo's database tables.

Default file targets used by this app:

- item image: `/items/<id>/image.png`
- item model: `/items/<id>/model.glb` or `/items/<id>/model.gltf`
- item texture: `/items/<id>/texture.png`

The app uploads those files with authenticated `PUT` requests to `VAX_SERVER`.

## Item Images

Item images are handled as remote PNG files.

Upload behavior:

- the app accepts PNG/JPG/WEBP/GIF uploads
- it resizes the uploaded image into a contained `128x128` PNG
- it uploads the result to `VAX_SERVER/items/<id>/image.png`

Display behavior:

- the item manager displays the image from `VAX_SERVER/items/<id>/image.png`
- the database `thumbnail` or `thumbnail2x` fields act as stored references/indicators that an image exists

So the actual image bytes are remote, while the database stores metadata and possibly returned thumbnail paths.

## Item Models

Model uploads are remote-only.

Accepted formats:

- `.glb`
- `.gltf`

Upload targets:

- `.glb` goes to `/items/<id>/model.glb`
- `.gltf` goes to `/items/<id>/model.gltf`

The `items.model` field is treated as a path/reference. The previewer resolves that path against `VAX_SERVER`, then falls back to:

- `VAX_SERVER/items/<id>/model.glb`
- `VAX_SERVER/items/<id>/model.gltf`

## Item Textures

Textures are also remote-only.

Accepted format:

- PNG only

Upload target:

- `/items/<id>/texture.png`

The `items.textures` field is treated as a list of path references. The previewer tries those paths first, then falls back to:

- `VAX_SERVER/items/<id>/texture.png`

## How The 3D Preview Resolves Assets

Model lookup:

1. Read `items.model`.
2. If it already looks like a full URL, use it directly.
3. If it is a relative path, prefix it with `VAX_SERVER`.
4. If that still does not resolve, try `/items/<id>/model.glb` and `/items/<id>/model.gltf`.

Texture lookup:

1. Read `items.textures`.
2. Resolve each texture path against `VAX_SERVER`.
3. If none work, try `/items/<id>/texture.png`.

## Delete Behavior

Item deletes are soft deletes in the local database view:

- the row remains in `items`
- `deleted` is set to `true`
- reads filter to `deleted = false`

This note only describes the behavior visible in this repo. It does not claim whether the VAX server also deletes remote files.

## R2 Notes

There are `R2_*` environment helpers in this repo, but the item flow does not use them.

For items in this codebase:

- metadata comes from Postgres `items`
- binary files go through `VAX_SERVER`

If VAX itself stores those files in R2 behind the scenes, that happens outside the code shown here.
