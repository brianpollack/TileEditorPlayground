"use client";

import { createContext, useContext } from "react";

import type { SlotKey } from "../lib/slots";
import type {
  ClipboardSlotRecord,
  MapLayerStack,
  MapDesignerUiState,
  MapRecord,
  PaintEditorUiState,
  SpriteRecord,
  SlotRecord,
  TileRecord
} from "../types";

export interface StudioContextValue {
  addClipboardSlot(image: string): { ok: boolean; slotIndex?: number };
  activeMap: MapRecord | null;
  activeMapSlug: string;
  activeSprite: SpriteRecord | null;
  activeSpriteKey: string;
  activeTile: TileRecord | null;
  activeTileSlug: string;
  addTileLibraryFolder(folderPath: string): void;
  clearClipboardSlot(index: number): void;
  clipboardStatus: string;
  clipboardSlots: Array<ClipboardSlotRecord | null>;
  getMapDesignerUiState(mapSlug: string): MapDesignerUiState;
  getMapDraftLayers(
    mapSlug: string,
    fallbackLayers: MapLayerStack | undefined,
    width?: number,
    height?: number
  ): MapLayerStack;
  getPaintEditorUiState(sessionId: string): PaintEditorUiState;
  getTileDraftSlots(tileSlug: string, fallbackSlots: Array<SlotRecord | null> | undefined): Array<SlotRecord | null>;
  initialImagePath: string;
  isClipboardManagerOpen: boolean;
  mapBrushAssetKey: string;
  maps: MapRecord[];
  openPaintEditor(tileRecord: TileRecord, slotKey: SlotKey): void;
  putClipboardSlot(image: string, preferredIndex?: number | null): { ok: boolean; slotIndex?: number };
  removeSprite(spriteKey: string): void;
  removeTile(tileSlug: string): void;
  selectedClipboardSlotIndex: number | null;
  setActiveMapSlug(mapSlug: string): void;
  setClipboardManagerOpen(isOpen: boolean): void;
  setMapDesignerUiState(mapSlug: string, nextState: Partial<MapDesignerUiState>): void;
  setPaintEditorUiState(sessionId: string, nextState: Partial<PaintEditorUiState>): void;
  setSelectedClipboardSlotIndex(index: number | null): void;
  setMapDraftLayers(mapSlug: string, layers: MapLayerStack, width?: number, height?: number): void;
  setActiveSpriteKey(spriteKey: string): void;
  setActiveTileSlug(tileSlug: string): void;
  setMapBrushAssetKey(assetKey: string): void;
  setTileDraftSlots(tileSlug: string, slotRecords: Array<SlotRecord | null>): void;
  sprites: SpriteRecord[];
  tileLibraryFolderAssetCounts: Record<string, number>;
  tileLibraryFolders: string[];
  tiles: TileRecord[];
  upsertSprite(spriteRecord: SpriteRecord): void;
  updateTileDraftSlot(tileSlug: string, slotKey: SlotKey, slotRecord: SlotRecord | null): void;
  upsertMap(mapRecord: MapRecord): void;
  upsertTile(tileRecord: TileRecord): void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

interface StudioProviderProps {
  children: React.ReactNode;
  value: StudioContextValue;
}

export function StudioProvider({ children, value }: StudioProviderProps) {
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const context = useContext(StudioContext);

  if (!context) {
    throw new Error("Studio context is missing.");
  }

  return context;
}
