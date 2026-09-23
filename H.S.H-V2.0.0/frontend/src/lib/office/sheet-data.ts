// Canonical helper for Univer sheet cellData supporting both flat "row,col" and nested row->col.
export function getSheetBounds(cellData: any): { maxRow: number; maxCol: number } {
  if (!cellData || typeof cellData !== "object") return { maxRow: -1, maxCol: -1 };
  let maxR = -1;
  let maxC = -1;
  for (const key of Object.keys(cellData)) {
    if (key.includes(",")) {
      const parts = key.split(",");
      const r = Number(parts[0]);
      const c = Number(parts[1]);
      if (Number.isFinite(r) && Number.isFinite(c)) {
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
      }
    } else {
      const r = Number(key);
      if (!Number.isFinite(r)) continue;
      const rowVal: any = (cellData as any)[key];
      if (rowVal && typeof rowVal === "object") {
        // Distinguish nested row map vs flat cell? If rowVal has numeric keys, treat as row container.
        // For flat cell {v:...}, keys are "v","m" not numeric, so no iteration will yield max.
        let hasNumericCol = false;
        for (const colKey of Object.keys(rowVal)) {
          const c = Number(colKey);
          if (!Number.isFinite(c)) continue;
          hasNumericCol = true;
          if (r > maxR) maxR = r;
          if (c > maxC) maxC = c;
        }
        // If no numeric col found but rowVal looks like a cell with v/m, ignore (should have been flat case, but key was numeric single)
        // Handle case where cellData is incorrectly nested single level { "0": {v:...}} (should be column 0?) Not needed.
        if (!hasNumericCol) {
          // Could be that rowVal is cell itself for something like { "0": {v: "A1"}} interpreted as row 0 col 0?
          // But canonical Univer is { "0": { "0": {v}}}, so we already handle. Ignore isolated.
        }
      }
    }
  }
  return { maxRow: maxR, maxCol: maxC };
}

export function getCellValue(cellData: any, r: number, c: number): any {
  if (!cellData || typeof cellData !== "object") return undefined;
  const flatKey = `${r},${c}`;
  if (flatKey in cellData) {
    return cellData[flatKey];
  }
  const row = (cellData as any)[String(r)] ?? (cellData as any)[r];
  if (row && typeof row === "object") {
    const colVal = (row as any)[String(c)] ?? (row as any)[c];
    if (colVal !== undefined) return colVal;
  }
  return undefined;
}

export function getCellDisplayValue(cell: any): string {
  if (cell == null) return "";
  if (typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean") return String(cell);
  if (typeof cell === "object") {
    if ("v" in cell) return String((cell as any).v ?? (cell as any).m ?? "");
    if ("m" in cell) return String((cell as any).m ?? "");
    // fallback: stringify?
    return String(cell as any);
  }
  return String(cell);
}

// Helper to build row matrix for export (rows of display values)
export function cellDataToMatrix(cellData: any): string[][] {
  const { maxRow, maxCol } = getSheetBounds(cellData);
  if (maxRow < 0 || maxCol < 0) return [];
  const matrix: string[][] = [];
  for (let r = 0; r <= maxRow; r++) {
    const row: string[] = [];
    for (let c = 0; c <= maxCol; c++) {
      const cell = getCellValue(cellData, r, c);
      row.push(getCellDisplayValue(cell ?? ""));
    }
    matrix.push(row);
  }
  return matrix;
}

export function matrixToCSV(matrix: string[][]): string {
  return matrix.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}
