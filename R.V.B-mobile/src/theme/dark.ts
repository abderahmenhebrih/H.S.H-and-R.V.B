import { spacing, radii, fontSize, fontWeight } from "./tokens";

export const darkTheme = {
  dark: true,
  colors: {
    // Desktop Dark: #202126 page, #1E1F24 panel
    background: "#202126",
    surface: "#1E1F24",
    surfaceHover: "#25272F",
    surfaceElevated: "#262831",
    sidebar: "#111924",
    sidebarHover: "#1B2A36",
    // Text
    text: "#EAF0F2",
    textSecondary: "#9AA3A8",
    textTertiary: "#7E868B",
    // Borders
    border: "#2C2E36",
    borderStrong: "#343640",
    // Accent / Primary (muted teal)
    primary: "#1D4C54",
    primaryHover: "#24565F",
    primaryActive: "#133E45",
    primarySoft: "rgba(29,76,84,0.16)",
    primaryRing: "rgba(29,76,84,0.28)",
    primarySurface: "#133E45",
    // Input
    inputBackground: "#25272F",
    inputBorder: "#2C2E36",
    inputFocus: "#1D4C54",
    inputPlaceholder: "#7E868B",
    // Semantics (dark muted)
    success: "#4AA06A",
    successSoft: "rgba(74,160,106,0.13)",
    warning: "#B9A260",
    warningSoft: "rgba(185,162,96,0.11)",
    error: "#CF4A54",
    errorSoft: "rgba(207,74,84,0.12)",
    info: "#5D8AC5",
    infoSoft: "rgba(93,138,197,0.14)",
    sales: "#BA6A70",
    purchase: "#B9A260",
    danger: "#CF4A54",
    // Tabs
    tabActive: "#1D4C54",
    tabInactive: "#9AA3A8",
    tabBackground: "#1E1F24",
    // Status badges dark (use same structure but softer)
    statusUnderReviewBg: "rgba(185,162,96,0.18)",
    statusUnderReviewBorder: "rgba(185,162,96,0.30)",
    statusUnderReviewText: "#E9D5A0",
    statusAcceptedBg: "rgba(74,160,106,0.18)",
    statusAcceptedBorder: "rgba(74,160,106,0.30)",
    statusAcceptedText: "#86EFAC",
    statusRejectedBg: "rgba(207,74,84,0.18)",
    statusRejectedBorder: "rgba(207,74,84,0.30)",
    statusRejectedText: "#FCA5A5",
    statusCancelledBg: "#2C2E36",
    statusCancelledBorder: "#343640",
    statusCancelledText: "#9AA3A8",
    // Shadows
    shadow: "rgba(0,0,0,0.24)",
    shadowStrong: "rgba(0,0,0,0.40)",
  },
  spacing,
  radii,
  fontSize,
  fontWeight,
  shadows: {
    xs: { elevation: 2, shadowColor: "#000", shadowOpacity: 0.24, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
    sm: { elevation: 3, shadowColor: "#000", shadowOpacity: 0.24, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    card: { elevation: 4, shadowColor: "#000", shadowOpacity: 0.30, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
    modal: { elevation: 10, shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  },
} as const;

export type AppThemeDark = typeof darkTheme;
