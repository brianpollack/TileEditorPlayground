import { randomUUID } from "node:crypto";

import { getDatabase } from "./database";
import { readMapRecords } from "./serverStore";
import type { MapPathPoint, MapPathRecord } from "../types";

interface StoredMapPathRow {
  id: string;
  inserted_at: Date | string;
  map_name: string;
  name: string;
  points: unknown;
  updated_at: Date | string;
}

function serializeStoredTimestamp(value: Date | string | undefined) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  return new Date().toISOString();
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeOptionalInteger(value: unknown, minimum?: number, maximum?: number) {
  const numericValue =
    typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;

  if (!Number.isInteger(numericValue)) {
    return null;
  }

  if (typeof minimum === "number" && numericValue < minimum) {
    return null;
  }

  if (typeof maximum === "number" && numericValue > maximum) {
    return null;
  }

  return numericValue;
}

function normalizeMapName(value: unknown) {
  const normalizedName = normalizeOptionalText(value);

  if (!normalizedName) {
    throw new Error("Map name is required.");
  }

  return normalizedName;
}

function normalizeMapPathPoint(value: unknown): MapPathPoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<MapPathPoint>;
  const tileX = normalizeOptionalInteger(record.tileX, 0);
  const tileY = normalizeOptionalInteger(record.tileY, 0);

  if (tileX == null || tileY == null) {
    return null;
  }

  return { tileX, tileY };
}

function normalizeMapPathPoints(value: unknown): MapPathPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((point) => {
    const normalizedPoint = normalizeMapPathPoint(point);
    return normalizedPoint ? [normalizedPoint] : [];
  });
}

function normalizeMapPathName(value: unknown) {
  const normalizedName = normalizeOptionalText(value);

  if (!normalizedName) {
    throw new Error("Path name is required.");
  }

  return normalizedName;
}

function normalizeMapPathId(value: unknown) {
  const normalizedId = normalizeOptionalText(value);

  if (!normalizedId) {
    throw new Error("Path id is required.");
  }

  return normalizedId;
}

function mapRowToMapPathRecord(row: StoredMapPathRow): MapPathRecord {
  return {
    id: row.id,
    inserted_at: serializeStoredTimestamp(row.inserted_at),
    map_name: typeof row.map_name === "string" ? row.map_name.trim() : "",
    name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : `path_${row.id}`,
    points: normalizeMapPathPoints(row.points),
    updated_at: serializeStoredTimestamp(row.updated_at)
  };
}

async function ensureMapPathsTableExists() {
  await readMapRecords();
  const db = await getDatabase();
  const hasMapPathsTable = await db.schema.hasTable("map_paths");

  if (!hasMapPathsTable) {
    throw new Error("map_paths table not found.");
  }

  return db;
}

export async function readMapPathRecords(mapName: string): Promise<MapPathRecord[]> {
  const normalizedMapName = normalizeMapName(mapName);
  const db = await ensureMapPathsTableExists();
  const rows = await db<StoredMapPathRow>("map_paths")
    .select("*")
    .where({ map_name: normalizedMapName })
    .orderBy([
      { column: "inserted_at", order: "asc" },
      { column: "name", order: "asc" },
      { column: "id", order: "asc" }
    ]);

  return rows.map(mapRowToMapPathRecord);
}

export async function createMapPathRecord(mapName: string, requestedName?: string) {
  const normalizedMapName = normalizeMapName(mapName);
  const db = await ensureMapPathsTableExists();
  const existingPaths = await db<StoredMapPathRow>("map_paths")
    .select("name")
    .where({ map_name: normalizedMapName });
  const takenNames = new Set(existingPaths.map((row) => row.name.trim()).filter(Boolean));
  const baseName = normalizeOptionalText(requestedName) ?? "new_path";
  let nextName = baseName;
  let suffix = 2;

  while (takenNames.has(nextName)) {
    nextName = `${baseName}_${suffix}`;
    suffix += 1;
  }

  const timestamp = new Date();
  const [createdPath] = await db<StoredMapPathRow>("map_paths")
    .insert({
      id: randomUUID(),
      inserted_at: timestamp,
      map_name: normalizedMapName,
      name: nextName,
      points: JSON.stringify([]),
      updated_at: timestamp
    })
    .returning("*");

  if (!createdPath) {
    throw new Error("Could not create map path.");
  }

  return mapRowToMapPathRecord(createdPath);
}

export async function updateMapPathRecord(input: {
  id: string;
  mapName: string;
  name: string;
  points: MapPathPoint[];
}) {
  const normalizedMapName = normalizeMapName(input.mapName);
  const pathId = normalizeMapPathId(input.id);
  const pathName = normalizeMapPathName(input.name);
  const points = normalizeMapPathPoints(input.points);
  const db = await ensureMapPathsTableExists();
  const conflictingPath = await db<StoredMapPathRow>("map_paths")
    .select("id")
    .first()
    .where({ map_name: normalizedMapName, name: pathName })
    .whereNot({ id: pathId });

  if (conflictingPath) {
    throw new Error(`Path ${pathName} already exists for ${normalizedMapName}.`);
  }

  const [updatedPath] = await db<StoredMapPathRow>("map_paths")
    .where({ id: pathId, map_name: normalizedMapName })
    .update({
      name: pathName,
      points: JSON.stringify(points),
      updated_at: new Date()
    })
    .returning("*");

  if (!updatedPath) {
    throw new Error("Map path not found.");
  }

  return mapRowToMapPathRecord(updatedPath);
}
