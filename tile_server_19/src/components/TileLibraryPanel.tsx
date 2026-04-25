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
import { CheckerboardFrame } from "./CheckerboardFrame";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { FileDropTarget } from "./FileDropTarget";
import { Panel } from "./Panel";
import {
  assetListCheckerThumbClass,
  assetListClass,
  assetListEyebrowClass,
  assetListMetaClass,
  assetListMonoClass,
  assetListRowClass,
  assetListTitleClass,
  assetListWideThumbClass,
  badgePillClass,
  emptyStateCardClass,
  menuItemButtonClass,
  menuSurfaceClass,
  overflowMenuAnchorClass,
  overflowMenuButtonClass,
  scrollableAssetListClass,
  textInputClass
} from "./uiStyles";
import type { SpriteRecord, TileRecord } from "../types";

const CREATE_TILE_PATH = "/__tiles/create";
const DUPLICATE_TILE_PATH = "/__tiles/duplicate";
const DELETE_ASSET_PATH = "/__tiles/delete-asset";
const IMPORT_TILE_PATH = "/__tiles/import-tile";
const IMPORT_SPRITE_PATH = "/__tiles/import-sprite";

interface TileLibraryFolderEntry {
  assetCount: number;
  label: string;
  path: string;
}

type TileLibraryAssetMenuState =
  | {
      assetType: "sprite";
      filename: string;
      key: string;
      name: string;
      path: string;
    }
  | {
      assetType: "tile";
      key: string;
      name: string;
      path: string;
      slug: string;
    };

interface TileLibraryPanelProps {
  variant?: "default" | "sidebar";
}

interface AssetOverflowMenuProps {
  assetName: string;
  children: React.ReactNode;
}

function AssetOverflowMenu({ assetName, children }: AssetOverflowMenuProps) {
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const dropdownElement = dropdownRef.current;

    if (!dropdownElement) {
      return;
    }

    let isMounted = true;
    let dropdown: { destroy: () => void } | null = null;

    void import("@preline/dropdown").then(({ default: HSDropdown }) => {
      if (!isMounted) {
        return;
      }

      dropdown = new HSDropdown(dropdownElement as HTMLDivElement & { _floatingUI: unknown });
    });

    return () => {
      isMounted = false;
      dropdown?.destroy();
    };
  }, []);

  return (
    <div className={overflowMenuAnchorClass}>
        <div
        className="hs-dropdown relative inline-flex [--auto-close:true] [--gpu-acceleration:false] [--offset:8] [--placement:bottom-right] [--scope:window] [--trigger:click]"
        ref={dropdownRef}
      >
        <button
          aria-haspopup="menu"
          aria-label={`Options for ${assetName}`}
          className={`${overflowMenuButtonClass} hs-dropdown-toggle`}
          type="button"
        >
          ⋮
        </button>
        <div className={`${menuSurfaceClass} hs-dropdown-menu hidden`} role="menu">
          {children}
        </div>
      </div>
    </div>
  );
}

export function TileLibraryPanel({ variant = "default" }: TileLibraryPanelProps) {
  const {
    activeTile,
    activeSprite,
    activeSpriteKey,
    activeTileSlug,
    addTileLibraryFolder,
    getTileDraftSlots,
    queueTileSourceImage,
    setActiveSpriteKey,
    setActiveTileSlug,
    setTileDraftSlots,
    removeSprite,
    removeTile,
    sprites,
    tileLibraryFolderAssetCounts,
    tileLibraryFolders,
    tiles,
    upsertSprite,
    upsertTile
  } = useStudio();
  const [newTileName, setNewTileName] = useState("");
  const [tileQuery, setTileQuery] = useState("");
  const [tileImportStatus, setTileImportStatus] = useState("");
  const [spriteImportStatus, setSpriteImportStatus] = useState("");
  const [assetPendingDuplicate, setAssetPendingDuplicate] = useState<TileLibraryAssetMenuState | null>(null);
  const [duplicateTileName, setDuplicateTileName] = useState("");
  const [duplicateStatus, setDuplicateStatus] = useState("");
  const [isDuplicatingTile, setDuplicatingTile] = useState(false);
  const [assetPendingDelete, setAssetPendingDelete] = useState<TileLibraryAssetMenuState | null>(null);
  const [deleteStatus, setDeleteStatus] = useState("");
  const [isDeletingAsset, setDeletingAsset] = useState(false);
  const activeLibraryPath = normalizeTileLibraryPath(activeTile?.path ?? activeSprite?.path ?? "");
  const [libraryPath, setLibraryPath] = useState(() => activeLibraryPath);
  const [isPending, startTransition] = useTransition();
  const deferredTileQuery = useDeferredValue(tileQuery.trim().toLowerCase());
  const tileFileInputRef = useRef<HTMLInputElement | null>(null);
  const spriteFileInputRef = useRef<HTMLInputElement | null>(null);
  const duplicateNameInputRef = useRef<HTMLInputElement | null>(null);
  const isSidebar = variant === "sidebar";

  const normalizedNewTileName = normalizeUnderscoreName(newTileName);
  const normalizedDuplicateTileName = normalizeUnderscoreName(duplicateTileName);
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
          assetCount: tileLibraryFolderAssetCounts[folderPath] ?? 0,
          label: getTileLibrarySegmentLabel(folderPath),
          path: folderPath
        }))
    : TILE_LIBRARY_LAYERS.map((layer) => ({
        assetCount: tileLibraryFolderAssetCounts[layer.folder] ?? 0,
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
    setTileImportStatus("");
    setSpriteImportStatus("");
    resetTileInput();
    resetSpriteInput();
  }, [currentLibraryPath]);

  useEffect(() => {
    if (!assetPendingDuplicate) {
      return;
    }

    duplicateNameInputRef.current?.focus();
    duplicateNameInputRef.current?.select();
  }, [assetPendingDuplicate]);

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

  function resetTileInput() {
    if (tileFileInputRef.current) {
      tileFileInputRef.current.value = "";
    }
  }

  function handleTileImport(file: File) {
    if (!currentLibraryPath) {
      return;
    }

    setTileImportStatus(`Importing ${file.name}...`);

    startTransition(() => {
      void (async () => {
        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("path", currentLibraryPath);

          const response = await fetch(IMPORT_TILE_PATH, {
            body: formData,
            method: "POST"
          });
          const responseBody = (await response.json()) as Partial<TileRecord> & { error?: string };

          if (!response.ok || responseBody.error) {
            setTileImportStatus(responseBody.error ?? "Could not import tile.");
            resetTileInput();
            return;
          }

          const importedTile = responseBody as TileRecord;
          queueTileSourceImage(importedTile.slug, {
            dataUrl: URL.createObjectURL(file),
            name: file.name,
            sourcePath: file.name
          });
          upsertTile(importedTile);
          setTileDraftSlots(importedTile.slug, normalizeSlotRecords(importedTile.slots));
          setLibraryPath(normalizeTileLibraryPath(importedTile.path));
          setActiveSpriteKey("");
          setActiveTileSlug(importedTile.slug);
          setTileImportStatus(`Imported ${importedTile.name}.`);
          resetTileInput();
        } catch {
          setTileImportStatus("Could not import tile.");
          resetTileInput();
        }
      })();
    });
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
            impassible: false,
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

  function openAssetDeleteConfirmation(asset: TileLibraryAssetMenuState) {
    setAssetPendingDuplicate(null);
    setDuplicateTileName("");
    setDuplicatingTile(false);
    setDuplicateStatus("");
    setDeletingAsset(false);
    setDeleteStatus("");
    setAssetPendingDelete(asset);
  }

  function openTileDuplicateConfirmation(tileRecord: TileRecord) {
    setAssetPendingDelete(null);
    setDeletingAsset(false);
    setDeleteStatus("");
    setDuplicateStatus("");
    setDuplicatingTile(false);
    setDuplicateTileName(`${tileRecord.name}_copy`);
    setAssetPendingDuplicate({
      assetType: "tile",
      key: `tile:${tileRecord.slug}`,
      name: tileRecord.name,
      path: tileRecord.path,
      slug: tileRecord.slug
    });
  }

  function handleDuplicateTile() {
    if (!assetPendingDuplicate || assetPendingDuplicate.assetType !== "tile" || isDuplicatingTile) {
      return;
    }

    if (!normalizedDuplicateTileName) {
      setDuplicateStatus("Tile name is required.");
      return;
    }

    setDuplicatingTile(true);
    setDuplicateStatus("");

    void (async () => {
      try {
        const response = await fetch(DUPLICATE_TILE_PATH, {
          body: JSON.stringify({
            name: normalizedDuplicateTileName,
            slug: assetPendingDuplicate.slug
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const responseBody = (await response.json()) as Partial<TileRecord> & { error?: string };

        if (!response.ok || responseBody.error) {
          setDuplicateStatus(responseBody.error ?? "Could not duplicate tile.");
          return;
        }

        const duplicatedTile = responseBody as TileRecord;
        upsertTile(duplicatedTile);
        setTileDraftSlots(
          duplicatedTile.slug,
          getTileDraftSlots(duplicatedTile.slug, normalizeSlotRecords(duplicatedTile.slots))
        );
        setLibraryPath(normalizeTileLibraryPath(duplicatedTile.path));
        setActiveSpriteKey("");
        setActiveTileSlug(duplicatedTile.slug);
        setAssetPendingDuplicate(null);
        setDuplicateTileName("");
        setDuplicateStatus("");
      } catch {
        setDuplicateStatus("Could not duplicate tile.");
      } finally {
        setDuplicatingTile(false);
      }
    })();
  }

  function handleDeleteAsset() {
    if (!assetPendingDelete || isDeletingAsset) {
      return;
    }

    setDeletingAsset(true);
    setDeleteStatus("");

    void (async () => {
      try {
        const response = await fetch(DELETE_ASSET_PATH, {
          body: JSON.stringify(
            assetPendingDelete.assetType === "tile"
              ? {
                  assetType: "tile",
                  slug: assetPendingDelete.slug
                }
              : {
                  assetType: "sprite",
                  filename: assetPendingDelete.filename,
                  path: assetPendingDelete.path
                }
          ),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const responseBody = (await response.json()) as Partial<{
          assetType: "sprite" | "tile";
          error: string;
          slug: string;
          spriteKey: string;
        }>;

        if (!response.ok || responseBody.error) {
          setDeleteStatus(responseBody.error ?? "Could not remove asset.");
          return;
        }

        if (assetPendingDelete.assetType === "tile") {
          removeTile(responseBody.slug ?? assetPendingDelete.slug);
        } else {
          removeSprite(responseBody.spriteKey ?? assetPendingDelete.key);
        }

        setAssetPendingDelete(null);
        setDeleteStatus("");
      } catch {
        setDeleteStatus("Could not remove asset.");
      } finally {
        setDeletingAsset(false);
      }
    })();
  }

  return (
    <Panel
      className={isSidebar ? "h-full" : ""}
      actions={
        isSidebar ? undefined : (
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
        )
      }
      subheader={
        <div className="flex flex-wrap items-center gap-2 text-xs leading-5">
          {!breadcrumbItems.length ? (
            <span className="theme-text-subtle">Select Layer</span>
          ) : (
            <>
              {breadcrumbItems.map((breadcrumb, index) => (
                <div className="flex items-center gap-2" key={`${breadcrumb.label}:${breadcrumb.targetPath}`}>
                  {index > 0 ? <span className="theme-text-subtle">/</span> : null}
                  <button
                    className="theme-text-muted transition theme-hover-text-primary"
                    onClick={() => {
                      navigateToLibraryPath(breadcrumb.targetPath);
                    }}
                    type="button"
                  >
                    {breadcrumb.label}
                  </button>
                </div>
              ))}
              <span className="theme-text-subtle">/</span>
              <span className="theme-text-subtle">Select Tile or Folder</span>
            </>
          )}
        </div>
      }
      title="Tile Library"
    >
      {isSidebar ? (
        <div className="flex flex-col items-stretch gap-2">
          <input
            className={`${textInputClass} min-w-0 w-full`}
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
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`${actionButtonClass} min-w-0`}
              disabled={!normalizedNewTileName || !hasSelectedLibraryFolder}
              onClick={handleCreateTile}
              type="button"
            >
              Create
            </button>
            <button
              className={`${actionButtonClass} min-w-0`}
              disabled={!normalizedNewTileName || !hasSelectedLibraryFolder}
              onClick={handleCreateFolder}
              type="button"
            >
              New Folder
            </button>
          </div>
        </div>
      ) : null}
      <div className={`flex ${isSidebar ? "flex-col items-stretch gap-2" : "flex-wrap items-center gap-3"}`}>
        <input
          className={isSidebar ? `${textInputClass} min-w-0 w-full` : textInputClass}
          onChange={(event) => {
            setTileQuery(event.currentTarget.value);
          }}
          placeholder={hasSelectedLibraryFolder ? "Filter folders and tiles" : "Filter layers"}
          value={tileQuery}
        />
        {tileImportStatus ? <div className="text-xs theme-text-muted">{tileImportStatus}</div> : null}
        {spriteImportStatus ? <div className="text-xs theme-text-muted">{spriteImportStatus}</div> : null}
        {newTileName && newTileName !== normalizedNewTileName ? (
          <div className="text-xs theme-text-muted">
            New tile will be created as <span className="font-mono">{normalizedNewTileName}</span>
          </div>
        ) : null}
      </div>
      <div className={isSidebar ? scrollableAssetListClass : `${assetListClass} md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4`}>
        {hasSelectedLibraryFolder ? (
          <>
            <input
              accept="image/png,.png"
              className="hidden"
              onChange={(event) => {
                const nextFile = event.currentTarget.files?.[0];

                if (nextFile) {
                  handleTileImport(nextFile);
                }
              }}
              ref={tileFileInputRef}
              type="file"
            />
            <FileDropTarget
              className="w-full px-4 py-4 text-center"
              disabled={isPending}
              idleLabel={isPending ? "Importing tile..." : "Click or drop a PNG to import a tile"}
              onClick={() => {
                tileFileInputRef.current?.click();
              }}
              onFileSelected={handleTileImport}
            />
          </>
        ) : null}
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
            <FileDropTarget
              className="w-full px-4 py-4 text-center"
              disabled={isPending}
              idleLabel={isPending ? "Importing sprite..." : "Click or drop a PNG here to import a sprite."}
              onClick={() => {
                spriteFileInputRef.current?.click();
              }}
              onFileSelected={handleSpriteImport}
            />
          </>
        ) : null}
        {filteredFolderEntries.map((folderEntry) => (
          <button
            className={assetListRowClass(false, true)}
            key={folderEntry.path}
            onClick={() => {
              navigateToLibraryPath(folderEntry.path);
            }}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <div className={assetListMetaClass}>
                <span className={assetListEyebrowClass}>Folder</span>
                <span className={assetListTitleClass}>{folderEntry.label}</span>
              </div>
              <span className={badgePillClass}>{folderEntry.assetCount}</span>
            </div>
          </button>
        ))}
        {filteredTiles.map((tileRecord) => (
          <div className="relative" key={tileRecord.slug}>
            <AssetOverflowMenu
              assetName={tileRecord.name}
            >
              <button
                className={`${menuItemButtonClass} hs-dropdown-close`}
                onClick={() => {
                  openTileDuplicateConfirmation(tileRecord);
                }}
                type="button"
              >
                Duplicate
              </button>
              <button
                className={`${menuItemButtonClass} hs-dropdown-close`}
                onClick={() => {
                  openAssetDeleteConfirmation({
                    assetType: "tile",
                    key: `tile:${tileRecord.slug}`,
                    name: tileRecord.name,
                    path: tileRecord.path,
                    slug: tileRecord.slug
                  });
                }}
                type="button"
              >
                Delete asset
              </button>
            </AssetOverflowMenu>
            <button
              className={`${assetListRowClass(tileRecord.slug === activeTileSlug)} pr-10`}
              onClick={() => {
                setLibraryPath(normalizeTileLibraryPath(tileRecord.path));
                setActiveSpriteKey("");
                setActiveTileSlug(tileRecord.slug);
              }}
              type="button"
            >
              {tileRecord.thumbnail ? (
                <img
                  alt={`${tileRecord.name} thumbnail`}
                  className={`${assetListWideThumbClass} object-contain [image-rendering:pixelated]`}
                  height={16}
                  src={tileRecord.thumbnail}
                  width={64}
                />
              ) : (
                <div className={assetListWideThumbClass} />
              )}
              <div className={assetListMetaClass}>
                <span className={assetListTitleClass}>{tileRecord.name}</span>
                <span className={assetListMonoClass}>{tileRecord.slug}</span>
              </div>
            </button>
          </div>
        ))}
        {filteredSprites.map((spriteRecord) => (
          <div className="relative" key={`${spriteRecord.path}/${spriteRecord.filename}`}>
            <AssetOverflowMenu
              assetName={spriteRecord.name}
            >
              <button
                className={`${menuItemButtonClass} hs-dropdown-close`}
                onClick={() => {
                  openAssetDeleteConfirmation({
                    assetType: "sprite",
                    filename: spriteRecord.filename,
                    key: getTileLibrarySpriteKey(spriteRecord.path, spriteRecord.filename),
                    name: spriteRecord.name,
                    path: spriteRecord.path
                  });
                }}
                type="button"
              >
                Delete asset
              </button>
            </AssetOverflowMenu>
            <button
              className={`${assetListRowClass(
                getTileLibrarySpriteKey(spriteRecord.path, spriteRecord.filename) === activeSpriteKey
              )} pr-10`}
              onClick={() => {
                setLibraryPath(normalizeTileLibraryPath(spriteRecord.path));
                setActiveTileSlug("");
                setActiveSpriteKey(getTileLibrarySpriteKey(spriteRecord.path, spriteRecord.filename));
              }}
              type="button"
            >
              <CheckerboardFrame className={assetListCheckerThumbClass}>
                {spriteRecord.thumbnail ? (
                  <img
                    alt={`${spriteRecord.name} sprite thumbnail`}
                    className="max-h-full max-w-full object-contain"
                    src={spriteRecord.thumbnail}
                  />
                ) : null}
              </CheckerboardFrame>
              <div className={assetListMetaClass}>
                <span className={assetListTitleClass}>{spriteRecord.name}</span>
                <span className={assetListMonoClass}>{spriteRecord.filename}</span>
              </div>
            </button>
          </div>
        ))}
        {!filteredFolderEntries.length && !filteredTiles.length && !filteredSprites.length ? (
          <div className={emptyStateCardClass}>
            {hasSelectedLibraryFolder
              ? "This folder does not contain any matching subfolders, tiles, or sprites yet."
              : "No layers match that filter."}
          </div>
        ) : null}
      </div>
      {assetPendingDuplicate?.assetType === "tile" ? (
        <ConfirmationDialog
          actions={
            <>
              <button
                className="min-h-11 border theme-border-panel theme-bg-panel px-4 py-2 font-semibold theme-text-muted transition theme-hover-text-primary"
                disabled={isDuplicatingTile}
                onClick={() => {
                  setAssetPendingDuplicate(null);
                  setDuplicateTileName("");
                  setDuplicatingTile(false);
                  setDuplicateStatus("");
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className={actionButtonClass}
                disabled={isDuplicatingTile || !normalizedDuplicateTileName}
                onClick={handleDuplicateTile}
                type="button"
              >
                {isDuplicatingTile ? "Duplicating..." : "Duplicate"}
              </button>
            </>
          }
          description={`Create a copy of ${assetPendingDuplicate.name} with a new tile name.`}
          key={`duplicate:${assetPendingDuplicate.key}`}
          title="Duplicate tile"
        >
          <div className="grid gap-3">
            <input
              className={textInputClass}
              onChange={(event) => {
                setDuplicateTileName(event.currentTarget.value);
                if (duplicateStatus) {
                  setDuplicateStatus("");
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && normalizedDuplicateTileName && !isDuplicatingTile) {
                  event.preventDefault();
                  handleDuplicateTile();
                }
              }}
              placeholder="New tile name"
              ref={duplicateNameInputRef}
              value={duplicateTileName}
            />
            {normalizedDuplicateTileName && normalizedDuplicateTileName !== duplicateTileName ? (
              <div className="text-xs theme-text-muted">
                Tile will be saved as <span className={assetListMonoClass}>{normalizedDuplicateTileName}</span>.
              </div>
            ) : null}
            {duplicateStatus ? <div className="text-sm theme-text-muted">{duplicateStatus}</div> : null}
          </div>
        </ConfirmationDialog>
      ) : null}
      {assetPendingDelete ? (
        <ConfirmationDialog
          actions={
            <>
              <button
                className="min-h-11 border theme-border-panel theme-bg-panel px-4 py-2 font-semibold theme-text-muted transition theme-hover-text-primary"
                disabled={isDeletingAsset}
                onClick={() => {
                  setAssetPendingDelete(null);
                  setDeletingAsset(false);
                  setDeleteStatus("");
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className={actionButtonClass}
                disabled={isDeletingAsset}
                onClick={handleDeleteAsset}
                type="button"
              >
                {isDeletingAsset ? "Removing..." : "Delete asset"}
              </button>
            </>
          }
          description={assetPendingDelete.name}
          key={assetPendingDelete.key}
          title="Are you sure you want to remove this asset?"
        >
          {deleteStatus ? <div className="text-sm theme-text-muted">{deleteStatus}</div> : null}
        </ConfirmationDialog>
      ) : null}
    </Panel>
  );
}
