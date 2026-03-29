"use client";

import { createContext, useContext } from "react";

import type { SlotKey } from "../lib/slots";
import type {
  ClipboardSlotRecord,
  MapRecord,
  PaintEditorUiState,
  SlotRecord,
  TileRecord
} from "../types";

export interface StudioContextValue {
  addClipboardSlot(image: string): { ok: boolean; slotIndex?: number };
  activeMap: MapRecord | null;
  activeMapSlug: string;
  activeTile: TileRecord | null;
  activeTileSlug: string;
  clearClipboardSlot(index: number): void;
  clipboardStatus: string;
  clipboardSlots: Array<ClipboardSlotRecord | null>;
  getMapDraftCells(
    mapSlug: string,
    fallbackCells: string[][] | undefined,
    width?: number,
    height?: number
  ): string[][];
  getPaintEditorUiState(sessionId: string): PaintEditorUiState;
  getTileDraftSlots(tileSlug: string, fallbackSlots: Array<SlotRecord | null> | undefined): Array<SlotRecord | null>;
  initialImagePath: string;
  isClipboardManagerOpen: boolean;
  mapBrushTileSlug: string;
  maps: MapRecord[];
  openPaintEditor(tileRecord: TileRecord, slotKey: SlotKey): void;
  putClipboardSlot(image: string, preferredIndex?: number | null): { ok: boolean; slotIndex?: number };
  selectedClipboardSlotIndex: number | null;
  setActiveMapSlug(mapSlug: string): void;
  setClipboardManagerOpen(isOpen: boolean): void;
  setPaintEditorUiState(sessionId: string, nextState: Partial<PaintEditorUiState>): void;
  setSelectedClipboardSlotIndex(index: number | null): void;
  setMapDraftCells(mapSlug: string, cells: string[][], width?: number, height?: number): void;
  setActiveTileSlug(tileSlug: string): void;
  setMapBrushTileSlug(tileSlug: string): void;
  setTileDraftSlots(tileSlug: string, slotRecords: Array<SlotRecord | null>): void;
  tiles: TileRecord[];
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
