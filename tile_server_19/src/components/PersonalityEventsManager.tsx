"use client";

import { useEffect, useMemo, useState } from "react";
import AceEditor from "react-ace";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/mode-lua";
import "ace-builds/src-noconflict/mode-text";
import "ace-builds/src-noconflict/theme-tomorrow_night";

import { useStudio } from "../app/StudioContext";
import type { PersonalityEventRecord } from "../types";
import { actionButtonClass } from "./buttonStyles";
import { Panel } from "./Panel";
import { SectionEyebrow } from "./SectionEyebrow";
import {
  assetListEyebrowClass,
  assetListMetaClass,
  assetListRowClass,
  assetListTitleClass,
  compactTextInputClass,
  emptyStateCardClass,
  secondaryButtonClass,
  statusChipClass,
  textInputClass
} from "./uiStyles";

const CREATE_PERSONALITY_EVENT_PATH = "/__personalities/events/create";
const LIST_PERSONALITY_EVENTS_PATH = "/__personalities/events/list";
const UPDATE_PERSONALITY_EVENT_PATH = "/__personalities/events/update";

interface EventDraftState {
  enabled: boolean;
  eventDetails: string;
  luaScript: string;
  name: string;
  responseContext: string;
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
  const [events, setEvents] = useState<PersonalityEventRecord[]>([]);
  const [activeEventId, setActiveEventId] = useState("");
  const [draft, setDraft] = useState<EventDraftState>(() => createEventDraft(null));
  const [isCreatingEvent, setCreatingEvent] = useState(false);
  const [isLoadingEvents, setLoadingEvents] = useState(false);
  const [isSavingEvent, setSavingEvent] = useState(false);
  const [status, setStatus] = useState("");

  const activeEvent = useMemo(
    () => events.find((event) => event.id === activeEventId) ?? null,
    [activeEventId, events]
  );

  useEffect(() => {
    setDraft(createEventDraft(activeEvent));
  }, [activeEvent?.id]);

  useEffect(() => {
    if (!activePersonalitySlug) {
      setEvents([]);
      setActiveEventId("");
      setDraft(createEventDraft(null));
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
                {isCreatingEvent ? "Adding..." : "Add Event"}
              </button>
            }
            className="h-full"
            description={
              activePersonality
                ? `Events for ${activePersonality.name}`
                : "Select a personality before editing events."
            }
            title="Personality Events"
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

            {isLoadingEvents ? <div className="text-sm theme-text-muted">Loading events...</div> : null}
            {!isLoadingEvents && activePersonality && !events.length ? (
              <div className={emptyStateCardClass}>No events yet.</div>
            ) : null}
          </Panel>
        </div>

        <Panel
          className="xl:h-[calc(100vh-7rem)]"
          description={
            activeEvent
              ? `${activeEvent.name}, ${activeEvent.event_type}`
              : "Select or add an event for this personality."
          }
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3">
              {status ? (
                <div className={status === "Event saved." ? "text-sm theme-text-muted" : "text-sm text-[#b42318]"}>
                  {status}
                </div>
              ) : (
                <div />
              )}
              <button
                className={actionButtonClass}
                disabled={!activeEvent || isSavingEvent}
                onClick={handleSaveEvent}
                type="button"
              >
                {isSavingEvent ? "Saving..." : "Save Event"}
              </button>
            </div>
          }
          title={activeEvent ? activeEvent.name : "Event Editor"}
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
                        setDraft((currentDraft) => ({
                          ...currentDraft,
                          name: event.currentTarget.value
                        }));
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
                      }}
                      type="checkbox"
                    />
                    Enabled
                  </label>
                </div>

                <div className="grid gap-3">
                  <SectionEyebrow>Tool Definition</SectionEyebrow>
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
                        useSoftTabs: true
                      }}
                      theme="tomorrow_night"
                      value={draft.eventDetails}
                      width="100%"
                    />
                  </div>
                </div>

                <div className="grid gap-3">
                  <SectionEyebrow>Response Context</SectionEyebrow>
                  <div className="overflow-hidden border theme-border-panel">
                    <AceEditor
                      className="w-full"
                      fontSize={13}
                      height="120px"
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
                  <SectionEyebrow>Lua Script</SectionEyebrow>
                  <div className="overflow-hidden border theme-border-panel">
                    <AceEditor
                      className="w-full"
                      fontSize={13}
                      height="320px"
                      mode="lua"
                      name={`personality-event-lua-${activeEvent.id}`}
                      onChange={(value) => {
                        setDraft((currentDraft) => ({
                          ...currentDraft,
                          luaScript: value
                        }));
                        if (status) {
                          setStatus("");
                        }
                      }}
                      setOptions={{
                        showFoldWidgets: false,
                        tabSize: 2,
                        useSoftTabs: true
                      }}
                      theme="tomorrow_night"
                      value={draft.luaScript}
                      width="100%"
                      wrapEnabled
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[20rem] items-center justify-center text-sm theme-text-muted">
              Select an event to edit.
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
