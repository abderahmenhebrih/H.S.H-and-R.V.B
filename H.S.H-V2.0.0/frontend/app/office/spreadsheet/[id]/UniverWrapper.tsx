"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { OfficeFile } from "../../../../src/types/entities/office-file";
import type { Language } from "../../../../src/types/settings/settings";
import { getCellValue, getCellDisplayValue, getSheetBounds } from "../../../../src/lib/office/sheet-data";
import "@univerjs/preset-sheets-core/lib/index.css";
import styles from "./page.module.css";

type Props = {
  file: OfficeFile;
  onSave: (snapshot: any) => void | Promise<void>;
  language: Language;
  defaultSheetName?: string;
};

export type UniverHandle = {
  insertValue: (value: string) => Promise<{ success: boolean; error?: string }>;
  insertTable: (entityType: string, rows: any[]) => Promise<{ success: boolean; sheetId?: string; error?: string }>;
  exportCSV: () => Promise<string | null>;
  exportXLSX: () => Promise<Blob | null>;
  getSnapshot: () => any | null;
  flushSave: () => void;
  getMode: () => "univer" | "simple-fallback" | "complex-fallback";
};

export function isComplexWorkbook(content: any): boolean {
  if (!content || typeof content !== "object") return false;
  const sheets = content.sheets;
  if (!sheets) return false;
  if (!Array.isArray(sheets)) return true;
  if (sheets.length > 1) return true;
  if ((content as any).sheetOrder && Array.isArray((content as any).sheetOrder) && (content as any).sheetOrder.length > 1) return true;
  const first = sheets[0];
  if (!first) return false;
  if (first.mergeData && Array.isArray(first.mergeData) && first.mergeData.length > 0) return true;
  if (first.mergeData && typeof first.mergeData === "object" && Object.keys(first.mergeData).length>0) return true;
  if (first.data) {
    for (const v of Object.values(first.data) as any[]) {
      if (v && typeof v === "object" && (v.f !== undefined || v.si !== undefined || v.s !== undefined)) return true;
    }
  }
  return false;
}

function getLocalizedFallbackSheetName(lang: Language, explicit?: string): string {
  if (explicit) return explicit;
  if (lang === "fr") return "Feuille 1";
  if (lang === "ar") return "ورقة 1";
  return "Sheet 1";
}

const UniverWrapper = forwardRef<UniverHandle, Props>(function UniverWrapper({ file, onSave, language, defaultSheetName }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const univerRef = useRef<any>(null);
  const apiRef = useRef<any>(null);
  const [fallback, setFallback] = useState(false);
  const saveTimerRef = useRef<any>(null);
  const lastSnapshotRef = useRef<string>("");

  // Helper to get snapshot from Univer
  const getSnapshot = () => {
    try {
      const api = apiRef.current;
      if (!api) return null;
      const wb = api.getActiveWorkbook?.();
      if (wb?.save) return wb.save();
      if (wb?.getSnapshot) return wb.getSnapshot();
      // alternative: api.getWorkbookData
      if (api.getWorkbookData) return api.getWorkbookData();
      return null;
    } catch { return null; }
  };

  const scheduleSave = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const snap = getSnapshot();
      if (!snap) return;
      const str = JSON.stringify(snap);
      if (str === lastSnapshotRef.current) return;
      lastSnapshotRef.current = str;
      void onSave(snap);
    }, 900);
  };

  const flushSave = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const snap = getSnapshot();
    if (!snap) return;
    const str = JSON.stringify(snap);
    if (str === lastSnapshotRef.current) return;
    lastSnapshotRef.current = str;
    void onSave(snap);
  };

  const getMode = (): "univer" | "simple-fallback" | "complex-fallback" => {
    try {
      const api = apiRef.current;
      const wb = api?.getActiveWorkbook?.();
      const hasUniver = !!wb && !fallback;
      if (hasUniver) return "univer";
    } catch {}
    if (isComplexWorkbook(file.content)) return "complex-fallback";
    return "simple-fallback";
  };

  useImperativeHandle(ref, () => ({
    getMode: () => getMode(),
    insertValue: async (value: string): Promise<{ success: boolean; error?: string }> => {
      const mode = getMode();
      if (mode === "complex-fallback") {
        return { success: false, error: "READ_ONLY_COMPLEX" };
      }
      if (mode === "simple-fallback") {
        try {
          const content: any = file.content;
          let nextContent: any;
          if (Array.isArray(content?.sheets)) {
            const sheet = content.sheets[0] as any;
            const data = sheet?.data || {};
            let found: string | null = null;
            for (let r = 0; r < 40; r++) { for (let c = 0; c < 10; c++) { const k = `${r},${c}`; if (!data[k]) { found = k; break; } } if (found) break; }
            const key = found || "0,0";
            const nextData = { ...data, [key]: { v: value } };
            const nextSheet = { ...sheet, data: nextData };
            nextContent = { ...content, sheets: [nextSheet, ...content.sheets.slice(1)] };
          } else if (content?.sheets && typeof content.sheets === "object" && !Array.isArray(content.sheets)) {
            const sheetsObj = content.sheets as any;
            const firstId = content.sheetOrder?.[0] || Object.keys(sheetsObj)[0];
            if (!firstId || !sheetsObj[firstId]) return { success: false, error: "No sheet" };
            const sh = sheetsObj[firstId];
            const cellData = sh.cellData || {};
            let found: string | null = null;
            for (let r = 0; r < 40; r++) {
              if (!cellData[r]) { found = `${r},0`; break; }
              const row = cellData[r];
              let emptyCol = -1;
              for (let c = 0; c < 10; c++) { if (!row[c]) { emptyCol = c; break; } }
              if (emptyCol !== -1) { found = `${r},${emptyCol}`; break; }
              if (Object.keys(row).length < 10) { found = `${r},${Object.keys(row).length}`; break; }
            }
            const key = found || "0,0";
            const [rr, cc] = key.split(",").map(Number);
            const nextCellData = { ...cellData, [rr]: { ...(cellData[rr] || {}), [cc]: { v: value, m: String(value) } } };
            const nextSheets = { ...sheetsObj, [firstId]: { ...sh, cellData: nextCellData } };
            nextContent = { ...content, sheets: nextSheets };
          } else {
            const data = { "0,0": { v: value } };
            nextContent = { sheets: [{ id: "sheet-1", name: getLocalizedFallbackSheetName(language, defaultSheetName), data, rowCount: 100, colCount: 20 }], activeSheetId: "sheet-1" };
          }
          try { lastSnapshotRef.current = JSON.stringify(nextContent); } catch {}
          await onSave(nextContent);
          return { success: true };
        } catch (e) { const msg = e instanceof Error ? e.message : String(e); console.error("insertValue fallback failed", e); return { success: false, error: msg }; }
      }
      // univer mode
      try {
        const api = apiRef.current;
        const wb = api?.getActiveWorkbook?.();
        if (!wb) return { success: false, error: "Workbook not available" };
        const sheet = (wb as any)?.getActiveSheet?.() || (wb as any)?.getActiveWorksheet?.();
        let mutated = false;
        if (sheet) {
          const range = (sheet as any).getActiveRange?.() || (sheet as any).getSelection?.();
          if (range?.setValue) {
            range.setValue(value);
            mutated = true;
          } else if ((sheet as any).setCellValue) {
            const sel = (sheet as any).getActiveRange?.();
            const row = sel?.getRow?.() ?? 0;
            const col = sel?.getColumn?.() ?? 0;
            (sheet as any).setCellValue(row, col, value);
            mutated = true;
          }
        }
        if (!mutated && (api as any)?.insertValue) {
          try { (api as any).insertValue(value); mutated = true; } catch {}
        }
        if (mutated) {
          const snap = getSnapshot();
          if (snap) {
            const str = JSON.stringify(snap);
            lastSnapshotRef.current = str;
            await onSave(snap);
          } else {
            scheduleSave();
          }
          return { success: true };
        }
        return { success: false, error: "No active workbook/sheet" };
      } catch (e) { const msg = e instanceof Error ? e.message : String(e); console.error("insertValue failed", e); return { success: false, error: msg }; }
    },
    getSnapshot: () => getSnapshot(),
    flushSave: () => flushSave(),
    insertTable: async (entityType: string, rows: any[]): Promise<{ success: boolean; sheetId?: string; error?: string }> => {
      const mode = getMode();
      if (mode === "complex-fallback") {
        return { success: false, error: "READ_ONLY_COMPLEX" };
      }
      if (mode === "simple-fallback") {
        try {
          const content: any = file.content;
          const header = Object.keys(rows[0] || {});
          const data: any = {};
          header.forEach((h, c) => data[`0,${c}`] = { v: h });
          rows.forEach((row: any, rIdx: number) => {
            header.forEach((h, c) => {
              const val = row[h];
              data[`${rIdx + 1},${c}`] = { v: String(val ?? "") };
            });
          });
          const newSheetId = `sheet-${Date.now()}`;
          const newSheet = { id: newSheetId, name: entityType.slice(0, 12), data, rowCount: rows.length + 5, colCount: header.length };
          let nextContent: any;
          if (content && content.sheets && Array.isArray(content.sheets)) {
            nextContent = { ...content, sheets: [...content.sheets, newSheet], activeSheetId: newSheetId };
          } else if (content && content.sheets && typeof content.sheets === "object" && !Array.isArray(content.sheets)) {
            const sheetMap = content.sheets || {};
            nextContent = { ...content, sheets: { ...sheetMap, [newSheetId]: { id: newSheetId, name: entityType, cellData: data, rowCount: rows.length + 5, columnCount: header.length } }, sheetOrder: [...(content.sheetOrder || Object.keys(sheetMap)), newSheetId] };
          } else {
            nextContent = { sheets: [newSheet], activeSheetId: newSheetId };
          }
          try { lastSnapshotRef.current = JSON.stringify(nextContent); } catch {}
          await onSave(nextContent);
          return { success: true, sheetId: newSheetId };
        } catch (e) { const msg = e instanceof Error ? e.message : String(e); console.error("insertTable fallback failed", e); return { success: false, error: msg }; }
      }
      // univer mode with rollback
      let newSheet: any = null;
      let newSheetId: string | undefined = undefined;
      let preSnapshot: any = null;
      let preStr: string | null = null;
      try {
        const api = apiRef.current;
        const wb = api?.getActiveWorkbook?.();
        if (!wb) return { success: false, error: "Workbook not available" };
        // capture preSnapshot before insertion
        try { preSnapshot = getSnapshot(); preStr = preSnapshot ? JSON.stringify(preSnapshot) : null; } catch {}
        const header = Object.keys(rows[0] || {});
        // Insert Table is NEW-SHEET operation — must not fallback to active sheet
        try {
          if ((wb as any).insertSheet) {
            newSheet = (wb as any).insertSheet(entityType.slice(0, 20));
            newSheetId = newSheet?.getSheetId?.() || newSheet?.getId?.() || newSheet?.id || undefined;
          } else if ((wb as any).create) {
            newSheet = (wb as any).create(entityType.slice(0, 20), rows.length + 5, header.length);
            newSheetId = newSheet?.getSheetId?.() || newSheet?.getId?.() || newSheet?.id || undefined;
          } else if ((wb as any).createSheet) {
            newSheet = (wb as any).createSheet(entityType.slice(0, 20));
            newSheetId = newSheet?.getSheetId?.() || newSheet?.getId?.() || newSheet?.id || undefined;
          } else if ((wb as any).addSheet) {
            newSheet = (wb as any).addSheet(entityType);
            newSheetId = newSheet?.getSheetId?.() || newSheet?.getId?.() || newSheet?.id || undefined;
          } else {
            return { success: false, error: "New sheet creation not available" };
          }
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        if (!newSheet) return { success: false, error: "Failed to create new sheet" };
        const targetSheet = newSheet;
        // set header — collect failures
        let writeErrors = 0;
        header.forEach((h, c) => {
          let ok = false;
          try { targetSheet.getRange?.(0, c)?.setValue?.(h); ok = true; } catch {}
          try { if (!ok) { targetSheet.setCellValue?.(0, c, h); ok = true; } } catch { ok = false; }
          if (!ok) writeErrors++;
        });
        rows.forEach((row, rIdx) => {
          header.forEach((h, c) => {
            const v = row[h];
            let ok = false;
            try { targetSheet.getRange?.(rIdx+1, c)?.setValue?.(String(v ?? "")); ok = true; } catch {}
            try { if (!ok) { targetSheet.setCellValue?.(rIdx+1, c, String(v ?? "")); ok = true; } } catch { ok = false; }
            if (!ok) writeErrors++;
          });
        });
        if (writeErrors > 0) {
          // rollback: remove newSheet, restore lastSnapshotRef, do not scheduleSave
          try {
            const sheetIdToDelete = newSheetId || newSheet?.getSheetId?.() || newSheet?.id;
            if (sheetIdToDelete) {
              if (typeof (wb as any).deleteSheet === "function") {
                try { (wb as any).deleteSheet(sheetIdToDelete); } catch {}
                try { (wb as any).deleteSheet(newSheet); } catch {}
              } else if (typeof (wb as any).removeSheet === "function") {
                try { (wb as any).removeSheet(sheetIdToDelete); } catch {}
              } else if (typeof (api as any).deleteSheet === "function") {
                try { (api as any).deleteSheet(sheetIdToDelete); } catch {}
              } else if (preSnapshot && typeof (api as any).loadSnapshot === "function") {
                try { (api as any).loadSnapshot(preSnapshot); } catch {}
              } else if (preSnapshot && (wb as any).getSnapshot && preStr) {
                // best effort: no direct restore, rely on deleteSheet above
              }
            }
          } catch {}
          if (preStr !== null) lastSnapshotRef.current = preStr;
          return { success: false, error: `Failed to write ${writeErrors} cells` };
        }
        const snap = getSnapshot();
        if (snap) {
          const str = JSON.stringify(snap);
          lastSnapshotRef.current = str;
          await onSave(snap);
        } else {
          scheduleSave();
        }
        return { success: true, sheetId: newSheetId };
      } catch (e) {
        // any throw: rollback newly created sheet if exists
        try {
          const api = apiRef.current;
          const wb = api?.getActiveWorkbook?.();
          if (newSheet) {
            const sheetIdToDelete = newSheetId || newSheet?.getSheetId?.() || newSheet?.id;
            if (sheetIdToDelete) {
              if (wb && typeof (wb as any).deleteSheet === "function") {
                try { (wb as any).deleteSheet(sheetIdToDelete); } catch {}
                try { (wb as any).deleteSheet(newSheet); } catch {}
              } else if (wb && typeof (wb as any).removeSheet === "function") {
                try { (wb as any).removeSheet(sheetIdToDelete); } catch {}
              } else if (api && typeof (api as any).deleteSheet === "function") {
                try { (api as any).deleteSheet(sheetIdToDelete); } catch {}
              } else if (preSnapshot && api && typeof (api as any).loadSnapshot === "function") {
                try { (api as any).loadSnapshot(preSnapshot); } catch {}
              }
            }
          }
        } catch {}
        if (preStr !== null) lastSnapshotRef.current = preStr;
        const msg = e instanceof Error ? e.message : String(e); console.error("insertTable failed", e); return { success: false, error: msg };
      }
    },
    exportCSV: async () => {
      try {
        const snap = getSnapshot();
        if (!snap) return null;
        // Convert snapshot to CSV via canonical helper supporting flat and nested
        const sheets = snap.sheets || {};
        const firstId = snap.sheetOrder?.[0] || Object.keys(sheets)[0];
        const sheet = sheets[firstId];
        if (!sheet) return null;
        const cellData = sheet.cellData || {};
        const { maxRow, maxCol } = getSheetBounds(cellData);
        if (maxRow < 0 || maxCol < 0) return "";
        const rows: string[][] = [];
        for (let r = 0; r <= maxRow; r++) {
          const row: string[] = [];
          for (let c = 0; c <= maxCol; c++) {
            const cell = getCellValue(cellData, r, c);
            const v = getCellDisplayValue(cell ?? "");
            row.push(`"${String(v).replace(/"/g, '""')}"`);
          }
          rows.push(row);
        }
        const csv = rows.map((r) => r.join(",")).join("\n");
        return csv;
      } catch (e) { console.error(e); return null; }
    },
    exportXLSX: async () => {
      try {
        const api = apiRef.current;
        const snap = getSnapshot();
        if (!snap) return null;
        if (api?.exportSheetBySnapshotAsync) {
          const file = await api.exportSheetBySnapshotAsync(snap);
          return file as Blob;
        }
        return null;
      } catch (e) { console.error(e); return null; }
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let univer: any = null;
    let dispose: (()=>void) | null = null;

    async function mount() {
      const host = containerRef.current;
      if (!host) return;
      // Guard: never initialize Univer with non-positive container dimensions
      // This prevents "The column width is less than 0" from docs layout engine (pageWidth <= margins)
      // Wait until host has valid positive finite width/height before creating Univer instance.
      const MIN_WIDTH = 80;
      const MIN_HEIGHT = 120;
      const isValidSize = () => {
        if (!host.isConnected) return false;
        const rect = host.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        if (!Number.isFinite(w) || !Number.isFinite(h)) return false;
        if (w <= 0 || h <= 0) return false;
        if (w < MIN_WIDTH || h < MIN_HEIGHT) return false;
        const cs = window.getComputedStyle(host);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        return true;
      };
      if (!isValidSize()) {
        await new Promise<void>((resolve) => {
          let done = false;
          let ro: ResizeObserver | null = null;
          let timer: any = null;
          const finish = () => {
            if (done) return;
            done = true;
            try { ro?.disconnect(); } catch {}
            if (timer) clearTimeout(timer);
            resolve();
          };
          ro = new ResizeObserver(() => {
            if (isValidSize()) finish();
          });
          try { ro.observe(host); } catch { finish(); return; }
          // Also observe documentElement for viewport resize that may affect host
          try { ro.observe(document.documentElement); } catch {}
          timer = setTimeout(() => finish(), 4000);
          if (isValidSize()) finish();
        });
        if (cancelled) return;
        if (!isValidSize()) {
          const rect = host.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0 || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) {
            console.warn("[UniverWrapper] container size still non-positive after wait, aborting Univer init to avoid negative column width", rect);
            return;
          }
          // If size is finite but still below minimum, still abort to avoid negative column calculation
          if (rect.width < MIN_WIDTH || rect.height < MIN_HEIGHT) {
            console.warn("[UniverWrapper] container below minimum, aborting init", rect);
            return;
          }
        }
      }
      // Clear host
      host.innerHTML = "";
      const container = document.createElement("div");
      container.style.height = "100%";
      container.style.width = "100%";
      host.appendChild(container);
      hostRef.current = container;

      try {
        // Patch Univer sheets-ui formula editor to prevent negative column width error
        // Root cause: EditorDataSyncController._checkAndSetRenderStyleConfig sets pageSize.width to position.width
        // even when position.width is 0 (hidden/focus/layout zero), causing DocumentSkeleton column.width <=0
        // Fix: guard against non-positive width and keep Infinity fallback until valid measurement
        try {
          const sheetsUi: any = await import("@univerjs/sheets-ui");
          for (const k of Object.keys(sheetsUi)) {
            const Cls = sheetsUi[k];
            if (Cls && Cls.prototype && typeof Cls.prototype._checkAndSetRenderStyleConfig === "function") {
              const orig = Cls.prototype._checkAndSetRenderStyleConfig;
              Cls.prototype._checkAndSetRenderStyleConfig = function(doc: any) {
                try {
                  const pos = this._formulaEditorManagerService?.getPosition?.();
                  if (pos && (pos.width <= 0 || !Number.isFinite(pos.width) || pos.height <= 0 || !Number.isFinite(pos.height))) {
                    return;
                  }
                } catch {}
                return orig.call(this, doc);
              };
            }
            if (Cls && Cls.prototype && typeof Cls.prototype.getPosition === "function" && typeof Cls.prototype.setPosition === "function") {
              const origGet = Cls.prototype.getPosition;
              const origSet = Cls.prototype.setPosition;
              Cls.prototype.getPosition = function() {
                const pos = origGet.call(this);
                if (pos && (pos.width <= 0 || !Number.isFinite(pos.width) || pos.height <= 0)) return null;
                return pos;
              };
              Cls.prototype.setPosition = function(p: any) {
                if (p && (p.width <= 0 || !Number.isFinite(p.width) || p.height <= 0 || !Number.isFinite(p.height))) {
                  return;
                }
                return origSet.call(this, p);
              };
            }
          }
        } catch (e) {
          // patch optional, continue
        }

        // Dynamically import Univer presets (avoid bundling if fails)
        const { createUniver, LocaleType, mergeLocales } = await import("@univerjs/presets");
        const { UniverSheetsCorePreset } = await import("@univerjs/preset-sheets-core");
        let UniverPresetSheetsCoreEnUS: any, UniverPresetSheetsCoreFrFR: any, UniverPresetSheetsCoreAr: any;
        try {
          UniverPresetSheetsCoreEnUS = (await import("@univerjs/preset-sheets-core/locales/en-US")).default;
        } catch {}
        try { UniverPresetSheetsCoreEnUS = UniverPresetSheetsCoreEnUS || {}; } catch {}

        const localeMap: any = {
          en: LocaleType.EN_US,
          fr: (LocaleType as any).FR_FR || LocaleType.EN_US,
          ar: (LocaleType as any).AR || LocaleType.EN_US,
        };
        const locale = localeMap[language] || LocaleType.EN_US;
        const locales: any = {
          [LocaleType.EN_US]: UniverPresetSheetsCoreEnUS ? mergeLocales(UniverPresetSheetsCoreEnUS) : {},
        };
        // Try to load snapshot from file.content if it looks like Univer snapshot
        let snapshot: any = undefined;
        const content: any = file.content;
        if (content && typeof content === "object") {
          // Detect Univer snapshot: has sheets object and sheetOrder or id
          const isUniverSnapshot = content.sheets && (content.sheetOrder || content.id || typeof content.sheets === "object" && !Array.isArray(content.sheets));
          const isCustomArray = Array.isArray(content.sheets);
          if (isUniverSnapshot && !isCustomArray) {
            snapshot = content;
          } else if (isCustomArray) {
            // Convert custom array format to Univer IWorkbookData
            const sheetOrder: string[] = [];
            const sheets: any = {};
            for (const sh of content.sheets) {
              const sid = sh.id || `sheet-${sheetOrder.length+1}`;
              sheetOrder.push(sid);
              // Convert flat data map "r,c" to Univer cellData nested
              const cellData: any = {};
              if (sh.data) {
                Object.entries(sh.data).forEach(([k, v]: any) => {
                  const [r,c] = k.split(",").map(Number);
                  if (!cellData[r]) cellData[r] = {};
                  cellData[r][c] = { v: v.v ?? v, m: String(v.v ?? v) };
                });
              }
              sheets[sid] = {
                id: sid,
                name: sh.name || getLocalizedFallbackSheetName(language),
                tabColor: "",
                hidden: 0,
                rowCount: sh.rowCount || 100,
                columnCount: sh.colCount || 20,
                zoomRatio: 1,
                scrollTop: 0,
                scrollLeft: 0,
                defaultColumnWidth: 93,
                defaultRowHeight: 27,
                mergeData: [],
                cellData,
                rowData: {},
                columnData: {},
              };
            }
            snapshot = {
              id: `workbook-${file.id}`,
              name: file.title,
              appVersion: "0.1.0",
              locale,
              styles: {},
              sheetOrder,
              sheets,
            };
          }
        }

        const res = createUniver({
          locale,
          locales,
          presets: [
            UniverSheetsCorePreset({ container }),
          ],
        });
        univer = res.univer;
        const univerAPI = res.univerAPI;
        apiRef.current = univerAPI;
        univerRef.current = univer;

        if (snapshot) {
          try { univerAPI.createWorkbook(snapshot); } catch { univerAPI.createWorkbook({}); }
        } else {
          univerAPI.createWorkbook({});
        }

        // Record initial snapshot
        setTimeout(() => {
          const snap = getSnapshot();
          if (snap) lastSnapshotRef.current = JSON.stringify(snap);
        }, 500);

        // Listen for command executed to trigger save
        try {
          // Univer command listener: universal via `univerAPI.onCommandExecuted` or `univer.onCommandExecuted`
          const maybeOn = (univerAPI as any).onCommandExecuted || (univer as any).onCommandExecuted;
          if (typeof maybeOn === "function") {
            maybeOn(() => scheduleSave());
          }
        } catch {}

        // Fallback polling
        const interval = setInterval(() => {
          const snap = getSnapshot();
          if (!snap) return;
          const str = JSON.stringify(snap);
          if (str !== lastSnapshotRef.current) {
            // debounce via schedule
            scheduleSave();
          }
        }, 1200);
        dispose = () => {
          clearInterval(interval);
          // Flush pending changed snapshot BEFORE clearing timer/disposal
          try {
            const snap = getSnapshot();
            if (snap) {
              const str = JSON.stringify(snap);
              if (str !== lastSnapshotRef.current) {
                lastSnapshotRef.current = str;
                try { void onSave(snap); } catch {}
              }
            }
          } catch {}
          if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
          }
          queueMicrotask(() => {
            try { univer.dispose(); } catch {}
            try { container.remove(); } catch {}
          });
        };
      } catch (e) {
        console.error("Univer mount failed, fallback to simple grid", e);
        if (!cancelled) setFallback(true);
      }
    }

    mount();
    return () => {
      cancelled = true;
      if (dispose) dispose();
      // also try to cleanup host
      try { if (hostRef.current) hostRef.current.remove(); } catch {}
    };
  }, [file.id, language]); // recreate when file id changes; snapshot handled internally

  if (fallback) {
    return <FallbackGrid file={file} onSave={onSave} language={language} defaultSheetName={defaultSheetName || getLocalizedFallbackSheetName(language)} />;
  }

  return <div ref={containerRef} style={{ height: "100%", width: "100%", minHeight: 520 }} />;
});

// Simple fallback grid for when Univer fails (offline or not compatible)
function FallbackGrid({ file, onSave, language, defaultSheetName }: { file: OfficeFile; onSave: (snap:any)=>void | Promise<void>; language: Language; defaultSheetName: string }) {
  const content: any = file.content;
  const isComplex = isComplexWorkbook(content);
  const initialSheet = Array.isArray(content?.sheets) ? content.sheets[0] : null;
  const [grid, setGrid] = useState<Record<string, string>>(()=> {
    const m: Record<string,string> = {};
    if (initialSheet?.data) Object.entries(initialSheet.data).forEach(([k,v]: any)=> m[k]=String(v.v ?? v));
    return m;
  });
  const [rows] = useState(40);
  const [cols] = useState(10);
  const colLabels = Array.from({ length: cols }, (_,i)=> String.fromCharCode(65 + (i % 26)) + (i>=26? String(Math.floor(i/26)):""));

  // Simple formula evaluation for SUM, AVERAGE, MIN, MAX, COUNT
  const evaluate = (val: string): string => {
    if (!val.startsWith("=")) return val;
    const expr = val.slice(1).trim().toUpperCase();
    try {
      const sumMatch = expr.match(/^SUM\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
      if (sumMatch) {
        const [_, a1, a2] = sumMatch;
        return String(computeRange(a1,a2, (vals)=> vals.reduce((s,v)=> s + (parseFloat(v)||0),0)));
      }
      const avgMatch = expr.match(/^AVERAGE\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
      if (avgMatch) {
        const [_, a1, a2] = avgMatch;
        const vals = getRangeValues(a1,a2);
        const nums = vals.map((v)=> parseFloat(v)).filter((n)=> Number.isFinite(n));
        if (nums.length===0) return "0";
        return String(nums.reduce((a,b)=>a+b,0)/nums.length);
      }
      const minMatch = expr.match(/^MIN\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
      if (minMatch) {
        const [_, a1,a2] = minMatch;
        const vals = getRangeValues(a1,a2);
        const nums = vals.map((v)=> parseFloat(v)).filter((n)=> Number.isFinite(n));
        return nums.length ? String(Math.min(...nums)) : "0";
      }
      const maxMatch = expr.match(/^MAX\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
      if (maxMatch) {
        const [_, a1,a2] = maxMatch;
        const vals = getRangeValues(a1,a2);
        const nums = vals.map((v)=> parseFloat(v)).filter((n)=> Number.isFinite(n));
        return nums.length ? String(Math.max(...nums)) : "0";
      }
      const countMatch = expr.match(/^COUNT\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
      if (countMatch) {
        const [_, a1,a2] = countMatch;
        const vals = getRangeValues(a1,a2);
        // COUNT counts numeric values only, not every non-empty (spec H)
        return String(vals.filter((v)=> v!=="" && Number.isFinite(Number(v)) && String(v).trim()!=="" ).length);
      }
    } catch {}
    return val;
  };
  const parseCell = (addr:string): [number, number] => {
    const m = addr.match(/^([A-Z]+)(\d+)$/);
    if (!m) return [0,0];
    const colStr = m[1]; const row = parseInt(m[2],10)-1;
    let col=0; for(let i=0;i<colStr.length;i++) col = col*26 + (colStr.charCodeAt(i)-65+1); col-=1;
    return [row, col];
  };
  const getRangeValues = (a1:string, a2:string): string[] => {
    const [r1,c1]=parseCell(a1); const [r2,c2]=parseCell(a2);
    const vals:string[]=[];
    for(let r=Math.min(r1,r2);r<=Math.max(r1,r2);r++) for(let c=Math.min(c1,c2);c<=Math.max(c1,c2);c++) vals.push(grid[`${r},${c}`] ?? "");
    return vals;
  };
  const computeRange = (a1:string,a2:string, fn:(vals:string[])=>number): number => fn(getRangeValues(a1,a2));

  const handleCellChange = (r:number,c:number, v:string) => {
    if (isComplex) return;
    const key=`${r},${c}`;
    const next={ ...grid, [key]: v };
    setGrid(next);
    // debounce save: convert to workbook content
    const debounceKey = `fallback-${file.id}`;
    (window as any)[debounceKey] && clearTimeout((window as any)[debounceKey]);
    (window as any)[debounceKey] = setTimeout(()=> {
      const data: any={};
      Object.entries(next).forEach(([k, val])=> { if(val) data[k]={ v: val }; });
      const snapshot = { sheets: [{ id:"sheet-1", name: defaultSheetName, data, rowCount: rows, colCount: cols }], activeSheetId:"sheet-1" };
      void onSave(snapshot);
    }, 800);
  };

  const readOnlyMessage = language==="fr"
    ? "Ce classeur nécessite l'éditeur complet. Le mode de secours est en lecture seule pour protéger vos données."
    : language==="ar"
    ? "يتطلب هذا المصنف المحرر الكامل. وضع الأمان للقراءة فقط لحماية البيانات."
    : "This workbook requires the full spreadsheet editor. Fallback mode is read-only to protect your data.";

  const previewNote = language==="fr"
    ? "Aperçu sécurisé — aucune modification ne sera enregistrée."
    : language==="ar"
    ? "معاينة آمنة — لن يتم حفظ أي تعديل."
    : "Safe preview — no changes will be saved.";

  return (
    <div className={styles.fallbackGrid}>
      <div style={{ fontSize:11, color:"var(--muted)", marginBottom:8 }}>
        {isComplex ? readOnlyMessage : "Fallback grid — Univer failed to load. Formulas: =SUM(A1:A10), =AVERAGE, =MIN, =MAX, =COUNT"}
      </div>
      {isComplex && <div style={{ fontSize:11, color:"var(--danger, #c00)", background:"var(--panel-hover)", border:"1px solid var(--border)", borderRadius:6, padding:"8px 10px", marginBottom:8 }}>{previewNote}</div>}
      <table className={styles.fallbackTable}>
        <thead><tr><th></th>{colLabels.map((l)=> <th key={l}>{l}</th>)}</tr></thead>
        <tbody>
          {Array.from({ length: rows }, (_,r)=> (
            <tr key={r}><th>{r+1}</th>{Array.from({ length: cols }, (_,c)=> {
              const key=`${r},${c}`;
              const raw=grid[key] ?? "";
              const display = raw.startsWith("=") ? evaluate(raw) : raw;
              return <td key={c}><input value={raw} onChange={(e)=>handleCellChange(r,c,e.target.value)} disabled={isComplex} title={isComplex ? readOnlyMessage : raw.startsWith("=")? `${raw} → ${display}`: raw} placeholder="" style={isComplex ? { background:"var(--panel-hover)", cursor:"not-allowed" } : undefined} /></td>;
            })}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default UniverWrapper;
