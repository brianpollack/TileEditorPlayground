"use server";

import { normalizeClipboardSlots, readClipboardSlots, writeClipboardSlots } from "../lib/serverStore";
import type { ClipboardSlotRecord } from "../types";

export async function readClipboardSlotsAction() {
  return readClipboardSlots();
}

export async function saveClipboardSlotsAction(input: {
  slots: Array<ClipboardSlotRecord | null>;
}) {
  const normalizedSlots = normalizeClipboardSlots(input.slots);

  await writeClipboardSlots(normalizedSlots);

  return normalizedSlots;
}
