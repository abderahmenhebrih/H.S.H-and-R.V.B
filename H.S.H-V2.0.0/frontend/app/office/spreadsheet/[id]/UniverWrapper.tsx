"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { OfficeFile } from "../../../../src/types/entities/office-file";
import type { Language } from "../../../../src/types/settings/settings";
import "@univerjs/preset-sheets-core/lib/index.css";
import styles from "./page.module.css";

type Props = {
  file: OfficeFile;
  onSave: (snapshot: any) => void;
  language: Language;
  defaultSheetName?: string;
};

export type UniverHandle = {
  insertValue: (value: string) => void;
  insertTable: (entityType: string, rows: any[]) => void;
  exportCSV: () => Promise<string | null>;
  exportXLSX: () => Promise<Blob | null>;
};

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
      onSave(snap);
    }, 900);
  };

  useImperativeHandle(ref, () => ({
    insertValue: (value: string) => {
      try {
        const api = apiRef.current;
        const wb = api?.getActiveWorkbook?.();
        const sheet = wb?.getActiveSheet?.() || wb?.getActiveWorksheet?.();
        if (sheet) {
          // Try to get active range and set value
          const range = sheet.getActiveRange?.() || sheet.getSelection?.();
          if (range?.setValue) {
            range.setValue(value);
            scheduleSave();
            return;
          }
          // Try setCellValue on sheet
          if (sheet.setCellValue) {
            // need row col from selection
            const sel = sheet.getActiveRange?.();
            const row = sel?.getRow?.() ?? 0;
            const col = sel?.getColumn?.() ?? 0;
            sheet.setCellValue(row, col, value);
            scheduleSave();
            return;
          }
        }
        // fallback: try univerAPI method
        if (api?.insertValue) api.insertValue(value);
        scheduleSave();
      } catch (e) { console.error("insertValue failed", e); }
    },
    insertTable: (entityType: string, rows: any[]) => {
      try {
        const api = apiRef.current;
        const wb = api?.getActiveWorkbook?.();
        if (!wb) return;
        const header = Object.keys(rows[0] || {});
        // try create sheet
        let newSheet: any = null;
        if (wb.createSheet) {
          newSheet = wb.createSheet(entityType.slice(0, 20));
        } else if (wb.addSheet) {
          newSheet = wb.addSheet(entityType);
        }
        const targetSheet = newSheet || wb.getActiveSheet?.();
        if (!targetSheet) return;
        // set header
        header.forEach((h, c) => {
          try { targetSheet.getRange?.(0, c)?.setValue?.(h); } catch {}
          try { targetSheet.setCellValue?.(0, c, h); } catch {}
        });
        rows.forEach((row, rIdx) => {
          header.forEach((h, c) => {
            const v = row[h];
            try { targetSheet.getRange?.(rIdx+1, c)?.setValue?.(String(v ?? "")); } catch {}
            try { targetSheet.setCellValue?.(rIdx+1, c, String(v ?? "")); } catch {}
          });
        });
        scheduleSave();
      } catch (e) { console.error("insertTable failed", e); }
    },
    exportCSV: async () => {
      try {
        const snap = getSnapshot();
        if (!snap) return null;
        // Convert snapshot to CSV via simple logic (first sheet)
        const sheets = snap.sheets || {};
        const firstId = snap.sheetOrder?.[0] || Object.keys(sheets)[0];
        const sheet = sheets[firstId];
        if (!sheet) return null;
        const cellData = sheet.cellData || {};
        // determine max row/col
        let maxR = 0, maxC = 0;
        Object.keys(cellData).forEach((k) => {
          const [r,c] = k.split(",").map(Number);
          if (r>maxR) maxR=r;
          if (c>maxC) maxC=c;
        });
        // cellData is object of row -> col -> cell
        // Univer stores as { row: { col: {v} } }? Handle both
        let csv = "";
        // try to handle nested structure
        if (cellData["0"]) {
          // Nested: cellData is { "0": { "0": {v} } }
          const rows: string[][] = [];
          for (let r=0;r<=maxR+5;r++) {
            const row: string[] = [];
            for (let c=0;c<=maxC+5;c++) {
              const cell = cellData[r]?.[c] ?? cellData[`${r},${c}`];
              const v = cell?.v ?? cell?.m ?? "";
              row.push(`"${String(v).replace(/"/g,'""')}"`);
            }
            // trim trailing empty?
            if (row.some((x)=>x!=='""')) rows.push(row);
          }
          csv = rows.map((r)=>r.join(",")).join("\n");
        } else {
          // flat
          const rows: string[][] = [];
          for (let r=0;r<=20;r++) {
            const row: string[] = [];
            for (let c=0;c<=5;c++) {
              const cell = cellData[`${r},${c}`] ?? cellData[r]?.[c];
              const v = cell?.v ?? "";
              row.push(`"${String(v).replace(/"/g,'""')}"`);
            }
            rows.push(row);
          }
          csv = rows.map((r)=>r.join(",")).join("\n");
        }
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
      // Clear host
      host.innerHTML = "";
      const container = document.createElement("div");
      container.style.height = "100%";
      container.style.width = "100%";
      host.appendChild(container);
      hostRef.current = container;

      try {
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
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
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
function FallbackGrid({ file, onSave, language, defaultSheetName }: { file: OfficeFile; onSave: (snap:any)=>void; language: Language; defaultSheetName: string }) {
  const content: any = file.content;
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
      onSave(snapshot);
    }, 800);
  };

  return (
    <div className={styles.fallbackGrid}>
      <div style={{ fontSize:11, color:"var(--muted)", marginBottom:8 }}>Fallback grid — Univer failed to load. Formulas: =SUM(A1:A10), =AVERAGE, =MIN, =MAX, =COUNT</div>
      <table className={styles.fallbackTable}>
        <thead><tr><th></th>{colLabels.map((l)=> <th key={l}>{l}</th>)}</tr></thead>
        <tbody>
          {Array.from({ length: rows }, (_,r)=> (
            <tr key={r}><th>{r+1}</th>{Array.from({ length: cols }, (_,c)=> {
              const key=`${r},${c}`;
              const raw=grid[key] ?? "";
              const display = raw.startsWith("=") ? evaluate(raw) : raw;
              return <td key={c}><input value={raw} onChange={(e)=>handleCellChange(r,c,e.target.value)} title={raw.startsWith("=")? `${raw} → ${display}`: raw} placeholder="" /></td>;
            })}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default UniverWrapper;
