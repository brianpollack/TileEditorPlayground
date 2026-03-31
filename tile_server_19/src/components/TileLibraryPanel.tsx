"use client";

import { useDeferredValue, useEffect, useRef, useState, useTransition } from "react";

import { createTileFolderAction } from "../actions/tileActions";
import { useStudio } from "../app/StudioContext";
import { normalizeUnderscoreName } from "../lib/naming";
import { normalizeSlotRecords } from "../lib/slots";
import {
  formatTileLibraryPath,
  getTileLibraryLayer,
  getTileLibraryLayerLabel,
  getTileLibrarySegmentLabel,
  getTileLibrarySpriteKey,
  normalizeTileLibraryPath,
  splitTileLibraryPath,
  TILE_LIBRARY_LAYERS
} from "../lib/tileLibrary";
import { actionButtonClass } from "./buttonStyles";
import { Panel } from "./Panel";
import {
  selectableCardClass,
  textInputClass
} from "./uiStyles";
import type { SpriteRecord, TileRecord } from "../types";

const CREATE_TILE_PATH = "/__tiles/create";
const IMPORT_SPRITE_PATH = "/__tiles/import-sprite";

interface TileLibraryFolderEntry {
  label: string;
  path: string;
}

export function TileLibraryPanel() {
  const {
    activeTile,
    activeSprite,
    activeSpriteKey,
    activeTileSlug,
    addTileLibraryFolder,
    getTileDraftSlots,
    setActiveSpriteKey,
    setActiveTileSlug,
    setTileDraftSlots,
    sprites,
    tileLibraryFolders,
    tiles,
    upsertSprite,
    upsertTile
  } = useStudio();
  const [newTileName, setNewTileName] = useState("");
  const [tileQuery, setTileQuery] = useState("");
  const [spriteImportStatus, setSpriteImportStatus] = useState("");
  const [isSpriteDragActive, setSpriteDragActive] = useState(false);
  const activeLibraryPath = normalizeTileLibraryPath(activeTile?.path ?? activeSprite?.path ?? "");
  const [libraryPath, setLibraryPath] = useState(() => activeLibraryPath);
  const [isPending, startTransition] = useTransition();
  const deferredTileQuery = useDeferredValue(tileQuery.trim().toLowerCase());
  const spriteFileInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedNewTileName = normalizeUnderscoreName(newTileName);
  const currentLibraryPath = normalizeTileLibraryPath(libraryPath);
  const hasSelectedLibraryFolder = Boolean(currentLibraryPath);
  const currentLibraryLayer = getTileLibraryLayer(currentLibraryPath);
  const canImportSprites = hasSelectedLibraryFolder && (currentLibraryLayer?.index ?? 0) > 0;
  const currentPathSegments = splitTileLibraryPath(currentLibraryPath);
  const breadcrumbItems = currentPathSegments.map((_, index) => {
    const crumbPath = currentPathSegments.slice(0, index + 1).join("/");

    return {
      label:
        index === 0
          ? `Layer ${getTileLibrarySegmentLabel(crumbPath)}`
          : getTileLibrarySegmentLabel(crumbPath),
      targetPath: index === 0 ? "" : currentPathSegments.slice(0, index).join("/")
    };
  });
  const allFolderPaths = Array.from(
    new Set([
      ...tileLibraryFolders,
      ...tiles.flatMap((tileRecord) => {
        const tilePathSegments = splitTileLibraryPath(tileRecord.path);
        return tilePathSegments.map((_, index) => tilePathSegments.slice(0, index + 1).join("/"));
      })
    ])
  );
  const visibleFolderPaths = hasSelectedLibraryFolder
    ? allFolderPaths.filter((folderPath) => {
        const folderSegments = splitTileLibraryPath(folderPath);

        if (folderSegments.length !== currentPathSegments.length + 1) {
          return false;
        }

        return currentPathSegments.every((segment, index) => folderSegments[index] === segment);
      })
    : TILE_LIBRARY_LAYERS.map((layer) => layer.folder);
  const visibleFolderEntries: TileLibraryFolderEntry[] = hasSelectedLibraryFolder
    ? visibleFolderPaths
        .slice()
        .sort((left, right) => left.localeCompare(right))
        .map((folderPath) => ({
          label: getTileLibrarySegmentLabel(folderPath),
          path: folderPath
        }))
    : TILE_LIBRARY_LAYERS.map((layer) => ({
        label: getTileLibraryLayerLabel(layer),
        path: layer.folder
      }));
  const visibleTiles = hasSelectedLibraryFolder
    ? tiles
        .filter((tileRecord) => normalizeTileLibraryPath(tileRecord.path) === currentLibraryPath)
        .slice()
        .sort(
          (left: TileRecord, right: TileRecord) =>
            left.name.localeCompare(right.name) || left.slug.localeCompare(right.slug)
        )
    : [];
  const visibleSprites = hasSelectedLibraryFolder
    ? sprites
        .filter((spriteRecord) => normalizeTileLibraryPath(spriteRecord.path) === currentLibraryPath)
        .slice()
        .sort(
          (left: SpriteRecord, right: SpriteRecord) =>
            left.name.localeCompare(right.name) || left.filename.localeCompare(right.filename)
        )
    : [];
  const filteredFolderEntries = visibleFolderEntries.filter((folderEntry) => {
    if (!deferredTileQuery) {
      return true;
    }

    return (
      folderEntry.label.toLowerCase().includes(deferredTileQuery) ||
      folderEntry.path.toLowerCase().includes(deferredTileQuery)
    );
  });
  const filteredTiles = visibleTiles.filter((tileRecord) => {
    if (!deferredTileQuery) {
      return true;
    }

    return (
      tileRecord.name.toLowerCase().includes(deferredTileQuery) ||
      tileRecord.slug.toLowerCase().includes(deferredTileQuery)
    );
  });
  const filteredSprites = visibleSprites.filter((spriteRecord) => {
    if (!deferredTileQuery) {
      return true;
    }

    return (
      spriteRecord.name.toLowerCase().includes(deferredTileQuery) ||
      spriteRecord.filename.toLowerCase().includes(deferredTileQuery)
    );
  });

  useEffect(() => {
    if (activeLibraryPath && activeLibraryPath !== currentLibraryPath) {
      setLibraryPath(activeLibraryPath);
    }
  }, [activeLibraryPath, currentLibraryPath]);

  useEffect(() => {
    setSpriteImportStatus("");
    setSpriteDragActive(false);
    resetSpriteInput();
  }, [currentLibraryPath]);

  function navigateToLibraryPath(nextPath: string) {
    const normalizedPath = normalizeTileLibraryPath(nextPath);

    setLibraryPath(normalizedPath);

    if (activeLibraryPath !== normalizedPath) {
      setActiveTileSlug("");
      setActiveSpriteKey("");
    }
  }

  function resetSpriteInput() {
    if (spriteFileInputRef.current) {
      spriteFileInputRef.current.value = "";
    }
  }

  function handleSpriteImport(file: File) {
    if (!currentLibraryPath || !canImportSprites) {
      return;
    }

    setSpriteImportStatus(`Importing ${file.name}...`);

    startTransition(() => {
      void (async () => {
        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("path", currentLibraryPath);

          const response = await fetch(IMPORT_SPRITE_PATH, {
            body: formData,
            method: "POST"
          });
          const responseBody = (await response.json()) as Partial<SpriteRecord> & { error?: string };

          if (!response.ok || responseBody.error) {
            setSpriteImportStatus(responseBody.error ?? "Could not import sprite.");
            resetSpriteInput();
            return;
          }

          upsertSprite(responseBody as SpriteRecord);
          setSpriteImportStatus(`Imported ${responseBody.filename ?? file.name}.`);
          resetSpriteInput();
        } catch {
          setSpriteImportStatus("Could not import sprite.");
          resetSpriteInput();
        }
      })();
    });
  }

  function handleCreateTile() {
    if (!normalizedNewTileName || !currentLibraryPath) {
      return;
    }

    startTransition(() => {
      void (async () => {
        // Use a plain JSON mutation here instead of an RSC server action. The RSC action
        // round-trip replaces the payload tree and resets local Tile Editor view state.
        const response = await fetch(CREATE_TILE_PATH, {
          body: JSON.stringify({
            name: normalizedNewTileName,
            path: currentLibraryPath
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });

        if (!response.ok) {
          return;
        }

        const createdTile = (await response.json()) as TileRecord;
        upsertTile(createdTile);
        setTileDraftSlots(
          createdTile.slug,
          getTileDraftSlots(createdTile.slug, normalizeSlotRecords(createdTile.slots))
        );
        setLibraryPath(normalizeTileLibraryPath(createdTile.path));
        setActiveTileSlug(createdTile.slug);
        setNewTileName("");
      })();
    });
  }

  function handleCreateFolder() {
    if (!normalizedNewTileName || !currentLibraryPath) {
      return;
    }

    startTransition(() => {
      void createTileFolderAction(currentLibraryPath, normalizedNewTileName).then((createdFolderPath) => {
        addTileLibraryFolder(createdFolderPath);
        setNewTileName("");
      });
    });
  }

  return (
    <Panel
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <input
            className={textInputClass}
            onChange={(event) => {
              setNewTileName(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && normalizedNewTileName) {
                event.preventDefault();
                handleCreateTile();
              }
            }}
            placeholder={
              hasSelectedLibraryFolder
                ? `New tile name for ${formatTileLibraryPath(currentLibraryPath)}`
                : "Select a layer to create tiles"
            }
            value={newTileName}
          />
          <button
            className={actionButtonClass}
            disabled={!normalizedNewTileName || !hasSelectedLibraryFolder}
            onClick={handleCreateTile}
            type="button"
          >
            Create
          </button>
          <button
            className={actionButtonClass}
            disabled={!normalizedNewTileName || !hasSelectedLibraryFolder}
            onClick={handleCreateFolder}
            type="button"
          >
            New Folder
          </button>
        </div>
      }
      subheader={
        <div className="flex flex-wrap items-center gap-2 text-xs leading-5">
          {!breadcrumbItems.length ? (
            <span className="text-[#7c8d88]">Select Layer</span>
          ) : (
            <>
              {breadcrumbItems.map((breadcrumb, index) => (
                <div className="flex items-center gap-2" key={`${breadcrumb.label}:${breadcrumb.targetPath}`}>
                  {index > 0 ? <span className="text-[#7c8d88]">/</span> : null}
                  <button
                    className="text-[#4a6069] transition hover:text-[#142127]"
                    onClick={() => {
                      navigateToLibraryPath(breadcrumb.targetPath);
                    }}
                    type="button"
                  >
                    {breadcrumb.label}
                  </button>
                </div>
              ))}
              <span className="text-[#7c8d88]">/</span>
              <span className="text-[#7c8d88]">Select Tile or Folder</span>
            </>
          )}
        </div>
      }
      title="Tile Library"
    >
      <div className="flex flex-wrap items-center gap-3">
        <input
          className={textInputClass}
          onChange={(event) => {
            setTileQuery(event.currentTarget.value);
          }}
          placeholder={hasSelectedLibraryFolder ? "Filter folders and tiles" : "Filter layers"}
          value={tileQuery}
        />
        {spriteImportStatus ? (
          <div className="text-xs text-[#4a6069]">{spriteImportStatus}</div>
        ) : null}
        {newTileName && newTileName !== normalizedNewTileName ? (
          <div className="text-xs text-[#4a6069]">
            New tile will be created as <span className="font-mono">{normalizedNewTileName}</span>
          </div>
        ) : null}
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
        {filteredFolderEntries.map((folderEntry) => (
          <button
            className={`${selectableCardClass(
              false,
              "border-[#c3d0cb]/80 bg-[linear-gradient(180deg,rgba(255,253,248,0.96),rgba(244,239,226,0.84))] hover:border-[#d88753]/55 hover:bg-white"
            )} flex min-h-[4.5rem] flex-col justify-between gap-2 px-3 py-3 text-left`}
            key={folderEntry.path}
            onClick={() => {
              navigateToLibraryPath(folderEntry.path);
            }}
            type="button"
          >
            <div className="grid gap-1">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#4a6069]">
                Folder
              </span>
              <span className="truncate text-sm font-semibold text-[#142127]">{folderEntry.label}</span>
            </div>
          </button>
        ))}
        {filteredTiles.map((tileRecord) => (
          <button
            className={`${selectableCardClass(
              tileRecord.slug === activeTileSlug,
              "border-[#c3d0cb]/80 bg-white/90 hover:border-[#d88753]/55 hover:bg-white"
            )} flex min-h-[4.5rem] flex-col justify-between gap-2 px-3 py-3 text-left`}
            key={tileRecord.slug}
            onClick={() => {
              setLibraryPath(normalizeTileLibraryPath(tileRecord.path));
              setActiveSpriteKey("");
              setActiveTileSlug(tileRecord.slug);
            }}
            type="button"
          >
            <div className="grid min-w-0 gap-2">
              <span className="truncate text-sm font-medium text-[#142127]">{tileRecord.name}</span>
              {tileRecord.thumbnail ? (
                <img
                  alt={`${tileRecord.name} thumbnail`}
                  className="h-4 w-20 object-contain [image-rendering:pixelated]"
                  height={16}
                  src={tileRecord.thumbnail}
                  width={80}
                />
              ) : null}
            </div>
          </button>
        ))}
        {filteredSprites.map((spriteRecord) => (
          <button
            className={`${selectableCardClass(
              getTileLibrarySpriteKey(spriteRecord.path, spriteRecord.filename) === activeSpriteKey,
              "border-[#c3d0cb]/80 bg-[linear-gradient(180deg,rgba(239,246,239,0.92),rgba(228,236,227,0.86))] hover:border-[#d88753]/55"
            )} flex min-h-[5.5rem] items-center gap-3 px-3 py-3 text-left shadow-[0_14px_30px_rgba(20,33,39,0.08)]`}
            key={`${spriteRecord.path}/${spriteRecord.filename}`}
            onClick={() => {
              setLibraryPath(normalizeTileLibraryPath(spriteRecord.path));
              setActiveTileSlug("");
              setActiveSpriteKey(getTileLibrarySpriteKey(spriteRecord.path, spriteRecord.filename));
            }}
            type="button"
          >
            <div className="flex h-20 w-20 shrink-0 items-center justify-center border border-[#c3d0cb] bg-white/90 p-2">
              {spriteRecord.thumbnail ? (
                <img
                  alt={`${spriteRecord.name} sprite thumbnail`}
                  className="max-h-full max-w-full object-contain"
                  src={spriteRecord.thumbnail}
                />
              ) : null}
            </div>
            <div className="grid min-w-0 gap-1">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#4a6069]">
                Sprite
              </span>
              <span className="truncate text-sm font-semibold text-[#142127]">{spriteRecord.name}</span>
              <span className="truncate text-xs font-mono text-[#4a6069]">{spriteRecord.filename}</span>
              <span className="text-xs text-[#4a6069]">
                {spriteRecord.image_w}x{spriteRecord.image_h} px
              </span>
            </div>
          </button>
        ))}
        {canImportSprites ? (
          <>
            <input
              accept="image/png,.png"
              className="hidden"
              onChange={(event) => {
                const nextFile = event.currentTarget.files?.[0];

                if (nextFile) {
                  handleSpriteImport(nextFile);
                }
              }}
              ref={spriteFileInputRef}
              type="file"
            />
            <button
              className={`border border-dashed border-[#c3d0cb] px-4 py-4 text-center text-sm text-[#4a6069] transition ${
                isSpriteDragActive ? "bg-[#f5efe3]" : "bg-transparent"
              }`}
              disabled={isPending}
              onClick={() => {
                spriteFileInputRef.current?.click();
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                setSpriteDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setSpriteDragActive(false);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setSpriteDragActive(true);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setSpriteDragActive(false);
                const nextFile = event.dataTransfer.files?.[0];

                if (nextFile) {
                  handleSpriteImport(nextFile);
                }
              }}
              type="button"
            >
              {isPending ? "Importing sprite..." : "Click or drop a PNG here to import a sprite."}
            </button>
          </>
        ) : null}
        {!filteredFolderEntries.length && !filteredTiles.length && !filteredSprites.length ? (
          <div className="border border-dashed border-[#c3d0cb] px-4 py-4 text-center text-sm text-[#4a6069]">
            {hasSelectedLibraryFolder
              ? "This folder does not contain any matching subfolders, tiles, or sprites yet."
              : "No layers match that filter."}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
