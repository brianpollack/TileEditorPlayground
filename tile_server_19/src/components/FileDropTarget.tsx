"use client";

import { useState } from "react";

import { cx, dragDropTargetClass } from "./uiStyles";

interface FileDropTargetProps {
  activeLabel?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  idleLabel: React.ReactNode;
  onClick?(): void;
  onFileSelected(file: File): void;
}

export function FileDropTarget({
  activeLabel,
  children,
  className,
  disabled = false,
  idleLabel,
  onClick,
  onFileSelected
}: FileDropTargetProps) {
  const [isDragActive, setDragActive] = useState(false);
  const hasChildren = Boolean(children);

  function selectDroppedFile(fileList: FileList | null | undefined) {
    const nextFile = fileList?.[0];

    if (nextFile) {
      onFileSelected(nextFile);
    }
  }

  return (
    <button
      className={cx(
        hasChildren
          ? "block p-0 text-left transition"
          : dragDropTargetClass(isDragActive, disabled),
        hasChildren && disabled && "cursor-not-allowed opacity-60",
        className
      )}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onClick?.();
        }
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled) {
          setDragActive(true);
        }
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragActive(false);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
        if (!disabled && !isDragActive) {
          setDragActive(true);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);

        if (!disabled) {
          selectDroppedFile(event.dataTransfer.files);
        }
      }}
      type="button"
    >
      {hasChildren ? (
        <span className="relative block w-full">
          {children}
          {isDragActive ? (
            <span className="pointer-events-none absolute inset-0 grid place-items-center bg-[color-mix(in_srgb,var(--panel)_86%,transparent)] px-3 text-center text-sm font-semibold theme-text-primary">
              {activeLabel ?? idleLabel}
            </span>
          ) : null}
        </span>
      ) : (
        isDragActive && activeLabel ? activeLabel : idleLabel
      )}
    </button>
  );
}
