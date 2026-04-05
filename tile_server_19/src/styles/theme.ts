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
    accentSurface: "#fff4e4",
    brand: "#16324f",
    brandHover: "#4f78a3",
    canvas: "#13262f",
    canvasMuted: "#24424f",
    disabledSurface: "#eef1ef",
    disabledText: "#4b5563",
    emptyState: "rgba(236, 239, 238, 0.9)",
    info: "#4b86ff",
    ink: "#142127",
    inkDisabled: "#d1d5db",
    inkReadonly: "#5d6a65",
    inkSoft: "#4a6069",
    inkSubtle: "#7c8d88",
    inkSuccess: "#5c6d68",
    inkSuccessSoft: "#6f817c",
    line: "#c3d0cb",
    moss: "#5a7b4d",
    mossSoft: "#d5e0b5",
    overlay: "#0d161b",
    panel: "#fffdf8",
    paper: "#f4efe2",
    paperDeep: "#e7dcc5",
    paperSoft: "#f3eee2",
    readOnlySurface: "#e6e8e7",
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
    lift: "0 10px 28px rgba(20, 33, 39, 0.16)",
    modal: "0 24px 60px rgba(20, 33, 39, 0.28)",
    soft: "0 1px 3px rgba(20, 33, 39, 0.08)"
  }
} as const;

export function getThemeCssText() {
  const cssVariables = Object.entries({
    "accent-soft": theme.colors.accentSoft,
    accent: theme.colors.accent,
    "accent-surface": theme.colors.accentSurface,
    brand: theme.colors.brand,
    "brand-hover": theme.colors.brandHover,
    canvas: theme.colors.canvas,
    "canvas-muted": theme.colors.canvasMuted,
    "disabled-surface": theme.colors.disabledSurface,
    "disabled-text": theme.colors.disabledText,
    "empty-state": theme.colors.emptyState,
    info: theme.colors.info,
    ink: theme.colors.ink,
    "ink-disabled": theme.colors.inkDisabled,
    "ink-readonly": theme.colors.inkReadonly,
    "ink-soft": theme.colors.inkSoft,
    "ink-subtle": theme.colors.inkSubtle,
    "ink-success": theme.colors.inkSuccess,
    "ink-success-soft": theme.colors.inkSuccessSoft,
    line: theme.colors.line,
    moss: theme.colors.moss,
    "moss-soft": theme.colors.mossSoft,
    overlay: theme.colors.overlay,
    panel: theme.colors.panel,
    paper: theme.colors.paper,
    "paper-deep": theme.colors.paperDeep,
    "paper-soft": theme.colors.paperSoft,
    "readonly-surface": theme.colors.readOnlySurface,
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
    "shadow-lift": theme.shadows.lift,
    "shadow-modal": theme.shadows.modal,
    "shadow-soft": theme.shadows.soft
  })
    .map(([key, value]) => `--${key}: ${value};`)
    .join("");

  return `:root{${cssVariables}}`;
}
