export const theme = {
  borderRadius: {
    large: "24px",
    medium: "18px",
    pill: "999px",
    small: "12px"
  },
  colors: {
    accent: "#d88753",
    accentSoft: "#f0c8a4",
    canvas: "#13262f",
    canvasMuted: "#24424f",
    ink: "#142127",
    inkSoft: "#4a6069",
    line: "#c3d0cb",
    moss: "#5a7b4d",
    mossSoft: "#d5e0b5",
    panel: "#fffdf8",
    paper: "#f4efe2",
    paperDeep: "#e7dcc5",
    shadow: "rgba(20, 33, 39, 0.14)",
    sky: "#d7ece9",
    warning: "#f1c97b"
  },
  fonts: {
    body: "\"Inter\", sans-serif",
    display: "\"Open Sans\", sans-serif",
    mono: "\"SFMono-Regular\", Consolas, \"Liberation Mono\", monospace"
  },
  shadows: {
    card: "0 18px 40px rgba(20, 33, 39, 0.12)",
    lift: "0 10px 28px rgba(20, 33, 39, 0.16)"
  }
} as const;

export function getThemeCssText() {
  const cssVariables = Object.entries({
    "accent-soft": theme.colors.accentSoft,
    accent: theme.colors.accent,
    canvas: theme.colors.canvas,
    "canvas-muted": theme.colors.canvasMuted,
    ink: theme.colors.ink,
    "ink-soft": theme.colors.inkSoft,
    line: theme.colors.line,
    moss: theme.colors.moss,
    "moss-soft": theme.colors.mossSoft,
    panel: theme.colors.panel,
    paper: theme.colors.paper,
    "paper-deep": theme.colors.paperDeep,
    shadow: theme.colors.shadow,
    sky: theme.colors.sky,
    warning: theme.colors.warning,
    "radius-large": theme.borderRadius.large,
    "radius-medium": theme.borderRadius.medium,
    "radius-pill": theme.borderRadius.pill,
    "radius-small": theme.borderRadius.small,
    "font-body": theme.fonts.body,
    "font-display": theme.fonts.display,
    "font-mono": theme.fonts.mono,
    "shadow-card": theme.shadows.card,
    "shadow-lift": theme.shadows.lift
  })
    .map(([key, value]) => `--${key}: ${value};`)
    .join("");

  return `:root{${cssVariables}}`;
}
