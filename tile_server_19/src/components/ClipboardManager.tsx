"use client";

import { faClipboard, faTrashCan } from "@awesome.me/kit-a62459359b/icons/classic/solid";

import { useStudio } from "../app/StudioContext";
import { CheckerboardFrame } from "./CheckerboardFrame";
import { FontAwesomeIcon } from "./FontAwesomeIcon";

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

  if (!isClipboardManagerOpen) {
    return null;
  }

  return (
    <section className="navbar__clipboard">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="navbar__item-badge navbar__item-badge--icon shrink-0">
            <FontAwesomeIcon className="h-4 w-4" icon={faClipboard} />
          </span>
          <div className="min-w-0">
            <div className="navbar__item-title">Clipboard Manager</div>
            <div className="navbar__clipboard-description">
              10 slots, auto-filled from browser clipboard images.
            </div>
          </div>
        </div>
        <button
          className="navbar__item-close"
          onClick={() => {
            setClipboardManagerOpen(false);
          }}
          title="Close clipboard manager"
          type="button"
        >
          X
        </button>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {clipboardSlots.map((slot, index) => {
          const isSelected = selectedClipboardSlotIndex === index;

          return (
            <div className="grid gap-1" key={index}>
              <div className="flex items-center justify-between gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/60">
                <span>#{index + 1}</span>
                <button
                  className="navbar__clipboard-clear disabled:opacity-35"
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
                className={`navbar__clipboard-slot ${isSelected ? "navbar__clipboard-slot--selected" : ""}`}
                onClick={() => {
                  setSelectedClipboardSlotIndex(index);
                }}
                title={`Use clipboard slot ${index + 1}`}
                type="button"
              >
                <CheckerboardFrame className="h-12 w-12 border border-white/10">
                  {slot ? (
                    <img
                      alt={`Clipboard slot ${index + 1}`}
                      className="h-full w-full object-contain [image-rendering:pixelated]"
                      src={slot.image}
                    />
                  ) : (
                    <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-white/45">
                      Empty
                    </span>
                  )}
                </CheckerboardFrame>
              </button>
            </div>
          );
        })}
      </div>

      <div className="navbar__clipboard-status">{clipboardStatus}</div>
    </section>
  );
}
