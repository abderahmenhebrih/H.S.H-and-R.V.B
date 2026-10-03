import { spacing, radii, fontSize, fontWeight } from "./tokens";

export const lightTheme = {
  dark: false,
  colors: {
    // Desktop Light: #F0E5DA page, #F8F0E7 panel
    background: "#F0E5DA",
    surface: "#F8F0E7",
    surfaceHover: "#EFE3D7",
    surfaceElevated: "#FCF6EF",
    sidebar: "#F8F0E7",
    sidebarHover: "#EFE3D7",
    // Text
    text: "#2F261F",
    textSecondary: "#81756C",
    textTertiary: "#A89D94",
    // Borders
    border: "#E2D4C5",
    borderStrong: "#D3C2B1",
    // Accent / Primary (coffee brown)
    primary: "#6B3A26",
    primaryHover: "#7B4931",
    primaryActive: "#4F2E1F",
    primarySoft: "rgba(107,58,38,0.08)",
    primaryRing: "rgba(107,58,38,0.13)",
    primarySurface: "#EFE3D7",
    // Input
    inputBackground: "#FCF6EF",
    inputBorder: "#E2D4C5",
    inputFocus: "#6B3A26",
    inputPlaceholder: "#A89D94",
    // Semantics
    success: "#3A7D52",
    successSoft: "rgba(58,125,82,0.10)",
    warning: "#AF954B",
    warningSoft: "rgba(175,149,75,0.11)",
    error: "#B93A42",
    errorSoft: "rgba(185,58,66,0.09)",
    info: "#3D6AA5",
    infoSoft: "rgba(61,106,165,0.10)",
    sales: "#A95A60",
    purchase: "#AF954B",
    danger: "#B93A42",
    // Tabs / Navigation
    tabActive: "#6B3A26",
    tabInactive: "#81756C",
    tabBackground: "#F8F0E7",
    // Status badges (light variants matching Desktop)
    statusUnderReviewBg: "#FEF3C7",
    statusUnderReviewBorder: "#FDE68A",
    statusUnderReviewText: "#92400E",
    statusAcceptedBg: "#DCFCE7",
    statusAcceptedBorder: "#86EFAC",
    statusAcceptedText: "#166534",
    statusRejectedBg: "#FEE2E2",
    statusRejectedBorder: "#FCA5A5",
    statusRejectedText: "#991B1B",
    statusCancelledBg: "#E2E8F0",
    statusCancelledBorder: "#CBD5E1",
    statusCancelledText: "#334155",
    // Shadows
    shadow: "rgba(62,44,28,0.06)",
    shadowStrong: "rgba(62,44,28,0.12)",
  },
  spacing,
  radii,
  fontSize,
  fontWeight,
  shadows: {
    xs: { elevation: 1, shadowColor: "#2F261F", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
    sm: { elevation: 2, shadowColor: "#2F261F", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 1 } },
    card: { elevation: 3, shadowColor: "#3E2C1C", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
    modal: { elevation: 8, shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  },
} as const;

export type AppTheme = typeof lightTheme;
