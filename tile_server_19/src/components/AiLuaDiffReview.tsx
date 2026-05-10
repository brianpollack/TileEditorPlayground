"use client";

import { actionButtonClass } from "./buttonStyles";
import { modalBackdropClass, modalSurfaceClass, secondaryButtonClass } from "./uiStyles";

interface AiLuaDiffReviewProps {
  onDecline: () => void;
  onKeep: () => void;
  originalLua: string;
  revisedLua: string;
}

type DiffLine =
  | {
      kind: "added" | "removed";
      text: string;
    }
  | {
      kind: "same";
      text: string;
    };

function splitLuaLines(value: string) {
  return value.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n").split("\n");
}

function buildLineDiff(originalLua: string, revisedLua: string): DiffLine[] {
  const originalLines = splitLuaLines(originalLua);
  const revisedLines = splitLuaLines(revisedLua);
  const rowCount = originalLines.length + 1;
  const columnCount = revisedLines.length + 1;
  const lengths = Array.from({ length: rowCount }, () => Array<number>(columnCount).fill(0));

  for (let rowIndex = originalLines.length - 1; rowIndex >= 0; rowIndex -= 1) {
    for (let columnIndex = revisedLines.length - 1; columnIndex >= 0; columnIndex -= 1) {
      lengths[rowIndex][columnIndex] =
        originalLines[rowIndex] === revisedLines[columnIndex]
          ? (lengths[rowIndex + 1]?.[columnIndex + 1] ?? 0) + 1
          : Math.max(lengths[rowIndex + 1]?.[columnIndex] ?? 0, lengths[rowIndex]?.[columnIndex + 1] ?? 0);
    }
  }

  const diffLines: DiffLine[] = [];
  let originalIndex = 0;
  let revisedIndex = 0;

  while (originalIndex < originalLines.length || revisedIndex < revisedLines.length) {
    if (originalLines[originalIndex] === revisedLines[revisedIndex]) {
      diffLines.push({ kind: "same", text: originalLines[originalIndex] ?? "" });
      originalIndex += 1;
      revisedIndex += 1;
      continue;
    }

    if (
      revisedIndex >= revisedLines.length ||
      (originalIndex < originalLines.length &&
        (lengths[originalIndex + 1]?.[revisedIndex] ?? 0) >= (lengths[originalIndex]?.[revisedIndex + 1] ?? 0))
    ) {
      diffLines.push({ kind: "removed", text: originalLines[originalIndex] ?? "" });
      originalIndex += 1;
      continue;
    }

    diffLines.push({ kind: "added", text: revisedLines[revisedIndex] ?? "" });
    revisedIndex += 1;
  }

  return diffLines;
}

function getDiffLineClass(kind: DiffLine["kind"]) {
  if (kind === "added") {
    return "border-l-4 border-[#16803c] bg-[#e9f8ee] text-[#0f5f2d]";
  }

  if (kind === "removed") {
    return "border-l-4 border-[#c93535] bg-[#fff0f0] text-[#9f2424]";
  }

  return "border-l-4 border-transparent text-[#4d5562]";
}

function getDiffPrefix(kind: DiffLine["kind"]) {
  if (kind === "added") {
    return "+";
  }

  if (kind === "removed") {
    return "-";
  }

  return " ";
}

export function AiLuaDiffReview({ onDecline, onKeep, originalLua, revisedLua }: AiLuaDiffReviewProps) {
  const diffLines = buildLineDiff(originalLua, revisedLua);

  return (
    <div className={`${modalBackdropClass} p-4`}>
      <div className={`${modalSurfaceClass} max-h-[92vh] max-w-[min(96vw,1100px)] overflow-hidden p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4 theme-border-panel">
          <div className="grid gap-1">
            <h2 className="text-lg font-extrabold theme-text-primary">Review AI Lua Changes</h2>
            <p className="text-sm theme-text-muted">Green lines will be added. Red lines will be removed.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={secondaryButtonClass} onClick={onDecline} type="button">
              Decline
            </button>
            <button className={actionButtonClass} onClick={onKeep} type="button">
              Keep Changes
            </button>
          </div>
        </div>

        <div className="mt-4 max-h-[70vh] overflow-auto border theme-border-panel">
          <pre className="m-0 min-w-full bg-[#fbfcfd] py-2 text-xs leading-5">
            {diffLines.map((line, index) => (
              <div className={`grid grid-cols-[2.5rem_minmax(0,1fr)] px-3 ${getDiffLineClass(line.kind)}`} key={`${line.kind}-${index}`}>
                <span className="select-none pr-3 text-right font-mono opacity-70">{getDiffPrefix(line.kind)}</span>
                <code className="whitespace-pre-wrap break-words font-mono">{line.text || " "}</code>
              </div>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}
