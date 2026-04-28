"use server";

import { promises as fs } from "node:fs";
import path from "node:path";

import {
  createZoneEventRecord,
  createMapRecord,
  createUniqueSlug,
  normalizeMapPayload,
  readZoneEventRecords,
  readMapRecords,
  updateZoneEventRecord,
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

function decodePngDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:image\/png;base64,(?<payload>.+)$/u);

  if (!match?.groups?.payload) {
    throw new Error("Expected a PNG image to export.");
  }

  return Buffer.from(match.groups.payload, "base64");
}

export async function exportTerrainMapAction(input: {
  dataUrl: string;
}) {
  const outputDirectory = path.resolve(process.cwd(), "../output");
  const fileName = "current_map.png";
  const absolutePath = path.join(outputDirectory, fileName);

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(absolutePath, decodePngDataUrl(input.dataUrl));

  return {
    absolutePath,
    fileName
  };
}

export async function readMapZoneEventsAction(mapName: string) {
  return readZoneEventRecords(mapName);
}

export async function createMapZoneEventAction(input: {
  eventName: string;
  mapName: string;
}) {
  return createZoneEventRecord(input.mapName, input.eventName);
}

export async function saveMapZoneEventAction(input: {
  enabled: boolean;
  eventName: string;
  id: string;
  luaScript: string;
  mapName: string;
}) {
  return updateZoneEventRecord(input.mapName, {
    enabled: input.enabled,
    id: input.id,
    lua_script: input.luaScript,
    zone_event: input.eventName
  });
}
