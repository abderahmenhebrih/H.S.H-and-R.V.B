"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  ChevronDown,
  ClipboardList,
  Factory,
  LogOut,
  Menu,
  Moon,
  Settings as SettingsIcon,
  Store,
  Sun,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import styles from "./FloatingNav.module.css";
import { MANAGEMENT_KEYS, OPERATIONS_KEYS, navGroupForKey } from "../../lib/navigation";
import type { NavGroupKey } from "../../lib/navigation";

export type FloatingNavEntry = {
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
};

type FloatingNavProps = {
  activeKey: string;
  dashboardEntry: FloatingNavEntry;
  officeEntry: FloatingNavEntry;
  managementLabel: string;
  operationsLabel: string;
  managementItems: readonly FloatingNavEntry[];
  operationsItems: readonly FloatingNavEntry[];
  openMenuLabel: string;
  closeMenuLabel: string;
  onNavigate: (path: string) => void;
  dark: boolean;
  onToggleTheme: () => void;
  themeLabel: string;
  onOpenSettings: () => void;
  settingsLabel: string;
  onAccessRvb: () => void;
  rvbLabel: string;
  // Fourth utility orbit icon. HSH always uses the default "rvb" (Store);
  // RVB floating passes "hsh" (Access HSH, manager) or "signout".
  // Optional with HSH default — HSH rendering is unchanged.
  utilityActionIcon?: "rvb" | "hsh" | "signout";
  bell: React.ReactNode;
};

const GROUP_ICONS: Record<NavGroupKey, LucideIcon> = {
  management: Boxes,
  operations: ClipboardList,
};

export function floatingNavGroupForKey(key: string): NavGroupKey | null {
  return navGroupForKey(key);
}

export { MANAGEMENT_KEYS, OPERATIONS_KEYS };

// ---------- free edge docking ----------

type DockEdge = "left" | "right" | "top" | "bottom";

type DockPosition = {
  edge: DockEdge;
  offsetRatio: number;
};

const DOCK_STORAGE_KEY = "hsh-floating-nav-position";
const DRAG_THRESHOLD_PX = 8;
const EDGE_MARGIN_PX = 20;

// Deterministic SSR + first-client-render defaults. These must never read
// window/localStorage/viewport — hydration relies on server and client
// rendering byte-identical output before effects restore persisted state.
const DEFAULT_DOCK_POSITION: DockPosition = { edge: "left", offsetRatio: 0.55 };
const DEFAULT_VIEWPORT = { w: 1600, h: 900 };

function isDockEdge(value: unknown): value is DockEdge {
  return value === "left" || value === "right" || value === "top" || value === "bottom";
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function loadDock(): DockPosition {
  const fallback: DockPosition = { edge: "left", offsetRatio: 0.55 };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(DOCK_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<DockPosition>;
    if (!isDockEdge(parsed.edge)) return fallback;
    return { edge: parsed.edge, offsetRatio: clamp01(Number(parsed.offsetRatio)) };
  } catch {
    return fallback;
  }
}

function launcherSizeFor(viewportWidth: number): number {
  return viewportWidth < 700 ? 56 : 60;
}

// Top-left corner of the launcher box for a dock state.
function dockXY(
  dock: DockPosition,
  vw: number,
  vh: number,
  size: number,
  margin: number,
): { x: number; y: number } {
  const spanX = Math.max(0, vw - margin * 2 - size);
  const spanY = Math.max(0, vh - margin * 2 - size);
  switch (dock.edge) {
    case "left":
      return { x: margin, y: margin + spanY * dock.offsetRatio };
    case "right":
      return { x: margin + spanX, y: margin + spanY * dock.offsetRatio };
    case "top":
      return { x: margin + spanX * dock.offsetRatio, y: margin };
    case "bottom":
      return { x: margin + spanX * dock.offsetRatio, y: margin + spanY };
  }
}

// ---------- responsive radial geometry ----------

type FanNode =
  | { kind: "pill"; slot: string; entry: FloatingNavEntry; active: boolean; child: boolean; stagger: number; onSelect: () => void }
  | { kind: "group"; slot: string; gkey: NavGroupKey; label: string; active: boolean; isOpen: boolean; stagger: number }
  | { kind: "orbit"; slot: string; label: string; stagger: number; onSelect: () => void; content: React.ReactNode }
  | { kind: "bell"; slot: string; stagger: number };

const SAFE_PAD = 16;
const DEG = Math.PI / 180;
const OVERLAP_GAP = 10;

// Inward-facing base center angle (screen coords, +y down) with
// near-corner bias derived from the along-edge ratio.
function baseCenterFor(edge: DockEdge, ratio: number): number {
  const bias = (0.5 - ratio) * 60;
  switch (edge) {
    case "left":
      return 0 + bias;
    case "right":
      return 180 - bias;
    case "top":
      return 90 - bias;
    case "bottom":
      return -90 + bias;
  }
}

function arcPoints(
  ax: number,
  ay: number,
  n: number,
  centerDeg: number,
  spreadDeg: number,
  r: number,
): Array<{ x: number; y: number }> {
  if (n === 0) return [];
  if (n === 1) {
    const a = centerDeg * DEG;
    return [{ x: ax + Math.cos(a) * r, y: ay + Math.sin(a) * r }];
  }
  const start = centerDeg - spreadDeg / 2;
  const step = spreadDeg / (n - 1);
  return Array.from({ length: n }, (_, i) => {
    const a = (start + i * step) * DEG;
    return { x: ax + Math.cos(a) * r, y: ay + Math.sin(a) * r };
  });
}

function countArcViolations(
  pts: Array<{ x: number; y: number }>,
  dims: Array<{ w: number; h: number }>,
  vw: number,
  vh: number,
  fixed: FixedBox[] = [],
): number {
  const allPts = [...pts, ...fixed.map((f) => ({ x: f.x, y: f.y }))];
  const allDims = [...dims, ...fixed.map((f) => ({ w: f.w, h: f.h }))];
  let violations = 0;
  allPts.forEach((p, i) => {
    const w = allDims[i].w;
    const h = allDims[i].h;
    if (p.x - w / 2 < SAFE_PAD - 0.5) violations += 2;
    if (p.x + w / 2 > vw - SAFE_PAD + 0.5) violations += 2;
    if (p.y - h / 2 < SAFE_PAD - 0.5) violations += 2;
    if (p.y + h / 2 > vh - SAFE_PAD + 0.5) violations += 2;
    for (let j = i + 1; j < allPts.length; j += 1) {
      const q = allPts[j];
      if (
        Math.abs(p.x - q.x) < (w + allDims[j].w) / 2 + OVERLAP_GAP &&
        Math.abs(p.y - q.y) < (h + allDims[j].h) / 2 + OVERLAP_GAP
      ) {
        violations += 1;
      }
    }
  });
  return violations;
}

// Edge-to-edge gap between two axis-aligned boxes centered at
// (ax,ay)/(bx,by). Positive when separated, <= 0 when touching/overlapping.
function rectGap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): number {
  const ex = Math.abs(ax - bx) - (aw + bw) / 2;
  const ey = Math.abs(ay - by) - (ah + bh) / 2;
  if (ex <= 0 && ey <= 0) return Math.min(ex, ey);
  if (ex <= 0) return ey;
  if (ey <= 0) return ex;
  return Math.hypot(ex, ey);
}

// Healthy visual separation targets for the corner fan. These sit ON TOP of
// the hard no-overlap check (OVERLAP_GAP): a layout with 2px gaps still
// passes overlap but scores badly here.
const CORNER_PILL_GAP = 18;
const CORNER_PILL_ORBIT_GAP = 14;
const CORNER_ORBIT_GAP = 12;
const CORNER_LAUNCHER_GAP = 24;

// Corner detection: launcher near two viewport edges at once.
// Thresholds are practical pixel bands (~260px), not vague percentages,
// so center-edge positions never trigger corner mode.
const CORNER_EDGE_THRESHOLD = 260;

function detectCorner(
  cx: number,
  cy: number,
  vw: number,
  vh: number,
): { id: "tl" | "tr" | "br" | "bl"; angle: number } | null {
  const nearLeft = cx < CORNER_EDGE_THRESHOLD;
  const nearRight = cx > vw - CORNER_EDGE_THRESHOLD;
  const nearTop = cy < CORNER_EDGE_THRESHOLD;
  const nearBottom = cy > vh - CORNER_EDGE_THRESHOLD;
  // Browser coords: 0deg = right, 90deg = down. Each quarter fan points
  // inward: TL down/right, TR down/left, BR up/left, BL up/right.
  if (nearLeft && nearTop) return { id: "tl", angle: 45 };
  if (nearRight && nearTop) return { id: "tr", angle: 135 };
  if (nearRight && nearBottom) return { id: "br", angle: 225 };
  if (nearLeft && nearBottom) return { id: "bl", angle: 315 };
  return null;
}

type PolarFanResult = {
  pts: Array<{ x: number; y: number }>;
  w: number;
  radius: number;
  center: number;
  spread: number;
  ringStep: number;
  violations: number;
};

// Generic TRUE polar solver: every point is launcher + (cos,sin)*radius.
// Alternating ringStep staggers odd items onto a second ring so wide
// pills clear each other without a giant single-ring radius. Returns the
// first zero-violation candidate (compact-first ordering) or the best
// effort found. Never falls back to rows/columns.
function solvePolarFan(args: {
  ax: number;
  ay: number;
  n: number;
  pillW: number;
  pillH: number;
  vw: number;
  vh: number;
  baseCenter: number;
  spreads: number[];
  radii: number[];
  widthScales: number[];
  minW: number;
  rotations: number[];
  ringSteps: number[];
  fixed?: FixedBox[];
}): PolarFanResult | null {
  const { ax, ay, n, pillH, vw, vh, baseCenter } = args;
  if (n === 0) {
    return { pts: [], w: args.pillW, radius: 0, center: baseCenter, spread: 0, ringStep: 0, violations: 0 };
  }
  let best: PolarFanResult | null = null;
  for (const spread of args.spreads) {
    for (const ws of args.widthScales) {
      const w = Math.max(args.minW, args.pillW * ws);
      for (const ringStep of args.ringSteps) {
        for (const rBase of args.radii) {
          for (const dc of args.rotations) {
            const center = baseCenter + dc;
            const start = center - spread / 2;
            const step = n <= 1 ? 0 : spread / (n - 1);
            const pts = Array.from({ length: n }, (_, i) => {
              const a = (start + i * step) * DEG;
              const r = rBase + (i % 2 === 1 ? ringStep : 0);
              return { x: ax + Math.cos(a) * r, y: ay + Math.sin(a) * r };
            });
            const dims = pts.map(() => ({ w, h: pillH }));
            const violations = countArcViolations(pts, dims, vw, vh, args.fixed);
            if (!best || violations < best.violations) {
              best = { pts, w, radius: rBase, center, spread, ringStep, violations };
            }
            if (violations === 0) return best;
          }
        }
      }
    }
  }
  return best;
}

type CornerRootSolution = {
  pillPts: Array<{ x: number; y: number }>;
  circlePts: Array<{ x: number; y: number }>;
  pillW: number;
  center: number;
  spread: number;
};

// Corner quarter-circle root fan: 4 navigation pills on TWO outer radial
// bands plus 4 utility orbitals on their own independent inner sub-arc.
// Everything is TRUE polar coordinates around the launcher origin — no rows,
// columns, stacks, or grids, ever. Pill-only viewport violations prune the
// search early (circles can only add violations, never remove them); the
// final choice is LEXICOGRAPHIC: fewer viewport/overlap violations always
// wins, and the health score breaks ties:
//
//   score = healthy-gap shortfalls (pill/pill 18px, pill/orbit 14px,
//             orbit/orbit 12px, launcher clearance 24px)
//         + label-truncation penalty (full width preferred)
//         + mild radius pull toward the roomy middle (oversized >260px
//           penalized unless the viewport genuinely needs it)
//
// Quality order: no clipping > no overlap > healthy gaps > readable widths
// > compact-but-not-cramped radius > balanced quarter-circle. A layout with
// zero overlap but 2px gaps scores badly and never wins while a breathing
// candidate exists; an overlap never beats a clean layout, no matter how
// roomy the rest looks.
function solveCornerRootFan(args: {
  cx: number;
  cy: number;
  vw: number;
  vh: number;
  angle: number;
  pillW: number;
  pillH: number;
  orbitD: number;
  launcherD?: number;
}): CornerRootSolution | null {
  const { cx, cy, vw, vh, angle, pillH, orbitD } = args;
  const launcherD = args.launcherD ?? 60;
  const rotations = [0, 10, -10, 20, -20, 30, -30, 40, -40];
  type Scored = CornerRootSolution & { score: number; violations: number };
  let best: Scored | null = null;
  // Roomy-first ordering: preferred spreads / full widths / mid radii come
  // first so score ties break toward breathing room. The score — not the
  // order — picks the winner, so nothing cramped can win by being early.
  // Tight tiers (spread 75/70, width 0.75) exist only so extreme corners —
  // launcher pressed to ~50px from both edges, where only a long diagonal
  // reach fits — still find a valid fan instead of falling back.
  const spreads = [95, 105, 85, 115, 75, 70];
  const widthScales = [1, 0.92, 0.85, 0.75];
  const minW = 130;
  // Alternating bands: neighbors ride different radii so they never fight
  // for the same arc. Both parities are tried: band assignment by index
  // parity mirrors to the opposite parity, so without both phases the
  // TR/BL diagonal would lose the solutions the TL/BR diagonal finds.
  const ringSteps = [70, 50];
  const rPills = [190, 210, 170, 230, 150];
  const circleOffsets = [-100, -80, -60, -40, -30, -20, -10, 0, 10, 20, 30, 40, 60, 80, 100];
  // Wide spreads let near-launcher rings (r 70-95) separate all four
  // orbitals around the launcher; narrow spreads suit the farther rings.
  const circleSpreads = [70, 50, 90, 40, 110];
  const rIns = [125, 110, 140, 95, 155, 80, 170, 85, 70];
  for (const spread of spreads) {
    for (const ws of widthScales) {
      const w = Math.max(minW, args.pillW * ws);
      for (const ringStep of ringSteps) {
        for (const rPill of rPills) {
          for (const phase of [0, 1]) {
            for (const dc of rotations) {
            const center = angle + dc;
            const start = center - spread / 2;
            const step = spread / 3;
            const pillPts = [0, 1, 2, 3].map((k) => {
              const a = (start + k * step) * DEG;
              const r = rPill + ((k + phase) % 2 === 1 ? ringStep : 0);
              return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
            });
            const pillDims = pillPts.map(() => ({ w, h: pillH }));
            // Shift-aware prune: pills that fit after the same rigid shift
            // the final guard applies are worth exploring; only hopelessly
            // wide/tall pill sets (unfixable even shifted) are skipped.
            // Circles can only add violations, never remove them.
            const pillShifted = clampFanInside(pillPts, pillDims, vw, vh);
            if (countArcViolations(pillShifted, pillDims, vw, vh) > 0) continue;
            for (const circleOff of circleOffsets) {
              for (const circleSpread of circleSpreads) {
                for (const rIn of rIns) {
                  const cc = center + circleOff;
                  const cStart = cc - circleSpread / 2;
                  const cStep = circleSpread / 3;
                  const circlePts = [0, 1, 2, 3].map((k) => {
                    const a = (cStart + k * cStep) * DEG;
                    return { x: cx + Math.cos(a) * rIn, y: cy + Math.sin(a) * rIn };
                  });
                  const circleDims = circlePts.map(() => ({ w: orbitD, h: orbitD }));
                  // Score the fan as it will actually render: rigidly
                  // shifted inside the viewport first, so edge-touching raw
                  // polar placements with a healthy shape are not discarded.
                  // Pairwise gaps are shift-invariant; launcher clearance is
                  // measured post-shift against the fixed launcher.
                  const allDims = [...pillDims, ...circleDims];
                  const shifted = clampFanInside([...pillPts, ...circlePts], allDims, vw, vh);
                  const sPillPts = shifted.slice(0, 4);
                  const sCirclePts = shifted.slice(4);
                  const violations = countArcViolations(shifted, allDims, vw, vh);
                  // Healthy-gap scoring over all visible pairs.
                  let gapPenalty = 0;
                  let minPillGap = Infinity;
                  let minOrbitGap = Infinity;
                  let minLauncherGap = Infinity;
                  for (let i = 0; i < 4; i += 1) {
                    for (let j = i + 1; j < 4; j += 1) {
                      const gap = rectGap(
                        sPillPts[i].x, sPillPts[i].y, w, pillH,
                        sPillPts[j].x, sPillPts[j].y, w, pillH,
                      );
                      minPillGap = Math.min(minPillGap, gap);
                      if (gap < CORNER_PILL_GAP) gapPenalty += (CORNER_PILL_GAP - gap) * 4;
                    }
                  }
                  for (let i = 0; i < 4; i += 1) {
                    for (let j = 0; j < 4; j += 1) {
                      const gap = rectGap(
                        sPillPts[i].x, sPillPts[i].y, w, pillH,
                        sCirclePts[j].x, sCirclePts[j].y, orbitD, orbitD,
                      );
                      if (gap < CORNER_PILL_ORBIT_GAP) {
                        gapPenalty += (CORNER_PILL_ORBIT_GAP - gap) * 3;
                      }
                    }
                  }
                  for (let i = 0; i < 4; i += 1) {
                    for (let j = i + 1; j < 4; j += 1) {
                      const gap = rectGap(
                        sCirclePts[i].x, sCirclePts[i].y, orbitD, orbitD,
                        sCirclePts[j].x, sCirclePts[j].y, orbitD, orbitD,
                      );
                      minOrbitGap = Math.min(minOrbitGap, gap);
                      if (gap < CORNER_ORBIT_GAP) gapPenalty += (CORNER_ORBIT_GAP - gap) * 2;
                    }
                  }
                  for (let i = 0; i < 4; i += 1) {
                    const pillGap = rectGap(
                      sPillPts[i].x, sPillPts[i].y, w, pillH,
                      cx, cy, launcherD, launcherD,
                    );
                    const orbGap = rectGap(
                      sCirclePts[i].x, sCirclePts[i].y, orbitD, orbitD,
                      cx, cy, launcherD, launcherD,
                    );
                    minLauncherGap = Math.min(minLauncherGap, pillGap, orbGap);
                    if (pillGap < CORNER_LAUNCHER_GAP) {
                      gapPenalty += (CORNER_LAUNCHER_GAP - pillGap) * 5;
                    }
                    if (orbGap < CORNER_LAUNCHER_GAP) {
                      gapPenalty += (CORNER_LAUNCHER_GAP - orbGap) * 5;
                    }
                  }
                  // Prefer full labels (truncation only as a last resort);
                  // mildly prefer the roomy middle over extremes;
                  // discourage >260px outer reach.
                  const widthPenalty = (1 - ws) * 40;
                  const outer = rPill + ringStep;
                  const radiusPenalty =
                    Math.abs(rPill + ringStep / 2 - 195) * 0.04 +
                    Math.abs(rIn - 122) * 0.04 +
                    (outer > 260 ? (outer - 260) * 0.5 : 0);
                  const score = gapPenalty + widthPenalty + radiusPenalty;
                  if (
                    !best ||
                    violations < best.violations ||
                    (violations === best.violations && score < best.score)
                  ) {
                    best = { pillPts: sPillPts, circlePts: sCirclePts, pillW: w, center, spread, score, violations };
                  }
                  // Excellent is excellent: clean, breathing, full-width.
                  // Anything less keeps searching for a better score.
                  if (
                    violations === 0 &&
                    minPillGap >= CORNER_PILL_GAP &&
                    minOrbitGap >= CORNER_ORBIT_GAP &&
                    minLauncherGap >= CORNER_LAUNCHER_GAP - 4 &&
                    ws === 1
                  ) {
                    return { pillPts: sPillPts, circlePts: sCirclePts, pillW: w, center, spread };
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  }
  if (!best) {
    // No pill-clean candidate survived pruning (e.g. tiny viewport where
    // every placement clips). Return a deterministic roomy best-effort
    // fallback so the solver never throws and callers always get
    // renderable points. clampFanInside() pulls it minimally inside the
    // viewport afterwards.
    const fallbackW = args.pillW;
    const fallbackStart = angle - 95 / 2;
    const fallbackPillPts = [0, 1, 2, 3].map((k) => {
      const a = (fallbackStart + k * (95 / 3)) * DEG;
      const r = 185 + (k % 2 === 1 ? 65 : 0);
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    });
    return {
      pillPts: fallbackPillPts,
      circlePts: arcPoints(cx, cy, 4, angle, 70, 120),
      pillW: fallbackW,
      center: angle,
      spread: 95,
    };
  }
  const { score: _score, violations: _drop, ...solution } = best;
  return solution;
}

// Shift a solved fan minimally so every box clears the viewport.
// Last-resort guard: prefers clipping nothing over preserving spacing.
function clampFanInside(
  pts: Array<{ x: number; y: number }>,
  dims: Array<{ w: number; h: number }>,
  vw: number,
  vh: number,
): Array<{ x: number; y: number }> {
  let minL = Infinity;
  let maxR = -Infinity;
  let minT = Infinity;
  let maxB = -Infinity;
  pts.forEach((p, i) => {
    minL = Math.min(minL, p.x - dims[i].w / 2);
    maxR = Math.max(maxR, p.x + dims[i].w / 2);
    minT = Math.min(minT, p.y - dims[i].h / 2);
    maxB = Math.max(maxB, p.y + dims[i].h / 2);
  });
  let dx = 0;
  if (minL < SAFE_PAD) dx = SAFE_PAD - minL;
  else if (maxR > vw - SAFE_PAD) dx = vw - SAFE_PAD - maxR;
  let dy = 0;
  if (minT < SAFE_PAD) dy = SAFE_PAD - minT;
  else if (maxB > vh - SAFE_PAD) dy = vh - SAFE_PAD - maxB;
  if (dx === 0 && dy === 0) return pts;
  return pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

type ArcSolution = {
  pts: Array<{ x: number; y: number }>;
  pillW: number;
  center: number;
  spread: number;
};

type FixedBox = { x: number; y: number; w: number; h: number };

// General polar solver: preferred inward angle first, then rotate/bias,
// reduce spread, compact widths. Radius derives from the no-overlap chord.
// Already-visible boxes (e.g. the open group pill + utility orbitals when
// placing children) join validation so nothing ever overlaps them.
function solveArc(args: {
  ax: number;
  ay: number;
  n: number;
  pillW: number;
  pillH: number;
  vw: number;
  vh: number;
  baseCenter: number;
  minRadius?: number;
  fixed?: FixedBox[];
  spreads?: number[];
}): ArcSolution {
  const { ax, ay, n, pillH, vw, vh } = args;
  const minRadius = args.minRadius ?? 90;
  // Compact-first ordering: tighter fans win when they fit cleanly,
  // full width remains as the last resort before best-effort.
  const widthScales = [0.9, 0.8, 1];
  const minW = 96;
  const rotations = [0, 15, -15, 30, -30, 45, -45, 60, -60];
  const spreads = args.spreads ?? [150, 130, 110];
  let best: (ArcSolution & { violations: number }) | null = null;
  for (const spread of spreads) {
    for (const ws of widthScales) {
      const w = Math.max(minW, args.pillW * ws);
      const step = n <= 1 ? 0 : spread / (n - 1);
      const chord = n <= 1 ? 0 : 2 * Math.sin((step / 2) * DEG);
      // +6px slack beyond the overlap gap so float rounding can never
      // turn a boundary chord into a real overlap.
      const r = n <= 1 ? 120 : Math.max(minRadius, (w + OVERLAP_GAP + 6) / Math.max(chord, 0.05));
      for (const dc of rotations) {
        const center = args.baseCenter + dc;
        const pts = arcPoints(ax, ay, n, center, spread, r);
        const dims = pts.map(() => ({ w, h: pillH }));
        const violations = countArcViolations(pts, dims, vw, vh, args.fixed);
        if (!best || violations < best.violations) {
          best = { pts, pillW: w, center, spread, violations };
        }
        if (violations === 0) return { pts, pillW: w, center, spread };
      }
    }
  }
  if (!best) {
    const pts = arcPoints(ax, ay, n, args.baseCenter, 150, 160);
    return { pts, pillW: args.pillW, center: args.baseCenter, spread: 150 };
  }
  return { pts: best.pts, pillW: best.pillW, center: best.center, spread: best.spread };
}

// Root fan: 4 labeled pills on an outer arc + 4 utility circles on an
// inner arc at interleaved angles. Solved jointly so pills and circles
// never overlap; falls back through rotations, spreads and compaction.
function solveRootFan(args: {
  cx: number;
  cy: number;
  vw: number;
  vh: number;
  baseCenter: number;
  pillW: number;
  pillH: number;
  orbitD: number;
}): { pillPts: Array<{ x: number; y: number }>; circlePts: Array<{ x: number; y: number }>; pillW: number } {
  const { cx, cy, vw, vh, baseCenter, pillH, orbitD } = args;
  const rotations = [0, 15, -15, 30, -30, 45, -45, 60, -60];
  const spreads = [170, 150, 130, 110];
  // Compact-first ordering: tighter fans win when they fit cleanly.
  const widthScales = [0.9, 0.8, 1];
  const minW = 96;
  let best: {
    pillPts: Array<{ x: number; y: number }>;
    circlePts: Array<{ x: number; y: number }>;
    pillW: number;
    violations: number;
  } | null = null;
  for (const spread of spreads) {
    for (const ws of widthScales) {
      const w = Math.max(minW, args.pillW * ws);
      const step = spread / 3;
      const rPill = Math.max(110, (w + OVERLAP_GAP + 6) / (2 * Math.sin((step / 2) * DEG)));
      // Utility orbitals share the pill angles on a tighter ring; the
      // radial gap keeps every pill/circle pair separated. Several ring
      // radii are tried because narrow screens need tighter packing.
      const ringRadii = [rPill - 150, rPill - 120, 70].filter(
        (candidate, index, all) => candidate >= 60 && all.indexOf(candidate) === index,
      );
      for (const dc of rotations) {
        const center = baseCenter + dc;
        const pillPts = arcPoints(cx, cy, 4, center, spread, rPill);
        const pillDims = pillPts.map(() => ({ w, h: pillH }));
        for (const rIn of ringRadii) {
          const circlePts = [0, 1, 2, 3].map((k) => {
            const a = (center - spread / 2 + k * step) * DEG;
            return { x: cx + Math.cos(a) * rIn, y: cy + Math.sin(a) * rIn };
          });
          const pts = [...pillPts, ...circlePts];
          const dims = [
            ...pillDims,
            ...circlePts.map(() => ({ w: orbitD, h: orbitD })),
          ];
          const violations = countArcViolations(pts, dims, vw, vh);
          if (!best || violations < best.violations) {
            best = { pillPts, circlePts, pillW: w, violations };
          }
          if (violations === 0) {
            return { pillPts, circlePts, pillW: w };
          }
        }
      }
    }
  }
  if (best) return { pillPts: best.pillPts, circlePts: best.circlePts, pillW: best.pillW };
  const fallback = arcPoints(cx, cy, 4, baseCenter, 150, 200);
  return {
    pillPts: fallback,
    circlePts: arcPoints(cx, cy, 4, baseCenter, 150, 90),
    pillW: args.pillW,
  };
}

export default function FloatingNav({
  activeKey,
  dashboardEntry,
  officeEntry,
  managementLabel,
  operationsLabel,
  managementItems,
  operationsItems,
  openMenuLabel,
  closeMenuLabel,
  onNavigate,
  dark,
  onToggleTheme,
  themeLabel,
  onOpenSettings,
  settingsLabel,
  onAccessRvb,
  rvbLabel,
  utilityActionIcon = "rvb",
  bell,
}: FloatingNavProps) {
  const [open, setOpen] = useState(false);
  // Deterministic initial state: server and FIRST client render must match.
  // Persisted/active-group/viewport values are restored in effects below,
  // after hydration, so the first paint never diverges from SSR.
  const [openGroup, setOpenGroup] = useState<NavGroupKey | null>(null);
  const [dock, setDock] = useState<DockPosition>(DEFAULT_DOCK_POSITION);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  // Route change closes the menu and reveals the active group.
  const [seenKey, setSeenKey] = useState(activeKey);
  if (seenKey !== activeKey) {
    setSeenKey(activeKey);
    setOpen(false);
    setOpenGroup(navGroupForKey(activeKey));
  }

  // Viewport tracking keeps the dock + fan geometry live on resize.
  // Initial real-viewport + persisted-dock restore happens here (post-
  // hydration) so SSR and the first client render stay byte-identical.
  useEffect(() => {
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    setDock(loadDock());
    function handleResize() {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    }
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Reveal the active group after hydration. Initial render stays null on
  // both server and client (hydration-safe); this effect settles it to the
  // route's group without touching SSR output.
  useEffect(() => {
    setOpenGroup(navGroupForKey(activeKey));
  }, [activeKey]);

  // Escape closes everything and returns focus to the launcher.
  useEffect(() => {
    if (!open) return;
    function handleEsc(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        setOpenGroup(null);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open ]);

  // Launcher click: with a submenu open, step back to the root fan;
  // otherwise toggle the whole menu.
  // Single authoritative click decision: open when closed, explicitly
  // close when open. Never toggles, so a close can never reopen.
  function handleLauncherClick() {
    if (open) {
      closeAll();
      return;
    }
    setOpen(true);
  }

  function closeAll() {
    setOpen(false);
    setOpenGroup(null);
  }

  function toggleGroup(group: NavGroupKey) {
    setOpenGroup((current) => (current === group ? null : group));
  }

  function go(path: string) {
    closeAll();
    onNavigate(path);
  }

  function persistDock(next: DockPosition) {
    setDock(next);
    try {
      window.localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  function handleTriggerPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const size = launcherSizeFor(viewport.w);
    const origin = dockXY(dock, viewport.w, viewport.h, size, EDGE_MARGIN_PX);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: dragPos ? dragPos.x : origin.x,
      originTop: dragPos ? dragPos.y : origin.y,
      moved: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
  }

  function handleTriggerPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    // First frame past the threshold: close any open menu, then drag.
    // Menu state is never touched again for the rest of this gesture.
    if (!drag.moved && open) closeAll();
    drag.moved = true;
    setDragPos({ x: drag.originLeft + dx, y: drag.originTop + dy });
  }

  function handleTriggerPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (!drag.moved) return;
    suppressClickRef.current = true;
    setDragPos(null);
    const size = launcherSizeFor(viewport.w);
    const cx = drag.originLeft + (event.clientX - drag.startX) + size / 2;
    const cy = drag.originTop + (event.clientY - drag.startY) + size / 2;
    const spanX = Math.max(1, viewport.w - EDGE_MARGIN_PX * 2 - size);
    const spanY = Math.max(1, viewport.h - EDGE_MARGIN_PX * 2 - size);
    const distances = {
      left: cx,
      right: viewport.w - cx,
      top: cy,
      bottom: viewport.h - cy,
    };
    let edge: DockEdge = "left";
    let best = distances.left;
    (Object.keys(distances) as DockEdge[]).forEach((candidate) => {
      if (distances[candidate] < best) {
        best = distances[candidate];
        edge = candidate;
      }
    });
    const offsetRatio =
      edge === "left" || edge === "right"
        ? Math.min(1, Math.max(0, (cy - EDGE_MARGIN_PX - size / 2) / spanY))
        : Math.min(1, Math.max(0, (cx - EDGE_MARGIN_PX - size / 2) / spanX));
    persistDock({ edge, offsetRatio });
  }

  function handleTriggerClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    handleLauncherClick();
  }

  const groups: ReadonlyArray<{
    key: NavGroupKey;
    label: string;
    items: readonly FloatingNavEntry[];
  }> = [
    { key: "management", label: managementLabel, items: managementItems },
    { key: "operations", label: operationsLabel, items: operationsItems },
  ];

  const compact = viewport.w < 700;
  const size = launcherSizeFor(viewport.w);
  const origin = dragPos ?? dockXY(dock, viewport.w, viewport.h, size, EDGE_MARGIN_PX);
  const cx = origin.x + size / 2;
  const cy = origin.y + size / 2;
  const vw = viewport.w;
  const vh = viewport.h;
  const baseCenter = baseCenterFor(dock.edge, dock.offsetRatio);

  type Positioned = { node: FanNode; x: number; y: number; w: number };

  // Root pills always solved (the active group pill anchors its children).
  const rootPillNodes: FanNode[] = [
    { kind: "pill", slot: "root-0", entry: dashboardEntry, active: activeKey === dashboardEntry.key, child: false, stagger: 0, onSelect: () => go(dashboardEntry.path) },
    { kind: "pill", slot: "root-1", entry: officeEntry, active: activeKey === officeEntry.key, child: false, stagger: 1, onSelect: () => go(officeEntry.path) },
    ...groups.map((group, gi) => ({
      kind: "group",
      slot: `root-g-${group.key}`,
      gkey: group.key,
      label: group.label,
      active: group.items.some((item) => item.key === activeKey),
      isOpen: openGroup === group.key,
      stagger: gi + 2,
    }) as FanNode),
  ];
  const orbitNodes: FanNode[] = [
    { kind: "bell", slot: "root-u-bell", stagger: 4 },
    { kind: "orbit", slot: "root-u-theme", label: themeLabel, stagger: 5, onSelect: () => { closeAll(); onToggleTheme(); }, content: dark ? "sun" : "moon" },
    { kind: "orbit", slot: "root-u-settings", label: settingsLabel, stagger: 6, onSelect: () => { closeAll(); onOpenSettings(); }, content: "settings" },
    { kind: "orbit", slot: "root-u-rvb", label: rvbLabel, stagger: 7, onSelect: () => { closeAll(); onAccessRvb(); }, content: utilityActionIcon },
  ];

  const rootPillW = compact ? 132 : 186;
  const rootPillH = compact ? 44 : 46;
  const orbitD = compact ? 44 : 40;
  const childPillW = compact ? 108 : 150;
  const rootSolution = solveRootFan({
    cx,
    cy,
    vw,
    vh,
    baseCenter,
    pillW: rootPillW,
    pillH: rootPillH,
    orbitD,
  });

  // Compact curved fan: single zigzagging column fanning inward.
  // Used on narrow screens where no true arc fits labeled pills.
  function layoutCompactColumn(
    nodes: FanNode[],
    widths: number[],
    pitch: number,
  ): Array<{ x: number; y: number; w: number }> {
    const dir = dock.edge === "left" || dock.edge === "top" ? 1 : -1;
    const vertical = dock.edge === "top" || dock.edge === "bottom";
    const maxW = Math.max(...widths);
    let baseX = vertical ? cx : cx + dir * (30 + 16 + maxW / 2);
    baseX = Math.min(Math.max(baseX, SAFE_PAD + maxW / 2), vw - SAFE_PAD - maxW / 2);
    let step = pitch;
    const minStep = 46;
    while ((nodes.length - 1) * step > vh - SAFE_PAD * 2 - 40 && step > minStep) step -= 2;
    let y0: number;
    let flowing: number[];
    if (vertical) {
      y0 = cy + dir * (30 + 16 + 22);
      flowing = widths.map((_, i) => y0 + dir * i * step);
      const half = 22;
      const top = Math.min(...flowing) - half;
      const bottom = Math.max(...flowing) + half;
      let dy = 0;
      if (top < SAFE_PAD) dy = SAFE_PAD - top;
      else if (bottom > vh - SAFE_PAD) dy = vh - SAFE_PAD - bottom;
      flowing = flowing.map((y) => y + dy);
    } else {
      y0 = cy - ((nodes.length - 1) * step) / 2;
      y0 = Math.min(Math.max(y0, SAFE_PAD + 22), vh - SAFE_PAD - 22 - (nodes.length - 1) * step);
      flowing = widths.map((_, i) => y0 + i * step);
    }
    return widths.map((w, i) => {
      const zig = i % 2 === 0 ? 0 : 10;
      const x = Math.min(Math.max(baseX + zig, SAFE_PAD + w / 2), vw - SAFE_PAD - w / 2);
      return { x, y: flowing[i], w };
    });
  }

  const positioned: Positioned[] = [];
  // Near-corner desktop: TRUE quarter-circle polar fan around the launcher
  // origin. Pills ride two outer radial bands, utility orbitals ride a
  // tighter inner sub-arc at independent angles. No rows, no columns,
  // no stacks — ever.
  // Memoized: the scored joint search validates ~100k+ candidates and must
  // not re-run on every render (only geometry inputs matter, not menu state).
  const cornerInfo = !compact ? detectCorner(cx, cy, vw, vh) : null;
  const cornerAngle = cornerInfo ? cornerInfo.angle : 0;
  const cornerRoot = useMemo(
    () =>
      cornerInfo
        ? solveCornerRootFan({
            cx,
            cy,
            vw,
            vh,
            angle: cornerInfo.angle,
            pillW: rootPillW,
            pillH: rootPillH,
            orbitD,
            launcherD: size,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cx, cy, vw, vh, cornerAngle, rootPillW, rootPillH, orbitD],
  );
  if (cornerRoot && !openGroup) {
    rootPillNodes.forEach((node, i) => {
      positioned.push({
        node,
        x: cornerRoot.pillPts[i].x,
        y: cornerRoot.pillPts[i].y,
        w: cornerRoot.pillW,
      });
    });
    orbitNodes.forEach((node, i) => {
      positioned.push({
        node,
        x: cornerRoot.circlePts[i].x,
        y: cornerRoot.circlePts[i].y,
        w: orbitD,
      });
    });
  } else if (cornerRoot && openGroup) {
    const groupIndex = openGroup === "management" ? 2 : 3;
    const groupNode = rootPillNodes[groupIndex];
    const groupPos = {
      x: cornerRoot.pillPts[groupIndex].x,
      y: cornerRoot.pillPts[groupIndex].y,
    };
    positioned.push({ node: groupNode, x: groupPos.x, y: groupPos.y, w: cornerRoot.pillW });
    const group = groups.find((g) => g.key === openGroup);
    if (group) {
      // Children fan around the MANAGEMENT pill anchor (not the launcher)
      // on a compact quarter arc directed further inward.
      const parentAngle = (Math.atan2(groupPos.y - cy, groupPos.x - cx) / DEG + 360) % 360;
      const childFixed: FixedBox[] = [
        { x: groupPos.x, y: groupPos.y, w: cornerRoot.pillW, h: rootPillH },
        ...cornerRoot.circlePts.map((p) => ({ x: p.x, y: p.y, w: orbitD, h: orbitD })),
      ];
      const childSol = solvePolarFan({
        ax: groupPos.x,
        ay: groupPos.y,
        n: group.items.length,
        pillW: childPillW,
        pillH: 44,
        vw,
        vh,
        baseCenter: parentAngle,
        spreads: [90, 110, 130, 70],
        radii: [140, 160, 180, 200, 220],
        widthScales: [0.9, 0.8, 0.7],
        minW: 96,
        rotations: [0, 10, -10, 20, -20, 30, -30, 40, -40],
        ringSteps: [0, 55],
        fixed: childFixed,
      });
      if (childSol) {
        group.items.forEach((item, itemIndex) => {
          positioned.push({
            node: {
              kind: "pill",
              slot: `child-${item.key}`,
              entry: item,
              active: activeKey === item.key,
              child: true,
              stagger: itemIndex,
              onSelect: () => go(item.path),
            },
            x: childSol.pts[itemIndex].x,
            y: childSol.pts[itemIndex].y,
            w: childSol.w,
          });
        });
      }
    }
    orbitNodes.forEach((node, i) => {
      positioned.push({
        node,
        x: cornerRoot.circlePts[i].x,
        y: cornerRoot.circlePts[i].y,
        w: orbitD,
      });
    });
  } else if (compact) {
    // One ordered column: group pill (if open) otherwise root pills,
    // then visible children (if any), then utilities.
    const activeGroup = openGroup ? groups.find((g) => g.key === openGroup) ?? null : null;
    const columnNodes: FanNode[] = [];
    const columnWidths: number[] = [];
    if (activeGroup) {
      const groupNode = rootPillNodes[openGroup === "management" ? 2 : 3];
      columnNodes.push(groupNode);
      columnWidths.push(rootPillW);
      activeGroup.items.forEach((item) => {
        columnNodes.push({
          kind: "pill",
          slot: `child-${item.key}`,
          entry: item,
          active: activeKey === item.key,
          child: true,
          stagger: columnNodes.length,
          onSelect: () => go(item.path),
        });
      });
      for (let k = 0; k < activeGroup.items.length; k += 1) columnWidths.push(childPillW);
    } else {
      rootPillNodes.forEach((node) => {
        columnNodes.push(node);
        columnWidths.push(rootPillW);
      });
    }
    orbitNodes.forEach((node) => {
      columnNodes.push(node);
      columnWidths.push(orbitD);
    });
    const pitch = activeGroup ? 54 : 56;
    const pts = layoutCompactColumn(columnNodes, columnWidths, pitch);
    pts.forEach((p, i) => {
      positioned.push({ node: columnNodes[i], x: p.x, y: p.y, w: p.w });
    });
  } else if (!openGroup) {
    rootPillNodes.forEach((node, i) => {
      positioned.push({ node, x: rootSolution.pillPts[i].x, y: rootSolution.pillPts[i].y, w: rootSolution.pillW });
    });
    orbitNodes.forEach((node, i) => {
      positioned.push({ node, x: rootSolution.circlePts[i].x, y: rootSolution.circlePts[i].y, w: orbitD });
    });
  } else {
    const groupIndex = openGroup === "management" ? 2 : 3;
    const groupNode = rootPillNodes[groupIndex];
    const groupPos = { x: rootSolution.pillPts[groupIndex].x, y: rootSolution.pillPts[groupIndex].y };
    positioned.push({ node: groupNode, x: groupPos.x, y: groupPos.y, w: rootSolution.pillW });
    const group = groups.find((g) => g.key === openGroup);
    if (group) {
      const parentAngle = (Math.atan2(groupPos.y - cy, groupPos.x - cx) / DEG + 360) % 360;
      // The open group pill + utility orbitals stay visible: children
      // must clear them as well as the viewport and each other.
      const childFixed: FixedBox[] = [
        { x: groupPos.x, y: groupPos.y, w: rootSolution.pillW, h: rootPillH },
        ...rootSolution.circlePts.map((p) => ({ x: p.x, y: p.y, w: orbitD, h: orbitD })),
      ];
      const childSol = solveArc({
        ax: groupPos.x,
        ay: groupPos.y,
        n: group.items.length,
        pillW: compact ? 108 : 150,
        pillH: 44,
        vw,
        vh,
        baseCenter: parentAngle,
        minRadius: compact ? 110 : 120,
        fixed: childFixed,
        spreads: [170, 150, 130, 110],
      });
      group.items.forEach((item, itemIndex) => {
        positioned.push({
          node: {
            kind: "pill",
            slot: `child-${item.key}`,
            entry: item,
            active: activeKey === item.key,
            child: true,
            stagger: itemIndex,
            onSelect: () => go(item.path),
          },
          x: childSol.pts[itemIndex].x,
          y: childSol.pts[itemIndex].y,
          w: childSol.pillW,
        });
      });
    }
    orbitNodes.forEach((node, i) => {
      positioned.push({ node, x: rootSolution.circlePts[i].x, y: rootSolution.circlePts[i].y, w: orbitD });
    });
  }

  // Final guard: shift the solved fan minimally so every box clears the
  // viewport. Relative geometry is preserved; only applied when needed.
  if (positioned.length > 0) {
    const dims = positioned.map((p) => {
      if (p.node.kind === "orbit" || p.node.kind === "bell") return { w: orbitD, h: orbitD };
      if (p.node.kind === "pill" && p.node.child) return { w: p.w, h: 44 };
      return { w: p.w, h: rootPillH };
    });
    const clamped = clampFanInside(
      positioned.map((p) => ({ x: p.x, y: p.y })),
      dims,
      vw,
      vh,
    );
    clamped.forEach((c, i) => {
      positioned[i].x = c.x;
      positioned[i].y = c.y;
    });
  }

  // Shared radial engine: "sun"/"moon"/"settings"/"rvb" serve HSH.
  // "hsh" (Access HSH) and "signout" serve RVB floating mode only —
  // HSH never passes them, so HSH rendering is unchanged.
  function renderUtilityContent(node: Extract<FanNode, { kind: "orbit" }>) {
    if (node.content === "sun") return <Sun size={18} strokeWidth={2} aria-hidden="true" />;
    if (node.content === "moon") return <Moon size={18} strokeWidth={2} aria-hidden="true" />;
    if (node.content === "settings") return <SettingsIcon size={18} strokeWidth={2} aria-hidden="true" />;
    if (node.content === "hsh") return <Factory size={18} strokeWidth={2} aria-hidden="true" />;
    if (node.content === "signout") return <LogOut size={18} strokeWidth={2} aria-hidden="true" />;
    return <Store size={18} strokeWidth={2} aria-hidden="true" />;
  }

  function renderNode(item: Positioned) {
    const { node } = item;
    const shown = open;
    // Node coordinates are viewport-space; the fan field is rooted at
    // the launcher box origin, so translate into root-relative space.
    // Width comes from the solver so layout math and paint never drift.
    const placed_style = {
      left: item.x - origin.x,
      top: item.y - origin.y,
      width: item.w,
      ["--fan-index" as string]: node.stagger,
    } as React.CSSProperties;
    if (node.kind === "pill") {
      const Icon = node.entry.icon;
      return (
        <button
          key={node.slot}
          type="button"
          role="menuitem"
          data-shown={shown ? "1" : "0"}
          tabIndex={shown ? 0 : -1}
          aria-hidden={!shown}
          style={placed_style}
          className={`${styles.pill} ${node.child ? styles.childPill : ""} ${
            node.active ? styles.pillActive : ""
          }`}
          onClick={node.onSelect}
          aria-label={node.entry.label}
          aria-current={node.active ? "page" : undefined}
        >
          <span className={styles.pillIcon} aria-hidden="true">
            <Icon size={18} strokeWidth={2} />
          </span>
          <span className={styles.pillLabel}>{node.entry.label}</span>
        </button>
      );
    }
    if (node.kind === "group") {
      const GroupIcon = GROUP_ICONS[node.gkey];
      return (
        <button
          key={node.slot}
          type="button"
          role="menuitem"
          data-shown={shown ? "1" : "0"}
          tabIndex={shown ? 0 : -1}
          aria-hidden={!shown}
          style={placed_style}
          className={`${styles.pill} ${node.active ? styles.pillGroupActive : ""} ${node.isOpen ? styles.pillOpen : ""}`}
          onClick={() => toggleGroup(node.gkey)}
          aria-expanded={node.isOpen}
          aria-label={node.label}
        >
          <span className={styles.pillIcon} aria-hidden="true">
            <GroupIcon size={18} strokeWidth={2} />
          </span>
          <span className={styles.pillLabel}>{node.label}</span>
          <span
            className={`${styles.groupChevron} ${node.isOpen ? styles.groupChevronOpen : ""}`}
            aria-hidden="true"
          >
            <ChevronDown size={16} strokeWidth={2} />
          </span>
        </button>
      );
    }
    if (node.kind === "bell") {
      return (
        <span
          key={node.slot}
          data-shown={shown ? "1" : "0"}
          aria-hidden={!shown}
          style={placed_style}
          className={styles.orbitAnchor}
        >
          <span className={styles.bellWrap}>{bell}</span>
        </span>
      );
    }
    return (
      <button
        key={node.slot}
        type="button"
        role="menuitem"
        data-shown={shown ? "1" : "0"}
        tabIndex={shown ? 0 : -1}
        aria-hidden={!shown}
        style={placed_style}
        className={styles.orbit}
        onClick={node.onSelect}
        aria-label={node.label}
        title={node.label}
      >
        <span className={styles.orbitIcon} aria-hidden="true">
          {renderUtilityContent(node)}
        </span>
      </button>
    );
  }

  return (
    <div
      data-nav-root="floating"
      className={`${styles.root} ${open ? styles.rootOpen : ""} ${dragPos ? styles.rootDragging : ""}`}
      style={dragPos ? { left: dragPos.x, top: dragPos.y } : { left: origin.x, top: origin.y }}
    >
      {open && (
        <button
          type="button"
          className={styles.backdrop}
          aria-label={closeMenuLabel}
          onClick={closeAll}
          tabIndex={-1}
        />
      )}

      <button
        ref={triggerRef}
        type="button"
        className={`${styles.launcher} ${open ? styles.launcherOpen : ""}`}
        onPointerDown={handleTriggerPointerDown}
        onPointerMove={handleTriggerPointerMove}
        onPointerUp={handleTriggerPointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
          setDragPos(null);
        }}
        onClick={handleTriggerClick}
        aria-expanded={open}
        aria-label={open ? closeMenuLabel : openMenuLabel}
      >
        <span className={styles.launcherIcon} aria-hidden="true">
          {open ? (
            <X size={24} strokeWidth={2} />
          ) : (
            <Menu size={24} strokeWidth={2} />
          )}
        </span>
      </button>

      <nav className={styles.fan} aria-label={openMenuLabel} role="menu">
        {positioned.map((item) => renderNode(item))}
      </nav>
    </div>
  );
}
