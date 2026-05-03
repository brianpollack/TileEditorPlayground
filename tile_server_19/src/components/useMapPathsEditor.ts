"use client";

import { useEffect, useMemo, useState } from "react";

import {
  createMapPathAction,
  readMapPathsAction,
  saveMapPathAction
} from "../actions/mapActions";
import type { MapPathPoint, MapPathRecord, TileCell } from "../types";

export type MapPathTool = "add" | "erase";

function getMapPathPointKey(point: MapPathPoint) {
  return `${point.tileX},${point.tileY}`;
}

function getMapPathPointsAfterErase(points: MapPathPoint[], targetCell: TileCell) {
  const targetKey = `${targetCell.tileX},${targetCell.tileY}`;
  const exactIndex = points.findIndex((point) => getMapPathPointKey(point) === targetKey);

  if (exactIndex >= 0) {
    return points.filter((_, index) => index !== exactIndex);
  }

  return points;
}

export function useMapPathsEditor(input: {
  activeMapSlug: string;
  isPathsTabActive: boolean;
}) {
  const [activeMapPathId, setActiveMapPathId] = useState("");
  const [activeMapPathNameDraft, setActiveMapPathNameDraft] = useState("");
  const [activeMapPathTool, setActiveMapPathTool] = useState<MapPathTool>("add");
  const [mapPaths, setMapPaths] = useState<MapPathRecord[]>([]);
  const [mapPathStatus, setMapPathStatus] = useState("");
  const [isMapPathsLoading, setMapPathsLoading] = useState(false);
  const [isMapPathSaving, setMapPathSaving] = useState(false);

  const activeMapPath = useMemo(
    () => mapPaths.find((pathRecord) => pathRecord.id === activeMapPathId) ?? null,
    [activeMapPathId, mapPaths]
  );

  useEffect(() => {
    setMapPaths([]);
    setActiveMapPathId("");
    setActiveMapPathNameDraft("");
    setActiveMapPathTool("add");
    setMapPathStatus("");
    setMapPathsLoading(false);
    setMapPathSaving(false);
  }, [input.activeMapSlug]);

  useEffect(() => {
    if (activeMapPath) {
      setActiveMapPathNameDraft(activeMapPath.name);
      return;
    }

    setActiveMapPathNameDraft("");
  }, [activeMapPath?.id, activeMapPath?.name]);

  useEffect(() => {
    if (!input.isPathsTabActive) {
      return;
    }

    if (!input.activeMapSlug) {
      setMapPaths([]);
      setActiveMapPathId("");
      setActiveMapPathNameDraft("");
      setMapPathStatus("");
      return;
    }

    setMapPathsLoading(true);
    setMapPathStatus("");

    void readMapPathsAction(input.activeMapSlug)
      .then((nextPaths) => {
        setMapPaths(nextPaths);
        setActiveMapPathId((currentPathId) =>
          nextPaths.some((pathRecord) => pathRecord.id === currentPathId)
            ? currentPathId
            : nextPaths[0]?.id ?? ""
        );
      })
      .catch((error: unknown) => {
        setMapPaths([]);
        setActiveMapPathId("");
        setActiveMapPathNameDraft("");
        setMapPathStatus(error instanceof Error ? error.message : "Could not load map paths.");
      })
      .finally(() => {
        setMapPathsLoading(false);
      });
  }, [input.activeMapSlug, input.isPathsTabActive]);

  function saveMapPathDraft(
    pathRecord: MapPathRecord,
    nextFields: Partial<Pick<MapPathRecord, "name" | "points">>
  ) {
    if (!input.activeMapSlug || isMapPathSaving) {
      return;
    }

    const nextName = nextFields.name ?? pathRecord.name;
    const nextPoints = nextFields.points ?? pathRecord.points;

    setMapPathSaving(true);
    setMapPathStatus("");

    void saveMapPathAction({
      id: pathRecord.id,
      mapSlug: input.activeMapSlug,
      name: nextName,
      points: nextPoints
    })
      .then((savedPath) => {
        setMapPaths((currentPaths) =>
          currentPaths.map((currentPath) => (currentPath.id === savedPath.id ? savedPath : currentPath))
        );
        setActiveMapPathId(savedPath.id);
        setMapPathStatus("Path saved.");
      })
      .catch((error: unknown) => {
        setMapPathStatus(error instanceof Error ? error.message : "Could not save path.");
      })
      .finally(() => {
        setMapPathSaving(false);
      });
  }

  function applyMapPathCell(nextCell: TileCell) {
    if (!activeMapPath || isMapPathSaving) {
      setMapPathStatus(activeMapPath ? "" : "Create or select a path before editing points.");
      return;
    }

    const nextPoints =
      activeMapPathTool === "add"
        ? [...activeMapPath.points, { tileX: nextCell.tileX, tileY: nextCell.tileY }]
        : getMapPathPointsAfterErase(activeMapPath.points, nextCell);

    if (nextPoints === activeMapPath.points) {
      setMapPathStatus(`No path point at ${nextCell.tileX},${nextCell.tileY}.`);
      return;
    }

    setMapPaths((currentPaths) =>
      currentPaths.map((pathRecord) =>
        pathRecord.id === activeMapPath.id
          ? {
              ...pathRecord,
              points: nextPoints
            }
          : pathRecord
      )
    );
    saveMapPathDraft(activeMapPath, { points: nextPoints });
  }

  function handleCreateMapPath() {
    if (!input.activeMapSlug || isMapPathSaving) {
      return;
    }

    setMapPathSaving(true);
    setMapPathStatus("");

    void createMapPathAction({
      mapSlug: input.activeMapSlug
    })
      .then((createdPath) => {
        setMapPaths((currentPaths) => [...currentPaths, createdPath]);
        setActiveMapPathId(createdPath.id);
        setActiveMapPathNameDraft(createdPath.name);
        setMapPathStatus("Path created.");
      })
      .catch((error: unknown) => {
        setMapPathStatus(error instanceof Error ? error.message : "Could not create path.");
      })
      .finally(() => {
        setMapPathSaving(false);
      });
  }

  function handleSaveActiveMapPathName() {
    if (!activeMapPath) {
      return;
    }

    saveMapPathDraft(activeMapPath, { name: activeMapPathNameDraft });
  }

  return {
    activeMapPath,
    activeMapPathId,
    activeMapPathNameDraft,
    activeMapPathTool,
    applyMapPathCell,
    handleCreateMapPath,
    handleSaveActiveMapPathName,
    isMapPathSaving,
    isMapPathsLoading,
    mapPathStatus,
    mapPaths,
    setActiveMapPathId,
    setActiveMapPathNameDraft,
    setActiveMapPathTool,
    setMapPathStatus
  };
}
