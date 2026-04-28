import type { LuaEventDefinition } from "./luaApiHelper";

export interface LuaEventDraftState {
  enabled: boolean;
  luaScript: string;
}

export interface LuaEventOption<TRecord> {
  definition: LuaEventDefinition | null;
  description: string;
  eventName: string;
  record: TRecord | null;
}

interface LuaEventRecordLike {
  enabled: boolean;
  id: string;
  lua_script: string;
}

export function createLuaEventDraft<TRecord extends LuaEventRecordLike>(
  eventRecord: TRecord | null
): LuaEventDraftState {
  return {
    enabled: eventRecord?.enabled ?? true,
    luaScript: eventRecord?.lua_script ?? ""
  };
}

export function sortLuaEvents<TRecord extends LuaEventRecordLike>(
  events: TRecord[],
  getEventName: (eventRecord: TRecord) => string
) {
  return events.slice().sort((left, right) => {
    if (left.enabled !== right.enabled) {
      return left.enabled ? -1 : 1;
    }

    const nameComparison = getEventName(left).localeCompare(getEventName(right));

    if (nameComparison !== 0) {
      return nameComparison;
    }

    return left.id.localeCompare(right.id, undefined, { numeric: true });
  });
}

export function mergeLuaEventOptions<TRecord>(
  eventDefinitions: LuaEventDefinition[],
  events: TRecord[],
  getEventName: (eventRecord: TRecord) => string
): LuaEventOption<TRecord>[] {
  const configuredEventsByName = new Map(
    events.map((eventRecord) => [getEventName(eventRecord), eventRecord] as const)
  );
  const definedEventNames = new Set(eventDefinitions.map((eventDefinition) => eventDefinition.eventName));
  const options: LuaEventOption<TRecord>[] = eventDefinitions.map((eventDefinition) => ({
    definition: eventDefinition,
    description: eventDefinition.description,
    eventName: eventDefinition.eventName,
    record: configuredEventsByName.get(eventDefinition.eventName) ?? null
  }));

  for (const eventRecord of events) {
    const eventName = getEventName(eventRecord);

    if (definedEventNames.has(eventName)) {
      continue;
    }

    options.push({
      definition: null,
      description: "Configured event not found in lua_api_helper.json.",
      eventName,
      record: eventRecord
    });
  }

  return options.sort((left, right) => left.eventName.localeCompare(right.eventName));
}
