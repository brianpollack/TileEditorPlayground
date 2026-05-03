"use client";

import { faChevronLeft } from "@awesome.me/kit-a62459359b/icons/classic/solid";
import { useCallback } from "react";
import AceEditor from "react-ace";
import "ace-builds/src-noconflict/mode-lua";
import "ace-builds/src-noconflict/theme-tomorrow_night";

import {
  createCharacterEventAction,
  readCharacterEventsAction,
  saveCharacterEventAction
} from "../actions/characterEventActions";
import { useStudio } from "../app/StudioContext";
import { openLuaScriptingGuide } from "../lib/luaEditor";
import {
  useLuaAceSupport,
  useLuaEventDefinitions
} from "../lib/luaApiHelper";
import type { CharacterEventRecord } from "../types";
import { actionButtonClass } from "./buttonStyles";
import { FontAwesomeIcon } from "./FontAwesomeIcon";
import { LuaEventDefinitionHelp } from "./LuaEventDefinitionHelp";
import { Panel } from "./Panel";
import { SectionEyebrow } from "./SectionEyebrow";
import { useLuaEventEditor } from "./useLuaEventEditor";
import {
  assetListMetaClass,
  assetListRowClass,
  assetListSubtitleClass,
  assetListTitleClass,
  emptyStateCardClass,
  secondaryButtonClass,
  statusChipClass
} from "./uiStyles";

export function CharacterEventsManager() {
  const { activePersonality } = useStudio();
  const {
    enableBasicAutocompletion,
    enableLiveAutocompletion,
    enableSnippets,
    handleEditorLoad,
    helperWarning: aceHelperWarning
  } = useLuaAceSupport();
  const {
    eventDefinitions,
    helperWarning: eventDefinitionWarning
  } = useLuaEventDefinitions("character");
  const characterSlug = activePersonality?.character_slug ?? "";
  const getCharacterEventName = useCallback(
    (eventRecord: CharacterEventRecord) => eventRecord.character_event,
    []
  );
  const readCharacterEvents = useCallback(
    () => readCharacterEventsAction(characterSlug),
    [characterSlug]
  );
  const createCharacterEvent = useCallback(
    (eventName: string) =>
      createCharacterEventAction({
        characterEvent: eventName,
        characterName: characterSlug
      }),
    [characterSlug]
  );
  const saveCharacterEvent = useCallback(
    (eventRecord: CharacterEventRecord, eventName: string, draftState: { enabled: boolean; luaScript: string }) =>
      saveCharacterEventAction({
        characterEvent: eventName,
        characterName: characterSlug,
        enabled: draftState.enabled,
        id: eventRecord.id,
        luaScript: draftState.luaScript
      }),
    [characterSlug]
  );
  const {
    activeEventOption,
    activeEventName,
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
  } = useLuaEventEditor({
    createEvent: createCharacterEvent,
    eventDefinitions,
    getEventName: getCharacterEventName,
    loadErrorMessage: "Could not load character events.",
    readEvents: readCharacterEvents,
    saveErrorMessage: "Could not save character event.",
    saveEvent: saveCharacterEvent,
    subjectKey: characterSlug
  });

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
                className={`${secondaryButtonClass} inline-flex items-center gap-2`}
                onClick={() => {
                  window.location.hash = "#/personalities";
                }}
                type="button"
              >
                <FontAwesomeIcon className="h-3.5 w-3.5" icon={faChevronLeft} />
                <span>Back to Personality</span>
              </button>
              {activePersonality ? <div className={statusChipClass}>{activePersonality.name}</div> : null}
            </div>

            <div className="asset-list asset-list--scroll">
              {eventOptions.map((eventOption) => {
                const isConfigured = Boolean(eventOption.record);
                const displayColor = isConfigured ? "#000000" : "#909090";

                return (
                  <button
                    className={assetListRowClass(eventOption.eventName === activeEventName)}
                    key={eventOption.eventName}
                    onClick={() => {
                      setActiveEventName(eventOption.eventName);
                      setStatus("");
                    }}
                    type="button"
                  >
                    <div className={assetListMetaClass}>
                      <strong className={assetListTitleClass} style={{ color: displayColor }}>
                        {eventOption.eventName}
                      </strong>
                      <span className={assetListSubtitleClass} style={{ color: displayColor }}>
                        {isConfigured ? (eventOption.record?.enabled ? "Configured • Enabled" : "Configured • Disabled") : "Available • Not configured"}
                      </span>
                      <span className={assetListSubtitleClass} style={{ color: displayColor }}>
                        {eventOption.description || "No helper description is available for this event."}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {isLoadingEvents ? <div className="text-sm theme-text-muted">Loading character events...</div> : null}
            {!isLoadingEvents && activePersonality && !eventOptions.length ? (
              <div className={emptyStateCardClass}>No character events are available.</div>
            ) : null}
          </Panel>
        </div>

        <Panel
          className="xl:h-[calc(100vh-7rem)]"
          description={
            activeEventOption
              ? `${activePersonality?.character_slug ?? ""} • ${activeEventOption.eventName}`
              : activePersonality
                ? `Select a character event for ${activePersonality.name}.`
                : "Select a personality before editing character events."
          }
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3">
              {status ? (
                <div
                  className={
                    status === "Event saved." || status === "Lua formatted."
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
                  disabled={!activeEventOption || isSavingEvent || isFormattingLua}
                  onClick={handleFormatLua}
                  type="button"
                >
                  {isFormattingLua ? "Formatting..." : "Format Lua"}
                </button>
                <button
                  className={actionButtonClass}
                  disabled={!activeEventOption || isSavingEvent || isFormattingLua}
                  onClick={handleSaveEvent}
                  type="button"
                >
                  {isSavingEvent ? "Saving..." : "Save Event"}
                </button>
              </div>
            </div>
          }
          title={activeEventOption ? activeEventOption.eventName : "Character Event Editor"}
        >
          {activeEventOption ? (
            <div className="grid min-h-0 gap-4 overflow-y-auto pr-1">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_10rem]">
                <div className="grid gap-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] theme-text-muted">
                    Event Name
                  </span>
                  <div className="font-mono text-sm theme-text-primary">{activeEventOption.eventName}</div>
                </div>

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

              <LuaEventDefinitionHelp eventDefinition={activeEventOption.definition} />

              <div className="grid gap-3">
                <SectionEyebrow>Lua Script</SectionEyebrow>
                <div className="overflow-hidden border theme-border-panel">
                  <AceEditor
                    annotations={luaAnnotations}
                    className="w-full"
                    enableBasicAutocompletion={enableBasicAutocompletion}
                    enableLiveAutocompletion={enableLiveAutocompletion}
                    enableSnippets={enableSnippets}
                    fontSize={13}
                    height="640px"
                    mode="lua"
                    name={`character-event-lua-${activeEventOption.eventName}`}
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
                    onLoad={handleEditorLoad}
                    setOptions={{
                      showFoldWidgets: false,
                      tabSize: 2,
                      useSoftTabs: true,
                      useWorker: false
                    }}
                    theme="tomorrow_night"
                    value={draft.luaScript}
                    width="100%"
                    wrapEnabled
                  />
                </div>
                {aceHelperWarning ? <div className="text-sm text-[#b42318]">{aceHelperWarning}</div> : null}
                {!aceHelperWarning && eventDefinitionWarning ? (
                  <div className="text-sm text-[#b42318]">{eventDefinitionWarning}</div>
                ) : null}
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
