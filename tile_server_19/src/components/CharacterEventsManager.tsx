"use client";

import { useEffect, useMemo, useState } from "react";
import type { Ace } from "ace-builds";
import AceEditor from "react-ace";
import "ace-builds/src-noconflict/mode-lua";
import "ace-builds/src-noconflict/theme-tomorrow_night";

import {
  createCharacterEventAction,
  readCharacterEventsAction,
  saveCharacterEventAction
} from "../actions/characterEventActions";
import { useStudio } from "../app/StudioContext";
import {
  createLuaErrorAnnotations,
  formatLuaScript,
  validateLuaScript
} from "../lib/luaEditor";
import { useLuaAceSupport } from "../lib/luaApiHelper";
import type { CharacterEventRecord } from "../types";
import { actionButtonClass } from "./buttonStyles";
import { Panel } from "./Panel";
import { SectionEyebrow } from "./SectionEyebrow";
import {
  assetListMetaClass,
  assetListRowClass,
  assetListSubtitleClass,
  assetListTitleClass,
  compactTextInputClass,
  emptyStateCardClass,
  secondaryButtonClass,
  statusChipClass,
  textInputClass
} from "./uiStyles";

interface CharacterEventDraftState {
  characterEvent: string;
  enabled: boolean;
  luaScript: string;
}

function createCharacterEventDraft(eventRecord: CharacterEventRecord | null): CharacterEventDraftState {
  return {
    characterEvent: eventRecord?.character_event ?? "",
    enabled: eventRecord?.enabled ?? true,
    luaScript: eventRecord?.lua_script ?? ""
  };
}

function sortCharacterEvents(events: CharacterEventRecord[]) {
  return events.slice().sort((left, right) => {
    if (left.enabled !== right.enabled) {
      return left.enabled ? -1 : 1;
    }

    const nameComparison = left.character_event.localeCompare(right.character_event);

    if (nameComparison !== 0) {
      return nameComparison;
    }

    return left.id.localeCompare(right.id, undefined, { numeric: true });
  });
}

export function CharacterEventsManager() {
  const { activePersonality } = useStudio();
  const {
    enableBasicAutocompletion,
    enableLiveAutocompletion,
    enableSnippets,
    handleEditorLoad,
    helperWarning
  } = useLuaAceSupport();
  const [events, setEvents] = useState<CharacterEventRecord[]>([]);
  const [activeEventId, setActiveEventId] = useState("");
  const [draft, setDraft] = useState<CharacterEventDraftState>(() => createCharacterEventDraft(null));
  const [newEventName, setNewEventName] = useState("");
  const [isCreatingEvent, setCreatingEvent] = useState(false);
  const [isLoadingEvents, setLoadingEvents] = useState(false);
  const [isSavingEvent, setSavingEvent] = useState(false);
  const [isFormattingLua, setFormattingLua] = useState(false);
  const [luaAnnotations, setLuaAnnotations] = useState<Ace.Annotation[]>([]);
  const [status, setStatus] = useState("");

  const activeEvent = useMemo(
    () => events.find((eventRecord) => eventRecord.id === activeEventId) ?? null,
    [activeEventId, events]
  );

  useEffect(() => {
    setDraft(createCharacterEventDraft(activeEvent));
    setLuaAnnotations([]);
  }, [activeEvent?.id]);

  useEffect(() => {
    if (!activePersonality?.character_slug) {
      setEvents([]);
      setActiveEventId("");
      setDraft(createCharacterEventDraft(null));
      setNewEventName("");
      setLuaAnnotations([]);
      setStatus("");
      return;
    }

    setLoadingEvents(true);
    setStatus("");

    void readCharacterEventsAction(activePersonality.character_slug)
      .then((nextEvents) => {
        const sortedEvents = sortCharacterEvents(nextEvents);

        setEvents(sortedEvents);
        setActiveEventId((currentEventId) =>
          sortedEvents.some((eventRecord) => eventRecord.id === currentEventId)
            ? currentEventId
            : sortedEvents[0]?.id ?? ""
        );
      })
      .catch((error: unknown) => {
        setEvents([]);
        setActiveEventId("");
        setDraft(createCharacterEventDraft(null));
        setLuaAnnotations([]);
        setStatus(error instanceof Error ? error.message : "Could not load character events.");
      })
      .finally(() => {
        setLoadingEvents(false);
      });
  }, [activePersonality?.character_slug]);

  function handleCreateEvent() {
    if (!activePersonality?.character_slug || isCreatingEvent) {
      return;
    }

    const normalizedEventName = newEventName.trim();

    if (!normalizedEventName) {
      setStatus("Event name is required.");
      return;
    }

    setCreatingEvent(true);
    setStatus("");

    void createCharacterEventAction({
      characterEvent: normalizedEventName,
      characterName: activePersonality.character_slug
    })
      .then((createdEvent) => {
        setEvents((currentEvents) => sortCharacterEvents([...currentEvents, createdEvent]));
        setActiveEventId(createdEvent.id);
        setNewEventName("");
        setStatus("Event created.");
      })
      .catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : "Could not create character event.");
      })
      .finally(() => {
        setCreatingEvent(false);
      });
  }

  function handleSaveEvent() {
    if (!activePersonality?.character_slug || !activeEvent || isSavingEvent) {
      return;
    }

    const normalizedEventName = draft.characterEvent.trim();

    if (!normalizedEventName) {
      setStatus("Event name is required.");
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

    void saveCharacterEventAction({
      characterEvent: normalizedEventName,
      characterName: activePersonality.character_slug,
      enabled: draft.enabled,
      id: activeEvent.id,
      luaScript: draft.luaScript
    })
      .then((updatedEvent) => {
        setEvents((currentEvents) =>
          sortCharacterEvents(
            currentEvents.map((eventRecord) =>
              eventRecord.id === updatedEvent.id ? updatedEvent : eventRecord
            )
          )
        );
        setDraft(createCharacterEventDraft(updatedEvent));
        setStatus("Event saved.");
      })
      .catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : "Could not save character event.");
      })
      .finally(() => {
        setSavingEvent(false);
      });
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

  return (
    <div className="min-h-0">
      <div className="grid min-h-0 gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="min-h-0 xl:h-[calc(100vh-7rem)]">
          <Panel
            className="h-full"
            description={
              activePersonality
                ? `Character events for ${activePersonality.name}`
                : "Select a personality before editing character events."
            }
            title="Character Events"
          >
            <div className="flex flex-wrap gap-2">
              <button
                className={secondaryButtonClass}
                onClick={() => {
                  window.location.hash = "#/personalities";
                }}
                type="button"
              >
                Back to Personality
              </button>
              {activePersonality ? <div className={statusChipClass}>{activePersonality.name}</div> : null}
            </div>

            <div className="grid gap-2">
              <SectionEyebrow>Create Event</SectionEyebrow>
              <div className="flex gap-2">
                <input
                  autoComplete="off"
                  className={`${compactTextInputClass} min-w-0 flex-1`}
                  disabled={!activePersonality || isCreatingEvent}
                  onChange={(event) => {
                    setNewEventName(event.currentTarget.value);
                    if (status) {
                      setStatus("");
                    }
                  }}
                  placeholder="on_player_join"
                  value={newEventName}
                />
                <button
                  className={actionButtonClass}
                  disabled={!activePersonality || !newEventName.trim() || isCreatingEvent}
                  onClick={handleCreateEvent}
                  type="button"
                >
                  {isCreatingEvent ? "Adding..." : "Create"}
                </button>
              </div>
            </div>

            <div className="asset-list asset-list--scroll">
              {events.map((eventRecord) => (
                <button
                  className={assetListRowClass(eventRecord.id === activeEventId)}
                  key={eventRecord.id}
                  onClick={() => {
                    setActiveEventId(eventRecord.id);
                    setStatus("");
                  }}
                  type="button"
                >
                  <div className={assetListMetaClass}>
                    <strong className={assetListTitleClass}>{eventRecord.character_event}</strong>
                    <span className={assetListSubtitleClass}>
                      {eventRecord.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {isLoadingEvents ? <div className="text-sm theme-text-muted">Loading character events...</div> : null}
            {!isLoadingEvents && activePersonality && !events.length ? (
              <div className={emptyStateCardClass}>No character events yet.</div>
            ) : null}
          </Panel>
        </div>

        <Panel
          className="xl:h-[calc(100vh-7rem)]"
          description={
            activeEvent
              ? `${activeEvent.character_name} • ${activeEvent.character_event}`
              : activePersonality
                ? `Select or create a character event for ${activePersonality.name}.`
                : "Select a personality before editing character events."
          }
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3">
              {status ? (
                <div
                  className={
                    status === "Event saved." ||
                    status === "Event created." ||
                    status === "Lua formatted."
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
                  disabled={!activeEvent || isSavingEvent || isFormattingLua}
                  onClick={handleFormatLua}
                  type="button"
                >
                  {isFormattingLua ? "Formatting..." : "Format Lua"}
                </button>
                <button
                  className={actionButtonClass}
                  disabled={!activeEvent || isSavingEvent || isFormattingLua}
                  onClick={handleSaveEvent}
                  type="button"
                >
                  {isSavingEvent ? "Saving..." : "Save Event"}
                </button>
              </div>
            </div>
          }
          title={activeEvent ? activeEvent.character_event : "Character Event Editor"}
        >
          {activeEvent ? (
            <div className="grid min-h-0 gap-4 overflow-y-auto pr-1">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_10rem]">
                <label className="grid gap-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] theme-text-muted">
                    Event Name
                  </span>
                  <input
                    className={`${textInputClass} !min-w-0 w-full max-w-full`}
                    onChange={(event) => {
                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        characterEvent: event.currentTarget.value
                      }));
                      setLuaAnnotations([]);
                      if (status) {
                        setStatus("");
                      }
                    }}
                    value={draft.characterEvent}
                  />
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
                      if (status) {
                        setStatus("");
                      }
                    }}
                    type="checkbox"
                  />
                  Enabled
                </label>
              </div>

              <div className="grid gap-3">
                <SectionEyebrow>Lua Script</SectionEyebrow>
                <div className="overflow-hidden border theme-border-panel">
                  <AceEditor
                    className="w-full"
                    enableBasicAutocompletion={enableBasicAutocompletion}
                    enableLiveAutocompletion={enableLiveAutocompletion}
                    enableSnippets={enableSnippets}
                    fontSize={13}
                    height="640px"
                    mode="lua"
                    name={`character-event-lua-${activeEvent.id}`}
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
          ) : (
            <div className="flex min-h-[20rem] items-center justify-center text-sm theme-text-muted">
              Select a character event to edit.
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
