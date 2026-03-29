"use client";

import { useEffect, useRef, useState } from "react";
import { faClipboard, faTrashCan } from "@awesome.me/kit-a62459359b/icons/classic/solid";

import { useStudio } from "../app/StudioContext";
import { FontAwesomeIcon } from "./FontAwesomeIcon";

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
      className="fixed z-[80] w-[28rem] border border-[#c3d0cb] bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,253,248,0.94))] shadow-[0_24px_60px_rgba(20,33,39,0.28)]"
      ref={containerRef}
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
    >
      <div
        className={`flex items-center justify-between gap-3 border-b border-[#c3d0cb]/65 px-4 py-3 ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerEnd}
        onPointerCancel={handleHeaderPointerEnd}
      >
        <div className="flex items-center gap-2 text-[#142127]">
          <FontAwesomeIcon className="h-4 w-4" icon={faClipboard} />
          <div>
            <div className="text-sm font-semibold">Clipboard Manager</div>
            <div className="text-xs text-[#4a6069]">10 slots, auto-filled from browser clipboard images.</div>
          </div>
        </div>
        <button
          className="min-h-9 min-w-9 border border-[#c3d0cb] bg-white/90 px-3 text-sm font-semibold text-[#4a6069] transition hover:border-[#d88753] hover:text-[#142127]"
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
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.08em] text-[#4a6069]">
              <span>Slot {index + 1}</span>
              <button
                className="grid h-5 w-5 place-items-center border border-[#c3d0cb] text-[#4a6069] transition hover:border-[#d88753] hover:text-[#d88753] disabled:opacity-35"
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
              className={`grid h-16 w-16 place-items-center overflow-hidden border bg-[linear-gradient(45deg,rgba(231,220,197,0.6)_25%,rgba(255,255,255,0.9)_25%,rgba(255,255,255,0.9)_75%,rgba(231,220,197,0.6)_75%),linear-gradient(45deg,rgba(231,220,197,0.6)_25%,rgba(255,255,255,0.9)_25%,rgba(255,255,255,0.9)_75%,rgba(231,220,197,0.6)_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] transition ${
                selectedClipboardSlotIndex === index
                  ? "border-[#d88753] shadow-[inset_0_0_0_1px_rgba(216,135,83,0.35)]"
                  : "border-[#c3d0cb] hover:border-[#4b86ff]"
              }`}
              onClick={() => {
                setSelectedClipboardSlotIndex(index);
              }}
              title={`Use clipboard slot ${index + 1}`}
              type="button"
            >
              {slot ? (
                <img
                  alt={`Clipboard slot ${index + 1}`}
                  className="h-full w-full object-contain [image-rendering:pixelated]"
                  src={slot.image}
                />
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#4a6069]">
                  Empty
                </span>
              )}
            </button>
            <div
              className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${
                selectedClipboardSlotIndex === index ? "text-[#d88753]" : "text-[#4a6069]"
              }`}
            >
              {selectedClipboardSlotIndex === index ? "Selected" : "\u00a0"}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-[#c3d0cb]/65 px-4 py-3 text-xs text-[#4a6069]">
        {clipboardStatus}
      </div>
    </div>
  );
}
