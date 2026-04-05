"use client";

import { panelHeaderClass } from "./uiStyles";

interface PanelHeaderProps {
  actions?: React.ReactNode;
  description?: string;
  subheader?: React.ReactNode;
  title: string;
}

export function PanelHeader({ actions, description, subheader, title }: PanelHeaderProps) {
  return (
    <header className={panelHeaderClass}>
      <div className="flex min-w-0 flex-1 flex-col justify-center overflow-hidden">
        <h2 className="truncate font-serif text-[1.4rem] leading-tight theme-text-primary">{title}</h2>
        {subheader ? <div className="mt-1">{subheader}</div> : null}
        {description ? (
          <p className="mt-1 truncate whitespace-nowrap text-sm leading-6 theme-text-muted md:text-[0.95rem]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap justify-end gap-3">{actions}</div> : null}
    </header>
  );
}
