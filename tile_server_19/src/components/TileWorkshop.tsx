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
import { useStudio } from "../app/StudioContext";
import { EMPTY_TILE_LABEL, PREVIEW_SIZE, TILE_SIZE } from "../lib/constants";
import {
  loadImageFromUrl,
  revokeObjectUrl,
  triggerDownload
} from "../lib/images";
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
import { TileEditorWorkspace } from "./TileEditorWorkspace";
import { TileLibraryPanel } from "./TileLibraryPanel";
import type { LoadedImagePayload, SelectedRegion } from "../types";

export function TileWorkshop() {
  const {
    activeTile,
    activeTileSlug,
    getTileDraftSlots,
    initialImagePath,
    openPaintEditor,
    setTileDraftSlots,
    updateTileDraftSlot,
    upsertTile
  } = useStudio();
  const [selectedSlotKey, setSelectedSlotKey] = useState<SlotKey>("main");
  const [selectorSize, setSelectorSize] = useState(TILE_SIZE);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [sourceImageName, setSourceImageName] = useState("");
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectedRegion | null>(null);
  const [slotPendingClear, setSlotPendingClear] = useState<SlotKey | null>(null);
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const didLoadInitialImageRef = useRef(false);
  const imageCache = useImageCache();
  const draftSlots = getTileDraftSlots(activeTileSlug, activeTile?.slots);

  const loadedSlotsSnapshot = JSON.stringify(normalizeSlotRecords(activeTile?.slots));
  const draftSlotsSnapshot = JSON.stringify(normalizeSlotRecords(draftSlots));
  const hasUnsavedSlotChanges = Boolean(activeTileSlug) && loadedSlotsSnapshot !== draftSlotsSnapshot;
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

    startTransition(() => {
      void saveTileAction({
        slots: draftSlots,
        slug: activeTileSlug,
        source: sourceImageName
      })
        .then((savedTile) => {
          upsertTile(savedTile);
          setTileDraftSlots(savedTile.slug, normalizeSlotRecords(savedTile.slots));
        })
        .catch(() => {});
    });
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

  return (
    <div className="min-h-0">
      <div className="grid min-h-0 gap-4">
        <TileLibraryPanel />
        <TileEditorWorkspace
          activeSelectorSize={activeSelectorSize}
          activeTile={activeTile}
          draftSlots={draftSlots}
          fileInputRef={fileInputRef}
          hasUnsavedSlotChanges={hasUnsavedSlotChanges}
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
          previewCanvasRef={previewCanvasRef}
          selectedSlotKey={selectedSlotKey}
          slotPendingClear={slotPendingClear}
          sourceCanvasRef={sourceCanvasRef}
          sourceImage={sourceImage}
        />
      </div>
    </div>
  );
}
