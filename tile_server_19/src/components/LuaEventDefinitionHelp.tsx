"use client";

import type { LuaEventDefinition } from "../lib/luaApiHelper";
import { SectionEyebrow } from "./SectionEyebrow";
import { emptyStateCardClass } from "./uiStyles";

export function LuaEventDefinitionHelp({
  eventDefinition
}: {
  eventDefinition: LuaEventDefinition | null;
}) {
  if (!eventDefinition) {
    return null;
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <SectionEyebrow>Description</SectionEyebrow>
        <div className="text-sm leading-6 theme-text-primary">
          {eventDefinition.description || "No helper description is available for this event."}
        </div>
      </div>

      <div className="grid gap-2">
        <SectionEyebrow>Available Objects</SectionEyebrow>
        {eventDefinition.globals.length ? (
          <div className="overflow-hidden border theme-border-panel">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="theme-bg-panel">
                <tr>
                  <th className="px-3 py-2 font-mono text-xs font-semibold uppercase tracking-[0.08em] theme-text-muted">
                    Object
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] theme-text-muted">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {eventDefinition.globals.map((globalEntry) => (
                  <tr className="border-t theme-border-panel" key={globalEntry.name}>
                    <td className="px-3 py-2 align-top font-mono text-xs theme-text-primary">
                      {globalEntry.name}
                    </td>
                    <td className="px-3 py-2 align-top text-sm leading-6 theme-text-primary">
                      {globalEntry.description || "No helper description is available for this object."}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={emptyStateCardClass}>No helper object details are available for this event.</div>
        )}
      </div>
    </div>
  );
}
