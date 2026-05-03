"use client";

import { useEffect, useMemo, useState } from "react";
import type { Ace } from "ace-builds";

import {
  createLuaErrorAnnotations,
  formatLuaScript,
  validateLuaScript
} from "../lib/luaEditor";
import {
  createLuaEventDraft,
  mergeLuaEventOptions,
  sortLuaEvents,
  type LuaEventDraftState,
  type LuaEventOption
} from "../lib/luaEventHelpers";
import type { LuaEventDefinition } from "../lib/luaApiHelper";

type LuaStoredEvent = {
  enabled: boolean;
  id: string;
  lua_script: string;
};

export function useLuaEventEditor<TEvent extends LuaStoredEvent>(input: {
  createEvent(eventName: string): Promise<TEvent>;
  eventDefinitions: LuaEventDefinition[];
  getEventName(event: TEvent): string;
  loadErrorMessage: string;
  readEvents(): Promise<TEvent[]>;
  saveErrorMessage: string;
  saveEvent(event: TEvent, eventName: string, draft: LuaEventDraftState): Promise<TEvent>;
  subjectKey: string;
}) {
  const [events, setEvents] = useState<TEvent[]>([]);
  const [activeEventName, setActiveEventName] = useState("");
  const [draft, setDraft] = useState<LuaEventDraftState>(() => createLuaEventDraft(null));
  const [isLoadingEvents, setLoadingEvents] = useState(false);
  const [isSavingEvent, setSavingEvent] = useState(false);
  const [isFormattingLua, setFormattingLua] = useState(false);
  const [luaAnnotations, setLuaAnnotations] = useState<Ace.Annotation[]>([]);
  const [status, setStatus] = useState("");

  const eventOptions = useMemo<LuaEventOption<TEvent>[]>(
    () => mergeLuaEventOptions(input.eventDefinitions, events, input.getEventName),
    [events, input.eventDefinitions, input.getEventName]
  );
  const activeEventOption = useMemo(
    () => eventOptions.find((eventOption) => eventOption.eventName === activeEventName) ?? null,
    [activeEventName, eventOptions]
  );
  const activeEvent = activeEventOption?.record ?? null;

  useEffect(() => {
    setDraft(createLuaEventDraft(activeEvent));
    setLuaAnnotations([]);
  }, [activeEvent?.id, activeEventOption?.eventName]);

  useEffect(() => {
    setActiveEventName((currentEventName) =>
      eventOptions.some((eventOption) => eventOption.eventName === currentEventName)
        ? currentEventName
        : eventOptions[0]?.eventName ?? ""
    );
  }, [eventOptions]);

  useEffect(() => {
    if (!input.subjectKey) {
      setEvents([]);
      setActiveEventName("");
      setDraft(createLuaEventDraft(null));
      setLuaAnnotations([]);
      setStatus("");
      return;
    }

    setLoadingEvents(true);
    setStatus("");

    void input.readEvents()
      .then((nextEvents) => {
        setEvents(sortLuaEvents(nextEvents, input.getEventName));
      })
      .catch((error: unknown) => {
        setEvents([]);
        setActiveEventName("");
        setDraft(createLuaEventDraft(null));
        setLuaAnnotations([]);
        setStatus(error instanceof Error ? error.message : input.loadErrorMessage);
      })
      .finally(() => {
        setLoadingEvents(false);
      });
  }, [input.getEventName, input.loadErrorMessage, input.readEvents, input.subjectKey]);

  function handleSaveEvent() {
    if (!input.subjectKey || !activeEventOption || isSavingEvent) {
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
        const createdOrExistingEvent = activeEvent ?? (await input.createEvent(activeEventOption.eventName));
        const savedEvent =
          createdOrExistingEvent.enabled === draft.enabled &&
          createdOrExistingEvent.lua_script === draft.luaScript
            ? createdOrExistingEvent
            : await input.saveEvent(createdOrExistingEvent, activeEventOption.eventName, draft);

        setEvents((currentEvents) =>
          sortLuaEvents(
            [
              ...currentEvents.filter((eventRecord) => eventRecord.id !== savedEvent.id),
              savedEvent
            ],
            input.getEventName
          )
        );
        setDraft(createLuaEventDraft(savedEvent));
        setStatus("Event saved.");
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : input.saveErrorMessage);
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

  return {
    activeEvent,
    activeEventName,
    activeEventOption,
    draft,
    eventOptions,
    handleFormatLua,
    handleSaveEvent,
    isFormattingLua,
    isLoadingEvents,
    isSavingEvent,
    luaAnnotations,
    setActiveEventName,
    setDraft,
    setLuaAnnotations,
    setStatus,
    status
  };
}
