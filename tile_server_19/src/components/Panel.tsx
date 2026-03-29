"use client";

import { PanelHeader } from "./PanelHeader";

interface PanelProps {
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  description?: string;
  footer?: React.ReactNode;
  title: string;
}

export function Panel({
  actions,
  children,
  className = "",
  description,
  footer,
  title
}: PanelProps) {
  const classes = [
    "flex min-h-0 flex-col overflow-hidden border border-white/80 bg-[linear-gradient(180deg,rgba(255,253,248,0.96),rgba(255,253,248,0.88))] shadow-[0_18px_40px_rgba(20,33,39,0.12)]",
    className
  ]
      .filter(Boolean)
      .join(" ");

  return (
    <section className={classes}>
      <PanelHeader actions={actions} description={description} title={title} />
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4">{children}</div>
      {footer ? (
        <footer className="border-t border-[#c3d0cb]/65 bg-[rgba(244,239,226,0.7)] px-4 py-4">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
