import { getPrinters, getDefaultPrinter, print } from "pdf-to-printer";
import type { Printer } from "pdf-to-printer";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type AvailablePrinter = {
  name: string;
  deviceId: string;
  paperSizes: string[];
  isDefault: boolean;
};

function normalizePsJson<T>(raw: string): T[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed as T[];
    if (parsed && typeof parsed === "object") return [parsed as T];
    return [];
  } catch {
    return [];
  }
}

async function getPrintersViaPowerShell(): Promise<AvailablePrinter[]> {
  // Fixed command — no user input interpolated
  const psCommand = "Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus | ConvertTo-Json -Compress";
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand], {
    timeout: 8000,
    windowsHide: true,
  });
  const raw = stdout.toString().trim();
  if (!raw) return [];
  type PsPrinter = { Name: string; DriverName?: string; PortName?: string; PrinterStatus?: number };
  const items = normalizePsJson<PsPrinter>(raw);
  return items
    .filter((p) => typeof p.Name === "string" && p.Name.trim().length > 0)
    .map((p) => ({
      name: p.Name.trim(),
      deviceId: p.Name.trim(),
      paperSizes: [],
      isDefault: false,
    }));
}

async function getPrintersViaCim(): Promise<AvailablePrinter[]> {
  // Fixed command — no user input interpolated, second fallback if Get-Printer unavailable
  const psCommand = "Get-CimInstance Win32_Printer | Select-Object Name,Default,WorkOffline,PrinterStatus | ConvertTo-Json -Compress";
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand], {
    timeout: 8000,
    windowsHide: true,
  });
  const raw = stdout.toString().trim();
  if (!raw) return [];
  type CimPrinter = { Name: string; Default?: boolean; WorkOffline?: boolean; PrinterStatus?: number };
  const items = normalizePsJson<CimPrinter>(raw);
  return items
    .filter((p) => typeof p.Name === "string" && p.Name.trim().length > 0)
    .map((p) => ({
      name: p.Name.trim(),
      deviceId: p.Name.trim(),
      paperSizes: [],
      isDefault: !!p.Default,
    }));
}

async function getDefaultViaCim(): Promise<string | null> {
  try {
    const psCommand = "Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -ExpandProperty Name";
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand], {
      timeout: 5000,
      windowsHide: true,
    });
    const name = stdout.toString().trim();
    return name ? name.split("\n")[0].trim() : null;
  } catch {
    return null;
  }
}

export async function getAvailablePrinters(): Promise<{
  printers: AvailablePrinter[];
  defaultPrinter: string | null;
}> {
  if (process.platform !== "win32") {
    throw new Error("Printer discovery is only supported on Windows.");
  }

  let printers: AvailablePrinter[] = [];
  let defaultPrinterName: string | null = null;
  let lastError: unknown = null;

  // 1. Primary: pdf-to-printer library
  try {
    const pdfPrinters: Printer[] = await getPrinters();
    let defName: string | null = null;
    try {
      const def = await getDefaultPrinter();
      if (def && typeof (def as any).name === "string") {
        defName = (def as any).name;
      } else if (typeof def === "string") {
        defName = def;
      }
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.warn("[printer.service] getDefaultPrinter via pdf-to-printer failed:", e instanceof Error ? e.message : e);
    }
    if (pdfPrinters.length > 0) {
      printers = pdfPrinters.map((p) => ({
        name: p.name,
        deviceId: (p as any).deviceId || p.name,
        paperSizes: (p as any).paperSizes || [],
        isDefault: defName ? p.name === defName : false,
      }));
      defaultPrinterName = defName;
      if (process.env.NODE_ENV !== "production") console.log(`[printer.service] pdf-to-printer discovered ${printers.length} printer(s)`);
    }
  } catch (error) {
    lastError = error;
    if (process.env.NODE_ENV !== "production") console.warn("[printer.service] pdf-to-printer getPrinters failed:", error instanceof Error ? error.message : error);
  }

  // 2. Fallback: Windows Get-Printer via PowerShell (fixed command, no user input)
  if (printers.length === 0) {
    try {
      const psPrinters = await getPrintersViaPowerShell();
      if (psPrinters.length > 0) {
        printers = psPrinters;
        if (process.env.NODE_ENV !== "production") console.log(`[printer.service] Get-Printer fallback discovered ${printers.length} printer(s)`);
      }
    } catch (error) {
      lastError = error;
      if (process.env.NODE_ENV !== "production") console.warn("[printer.service] Get-Printer fallback failed:", error instanceof Error ? error.message : error);
    }
  }

  // 3. Second fallback: Win32_Printer CIM
  if (printers.length === 0) {
    try {
      const cimPrinters = await getPrintersViaCim();
      if (cimPrinters.length > 0) {
        printers = cimPrinters;
        // Try to infer default from CIM's Default flag
        const def = cimPrinters.find((p) => p.isDefault);
        if (def) defaultPrinterName = def.name;
        if (process.env.NODE_ENV !== "production") console.log(`[printer.service] Win32_Printer CIM fallback discovered ${printers.length} printer(s)`);
      }
    } catch (error) {
      lastError = error;
      if (process.env.NODE_ENV !== "production") console.warn("[printer.service] Win32_Printer CIM fallback failed:", error instanceof Error ? error.message : error);
    }
  }

  // Determine default printer if still unknown but we have printers
  if (!defaultPrinterName && printers.length > 0) {
    // Check if any printer already marked as default from CIM
    const flagged = printers.find((p) => p.isDefault);
    if (flagged) {
      defaultPrinterName = flagged.name;
    } else {
      // Try CIM default query
      try {
        const cimDefault = await getDefaultViaCim();
        if (cimDefault && printers.some((p) => p.name === cimDefault)) {
          defaultPrinterName = cimDefault;
        }
      } catch {}
      // Fallback to first printer if still unknown (do not auto-select as default, but allow frontend to pick first)
      // Keep defaultPrinterName null to let frontend decide, but mark isDefault accordingly
    }
  }

  // Deduplicate by exact printer name
  const seen = new Set<string>();
  const deduped: AvailablePrinter[] = [];
  for (const p of printers) {
    if (!seen.has(p.name)) {
      seen.add(p.name);
      deduped.push(p);
    }
  }
  printers = deduped;

  // Normalize isDefault flag based on final defaultPrinterName
  if (defaultPrinterName) {
    printers = printers.map((p) => ({ ...p, isDefault: p.name === defaultPrinterName }));
  } else if (printers.length > 0) {
    // If no default known, ensure none are marked default (frontend will pick first)
    printers = printers.map((p) => ({ ...p, isDefault: false }));
  }

  if (printers.length === 0) {
    console.error("[printer.service] All printer discovery strategies failed. Last error:", lastError instanceof Error ? lastError.message : lastError);
    // Provide safe error to caller; backend route will map to user-friendly message
    throw new Error("Unable to load printers.");
  }

  // Microsoft Print to PDF is treated exactly like any other Windows printer — no hardcoding

  return {
    printers,
    defaultPrinter: defaultPrinterName,
  };
}

export async function validatePrinterName(requestedName: string): Promise<void> {
  const { printers } = await getAvailablePrinters();
  const exists = printers.some((p) => p.name === requestedName);
  if (!exists) {
    throw new Error(`Printer not found: ${requestedName}`);
  }
}

export async function printPdfToPrinter(
  pdfPath: string,
  opts: {
    printer: string;
    copies?: number;
    paperSize?: string;
    monochrome?: boolean;
    side?: "simplex" | "duplex" | "duplexlong" | "duplexshort";
  },
): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("Direct printing is only supported on Windows.");
  }

  // Validate printer still exists at print time
  await validatePrinterName(opts.printer);

  const printOptions: any = {
    printer: opts.printer,
    copies: opts.copies,
    paperSize: opts.paperSize,
    monochrome: opts.monochrome,
    side: opts.side,
    // Use SumatraPDF bundled with pdf-to-printer; keep silent
    silent: true,
  };

  // Remove undefined
  Object.keys(printOptions).forEach((k) => {
    if (printOptions[k] === undefined) delete printOptions[k];
  });

  if (process.env.NODE_ENV !== "production") console.log(`[printer.service] Printing ${pdfPath} to "${opts.printer}" with`, printOptions);

  // Microsoft Print to PDF cannot be used for silent printing via SumatraPDF - it requires a save dialog
  if (opts.printer.toLowerCase().includes("microsoft print to pdf")) {
    // Still attempt, but with timeout and friendly error handling
    if (process.env.NODE_ENV !== "production") console.warn(`[printer.service] Microsoft Print to PDF detected - silent printing may fail, attempting anyway`);
  }

  const printPromise = print(pdfPath, printOptions);
  const timeoutMs = 20000;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Print job timed out. Printer may be unavailable or requires manual interaction (e.g., Microsoft Print to PDF needs a save dialog). Please try a physical printer or use 'Open system print dialog'." )), timeoutMs)
  );

  try {
    await Promise.race([printPromise, timeoutPromise]);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Provide friendly message for Microsoft Print to PDF
    if (opts.printer.toLowerCase().includes("microsoft print to pdf") && (msg.includes("Command failed") || msg.includes("timed out"))) {
      throw new Error("Microsoft Print to PDF requires manual file selection and cannot be used for direct silent printing. Please select a physical printer or use 'Open system print dialog' to save as PDF.");
    }
    // For duplex not supported etc., pass through with context
    if (msg.toLowerCase().includes("duplex") || msg.toLowerCase().includes("side")) {
      throw new Error(`Printer does not support the requested sides setting (${opts.side}). ${msg}`);
    }
    throw error;
  }
}
