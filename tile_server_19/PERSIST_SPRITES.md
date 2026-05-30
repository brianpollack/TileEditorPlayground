# Persistent Sprite IDs

Placed sprites have two different identities:

- `sprite_asset_id` points to the source sprite asset in `map_tiles`.
- `sprite_instance_id` identifies one placed copy of that sprite on a map.

This matters because the same sprite asset can be placed many times. A tree, door,
NPC, or chest may share artwork and default behavior with other copies, but once it
is placed on a map it can also become a specific entity.

## Storage

Sprite placements live in `map_map_assets`.

For rows where `asset_type = 'sprite'`:

- `sprite_asset_id` is the reusable sprite definition.
- `sprite_instance_id` is the persistent ID for this placed sprite.

Tile rows leave `sprite_instance_id` null.

The database row `id` is not the stable sprite identity. Map saves can rebuild
placement rows, which gives those rows fresh primary keys. The durable identity is
`sprite_instance_id`, and the map save/load path preserves it.

## Behavior

New sprite placement:

- Painting a sprite creates a fresh `sprite_instance_id`.
- Painting the same source sprite again creates another fresh `sprite_instance_id`.
- Painting a line creates a fresh `sprite_instance_id` for each placed sprite.

Move tool:

- Moving a sprite keeps the same `sprite_instance_id`.
- The sprite remains the same placed entity at a new coordinate.

Eyedropper:

- Sampling a sprite copies only the source sprite asset into the brush.
- It does not copy the sampled placement's `sprite_instance_id`.

Undo/redo:

- Undo snapshots preserve the placement object, including `sprite_instance_id`.

## Event Lookup Example

To get the sprite-specific `on_activate` event for the sprite placed at tile
`10,17`, first find the placement row for that map coordinate. Then look for an
instance-scoped event using the placement's `sprite_instance_id`.

```sql
select
  event.id,
  event.event_id,
  event.enabled,
  event.lua_script,
  placement.sprite_instance_id
from map_map_assets placement
join sprite_events event
  on event.sprite_id = placement.sprite_asset_id
 and event.sprite_instance_id = placement.sprite_instance_id
where placement.map_id = :map_id
  and placement.asset_type = 'sprite'
  and placement.tile_x = 10
  and placement.tile_y = 17
  and event.event_id = 'on_activate';
```

If that query returns no row, fall back to the global event for the same sprite
asset:

```sql
select
  event.id,
  event.event_id,
  event.enabled,
  event.lua_script
from map_map_assets placement
join sprite_events event
  on event.sprite_id = placement.sprite_asset_id
 and event.sprite_instance_id is null
where placement.map_id = :map_id
  and placement.asset_type = 'sprite'
  and placement.tile_x = 10
  and placement.tile_y = 17
  and event.event_id = 'on_activate';
```

## Why This Exists

`sprite_events` can now represent both shared and instance-specific behavior. Rows
where `sprite_instance_id` is null apply globally to the source sprite asset. Rows
where `sprite_instance_id` is set apply only to that placed sprite.

Persistent sprite instance IDs make it possible to add instance-specific behavior
without confusing asset identity with placed-entity identity.
