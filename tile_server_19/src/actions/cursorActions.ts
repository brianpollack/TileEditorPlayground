"use server";

import { readCursorAssetRecords } from "../lib/serverStore";

export async function readCursorAssetsAction() {
  return readCursorAssetRecords();
}
