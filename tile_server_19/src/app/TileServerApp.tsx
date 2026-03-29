"use client";

import { useEffect, useRef, useState } from "react";
import { faClipboard } from "@awesome.me/kit-a62459359b/icons/classic/solid";

import { ClipboardManager } from "../components/ClipboardManager";
import { FontAwesomeIcon } from "../components/FontAwesomeIcon";
import { MapDesigner } from "../components/MapDesigner";
import { PaintMode } from "../components/PaintMode";
import { TileWorkshop } from "../components/TileWorkshop";
import { MAP_LAYER_COUNT, SLOT_LAYER_COUNT } from "../lib/constants";
import { loadImageFromUrl, revokeObjectUrl } from "../lib/images";
import { clampMapScalePercent, normalizeMapLayers } from "../lib/map";
import { describeSlot, getSlotIndex, normalizeSlotRecords, type SlotKey } from "../lib/slots";
import { normalizeTileLibraryPath } from "../lib/tileLibrary";
import { StudioProvider } from "./StudioContext";
import type {
  ClipboardSlotRecord,
  MapLayerStack,
  MapDesignerUiState,
  PaintLayerIndex,
  MapRecord,
  PaintEditorSession,
  PaintEditorUiState,
  PaintToolId,
  SlotRecord,
  TileRecord
} from "../types";

type StudioView = "tile-workshop" | "map-designer";
type StudioViewId = StudioView | PaintEditorSession["id"];
const CLIPBOARD_SLOT_COUNT = 10;
const CLIPBOARD_SAVE_PATH = "/__clipboard/save";
const DEFAULT_PAINT_COLOR = "#142127";
const DEFAULT_PAINT_LAYER_INDEX = 1;
const DEFAULT_PAINT_TOOL: PaintToolId = "pencil";
const DEFAULT_PAINT_ZOOM_PERCENT = 100;
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
  initialPaintSessions: PaintEditorSession[]
): StudioViewId {
  const normalizedMode = serializedMode.trim();

  if (normalizedMode === "map") {
    return "map-designer";
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

  if (activeView === "map-designer") {
    return "Map Designer";
  }

  return paintEditors.find((editor) => editor.id === activeView)?.title ?? "Tile Editor";
}

function getViewFromHash(hash: string): StudioView {
  const normalizedHash = hash.trim().toLowerCase();

  if (
    normalizedHash === "#/map" ||
    normalizedHash === "#map" ||
    normalizedHash === "#/map-designer" ||
    normalizedHash === "#map-designer"
  ) {
    return "map-designer";
  }

  return "tile-workshop";
}

function getHashForView(view: StudioView) {
  return view === "map-designer" ? "#/map" : "#/tile";
}

function getSerializedEditParam(tileRecord: TileRecord | null) {
  if (!tileRecord) {
    return "";
  }

  return normalizeTileLibraryPath(`${tileRecord.path}/${tileRecord.slug}`);
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

function getInitialMapSlug(mapRecords: MapRecord[], preferredSlug: string) {
  const normalizedPreferredSlug = preferredSlug.trim();

  if (normalizedPreferredSlug && mapRecords.some((mapRecord) => mapRecord.slug === normalizedPreferredSlug)) {
    return normalizedPreferredSlug;
  }

  return mapRecords[0]?.slug ?? "";
}

function getInitialBrushTileSlug(tileRecords: TileRecord[], preferredSlug: string) {
  const normalizedPreferredSlug = preferredSlug.trim();

  if (normalizedPreferredSlug === "") {
    return "";
  }

  if (normalizedPreferredSlug && tileRecords.some((tileRecord) => tileRecord.slug === normalizedPreferredSlug)) {
    return normalizedPreferredSlug;
  }

  return tileRecords[0]?.slug ?? "";
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
  initialMapSlug: string;
  initialMode: string;
  initialPaintEditors: string;
  initialBrushTileSlug: string;
  maps: MapRecord[];
  tileLibraryFolders: string[];
  tiles: TileRecord[];
}

export function TileServerApp({
  clipboardSlots,
  initialEditTileSlug,
  initialImagePath,
  initialMapSlug,
  initialMode,
  initialPaintEditors,
  initialBrushTileSlug,
  maps,
  tileLibraryFolders,
  tiles
}: TileServerAppProps) {
  const initialPaintSessions = parsePaintEditorList(initialPaintEditors, tiles);
  const [mapRecords, setMapRecords] = useState(maps);
  const [tileRecords, setTileRecords] = useState(tiles);
  const [tileLibraryFolderPaths, setTileLibraryFolderPaths] = useState(tileLibraryFolders);
  const [activeView, setActiveView] = useState<StudioViewId>(() =>
    getInitialActiveView(initialMode, initialPaintSessions)
  );
  const [activeTileSlug, setActiveTileSlug] = useState(() =>
    getInitialTileSlug(tiles, initialEditTileSlug)
  );
  const [activeMapSlug, setActiveMapSlug] = useState(() =>
    getInitialMapSlug(maps, initialMapSlug)
  );
  const [mapBrushTileSlug, setMapBrushTileSlug] = useState(() =>
    getInitialBrushTileSlug(tiles, initialBrushTileSlug)
  );
  const [paintEditors, setPaintEditors] = useState<PaintEditorSession[]>(() => initialPaintSessions);
  const [clipboardStatus, setClipboardStatus] = useState("Clipboard manager is ready.");
  const [clipboardSlotsState, setClipboardSlotsState] = useState(() =>
    normalizeClientClipboardSlots(clipboardSlots)
  );
  const [selectedClipboardSlotIndex, setSelectedClipboardSlotIndex] = useState<number | null>(null);
  const [isClipboardManagerOpen, setClipboardManagerOpen] = useState(false);
  const [isStudioStateRestored, setIsStudioStateRestored] = useState(false);
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
    currentView: StudioViewId,
    currentPaintEditors: PaintEditorSession[],
    mapSlug: string,
    brushTileSlug: string
  ) {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    const activeTileRecord = tileRecords.find((tileRecord) => tileRecord.slug === tileSlug) ?? null;
    const serializedEditParam = getSerializedEditParam(activeTileRecord);

    if (serializedEditParam) {
      url.searchParams.set("edit", serializedEditParam);
    } else {
      url.searchParams.delete("edit");
    }

    if (mapSlug) {
      url.searchParams.set("map", mapSlug);
    } else {
      url.searchParams.delete("map");
    }

    if (brushTileSlug) {
      url.searchParams.set("brush", brushTileSlug);
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

    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
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

  function setMapDesignerUiState(mapSlug: string, nextState: Partial<MapDesignerUiState>) {
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
  }

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
    setMapRecords(maps);
  }, [maps]);

  useEffect(() => {
    setTileRecords(tiles);
  }, [tiles]);

  useEffect(() => {
    setTileLibraryFolderPaths(tileLibraryFolders);
  }, [tileLibraryFolders]);

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
        activeMapSlug: string;
        clipboardSlots: Array<ClipboardSlotRecord | null>;
        draftLayersByMapSlug: Record<string, MapLayerStack>;
        draftCellsByMapSlug: Record<string, string[][]>;
        isClipboardManagerOpen: boolean;
        mapDesignerUiStateByMapSlug: Record<string, Partial<MapDesignerUiState>>;
        mapBrushTileSlug: string;
        paintEditorUiStateById: Record<string, Partial<PaintEditorUiState>>;
        selectedClipboardSlotIndex: number | null;
      }>;

      if (
        typeof parsedState.activeMapSlug === "string" &&
        mapRecords.some((mapRecord) => mapRecord.slug === parsedState.activeMapSlug)
      ) {
        setActiveMapSlug(parsedState.activeMapSlug);
      }

      if (
        typeof parsedState.mapBrushTileSlug === "string" &&
        (parsedState.mapBrushTileSlug === "" ||
          tileRecords.some((tileRecord) => tileRecord.slug === parsedState.mapBrushTileSlug))
      ) {
        setMapBrushTileSlug(parsedState.mapBrushTileSlug);
      }

      if (typeof parsedState.isClipboardManagerOpen === "boolean") {
        setClipboardManagerOpen(parsedState.isClipboardManagerOpen);
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
  }, [mapRecords, tileRecords]);

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

    setMapBrushTileSlug((currentSlug) => {
      if (currentSlug === "") {
        return currentSlug;
      }

      if (tileRecords.some((tileRecord) => tileRecord.slug === currentSlug)) {
        return currentSlug;
      }

      return tileRecords[0]?.slug ?? "";
    });
  }, [tileRecords]);

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
      activeView !== "map-designer" &&
      !paintEditors.some((editor) => editor.id === activeView)
    ) {
      setActiveView("tile-workshop");
    }
  }, [activeView, paintEditors]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncViewFromHash = () => {
      setActiveView(getViewFromHash(window.location.hash));
    };

    if (!initialMode) {
      syncViewFromHash();
    }

    window.addEventListener("hashchange", syncViewFromHash);

    return () => {
      window.removeEventListener("hashchange", syncViewFromHash);
    };
  }, [initialMode]);

  useEffect(() => {
    syncLocationState(activeTileSlug, activeView, paintEditors, activeMapSlug, mapBrushTileSlug);
  }, [activeMapSlug, activeTileSlug, activeView, mapBrushTileSlug, paintEditors, tileRecords]);

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
      activeMapSlug,
      clipboardSlots: clipboardSlotsState,
      draftLayersByMapSlug,
      isClipboardManagerOpen,
      mapDesignerUiStateByMapSlug,
      mapBrushTileSlug,
      paintEditorUiStateById,
      selectedClipboardSlotIndex
    };

    window.sessionStorage.setItem(STUDIO_STATE_STORAGE_KEY, JSON.stringify(nextState));
  }, [
    activeMapSlug,
    clipboardSlotsState,
    draftLayersByMapSlug,
    isClipboardManagerOpen,
    isStudioStateRestored,
    mapDesignerUiStateByMapSlug,
    mapBrushTileSlug,
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
  const activeMap = mapRecords.find((mapRecord) => mapRecord.slug === activeMapSlug) ?? null;
  const filledClipboardSlots = clipboardSlotsState.filter(Boolean).length;

  return (
    <StudioProvider
      // This provider intentionally owns long-lived draft state for the whole studio, but that
      // also means clipboard writes, session flags, and paint drafts all fan out through one
      // context value. Heavy mode UIs should memoize their canvas/workspace subtree and only pass
      // the minimum props it needs so global app-shell updates do not force redraws everywhere.
      value={{
        addClipboardSlot,
        activeMap,
        activeMapSlug,
        activeTile,
        activeTileSlug,
        addTileLibraryFolder: (folderPath) => {
          setTileLibraryFolderPaths((currentFolders) =>
            currentFolders.includes(folderPath) ? currentFolders : [...currentFolders, folderPath].sort()
          );
        },
        clearClipboardSlot,
        clipboardStatus,
        clipboardSlots: clipboardSlotsState,
        getMapDesignerUiState,
        getMapDraftLayers,
        getPaintEditorUiState,
        getTileDraftSlots,
        initialImagePath,
        isClipboardManagerOpen,
        mapBrushTileSlug,
        maps: mapRecords,
        openPaintEditor,
        putClipboardSlot,
        selectedClipboardSlotIndex,
        setActiveMapSlug,
        setClipboardManagerOpen,
        setMapDesignerUiState,
        setPaintEditorUiState,
        setSelectedClipboardSlotIndex,
        setMapDraftLayers,
        setActiveTileSlug: handleSetActiveTileSlug,
        setMapBrushTileSlug,
        setTileDraftSlots,
        tileLibraryFolders: tileLibraryFolderPaths,
        tiles: tileRecords,
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
          setTileRecords((currentTiles) => {
            const existingIndex = currentTiles.findIndex(
              (candidate) => candidate.slug === tileRecord.slug
            );

            if (existingIndex === -1) {
              return [...currentTiles, tileRecord];
            }

            const nextTiles = currentTiles.slice();
            nextTiles[existingIndex] = tileRecord;
            return nextTiles;
          });
        }
      }}
    >
      <div className="min-h-screen p-5">
        <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-[1600px] flex-col gap-4">
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex w-fit flex-wrap items-center gap-1 border border-[#c3d0cb] bg-white/70 p-1 shadow-[0_1px_2px_rgba(20,33,39,0.06)] backdrop-blur">
              {[
                { id: "tile-workshop" as const, label: "Tile Editor" },
                { id: "map-designer" as const, label: "Map Designer" }
              ].map((tab) => {
                const isActive = activeView === tab.id;

                return (
                  <button
                    className={`px-4 py-2 text-sm font-semibold transition ${
                      isActive
                        ? "border border-[#c3d0cb] bg-white text-[#142127] shadow-[0_1px_3px_rgba(20,33,39,0.08)]"
                        : "border border-transparent bg-transparent text-[#4a6069] hover:bg-white/80 hover:text-[#142127]"
                    }`}
                    key={tab.id}
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        const nextHash = getHashForView(tab.id);

                        if (window.location.hash !== nextHash) {
                          window.location.hash = nextHash;
                        } else {
                          setActiveView(tab.id);
                        }
                      } else {
                        setActiveView(tab.id);
                      }
                    }}
                    type="button"
                  >
                    {tab.label}
                  </button>
                );
              })}

              {paintEditors.map((editor) => {
                const isActive = activeView === editor.id;

                return (
                  <div
                    className={`flex min-w-0 items-center border transition ${
                      isActive
                        ? "border-[#c3d0cb] bg-white text-[#142127] shadow-[0_1px_3px_rgba(20,33,39,0.08)]"
                        : "border-transparent bg-transparent text-[#4a6069] hover:bg-white/80 hover:text-[#142127]"
                    }`}
                    key={editor.id}
                  >
                    <button
                      className="max-w-[16rem] truncate px-4 py-2 text-sm font-semibold"
                      onClick={() => {
                        setActiveView(editor.id);
                      }}
                      type="button"
                    >
                      {editor.title}
                    </button>
                    <button
                      className="px-2 py-2 text-xs text-[#4a6069] transition hover:text-[#142127]"
                      onClick={() => {
                        closePaintEditor(editor.id);
                      }}
                      type="button"
                    >
                      X
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              className={`relative inline-flex min-h-11 min-w-11 items-center justify-center border px-3 py-2 text-sm font-semibold transition ${
                isClipboardManagerOpen
                  ? "border-[#d88753] bg-white text-[#142127] shadow-[0_1px_3px_rgba(20,33,39,0.08)]"
                  : "border-[#c3d0cb] bg-white/90 text-[#4a6069] hover:bg-white hover:text-[#142127]"
              }`}
              onClick={() => {
                setClipboardManagerOpen(!isClipboardManagerOpen);
              }}
              title="Toggle clipboard manager"
              type="button"
            >
              <FontAwesomeIcon className="h-4 w-4" icon={faClipboard} />
              {filledClipboardSlots > 0 ? (
                <span className="ml-2 rounded-full bg-[#16324f] px-2 py-0.5 text-[10px] font-bold text-white">
                  {filledClipboardSlots}
                </span>
              ) : null}
            </button>

            <ClipboardManager />
          </div>

          <div className="min-h-0 flex-1">
            <div className={activeView === "tile-workshop" ? "block h-full" : "hidden h-full"}>
              <TileWorkshop />
            </div>
            <div className={activeView === "map-designer" ? "block h-full" : "hidden h-full"}>
              <MapDesigner />
            </div>
            {paintEditors.map((editor) => (
              <div className={activeView === editor.id ? "block h-full" : "hidden h-full"} key={editor.id}>
                <PaintMode session={editor} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </StudioProvider>
  );
}
