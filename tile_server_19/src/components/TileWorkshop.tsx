"use client";

import {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition
} from "react";
import { faPenToSquare, faTrashCan } from "@awesome.me/kit-a62459359b/icons/classic/solid";

import {
  createTileAction,
  exportCombinedSlotsAction,
  loadProjectImageAction,
  saveTileAction
} from "../actions/tileActions";
import { useStudio } from "../app/StudioContext";
import { EMPTY_TILE_LABEL, PREVIEW_SIZE, TILE_SIZE } from "../lib/constants";
import {
  getBaseName,
  loadImageFromUrl,
  revokeObjectUrl,
  triggerDownload
} from "../lib/images";
import { normalizeUnderscoreName } from "../lib/naming";
import {
  buildPreviewPlacements,
  clampSelection,
  createPaddedSlotRecord,
  describeSlot,
  drawPlaceholderCell,
  getSlotIndex,
  normalizeSlotRecords,
  snapToTileBorder,
  type SlotKey
} from "../lib/slots";
import { useImageCache } from "../lib/useImageCache";
import { actionButtonClass } from "./buttonStyles";
import { FontAwesomeIcon } from "./FontAwesomeIcon";
import { Panel } from "./Panel";
import type { LoadedImagePayload, SelectedRegion } from "../types";

const SELECTOR_SIZES = [128, 64, 32, 16] as const;

export function TileWorkshop() {
  const {
    activeTile,
    activeTileSlug,
    getTileDraftSlots,
    initialImagePath,
    openPaintEditor,
    setActiveTileSlug,
    setTileDraftSlots,
    tiles,
    updateTileDraftSlot,
    upsertTile
  } = useStudio();
  const [newTileName, setNewTileName] = useState("");
  const [selectedSlotKey, setSelectedSlotKey] = useState<SlotKey>("main");
  const [selectorSize, setSelectorSize] = useState(TILE_SIZE);
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [sourceImageName, setSourceImageName] = useState("");
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectedRegion | null>(null);
  const [sourceStatus, setSourceStatus] = useState("Load an image to start slicing tiles.");
  const [tileStatus, setTileStatus] = useState("Select a tile record or create a new one.");
  const [tileQuery, setTileQuery] = useState("");
  const [slotPendingClear, setSlotPendingClear] = useState<SlotKey | null>(null);
  const [busyLabel, setBusyLabel] = useState("");
  const [, startTransition] = useTransition();
  const deferredTileQuery = useDeferredValue(tileQuery.trim().toLowerCase());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const didLoadInitialImageRef = useRef(false);
  const imageCache = useImageCache();
  const draftSlots = getTileDraftSlots(activeTileSlug, activeTile?.slots);

  const normalizedNewTileName = normalizeUnderscoreName(newTileName);
  const loadedSlotsSnapshot = JSON.stringify(normalizeSlotRecords(activeTile?.slots));
  const draftSlotsSnapshot = JSON.stringify(normalizeSlotRecords(draftSlots));
  const hasUnsavedSlotChanges = Boolean(activeTileSlug) && loadedSlotsSnapshot !== draftSlotsSnapshot;
  const activeSelectorSize = selectedSlotKey === "main" ? TILE_SIZE : selectorSize;
  const filteredTiles = tiles.filter((tileRecord) => {
    if (!deferredTileQuery) {
      return true;
    }

    return (
      tileRecord.name.toLowerCase().includes(deferredTileQuery) ||
      tileRecord.slug.toLowerCase().includes(deferredTileQuery)
    );
  });
  const previewPlacements = buildPreviewPlacements(
    `${activeTile?.slug ?? "empty"}:${draftSlots.map((slotRecord) => slotRecord?.pixels.length ?? 0).join("-")}`
  );

  useEffect(() => {
    if (activeTile) {
      setTileStatus(
        `Editing ${activeTile.name} (${activeTile.slug}).` +
          (activeTile.source ? ` Source: ${activeTile.source}.` : "")
      );
    } else {
      setTileStatus("Select a tile record or create a new one.");
    }
  }, [activeTile]);

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
          setSourceStatus(
            `Loaded ${payload.name} (${nextImage.width}x${nextImage.height}) from ${payload.sourcePath}.`
          );
        } catch {
          setSourceStatus(`Could not decode ${payload.name}.`);
        } finally {
          setBusyLabel("");
        }
      })();
    });
  }

  useEffect(() => {
    if (!initialImagePath || didLoadInitialImageRef.current) {
      return;
    }

    didLoadInitialImageRef.current = true;
    setBusyLabel("Loading source image");

    startTransition(() => {
      void loadProjectImageAction(initialImagePath)
        .then((payload) => {
          applyLoadedImage(payload);
        })
        .catch((error: unknown) => {
          setBusyLabel("");
          setSourceStatus(error instanceof Error ? error.message : "Could not load project image.");
        });
    });
  }, [applyLoadedImage, initialImagePath, startTransition]);

  async function loadSelectedFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setSourceStatus("Choose an image file.");
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
      setSourceStatus(`Loaded ${file.name} (${nextImage.width}x${nextImage.height}).`);
    } catch {
      URL.revokeObjectURL(objectUrl);
      setSourceStatus(`Could not decode ${file.name}.`);
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
    setSourceStatus(
      `Source ${getBaseName(sourceImageName || "image")}: x=${nextPosition.x}, y=${nextPosition.y}, ${activeSelectorSize}x${activeSelectorSize}.`
    );
  }

  function captureSelection() {
    if (!activeTileSlug) {
      setTileStatus("Choose a tile record before painting a slot.");
      return;
    }

    if (!sourceImage || !selection) {
      setTileStatus("Load a source image and choose an area before capturing a slot.");
      return;
    }

    const nextSlots = normalizeSlotRecords(draftSlots);
    const slotIndex = getSlotIndex(selectedSlotKey);

    nextSlots[slotIndex] = createPaddedSlotRecord(sourceImage, selection);
    setTileDraftSlots(activeTileSlug, nextSlots);
    setTileStatus(
      `Captured ${describeSlot(selectedSlotKey)} from x=${selection.x}, y=${selection.y} using ${selection.size}x${selection.size}.`
    );
  }

  function clearDraftSlots() {
    if (!activeTileSlug) {
      setTileStatus("Choose a tile record before clearing slots.");
      return;
    }

    setTileDraftSlots(activeTileSlug, normalizeSlotRecords(undefined));
    setTileStatus("Cleared every slot in the working draft.");
  }

  function confirmClearSlot() {
    if (!activeTileSlug || !slotPendingClear) {
      setSlotPendingClear(null);
      return;
    }

    updateTileDraftSlot(activeTileSlug, slotPendingClear, null);
    setTileStatus(`Cleared ${describeSlot(slotPendingClear)} from the working draft.`);
    setSlotPendingClear(null);
  }

  function handleCreateTile() {
    const nextName = normalizedNewTileName;

    if (!nextName) {
      setTileStatus("Name the new tile before creating it.");
      return;
    }

    setBusyLabel("Creating tile");

    startTransition(() => {
      void createTileAction(nextName)
        .then((createdTile) => {
          upsertTile(createdTile);
          setTileDraftSlots(createdTile.slug, normalizeSlotRecords(createdTile.slots));
          setNewTileName("");
          setActiveTileSlug(createdTile.slug);
          setTileStatus(`Created ${createdTile.name} (${createdTile.slug}).`);
        })
        .catch((error: unknown) => {
          setTileStatus(error instanceof Error ? error.message : "Could not create tile.");
        })
        .finally(() => {
          setBusyLabel("");
        });
    });
  }

  function handleSaveTile() {
    if (!activeTileSlug) {
      setTileStatus("Choose a tile record before saving.");
      return;
    }

    setBusyLabel("Saving tile");

    startTransition(() => {
      void saveTileAction({
        slots: draftSlots,
        slug: activeTileSlug,
        source: sourceImageName
      })
        .then((savedTile) => {
          upsertTile(savedTile);
          setTileDraftSlots(savedTile.slug, normalizeSlotRecords(savedTile.slots));
          setActiveTileSlug(savedTile.slug);
          setTileStatus(
            `Saved ${savedTile.name} (${savedTile.slug}).` +
              (savedTile.source ? ` Source: ${savedTile.source}.` : "")
          );
        })
        .catch((error: unknown) => {
          setTileStatus(error instanceof Error ? error.message : "Could not save tile.");
        })
        .finally(() => {
          setBusyLabel("");
        });
    });
  }

  function handleExport() {
    const tileName = activeTile?.name ?? "tile";
    const tileSlug = activeTile?.slug ?? tileName;

    setBusyLabel("Exporting strip");

    startTransition(() => {
      void exportCombinedSlotsAction({
        slots: draftSlots,
        tileName,
        tileSlug
      })
        .then((artifact) => {
          triggerDownload(artifact.dataUrl, artifact.fileName);
          setTileStatus(`Exported ${artifact.fileName} and saved it to ${artifact.absolutePath}.`);
        })
        .catch((error: unknown) => {
          setTileStatus(error instanceof Error ? error.message : "Could not export tile strip.");
        })
        .finally(() => {
          setBusyLabel("");
        });
    });
  }

  return (
    <div className="min-h-0">
      <div className="grid min-h-0 gap-4">
        <Panel
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <input
                className="min-h-11 min-w-[12rem] flex-1 border border-[#c3d0cb] bg-white/90 px-3 py-2 text-[#142127] outline-none transition focus:border-[#d88753]"
                onChange={(event) => {
                  setNewTileName(event.currentTarget.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && normalizedNewTileName) {
                    event.preventDefault();
                    handleCreateTile();
                  }
                }}
                placeholder="New tile name"
                value={newTileName}
              />
              <button
                className={actionButtonClass}
                disabled={!normalizedNewTileName}
                onClick={handleCreateTile}
                type="button"
              >
                Create
              </button>
            </div>
          }
          title="Tile Library"
        >
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="min-h-11 min-w-[16rem] flex-1 border border-[#c3d0cb] bg-white/90 px-3 py-2 text-[#142127] outline-none transition focus:border-[#d88753]"
              onChange={(event) => {
                setTileQuery(event.currentTarget.value);
              }}
              placeholder="Filter tiles"
              value={tileQuery}
            />
            {newTileName && newTileName !== normalizedNewTileName ? (
              <div className="text-xs text-[#4a6069]">
                New tile will be created as <span className="font-mono">{normalizedNewTileName}</span>
              </div>
            ) : null}
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredTiles.map((tileRecord) => (
              <button
                className={`flex items-center justify-between gap-3 border px-3 py-2 text-left transition ${
                  tileRecord.slug === activeTileSlug
                    ? "border-[#d88753] bg-white shadow-[inset_0_0_0_1px_rgba(216,135,83,0.25)]"
                    : "border-[#c3d0cb]/80 bg-white/90 hover:border-[#d88753]/55 hover:bg-white"
                }`}
                key={tileRecord.slug}
                onClick={() => {
                  setActiveTileSlug(tileRecord.slug);
                }}
                type="button"
              >
                <span className="truncate text-sm font-medium text-[#142127]">{tileRecord.name}</span>
                {tileRecord.thumbnail ? (
                  <img
                    alt={`${tileRecord.name} thumbnail`}
                    className="h-4 w-20 shrink-0 object-contain [image-rendering:pixelated]"
                    height={16}
                    src={tileRecord.thumbnail}
                    width={80}
                  />
                ) : null}
              </button>
            ))}
            {!filteredTiles.length ? (
              <div className="border border-dashed border-[#c3d0cb] px-4 py-4 text-center text-sm text-[#4a6069]">
                No tiles match that filter.
              </div>
            ) : null}
          </div>
        </Panel>

        <div className="grid min-h-0 gap-4 xl:grid-cols-2">
          <Panel
            actions={
              <>
                <button
                  className={actionButtonClass}
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                  type="button"
                >
                  Browse Image
                </button>
                <input
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const nextFile = event.currentTarget.files?.[0];

                    if (nextFile) {
                      void loadSelectedFile(nextFile);
                    }

                    event.currentTarget.value = "";
                  }}
                  ref={fileInputRef}
                  type="file"
                />
              </>
            }
            title="Source Image"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#4a6069]">
                Selector Size
              </span>
              {SELECTOR_SIZES.map((size) => {
                const disabled = selectedSlotKey === "main" && size !== TILE_SIZE;

                return (
                  <button
                    className={`min-h-10 border px-3 py-2 text-sm font-semibold transition ${
                      activeSelectorSize === size
                        ? "border-[#d88753] bg-white text-[#142127] shadow-[inset_0_0_0_1px_rgba(216,135,83,0.25)]"
                        : "border-[#c3d0cb] bg-white/85 text-[#4a6069] hover:bg-white hover:text-[#142127]"
                    }`}
                    disabled={disabled}
                    key={size}
                    onClick={() => {
                      setSelectorSize(size);
                    }}
                    type="button"
                  >
                    {size}x{size}
                  </button>
                );
              })}
            </div>

            <div className="relative flex min-h-[24rem] items-center justify-center overflow-auto border border-[#c3d0cb]/80 bg-[linear-gradient(180deg,rgba(244,239,226,0.82),rgba(215,236,233,0.36))]">
              <canvas
                className={`${sourceImage ? "block" : "hidden"} max-w-full bg-[#0d161b] [image-rendering:pixelated]`}
                onClick={(event) => {
                  updateSelectionFromPointer(event);
                  captureSelection();
                }}
                onMouseMove={updateSelectionFromPointer}
                ref={sourceCanvasRef}
              />
              {!sourceImage ? (
                <div className="absolute inset-0 grid place-items-center gap-1 p-6 text-center text-sm text-[#4a6069]">
                  <strong className="font-serif text-[1.35rem] text-[#142127]">
                    Source image goes here
                  </strong>
                  <span>Use Browse Image or provide `?image=maps/example.png` in the URL.</span>
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel
            title="Slots and Preview"
          >
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className={actionButtonClass}
                  disabled={!hasUnsavedSlotChanges}
                  onClick={handleSaveTile}
                  type="button"
                >
                  Save Tile
                </button>
                <button
                  className={actionButtonClass}
                  onClick={handleExport}
                  type="button"
                >
                  Export Strip
                </button>
                <button
                  className={actionButtonClass}
                  onClick={clearDraftSlots}
                  type="button"
                >
                  Clear
                </button>
              </div>

              <canvas
                className="block h-auto w-full bg-[#0d161b] [image-rendering:pixelated]"
                height={PREVIEW_SIZE}
                ref={previewCanvasRef}
                width={PREVIEW_SIZE}
              />

              <div className="grid grid-cols-5 gap-2">
                {(draftSlots as typeof draftSlots).map((slotRecord, index) => {
                  const slotKey = index === 0 ? "main" : String(index - 1);
                  const selected = selectedSlotKey === slotKey;

                  return (
                    <div
                      className={`flex min-w-0 flex-col gap-2 border bg-[#13262f]/96 p-2 text-left transition ${
                        selected
                          ? "border-[#d88753] shadow-[inset_0_0_0_1px_rgba(216,135,83,0.25)]"
                          : slotRecord
                            ? "border-[#5a7b4d]/45 hover:border-[#4b86ff]"
                            : "border-[#c3d0cb]/85 hover:border-[#4b86ff]"
                      }`}
                      key={slotKey}
                    >
                      <button
                        className="grid gap-2 text-left"
                        onClick={() => {
                          setSelectedSlotKey(slotKey as SlotKey);
                        }}
                        type="button"
                      >
                        {slotRecord?.pixels ? (
                          <img
                            alt={describeSlot(slotKey as SlotKey)}
                            className="aspect-square w-full bg-black object-contain"
                            src={slotRecord.pixels}
                          />
                        ) : (
                          <div
                            className={`grid aspect-square w-full place-items-center bg-[linear-gradient(45deg,rgba(255,255,255,0.05)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.05)_75%),linear-gradient(45deg,rgba(255,255,255,0.05)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.05)_75%)] bg-[length:24px_24px] bg-[position:0_0,12px_12px] text-center text-[0.95rem] font-extrabold ${
                              selected ? "text-[#d88753]" : "text-white/76"
                            }`}
                          >
                            {describeSlot(slotKey as SlotKey)}
                          </div>
                        )}
                        <div className={`grid gap-0.5 ${selected ? "text-[#d88753]" : "text-white/86"}`}>
                          <strong className="truncate text-xs">{describeSlot(slotKey as SlotKey)}</strong>
                          <span className={`truncate text-[10px] ${selected ? "text-[#d88753]" : "text-white/58"}`}>
                            {slotRecord
                              ? `${slotRecord.size}px @ ${slotRecord.source_x}, ${slotRecord.source_y}`
                              : "Empty"}
                          </span>
                        </div>
                      </button>
                      <div className="flex items-center gap-1">
                        <button
                          className="grid h-6 w-6 place-items-center border border-white/15 bg-white/8 text-white/80 transition hover:border-[#4b86ff] hover:text-[#4b86ff]"
                          onClick={() => {
                            if (activeTile) {
                              openPaintEditor(activeTile, slotKey as SlotKey);
                            }
                          }}
                          title={`Edit ${describeSlot(slotKey as SlotKey)}`}
                          type="button"
                        >
                          <FontAwesomeIcon className="h-3.5 w-3.5" icon={faPenToSquare} />
                        </button>
                        <button
                          className="grid h-6 w-6 place-items-center border border-white/15 bg-white/8 text-white/80 transition hover:border-[#d88753] hover:text-[#d88753] disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={!slotRecord}
                          onClick={() => {
                            setSlotPendingClear(slotKey as SlotKey);
                          }}
                          title={`Clear ${describeSlot(slotKey as SlotKey)}`}
                          type="button"
                        >
                          <FontAwesomeIcon className="h-3.5 w-3.5" icon={faTrashCan} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {slotPendingClear && activeTile ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#0d161b]/55 px-4">
          <div className="w-full max-w-md border border-[#c3d0cb]/75 bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,253,248,0.94))] p-5 shadow-[0_18px_40px_rgba(20,33,39,0.24)]">
            <div className="grid gap-2">
              <h3 className="font-serif text-[1.45rem] text-[#142127]">Clear Slot?</h3>
              <p className="text-sm leading-6 text-[#4a6069]">
                Remove {describeSlot(slotPendingClear)} from <span className="font-semibold text-[#142127]">{activeTile.slug}</span>?
                This only clears the working draft until you save the tile.
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                className="min-h-10 border border-[#c3d0cb] bg-white/92 px-4 py-2 text-sm font-semibold text-[#142127] transition hover:bg-white"
                onClick={() => {
                  setSlotPendingClear(null);
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="min-h-10 border border-[#d88753] bg-[#d88753] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#c97842]"
                onClick={confirmClearSlot}
                type="button"
              >
                Clear Slot
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
