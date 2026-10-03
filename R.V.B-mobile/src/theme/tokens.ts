/**
 * Primitive design tokens extracted from Desktop
 * frontend/src/styles/design-tokens.css
 */
export const primitives = {
  // Sales / Purchase / Danger / Success / Info (light)
  sales: "#A95A60",
  salesDark: "#BA6A70",
  purchase: "#AF954B",
  purchaseDark: "#B9A260",
  dangerLight: "#B93A42",
  dangerDark: "#CF4A54",
  successLight: "#3A7D52",
  successDark: "#4AA06A",
  infoLight: "#3D6AA5",
  infoDark: "#5D8AC5",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  x2l: 24,
  x3l: 32,
  x4l: 40,
  x5l: 48,
} as const;

export const radii = {
  xs: 8,
  sm: 10,
  md: 12,
  lg: 15,
  xl: 16,
  pill: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 12,
  base: 13,
  md: 14,
  lg: 16,
  xl: 18,
  x2l: 22,
  x3l: 26,
} as const;

export const fontWeight = {
  normal: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
  extrabold: "800" as const,
};

export const controlHeight = 44;
export const controlHeightSm = 36;
