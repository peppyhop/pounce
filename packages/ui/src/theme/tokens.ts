/**
 * Pounce design tokens — the single source of truth for color/space/type,
 * consumed by the Tailwind/Uniwind theme in apps/mobile. Pure data, no RN deps.
 *
 * Dark-first, Linear/Raycast-inspired: near-neutral surfaces, one violet accent,
 * semantic status colors tuned for an agent command center.
 */

export const palette = {
  violet: "#7C6FF0",
  violetSoft: "#9B90F5",
  green: "#3FB950",
  amber: "#D29922",
  red: "#F85149",
  blue: "#58A6FF",
  pink: "#DB61A2",
  cyan: "#39C5CF",
} as const;

/** Semantic colors per scheme. Mirrored into tailwind theme.colors. */
export const colors = {
  dark: {
    bg: "#0B0B0F",
    bgElevated: "#101016",
    surface: "#141419",
    surfaceAlt: "#1B1B22",
    surfaceHover: "#23232C",
    border: "#26262F",
    borderStrong: "#33333E",
    fg: "#ECECF1",
    fgMuted: "#9A9AA5",
    fgFaint: "#62626D",
    accent: palette.violet,
    accentSoft: "#1E1B33",
    success: palette.green,
    warning: palette.amber,
    danger: palette.red,
    info: palette.blue,
    diffAddBg: "#12361F",
    diffDelBg: "#3D1418",
    diffAddFg: "#56D364",
    diffDelFg: "#F85149",
  },
  light: {
    bg: "#FBFBFD",
    bgElevated: "#FFFFFF",
    surface: "#FFFFFF",
    surfaceAlt: "#F4F4F7",
    surfaceHover: "#ECECF1",
    border: "#E3E3EA",
    borderStrong: "#D2D2DC",
    fg: "#16161A",
    fgMuted: "#6B6B76",
    fgFaint: "#9A9AA5",
    accent: palette.violetSoft,
    accentSoft: "#EEEBFF",
    success: "#1A7F37",
    warning: "#9A6700",
    danger: "#CF222E",
    info: "#0969DA",
    diffAddBg: "#E6FFEC",
    diffDelBg: "#FFEBE9",
    diffAddFg: "#1A7F37",
    diffDelFg: "#CF222E",
  },
} as const;

/** Activity status → color key (the two-axis status model, axis A). */
export const activityColor = {
  running: "success",
  streaming: "success",
  awaiting_input: "warning",
  completed: "info",
  idle: "fgFaint",
  failed: "danger",
  queued: "warning",
} as const;

export type SchemeColors = typeof colors.dark;
