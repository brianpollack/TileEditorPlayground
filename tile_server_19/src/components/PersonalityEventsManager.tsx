"use client";

import { faChevronLeft } from "@awesome.me/kit-a62459359b/icons/classic/solid";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Ace } from "ace-builds";
import AceEditor from "react-ace";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/mode-lua";
import "ace-builds/src-noconflict/mode-text";
import "ace-builds/src-noconflict/theme-tomorrow_night";

import { fixLuaScriptWithAiAction } from "../actions/luaActions";
import { useStudio } from "../app/StudioContext";
import {
  CREATE_PERSONALITY_EVENT_PATH,
  LIST_PERSONALITY_EVENTS_PATH,
  UPDATE_PERSONALITY_EVENT_PATH
} from "../lib/apiRoutes";
import { useLuaAceSupport } from "../lib/luaApiHelper";
import {
  createLuaErrorAnnotations,
  formatLuaScript,
  openLuaScriptingGuide,
  validateLuaScript
} from "../lib/luaEditor";
import type { PersonalityEventRecord } from "../types";
import { AiLuaDiffReview } from "./AiLuaDiffReview";
import { actionButtonClass } from "./buttonStyles";
import { FontAwesomeIcon } from "./FontAwesomeIcon";
import { Panel } from "./Panel";
import { SectionEyebrow } from "./SectionEyebrow";
import {
  assetListEyebrowClass,
  assetListMetaClass,
  assetListRowClass,
  assetListTitleClass,
  compactTextInputClass,
  emptyStateCardClass,
  modalBackdropClass,
  modalSurfaceClass,
  secondaryButtonClass,
  statusChipClass,
  textInputClass
} from "./uiStyles";

interface EventDraftState {
  enabled: boolean;
  eventDetails: string;
  luaScript: string;
  name: string;
  responseContext: string;
}

interface AiLuaReviewState {
  originalLua: string;
  revisedLua: string;
}

function createEventDraft(event: PersonalityEventRecord | null): EventDraftState {
  return {
    enabled: event?.enabled ?? true,
    eventDetails: JSON.stringify(event?.event_details ?? {}, null, 2),
    luaScript: event?.lua_script ?? "",
    name: event?.name ?? "",
    responseContext: event?.response_context ?? ""
  };
}

function parseEventDetails(value: string) {
  const parsedValue = JSON.parse(value) as unknown;

  if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
    throw new Error("Event details must be a JSON object.");
  }

  return parsedValue as Record<string, unknown>;
}

export function PersonalityEventsManager() {
  const { activePersonality, activePersonalitySlug } = useStudio();
  const {
    enableBasicAutocompletion,
    enableLiveAutocompletion,
    enableSnippets,
    handleEditorLoad,
    helperWarning
  } = useLuaAceSupport();
  const [events, setEvents] = useState<PersonalityEventRecord[]>([]);
  const [activeEventId, setActiveEventId] = useState("");
  const [draft, setDraft] = useState<EventDraftState>(() => createEventDraft(null));
  const [isCreatingEvent, setCreatingEvent] = useState(false);
  const [isLoadingEvents, setLoadingEvents] = useState(false);
  const [isSavingEvent, setSavingEvent] = useState(false);
  const [isFormattingLua, setFormattingLua] = useState(false);
  const [isFormattingToolJson, setFormattingToolJson] = useState(false);
  const [isAiLuaFixing, setAiLuaFixing] = useState(false);
  const [aiLuaReview, setAiLuaReview] = useState<AiLuaReviewState | null>(null);
  const [isAiLuaPromptOpen, setAiLuaPromptOpen] = useState(false);
  const [aiLuaUserDescription, setAiLuaUserDescription] = useState("");
  const aiLuaPromptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [luaAnnotations, setLuaAnnotations] = useState<Ace.Annotation[]>([]);
  const [status, setStatus] = useState("");

  const activeEvent = useMemo(
    () => events.find((event) => event.id === activeEventId) ?? null,
    [activeEventId, events]
  );

  useEffect(() => {
    setDraft(createEventDraft(activeEvent));
    setLuaAnnotations([]);
  }, [activeEvent?.id]);

  useEffect(() => {
    if (!activePersonalitySlug) {
      setEvents([]);
      setActiveEventId("");
      setDraft(createEventDraft(null));
      setLuaAnnotations([]);
      setStatus("");
      return;
    }

    setLoadingEvents(true);
    setStatus("");

    void (async () => {
      try {
        const response = await fetch(LIST_PERSONALITY_EVENTS_PATH, {
          body: JSON.stringify({
            character_slug: activePersonalitySlug
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const responseBody = (await response.json()) as Partial<{
          error: string;
          events: PersonalityEventRecord[];
        }>;

        if (!response.ok || responseBody.error || !Array.isArray(responseBody.events)) {
          throw new Error(responseBody.error ?? "Could not load personality events.");
        }

        setEvents(responseBody.events);
        setActiveEventId((currentEventId) =>
          responseBody.events?.some((event) => event.id === currentEventId)
            ? currentEventId
            : responseBody.events?.[0]?.id ?? ""
        );
      } catch (error) {
        setEvents([]);
        setActiveEventId("");
        setLuaAnnotations([]);
        setStatus(error instanceof Error ? error.message : "Could not load personality events.");
      } finally {
        setLoadingEvents(false);
      }
    })();
  }, [activePersonalitySlug]);

  function handleCreateEvent() {
    if (!activePersonality || isCreatingEvent) {
      return;
    }

    setCreatingEvent(true);
    setStatus("");

    void (async () => {
      try {
        const response = await fetch(CREATE_PERSONALITY_EVENT_PATH, {
          body: JSON.stringify({
            character_slug: activePersonality.character_slug
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const responseBody = (await response.json()) as Partial<PersonalityEventRecord & { error: string }>;

        if (!response.ok || responseBody.error || typeof responseBody.id !== "string") {
          throw new Error(responseBody.error ?? "Could not create personality event.");
        }

        const createdEvent = responseBody as PersonalityEventRecord;
        setEvents((currentEvents) =>
          [...currentEvents, createdEvent].sort((left, right) => left.name.localeCompare(right.name))
        );
        setActiveEventId(createdEvent.id);
        setStatus("");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not create personality event.");
      } finally {
        setCreatingEvent(false);
      }
    })();
  }

  function handleSaveEvent() {
    if (!activePersonality || !activeEvent || isSavingEvent) {
      return;
    }

    const normalizedName = draft.name.trim();

    if (!normalizedName) {
      setStatus("Event name is required.");
      return;
    }

    let eventDetails: Record<string, unknown>;

    try {
      eventDetails = parseEventDetails(draft.eventDetails);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Event details must be valid JSON.");
      return;
    }

    const validationResult = validateLuaScript(draft.luaScript);

    if (!validationResult.ok) {
      setLuaAnnotations(createLuaErrorAnnotations(validationResult));
      setStatus(validationResult.error.message);
      return;
    }

    setLuaAnnotations([]);
    setSavingEvent(true);
    setStatus("");

    void (async () => {
      try {
        const response = await fetch(UPDATE_PERSONALITY_EVENT_PATH, {
          body: JSON.stringify({
            character_slug: activePersonality.character_slug,
            enabled: draft.enabled,
            event_details: eventDetails,
            event_type: "tool",
            id: activeEvent.id,
            lua_script: draft.luaScript,
            name: normalizedName,
            response_context: draft.responseContext
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const responseBody = (await response.json()) as Partial<PersonalityEventRecord & { error: string }>;

        if (!response.ok || responseBody.error || typeof responseBody.id !== "string") {
          throw new Error(responseBody.error ?? "Could not save personality event.");
        }

        const updatedEvent = responseBody as PersonalityEventRecord;
        setEvents((currentEvents) =>
          currentEvents
            .map((event) => (event.id === updatedEvent.id ? updatedEvent : event))
            .sort((left, right) => left.name.localeCompare(right.name))
        );
        setDraft(createEventDraft(updatedEvent));
        setStatus("Event saved.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not save personality event.");
      } finally {
        setSavingEvent(false);
      }
    })();
  }

  function handleFormatLua() {
    const validationResult = validateLuaScript(draft.luaScript);

    if (!validationResult.ok) {
      setLuaAnnotations(createLuaErrorAnnotations(validationResult));
      setStatus(validationResult.error.message);
      return;
    }

    setFormattingLua(true);
    setLuaAnnotations([]);
    setStatus("");

    void formatLuaScript(draft.luaScript)
      .then((formattedScript) => {
        setDraft((currentDraft) => ({
          ...currentDraft,
          luaScript: formattedScript
        }));
        setStatus("Lua formatted.");
      })
      .catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : "Could not format Lua script.");
      })
      .finally(() => {
        setFormattingLua(false);
      });
  }

  function handleFormatToolJson() {
    setFormattingToolJson(true);
    setStatus("");

    try {
      const eventDetails = parseEventDetails(draft.eventDetails);

      setDraft((currentDraft) => ({
        ...currentDraft,
        eventDetails: JSON.stringify(eventDetails, null, 2)
      }));
      setStatus("Tool JSON formatted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Tool definition must be valid JSON.");
    } finally {
      setFormattingToolJson(false);
    }
  }

  function handleAiLuaFix() {
    if (!activeEvent || isAiLuaFixing) {
      return;
    }

    setAiLuaUserDescription("");
    setAiLuaPromptOpen(true);
  }

  function submitAiLuaFix() {
    if (!activeEvent || isAiLuaFixing) {
      return;
    }

    let eventDetails: Record<string, unknown>;

    try {
      eventDetails = parseEventDetails(draft.eventDetails);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Tool definition must be valid JSON.");
      return;
    }

    setAiLuaPromptOpen(false);
    setAiLuaFixing(true);
    setLuaAnnotations([]);
    setStatus("");

    void fixLuaScriptWithAiAction({
      luaScript: draft.luaScript,
      toolDefinition: eventDetails,
      userDescription: aiLuaUserDescription
    })
      .then((result) => {
        setAiLuaReview({
          originalLua: draft.luaScript,
          revisedLua: result.luaScript
        });
        setStatus("Review AI Lua changes.");
      })
      .catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : "Could not fix Lua with AI.");
      })
      .finally(() => {
        setAiLuaFixing(false);
      });
  }

  function handleKeepAiLuaChanges() {
    if (!aiLuaReview) {
      return;
    }

    const validationResult = validateLuaScript(aiLuaReview.revisedLua);

    setDraft((currentDraft) => ({
      ...currentDraft,
      luaScript: aiLuaReview.revisedLua
    }));
    setLuaAnnotations(createLuaErrorAnnotations(validationResult));
    setStatus(validationResult.ok ? "AI Lua updated." : validationResult.error.message);
    setAiLuaReview(null);
  }

  function handleDeclineAiLuaChanges() {
    setAiLuaReview(null);
    setStatus("AI Lua changes declined.");
  }

  function copyToolEditorText(label: string, value: string) {
    if (!navigator.clipboard?.writeText) {
      setStatus("Clipboard is not available in this browser.");
      return;
    }

    void navigator.clipboard
      .writeText(value)
      .then(() => {
        setStatus(`${label} copied.`);
      })
      .catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : `Could not copy ${label}.`);
      });
  }

  return (
    <div className="min-h-0">
      <div className="grid min-h-0 gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="min-h-0 xl:h-[calc(100vh-7rem)]">
          <Panel
            actions={
              <button
                className={actionButtonClass}
                disabled={!activePersonality || isCreatingEvent}
                onClick={handleCreateEvent}
                type="button"
              >
                {isCreatingEvent ? "Adding..." : "Add Tool"}
              </button>
            }
            className="h-full"
            description={
              activePersonality
                ? `LLM chat tools for ${activePersonality.name}`
                : "Select a personality before editing LLM chat tools."
            }
            title="LLM Chat Tools"
          >
            <div className="flex flex-wrap gap-2">
              <button
                className={`${secondaryButtonClass} inline-flex items-center gap-2`}
                onClick={() => {
                  window.location.hash = "#/personalities";
                }}
                type="button"
              >
                <FontAwesomeIcon className="h-3.5 w-3.5" icon={faChevronLeft} />
                <span>Back to Personality</span>
              </button>
              {activePersonality ? <div className={statusChipClass}>{activePersonality.character_slug}</div> : null}
            </div>

            <div className="asset-list asset-list--scroll">
              {events.map((event) => (
                <button
                  className={assetListRowClass(event.id === activeEventId)}
                  key={event.id}
                  onClick={() => {
                    setActiveEventId(event.id);
                    setStatus("");
                  }}
                  type="button"
                >
                  <div className={assetListMetaClass}>
                    <strong className={assetListTitleClass}>{event.name}</strong>
                    <span className={assetListEyebrowClass}>
                      {event.event_type} {event.enabled ? "enabled" : "disabled"}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {isLoadingEvents ? <div className="text-sm theme-text-muted">Loading LLM chat tools...</div> : null}
            {!isLoadingEvents && activePersonality && !events.length ? (
              <div className={emptyStateCardClass}>No LLM chat tools yet.</div>
            ) : null}
          </Panel>
        </div>

        <Panel
          className="xl:h-[calc(100vh-7rem)]"
          description={
            activeEvent
              ? `${activeEvent.name}, ${activeEvent.event_type}`
              : "Select or add an LLM chat tool for this personality."
          }
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3">
              {status ? (
                <div
                  className={
                    status === "Event saved." ||
                    status === "Lua formatted." ||
                    status === "AI Lua updated." ||
                    status === "Tool JSON formatted." ||
                    status === "Review AI Lua changes." ||
                    status === "AI Lua changes declined." ||
                    status === "Tool Definition copied." ||
                    status === "Lua Script copied."
                      ? "text-sm theme-text-muted"
                      : "text-sm text-[#b42318]"
                  }
                >
                  {status}
                </div>
              ) : (
                <div />
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  className={secondaryButtonClass}
                  onClick={openLuaScriptingGuide}
                  type="button"
                >
                  Scripting Guide
                </button>
                <button
                  className={secondaryButtonClass}
                  disabled={!activeEvent || isSavingEvent || isFormattingToolJson || isAiLuaFixing}
                  onClick={handleFormatToolJson}
                  type="button"
                >
                  {isFormattingToolJson ? "Formatting..." : "Format Tool JSON"}
                </button>
                <button
                  className={secondaryButtonClass}
                  disabled={!activeEvent || isSavingEvent || isFormattingLua || isAiLuaFixing}
                  onClick={handleFormatLua}
                  type="button"
                >
                  {isFormattingLua ? "Formatting..." : "Format Lua"}
                </button>
                <button
                  className={secondaryButtonClass}
                  disabled={!activeEvent || isSavingEvent || isFormattingLua || isFormattingToolJson || isAiLuaFixing}
                  onClick={handleAiLuaFix}
                  type="button"
                >
                  {isAiLuaFixing ? "AI Lua..." : "AI Lua"}
                </button>
                <button
                  className={actionButtonClass}
                  disabled={!activeEvent || isSavingEvent || isFormattingLua || isFormattingToolJson || isAiLuaFixing}
                  onClick={handleSaveEvent}
                  type="button"
                >
                  {isSavingEvent ? "Saving..." : "Save Tool"}
                </button>
              </div>
            </div>
          }
          title={activeEvent ? activeEvent.name : "LLM Chat Tool Editor"}
        >
          {activeEvent ? (
            <div className="min-h-0 overflow-y-auto pr-1">
              <div className="grid gap-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_10rem]">
                  <label className="grid gap-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] theme-text-muted">
                      Name
                    </span>
                    <input
                      className={`${textInputClass} !min-w-0 w-full max-w-full`}
                      onChange={(event) => {
                        const nextName = event.currentTarget.value;

                        setDraft((currentDraft) => ({
                          ...currentDraft,
                          name: nextName
                        }));
                        setLuaAnnotations([]);
                        if (status) {
                          setStatus("");
                        }
                      }}
                      value={draft.name}
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] theme-text-muted">
                      Type
                    </span>
                    <input className={`${compactTextInputClass} w-full`} readOnly value="tool" />
                  </label>

                  <label className="flex items-end gap-2 pb-3 text-sm theme-text-muted">
                    <input
                      checked={draft.enabled}
                      onChange={(event) => {
                        setDraft((currentDraft) => ({
                          ...currentDraft,
                          enabled: event.currentTarget.checked
                        }));
                        setLuaAnnotations([]);
                      }}
                      type="checkbox"
                    />
                    Enabled
                  </label>
                </div>

                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <SectionEyebrow>Tool Definition</SectionEyebrow>
                    <button
                      className={secondaryButtonClass}
                      onClick={() => {
                        copyToolEditorText("Tool Definition", draft.eventDetails);
                      }}
                      type="button"
                    >
                      Copy to Clipboard
                    </button>
                  </div>
                  <div className="overflow-hidden border theme-border-panel">
                    <AceEditor
                      className="w-full"
                      fontSize={13}
                      height="300px"
                      mode="json"
                      name={`personality-event-details-${activeEvent.id}`}
                      onChange={(value) => {
                        setDraft((currentDraft) => ({
                          ...currentDraft,
                          eventDetails: value
                        }));
                        if (status) {
                          setStatus("");
                        }
                      }}
                      setOptions={{
                        showFoldWidgets: false,
                        tabSize: 2,
                        useWorker: false,
                        useSoftTabs: true
                      }}
                      theme="tomorrow_night"
                      value={draft.eventDetails}
                      width="100%"
                    />
                  </div>
                </div>

                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <SectionEyebrow>Response Context</SectionEyebrow>
                    <button
                      className={secondaryButtonClass}
                      onClick={() => {
                        copyToolEditorText("Response Context", draft.responseContext);
                      }}
                      type="button"
                    >
                      Copy to Clipboard
                    </button>
                  </div>
                  <div className="overflow-hidden border theme-border-panel">
                    <AceEditor
                      className="w-full"
                      fontSize={13}
                      height="220px"
                      mode="text"
                      name={`personality-event-response-context-${activeEvent.id}`}
                      onChange={(value) => {
                        setDraft((currentDraft) => ({
                          ...currentDraft,
                          responseContext: value
                        }));
                        if (status) {
                          setStatus("");
                        }
                      }}
                      setOptions={{
                        showFoldWidgets: false,
                        tabSize: 2,
                        useWorker: false,
                        useSoftTabs: true
                      }}
                      theme="tomorrow_night"
                      value={draft.responseContext}
                      width="100%"
                      wrapEnabled
                    />
                  </div>
                </div>

                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <SectionEyebrow>Lua Script</SectionEyebrow>
                    <button
                      className={secondaryButtonClass}
                      onClick={() => {
                        copyToolEditorText("Lua Script", draft.luaScript);
                      }}
                      type="button"
                    >
                      Copy to Clipboard
                    </button>
                  </div>
                  <div className="overflow-hidden border theme-border-panel">
                    <AceEditor
                      className="w-full"
                      enableBasicAutocompletion={enableBasicAutocompletion}
                      enableLiveAutocompletion={enableLiveAutocompletion}
                      enableSnippets={enableSnippets}
                      fontSize={13}
                      height="640px"
                      mode="lua"
                      name={`personality-event-lua-${activeEvent.id}`}
                      onChange={(value) => {
                        setDraft((currentDraft) => ({
                          ...currentDraft,
                          luaScript: value
                        }));
                        setLuaAnnotations([]);
                        if (status) {
                          setStatus("");
                        }
                      }}
                      annotations={luaAnnotations}
                      onLoad={handleEditorLoad}
                      setOptions={{
                        showFoldWidgets: false,
                        tabSize: 2,
                        useWorker: false,
                        useSoftTabs: true
                      }}
                      theme="tomorrow_night"
                      value={draft.luaScript}
                      width="100%"
                      wrapEnabled
                    />
                  </div>
                  {helperWarning ? <div className="text-sm text-[#b42318]">{helperWarning}</div> : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[20rem] items-center justify-center text-sm theme-text-muted">
              Select an LLM chat tool to edit.
            </div>
          )}
        </Panel>
      </div>
      {isAiLuaPromptOpen ? (
        <div className={modalBackdropClass}>
          <div className={`${modalSurfaceClass} max-w-lg p-5`}>
            <div className="grid gap-4">
              <strong className="font-serif text-[1.45rem] theme-text-primary">AI Lua</strong>
              <textarea
                className="min-h-[8rem] w-full border theme-border-panel theme-bg-input p-3 text-sm theme-text-primary outline-none transition theme-focus-border-accent"
                onChange={(event) => {
                  setAiLuaUserDescription(event.currentTarget.value);
                }}
                placeholder="Describe what you want the AI to do..."
                ref={aiLuaPromptTextareaRef}
                value={aiLuaUserDescription}
              />
              <div className="flex justify-end gap-3">
                <button
                  className={secondaryButtonClass}
                  onClick={() => { setAiLuaPromptOpen(false); }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={actionButtonClass}
                  onClick={submitAiLuaFix}
                  type="button"
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {aiLuaReview ? (
        <AiLuaDiffReview
          onDecline={handleDeclineAiLuaChanges}
          onKeep={handleKeepAiLuaChanges}
          originalLua={aiLuaReview.originalLua}
          revisedLua={aiLuaReview.revisedLua}
        />
      ) : null}
    </div>
  );
}
