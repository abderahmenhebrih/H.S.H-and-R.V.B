import { fontSize, fontWeight } from "./tokens";

export const typography = {
  screenTitle: { fontSize: fontSize.x2l, fontWeight: fontWeight.extrabold, lineHeight: 30, letterSpacing: -0.3 },
  sectionTitle: { fontSize: fontSize.base, fontWeight: fontWeight.extrabold, lineHeight: 18, letterSpacing: 0.6, textTransform: "uppercase" as const },
  cardTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, lineHeight: 22 },
  body: { fontSize: fontSize.base, fontWeight: fontWeight.normal, lineHeight: 20 },
  bodySmall: { fontSize: fontSize.sm, fontWeight: fontWeight.normal, lineHeight: 18 },
  caption: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, lineHeight: 16 },
  button: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, lineHeight: 16, letterSpacing: -0.1 },
  buttonLarge: { fontSize: fontSize.md, fontWeight: fontWeight.bold, lineHeight: 20 },
  input: { fontSize: fontSize.base, fontWeight: fontWeight.normal, lineHeight: 20 },
  inputLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, lineHeight: 14, letterSpacing: 0.5, textTransform: "uppercase" as const },
  badge: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, lineHeight: 14 },
  numeric: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, lineHeight: 18, fontVariant: ["tabular-nums" as const] },
} as const;
