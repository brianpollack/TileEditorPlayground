"use client";

import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { faEraser } from "@awesome.me/kit-a62459359b/icons/classic/solid";

import { createMapAction, saveMapAction } from "../actions/mapActions";
import { useStudio } from "../app/StudioContext";
import {
  MAP_DEFAULT_GRID_SIZE,
  MAP_MAX_SCALE_PERCENT,
  MAP_MIN_SCALE_PERCENT,
  MAP_SCALE_STEP_PERCENT,
  TILE_SIZE
} from "../lib/constants";
import {
  clampMapScalePercent,
  createEmptyMapCells,
  drawMapCellBackground,
  drawMapTileFallback,
  getMapCanvasHeight,
  getMapCanvasWidth,
  getMapDimensions,
  getAutoFitMapScalePercent,
  getMapCellFromPointerEvent,
  normalizeMapDimension
} from "../lib/map";
import { normalizeUnderscoreName } from "../lib/naming";
import { sanitizeSlotRecord } from "../lib/slots";
import { useImageCache } from "../lib/useImageCache";
import { actionButtonClass } from "./buttonStyles";
import { FontAwesomeIcon } from "./FontAwesomeIcon";
import { Panel } from "./Panel";
import type { TileCell } from "../types";

export function MapDesigner() {
  const {
    activeMap,
    activeMapSlug,
    getMapDraftCells,
    mapBrushTileSlug,
    maps,
    setActiveMapSlug,
    setMapDraftCells,
    setMapBrushTileSlug,
    tiles,
    upsertMap
  } = useStudio();
  const [hoverCell, setHoverCell] = useState<TileCell | null>(null);
  const [mapScalePercent, setMapScalePercent] = useState<number | null>(null);
  const [mapStatus, setMapStatus] = useState(
    "Choose a brush tile and paint on the map. Save writes JSON through a server function."
  );
  const [newMapName, setNewMapName] = useState("");
  const [newMapWidth, setNewMapWidth] = useState(String(MAP_DEFAULT_GRID_SIZE));
  const [newMapHeight, setNewMapHeight] = useState(String(MAP_DEFAULT_GRID_SIZE));
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [, startTransition] = useTransition();
  const drawingRef = useRef(false);
  const lastPaintedCellKeyRef = useRef("");
  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapFrameRef = useRef<HTMLDivElement | null>(null);
  const imageCache = useImageCache();
  const createNameInputRef = useRef<HTMLInputElement | null>(null);
  const normalizedNewMapName = normalizeUnderscoreName(newMapName);
  const normalizedNewMapWidth = normalizeMapDimension(newMapWidth);
  const normalizedNewMapHeight = normalizeMapDimension(newMapHeight);
  const draftCells = getMapDraftCells(
    activeMapSlug,
    activeMap?.cells,
    activeMap?.width,
    activeMap?.height
  );
  const { height: mapHeight, width: mapWidth } = getMapDimensions(draftCells);
  const mapCanvasWidth = getMapCanvasWidth(mapWidth);
  const mapCanvasHeight = getMapCanvasHeight(mapHeight);

  useEffect(() => {
    if (activeMap) {
      setMapStatus(`Editing ${activeMap.name} (${activeMap.width}x${activeMap.height}).`);
    }
  }, [activeMap]);

  useEffect(() => {
    if (!isCreateDialogOpen) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      createNameInputRef.current?.focus();
      createNameInputRef.current?.select();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCreateDialogOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCreateDialogOpen]);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      setMapScalePercent((currentScale) => {
        if (currentScale !== null) {
          return currentScale;
        }

        return getAutoFitMapScalePercent(mapFrameRef.current, mapCanvasWidth, mapCanvasHeight);
      });
    });

    if (mapFrameRef.current) {
      resizeObserver.observe(mapFrameRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [mapCanvasHeight, mapCanvasWidth]);

  useEffect(() => {
    if (!mapCanvasRef.current) {
      return;
    }

    const scalePercent =
      mapScalePercent === null
        ? getAutoFitMapScalePercent(mapFrameRef.current, mapCanvasWidth, mapCanvasHeight)
        : mapScalePercent;
    const nextScale = clampMapScalePercent(scalePercent);
    const nextCanvasWidth = Math.round((mapCanvasWidth * nextScale) / 100);
    const nextCanvasHeight = Math.round((mapCanvasHeight * nextScale) / 100);

    mapCanvasRef.current.style.width = `${nextCanvasWidth}px`;
    mapCanvasRef.current.style.height = `${nextCanvasHeight}px`;
  }, [mapCanvasHeight, mapCanvasWidth, mapScalePercent]);

  const renderMapCanvas = useEffectEvent(async () => {
    const mapCanvas = mapCanvasRef.current;

    if (!mapCanvas) {
      return;
    }

    const context = mapCanvas.getContext("2d");

    if (!context) {
      return;
    }

    const mainSlotUrls = tiles
      .map((tileRecord) => sanitizeSlotRecord(tileRecord.slots[0])?.pixels ?? "")
      .filter(Boolean);

    await Promise.all(mainSlotUrls.map((imageUrl) => imageCache.ensureImage(imageUrl)));

    context.clearRect(0, 0, mapCanvasWidth, mapCanvasHeight);

    for (let tileY = 0; tileY < mapHeight; tileY += 1) {
      for (let tileX = 0; tileX < mapWidth; tileX += 1) {
        const drawX = tileX * TILE_SIZE;
        const drawY = tileY * TILE_SIZE;
        const tileSlug = draftCells[tileY]?.[tileX] ?? "";
        const tileRecord = tileSlug
          ? tiles.find((candidate) => candidate.slug === tileSlug) ?? null
          : null;

        if (!tileRecord) {
          drawMapCellBackground(context, drawX, drawY);
        } else {
          const mainSlot = sanitizeSlotRecord(tileRecord.slots[0]);
          const tileImage = mainSlot?.pixels ? imageCache.getCachedImage(mainSlot.pixels) : null;

          if (tileImage) {
            context.drawImage(tileImage, drawX, drawY, TILE_SIZE, TILE_SIZE);
          } else {
            drawMapTileFallback(context, tileRecord, drawX, drawY);
          }
        }

        context.strokeStyle = "rgba(20, 33, 39, 0.12)";
        context.lineWidth = 1;
        context.strokeRect(drawX + 0.5, drawY + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

        if (hoverCell && hoverCell.tileX === tileX && hoverCell.tileY === tileY) {
          context.strokeStyle = "#f1c97b";
          context.lineWidth = 5;
          context.strokeRect(drawX + 2.5, drawY + 2.5, TILE_SIZE - 5, TILE_SIZE - 5);
        }
      }
    }
  });

  useEffect(() => {
    void renderMapCanvas();
  }, [draftCells, hoverCell, mapCanvasHeight, mapCanvasWidth, mapHeight, mapWidth, renderMapCanvas, tiles]);

  function paintCell(nextCell: TileCell) {
    if (!activeMapSlug) {
      return;
    }

    const nextCells = draftCells.map((row) => row.slice());
    const nextRow = nextCells[nextCell.tileY];

    if (!nextRow) {
      return;
    }

    nextRow[nextCell.tileX] = mapBrushTileSlug;
    setMapDraftCells(activeMapSlug, nextCells, mapWidth, mapHeight);
  }

  function beginPaint() {
    drawingRef.current = true;
    lastPaintedCellKeyRef.current = "";
  }

  function finishPaint() {
    drawingRef.current = false;
    lastPaintedCellKeyRef.current = "";
  }

  function handlePointerUpdate(event: React.MouseEvent<HTMLCanvasElement>) {
    const nextCell = getMapCellFromPointerEvent(
      event.currentTarget,
      event.nativeEvent,
      mapWidth,
      mapHeight
    );

    setHoverCell(nextCell);

    if (!drawingRef.current || !nextCell) {
      return;
    }

    const cellKey = `${nextCell.tileX},${nextCell.tileY}`;

    if (lastPaintedCellKeyRef.current === cellKey) {
      return;
    }

    lastPaintedCellKeyRef.current = cellKey;
    paintCell(nextCell);
  }

  function handleCreateMap() {
    const nextName = normalizedNewMapName;

    if (!nextName) {
      setMapStatus("Name the map before creating it.");
      return;
    }

    setBusyLabel("Creating map");

    startTransition(() => {
      void createMapAction(nextName, normalizedNewMapWidth, normalizedNewMapHeight)
        .then((createdMap) => {
          upsertMap(createdMap);
          setMapDraftCells(createdMap.slug, createdMap.cells, createdMap.width, createdMap.height);
          setIsCreateDialogOpen(false);
          setNewMapName("");
          setNewMapWidth(String(MAP_DEFAULT_GRID_SIZE));
          setNewMapHeight(String(MAP_DEFAULT_GRID_SIZE));
          setActiveMapSlug(createdMap.slug);
          setMapStatus(`Created ${createdMap.name} (${createdMap.width}x${createdMap.height}).`);
        })
        .catch((error: unknown) => {
          setMapStatus(error instanceof Error ? error.message : "Could not create map.");
        })
        .finally(() => {
          setBusyLabel("");
        });
    });
  }

  function handleSaveMap() {
    if (!activeMap) {
      setMapStatus("Choose a map before saving.");
      return;
    }

    setBusyLabel("Saving map");

    startTransition(() => {
      void saveMapAction({
        cells: draftCells,
        height: mapHeight,
        name: activeMap.name,
        slug: activeMap.slug,
        width: mapWidth
      })
        .then((savedMap) => {
          upsertMap(savedMap);
          setMapDraftCells(savedMap.slug, savedMap.cells, savedMap.width, savedMap.height);
          setMapStatus(
            `Saved ${savedMap.name} (${savedMap.width}x${savedMap.height}) at ${savedMap.updatedAt}.`
          );
        })
        .catch((error: unknown) => {
          setMapStatus(error instanceof Error ? error.message : "Could not save map.");
        })
        .finally(() => {
          setBusyLabel("");
        });
    });
  }

  const currentScale =
    mapScalePercent === null
      ? getAutoFitMapScalePercent(mapFrameRef.current, mapCanvasWidth, mapCanvasHeight)
      : mapScalePercent;
  const activeBrushTile = tiles.find((tileRecord) => tileRecord.slug === mapBrushTileSlug) ?? null;

  return (
    <div className="min-h-0">
        <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(18rem,0.7fr)_minmax(0,1.65fr)]">
        <div className="grid min-h-0 gap-4">
          <Panel
            actions={
              <button
                className={actionButtonClass}
                onClick={() => {
                  setIsCreateDialogOpen(true);
                }}
                type="button"
              >
                Create
              </button>
            }
            title="Map Library"
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {maps.map((mapRecord) => (
                <button
                  className={`flex flex-col items-start gap-1 border px-4 py-3 text-left transition ${
                    mapRecord.slug === activeMapSlug
                      ? "border-[#d88753] bg-white shadow-[inset_0_0_0_1px_rgba(216,135,83,0.25)]"
                      : "border-[#c3d0cb]/80 bg-white/90 hover:border-[#d88753]/55 hover:bg-white"
                  }`}
                  key={mapRecord.slug}
                  onClick={() => {
                    setActiveMapSlug(mapRecord.slug);
                  }}
                  type="button"
                >
                  <strong className="text-[0.98rem] text-[#142127]">{mapRecord.name}</strong>
                  <span className="font-mono text-xs text-[#4a6069]">
                    {mapRecord.slug} • {mapRecord.width}x{mapRecord.height}
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel
            description="Pick a brush tile or switch to the eraser to clear cells."
            title="Brush Palette"
          >
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              <button
                className={`grid justify-items-center gap-2 border bg-white/90 p-3 text-center transition ${
                  mapBrushTileSlug === ""
                    ? "border-[#d88753] bg-white shadow-[inset_0_0_0_1px_rgba(216,135,83,0.25)]"
                    : "border-[#c3d0cb]/85 hover:border-[#d88753]/55 hover:bg-white"
                }`}
                onClick={() => {
                  setMapBrushTileSlug("");
                }}
                type="button"
              >
                <div className="grid aspect-square w-full place-items-center overflow-hidden bg-[linear-gradient(135deg,rgba(19,38,47,0.92),rgba(36,66,79,0.88))] text-[#fffdf8]/84">
                  <FontAwesomeIcon className="h-10 w-10" icon={faEraser} title="Erase" />
                </div>
                <strong>Eraser</strong>
              </button>

              {tiles.map((tileRecord) => {
                const mainSlot = sanitizeSlotRecord(tileRecord.slots[0]);

                return (
                  <button
                    className={`grid justify-items-center gap-2 border bg-white/90 p-3 text-center transition ${
                      tileRecord.slug === mapBrushTileSlug
                        ? "border-[#d88753] bg-white shadow-[inset_0_0_0_1px_rgba(216,135,83,0.25)]"
                        : "border-[#c3d0cb]/85 hover:border-[#d88753]/55 hover:bg-white"
                    }`}
                    key={tileRecord.slug}
                    onClick={() => {
                      setMapBrushTileSlug(tileRecord.slug);
                    }}
                    type="button"
                  >
                    <div className="grid aspect-square w-full place-items-center overflow-hidden bg-[linear-gradient(45deg,rgba(231,220,197,0.6)_25%,rgba(255,255,255,0.9)_25%,rgba(255,255,255,0.9)_75%,rgba(231,220,197,0.6)_75%),linear-gradient(45deg,rgba(231,220,197,0.6)_25%,rgba(255,255,255,0.9)_25%,rgba(255,255,255,0.9)_75%,rgba(231,220,197,0.6)_75%)] bg-[length:24px_24px] bg-[position:0_0,12px_12px]">
                      {mainSlot?.pixels ? (
                        <img alt={tileRecord.name} className="h-full w-full object-cover" src={mainSlot.pixels} />
                      ) : (
                        <span>No Main</span>
                      )}
                    </div>
                    <strong>{tileRecord.name}</strong>
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>

        <Panel
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <button
                className={actionButtonClass}
                onClick={handleSaveMap}
                type="button"
              >
                Save Map
              </button>
              <button
                className={actionButtonClass}
                onClick={() => {
                  setMapDraftCells(activeMapSlug, createEmptyMapCells(mapWidth, mapHeight), mapWidth, mapHeight);
                  setMapStatus(`Cleared the current draft map (${mapWidth}x${mapHeight}).`);
                }}
                type="button"
              >
                Clear Map
              </button>
            </div>
          }
          description={`Paint directly on the ${mapWidth}x${mapHeight} map canvas. The scale controls only change the viewing size.`}
          footer={
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex min-h-10 items-center bg-[#13262f]/8 px-3 py-2 text-sm leading-6 text-[#4a6069]">
                {busyLabel
                  ? `${busyLabel}...`
                  : activeBrushTile
                    ? `Brush: ${activeBrushTile.name}`
                    : "Brush: eraser"}
              </div>
            </div>
          }
          title="Map Canvas"
        >
          <div
            className="h-[clamp(28rem,70vh,58rem)] overflow-auto border border-[#c3d0cb]/80 bg-[linear-gradient(180deg,rgba(244,239,226,0.82),rgba(215,236,233,0.36))] p-4"
            ref={mapFrameRef}
          >
            <canvas
              className="block max-h-none max-w-none bg-white/82 [image-rendering:pixelated]"
              height={mapCanvasHeight}
              onClick={(event) => {
                const nextCell = getMapCellFromPointerEvent(
                  event.currentTarget,
                  event.nativeEvent,
                  mapWidth,
                  mapHeight
                );

                if (nextCell) {
                  paintCell(nextCell);
                }
              }}
              onMouseDown={(event) => {
                beginPaint();
                handlePointerUpdate(event);
              }}
              onMouseLeave={() => {
                finishPaint();
                setHoverCell(null);
              }}
              onMouseMove={handlePointerUpdate}
              onMouseUp={finishPaint}
              ref={mapCanvasRef}
              width={mapCanvasWidth}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex min-h-10 items-center bg-[#13262f]/8 px-3 py-2 text-sm leading-6 text-[#4a6069]">
              {hoverCell ? `Hover ${hoverCell.tileX}, ${hoverCell.tileY}` : "Hover a cell to inspect it."}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                className={actionButtonClass}
                disabled={currentScale <= MAP_MIN_SCALE_PERCENT}
                onClick={() => {
                  setMapScalePercent((value) =>
                    clampMapScalePercent(
                      (value ??
                        getAutoFitMapScalePercent(
                          mapFrameRef.current,
                          mapCanvasWidth,
                          mapCanvasHeight
                        )) -
                        MAP_SCALE_STEP_PERCENT
                    )
                  );
                }}
                type="button"
              >
                -
              </button>
              <span className="text-sm font-medium text-[#142127]">Scale {currentScale}%</span>
              <button
                className={actionButtonClass}
                disabled={currentScale >= MAP_MAX_SCALE_PERCENT}
                onClick={() => {
                  setMapScalePercent((value) =>
                    clampMapScalePercent(
                      (value ??
                        getAutoFitMapScalePercent(
                          mapFrameRef.current,
                          mapCanvasWidth,
                          mapCanvasHeight
                        )) +
                        MAP_SCALE_STEP_PERCENT
                    )
                  );
                }}
                type="button"
              >
                +
              </button>
            </div>
          </div>
        </Panel>
      </div>

      {isCreateDialogOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 overflow-y-auto bg-[rgba(20,33,39,0.55)] px-4 py-8"
          role="dialog"
        >
          <div
            className="fixed inset-0"
            onClick={() => {
              setIsCreateDialogOpen(false);
            }}
          />
          <div className="flex min-h-full items-center justify-center">
            <div className="relative w-full max-w-2xl border border-[#c3d0cb] bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,253,248,0.94))] shadow-[0_24px_60px_rgba(20,33,39,0.28)]">
              <div className="border-b border-[#c3d0cb]/65 px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-serif text-[1.4rem] leading-tight text-[#142127]">
                      Create Map
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-[#4a6069]">
                      Name the map and choose its grid size before creating the server-backed JSON
                      file.
                    </p>
                  </div>
                  <button
                    className="min-h-11 min-w-11 border border-[#c3d0cb] bg-white px-3 text-sm font-semibold text-[#4a6069] transition hover:border-[#d88753] hover:text-[#142127]"
                    onClick={() => {
                      setIsCreateDialogOpen(false);
                    }}
                    type="button"
                  >
                    X
                  </button>
                </div>
              </div>

              <div className="grid gap-4 px-6 py-6">
                <div className="grid gap-2">
                  <label
                    className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#4a6069]"
                    htmlFor="new-map-name"
                  >
                    New map name
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      className="min-h-11 min-w-[14rem] flex-1 border border-[#c3d0cb] bg-white/90 px-3 py-2 text-[#142127] outline-none transition focus:border-[#d88753]"
                      id="new-map-name"
                      onChange={(event) => {
                        setNewMapName(event.currentTarget.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && normalizedNewMapName) {
                          event.preventDefault();
                          handleCreateMap();
                        }
                      }}
                      placeholder="New map name"
                      ref={createNameInputRef}
                      value={newMapName}
                    />
                    <input
                      className="min-h-11 w-24 border border-[#c3d0cb] bg-white/90 px-3 py-2 text-center text-[#142127] outline-none transition focus:border-[#d88753]"
                      inputMode="numeric"
                      onChange={(event) => {
                        setNewMapWidth(event.currentTarget.value);
                      }}
                      placeholder="W"
                      value={newMapWidth}
                    />
                    <input
                      className="min-h-11 w-24 border border-[#c3d0cb] bg-white/90 px-3 py-2 text-center text-[#142127] outline-none transition focus:border-[#d88753]"
                      inputMode="numeric"
                      onChange={(event) => {
                        setNewMapHeight(event.currentTarget.value);
                      }}
                      placeholder="H"
                      value={newMapHeight}
                    />
                  </div>
                </div>

                {newMapName && newMapName !== normalizedNewMapName ? (
                  <div className="text-xs text-[#4a6069]">
                    New map will be created as{" "}
                    <span className="font-mono">{normalizedNewMapName}</span>
                  </div>
                ) : null}

                <div className="text-xs text-[#4a6069]">
                  New map size: {normalizedNewMapWidth}x{normalizedNewMapHeight}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#c3d0cb]/65 bg-[rgba(244,239,226,0.58)] px-6 py-4">
                <button
                  className="min-h-11 border border-[#c3d0cb] bg-white px-4 py-2 font-semibold text-[#4a6069] transition hover:border-[#d88753] hover:text-[#142127]"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={actionButtonClass}
                  disabled={!normalizedNewMapName}
                  onClick={handleCreateMap}
                  type="button"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
