"use server";

import {
  createSpriteStateRecord,
  readSpriteStateRecords
} from "../lib/serverStore";

export async function readSpriteStatesAction(input: {
  filename: string;
  path: string;
}) {
  return readSpriteStateRecords(input.path, input.filename);
}

export async function createSpriteStateAction(input: {
  filename: string;
  path: string;
  sourceStateId?: string;
  stateId: string;
}) {
  return createSpriteStateRecord(input.path, input.filename, input.stateId, input.sourceStateId);
}
