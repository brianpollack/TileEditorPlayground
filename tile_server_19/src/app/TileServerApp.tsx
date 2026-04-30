"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { faClipboard } from "@awesome.me/kit-a62459359b/icons/classic/solid";

import { ClipboardManager } from "../components/ClipboardManager";
import { CharacterEventsManager } from "../components/CharacterEventsManager";
import { FontAwesomeIcon } from "../components/FontAwesomeIcon";
import { ItemManager } from "../components/ItemManager";
import { MapDesigner } from "../components/MapDesigner";
import { PaintMode } from "../components/PaintMode";
import { PersonalityEventsManager } from "../components/PersonalityEventsManager";
import { PersonalityManager } from "../components/PersonalityManager";
import { SpriteEventsManager } from "../components/SpriteEventsManager";
import { TileWorkshop } from "../components/TileWorkshop";
import { MAP_LAYER_COUNT, SLOT_LAYER_COUNT } from "../lib/constants";
import { loadImageFromUrl, revokeObjectUrl } from "../lib/images";
import { clampMapScalePercent, normalizeMapLayers } from "../lib/map";
import { describeSlot, getSlotIndex, normalizeSlotRecords, type SlotKey } from "../lib/slots";
import {
  getTileLibraryAncestorPaths,
  getTileLibrarySpriteKey,
  normalizeTileLibraryPath
} from "../lib/tileLibrary";
import { StudioProvider } from "./StudioContext";
import type {
  ClipboardSlotRecord,
  ItemRecord,
  LoadedImagePayload,
  MapLayerStack,
  MapDesignerUiState,
  MapRecord,
  PaintLayerIndex,
  PaintEditorSession,
  PaintEditorUiState,
  PaintToolId,
  PersonalityRecord,
  SpriteRecord,
  SlotRecord,
  TileRecord
} from "../types";

type StudioView =
  | "tile-workshop"
  | "sprite-editor"
  | "sprite-events"
  | "map-designer"
  | "character-events"
  | "item-manager"
  | "personality-events"
  | "personality-manager";
type StudioViewId = StudioView | PaintEditorSession["id"];
const CLIPBOARD_SLOT_COUNT = 10;
const CLIPBOARD_SAVE_PATH = "/__clipboard/save";
const DEFAULT_PAINT_COLOR = "#142127";
const DEFAULT_PAINT_LAYER_INDEX = 1;
const DEFAULT_PAINT_TOOL: PaintToolId = "pencil";
const DEFAULT_PAINT_ZOOM_PERCENT = 100;
const DEFAULT_SIDEBAR_EXPANDED = true;
const STUDIO_STATE_STORAGE_KEY = "tile-server-19:studio-state";

function isSlotKey(value: string): value is SlotKey {
  return value === "main" || value === "0" || value === "1" || value === "2" || value === "3";
}

function createPaintEditorId(tileSlug: string, slotKey: SlotKey) {
  return `paint:${tileSlug}:${slotKey}` as const;
}

function serializePaintEditorKey(tileSlug: string, slotKey: SlotKey) {
  return `${tileSlug}:${slotKey}`;
}

function parsePaintEditorKey(value: string) {
  const [tileSlug, slotKey] = value.split(":");

  if (!tileSlug || !slotKey || !isSlotKey(slotKey)) {
    return null;
  }

  return { slotKey, tileSlug };
}

function getPaintEditorSession(
  tileRecord: TileRecord,
  slotKey: SlotKey,
  slotDraft: SlotRecord | null
): PaintEditorSession {
  return {
    backupSlot: slotDraft ? { ...slotDraft, layers: slotDraft.layers.slice() } : null,
    id: createPaintEditorId(tileRecord.slug, slotKey),
    slotKey,
    tileSlug: tileRecord.slug,
    title: `${tileRecord.slug} ${describeSlot(slotKey)}`
  };
}

function parsePaintEditorList(serializedPaintEditors: string, tileRecords: TileRecord[]) {
  const keys = serializedPaintEditors
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const sessions: PaintEditorSession[] = [];

  for (const key of keys) {
    const parsed = parsePaintEditorKey(key);

    if (!parsed) {
      continue;
    }

    const tileRecord = tileRecords.find((candidate) => candidate.slug === parsed.tileSlug);

    if (!tileRecord) {
      continue;
    }

    if (sessions.some((session) => session.id === createPaintEditorId(parsed.tileSlug, parsed.slotKey))) {
      continue;
    }

    const slotDraft = normalizeSlotRecords(tileRecord.slots)[getSlotIndex(parsed.slotKey)];
    sessions.push(getPaintEditorSession(tileRecord, parsed.slotKey, slotDraft));
  }

  return sessions;
}

function getInitialActiveView(
  serializedMode: string,
  initialPaintSessions: PaintEditorSession[],
  hasInitialSpriteSelection: boolean
): StudioViewId {
  const normalizedMode = serializedMode.trim();

  if (normalizedMode === "map") {
    return "map-designer";
  }

  if (normalizedMode === "item_manager") {
    return "item-manager";
  }

  if (normalizedMode === "personality_manager") {
    return "personality-manager";
  }

  if (normalizedMode === "personality_events") {
    return "personality-events";
  }

  if (normalizedMode === "character_events") {
    return "character-events";
  }

  if (normalizedMode === "sprite" && hasInitialSpriteSelection) {
    return "sprite-editor";
  }

  if (normalizedMode === "sprite_events" && hasInitialSpriteSelection) {
    return "sprite-events";
  }

  if (normalizedMode === "tile") {
    return "tile-workshop";
  }

  if (normalizedMode.startsWith("paint:")) {
    const parsed = parsePaintEditorKey(normalizedMode.slice("paint:".length));

    if (parsed) {
      const paintEditorId = createPaintEditorId(parsed.tileSlug, parsed.slotKey);

      if (initialPaintSessions.some((session) => session.id === paintEditorId)) {
        return paintEditorId;
      }
    }
  }

  return "tile-workshop";
}

function getSerializedMode(activeView: StudioViewId, paintEditors: PaintEditorSession[]) {
  if (activeView === "map-designer") {
    return "map";
  }

  if (activeView === "item-manager") {
    return "item_manager";
  }

  if (activeView === "personality-manager") {
    return "personality_manager";
  }

  if (activeView === "personality-events") {
    return "personality_events";
  }

  if (activeView === "character-events") {
    return "character_events";
  }

  if (activeView === "sprite-editor") {
    return "sprite";
  }

  if (activeView === "sprite-events") {
    return "sprite_events";
  }

  if (activeView === "tile-workshop") {
    return "tile";
  }

  const activePaintEditor = paintEditors.find((editor) => editor.id === activeView);

  if (!activePaintEditor) {
    return "tile";
  }

  return `paint:${serializePaintEditorKey(activePaintEditor.tileSlug, activePaintEditor.slotKey)}`;
}

function getSerializedPaintEditors(paintEditors: PaintEditorSession[]) {
  return paintEditors
    .map((editor) => serializePaintEditorKey(editor.tileSlug, editor.slotKey))
    .join(",");
}

function getDocumentTitle(activeView: StudioViewId, paintEditors: PaintEditorSession[]) {
  if (activeView === "tile-workshop") {
    return "Tile Editor";
  }

  if (activeView === "item-manager") {
    return "Item Manager";
  }

  if (activeView === "personality-manager") {
    return "Personalities";
  }

  if (activeView === "personality-events") {
    return "LLM Chat Tools";
  }

  if (activeView === "character-events") {
    return "Character Events";
  }

  if (activeView === "sprite-editor") {
    return "Sprite Editor";
  }

  if (activeView === "sprite-events") {
    return "Sprite Events";
  }

  if (activeView === "map-designer") {
    return "Map Designer";
  }

  return paintEditors.find((editor) => editor.id === activeView)?.title ?? "Tile Editor";
}

function StudioNavIcon({ icon }: { icon: "editor" | "item" | "map" | "paint" | "personality" }) {
  if (icon === "map") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
        <path
          d="M3.5 6.5 8.75 4l6.5 2.5L20.5 4v13.5L15.25 20l-6.5-2.5L3.5 20Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <path
          d="M8.75 4v13.5M15.25 6.5V20"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (icon === "item") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
        <path
          d="M5 8.25 12 4l7 4.25v7.5L12 20l-7-4.25Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <path
          d="M5 8.25 12 12.5l7-4.25M12 12.5V20"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (icon === "paint") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
        <path
          d="M6 16.5 16.5 6a2.12 2.12 0 1 1 3 3L9 19.5H6Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <path
          d="M13.5 9 17 12.5M6 19.5h4.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (icon === "personality") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
        <path
          d="M12 12.25a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <path
          d="M5 19.25a7 7 0 0 1 14 0"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path
        d="M5 5.5h14v13H5Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="m9.25 14.75 6-6M13 8.75h2.25V11"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M7.5 18.5h9"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function getViewFromHash(hash: string): StudioView {
  const normalizedHash = hash.trim().toLowerCase();

  if (
    normalizedHash === "#/items" ||
    normalizedHash === "#items" ||
    normalizedHash === "#/item-manager" ||
    normalizedHash === "#item-manager"
  ) {
    return "item-manager";
  }

  if (
    normalizedHash === "#/map" ||
    normalizedHash === "#map" ||
    normalizedHash === "#/map-designer" ||
    normalizedHash === "#map-designer"
  ) {
    return "map-designer";
  }

  if (
    normalizedHash === "#/personalities" ||
    normalizedHash === "#personalities" ||
    normalizedHash === "#/personality-manager" ||
    normalizedHash === "#personality-manager"
  ) {
    return "personality-manager";
  }

  if (
    normalizedHash === "#/personality-events" ||
    normalizedHash === "#personality-events"
  ) {
    return "personality-events";
  }

  if (
    normalizedHash === "#/character-events" ||
    normalizedHash === "#character-events"
  ) {
    return "character-events";
  }

  if (
    normalizedHash === "#/sprite" ||
    normalizedHash === "#sprite" ||
    normalizedHash === "#/sprite-editor" ||
    normalizedHash === "#sprite-editor"
  ) {
    return "sprite-editor";
  }

  if (
    normalizedHash === "#/sprite-events" ||
    normalizedHash === "#sprite-events"
  ) {
    return "sprite-events";
  }

  return "tile-workshop";
}

function getHashForView(view: StudioView) {
  if (view === "item-manager") {
    return "#/items";
  }

  if (view === "map-designer") {
    return "#/map";
  }

  if (view === "personality-manager") {
    return "#/personalities";
  }

  if (view === "personality-events") {
    return "#/personality-events";
  }

  if (view === "character-events") {
    return "#/character-events";
  }

  if (view === "sprite-editor") {
    return "#/sprite";
  }

  if (view === "sprite-events") {
    return "#/sprite-events";
  }

  return "#/tile";
}

function getSerializedEditParam(tileRecord: TileRecord | null) {
  if (!tileRecord) {
    return "";
  }

  return normalizeTileLibraryPath(`${tileRecord.path}/${tileRecord.slug}`);
}

function getSerializedSpriteParam(spriteRecord: SpriteRecord | null) {
  if (!spriteRecord) {
    return "";
  }

  const normalizedPath = normalizeTileLibraryPath(spriteRecord.path);
  return normalizedPath ? `${normalizedPath}/${spriteRecord.filename}` : spriteRecord.filename;
}

function getInitialTileSlug(tileRecords: TileRecord[], preferredEditParam: string) {
  const normalizedPreferredEditParam = normalizeTileLibraryPath(preferredEditParam.trim());

  if (normalizedPreferredEditParam.includes("/")) {
    const preferredPathSegments = normalizedPreferredEditParam.split("/");
    const preferredSlug = preferredPathSegments.at(-1) ?? "";
    const preferredPath = preferredPathSegments.slice(0, -1).join("/");
    const matchedTile = tileRecords.find(
      (tileRecord) =>
        tileRecord.slug === preferredSlug &&
        normalizeTileLibraryPath(tileRecord.path) === preferredPath
    );

    if (matchedTile) {
      return matchedTile.slug;
    }
  }

  const normalizedPreferredSlug = preferredEditParam.trim();

  if (normalizedPreferredSlug && tileRecords.some((tileRecord) => tileRecord.slug === normalizedPreferredSlug)) {
    return normalizedPreferredSlug;
  }

  return "";
}

function getInitialSpriteKey(spriteRecords: SpriteRecord[], preferredSpriteParam: string) {
  const trimmedPreferredSpriteParam = preferredSpriteParam.trim();

  if (!trimmedPreferredSpriteParam) {
    return "";
  }

  const lastSlashIndex = trimmedPreferredSpriteParam.lastIndexOf("/");

  if (lastSlashIndex !== -1) {
    const preferredPath = normalizeTileLibraryPath(trimmedPreferredSpriteParam.slice(0, lastSlashIndex));
    const preferredFilename = trimmedPreferredSpriteParam.slice(lastSlashIndex + 1).trim();
    const matchedSprite = spriteRecords.find(
      (spriteRecord) =>
        normalizeTileLibraryPath(spriteRecord.path) === preferredPath &&
        spriteRecord.filename === preferredFilename
    );

    if (matchedSprite) {
      return getTileLibrarySpriteKey(matchedSprite.path, matchedSprite.filename);
    }
  }

  const matchedByFilename = spriteRecords.find(
    (spriteRecord) => spriteRecord.filename === trimmedPreferredSpriteParam
  );

  return matchedByFilename ? getTileLibrarySpriteKey(matchedByFilename.path, matchedByFilename.filename) : "";
}

function getInitialMapSlug(mapRecords: MapRecord[], preferredSlug: string) {
  const normalizedPreferredSlug = preferredSlug.trim();

  if (normalizedPreferredSlug && mapRecords.some((mapRecord) => mapRecord.slug === normalizedPreferredSlug)) {
    return normalizedPreferredSlug;
  }

  return mapRecords[0]?.slug ?? "";
}

function getInitialItemId(itemRecords: ItemRecord[], preferredItemParam: string) {
  const normalizedPreferredItem = preferredItemParam.trim();

  if (normalizedPreferredItem) {
    const parsedId = Number.parseInt(normalizedPreferredItem, 10);

    if (Number.isFinite(parsedId) && itemRecords.some((itemRecord) => itemRecord.id === parsedId)) {
      return parsedId;
    }

    const matchedBySlug = itemRecords.find((itemRecord) => itemRecord.slug === normalizedPreferredItem);

    if (matchedBySlug) {
      return matchedBySlug.id;
    }
  }

  return itemRecords[0]?.id ?? null;
}

function getInitialPersonalitySlug(
  personalityRecords: PersonalityRecord[],
  preferredPersonalityParam: string
) {
  const normalizedPreferredSlug = preferredPersonalityParam.trim();

  if (
    normalizedPreferredSlug &&
    personalityRecords.some((personalityRecord) => personalityRecord.character_slug === normalizedPreferredSlug)
  ) {
    return normalizedPreferredSlug;
  }

  return personalityRecords[0]?.character_slug ?? "";
}

function getTileBrushAssetKey(tileSlug: string) {
  return getTileBrushAssetKeyWithSlot(tileSlug, 0);
}

function getSpriteBrushAssetKey(spriteKey: string) {
  return spriteKey.trim() ? `sprite:${spriteKey.trim()}` : "";
}

function normalizeBrushTileSlotNum(slotNum: number) {
  return Number.isFinite(slotNum) && slotNum >= 0 ? Math.max(0, Math.round(slotNum)) : 0;
}

function getTileBrushAssetKeyWithSlot(tileSlug: string, slotNum: number) {
  const normalizedTileSlug = tileSlug.trim();

  if (!normalizedTileSlug) {
    return "";
  }

  return `tile:${normalizedTileSlug}:slot:${normalizeBrushTileSlotNum(slotNum)}`;
}

function parseTileBrushAssetKey(brushAssetKey: string) {
  if (!brushAssetKey.startsWith("tile:")) {
    return null;
  }

  const rawValue = brushAssetKey.slice("tile:".length).trim();

  if (!rawValue) {
    return null;
  }

  const slotSeparatorIndex = rawValue.lastIndexOf(":slot:");

  if (slotSeparatorIndex === -1) {
    return {
      slotNum: 0,
      tileSlug: rawValue
    };
  }

  const tileSlug = rawValue.slice(0, slotSeparatorIndex).trim();
  const rawSlotNum = rawValue.slice(slotSeparatorIndex + ":slot:".length).trim();

  if (!tileSlug) {
    return null;
  }

  return {
    slotNum: normalizeBrushTileSlotNum(Number.parseInt(rawSlotNum, 10)),
    tileSlug
  };
}

function applyFolderAssetCountDelta(
  currentCounts: Record<string, number>,
  folderPath: string,
  delta: number
) {
  const nextCounts = { ...currentCounts };

  for (const ancestorPath of getTileLibraryAncestorPaths(folderPath)) {
    nextCounts[ancestorPath] = Math.max(0, (nextCounts[ancestorPath] ?? 0) + delta);
  }

  return nextCounts;
}

function normalizeSpriteReference(spriteReference: string) {
  const trimmedReference = spriteReference.trim();

  if (!trimmedReference) {
    return "";
  }

  const lastSlashIndex = trimmedReference.lastIndexOf("/");

  if (lastSlashIndex === -1) {
    return trimmedReference;
  }

  return getTileLibrarySpriteKey(
    trimmedReference.slice(0, lastSlashIndex),
    trimmedReference.slice(lastSlashIndex + 1)
  );
}

function getInitialBrushAssetKey(
  tileRecords: TileRecord[],
  spriteRecords: SpriteRecord[],
  preferredKey: string
) {
  const normalizedPreferredKey = preferredKey.trim();

  if (normalizedPreferredKey === "") {
    return "";
  }

  if (normalizedPreferredKey.startsWith("tile:")) {
    const parsedTileBrush = parseTileBrushAssetKey(normalizedPreferredKey);

    if (!parsedTileBrush) {
      return "";
    }

    return tileRecords.some((tileRecord) => tileRecord.slug === parsedTileBrush.tileSlug)
      ? getTileBrushAssetKeyWithSlot(parsedTileBrush.tileSlug, parsedTileBrush.slotNum)
      : "";
  }

  if (normalizedPreferredKey.startsWith("sprite:")) {
    const spriteKey = normalizeSpriteReference(normalizedPreferredKey.slice("sprite:".length));
    const hasSprite = spriteRecords.some(
      (spriteRecord) => getTileLibrarySpriteKey(spriteRecord.path, spriteRecord.filename) === spriteKey
    );

    return hasSprite ? getSpriteBrushAssetKey(spriteKey) : "";
  }

  if (tileRecords.some((tileRecord) => tileRecord.slug === normalizedPreferredKey)) {
    return getTileBrushAssetKeyWithSlot(normalizedPreferredKey, 0);
  }

  const normalizedLegacySpriteKey = normalizeSpriteReference(normalizedPreferredKey);
  const hasLegacySprite = spriteRecords.some(
    (spriteRecord) => getTileLibrarySpriteKey(spriteRecord.path, spriteRecord.filename) === normalizedLegacySpriteKey
  );

  if (hasLegacySprite) {
    return getSpriteBrushAssetKey(normalizedLegacySpriteKey);
  }

  return "";
}

function normalizeClientClipboardSlots(
  clipboardSlots: Array<ClipboardSlotRecord | null> | undefined
) {
  const normalizedSlots = Array.isArray(clipboardSlots) ? clipboardSlots.slice(0, CLIPBOARD_SLOT_COUNT) : [];

  while (normalizedSlots.length < CLIPBOARD_SLOT_COUNT) {
    normalizedSlots.push(null);
  }

  return normalizedSlots.map((slot) => {
    if (!slot || typeof slot.image !== "string" || typeof slot.createdAt !== "string") {
      return null;
    }

    const image = slot.image.trim();
    const createdAt = slot.createdAt.trim();

    if (!image || !createdAt) {
      return null;
    }

    return { createdAt, image };
  });
}

function normalizePaintEditorUiState(
  paintEditorUiState: Partial<PaintEditorUiState> | undefined
): PaintEditorUiState {
  const layerVisibilities = Array.isArray(paintEditorUiState?.layerVisibilities)
    ? paintEditorUiState.layerVisibilities.slice(0, SLOT_LAYER_COUNT)
    : [];

  while (layerVisibilities.length < SLOT_LAYER_COUNT) {
    layerVisibilities.push(1);
  }

  return {
    layerVisibilities: layerVisibilities.map((value) =>
      typeof value === "number" && Number.isFinite(value) ? value : 1
    ),
    paintColor:
      typeof paintEditorUiState?.paintColor === "string" && paintEditorUiState.paintColor.trim()
        ? paintEditorUiState.paintColor
        : DEFAULT_PAINT_COLOR,
    selectedLayerIndex: [0, 1, 2, 3, 4].includes(paintEditorUiState?.selectedLayerIndex ?? -1)
      ? (paintEditorUiState?.selectedLayerIndex as PaintLayerIndex)
      : DEFAULT_PAINT_LAYER_INDEX,
    selectedTool:
      paintEditorUiState?.selectedTool === "brush" ||
      paintEditorUiState?.selectedTool === "eraser" ||
      paintEditorUiState?.selectedTool === "eyedropper" ||
      paintEditorUiState?.selectedTool === "fill" ||
      paintEditorUiState?.selectedTool === "marquee" ||
      paintEditorUiState?.selectedTool === "pencil" ||
      paintEditorUiState?.selectedTool === "stamp"
        ? paintEditorUiState.selectedTool
        : DEFAULT_PAINT_TOOL,
    zoomPercent:
      typeof paintEditorUiState?.zoomPercent === "number" && Number.isFinite(paintEditorUiState.zoomPercent)
        ? paintEditorUiState.zoomPercent
        : DEFAULT_PAINT_ZOOM_PERCENT
  };
}

function normalizeMapDesignerUiState(
  mapDesignerUiState: Partial<MapDesignerUiState> | undefined
): MapDesignerUiState {
  const layerVisibilities = Array.isArray(mapDesignerUiState?.layerVisibilities)
    ? mapDesignerUiState.layerVisibilities.slice(0, MAP_LAYER_COUNT)
    : [];

  while (layerVisibilities.length < MAP_LAYER_COUNT) {
    layerVisibilities.push(1);
  }

  return {
    activeLayerIndex:
      typeof mapDesignerUiState?.activeLayerIndex === "number" &&
      Number.isFinite(mapDesignerUiState.activeLayerIndex)
        ? Math.max(0, Math.min(MAP_LAYER_COUNT - 1, Math.round(mapDesignerUiState.activeLayerIndex)))
        : 0,
    isGridVisible:
      typeof mapDesignerUiState?.isGridVisible === "boolean"
        ? mapDesignerUiState.isGridVisible
        : true,
    layerVisibilities: layerVisibilities.map((value) =>
      typeof value === "number" && Number.isFinite(value) ? value : 1
    ),
    scrollLeft:
      typeof mapDesignerUiState?.scrollLeft === "number" && Number.isFinite(mapDesignerUiState.scrollLeft)
        ? Math.max(0, mapDesignerUiState.scrollLeft)
        : 0,
    scrollTop:
      typeof mapDesignerUiState?.scrollTop === "number" && Number.isFinite(mapDesignerUiState.scrollTop)
        ? Math.max(0, mapDesignerUiState.scrollTop)
        : 0,
    zoomPercent:
      typeof mapDesignerUiState?.zoomPercent === "number" && Number.isFinite(mapDesignerUiState.zoomPercent)
        ? clampMapScalePercent(mapDesignerUiState.zoomPercent)
        : null
  };
}

interface TileServerAppProps {
  clipboardSlots: Array<ClipboardSlotRecord | null>;
  initialEditTileSlug: string;
  initialImagePath: string;
  initialItemId: string;
  initialMapSlug: string;
  initialMode: string;
  initialPaintEditors: string;
  initialPersonalitySlug: string;
  initialSpriteKey: string;
  initialBrushAssetKey: string;
  items: ItemRecord[];
  maps: MapRecord[];
  personalities: PersonalityRecord[];
  sprites: SpriteRecord[];
  tileLibraryFolderAssetCounts: Record<string, number>;
  tileLibraryFolders: string[];
  tiles: TileRecord[];
  vaxServer: string;
}

export function TileServerApp({
  clipboardSlots,
  initialEditTileSlug,
  initialImagePath,
  initialItemId,
  initialMapSlug,
  initialMode,
  initialPaintEditors,
  initialPersonalitySlug,
  initialSpriteKey,
  initialBrushAssetKey,
  items,
  maps,
  personalities,
  sprites,
  tileLibraryFolderAssetCounts,
  tileLibraryFolders,
  tiles,
  vaxServer
}: TileServerAppProps) {
  const initialPaintSessions = parsePaintEditorList(initialPaintEditors, tiles);
  const initialSelectedSpriteKey = getInitialSpriteKey(sprites, initialSpriteKey);
  const [itemRecords, setItemRecords] = useState(items);
  const [mapRecords, setMapRecords] = useState(maps);
  const [personalityRecords, setPersonalityRecords] = useState(personalities);
  const [spriteRecords, setSpriteRecords] = useState(sprites);
  const [tileRecords, setTileRecords] = useState(tiles);
  const [tileLibraryFolderCountsByPath, setTileLibraryFolderCountsByPath] = useState(tileLibraryFolderAssetCounts);
  const [tileLibraryFolderPaths, setTileLibraryFolderPaths] = useState(tileLibraryFolders);
  const [activeView, setActiveView] = useState<StudioViewId>(() =>
    getInitialActiveView(initialMode, initialPaintSessions, Boolean(initialSelectedSpriteKey))
  );
  const [activeTileSlug, setActiveTileSlug] = useState(() =>
    getInitialTileSlug(tiles, initialEditTileSlug)
  );
  const [activeMapSlug, setActiveMapSlug] = useState(() =>
    getInitialMapSlug(maps, initialMapSlug)
  );
  const [activeItemId, setActiveItemId] = useState<number | null>(() =>
    getInitialItemId(items, initialItemId)
  );
  const [activePersonalitySlug, setActivePersonalitySlug] = useState(() =>
    getInitialPersonalitySlug(personalities, initialPersonalitySlug)
  );
  const [mapBrushAssetKey, setMapBrushAssetKey] = useState(() =>
    getInitialBrushAssetKey(tiles, sprites, initialBrushAssetKey)
  );
  const [paintEditors, setPaintEditors] = useState<PaintEditorSession[]>(() => initialPaintSessions);
  const [activeSpriteKey, setActiveSpriteKey] = useState(initialSelectedSpriteKey);
  const [clipboardStatus, setClipboardStatus] = useState("Clipboard manager is ready.");
  const [clipboardSlotsState, setClipboardSlotsState] = useState(() =>
    normalizeClientClipboardSlots(clipboardSlots)
  );
  const [selectedClipboardSlotIndex, setSelectedClipboardSlotIndex] = useState<number | null>(null);
  const [isClipboardManagerOpen, setClipboardManagerOpen] = useState(false);
  const [isSidebarExpanded, setSidebarExpanded] = useState(DEFAULT_SIDEBAR_EXPANDED);
  const [isStudioStateRestored, setIsStudioStateRestored] = useState(false);
  const [pendingTileSourceImage, setPendingTileSourceImage] = useState<{
    payload: LoadedImagePayload;
    tileSlug: string;
  } | null>(null);
  const hasRestoredStudioStateRef = useRef(false);
  const hasInitializedClipboardPersistenceRef = useRef(false);
  const isCheckingClipboardRef = useRef(false);
  const lastProcessedClipboardImageRef = useRef("");
  const clipboardPersistAbortRef = useRef<AbortController | null>(null);
  const [paintEditorUiStateById, setPaintEditorUiStateById] = useState<Record<string, PaintEditorUiState>>({});
  const [mapDesignerUiStateByMapSlug, setMapDesignerUiStateByMapSlug] = useState<
    Record<string, MapDesignerUiState>
  >({});
  const [draftLayersByMapSlug, setDraftLayersByMapSlug] = useState<Record<string, MapLayerStack>>(() =>
    Object.fromEntries(
      maps.map((mapRecord) => [
        mapRecord.slug,
        normalizeMapLayers(mapRecord.layers, mapRecord.width, mapRecord.height, mapRecord.cells)
      ])
    )
  );
  const [draftSlotsByTileSlug, setDraftSlotsByTileSlug] = useState<Record<string, Array<SlotRecord | null>>>(() =>
    Object.fromEntries(tiles.map((tileRecord) => [tileRecord.slug, normalizeSlotRecords(tileRecord.slots)]))
  );

  function syncLocationState(
    tileSlug: string,
    spriteKey: string,
    currentView: StudioViewId,
    currentPaintEditors: PaintEditorSession[],
    itemId: number | null,
    personalitySlug: string,
    mapSlug: string,
    brushAssetKey: string
  ) {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    const activeTileRecord = tileRecords.find((tileRecord) => tileRecord.slug === tileSlug) ?? null;
    const activeSpriteRecord =
      spriteRecords.find(
        (spriteRecord) => getTileLibrarySpriteKey(spriteRecord.path, spriteRecord.filename) === spriteKey
      ) ?? null;
    const serializedEditParam = getSerializedEditParam(activeTileRecord);
    const serializedSpriteParam = getSerializedSpriteParam(activeSpriteRecord);

    if (serializedEditParam) {
      url.searchParams.set("edit", serializedEditParam);
    } else {
      url.searchParams.delete("edit");
    }

    if (serializedSpriteParam) {
      url.searchParams.set("sprite", serializedSpriteParam);
    } else {
      url.searchParams.delete("sprite");
    }

    if (mapSlug) {
      url.searchParams.set("map", mapSlug);
    } else {
      url.searchParams.delete("map");
    }

    if (typeof itemId === "number" && Number.isFinite(itemId)) {
      url.searchParams.set("item", String(itemId));
    } else {
      url.searchParams.delete("item");
    }

    if (personalitySlug) {
      url.searchParams.set("personality", personalitySlug);
    } else {
      url.searchParams.delete("personality");
    }

    if (brushAssetKey) {
      url.searchParams.set("brush", brushAssetKey);
    } else {
      url.searchParams.delete("brush");
    }

    const serializedMode = getSerializedMode(currentView, currentPaintEditors);
    const serializedPaintEditors = getSerializedPaintEditors(currentPaintEditors);

    if (serializedMode) {
      url.searchParams.set("mode", serializedMode);
    } else {
      url.searchParams.delete("mode");
    }

    if (serializedPaintEditors) {
      url.searchParams.set("paint", serializedPaintEditors);
    } else {
      url.searchParams.delete("paint");
    }

      url.hash = getHashForView(
      currentView === "item-manager"
        ? "item-manager"
        : currentView === "personality-events"
        ? "personality-events"
        : currentView === "personality-manager"
        ? "personality-manager"
        : currentView === "map-designer"
        ? "map-designer"
        : currentView === "sprite-events"
        ? "sprite-events"
        : currentView === "sprite-editor"
          ? "sprite-editor"
          : "tile-workshop"
    );

    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function activateStudioView(view: StudioView) {
    if (typeof window !== "undefined") {
      const nextHash = getHashForView(view);

      if (window.location.hash !== nextHash) {
        window.location.hash = nextHash;
        return;
      }
    }

    setActiveView(view);
  }

  function getMapDraftLayers(
    mapSlug: string,
    fallbackLayers: MapLayerStack | undefined,
    width?: number,
    height?: number
  ): MapLayerStack {
    if (!mapSlug) {
      return normalizeMapLayers(fallbackLayers, width, height);
    }

    return draftLayersByMapSlug[mapSlug] ?? normalizeMapLayers(fallbackLayers, width, height);
  }

  function getMapDesignerUiState(mapSlug: string) {
    if (!mapSlug) {
      return normalizeMapDesignerUiState(undefined);
    }

    return normalizeMapDesignerUiState(mapDesignerUiStateByMapSlug[mapSlug]);
  }

  function getPaintEditorUiState(sessionId: string) {
    return normalizePaintEditorUiState(paintEditorUiStateById[sessionId]);
  }

  function setPaintEditorUiState(sessionId: string, nextState: Partial<PaintEditorUiState>) {
    if (!sessionId) {
      return;
    }

    setPaintEditorUiStateById((currentState) => ({
      ...currentState,
      [sessionId]: normalizePaintEditorUiState({
        ...currentState[sessionId],
        ...nextState
      })
    }));
  }

  const setMapDesignerUiState = useCallback((mapSlug: string, nextState: Partial<MapDesignerUiState>) => {
    if (!mapSlug) {
      return;
    }

    setMapDesignerUiStateByMapSlug((currentState) => ({
      ...currentState,
      [mapSlug]: normalizeMapDesignerUiState({
        ...currentState[mapSlug],
        ...nextState
      })
    }));
  }, []);

  function setMapDraftLayers(mapSlug: string, layers: MapLayerStack, width?: number, height?: number) {
    if (!mapSlug) {
      return;
    }

    setDraftLayersByMapSlug((currentDrafts) => ({
      ...currentDrafts,
      [mapSlug]: normalizeMapLayers(layers, width, height)
    }));
  }

  function addClipboardSlot(image: string) {
    let nextSlotIndex = -1;

    setClipboardSlotsState((currentSlots) => {
      const normalizedSlots = normalizeClientClipboardSlots(currentSlots);
      const availableSlotIndex = normalizedSlots.findIndex((slot) => slot === null);

      if (availableSlotIndex === -1) {
        return normalizedSlots;
      }

      nextSlotIndex = availableSlotIndex;
      const nextSlots = normalizedSlots.slice();
      nextSlots[availableSlotIndex] = {
        createdAt: new Date().toISOString(),
        image
      };
      return nextSlots;
    });

    if (nextSlotIndex === -1) {
      setClipboardStatus("Clipboard manager is full. Clear a slot before adding another image.");
      return { ok: false as const };
    }

    setClipboardStatus(`Added clipboard image to slot ${nextSlotIndex + 1}.`);
    return { ok: true as const, slotIndex: nextSlotIndex };
  }

  function putClipboardSlot(image: string, preferredIndex?: number | null) {
    let nextSlotIndex = -1;

    setClipboardSlotsState((currentSlots) => {
      const normalizedSlots = normalizeClientClipboardSlots(currentSlots);
      const hasPreferredIndex =
        typeof preferredIndex === "number" &&
        preferredIndex >= 0 &&
        preferredIndex < CLIPBOARD_SLOT_COUNT;
      const availableSlotIndex = hasPreferredIndex
        ? preferredIndex
        : normalizedSlots.findIndex((slot) => slot === null);

      if (availableSlotIndex === -1) {
        return normalizedSlots;
      }

      nextSlotIndex = availableSlotIndex;
      const nextSlots = normalizedSlots.slice();
      nextSlots[availableSlotIndex] = {
        createdAt: new Date().toISOString(),
        image
      };
      return nextSlots;
    });

    if (nextSlotIndex === -1) {
      setClipboardStatus("Clipboard manager is full. Clear a slot before adding another image.");
      return { ok: false as const };
    }

    setSelectedClipboardSlotIndex(nextSlotIndex);
    setClipboardStatus(`Added clipboard image to slot ${nextSlotIndex + 1}.`);
    return { ok: true as const, slotIndex: nextSlotIndex };
  }

  function clearClipboardSlot(index: number) {
    if (index < 0 || index >= CLIPBOARD_SLOT_COUNT) {
      return;
    }

    setClipboardSlotsState((currentSlots) => {
      const nextSlots = normalizeClientClipboardSlots(currentSlots).slice();
      nextSlots[index] = null;
      return nextSlots;
    });

    setClipboardStatus(`Cleared clipboard slot ${index + 1}.`);
  }

  function getTileDraftSlots(tileSlug: string, fallbackSlots: Array<SlotRecord | null> | undefined) {
    return draftSlotsByTileSlug[tileSlug] ?? normalizeSlotRecords(fallbackSlots);
  }

  function setTileDraftSlots(tileSlug: string, slotRecords: Array<SlotRecord | null>) {
    setDraftSlotsByTileSlug((currentDrafts) => ({
      ...currentDrafts,
      [tileSlug]: normalizeSlotRecords(slotRecords)
    }));
  }

  function updateTileDraftSlot(tileSlug: string, slotKey: SlotKey, slotRecord: SlotRecord | null) {
    const tileRecord = tileRecords.find((candidate) => candidate.slug === tileSlug);
    const nextDraftSlots = getTileDraftSlots(tileSlug, tileRecord?.slots);
    const slotIndex = getSlotIndex(slotKey);
    const updatedDraftSlots = nextDraftSlots.slice();

    updatedDraftSlots[slotIndex] = slotRecord;
    setTileDraftSlots(tileSlug, updatedDraftSlots);
  }

  function handleSetActiveTileSlug(tileSlug: string) {
    setActiveTileSlug(tileSlug);

    if (tileSlug) {
      setActiveSpriteKey("");
      setActiveView((currentView) => (currentView === "sprite-editor" ? "tile-workshop" : currentView));
    }
  }

  function handleSetActiveSpriteKey(spriteKey: string) {
    setActiveSpriteKey(spriteKey);

    if (spriteKey) {
      setActiveTileSlug("");
      setActiveView("sprite-editor");
      return;
    }

    setActiveView("tile-workshop");
  }

  function removeTileRecord(tileSlug: string) {
    if (!tileSlug) {
      return;
    }

    const existingTile = tileRecords.find((candidate) => candidate.slug === tileSlug) ?? null;

    if (!existingTile) {
      return;
    }

    setTileRecords((currentTiles) => currentTiles.filter((candidate) => candidate.slug !== tileSlug));
    setDraftSlotsByTileSlug((currentDrafts) => {
      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[tileSlug];
      return nextDrafts;
    });
    setPaintEditors((currentEditors) => currentEditors.filter((editor) => editor.tileSlug !== tileSlug));
    setPaintEditorUiStateById((currentState) =>
      Object.fromEntries(Object.entries(currentState).filter(([sessionId]) => !sessionId.startsWith(`paint:${tileSlug}:`)))
    );
    setTileLibraryFolderCountsByPath((currentCounts) =>
      applyFolderAssetCountDelta(currentCounts, existingTile.path, -1)
    );
    setActiveTileSlug((currentSlug) => (currentSlug === tileSlug ? "" : currentSlug));
    setMapBrushAssetKey((currentBrushAssetKey) =>
      parseTileBrushAssetKey(currentBrushAssetKey)?.tileSlug === tileSlug ? "" : currentBrushAssetKey
    );
    setActiveView((currentView) =>
      currentView !== "tile-workshop" && currentView.startsWith(`paint:${tileSlug}:`) ? "tile-workshop" : currentView
    );
  }

  function removeSpriteRecord(spriteKey: string) {
    const normalizedSpriteKey = normalizeSpriteReference(spriteKey);

    if (!normalizedSpriteKey) {
      return;
    }

    const existingSprite =
      spriteRecords.find(
        (candidate) => getTileLibrarySpriteKey(candidate.path, candidate.filename) === normalizedSpriteKey
      ) ?? null;

    if (!existingSprite) {
      return;
    }

    setSpriteRecords((currentSprites) =>
      currentSprites.filter(
        (candidate) => getTileLibrarySpriteKey(candidate.path, candidate.filename) !== normalizedSpriteKey
      )
    );
    setTileLibraryFolderCountsByPath((currentCounts) =>
      applyFolderAssetCountDelta(currentCounts, existingSprite.path, -1)
    );
    setActiveSpriteKey((currentKey) => (currentKey === normalizedSpriteKey ? "" : currentKey));
    setMapBrushAssetKey((currentBrushAssetKey) =>
      currentBrushAssetKey === getSpriteBrushAssetKey(normalizedSpriteKey) ? "" : currentBrushAssetKey
    );
    setActiveView((currentView) => (currentView === "sprite-editor" && activeSpriteKey === normalizedSpriteKey ? "tile-workshop" : currentView));
  }

  function openPaintEditor(tileRecord: TileRecord, slotKey: SlotKey) {
    const editorId = createPaintEditorId(tileRecord.slug, slotKey);
    const slotIndex = getSlotIndex(slotKey);
    const slotDraft = getTileDraftSlots(tileRecord.slug, tileRecord.slots)[slotIndex];

    setPaintEditors((currentEditors) => {
      if (currentEditors.some((editor) => editor.id === editorId)) {
        return currentEditors;
      }

      return [
        ...currentEditors,
        getPaintEditorSession(tileRecord, slotKey, slotDraft)
      ];
    });
    setActiveView(editorId);
  }

  function closePaintEditor(editorId: string) {
    setPaintEditors((currentEditors) => currentEditors.filter((editor) => editor.id !== editorId));
    setActiveView((currentView) => (currentView === editorId ? "tile-workshop" : currentView));
  }

  async function getClipboardImageDataUrl(item: ClipboardItem) {
    const imageType = item.types.find((type) => type.startsWith("image/"));

    if (!imageType) {
      return null;
    }

    const imageBlob = await item.getType(imageType);
    const objectUrl = URL.createObjectURL(imageBlob);

    try {
      const image = await loadImageFromUrl(objectUrl);
      const croppedWidth = Math.min(128, image.naturalWidth || image.width);
      const croppedHeight = Math.min(128, image.naturalHeight || image.height);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      canvas.width = croppedWidth;
      canvas.height = croppedHeight;

      if (!context) {
        return null;
      }

      context.clearRect(0, 0, croppedWidth, croppedHeight);
      context.drawImage(image, 0, 0, croppedWidth, croppedHeight, 0, 0, croppedWidth, croppedHeight);

      return canvas.toDataURL("image/png");
    } finally {
      revokeObjectUrl(objectUrl);
    }
  }

  useEffect(() => {
    setItemRecords(items);
  }, [items]);

  useEffect(() => {
    setMapRecords(maps);
  }, [maps]);

  useEffect(() => {
    setPersonalityRecords(personalities);
  }, [personalities]);

  useEffect(() => {
    setTileRecords(tiles);
  }, [tiles]);

  useEffect(() => {
    setSpriteRecords(sprites);
  }, [sprites]);

  useEffect(() => {
    setTileLibraryFolderPaths(tileLibraryFolders);
  }, [tileLibraryFolders]);

  useEffect(() => {
    setTileLibraryFolderCountsByPath(tileLibraryFolderAssetCounts);
  }, [tileLibraryFolderAssetCounts]);

  useEffect(() => {
    if (hasRestoredStudioStateRef.current || typeof window === "undefined") {
      return;
    }

    hasRestoredStudioStateRef.current = true;

    try {
      const storedState = window.sessionStorage.getItem(STUDIO_STATE_STORAGE_KEY);

      if (!storedState) {
        setIsStudioStateRestored(true);
        return;
      }

      const parsedState = JSON.parse(storedState) as Partial<{
        activeItemId: number | null;
        activeMapSlug: string;
        activePersonalitySlug: string;
        clipboardSlots: Array<ClipboardSlotRecord | null>;
        draftLayersByMapSlug: Record<string, MapLayerStack>;
        draftCellsByMapSlug: Record<string, string[][]>;
        isClipboardManagerOpen: boolean;
        isSidebarExpanded: boolean;
        mapDesignerUiStateByMapSlug: Record<string, Partial<MapDesignerUiState>>;
        mapBrushAssetKey: string;
        mapBrushTileSlug: string;
        paintEditorUiStateById: Record<string, Partial<PaintEditorUiState>>;
        selectedClipboardSlotIndex: number | null;
      }>;

      if (
        typeof parsedState.activeItemId === "number" &&
        itemRecords.some((itemRecord) => itemRecord.id === parsedState.activeItemId)
      ) {
        setActiveItemId(parsedState.activeItemId);
      }

      if (
        typeof parsedState.activeMapSlug === "string" &&
        mapRecords.some((mapRecord) => mapRecord.slug === parsedState.activeMapSlug)
      ) {
        setActiveMapSlug(parsedState.activeMapSlug);
      }

      if (
        typeof parsedState.activePersonalitySlug === "string" &&
        personalityRecords.some(
          (personalityRecord) => personalityRecord.character_slug === parsedState.activePersonalitySlug
        )
      ) {
        setActivePersonalitySlug(parsedState.activePersonalitySlug);
      }

      if (
        typeof parsedState.mapBrushAssetKey === "string"
      ) {
        setMapBrushAssetKey(getInitialBrushAssetKey(tileRecords, spriteRecords, parsedState.mapBrushAssetKey));
      } else if (
        typeof parsedState.mapBrushTileSlug === "string"
      ) {
        setMapBrushAssetKey(getInitialBrushAssetKey(tileRecords, spriteRecords, parsedState.mapBrushTileSlug));
      }

      if (typeof parsedState.isClipboardManagerOpen === "boolean") {
        setClipboardManagerOpen(parsedState.isClipboardManagerOpen);
      }

      if (typeof parsedState.isSidebarExpanded === "boolean") {
        setSidebarExpanded(parsedState.isSidebarExpanded);
      }

      if (Array.isArray(parsedState.clipboardSlots)) {
        setClipboardSlotsState(normalizeClientClipboardSlots(parsedState.clipboardSlots));
      }

      if (
        typeof parsedState.selectedClipboardSlotIndex === "number" &&
        parsedState.selectedClipboardSlotIndex >= 0 &&
        parsedState.selectedClipboardSlotIndex < CLIPBOARD_SLOT_COUNT
      ) {
        setSelectedClipboardSlotIndex(parsedState.selectedClipboardSlotIndex);
      }

      if (
        (parsedState.draftLayersByMapSlug && typeof parsedState.draftLayersByMapSlug === "object") ||
        (parsedState.draftCellsByMapSlug && typeof parsedState.draftCellsByMapSlug === "object")
      ) {
        setDraftLayersByMapSlug((currentDrafts) => {
          const nextDrafts = { ...currentDrafts };

          for (const mapRecord of mapRecords) {
            const storedLayers = parsedState.draftLayersByMapSlug?.[mapRecord.slug];
            const storedCells = parsedState.draftCellsByMapSlug?.[mapRecord.slug];

            if (storedLayers || storedCells) {
              nextDrafts[mapRecord.slug] = normalizeMapLayers(
                storedLayers,
                mapRecord.width,
                mapRecord.height,
                storedCells
              );
            }
          }

          return nextDrafts;
        });
      }

      if (parsedState.paintEditorUiStateById && typeof parsedState.paintEditorUiStateById === "object") {
        setPaintEditorUiStateById(
          Object.fromEntries(
            Object.entries(parsedState.paintEditorUiStateById).map(([sessionId, paintEditorUiState]) => [
              sessionId,
              normalizePaintEditorUiState(paintEditorUiState)
            ])
          )
        );
      }

      if (
        parsedState.mapDesignerUiStateByMapSlug &&
        typeof parsedState.mapDesignerUiStateByMapSlug === "object"
      ) {
        setMapDesignerUiStateByMapSlug(
          Object.fromEntries(
            Object.entries(parsedState.mapDesignerUiStateByMapSlug).map(([mapSlug, mapDesignerUiState]) => [
              mapSlug,
              normalizeMapDesignerUiState(mapDesignerUiState)
            ])
          )
        );
      }
    } catch {
      // Ignore malformed session state and continue with the server snapshot.
    } finally {
      setIsStudioStateRestored(true);
    }
  }, [itemRecords, mapRecords, personalityRecords, spriteRecords, tileRecords]);

  useEffect(() => {
    setDraftSlotsByTileSlug((currentDrafts) => {
      const nextDrafts: Record<string, Array<SlotRecord | null>> = {};

      for (const tileRecord of tileRecords) {
        nextDrafts[tileRecord.slug] =
          currentDrafts[tileRecord.slug] ?? normalizeSlotRecords(tileRecord.slots);
      }

      return nextDrafts;
    });

    setPaintEditors((currentEditors) =>
      currentEditors.filter((editor) =>
        tileRecords.some((tileRecord) => tileRecord.slug === editor.tileSlug)
      )
    );
  }, [tileRecords]);

  useEffect(() => {
    setActiveTileSlug((currentSlug) => {
      if (currentSlug === "") {
        return currentSlug;
      }

      if (tileRecords.some((tileRecord) => tileRecord.slug === currentSlug)) {
        return currentSlug;
      }

      return "";
    });

    setMapBrushAssetKey((currentKey) => {
      if (currentKey === "") {
        return currentKey;
      }

      const nextKey = getInitialBrushAssetKey(tileRecords, spriteRecords, currentKey);

      if (nextKey) {
        return nextKey;
      }

      return "";
    });
  }, [spriteRecords, tileRecords]);

  useEffect(() => {
    setActiveSpriteKey((currentKey) => {
      if (!currentKey) {
        return currentKey;
      }

      if (
        spriteRecords.some(
          (spriteRecord) => getTileLibrarySpriteKey(spriteRecord.path, spriteRecord.filename) === currentKey
        )
      ) {
        return currentKey;
      }

      return "";
    });
  }, [spriteRecords]);

  useEffect(() => {
    setActiveItemId((currentId) => {
      if (currentId === null) {
        return currentId;
      }

      if (typeof currentId === "number" && itemRecords.some((itemRecord) => itemRecord.id === currentId)) {
        return currentId;
      }

      return itemRecords[0]?.id ?? null;
    });
  }, [itemRecords]);

  useEffect(() => {
    setActivePersonalitySlug((currentSlug) => {
      if (!currentSlug) {
        return personalityRecords[0]?.character_slug ?? "";
      }

      if (
        personalityRecords.some((personalityRecord) => personalityRecord.character_slug === currentSlug)
      ) {
        return currentSlug;
      }

      return personalityRecords[0]?.character_slug ?? "";
    });
  }, [personalityRecords]);

  useEffect(() => {
    setDraftLayersByMapSlug((currentDrafts) => {
      const nextDrafts: Record<string, MapLayerStack> = {};

      for (const mapRecord of mapRecords) {
        nextDrafts[mapRecord.slug] =
          currentDrafts[mapRecord.slug] ??
          normalizeMapLayers(mapRecord.layers, mapRecord.width, mapRecord.height, mapRecord.cells);
      }

      return nextDrafts;
    });
  }, [mapRecords]);

  useEffect(() => {
    setActiveMapSlug((currentSlug) => {
      if (mapRecords.some((mapRecord) => mapRecord.slug === currentSlug)) {
        return currentSlug;
      }

      return mapRecords[0]?.slug ?? "";
    });
  }, [mapRecords]);

  useEffect(() => {
    if (
      activeView !== "tile-workshop" &&
      activeView !== "sprite-editor" &&
      activeView !== "sprite-events" &&
      activeView !== "map-designer" &&
      activeView !== "item-manager" &&
      activeView !== "personality-events" &&
      activeView !== "character-events" &&
      activeView !== "personality-manager" &&
      !paintEditors.some((editor) => editor.id === activeView)
    ) {
      setActiveView("tile-workshop");
    }
  }, [activeView, paintEditors]);

  useEffect(() => {
    if ((activeView === "sprite-editor" || activeView === "sprite-events") && !activeSpriteKey) {
      setActiveView("tile-workshop");
    }
  }, [activeSpriteKey, activeView]);

  useEffect(() => {
    if (isClipboardManagerOpen) {
      setSidebarExpanded(true);
    }
  }, [isClipboardManagerOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncViewFromHash = () => {
      const nextView = getViewFromHash(window.location.hash);

      if ((nextView === "sprite-editor" || nextView === "sprite-events") && !activeSpriteKey) {
        setActiveView("tile-workshop");
        return;
      }

      setActiveView(nextView);
    };

    if (!initialMode) {
      syncViewFromHash();
    }

    window.addEventListener("hashchange", syncViewFromHash);

    return () => {
      window.removeEventListener("hashchange", syncViewFromHash);
    };
  }, [activeSpriteKey, initialMode]);

  useEffect(() => {
    syncLocationState(
      activeTileSlug,
      activeSpriteKey,
      activeView,
      paintEditors,
      activeItemId,
      activePersonalitySlug,
      activeMapSlug,
      mapBrushAssetKey
    );
  }, [activeItemId, activeMapSlug, activePersonalitySlug, activeSpriteKey, activeTileSlug, activeView, mapBrushAssetKey, paintEditors, spriteRecords, tileRecords]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.title = getDocumentTitle(activeView, paintEditors);
  }, [activeView, paintEditors]);

  useEffect(() => {
    if (!isStudioStateRestored || typeof window === "undefined") {
      return;
    }

    const nextState = {
      activeItemId,
      activeMapSlug,
      activePersonalitySlug,
      clipboardSlots: clipboardSlotsState,
      draftLayersByMapSlug,
      isClipboardManagerOpen,
      isSidebarExpanded,
      mapDesignerUiStateByMapSlug,
      mapBrushAssetKey,
      paintEditorUiStateById,
      selectedClipboardSlotIndex
    };

    window.sessionStorage.setItem(STUDIO_STATE_STORAGE_KEY, JSON.stringify(nextState));
  }, [
    activeItemId,
    activeMapSlug,
    activePersonalitySlug,
    clipboardSlotsState,
    draftLayersByMapSlug,
    isClipboardManagerOpen,
    isSidebarExpanded,
    isStudioStateRestored,
    mapDesignerUiStateByMapSlug,
    mapBrushAssetKey,
    paintEditorUiStateById,
    selectedClipboardSlotIndex
  ]);

  useEffect(() => {
    if (!isStudioStateRestored || typeof window === "undefined") {
      return;
    }

    if (!hasInitializedClipboardPersistenceRef.current) {
      hasInitializedClipboardPersistenceRef.current = true;
      return;
    }

    const persistTimer = window.setTimeout(() => {
      clipboardPersistAbortRef.current?.abort();
      const abortController = new AbortController();
      clipboardPersistAbortRef.current = abortController;

      void fetch(CLIPBOARD_SAVE_PATH, {
        body: JSON.stringify({ slots: clipboardSlotsState }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST",
        signal: abortController.signal
      }).catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setClipboardStatus("Could not persist clipboard changes to the temp store.");
        }
      });
    }, 250);

    return () => {
      window.clearTimeout(persistTimer);
      clipboardPersistAbortRef.current?.abort();
    };
  }, [clipboardSlotsState, isStudioStateRestored]);

  useEffect(() => {
    if (typeof window === "undefined" || !isStudioStateRestored || !navigator.clipboard?.read) {
      return;
    }

    const checkClipboardForImage = () => {
      if (isCheckingClipboardRef.current) {
        return;
      }

      isCheckingClipboardRef.current = true;

      void (async () => {
        try {
          const clipboardItems = await navigator.clipboard.read();

          for (const item of clipboardItems) {
            const imageDataUrl = await getClipboardImageDataUrl(item);

            if (!imageDataUrl) {
              continue;
            }

            if (
              imageDataUrl === lastProcessedClipboardImageRef.current ||
              clipboardSlotsState.some((slot) => slot?.image === imageDataUrl)
            ) {
              return;
            }

            const addResult = addClipboardSlot(imageDataUrl);

            if (addResult.ok) {
              lastProcessedClipboardImageRef.current = imageDataUrl;
            }

            return;
          }
        } catch {
          // Clipboard access may be unavailable depending on browser permissions.
        } finally {
          isCheckingClipboardRef.current = false;
        }
      })();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkClipboardForImage();
      }
    };

    window.addEventListener("focus", checkClipboardForImage);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", checkClipboardForImage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [addClipboardSlot, clipboardSlotsState, isStudioStateRestored]);

  const activeTile = tileRecords.find((tileRecord) => tileRecord.slug === activeTileSlug) ?? null;
  const activeSprite =
    spriteRecords.find(
      (spriteRecord) => getTileLibrarySpriteKey(spriteRecord.path, spriteRecord.filename) === activeSpriteKey
    ) ?? null;
  const activeItem = itemRecords.find((itemRecord) => itemRecord.id === activeItemId) ?? null;
  const activeMap = mapRecords.find((mapRecord) => mapRecord.slug === activeMapSlug) ?? null;
  const activePersonality =
    personalityRecords.find(
      (personalityRecord) => personalityRecord.character_slug === activePersonalitySlug
    ) ?? null;
  const filledClipboardSlots = clipboardSlotsState.filter(Boolean).length;
  const isEditorNavActive =
    activeView === "tile-workshop" ||
    activeView === "sprite-editor" ||
    activeView === "sprite-events" ||
    paintEditors.some((editor) => editor.id === activeView);

  return (
    <StudioProvider
      // This provider intentionally owns long-lived draft state for the whole studio, but that
      // also means clipboard writes, session flags, and paint drafts all fan out through one
      // context value. Heavy mode UIs should memoize their canvas/workspace subtree and only pass
      // the minimum props it needs so global app-shell updates do not force redraws everywhere.
      value={{
        addClipboardSlot,
        activeItem,
        activeItemId,
        activeMap,
        activeMapSlug,
        activePersonality,
        activePersonalitySlug,
        activeSprite,
        activeSpriteKey,
        activeTile,
        activeTileSlug,
        addTileLibraryFolder: (folderPath) => {
          setTileLibraryFolderPaths((currentFolders) =>
            currentFolders.includes(folderPath) ? currentFolders : [...currentFolders, folderPath].sort()
          );
          setTileLibraryFolderCountsByPath((currentCounts) =>
            currentCounts[folderPath] === undefined ? { ...currentCounts, [folderPath]: 0 } : currentCounts
          );
        },
        clearClipboardSlot,
        clearPendingTileSourceImage: () => {
          setPendingTileSourceImage(null);
        },
        clipboardStatus,
        clipboardSlots: clipboardSlotsState,
        getMapDesignerUiState,
        getMapDraftLayers,
        getPaintEditorUiState,
        getTileDraftSlots,
        initialImagePath,
        isClipboardManagerOpen,
        items: itemRecords,
        mapBrushAssetKey,
        maps: mapRecords,
        openPaintEditor,
        pendingTileSourceImage,
        personalities: personalityRecords,
        putClipboardSlot,
        queueTileSourceImage: (tileSlug, payload) => {
          if (!tileSlug) {
            revokeObjectUrl(payload.dataUrl);
            return;
          }

          setPendingTileSourceImage((currentPayload) => {
            if (currentPayload?.payload.dataUrl !== payload.dataUrl) {
              revokeObjectUrl(currentPayload?.payload.dataUrl ?? null);
            }

            return {
              payload,
              tileSlug
            };
          });
        },
        removeItem: (itemId) => {
          setItemRecords((currentItems) => currentItems.filter((itemRecord) => itemRecord.id !== itemId));
        },
        removeSprite: removeSpriteRecord,
        removeTile: removeTileRecord,
        selectedClipboardSlotIndex,
        setActiveItemId,
        setActiveMapSlug,
        setActivePersonalitySlug,
        setClipboardManagerOpen,
        setMapDesignerUiState,
        setPaintEditorUiState,
        setSelectedClipboardSlotIndex,
        setMapDraftLayers,
        setActiveSpriteKey: handleSetActiveSpriteKey,
        setActiveTileSlug: handleSetActiveTileSlug,
        setMapBrushAssetKey,
        setTileDraftSlots,
        sprites: spriteRecords,
        tileLibraryFolderAssetCounts: tileLibraryFolderCountsByPath,
        tileLibraryFolders: tileLibraryFolderPaths,
        tiles: tileRecords,
        upsertItem: (itemRecord) => {
          setItemRecords((currentItems) => {
            const existingIndex = currentItems.findIndex((candidate) => candidate.id === itemRecord.id);

            if (existingIndex === -1) {
              return [...currentItems, itemRecord].sort(
                (left, right) => left.item_type.localeCompare(right.item_type) || left.name.localeCompare(right.name)
              );
            }

            const nextItems = currentItems.slice();
            nextItems[existingIndex] = itemRecord;
            return nextItems;
          });
        },
        upsertPersonality: (personalityRecord) => {
          setPersonalityRecords((currentPersonalities) => {
            const existingIndex = currentPersonalities.findIndex(
              (candidate) => candidate.character_slug === personalityRecord.character_slug
            );

            if (existingIndex === -1) {
              return [...currentPersonalities, personalityRecord].sort(
                (left, right) =>
                  left.name.localeCompare(right.name) ||
                  left.character_slug.localeCompare(right.character_slug)
              );
            }

            const nextPersonalities = currentPersonalities.slice();
            nextPersonalities[existingIndex] = personalityRecord;
            return nextPersonalities.sort(
              (left, right) =>
                left.name.localeCompare(right.name) ||
                left.character_slug.localeCompare(right.character_slug)
            );
          });
        },
        upsertSprite: (spriteRecord) => {
          let isNewSprite = false;

          setSpriteRecords((currentSprites) => {
            const spriteKey = `${spriteRecord.path}/${spriteRecord.filename}`;
            const existingIndex = currentSprites.findIndex(
              (candidate) => `${candidate.path}/${candidate.filename}` === spriteKey
            );

            if (existingIndex === -1) {
              isNewSprite = true;
              return [...currentSprites, spriteRecord].sort(
                (left, right) =>
                  left.path.localeCompare(right.path) ||
                  left.name.localeCompare(right.name) ||
                  left.filename.localeCompare(right.filename)
              );
            }

            const nextSprites = currentSprites.slice();
            nextSprites[existingIndex] = spriteRecord;
            return nextSprites;
          });

          if (isNewSprite) {
            setTileLibraryFolderCountsByPath((currentCounts) =>
              applyFolderAssetCountDelta(currentCounts, spriteRecord.path, 1)
            );
          }
        },
        updateTileDraftSlot,
        upsertMap: (mapRecord) => {
          setMapRecords((currentMaps) => {
            const existingIndex = currentMaps.findIndex(
              (candidate) => candidate.slug === mapRecord.slug
            );

            if (existingIndex === -1) {
              return [...currentMaps, mapRecord];
            }

            const nextMaps = currentMaps.slice();
            nextMaps[existingIndex] = mapRecord;
            return nextMaps;
          });
        },
        upsertTile: (tileRecord) => {
          let isNewTile = false;

          setTileRecords((currentTiles) => {
            const existingIndex = currentTiles.findIndex(
              (candidate) => candidate.slug === tileRecord.slug
            );

            if (existingIndex === -1) {
              isNewTile = true;
              return [...currentTiles, tileRecord];
            }

            const nextTiles = currentTiles.slice();
            nextTiles[existingIndex] = tileRecord;
            return nextTiles;
          });

          if (isNewTile) {
            setTileLibraryFolderCountsByPath((currentCounts) =>
              applyFolderAssetCountDelta(currentCounts, tileRecord.path, 1)
            );
          }
        },
        vaxServer
      }}
    >
      <div className="min-h-screen">
        <div className="flex min-h-screen">
          <aside
            className={`navbar ${isSidebarExpanded ? "navbar--expanded" : "navbar--collapsed"}`}
          >
            <div className={`navbar__header ${isSidebarExpanded ? "" : "navbar__header--collapsed"}`}>
              {isSidebarExpanded ? (
                <div className="navbar__brand">
                  <span className="truncate">Tile Server 19</span>
                </div>
              ) : null}
              <button
                className="navbar__toggle"
                onClick={() => {
                  setSidebarExpanded(!isSidebarExpanded);
                }}
                title={isSidebarExpanded ? "Collapse navigation" : "Expand navigation"}
                type="button"
              >
                {isSidebarExpanded ? "<" : ">"}
              </button>
            </div>

            <div className="navbar__section">
              {[
                {
                  description: activeSprite
                    ? `Editing ${activeSprite.name}`
                    : activeTile
                      ? `Editing ${activeTile.slug}`
                      : "Tile and sprite workflow",
                  icon: "editor" as const,
                  id: "tile-workshop" as const,
                  label: "Editor"
                },
                {
                  description: activeMap ? `Editing ${activeMap.slug}` : "Lay out maps",
                  icon: "map" as const,
                  id: "map-designer" as const,
                  label: "Map"
                },
                {
                  description: "Manage Vax Items",
                  icon: "item" as const,
                  id: "item-manager" as const,
                  label: "Item Manager"
                },
                {
                  description: activePersonality
                    ? `Editing ${activePersonality.name}`
                    : "NPC personality records",
                  icon: "personality" as const,
                  id: "personality-manager" as const,
                  label: "Personalities"
                }
              ].map((item) => {
                const isActive = item.id === "tile-workshop" ? isEditorNavActive : activeView === item.id;

                return (
                  <button
                    className={`navbar__item ${isActive ? "navbar__item--active" : ""}`}
                    key={item.id}
                    onClick={() => {
                      activateStudioView(item.id);
                    }}
                    title={item.label}
                    type="button"
                  >
                    <span className="navbar__item-badge navbar__item-badge--icon">
                      <StudioNavIcon icon={item.icon} />
                    </span>
                    {isSidebarExpanded ? (
                      <span className="min-w-0 flex-1">
                        <span className="navbar__item-title">{item.label}</span>
                        <span className="navbar__item-description">{item.description}</span>
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {paintEditors.length > 0 ? (
              <div className="navbar__section">
                {isSidebarExpanded ? <div className="navbar__section-label">Open Paint Sessions</div> : null}
                {paintEditors.map((editor) => {
                  const isActive = activeView === editor.id;

                  return (
                    <div className="navbar__item-row" key={editor.id}>
                      <button
                        className={`navbar__item ${isActive ? "navbar__item--active" : ""}`}
                        onClick={() => {
                          setActiveView(editor.id);
                        }}
                        title={editor.title}
                        type="button"
                      >
                        <span className="navbar__item-badge navbar__item-badge--icon">
                          <StudioNavIcon icon="paint" />
                        </span>
                        {isSidebarExpanded ? (
                          <span className="min-w-0 flex-1">
                            <span className="navbar__item-title">{editor.title}</span>
                            <span className="navbar__item-description">Direct slot painting</span>
                          </span>
                        ) : null}
                      </button>
                      {isSidebarExpanded ? (
                        <button
                          className="navbar__item-close"
                          onClick={() => {
                            closePaintEditor(editor.id);
                          }}
                          title={`Close ${editor.title}`}
                          type="button"
                        >
                          X
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className="mt-auto flex flex-col gap-1">
              <button
                className={`navbar__item ${isClipboardManagerOpen ? "navbar__item--active" : ""}`}
                onClick={() => {
                  if (!isSidebarExpanded) {
                    setSidebarExpanded(true);
                  }

                  setClipboardManagerOpen(!isClipboardManagerOpen);
                }}
                title="Toggle clipboard manager"
                type="button"
              >
                <span className="navbar__item-badge navbar__item-badge--icon">
                  <FontAwesomeIcon className="h-4 w-4" icon={faClipboard} />
                </span>
                {isSidebarExpanded ? (
                  <span className="min-w-0 flex-1">
                    <span className="navbar__item-title">Clipboard Manager</span>
                    <span className="navbar__item-description">
                      {filledClipboardSlots > 0
                        ? `${filledClipboardSlots} clipboard ${filledClipboardSlots === 1 ? "slot" : "slots"} ready.`
                        : "Clipboard slots"}
                    </span>
                  </span>
                ) : null}
                {filledClipboardSlots > 0 ? (
                  <span className="navbar__count">{filledClipboardSlots}</span>
                ) : null}
              </button>

              {isSidebarExpanded ? <ClipboardManager /> : null}
            </div>
          </aside>

          <main className="min-w-0 flex-1 p-3 md:p-4">
            <div className="min-h-full">
              {activeView === "tile-workshop" || activeView === "sprite-editor" ? (
                <div className="block h-full">
                  <TileWorkshop />
                </div>
              ) : null}
              {activeView === "map-designer" ? (
                <div className="block h-full">
                  <MapDesigner initialMode={initialMode} />
                </div>
              ) : null}
              {activeView === "item-manager" ? (
                <div className="block h-full">
                  <ItemManager />
                </div>
              ) : null}
              {activeView === "personality-manager" ? (
                <div className="block h-full">
                  <PersonalityManager />
                </div>
              ) : null}
              {activeView === "personality-events" ? (
                <div className="block h-full">
                  <PersonalityEventsManager />
                </div>
              ) : null}
              {activeView === "character-events" ? (
                <div className="block h-full">
                  <CharacterEventsManager />
                </div>
              ) : null}
              {activeView === "sprite-events" ? (
                <div className="block h-full">
                  <SpriteEventsManager />
                </div>
              ) : null}
              {paintEditors
                .filter((editor) => activeView === editor.id)
                .map((editor) => (
                  <div className="block h-full" key={editor.id}>
                    <PaintMode session={editor} />
                  </div>
                ))}
            </div>
          </main>
        </div>
      </div>
    </StudioProvider>
  );
}
