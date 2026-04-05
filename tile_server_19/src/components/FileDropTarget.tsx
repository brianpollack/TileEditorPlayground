"use client";

import { useState } from "react";

import { cx, dragDropTargetClass } from "./uiStyles";

interface FileDropTargetProps {
  activeLabel?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  idleLabel: React.ReactNode;
  onClick?(): void;
  onFileSelected(file: File): void;
}

export function FileDropTarget({
  activeLabel,
  className,
  disabled = false,
  idleLabel,
  onClick,
  onFileSelected
}: FileDropTargetProps) {
  const [isDragActive, setDragActive] = useState(false);

  function selectDroppedFile(fileList: FileList | null | undefined) {
    const nextFile = fileList?.[0];

    if (nextFile) {
      onFileSelected(nextFile);
    }
  }

  return (
    <button
      className={cx(dragDropTargetClass(isDragActive, disabled), className)}
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
      {isDragActive && activeLabel ? activeLabel : idleLabel}
    </button>
  );
}
