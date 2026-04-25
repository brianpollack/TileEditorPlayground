"use server";

import {
  createTileRecord,
  ensureTileLibraryFolder,
  exportTileStrip,
  loadProjectImageSource,
  saveTileRecord
} from "../lib/serverStore";
import { normalizeUnderscoreName } from "../lib/naming";
import { normalizeTileLibraryPath } from "../lib/tileLibrary";
import type { SlotRecord } from "../types";

export async function createTileAction(name: string, tilePath: string, impassible = false) {
  return createTileRecord(name, tilePath, impassible);
}

export async function saveTileAction(input: {
  impassible: boolean;
  slots: Array<SlotRecord | null>;
  slug: string;
  source: string;
}) {
  return saveTileRecord(input);
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
