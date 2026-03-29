import type { IconDefinition } from "@awesome.me/kit-a62459359b/icons";

interface FontAwesomeIconProps {
  className?: string;
  icon: IconDefinition;
  title?: string;
}

export function FontAwesomeIcon({ className, icon, title }: FontAwesomeIconProps) {
  const [width, height, , , svgPathData] = icon.icon;

  return (
    <svg
      aria-hidden={title ? undefined : "true"}
      className={className}
      role={title ? "img" : undefined}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      {Array.isArray(svgPathData) ? (
        svgPathData.map((pathData, index) => <path d={pathData} fill="currentColor" key={index} />)
      ) : (
        <path d={svgPathData} fill="currentColor" />
      )}
    </svg>
  );
}
