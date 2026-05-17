"use server";

import { fixLuaScriptThroughOpenRouter } from "../lib/serverStore";

export async function fixLuaScriptWithAiAction(input: {
  luaScript: string;
  toolDefinition: unknown;
  userDescription?: string;
}) {
  return fixLuaScriptThroughOpenRouter(input);
}
