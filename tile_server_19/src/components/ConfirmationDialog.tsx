"use client";

import { cx, modalBackdropClass, modalSurfaceClass } from "./uiStyles";

interface ConfirmationDialogProps {
  actions: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  title: string;
}

export function ConfirmationDialog({
  actions,
  children,
  className,
  description,
  title
}: ConfirmationDialogProps) {
  return (
    <div className={modalBackdropClass}>
      <div className={cx(modalSurfaceClass, "max-w-md p-5", className)}>
        <div className="grid gap-4">
          <div className="grid gap-1">
            <strong className="font-serif text-[1.45rem] theme-text-primary">{title}</strong>
            {description ? (
              <div className="text-sm leading-6 theme-text-muted">{description}</div>
            ) : null}
          </div>
          {children}
          <div className="flex justify-end gap-3">{actions}</div>
        </div>
      </div>
    </div>
  );
}
