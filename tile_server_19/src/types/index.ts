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
  isGridVisible: boolean;
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
  impassible: boolean;
  name: string;
  path: string;
  slug: string;
  source: string;
  slots: Array<SlotRecord | null>;
  thumbnail: string;
}

export interface SpriteRecord {
  bounding_h: number;
  bounding_w: number;
  bounding_x: number;
  bounding_y: number;
  casts_shadow: boolean;
  filename: string;
  image_h: number;
  image_w: number;
  impassible: boolean;
  is_flat: boolean;
  is_locked: boolean;
  item_id: number;
  mount_x: number;
  mount_y: number;
  name: string;
  on_activate: string;
  offset_x: number;
  offset_y: number;
  path: string;
  thumbnail: string;
  tile_h: number;
  tile_w: number;
}

export interface MapRecord {
  aboutPrompt: string;
  cells: string[][];
  height: number;
  isInstance: boolean;
  layers: MapLayerStack;
  miniMap: string;
  name: string;
  slug: string;
  updatedAt: string;
  width: number;
}

export interface ItemRecord {
  base_value: number | null;
  character: string | null;
  description: string | null;
  durability: number | null;
  etag: string | null;
  gives_light: number | null;
  height: number | null;
  id: number;
  inserted_at: string;
  is_consumable: boolean | null;
  is_container: boolean | null;
  item_type: string;
  layer: number | null;
  level: number | null;
  long_description: string | null;
  model: string | null;
  mount_point: string | null;
  name: string;
  on_acquire: string | null;
  on_activate: string | null;
  on_consume: string | null;
  on_drop: string | null;
  on_use: string | null;
  quality: string | null;
  rarity: string | null;
  slug: string;
  source: string | null;
  source_kind: string | null;
  storage_capacity: number | null;
  textures: string[];
  thumbnail: string | null;
  thumbnail2x: string | null;
  type: string | null;
  updated_at: string;
  weapon_grip: string | null;
  width: number | null;
}

export interface PersonalityRecord {
  accent: string | null;
  age: number | null;
  aggression: number;
  altruism: number;
  areas_of_expertise: string | null;
  backstory: string | null;
  base_hp: number;
  character_slug: string;
  chat_model: string | null;
  chat_provider: string | null;
  clothing_style: string | null;
  courage: number;
  custom_profile_pic: string | null;
  distinguishing_feature: string | null;
  emotional_range: string | null;
  family_description: string | null;
  fears: string | null;
  gender: "M" | "F" | "NB";
  goals: string | null;
  gold: number;
  goodness: number;
  hidden_desires: string | null;
  honesty: number;
  impulsiveness: number;
  inserted_at: string;
  llm_prompt_base: string | null;
  loyalty: number;
  mannerisms: string | null;
  name: string;
  other_world_knowledge: string | null;
  optimism: number;
  physical_description: string | null;
  reputation: number;
  role: string | null;
  secrets_you_know: string | null;
  smalltalk_topics_enjoyed: string | null;
  sociability: number;
  specialties: string | null;
  speech_pattern: string | null;
  speech_style: string | null;
  summary: string | null;
  temperament: string | null;
  things_you_can_share: string | null;
  titles: string | null;
  updated_at: string;
  voice_id: string | null;
}

export interface PersonalityEventRecord {
  enabled: boolean;
  event_details: Record<string, unknown>;
  event_type: "tool";
  id: string;
  inserted_at: string;
  lua_script: string;
  name: string;
  personality_id: string;
  response_context: string;
  updated_at: string;
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
