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
  options: MapTileOptions;
  tileSlug: string;
}

export type MapLayerCell = MapTilePlacement | null;
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
