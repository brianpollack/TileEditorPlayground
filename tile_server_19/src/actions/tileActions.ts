"use server";

import {
  createTileRecord,
  createTileThumbnail,
  ensureTileLibraryFolder,
  exportTileStrip,
  loadProjectImageSource,
  normalizeTilePayload,
  readTileRecords,
  writeTileRecords
} from "../lib/serverStore";
import { normalizeUnderscoreName } from "../lib/naming";
import { normalizeTileLibraryPath } from "../lib/tileLibrary";
import type { SlotRecord } from "../types";

export async function createTileAction(name: string, tilePath: string) {
  return createTileRecord(name, tilePath);
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
    existingTile.path,
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

export async function createTileFolderAction(parentPath: string, name: string) {
  const normalizedParentPath = normalizeTileLibraryPath(parentPath);
  const normalizedName = normalizeUnderscoreName(name);

  if (!normalizedParentPath) {
    throw new Error("Choose a tile library folder before creating a subfolder.");
  }

  if (!normalizedName) {
    throw new Error("Folder name is required.");
  }

  return ensureTileLibraryFolder(`${normalizedParentPath}/${normalizedName}`);
}

export async function exportCombinedSlotsAction(input: {
  slots: Array<SlotRecord | null>;
  tileName: string;
  tileSlug: string;
}) {
  return exportTileStrip(input.tileSlug, input.tileName, input.slots);
}
