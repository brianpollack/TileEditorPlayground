"use client";

import { useEffect, useRef, useState } from "react";
import { faClipboard, faTrashCan } from "@awesome.me/kit-a62459359b/icons/classic/solid";

import { useStudio } from "../app/StudioContext";
import { CheckerboardFrame } from "./CheckerboardFrame";
import { FontAwesomeIcon } from "./FontAwesomeIcon";
import {
  closeButtonClass,
  floatingPanelSurfaceClass,
  iconButtonClass
} from "./uiStyles";

const DEFAULT_PANEL_HEIGHT = 420;
const DEFAULT_PANEL_WIDTH = 448;
const EDGE_PADDING = 16;

function clampPosition(left: number, top: number, width: number, height: number) {
  const maxLeft = Math.max(EDGE_PADDING, window.innerWidth - width - EDGE_PADDING);
  const maxTop = Math.max(EDGE_PADDING, window.innerHeight - height - EDGE_PADDING);

  return {
    left: Math.min(maxLeft, Math.max(EDGE_PADDING, left)),
    top: Math.min(maxTop, Math.max(EDGE_PADDING, top))
  };
}

export function ClipboardManager() {
  const {
    clearClipboardSlot,
    clipboardStatus,
    clipboardSlots,
    isClipboardManagerOpen,
    selectedClipboardSlotIndex,
    setSelectedClipboardSlotIndex,
    setClipboardManagerOpen
  } = useStudio();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({
    left: EDGE_PADDING,
    top: 80
  });

  useEffect(() => {
    const panelWidth = containerRef.current?.offsetWidth ?? DEFAULT_PANEL_WIDTH;
    const panelHeight = containerRef.current?.offsetHeight ?? DEFAULT_PANEL_HEIGHT;
    const desiredLeft = window.innerWidth - panelWidth - EDGE_PADDING;

    setPosition((currentPosition) => {
      const nextLeft = currentPosition.left === EDGE_PADDING ? desiredLeft : currentPosition.left;
      return clampPosition(nextLeft, currentPosition.top, panelWidth, panelHeight);
    });
  }, [isClipboardManagerOpen]);

  useEffect(() => {
    const handleResize = () => {
      const panelWidth = containerRef.current?.offsetWidth ?? DEFAULT_PANEL_WIDTH;
      const panelHeight = containerRef.current?.offsetHeight ?? DEFAULT_PANEL_HEIGHT;

      setPosition((currentPosition) =>
        clampPosition(currentPosition.left, currentPosition.top, panelWidth, panelHeight)
      );
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  function handleHeaderPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }

    const container = containerRef.current;

    if (!container) {
      return;
    }

    event.preventDefault();
    dragOffsetRef.current = {
      x: event.clientX - position.left,
      y: event.clientY - position.top
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleHeaderPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging) {
      return;
    }

    const panelWidth = containerRef.current?.offsetWidth ?? DEFAULT_PANEL_WIDTH;
    const panelHeight = containerRef.current?.offsetHeight ?? DEFAULT_PANEL_HEIGHT;
    const nextPosition = clampPosition(
      event.clientX - dragOffsetRef.current.x,
      event.clientY - dragOffsetRef.current.y,
      panelWidth,
      panelHeight
    );

    setPosition(nextPosition);
  }

  function handleHeaderPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging) {
      return;
    }

    setIsDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  if (!isClipboardManagerOpen) {
    return null;
  }

  return (
    <div
      className={floatingPanelSurfaceClass}
      ref={containerRef}
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
    >
      <div
        className={`flex items-center justify-between gap-3 border-b theme-border-panel-faint px-4 py-3 ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerEnd}
        onPointerCancel={handleHeaderPointerEnd}
      >
        <div className="flex items-center gap-2 theme-text-primary">
          <FontAwesomeIcon className="h-4 w-4" icon={faClipboard} />
          <div>
            <div className="text-sm font-semibold">Clipboard Manager</div>
            <div className="text-xs theme-text-muted">10 slots, auto-filled from browser clipboard images.</div>
          </div>
        </div>
        <button
          className={closeButtonClass}
          onClick={() => {
            setClipboardManagerOpen(false);
          }}
          type="button"
        >
          X
        </button>
      </div>

      <div className="grid grid-cols-5 gap-3 p-4">
        {clipboardSlots.map((slot, index) => (
          <div className="grid gap-1" key={index}>
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.08em] theme-text-muted">
              <span>Slot {index + 1}</span>
              <button
                className={`${iconButtonClass} h-5 w-5 disabled:opacity-35`}
                disabled={!slot}
                onClick={() => {
                  clearClipboardSlot(index);
                }}
                title={`Clear clipboard slot ${index + 1}`}
                type="button"
              >
                <FontAwesomeIcon className="h-3 w-3" icon={faTrashCan} />
              </button>
            </div>
            <button
              className={`transition ${
                selectedClipboardSlotIndex === index
                  ? "theme-border-accent theme-ring-inset-accent-strong"
                  : "theme-border-panel theme-hover-border-info"
              }`}
              onClick={() => {
                setSelectedClipboardSlotIndex(index);
              }}
              title={`Use clipboard slot ${index + 1}`}
              type="button"
            >
              <CheckerboardFrame className="h-16 w-16 border">
                {slot ? (
                  <img
                    alt={`Clipboard slot ${index + 1}`}
                    className="h-full w-full object-contain [image-rendering:pixelated]"
                    src={slot.image}
                  />
                ) : (
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] theme-text-muted">
                    Empty
                  </span>
                )}
              </CheckerboardFrame>
            </button>
            <div
              className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${
                selectedClipboardSlotIndex === index ? "theme-text-accent" : "theme-text-muted"
              }`}
            >
              {selectedClipboardSlotIndex === index ? "Selected" : "\u00a0"}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t theme-border-panel-faint px-4 py-3 text-xs theme-text-muted">
        {clipboardStatus}
      </div>
    </div>
  );
}
