# MOBILE DESIGN PARITY SPEC — Desktop Source Truth

**Source:** `H.S.H-V2.0.0/frontend/src/styles/design-tokens.css` + `frontend/app/globals.css`
**Date:** 2026-09-25
**Purpose:** Extract exact Desktop visual tokens to rebuild Mobile theme with parity

---

## 1. Desktop Files Inspected

- `frontend/src/styles/design-tokens.css` (242 lines) — single source of truth
- `frontend/app/globals.css` (786 lines) — light/dark overrides, button/card/input/modal polish
- `frontend/src/components/layout/AppShell.tsx` — navigation via lucide-react icons
- `frontend/src/components/common/*` — StyledSelect, DatePicker, etc.
- `frontend/src/lib/theme.ts` — `hebrih-theme` localStorage key, `data-theme` attribute, `themeLight/themeDark` classes
- `frontend/app/layout.tsx` — `themeInitScript` injects `data-theme` before paint

---

## 2. Core Tokens (from design-tokens.css)

### Radii
```
--radius-sm: 8px
--radius-md: 10px
--radius-lg: 12px
--radius-xl: 15px
--radius-2xl: 16px
```

### Spacing (4px base)
```
--space-1: 4, --space-2: 8, --space-3: 12, --space-4: 16, --space-5: 20, --space-6: 24, --space-8: 32, --space-10: 40, --space-12: 48
```

### Typography
```
--text-xs: 11, --text-sm: 12, --text-base: 13, --text-md: 14, --text-lg: 16, --text-xl: 18, --text-2xl: 22, --text-3xl: 26
--leading-tight: 1.15, --leading-normal: 1.4, --leading-relaxed: 1.6
--font-normal: 400, --font-medium: 500, --font-semibold: 600, --font-bold: 700, --font-extrabold: 800
--control-height: 44, --control-height-sm: 36
--content-max: 1280, --sidebar-width: 300, --header-height: 96
```

### Shadows
```
--shadow-xs: 0 1px 4px rgba(62,44,28,0.04)
--shadow-sm: 0 1px 6px rgba(62,44,28,0.06)
--shadow: 0 4px 15px rgba(62,44,28,0.055)
--shadow-md: 0 4px 12px rgba(62,44,28,0.06)
--shadow-lg: 0 12px 32px rgba(62,44,28,0.08)
--shadow-dark: 0 4px 12px rgba(0,0,0,0.24)
--shadow-dark-lg: 0 16px 40px rgba(0,0,0,0.32)
--shadow-modal: 0 24px 64px rgba(0,0,0,0.28)
--shadow-modal-dark: 0 20px 60px rgba(0,0,0,0.45), 0 6px 20px rgba(0,0,0,0.30)
```
RN: translate to `elevation` + `shadowColor/shadowOffset/shadowOpacity/shadowRadius`

### Semantics (light secondary)
```
--sales: #A95A60 (muted dusty rose), --sales-soft 0.10, --sales-ring 0.14
--purchase: #AF954B (warm gold), --purchase-soft 0.11
--danger: #B93A42 (light), --success: #3A7D52, --info: #3D6AA5
```

---

## 3. Light Theme — warm ivory #F0E5DA + coffee brown #6B3A26

| Token | Value | Mobile Mapping |
|---|---|---|
| **PRIMARY** | #6B3A26 (coffee brown) | `primary` |
| **ACCENT** | #6B3A26 (same) | `accent` |
| **ACCENT_HOVER** | #7B4931 | `primaryHover` |
| **ACCENT_SOFT** | rgba(107,58,38,0.08) | `primarySoft` |
| **ACCENT_RING** | rgba(107,58,38,0.13) | `primaryRing` |
| **BACKGROUND LIGHT** | #F0E5DA (page) | `background` |
| **SURFACE LIGHT** | #F8F0E7 (panel) | `surface` |
| **SURFACE_HOVER** | #EFE3D7 | `surfaceHover` |
| **ELEVATED SURFACE** | #FCF6EF | `surfaceElevated` |
| **TEXT PRIMARY LIGHT** | #2F261F | `text` |
| **TEXT SECONDARY LIGHT** | #81756C (muted) | `textSecondary` |
| **TEXT SUBTLE LIGHT** | #A89D94 | `textTertiary` |
| **BORDER LIGHT** | #E2D4C5 | `border` |
| **BORDER_STRONG LIGHT** | #D3C2B1 | `borderStrong` |
| **INPUT BACKGROUND** | #FCF6EF | `inputBackground` |
| **INPUT BORDER** | #E2D4C5 (=border) | `inputBorder` |
| **INPUT_FOCUS** | #6B3A26 (=accent) + ring 0.13 | `inputFocus` |
| **SIDEBAR** | #F8F0E7 | `sidebar` |
| **SIDEBAR_HOVER** | #EFE3D7 | `sidebarHover` |
| **SUCCESS** | #3A7D52 | `success` |
| **WARNING** | #AF954B (purchase gold) | `warning` |
| **ERROR** | #B93A42 | `error` / `danger` |
| **INFO** | #3D6AA5 | `info` |
| **SCROLLBAR_TRACK** | #F0E5DA | — |
| **SCROLLBAR_THUMB** | #6B3A26 | — |

---

## 4. Dark Theme — charcoal + teal

| Token | Value | Mobile Mapping |
|---|---|---|
| **PRIMARY DARK** | #1D4C54 (muted teal) | `primary` (dark) |
| **ACCENT DARK** | #1D4C54 | `accent` |
| **ACCENT_HOVER DARK** | #24565F | `primaryHover` |
| **ACCENT_SOFT DARK** | rgba(29,76,84,0.16) | `primarySoft` |
| **ACCENT_RING DARK** | rgba(29,76,84,0.28) | `primaryRing` |
| **BACKGROUND DARK** | #202126 (page) | `background` |
| **SURFACE DARK** | #1E1F24 (panel) | `surface` |
| **SURFACE_HOVER DARK** | #25272F | `surfaceHover` |
| **ELEVATED SURFACE DARK** | #262831 | `surfaceElevated` |
| **TEXT PRIMARY DARK** | #EAF0F2 | `text` |
| **TEXT SECONDARY DARK** | #9AA3A8 (muted) | `textSecondary` |
| **TEXT SUBTLE DARK** | #7E868B | `textTertiary` |
| **BORDER DARK** | #2C2E36 | `border` |
| **BORDER_STRONG DARK** | #343640 | `borderStrong` |
| **INPUT BACKGROUND DARK** | #25272F | `inputBackground` |
| **INPUT BORDER DARK** | #2C2E36 | `inputBorder` |
| **SIDEBAR DARK** | #111924 | `sidebar` |
| **SIDEBAR_HOVER DARK** | #1B2A36 | `sidebarHover` |
| **SALES DARK** | #BA6A70 | `sales` |
| **PURCHASE DARK** | #B9A260 | `warning` |
| **DANGER DARK** | #CF4A54 | `error` |
| **SUCCESS DARK** | #4AA06A | `success` |
| **INFO DARK** | #5D8AC5 | `info` |

---

## 5. Status Colors

| Status | Light | Dark | Badge Style Equivalent |
|---|---|---|---|
| **under_review** | #AF954B bg #FEF3C7 border #FDE68A (purchase soft) | #B9A260 bg rgba(185,162,96,0.11) | Amber/cream — `statusUnderReview` |
| **accepted** | #3A7D52 bg #DCFCE7 border #86EFAC | #4AA06A bg rgba | Green |
| **rejected** | #B93A42 bg #FEE2E2 border #FCA5A5 | #CF4A54 | Red |
| **cancelled** | #81756C bg #E2E8F0 border #CBD5E1 | #9AA3A8 | Gray |
| **archived** | #A89D94 | #7E868B | Subtle |
| **active** | #3A7D52 | #4AA06A | Green |

Desktop uses same semantics: `typeBadge` with `purchase-soft`, success/error soft.

---

## 6. Typography (Desktop → Mobile)

Mapped to React Native `fontSize/lineHeight/fontWeight`:

| Desktop | Value | Mobile `typography.ts` |
|---|---|---|
| **screenTitle** | 22-26, weight 800, -0.01em | `screenTitle: {fontSize:22, weight:"800", lineHeight:30}` |
| **sectionTitle** | 13, caps, spacing 0.06em, weight 800 | `sectionTitle: {fontSize:13, weight:"800", transform uppercase}` |
| **cardTitle** | 14-16, weight 700 | `cardTitle` |
| **body** | 13, line 1.6 | `body` |
| **bodySmall** | 12 | `bodySmall` |
| **caption** | 11 | `caption` |
| **button** | 12-13, weight 700 | `button` |
| **input** | 13-14 | `input` |
| **price/balance** | tabular-nums, weight 600, right-aligned | `numeric` |

---

## 7. Spacing & Radii

```
spacing: xs 4, sm 8, md 12-16, lg 24, xl 32, 2xl 48
radii: small 8, medium 10, large 12, card 12-16, modal 16, pill 999, button 10, input 10
controlHeight: 44 (default), 36 (small)
```

---

## 8. Button Styles (from globals.css)

- **Primary:** bg `accent` (#6B3A26 light / #1D4C54 dark), border accent, color #FCF6EF (light) / #EAF0F2 (dark), shadow `0 2px 8px accent-ring`, hover `accent-hover`, active `accent-active`. Disabled opacity 0.5. Height 44, padding 0 16, radius 10, weight 700, size 12. Transform -1px on hover (web only).
- **Secondary:** bg `panel` (light #F8F0E7 / dark #25272F), border `border`, color `text`, hover border accent, bg panel-hover. Same sizing.
- **Danger:** bg `danger` (#B93A42 light / #CF4A54 dark), border danger-border, color #FCF6EF / #EAF0F2. Same sizing.
- **Ghost:** transparent, no border, text accent, icon 44.

Mobile: implement `PrimaryButton`, `SecondaryButton`, `DangerButton`, `GhostButton` with same colors, height 44, radius 10, disabled opacity 0.5.

---

## 9. Card Style

```
Card: background panel (#F8F0E7 light / #1E1F24 dark), border 1px border (#E2D4C5 / #2C2E36), radius lg 12-16, shadow xs 0 1px 6px rgba(62,44,28,0.06) light / 0 2px 10px rgba(0,0,0,0.24) dark, overflow hidden
Header: bg panel-hover, border border, color muted, caps small
```

Mobile `Card`: same, with `elevation` 1 (light) / 2 (dark), `shadowColor` rgba as above, `borderRadius` 12-16.

---

## 10. Nav/Tab Style

Desktop sidebar: `sidebar` bg (#F8F0E7 light / #111924 dark), `sidebar-hover` (#EFE3D7 / #1B2A36), text #6B5A51 / #BFC9D1, border #E2D4C5 / #1E2F3E, active `accent` bg + text #EAF0F2.

Mobile Tabs: `tabBarStyle` bg `surface` (#F8F0E7 light / #1E1F24 dark), `borderTopColor` `border`, `activeTint` `accent` (#6B3A26 / #1D4C54), `inactiveTint` `muted` (#81756C / #9AA3A8). Icons filled/active use primary, inactive muted.

---

## 11. Header Style

Desktop headerHeight 96. Compact header. Mobile `AppHeader`: height ~56-60, bg `surface` or `panel` (#F8F0E7 / #1E1F24), borderBottom `border`, title weight 800 size 16-18, subtitle muted.

---

## 12. Modal Style

```
Modal: bg panel (#F8F0E7 / #1E1F24), border 1px border, radius 16, shadow-modal 0 24px 64px rgba(0,0,0,0.28) light / modal-dark dark, backdrop rgba(0,0,0,0.45)+blur 7px
Header: flex space-between, padding 16 20, borderBottom border, closeButton 40x40 border radius 8
```

Mobile modal: `react-native Modal` + overlay 0.55, card `background surface`, `borderRadius` 16, `shadow`.

---

## 13. Shadows/Elevation (RN translation)

| Desktop | RN Light | RN Dark |
|---|---|---|
| `--shadow-xs` 0 1px 4px 0.04 | `elevation:1, shadowOpacity 0.06` | `elevation:2, 0.24` |
| `--shadow-sm` 0 1px 6px 0.06 | `elevation:2` | `elevation:3` |
| `--shadow` 0 4px 15px 0.055 | `elevation:3` | `elevation:4` |
| `--shadow-modal` 0 24px 64px 0.28 | `elevation:8` | `elevation:12` |

Use `shadowColor: "#2F261F"` light, `"#000"` dark.

---

## 14. Expo/Web Theme Persistence

- Desktop: `localStorage.getItem("hebrih-theme")`, `data-theme` attr, `themeLight/themeDark` classes, init script before paint.
- Mobile: prefer backend `PATCH /api/rvb/auth/preferences {ui:{theme}}` when authenticated (via `getAuthGate`), local fallback `SecureStore?` — but per spec: theme is **NOT sensitive**, use `AsyncStorage`/`expo-secure-store`? Actually spec says SecureStore remains refresh-token only, theme via **non-sensitive persistence**. For web localStorage is acceptable. Use `useTheme.ts` with `AsyncStorage` or `localStorage` for web + `expo-secure-store` alternative? Simpler: use `@react-native-async-storage` equivalent via `expo-secure-store`? But better to use plain `AsyncStorage` if available, fallback to `localStorage` on web. If not installed, use `expo` `SecureStore` for now is okay but spec says not. We'll implement local persistence via `AsyncStorage` if present else in-memory + `localStorage` for web — install not needed if we use a simple MMKV-like.

---

## 15. Product Selector / Input

Desktop inputs: min-height 44, padding 0 12, radius 10, font-size 13, border 1px border, background input (#FCF6EF / #25272F), color text, transition, focus border accent + ring 0 0 0 3px accent-ring. Placeholder subtle #A89D94 / #7E868B.

Mobile `TextInput`, `NumberInput`, `TextArea`, `Select/ProductSelector`: same, height 44, radius 10, border, focus ring, placeholder subtle.

---

## 16. Status Badge Variants

Implement `StatusBadge` mapping:

```
under_review -> bg #FEF3C7 border #FDE68A text #92400E (light) / dark #B9A260 soft
accepted -> bg #DCFCE7 border #86EFAC text #166534
rejected -> bg #FEE2E2 border #FCA5A5 text #991B1B
cancelled -> bg #E2E8F0 border #CBD5E1 text #334155
archived/active -> subtle/primary
```

Derived from sales/purchase/danger tokens.

---

## 17. Summary / KPI Icon

Desktop `[kpiIcon],[summaryIcon]` use `accent-soft / accent / accent-ring` unified (all variants map to accent).

Mobile `StatCard` iconBg `primarySoft` (#6B3A2608 / #1D4C5416), iconColor `primary`, border `primaryRing`.

---

## 18. Implementation Notes for React Native

- Do not use `box-shadow` string — use `shadowColor/shadowOffset/shadowOpacity/shadowRadius/elevation`.
- Provide `light.ts` and `dark.ts` as full `Theme` objects with same keys, differing values per above.
- Centralize in `src/theme/tokens.ts` primitive, `light.ts/dark.ts` semantic, `ThemeProvider.tsx` context, `useTheme.ts` hook.
- RTL: use `isRTL()` from `src/i18n` already, apply `flexDirection row-reverse` where needed.
- Icons: replace `MC/SC/PF/SE/ST` with `@expo/vector-icons/Ionicons` — check Expo SDK 57 compatibility (Ionicons via `expo-vector-icons`).

