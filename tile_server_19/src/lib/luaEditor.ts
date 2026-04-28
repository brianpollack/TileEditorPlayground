import type { Ace } from "ace-builds";
import styluaWasmUrl from "@johnnymorganz/stylua/stylua_lib_bg.wasm?url";
import { parse } from "luaparse";
import { LUA_SCRIPTING_GUIDE_PATH } from "./luaPaths";

export interface LuaScriptError {
  column: number;
  line: number;
  message: string;
}

export type LuaValidationResult =
  | {
      ok: true;
    }
  | {
      error: LuaScriptError;
      ok: false;
    };

const DEFAULT_LUA_VERSION = "5.3";
let styluaModulePromise: Promise<typeof import("@johnnymorganz/stylua/web")> | null = null;

function normalizeLuaMessage(message: string) {
  return message.replace(/^\[\d+:\d+\]\s*/, "").trim();
}

function extractLineAndColumn(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const errorWithLocation = error as {
      column?: unknown;
      line?: unknown;
    };

    if (
      typeof errorWithLocation.line === "number" &&
      Number.isFinite(errorWithLocation.line) &&
      typeof errorWithLocation.column === "number" &&
      Number.isFinite(errorWithLocation.column)
    ) {
      return {
        column: errorWithLocation.column,
        line: errorWithLocation.line
      };
    }
  }

  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = message.match(/\[(\d+):(\d+)\]/);

  if (!match) {
    return {
      column: 0,
      line: 1
    };
  }

  return {
    column: Number.parseInt(match[2] ?? "0", 10) || 0,
    line: Number.parseInt(match[1] ?? "1", 10) || 1
  };
}

function toLuaScriptError(error: unknown): LuaScriptError {
  const message =
    error instanceof Error
      ? normalizeLuaMessage(error.message)
      : typeof error === "string"
        ? error.trim()
        : "Invalid Lua script.";
  const { line, column } = extractLineAndColumn(error);

  return {
    column,
    line,
    message
  };
}

export function validateLuaScript(script: string): LuaValidationResult {
  try {
    parse(script, {
      comments: true,
      luaVersion: DEFAULT_LUA_VERSION,
      locations: true,
      ranges: true,
      scope: false
    });

    return {
      ok: true
    };
  } catch (error: unknown) {
    return {
      error: toLuaScriptError(error),
      ok: false
    };
  }
}

export function createLuaErrorAnnotations(result: LuaValidationResult): Ace.Annotation[] {
  if (result.ok) {
    return [];
  }

  return [
    {
      column: Math.max(result.error.column, 0),
      row: Math.max(result.error.line - 1, 0),
      text: result.error.message,
      type: "error"
    }
  ];
}

async function loadStylua() {
  if (!styluaModulePromise) {
    styluaModulePromise = import("@johnnymorganz/stylua/web").then(async (styluaModule) => {
      await styluaModule.default({ module_or_path: styluaWasmUrl });
      return styluaModule;
    });
  }

  return styluaModulePromise;
}

export async function formatLuaScript(script: string) {
  const validationResult = validateLuaScript(script);

  if (!validationResult.ok) {
    throw new Error(validationResult.error.message);
  }

  const styluaModule = await loadStylua();
  const config = styluaModule.Config.new();

  config.indent_type = styluaModule.IndentType.Spaces;
  config.indent_width = 2;
  config.line_endings = styluaModule.LineEndings.Unix;
  config.syntax = styluaModule.LuaVersion.All;

  return styluaModule.formatCode(script, config, null, styluaModule.OutputVerification.Full);
}

export function openLuaScriptingGuide() {
  if (typeof window === "undefined") {
    return;
  }

  const popup = window.open(
    LUA_SCRIPTING_GUIDE_PATH,
    "lua-scripting-guide",
    "popup=yes,width=1120,height=860,resizable=yes,scrollbars=yes"
  );

  if (popup) {
    popup.focus();
    return;
  }

  window.open(LUA_SCRIPTING_GUIDE_PATH, "_blank", "noopener,noreferrer");
}
