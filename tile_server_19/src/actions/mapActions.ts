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
import type { MapLayerStack } from "../types";

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
  aboutPrompt: string;
  height: number;
  isInstance?: boolean;
  layers: MapLayerStack;
  miniMap: string;
  name: string;
  slug: string;
  width: number;
}) {
  const nextMap = normalizeMapPayload(
    input.name,
    input.slug,
    input.layers,
    input.miniMap,
    input.aboutPrompt,
    input.isInstance ?? false,
    input.width,
    input.height
  );

  await writeMapRecord(nextMap);

  return nextMap;
}

export async function resizeMapAction(input: {
  aboutPrompt: string;
  currentHeight: number;
  currentWidth: number;
  height: number;
  isInstance?: boolean;
  layers: MapLayerStack;
  miniMap: string;
  name: string;
  slug: string;
  width: number;
}) {
  const existingMaps = await readMapRecords();
  const existingMap = existingMaps.find((mapRecord) => mapRecord.slug === input.slug);

  if (!existingMap) {
    throw new Error("Choose a map before resizing.");
  }

  const currentWidth = normalizeMapDimension(input.currentWidth);
  const currentHeight = normalizeMapDimension(input.currentHeight);
  const nextWidth = normalizeMapDimension(input.width);
  const nextHeight = normalizeMapDimension(input.height);

  if (nextWidth < existingMap.width || nextHeight < existingMap.height) {
    throw new Error("Reducing map size is not supported yet.");
  }

  if (nextWidth < currentWidth || nextHeight < currentHeight) {
    throw new Error("Resize targets must be at least as large as the current draft.");
  }

  const nextMap = normalizeMapPayload(
    input.name,
    input.slug,
    input.layers,
    input.miniMap,
    input.aboutPrompt,
    input.isInstance ?? false,
    nextWidth,
    nextHeight
  );

  await writeMapRecord(nextMap);

  return nextMap;
}
