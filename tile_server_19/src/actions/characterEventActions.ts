"use server";

import {
  createCharacterEventRecord,
  readCharacterEventRecords,
  updateCharacterEventRecord
} from "../lib/serverStore";

export async function readCharacterEventsAction(characterName: string) {
  return readCharacterEventRecords(characterName);
}

export async function createCharacterEventAction(input: {
  characterEvent: string;
  characterName: string;
}) {
  return createCharacterEventRecord(input.characterName, input.characterEvent);
}

export async function saveCharacterEventAction(input: {
  characterEvent: string;
  characterName: string;
  enabled: boolean;
  id: string;
  luaScript: string;
}) {
  return updateCharacterEventRecord(input.characterName, {
    character_event: input.characterEvent,
    enabled: input.enabled,
    id: input.id,
    lua_script: input.luaScript
  });
}
