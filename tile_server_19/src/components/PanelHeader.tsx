"use client";

interface PanelHeaderProps {
  actions?: React.ReactNode;
  description?: string;
  subheader?: React.ReactNode;
  title: string;
}

export function PanelHeader({ actions, description, subheader, title }: PanelHeaderProps) {
  return (
    <header className="flex min-h-24 items-start justify-between gap-4 overflow-hidden border-b border-[#c3d0cb]/65 bg-[linear-gradient(180deg,rgba(213,224,181,0.16),rgba(255,253,248,0.7))] px-4 py-4">
      <div className="flex min-w-0 flex-1 flex-col justify-center overflow-hidden">
        <h2 className="truncate font-serif text-[1.4rem] leading-tight text-[#142127]">{title}</h2>
        {subheader ? <div className="mt-1">{subheader}</div> : null}
        {description ? (
          <p className="mt-1 truncate whitespace-nowrap text-sm leading-6 text-[#4a6069] md:text-[0.95rem]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap justify-end gap-3">{actions}</div> : null}
    </header>
  );
}
