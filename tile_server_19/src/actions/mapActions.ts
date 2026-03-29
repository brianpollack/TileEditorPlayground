"use server";

import {
  createMapRecord,
  createUniqueSlug,
  normalizeMapPayload,
  readMapRecords,
  writeMapRecord
} from "../lib/serverStore";
import { normalizeMapDimension } from "../lib/map";
import { normalizeUnderscoreName } from "../lib/naming";

export async function createMapAction(name: string, width: number, height: number) {
  const nextName = normalizeUnderscoreName(name);

  if (!nextName) {
    throw new Error("Map name is required.");
  }

  const existingMaps = await readMapRecords();
  const nextMap = createMapRecord(
    nextName,
    createUniqueSlug(existingMaps, nextName),
    normalizeMapDimension(width),
    normalizeMapDimension(height)
  );

  await writeMapRecord(nextMap);

  return nextMap;
}

export async function saveMapAction(input: {
  cells: string[][];
  height: number;
  name: string;
  slug: string;
  width: number;
}) {
  const nextMap = normalizeMapPayload(
    input.name,
    input.slug,
    input.cells,
    input.width,
    input.height
  );

  await writeMapRecord(nextMap);

  return nextMap;
}
