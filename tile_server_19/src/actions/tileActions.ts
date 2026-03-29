"use server";

import {
  createTileThumbnail,
  createUniqueSlug,
  exportTileStrip,
  loadProjectImageSource,
  normalizeTilePayload,
  readTileRecords,
  writeTileRecords
} from "../lib/serverStore";
import { normalizeUnderscoreName } from "../lib/naming";
import { normalizeSlotRecords } from "../lib/slots";
import type { SlotRecord } from "../types";

export async function createTileAction(name: string) {
  const nextName = normalizeUnderscoreName(name);

  if (!nextName) {
    throw new Error("Tile name is required.");
  }

  const tileRecords = await readTileRecords();
  const nextTile = normalizeTilePayload(
    nextName,
    createUniqueSlug(tileRecords, nextName),
    "",
    normalizeSlotRecords(undefined),
    ""
  );

  tileRecords.push(nextTile);
  await writeTileRecords(tileRecords);

  return nextTile;
}

export async function saveTileAction(input: {
  slots: Array<SlotRecord | null>;
  slug: string;
  source: string;
}) {
  const tileRecords = await readTileRecords();
  const tileIndex = tileRecords.findIndex((tileRecord) => tileRecord.slug === input.slug.trim());

  if (tileIndex === -1) {
    throw new Error("Tile not found.");
  }

  const existingTile = tileRecords[tileIndex];
  const nextTile = normalizeTilePayload(
    existingTile.name,
    existingTile.slug,
    input.source,
    input.slots,
    createTileThumbnail(input.slots)
  );

  tileRecords[tileIndex] = nextTile;
  await writeTileRecords(tileRecords);

  return nextTile;
}

export async function loadProjectImageAction(projectPath: string) {
  return loadProjectImageSource(projectPath);
}

export async function exportCombinedSlotsAction(input: {
  slots: Array<SlotRecord | null>;
  tileName: string;
  tileSlug: string;
}) {
  return exportTileStrip(input.tileSlug, input.tileName, input.slots);
}
