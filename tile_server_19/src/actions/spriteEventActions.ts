"use server";

import {
  createSpriteEventRecord,
  readSpriteEventRecords,
  updateSpriteEventRecord
} from "../lib/serverStore";

export async function readSpriteEventsAction(input: {
  filename: string;
  path: string;
}) {
  return readSpriteEventRecords(input.path, input.filename);
}

export async function createSpriteEventAction(input: {
  eventId: string;
  filename: string;
  path: string;
}) {
  return createSpriteEventRecord(input.path, input.filename, input.eventId);
}

export async function saveSpriteEventAction(input: {
  enabled: boolean;
  eventId: string;
  filename: string;
  id: string;
  luaScript: string;
  path: string;
}) {
  return updateSpriteEventRecord(input.path, input.filename, {
    enabled: input.enabled,
    event_id: input.eventId,
    id: input.id,
    lua_script: input.luaScript
  });
}
