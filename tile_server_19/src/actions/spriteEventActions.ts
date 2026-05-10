"use server";

import {
  createSpriteEventRecord,
  readSpriteEventRecordsForInstances,
  readSpriteEventRecords,
  updateSpriteEventRecord
} from "../lib/serverStore";

export async function readSpriteEventsAction(input: {
  filename: string;
  path: string;
}) {
  return readSpriteEventRecords(input.path, input.filename);
}

export async function readSpriteInstanceEventsAction(input: {
  spriteIds: string[];
  spriteInstanceIds: string[];
}) {
  return readSpriteEventRecordsForInstances(input.spriteIds, input.spriteInstanceIds);
}

export async function createSpriteEventAction(input: {
  eventId: string;
  filename: string;
  path: string;
  spriteInstanceId?: string | null;
}) {
  return createSpriteEventRecord(input.path, input.filename, input.eventId, input.spriteInstanceId);
}

export async function saveSpriteEventAction(input: {
  enabled: boolean;
  eventId: string;
  filename: string;
  id: string;
  luaScript: string;
  path: string;
  spriteInstanceId?: string | null;
}) {
  return updateSpriteEventRecord(input.path, input.filename, {
    enabled: input.enabled,
    event_id: input.eventId,
    id: input.id,
    lua_script: input.luaScript,
    sprite_instance_id: input.spriteInstanceId ?? null
  });
}
