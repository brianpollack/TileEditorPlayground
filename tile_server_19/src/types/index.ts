export interface SlotRecord {
  layers: Array<string | null>;
  pixels: string;
  size: number;
  source_x: number;
  source_y: number;
}

export interface PaintEditorSession {
  backupSlot: SlotRecord | null;
  id: string;
  slotKey: "main" | "0" | "1" | "2" | "3";
  title: string;
  tileSlug: string;
}

export type PaintToolId =
  | "brush"
  | "eraser"
  | "eyedropper"
  | "fill"
  | "marquee"
  | "pencil"
  | "stamp";

export type PaintLayerIndex = 0 | 1 | 2 | 3 | 4;

export interface PaintEditorUiState {
  layerVisibilities: number[];
  paintColor: string;
  selectedLayerIndex: PaintLayerIndex;
  selectedTool: PaintToolId;
  zoomPercent: number;
}

export interface MapDesignerUiState {
  activeLayerIndex: number;
  layerVisibilities: number[];
  scrollLeft: number;
  scrollTop: number;
  zoomPercent: number | null;
}

export interface MapTileOptions {
  color: boolean;
  colorValue: string;
  flipHorizontal: boolean;
  flipVertical: boolean;
  multiply: boolean;
  rotate180: boolean;
  rotate270: boolean;
  rotate90: boolean;
}

export interface MapTilePlacement {
  kind: "tile";
  options: MapTileOptions;
  slotNum: number;
  tileSlug: string;
}

export interface MapSpritePlacement {
  kind: "sprite";
  spriteKey: string;
}

export type MapAssetPlacement = MapTilePlacement | MapSpritePlacement;
export type MapLayerCell = MapAssetPlacement | null;
export type MapLayerGrid = MapLayerCell[][];
export type MapLayerStack = MapLayerGrid[];

export interface TileRecord {
  name: string;
  path: string;
  slug: string;
  source: string;
  slots: Array<SlotRecord | null>;
  thumbnail: string;
}

export interface SpriteRecord {
  filename: string;
  image_h: number;
  image_w: number;
  impassible: boolean;
  is_flat: boolean;
  item_id: number;
  mount_x: number;
  mount_y: number;
  name: string;
  offset_x: number;
  offset_y: number;
  path: string;
  thumbnail: string;
  tile_h: number;
  tile_w: number;
}

export interface MapRecord {
  cells: string[][];
  height: number;
  layers: MapLayerStack;
  name: string;
  slug: string;
  updatedAt: string;
  width: number;
}

export interface ClipboardSlotRecord {
  createdAt: string;
  image: string;
}

export interface SelectedRegion {
  size: number;
  x: number;
  y: number;
}

export interface TileCell {
  tileX: number;
  tileY: number;
}

export interface PreviewPlacement {
  slotIndex: number;
  tileX: number;
  tileY: number;
}

export interface LoadedImagePayload {
  dataUrl: string;
  name: string;
  sourcePath: string;
}

export interface ExportArtifact {
  absolutePath: string;
  dataUrl: string;
  fileName: string;
}
