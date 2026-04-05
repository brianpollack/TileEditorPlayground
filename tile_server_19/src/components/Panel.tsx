"use client";

import { PanelHeader } from "./PanelHeader";
import { cx, panelFooterClass, panelSurfaceClass } from "./uiStyles";

interface PanelProps {
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  description?: string;
  footer?: React.ReactNode;
  subheader?: React.ReactNode;
  title: string;
}

export function Panel({
  actions,
  children,
  className = "",
  description,
  footer,
  subheader,
  title
}: PanelProps) {
  const classes = cx(panelSurfaceClass, className);

  return (
    <section className={classes}>
      <PanelHeader actions={actions} description={description} subheader={subheader} title={title} />
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4">{children}</div>
      {footer ? (
        <footer className={panelFooterClass}>{footer}</footer>
      ) : null}
    </section>
  );
}
