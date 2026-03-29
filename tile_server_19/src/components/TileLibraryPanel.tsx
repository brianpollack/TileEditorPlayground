"use client";

import { useDeferredValue, useEffect, useState, useTransition } from "react";

import { createTileFolderAction } from "../actions/tileActions";
import { useStudio } from "../app/StudioContext";
import { normalizeUnderscoreName } from "../lib/naming";
import { normalizeSlotRecords } from "../lib/slots";
import {
  formatTileLibraryPath,
  getTileLibraryLayerLabel,
  getTileLibrarySegmentLabel,
  normalizeTileLibraryPath,
  splitTileLibraryPath,
  TILE_LIBRARY_LAYERS
} from "../lib/tileLibrary";
import { actionButtonClass } from "./buttonStyles";
import { Panel } from "./Panel";
import type { TileRecord } from "../types";

const CREATE_TILE_PATH = "/__tiles/create";

interface TileLibraryFolderEntry {
  label: string;
  path: string;
}

export function TileLibraryPanel() {
  const {
    activeTile,
    activeTileSlug,
    addTileLibraryFolder,
    getTileDraftSlots,
    setActiveTileSlug,
    setTileDraftSlots,
    tileLibraryFolders,
    tiles,
    upsertTile
  } = useStudio();
  const [newTileName, setNewTileName] = useState("");
  const [tileQuery, setTileQuery] = useState("");
  const activeTilePath = normalizeTileLibraryPath(activeTile?.path ?? "");
  const [libraryPath, setLibraryPath] = useState(() => activeTilePath);
  const [, startTransition] = useTransition();
  const deferredTileQuery = useDeferredValue(tileQuery.trim().toLowerCase());

  const normalizedNewTileName = normalizeUnderscoreName(newTileName);
  const currentLibraryPath = normalizeTileLibraryPath(libraryPath);
  const hasSelectedLibraryFolder = Boolean(currentLibraryPath);
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

  useEffect(() => {
    if (activeTilePath && activeTilePath !== currentLibraryPath) {
      setLibraryPath(activeTilePath);
    }
  }, [activeTilePath, currentLibraryPath]);

  function navigateToLibraryPath(nextPath: string) {
    const normalizedPath = normalizeTileLibraryPath(nextPath);

    setLibraryPath(normalizedPath);

    if (activeTilePath !== normalizedPath) {
      setActiveTileSlug("");
    }
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
          className="min-h-11 min-w-[16rem] flex-1 border border-[#c3d0cb] bg-white/90 px-3 py-2 text-[#142127] outline-none transition focus:border-[#d88753]"
          onChange={(event) => {
            setTileQuery(event.currentTarget.value);
          }}
          placeholder={hasSelectedLibraryFolder ? "Filter folders and tiles" : "Filter layers"}
          value={tileQuery}
        />
        {newTileName && newTileName !== normalizedNewTileName ? (
          <div className="text-xs text-[#4a6069]">
            New tile will be created as <span className="font-mono">{normalizedNewTileName}</span>
          </div>
        ) : null}
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
        {filteredFolderEntries.map((folderEntry) => (
          <button
            className="flex min-h-[4.5rem] flex-col justify-between gap-2 border border-[#c3d0cb]/80 bg-[linear-gradient(180deg,rgba(255,253,248,0.96),rgba(244,239,226,0.84))] px-3 py-3 text-left transition hover:border-[#d88753]/55 hover:bg-white"
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
            className={`flex min-h-[4.5rem] flex-col justify-between gap-2 border px-3 py-3 text-left transition ${
              tileRecord.slug === activeTileSlug
                ? "border-[#d88753] bg-white shadow-[inset_0_0_0_1px_rgba(216,135,83,0.25)]"
                : "border-[#c3d0cb]/80 bg-white/90 hover:border-[#d88753]/55 hover:bg-white"
            }`}
            key={tileRecord.slug}
            onClick={() => {
              setLibraryPath(normalizeTileLibraryPath(tileRecord.path));
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
        {!filteredFolderEntries.length && !filteredTiles.length ? (
          <div className="border border-dashed border-[#c3d0cb] px-4 py-4 text-center text-sm text-[#4a6069]">
            {hasSelectedLibraryFolder
              ? "This folder does not contain any matching subfolders or tiles yet."
              : "No layers match that filter."}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
