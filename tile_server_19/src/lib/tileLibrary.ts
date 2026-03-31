export interface TileLibraryLayer {
  description: string;
  folder: string;
  index: number;
}

export interface TileLibraryBreadcrumb {
  label: string;
  path: string;
}

export const TILE_LIBRARY_LAYERS: TileLibraryLayer[] = [
  { description: "Base Terrain", folder: "layer_0", index: 0 },
  { description: "Decoration", folder: "layer_1", index: 1 },
  { description: "Environmental", folder: "layer_2", index: 2 },
  { description: "Non moveable items", folder: "layer_3", index: 3 },
  { description: "Critters", folder: "layer_4", index: 4 },
  { description: "Items", folder: "layer_5", index: 5 },
  { description: "Actors and Characters", folder: "layer_6", index: 6 },
  { description: "Effects", folder: "layer_7", index: 7 },
  { description: "Other", folder: "layer_8", index: 8 }
];

export const DEFAULT_TILE_LIBRARY_PATH = "layer_8";
export const TILE_LIBRARY_ROOT_LABEL = "Layers";

function sanitizePathSegment(segment: string) {
  return segment
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/gu, "_")
    .replace(/_+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

export function normalizeTileLibraryPath(path: string | undefined) {
  if (typeof path !== "string") {
    return "";
  }

  return path
    .split(/[\\/]+/u)
    .map(sanitizePathSegment)
    .filter(Boolean)
    .join("/");
}

export function normalizeTileRecordPath(path: string | undefined) {
  return normalizeTileLibraryPath(path) || DEFAULT_TILE_LIBRARY_PATH;
}

export function getTileLibrarySpriteKey(path: string | undefined, filename: string | undefined) {
  const normalizedFilename = typeof filename === "string" ? filename.trim() : "";

  if (!normalizedFilename) {
    return "";
  }

  return `${normalizeTileRecordPath(path)}/${normalizedFilename}`;
}

export function splitTileLibraryPath(path: string | undefined) {
  const normalized = normalizeTileLibraryPath(path);
  return normalized ? normalized.split("/") : [];
}

export function getTileLibraryLayer(path: string | undefined) {
  const [layerFolder] = splitTileLibraryPath(path);
  return TILE_LIBRARY_LAYERS.find((layer) => layer.folder === layerFolder) ?? null;
}

export function tileLibraryPathSupportsSprites(path: string | undefined) {
  const layer = getTileLibraryLayer(path);

  if (!layer) {
    return false;
  }

  return layer.index > 0;
}

export function getTileLibraryLayerLabel(layer: TileLibraryLayer) {
  return `${layer.index} - ${layer.description}`;
}

export function getTileLibrarySegmentLabel(path: string | undefined) {
  const segments = splitTileLibraryPath(path);
  const segment = segments.at(-1) ?? "";

  if (!segment) {
    return TILE_LIBRARY_ROOT_LABEL;
  }

  if (segments.length === 1) {
    const layer = getTileLibraryLayer(segment);

    if (layer) {
      return getTileLibraryLayerLabel(layer);
    }
  }

  return segment;
}

export function getTileLibraryBreadcrumbs(path: string | undefined): TileLibraryBreadcrumb[] {
  const segments = splitTileLibraryPath(path);
  const breadcrumbs: TileLibraryBreadcrumb[] = [{ label: TILE_LIBRARY_ROOT_LABEL, path: "" }];

  for (let index = 0; index < segments.length; index += 1) {
    const nextPath = segments.slice(0, index + 1).join("/");
    breadcrumbs.push({
      label: getTileLibrarySegmentLabel(nextPath),
      path: nextPath
    });
  }

  return breadcrumbs;
}

export function getTileLibraryParentPath(path: string | undefined) {
  const segments = splitTileLibraryPath(path);

  if (segments.length <= 1) {
    return "";
  }

  return segments.slice(0, -1).join("/");
}

export function formatTileLibraryPath(path: string | undefined) {
  const normalized = normalizeTileLibraryPath(path);
  return normalized ? `${normalized}/` : "/";
}
