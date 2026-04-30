"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition
} from "react";

import {
  exportCombinedSlotsAction,
  loadProjectImageAction,
  saveTileAction
} from "../actions/tileActions";
import {
  createSpriteStateAction,
  readSpriteStatesAction
} from "../actions/spriteStateActions";
import { useStudio } from "../app/StudioContext";
import { EMPTY_TILE_LABEL, PREVIEW_SIZE, TILE_SIZE } from "../lib/constants";
import {
  loadImageFromUrl,
  revokeObjectUrl,
  triggerDownload
} from "../lib/images";
import {
  getDefaultSpriteMount,
  getSpriteBoundingBox,
  snapSpriteBoundingBoxToTileGrid,
  getSpriteTileFootprint,
  spriteUsesDefaultMount
} from "../lib/sprites";
import {
  buildPreviewPlacements,
  clampSelection,
  createPaddedSlotRecord,
  drawPlaceholderCell,
  getSlotIndex,
  normalizeSlotRecords,
  snapToTileBorder,
  type SlotKey
} from "../lib/slots";
import { useImageCache } from "../lib/useImageCache";
import { SpriteEditorWorkspace } from "./SpriteEditorWorkspace";
import { TileEditorWorkspace } from "./TileEditorWorkspace";
import { TileLibraryPanel } from "./TileLibraryPanel";
import type { LoadedImagePayload, SelectedRegion, SpriteRecord, SpriteStateRecord } from "../types";

const SAVE_SPRITE_PATH = "/__tiles/save-sprite";
const SAVE_SPRITE_STATE_IMAGE_PATH = "/__tiles/save-sprite-state-image";
const SPRITE_GRID_MARGIN_TILES = 1;
type SpriteCanvasLayout = ReturnType<typeof getSpriteCanvasLayout>;

function sortSpriteStates(spriteStates: SpriteStateRecord[]) {
  return spriteStates
    .slice()
    .sort((left, right) => {
      if (left.state_id === "default") {
        return -1;
      }

      if (right.state_id === "default") {
        return 1;
      }

      return left.state_id.localeCompare(right.state_id);
    });
}

function truncateMountValue(value: number) {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

function applySpriteFootprint(spriteRecord: SpriteRecord) {
  return {
    ...spriteRecord,
    ...getSpriteTileFootprint(spriteRecord)
  };
}

function createSpriteImageMetricsFromImage(spriteRecord: SpriteRecord, spriteImage: HTMLImageElement): SpriteRecord {
  const metricsCanvas = document.createElement("canvas");
  metricsCanvas.width = spriteImage.width;
  metricsCanvas.height = spriteImage.height;
  const metricsContext = metricsCanvas.getContext("2d", { willReadFrequently: true });

  if (!metricsContext) {
    return applySpriteFootprint({
      ...spriteRecord,
      image_h: spriteImage.height,
      image_w: spriteImage.width
    });
  }

  metricsContext.clearRect(0, 0, metricsCanvas.width, metricsCanvas.height);
  metricsContext.drawImage(spriteImage, 0, 0);
  const imageData = metricsContext.getImageData(0, 0, metricsCanvas.width, metricsCanvas.height);
  const spriteWithImageSize = {
    ...spriteRecord,
    image_h: spriteImage.height,
    image_w: spriteImage.width
  };

  return applySpriteFootprint({
    ...spriteWithImageSize,
    ...getSpriteBoundingBox(spriteWithImageSize, (x, y) => imageData.data[(y * imageData.width + x) * 4 + 3] ?? 0)
  });
}

function createSpriteMountUpdate(
  spriteRecord: SpriteRecord,
  mount: { mount_x: number; mount_y: number }
): SpriteRecord {
  const nextMountX = truncateMountValue(mount.mount_x);
  const nextMountY = truncateMountValue(mount.mount_y);
  const imageSpaceBoundingLeft = spriteRecord.mount_x + spriteRecord.bounding_x;
  const imageSpaceBoundingTop = spriteRecord.mount_y + spriteRecord.bounding_y;

  return applySpriteFootprint({
    ...spriteRecord,
    ...snapSpriteBoundingBoxToTileGrid({
      bounding_h: spriteRecord.bounding_h,
      bounding_w: spriteRecord.bounding_w,
      bounding_x: imageSpaceBoundingLeft - nextMountX,
      bounding_y: imageSpaceBoundingTop - nextMountY,
      mount_x: nextMountX,
      mount_y: nextMountY
    }),
    mount_x: nextMountX,
    mount_y: nextMountY
  });
}

function normalizeSpriteMount(spriteRecord: SpriteRecord): SpriteRecord {
  return createSpriteMountUpdate(spriteRecord, {
    mount_x: spriteRecord.mount_x,
    mount_y: spriteRecord.mount_y
  });
}

function getSpriteCanvasLayout(spriteRecord: SpriteRecord, imageWidth: number, imageHeight: number) {
  const imageLeftFromOrigin = TILE_SIZE / 2 - spriteRecord.mount_x;
  const imageTopFromOrigin = TILE_SIZE / 2 - spriteRecord.mount_y;
  const imageRightFromOrigin = imageLeftFromOrigin + imageWidth;
  const imageBottomFromOrigin = imageTopFromOrigin + imageHeight;
  const footprint = getSpriteTileFootprint({
    image_h: imageHeight,
    image_w: imageWidth,
    mount_x: spriteRecord.mount_x,
    mount_y: spriteRecord.mount_y
  });
  const coveredTilesLeft = Math.ceil(Math.max(0, -imageLeftFromOrigin) / TILE_SIZE);
  const coveredTilesUp = Math.ceil(Math.max(0, -imageTopFromOrigin) / TILE_SIZE);
  const coveredTilesRight = Math.max(0, footprint.tile_w - coveredTilesLeft - 1);
  const coveredTilesDown = Math.max(0, footprint.tile_h - coveredTilesUp - 1);
  const tilesLeft = coveredTilesLeft + SPRITE_GRID_MARGIN_TILES;
  const tilesRight = coveredTilesRight + SPRITE_GRID_MARGIN_TILES;
  const tilesUp = coveredTilesUp + SPRITE_GRID_MARGIN_TILES;
  const tilesDown = coveredTilesDown + SPRITE_GRID_MARGIN_TILES;
  const originTileLeft = tilesLeft * TILE_SIZE;
  const originTileTop = tilesUp * TILE_SIZE;
  const originCenterX = originTileLeft + TILE_SIZE / 2;
  const originCenterY = originTileTop + TILE_SIZE / 2;

  return {
    canvasHeight: (tilesUp + 1 + tilesDown) * TILE_SIZE,
    canvasWidth: (tilesLeft + 1 + tilesRight) * TILE_SIZE,
    imageLeft: originCenterX - spriteRecord.mount_x,
    imageTop: originCenterY - spriteRecord.mount_y,
    originCenterX,
    originCenterY,
    originTileLeft,
    originTileTop
  };
}

function getSpriteSaveSnapshot(spriteRecord: SpriteRecord | null) {
  if (!spriteRecord) {
    return "";
  }

  const { thumbnail: _thumbnail, ...persistedSpriteRecord } = spriteRecord;
  return JSON.stringify(persistedSpriteRecord);
}

export function TileWorkshop() {
  const {
    activeSprite,
    activeTile,
    activeTileSlug,
    clearPendingTileSourceImage,
    getTileDraftSlots,
    initialImagePath,
    openPaintEditor,
    pendingTileSourceImage,
    setTileDraftSlots,
    updateTileDraftSlot,
    upsertSprite,
    upsertTile
  } = useStudio();
  const [selectedSlotKey, setSelectedSlotKey] = useState<SlotKey>("main");
  const [selectorSize, setSelectorSize] = useState(TILE_SIZE);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [sourceImageName, setSourceImageName] = useState("");
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectedRegion | null>(null);
  const [tileImpassible, setTileImpassible] = useState(true);
  const [spriteDraft, setSpriteDraft] = useState<SpriteRecord | null>(null);
  const [spriteImage, setSpriteImage] = useState<HTMLImageElement | null>(null);
  const [spriteImageUrl, setSpriteImageUrl] = useState<string | null>(null);
  const [spriteMoveDraftMount, setSpriteMoveDraftMount] = useState<{ mount_x: number; mount_y: number } | null>(null);
  const [isSpriteMoveToolActive, setSpriteMoveToolActive] = useState(false);
  const [isSpriteMoveDragging, setSpriteMoveDragging] = useState(false);
  const [isSpriteSaving, setSpriteSaving] = useState(false);
  const [spriteStatus, setSpriteStatus] = useState("");
  const [spriteReplacementFile, setSpriteReplacementFile] = useState<File | null>(null);
  const [activeSpriteStateId, setActiveSpriteStateId] = useState("default");
  const [spriteStates, setSpriteStates] = useState<SpriteStateRecord[]>([]);
  const [slotPendingClear, setSlotPendingClear] = useState<SlotKey | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const spriteFileInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spriteCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spriteDragPositionRef = useRef<{ x: number; y: number } | null>(null);
  const spriteFrozenLayoutRef = useRef<SpriteCanvasLayout | null>(null);
  const spriteMoveMountRef = useRef<{ mount_x: number; mount_y: number } | null>(null);
  const spriteDraftRef = useRef<SpriteRecord | null>(null);
  const spriteImageRef = useRef<HTMLImageElement | null>(null);
  const spriteImageUrlRef = useRef<string | null>(null);
  const spriteReplacementFileRef = useRef<File | null>(null);
  const skipNextImpassibleAutosaveRef = useRef(false);
  const isSpriteSavingRef = useRef(false);
  const pendingSpriteSaveRef = useRef(false);
  const lastSavedSpriteSnapshotRef = useRef("");
  const didLoadInitialImageRef = useRef(false);
  const imageCache = useImageCache();
  const draftSlots = getTileDraftSlots(activeTileSlug, activeTile?.slots);

  const loadedSlotsSnapshot = JSON.stringify(normalizeSlotRecords(activeTile?.slots));
  const draftSlotsSnapshot = JSON.stringify(normalizeSlotRecords(draftSlots));
  const hasUnsavedTileChanges =
    Boolean(activeTileSlug) &&
    (loadedSlotsSnapshot !== draftSlotsSnapshot || tileImpassible !== (activeTile?.impassible ?? true));
  const activeSelectorSize = selectedSlotKey === "main" ? TILE_SIZE : selectorSize;
  const previewPlacements = buildPreviewPlacements(
    `${activeTile?.slug ?? "empty"}:${draftSlots.map((slotRecord) => slotRecord?.pixels.length ?? 0).join("-")}`
  );

  useEffect(() => {
    return () => {
      revokeObjectUrl(sourceImageUrl);
    };
  }, [sourceImageUrl]);

  useEffect(() => {
    return () => {
      revokeObjectUrl(spriteImageUrlRef.current);
    };
  }, []);

  useEffect(() => {
    spriteDraftRef.current = spriteDraft;
  }, [spriteDraft]);

  useEffect(() => {
    spriteImageRef.current = spriteImage;
  }, [spriteImage]);

  useEffect(() => {
    spriteImageUrlRef.current = spriteImageUrl;
  }, [spriteImageUrl]);

  useEffect(() => {
    spriteReplacementFileRef.current = spriteReplacementFile;
  }, [spriteReplacementFile]);

  useEffect(() => {
    skipNextImpassibleAutosaveRef.current = true;
    setTileImpassible(activeTile?.impassible ?? true);
  }, [activeTile?.impassible, activeTileSlug]);

  const saveTileDraft = useEffectEvent((nextImpassible = tileImpassible) => {
    if (!activeTileSlug) {
      return;
    }

    startTransition(() => {
      void saveTileAction({
        impassible: nextImpassible,
        slots: draftSlots,
        slug: activeTileSlug,
        source: sourceImageName || activeTile?.source || ""
      })
        .then((savedTile) => {
          upsertTile(savedTile);
          setTileDraftSlots(savedTile.slug, normalizeSlotRecords(savedTile.slots));
        })
        .catch(() => {});
    });
  });

  useEffect(() => {
    if (skipNextImpassibleAutosaveRef.current) {
      skipNextImpassibleAutosaveRef.current = false;
      return;
    }

    if (!activeTileSlug || !activeTile) {
      return;
    }

    if (tileImpassible === (activeTile.impassible ?? false)) {
      return;
    }

    saveTileDraft(tileImpassible);
  }, [activeTile, activeTileSlug, saveTileDraft, tileImpassible]);

  useEffect(() => {
    if (!selection) {
      return;
    }

    setSelection((currentSelection) => {
      if (!currentSelection || !sourceImage) {
        return currentSelection;
      }

      const nextPosition = clampSelection(
        sourceImage.width,
        sourceImage.height,
        currentSelection.x,
        currentSelection.y,
        activeSelectorSize
      );

      if (
        currentSelection.size === activeSelectorSize &&
        currentSelection.x === nextPosition.x &&
        currentSelection.y === nextPosition.y
      ) {
        return currentSelection;
      }

      return {
        size: activeSelectorSize,
        x: nextPosition.x,
        y: nextPosition.y
      };
    });
  }, [activeSelectorSize, selection, sourceImage]);

  const renderSourceCanvas = useEffectEvent(() => {
    const sourceCanvas = sourceCanvasRef.current;

    if (!sourceCanvas) {
      return;
    }

    const context = sourceCanvas.getContext("2d");

    if (!context) {
      return;
    }

    context.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);

    if (!sourceImage) {
      return;
    }

    context.drawImage(sourceImage, 0, 0);

    if (!selection) {
      return;
    }

    context.save();
    context.fillStyle = "rgba(216, 135, 83, 0.18)";
    context.strokeStyle = "#f1c97b";
    context.lineWidth = 3;
    context.fillRect(selection.x, selection.y, selection.size, selection.size);
    context.strokeRect(selection.x + 1.5, selection.y + 1.5, selection.size - 3, selection.size - 3);
    context.restore();
  });

  const renderPreviewCanvas = useEffectEvent(async () => {
    const previewCanvas = previewCanvasRef.current;

    if (!previewCanvas) {
      return;
    }

    const context = previewCanvas.getContext("2d");

    if (!context) {
      return;
    }

    const imageUrls = draftSlots
      .map((slotRecord) => slotRecord?.pixels ?? "")
      .filter(Boolean);

    await Promise.all(imageUrls.map((imageUrl) => imageCache.ensureImage(imageUrl)));

    context.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);

    for (let tileY = 0; tileY < 10; tileY += 1) {
      for (let tileX = 0; tileX < 10; tileX += 1) {
        const drawX = tileX * TILE_SIZE;
        const drawY = tileY * TILE_SIZE;
        const mainSlot = draftSlots[0];
        const mainImage = mainSlot?.pixels ? imageCache.getCachedImage(mainSlot.pixels) : null;

        if (mainImage) {
          context.drawImage(mainImage, drawX, drawY, TILE_SIZE, TILE_SIZE);
        } else {
          drawPlaceholderCell(context, drawX, drawY, EMPTY_TILE_LABEL);
        }
      }
    }

    for (const placement of previewPlacements) {
      const slotRecord = draftSlots[placement.slotIndex + 1];
      const accentImage = slotRecord?.pixels
        ? imageCache.getCachedImage(slotRecord.pixels)
        : null;

      if (accentImage) {
        context.drawImage(
          accentImage,
          placement.tileX * TILE_SIZE,
          placement.tileY * TILE_SIZE,
          TILE_SIZE,
          TILE_SIZE
        );
      }
    }
  });

  useEffect(() => {
    renderSourceCanvas();
  }, [renderSourceCanvas, selection, sourceImage]);

  useEffect(() => {
    void renderPreviewCanvas();
  }, [draftSlots, previewPlacements, renderPreviewCanvas]);

  useEffect(() => {
    if (!activeSprite) {
      setSpriteDraft(null);
      setSpriteImage(null);
      setSpriteImageUrl(null);
      setActiveSpriteStateId("default");
      setSpriteStates([]);
      setSpriteMoveDraftMount(null);
      setSpriteMoveToolActive(false);
      setSpriteMoveDragging(false);
      spriteDragPositionRef.current = null;
      spriteFrozenLayoutRef.current = null;
      spriteMoveMountRef.current = null;
      lastSavedSpriteSnapshotRef.current = "";
      pendingSpriteSaveRef.current = false;
      isSpriteSavingRef.current = false;
      setSpriteSaving(false);
      setSpriteStatus("");
      setSpriteReplacementFile(null);
      return;
    }

    let isCancelled = false;

    setSpriteDraft(normalizeSpriteMount(activeSprite));
    setSpriteImage(null);
    setSpriteImageUrl(null);
    setActiveSpriteStateId("default");
    setSpriteStates([]);
    setSpriteMoveDraftMount(null);
    setSpriteMoveDragging(false);
    spriteDragPositionRef.current = null;
    spriteFrozenLayoutRef.current = null;
    spriteMoveMountRef.current = null;
    lastSavedSpriteSnapshotRef.current = getSpriteSaveSnapshot(normalizeSpriteMount(activeSprite));
    pendingSpriteSaveRef.current = false;
    isSpriteSavingRef.current = false;
    setSpriteSaving(false);
    setSpriteStatus("");
    setSpriteReplacementFile(null);

    void readSpriteStatesAction({
      filename: activeSprite.filename,
      path: activeSprite.path
    })
      .then((nextStates) => {
        if (isCancelled) {
          return;
        }

        setSpriteStates(sortSpriteStates(nextStates));
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setSpriteStatus(error instanceof Error ? error.message : "Could not load sprite states.");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [activeSprite?.filename, activeSprite?.path]);

  useEffect(() => {
    if (!activeSprite || !spriteDraft) {
      return;
    }

    if (activeSpriteStateId === "default" && spriteReplacementFile) {
      return;
    }

    const activeSpriteState =
      activeSpriteStateId === "default"
        ? null
        : spriteStates.find((spriteState) => spriteState.state_id === activeSpriteStateId) ?? null;
    const nextImageUrl =
      activeSpriteStateId === "default"
        ? spriteDraft.thumbnail || activeSprite.thumbnail
        : activeSpriteState?.thumbnail ?? "";

    if (!nextImageUrl) {
      setSpriteImage(null);
      setSpriteImageUrl(null);
      return;
    }

    if (spriteImageUrlRef.current === nextImageUrl && spriteImageRef.current) {
      return;
    }

    let isCancelled = false;
    const previousSpriteImageUrl = spriteImageUrlRef.current;

    void loadImageFromUrl(nextImageUrl)
      .then((nextImage) => {
        if (isCancelled) {
          return;
        }

        if (previousSpriteImageUrl !== nextImageUrl) {
          revokeObjectUrl(previousSpriteImageUrl);
        }

        setSpriteImage(nextImage);
        setSpriteImageUrl(nextImageUrl);
      })
      .catch(() => {
        if (!isCancelled) {
          setSpriteImage(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    activeSprite?.thumbnail,
    activeSpriteStateId,
    spriteDraft?.thumbnail,
    spriteReplacementFile,
    spriteStates
  ]);

  const renderSpriteCanvas = useEffectEvent(() => {
    const spriteCanvas = spriteCanvasRef.current;

    if (!spriteCanvas || !spriteImage || !spriteDraft) {
      return;
    }

    const activeMount =
      (isSpriteMoveDragging ? spriteMoveMountRef.current : null) ??
      spriteMoveDraftMount ?? {
        mount_x: spriteDraft.mount_x,
        mount_y: spriteDraft.mount_y
      };
    const layout =
      isSpriteMoveDragging && spriteFrozenLayoutRef.current
        ? spriteFrozenLayoutRef.current
        : getSpriteCanvasLayout(spriteDraft, spriteImage.width, spriteImage.height);

    if (spriteCanvas.width !== layout.canvasWidth) {
      spriteCanvas.width = layout.canvasWidth;
    }

    if (spriteCanvas.height !== layout.canvasHeight) {
      spriteCanvas.height = layout.canvasHeight;
    }

    const context = spriteCanvas.getContext("2d");

    if (!context) {
      return;
    }

    context.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);

    for (let y = 0; y < spriteCanvas.height; y += 16) {
      for (let x = 0; x < spriteCanvas.width; x += 16) {
        context.fillStyle = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0 ? "#e9ece9" : "#cfd7d2";
        context.fillRect(x, y, 16, 16);
      }
    }

    context.drawImage(
      spriteImage,
      layout.originCenterX - activeMount.mount_x,
      layout.originCenterY - activeMount.mount_y
    );

    const imageSpaceBoundingLeft = spriteDraft.mount_x + spriteDraft.bounding_x;
    const imageSpaceBoundingTop = spriteDraft.mount_y + spriteDraft.bounding_y;
    const activeBoundingX = imageSpaceBoundingLeft - activeMount.mount_x;
    const activeBoundingY = imageSpaceBoundingTop - activeMount.mount_y;

    context.save();
    context.strokeStyle = "rgba(0, 0, 0, 0.4)";
    context.lineWidth = 1;

    for (let x = 0; x <= spriteCanvas.width; x += TILE_SIZE) {
      context.beginPath();
      context.moveTo(x + 0.5, 0);
      context.lineTo(x + 0.5, spriteCanvas.height);
      context.stroke();
    }

    for (let y = 0; y <= spriteCanvas.height; y += TILE_SIZE) {
      context.beginPath();
      context.moveTo(0, y + 0.5);
      context.lineTo(spriteCanvas.width, y + 0.5);
      context.stroke();
    }

    if (spriteDraft.bounding_w > 0 && spriteDraft.bounding_h > 0) {
      context.strokeStyle = "rgba(0, 60, 160, 0.3)";
      context.lineWidth = 2;
      context.strokeRect(
        layout.originCenterX + activeBoundingX + 0.5,
        layout.originCenterY + activeBoundingY + 0.5,
        Math.max(0, spriteDraft.bounding_w - 1),
        Math.max(0, spriteDraft.bounding_h - 1)
      );
    }

    context.strokeStyle = "rgba(216, 135, 83, 0.75)";
    context.lineWidth = 2;
    context.strokeRect(layout.originTileLeft + 1, layout.originTileTop + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    context.beginPath();
    context.moveTo(layout.originCenterX - 8, layout.originCenterY);
    context.lineTo(layout.originCenterX + 8, layout.originCenterY);
    context.moveTo(layout.originCenterX, layout.originCenterY - 8);
    context.lineTo(layout.originCenterX, layout.originCenterY + 8);
    context.stroke();

    context.restore();
  });

  useEffect(() => {
    renderSpriteCanvas();
  }, [isSpriteMoveDragging, renderSpriteCanvas, spriteDraft, spriteImage, spriteMoveDraftMount]);

  function applyLoadedImage(payload: LoadedImagePayload) {
    startTransition(() => {
      void (async () => {
        try {
          const nextImage = await loadImageFromUrl(payload.dataUrl);

          revokeObjectUrl(sourceImageUrl);

          const sourceCanvas = sourceCanvasRef.current;

          if (sourceCanvas) {
            sourceCanvas.width = nextImage.width;
            sourceCanvas.height = nextImage.height;
          }

          setSourceImage(nextImage);
          setSourceImageName(payload.sourcePath || payload.name);
          setSourceImageUrl(payload.dataUrl);
          setSelection({
            size: activeSelectorSize,
            x: 0,
            y: 0
          });
        } catch {
          // Ignore decode failure and leave the previous source image in place.
        }
      })();
    });
  }

  useEffect(() => {
    if (!initialImagePath || didLoadInitialImageRef.current) {
      return;
    }

    didLoadInitialImageRef.current = true;

    startTransition(() => {
      void loadProjectImageAction(initialImagePath)
        .then((payload) => {
          applyLoadedImage(payload);
        })
        .catch(() => {});
    });
  }, [applyLoadedImage, initialImagePath, startTransition]);

  useEffect(() => {
    if (!pendingTileSourceImage || pendingTileSourceImage.tileSlug !== activeTileSlug) {
      return;
    }

    applyLoadedImage(pendingTileSourceImage.payload);
    clearPendingTileSourceImage();
  }, [activeTileSlug, applyLoadedImage, clearPendingTileSourceImage, pendingTileSourceImage]);

  async function loadSelectedFile(file: File) {
    if (!file.type.startsWith("image/")) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    try {
      const nextImage = await loadImageFromUrl(objectUrl);
      revokeObjectUrl(sourceImageUrl);

      const sourceCanvas = sourceCanvasRef.current;

      if (sourceCanvas) {
        sourceCanvas.width = nextImage.width;
        sourceCanvas.height = nextImage.height;
      }

      setSourceImage(nextImage);
      setSourceImageName(file.name);
      setSourceImageUrl(objectUrl);
      setSelection({
        size: activeSelectorSize,
        x: 0,
        y: 0
      });
    } catch {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function loadSelectedSpriteFile(file: File) {
    if (file.type !== "image/png" && !file.name.toLowerCase().endsWith(".png")) {
      setSpriteStatus("Sprite replacement images currently require a PNG file.");
      return;
    }

    if (activeSpriteStateId !== "default") {
      if (!spriteDraft) {
        return;
      }

      const objectUrl = URL.createObjectURL(file);

      try {
        const nextImage = await loadImageFromUrl(objectUrl);
        revokeObjectUrl(spriteImageUrl);
        setSpriteImage(nextImage);
        setSpriteImageUrl(objectUrl);
        setSpriteSaving(true);
        setSpriteStatus(`Saving ${activeSpriteStateId} state image...`);

        const formData = new FormData();
        formData.append("file", file);
        formData.append("filename", spriteDraft.filename);
        formData.append("path", spriteDraft.path);
        formData.append("stateId", activeSpriteStateId);

        const response = await fetch(SAVE_SPRITE_STATE_IMAGE_PATH, {
          body: formData,
          method: "POST"
        });
        const responseBody = (await response.json()) as Partial<SpriteStateRecord> & { error?: string };

        if (!response.ok || responseBody.error || typeof responseBody.state_id !== "string") {
          setSpriteStatus(responseBody.error ?? "Could not save sprite state image.");
          return;
        }

        const savedState = responseBody as SpriteStateRecord;
        setSpriteStates((currentStates) =>
          sortSpriteStates([
            ...currentStates.filter((spriteState) => spriteState.state_id !== savedState.state_id),
            savedState
          ])
        );
        setSpriteStatus(`Saved ${savedState.state_id} state image.`);
      } catch {
        URL.revokeObjectURL(objectUrl);
        setSpriteStatus("Could not save sprite state image.");
      } finally {
        setSpriteSaving(false);
      }

      return;
    }

    const objectUrl = URL.createObjectURL(file);

    try {
      const nextImage = await loadImageFromUrl(objectUrl);
      revokeObjectUrl(spriteImageUrl);

      setSpriteImage(nextImage);
      setSpriteImageUrl(objectUrl);
      setSpriteReplacementFile(file);
      setSpriteStatus(`Ready to replace ${activeSprite?.filename ?? "sprite image"} with ${file.name}.`);
      setSpriteDraft((currentSprite) =>
        currentSprite
          ? createSpriteImageMetricsFromImage(
              spriteUsesDefaultMount(currentSprite)
                ? {
                    ...currentSprite,
                    ...getDefaultSpriteMount(nextImage.width, nextImage.height)
                  }
                : currentSprite,
              nextImage
            )
          : currentSprite
      );
    } catch {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function updateSelectionFromPointer(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!sourceImage || !sourceCanvasRef.current) {
      return;
    }

    const rect = sourceCanvasRef.current.getBoundingClientRect();
    const scaleX = sourceCanvasRef.current.width / rect.width;
    const scaleY = sourceCanvasRef.current.height / rect.height;
    const canvasX = Math.round((event.clientX - rect.left) * scaleX);
    const canvasY = Math.round((event.clientY - rect.top) * scaleY);
    const nextPosition = clampSelection(
      sourceImage.width,
      sourceImage.height,
      snapToTileBorder(canvasX),
      snapToTileBorder(canvasY),
      activeSelectorSize
    );

    setSelection({
      size: activeSelectorSize,
      x: nextPosition.x,
      y: nextPosition.y
    });
  }

  function captureSelection() {
    if (!activeTileSlug) {
      return;
    }

    if (!sourceImage || !selection) {
      return;
    }

    const nextSlots = normalizeSlotRecords(draftSlots);
    const slotIndex = getSlotIndex(selectedSlotKey);

    nextSlots[slotIndex] = createPaddedSlotRecord(sourceImage, selection);
    setTileDraftSlots(activeTileSlug, nextSlots);
  }

  function clearDraftSlots() {
    if (!activeTileSlug) {
      return;
    }

    setTileDraftSlots(activeTileSlug, normalizeSlotRecords(undefined));
  }

  function confirmClearSlot() {
    if (!activeTileSlug || !slotPendingClear) {
      setSlotPendingClear(null);
      return;
    }

    updateTileDraftSlot(activeTileSlug, slotPendingClear, null);
    setSlotPendingClear(null);
  }

  function handleSaveTile() {
    if (!activeTileSlug) {
      return;
    }

    saveTileDraft(tileImpassible);
  }

  function handleExport() {
    const tileName = activeTile?.name ?? "tile";
    const tileSlug = activeTile?.slug ?? tileName;

    startTransition(() => {
      void exportCombinedSlotsAction({
        slots: draftSlots,
        tileName,
        tileSlug
      })
        .then((artifact) => {
          triggerDownload(artifact.dataUrl, artifact.fileName);
        })
        .catch(() => {});
    });
  }

  function updateSpriteNumberField(
    field: "item_id" | "mount_x" | "mount_y" | "offset_x" | "offset_y" | "tile_h" | "tile_w",
    value: string
  ) {
    const nextValue = Number(value);
    const normalizedValue =
      field === "mount_x" || field === "mount_y"
        ? truncateMountValue(nextValue)
        : Number.isFinite(nextValue)
          ? nextValue
          : 0;

    setSpriteDraft((currentSprite) =>
      currentSprite
        ? {
            ...currentSprite,
            [field]: normalizedValue
          }
        : currentSprite
    );
  }

  function getSpriteCanvasPointerPosition(event: React.MouseEvent<HTMLCanvasElement>) {
    const spriteCanvas = spriteCanvasRef.current;

    if (!spriteCanvas) {
      return null;
    }

    const rect = spriteCanvas.getBoundingClientRect();

    if (!rect.width || !rect.height) {
      return null;
    }

    return {
      x: (event.clientX - rect.left) * (spriteCanvas.width / rect.width),
      y: (event.clientY - rect.top) * (spriteCanvas.height / rect.height)
    };
  }

  function handleSpriteCanvasMouseDown(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!isSpriteMoveToolActive || !spriteDraft || !spriteImage) {
      return;
    }

    const pointerPosition = getSpriteCanvasPointerPosition(event);

    if (!pointerPosition) {
      return;
    }

    spriteDragPositionRef.current = pointerPosition;
    spriteFrozenLayoutRef.current = getSpriteCanvasLayout(spriteDraft, spriteImage.width, spriteImage.height);
    spriteMoveMountRef.current = {
      mount_x: spriteDraft.mount_x,
      mount_y: spriteDraft.mount_y
    };
    setSpriteMoveDraftMount(spriteMoveMountRef.current);
    setSpriteMoveDragging(true);
    setSpriteStatus("Dragging sprite to adjust mount point.");
    renderSpriteCanvas();
  }

  function handleSpriteCanvasMouseMove(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!isSpriteMoveToolActive || !isSpriteMoveDragging) {
      return;
    }

    const pointerPosition = getSpriteCanvasPointerPosition(event);
    const lastDragPosition = spriteDragPositionRef.current;

    if (!pointerPosition || !lastDragPosition) {
      return;
    }

    const deltaX = pointerPosition.x - lastDragPosition.x;
    const deltaY = pointerPosition.y - lastDragPosition.y;

    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    const currentMount = spriteMoveMountRef.current;

    if (!currentMount) {
      return;
    }

    spriteDragPositionRef.current = pointerPosition;
    spriteMoveMountRef.current = {
      mount_x: truncateMountValue(currentMount.mount_x - deltaX),
      mount_y: truncateMountValue(currentMount.mount_y - deltaY)
    };
    setSpriteMoveDraftMount(spriteMoveMountRef.current);
    renderSpriteCanvas();
  }

  function stopSpriteCanvasDrag() {
    if (isSpriteMoveDragging) {
      const nextMount = spriteMoveMountRef.current;

      if (nextMount && spriteDraftRef.current) {
        const nextSprite = createSpriteMountUpdate(spriteDraftRef.current, nextMount);

        spriteDraftRef.current = nextSprite;
        setSpriteDraft(nextSprite);
        void persistSprite(true);
      }

      setSpriteMoveDragging(false);
      spriteDragPositionRef.current = null;
      spriteFrozenLayoutRef.current = null;
      spriteMoveMountRef.current = null;
      setSpriteMoveDraftMount(null);
    }
  }

  const persistSprite = useEffectEvent(async (announceSaving: boolean) => {
    const currentSpriteDraft = spriteDraftRef.current;

    if (!currentSpriteDraft) {
      return;
    }

    if (isSpriteSavingRef.current) {
      pendingSpriteSaveRef.current = true;
      return;
    }

    isSpriteSavingRef.current = true;
    setSpriteSaving(true);

    if (announceSaving) {
      setSpriteStatus("Saving sprite...");
    }

    try {
      const formData = new FormData();
      formData.append("sprite", JSON.stringify(currentSpriteDraft));

      if (spriteReplacementFileRef.current) {
        formData.append("file", spriteReplacementFileRef.current);
      }

      const response = await fetch(SAVE_SPRITE_PATH, {
        body: formData,
        method: "POST"
      });
      const responseBody = (await response.json()) as Partial<SpriteRecord> & { error?: string };

      if (!response.ok || responseBody.error) {
        setSpriteStatus(responseBody.error ?? "Could not save sprite.");
        return;
      }

      const savedSprite = responseBody as SpriteRecord;
      upsertSprite(savedSprite);
      setSpriteDraft(savedSprite);
      setSpriteReplacementFile(null);
      lastSavedSpriteSnapshotRef.current = getSpriteSaveSnapshot(savedSprite);
      setSpriteStatus(`Saved ${savedSprite.filename}.`);
    } catch {
      setSpriteStatus("Could not save sprite.");
    } finally {
      isSpriteSavingRef.current = false;
      setSpriteSaving(false);

      if (pendingSpriteSaveRef.current) {
        pendingSpriteSaveRef.current = false;
        void persistSprite(false);
      }
    }
  });

  useEffect(() => {
    if (!spriteDraft || isSpriteMoveDragging) {
      return;
    }

    const hasUnsavedSpriteChanges =
      getSpriteSaveSnapshot(spriteDraft) !== lastSavedSpriteSnapshotRef.current ||
      Boolean(spriteReplacementFile);

    if (!hasUnsavedSpriteChanges) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void persistSprite(false);
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isSpriteMoveDragging, persistSprite, spriteDraft, spriteReplacementFile]);

  function handleSaveSprite() {
    void persistSprite(true);
  }

  function handleAutoLayout() {
    const currentSprite = spriteDraftRef.current;

    if (!currentSprite) {
      return;
    }

    const nextSprite = createSpriteMountUpdate(currentSprite, {
      mount_x: currentSprite.image_w / 2,
      mount_y: currentSprite.image_h - 64
    });

    spriteDraftRef.current = nextSprite;
    setSpriteDraft(nextSprite);
    void persistSprite(true, false);
  }

  async function handleCreateSpriteState(stateName: string) {
    const currentSprite = spriteDraftRef.current;

    if (!currentSprite) {
      throw new Error("Choose a sprite before creating a state.");
    }

    const createdState = await createSpriteStateAction({
      filename: currentSprite.filename,
      path: currentSprite.path,
      sourceStateId: activeSpriteStateId,
      stateId: stateName
    });

    setSpriteStates((currentStates) =>
      sortSpriteStates([
        ...currentStates.filter((spriteState) => spriteState.state_id !== createdState.state_id),
        createdState
      ])
    );
    setActiveSpriteStateId(createdState.state_id);
    setSpriteReplacementFile(null);
    setSpriteStatus(`Created ${createdState.state_id} state.`);
  }

  return (
    <div className="min-h-0">
      <div className="grid min-h-0 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="min-h-0 xl:h-[calc(100vh-7rem)]">
          <TileLibraryPanel variant="sidebar" />
        </div>
        <div className="min-h-0">
          {activeSprite ? (
            <SpriteEditorWorkspace
              activeSpriteStateId={activeSpriteStateId}
              fileInputRef={spriteFileInputRef}
              isMoveToolActive={isSpriteMoveToolActive}
              isMoveToolDragging={isSpriteMoveDragging}
              isSaving={isSpriteSaving}
              onAutoLayout={handleAutoLayout}
              onBrowseImage={() => {
                spriteFileInputRef.current?.click();
              }}
              onCreateSpriteState={handleCreateSpriteState}
              onEditEvents={() => {
                window.location.hash = "#/sprite-events";
              }}
              onFileSelected={(file) => {
                void loadSelectedSpriteFile(file);
              }}
              onSaveSprite={handleSaveSprite}
              onSelectSpriteState={(stateId) => {
                setActiveSpriteStateId(stateId);
                setSpriteReplacementFile(null);
                setSpriteStatus("");
              }}
              onSourceCanvasMouseDown={handleSpriteCanvasMouseDown}
              onSourceCanvasMouseLeave={stopSpriteCanvasDrag}
              onSourceCanvasMouseMove={handleSpriteCanvasMouseMove}
              onSourceCanvasMouseUp={stopSpriteCanvasDrag}
              onSpriteBooleanChange={(field, value) => {
                setSpriteDraft((currentSprite) =>
                  currentSprite
                    ? {
                        ...currentSprite,
                        [field]: value
                      }
                    : currentSprite
                );
              }}
              onSpriteNumberChange={updateSpriteNumberField}
              onSpriteTextChange={(field, value) => {
                setSpriteDraft((currentSprite) =>
                  currentSprite
                    ? {
                        ...currentSprite,
                        [field]: value
                      }
                    : currentSprite
                );
              }}
              onToggleMoveTool={() => {
                setSpriteMoveToolActive((currentValue) => {
                  const nextValue = !currentValue;

                  if (!nextValue) {
                    setSpriteMoveDragging(false);
                    spriteDragPositionRef.current = null;
                    spriteFrozenLayoutRef.current = null;
                    spriteMoveMountRef.current = null;
                    setSpriteMoveDraftMount(null);
                    setSpriteStatus("");
                  } else {
                    setSpriteStatus("Sprite Move enabled. Drag the image to adjust mount point.");
                  }

                  return nextValue;
                });
              }}
              sourceCanvasRef={spriteCanvasRef}
              sourceImage={spriteImage}
              spriteRecord={spriteDraft}
              spriteStates={spriteStates}
              statusMessage={spriteStatus}
            />
          ) : (
            <TileEditorWorkspace
              activeSelectorSize={activeSelectorSize}
              activeTile={activeTile}
              draftSlots={draftSlots}
              fileInputRef={fileInputRef}
              hasUnsavedTileChanges={hasUnsavedTileChanges}
              onBrowseImage={() => {
                fileInputRef.current?.click();
              }}
              onCancelClearSlot={() => {
                setSlotPendingClear(null);
              }}
              onClearDraftSlots={clearDraftSlots}
              onConfirmClearSlot={confirmClearSlot}
              onExport={handleExport}
              onFileSelected={(file) => {
                void loadSelectedFile(file);
              }}
              onOpenPaintEditor={(slotKey) => {
                if (activeTile) {
                  openPaintEditor(activeTile, slotKey);
                }
              }}
              onRequestClearSlot={(slotKey) => {
                setSlotPendingClear(slotKey);
              }}
              onSaveTile={handleSaveTile}
              onSelectSlot={setSelectedSlotKey}
              onSelectorSizeChange={setSelectorSize}
              onSourceCanvasClick={(event) => {
                updateSelectionFromPointer(event);
                captureSelection();
              }}
              onSourceCanvasMouseMove={updateSelectionFromPointer}
              tileImpassible={tileImpassible}
              onTileBooleanChange={(_field, value) => {
                setTileImpassible(value);
              }}
              previewCanvasRef={previewCanvasRef}
              selectedSlotKey={selectedSlotKey}
              slotPendingClear={slotPendingClear}
              sourceCanvasRef={sourceCanvasRef}
              sourceImage={sourceImage}
            />
          )}
        </div>
      </div>
    </div>
  );
}
