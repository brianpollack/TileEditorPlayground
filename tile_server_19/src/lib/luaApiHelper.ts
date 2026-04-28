import { useCallback, useEffect, useRef, useState } from "react";
import type { Ace } from "ace-builds";
import * as languageTools from "ace-builds/src-noconflict/ext-language_tools";

const LUA_API_HELPER_URL = "/__lua/api-helper";
const LUA_API_COMPLETER_ID = "lua-api-helper";

interface LuaApiHelperCompletionEntry {
  caption?: string;
  docText?: string;
  meta?: string;
  score?: number;
  type?: string;
  value?: string;
}

interface LuaApiHelperSnippetEntry {
  content: string;
  meta?: string;
  name?: string;
  tabTrigger?: string;
}

interface LuaApiHelperTableMember {
  description?: string;
  kind?: string;
  name?: string;
  returns?: string;
  signature?: string;
  type?: string;
}

interface LuaApiHelperTable {
  availability?: string;
  description?: string;
  kind?: string;
  members?: LuaApiHelperTableMember[];
  writeback_rules?: string[];
}

interface LuaApiHelperPayload {
  completions?: LuaApiHelperCompletionEntry[];
  description?: string;
  name?: string;
  notes?: string[];
  snippets?: LuaApiHelperSnippetEntry[];
  tables?: Record<string, LuaApiHelperTable>;
  version?: number;
}

type LuaApiHelperLoadResult =
  | {
      completer: Ace.Completer;
      status: "ready";
    }
  | {
      status: "error";
    };

let luaApiHelperPromise: Promise<LuaApiHelperLoadResult> | null = null;
let luaApiHelperCachedResult: LuaApiHelperLoadResult | null = null;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildTableDocHtml(name: string, table: LuaApiHelperTable | undefined) {
  if (!table) {
    return "";
  }

  const sections: string[] = [];

  if (table.description) {
    sections.push(`<p>${escapeHtml(table.description)}</p>`);
  }

  if (table.availability) {
    sections.push(`<p><strong>Availability:</strong> ${escapeHtml(table.availability)}</p>`);
  }

  if (table.members?.length) {
    const members = table.members
      .slice(0, 12)
      .map((member) => {
        const signature = member.signature ?? member.name ?? "";
        const memberDescription = member.description ?? member.type ?? member.returns ?? "";

        return `<li><strong>${escapeHtml(signature)}</strong>${
          memberDescription ? ` - ${escapeHtml(memberDescription)}` : ""
        }</li>`;
      })
      .join("");

    sections.push(`<div><strong>Members</strong><ul>${members}</ul></div>`);
  }

  if (table.writeback_rules?.length) {
    const rules = table.writeback_rules
      .map((rule) => `<li>${escapeHtml(rule)}</li>`)
      .join("");

    sections.push(`<div><strong>Notes</strong><ul>${rules}</ul></div>`);
  }

  return sections.length
    ? `<div><strong>${escapeHtml(name)}</strong>${sections.join("")}</div>`
    : "";
}

function buildCompletionDocHtml(
  payload: LuaApiHelperPayload,
  entry: LuaApiHelperCompletionEntry | LuaApiHelperSnippetEntry,
  title: string,
  body: string,
  meta: string
) {
  const tableDocHtml = buildTableDocHtml(title, payload.tables?.[title]);

  return [
    `<div>`,
    `<strong>${escapeHtml(title)}</strong>`,
    meta ? `<div>${escapeHtml(meta)}</div>` : "",
    body ? `<p>${escapeHtml(body)}</p>` : "",
    tableDocHtml,
    `</div>`
  ].join("");
}

function createTopLevelCompletion(
  payload: LuaApiHelperPayload,
  entry: LuaApiHelperCompletionEntry
): Ace.Completion | null {
  if (!entry.value) {
    return null;
  }

  const title = entry.caption ?? entry.value;
  const meta = entry.meta ?? entry.type ?? "lua";
  const body = entry.docText ?? "";

  return {
    caption: title,
    completerId: LUA_API_COMPLETER_ID,
    docHTML: buildCompletionDocHtml(payload, entry, title, body, meta),
    docText: body,
    meta,
    score: entry.score ?? 1000,
    value: entry.value
  };
}

function createMemberCompletion(
  payload: LuaApiHelperPayload,
  entry: LuaApiHelperCompletionEntry,
  memberName: string
): Ace.Completion | null {
  const meta = entry.meta ?? entry.type ?? "lua";
  const body = entry.docText ?? "";

  return {
    caption: entry.caption ?? entry.value ?? memberName,
    completerId: LUA_API_COMPLETER_ID,
    docHTML: buildCompletionDocHtml(payload, entry, entry.value ?? memberName, body, meta),
    docText: body,
    meta,
    score: entry.score ?? 1000,
    value: memberName
  };
}

function createSnippetCompletion(
  payload: LuaApiHelperPayload,
  entry: LuaApiHelperSnippetEntry
): Ace.Completion | null {
  if (!entry.content || !entry.tabTrigger) {
    return null;
  }

  const title = entry.tabTrigger;
  const meta = entry.meta ?? "snippet";
  const body = entry.name ?? "Lua snippet";

  return {
    caption: title,
    completerId: LUA_API_COMPLETER_ID,
    docHTML: [
      `<div>`,
      `<strong>${escapeHtml(title)}</strong>`,
      `<div>${escapeHtml(meta)}</div>`,
      `<p>${escapeHtml(body)}</p>`,
      `<pre>${escapeHtml(entry.content)}</pre>`,
      `</div>`
    ].join(""),
    docText: entry.content,
    meta,
    score: 1400,
    snippet: entry.content
  };
}

function createLuaApiCompleter(payload: LuaApiHelperPayload): Ace.Completer {
  const topLevelCompletions = (payload.completions ?? [])
    .map((entry) => createTopLevelCompletion(payload, entry))
    .filter((entry): entry is Ace.Completion => entry !== null);
  const snippetCompletions = (payload.snippets ?? [])
    .map((entry) => createSnippetCompletion(payload, entry))
    .filter((entry): entry is Ace.Completion => entry !== null);

  return {
    getCompletions(editor, session, pos, prefix, callback) {
      const linePrefix = session.getLine(pos.row).slice(0, pos.column);
      const memberMatch = linePrefix.match(/([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z0-9_]*)$/);

      if (memberMatch) {
        const tableName = memberMatch[1];
        const memberCompletions = (payload.completions ?? [])
          .filter((entry) => typeof entry.value === "string" && entry.value.startsWith(`${tableName}.`))
          .map((entry) => createMemberCompletion(payload, entry, entry.value!.slice(tableName.length + 1)))
          .filter((entry): entry is Ace.Completion => entry !== null);

        callback(null, memberCompletions);
        return;
      }

      callback(null, [...topLevelCompletions, ...snippetCompletions]);
    }
  };
}

async function loadLuaApiHelperSupport() {
  if (luaApiHelperCachedResult) {
    return luaApiHelperCachedResult;
  }

  if (!luaApiHelperPromise) {
    luaApiHelperPromise = fetch(LUA_API_HELPER_URL, {
      cache: "default"
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Could not load Lua API helper (${response.status}).`);
        }

        const payload = (await response.json()) as LuaApiHelperPayload;

        if (!Array.isArray(payload.completions) || !Array.isArray(payload.snippets)) {
          throw new Error("Lua API helper payload is invalid.");
        }

        return {
          completer: createLuaApiCompleter(payload),
          status: "ready"
        } satisfies LuaApiHelperLoadResult;
      })
      .catch(() => ({
        status: "error"
      } satisfies LuaApiHelperLoadResult));
  }

  const result = await luaApiHelperPromise;
  luaApiHelperCachedResult = result;
  return result;
}

function createDefaultCompleters() {
  return [
    languageTools.snippetCompleter,
    languageTools.keyWordCompleter,
    languageTools.textCompleter
  ];
}

function createEditorCompleters(customCompleter: Ace.Completer | null) {
  return customCompleter ? [customCompleter, ...createDefaultCompleters()] : createDefaultCompleters();
}

export function useLuaAceSupport() {
  const editorRef = useRef<Ace.Editor | null>(null);
  const [helperStatus, setHelperStatus] = useState<"loading" | "ready" | "error">(
    luaApiHelperCachedResult?.status ?? "loading"
  );

  const applyCompleters = useCallback((customCompleter: Ace.Completer | null) => {
    if (!editorRef.current) {
      return;
    }

    editorRef.current.completers = createEditorCompleters(customCompleter);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadLuaApiHelperSupport().then((result) => {
      if (cancelled) {
        return;
      }

      setHelperStatus(result.status);
      applyCompleters(result.status === "ready" ? result.completer : null);
    });

    return () => {
      cancelled = true;
    };
  }, [applyCompleters]);

  const handleEditorLoad = useCallback((editor: Ace.Editor) => {
    editorRef.current = editor;

    if (!luaApiHelperCachedResult) {
      applyCompleters(null);
      return;
    }

    applyCompleters(luaApiHelperCachedResult.status === "ready" ? luaApiHelperCachedResult.completer : null);
  }, [applyCompleters]);

  return {
    enableBasicAutocompletion: true,
    enableLiveAutocompletion: true,
    enableSnippets: true,
    handleEditorLoad,
    helperStatus,
    helperWarning: helperStatus === "error" ? "Type information unable to load" : ""
  };
}
