# Agent Memory

- Keep [DATABASE.md](/Users/brian/Projects/GameTiles/tile_server_19/DATABASE.md) up to date whenever any database table schema, column meaning, index, serialization rule, or migration behavior changes.
- When database schema changes land, update both `DATABASE.md` and `README.md` in the same task.
- Sprite bounds now live in `map_tiles.sprite_metadata` as mount-relative `bounding_x`, `bounding_y`, `bounding_w`, and `bounding_h`, and the save/read path is responsible for backfilling them from sprite PNG alpha data.
- Sprite metadata also carries `on_activate`, `is_locked`, and `casts_shadow` with defaults of `""`, `false`, and `true`.
