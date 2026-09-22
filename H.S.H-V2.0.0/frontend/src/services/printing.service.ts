export type PrinterInfo = {
  name: string;
  deviceId: string;
  paperSizes: string[];
  isDefault: boolean;
};

export type PrintersResponse = {
  success: boolean;
  printers: PrinterInfo[];
  defaultPrinter: string | null;
  message?: string;
};

export type PrintRequest = {
  printer: string;
  category: string;
  entity: string;
  fromDate: string;
  toDate: string;
  mode: string;
  paperSize: string;
  copies: number;
  sides: string;
  colorMode: string;
  margins: string;
  scale: number;
  documentHeaderFooter: boolean;
  repeatHeader: boolean;
};

export type InvoicePrintRequest = {
  printer: string;
  invoiceId: string;
  paperSize: string;
  copies: number;
  sides: string;
  colorMode: string;
  margins: string;
  scale: number;
  documentHeaderFooter: boolean;
};

export type PrintResponse = {
  success: boolean;
  message: string;
  printer?: string;
  copies?: number;
  sides?: string;
  colorMode?: string;
  paperSize?: string;
};

export const APP_PDF_PRINTER = "app-pdf";
export const APP_PDF_LABEL = "Print to PDF";

function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
}

function triggerPdfDownload(blob: Blob, fallbackFilename: string, disposition?: string | null) {
  let filename = fallbackFilename;
  if (disposition) {
    const m = /filename="([^"]+)"/.exec(disposition) || /filename=([^;]+)/.exec(disposition);
    if (m && m[1]) filename = m[1].replace(/["']/g, "").trim();
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function getPrinters(): Promise<PrintersResponse> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/api/printing/printers`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  const data = (await res.json()) as PrintersResponse;
  if (!res.ok) {
    throw new Error(data.message || `Failed to load printers (${res.status})`);
  }
  return data;
}

export async function printReport(payload: PrintRequest): Promise<PrintResponse> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/api/printing/print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as PrintResponse;
  if (!res.ok) {
    throw new Error(data.message || `Print failed (${res.status})`);
  }
  if (!data.success) {
    throw new Error(data.message || "Print job failed.");
  }
  return data;
}

export async function printInvoice(payload: InvoicePrintRequest): Promise<PrintResponse> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/api/printing/invoice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as PrintResponse;
  if (!res.ok) {
    throw new Error(data.message || `Print failed (${res.status})`);
  }
  if (!data.success) {
    throw new Error(data.message || "Print job failed.");
  }
  return data;
}

export type ReportPdfRequest = Omit<PrintRequest, "printer" | "copies" | "sides">;
export type InvoicePdfRequest = Omit<InvoicePrintRequest, "printer" | "copies" | "sides">;

function sanitizeFilenamePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "doc";
}

export async function downloadReportPdf(payload: ReportPdfRequest): Promise<void> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/api/printing/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    // Try to parse JSON error
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const data = (await res.json()) as any;
      throw new Error(data.message || `PDF generation failed (${res.status})`);
    }
    throw new Error(`PDF generation failed (${res.status})`);
  }
  const blob = await res.blob();
  if (blob.type.includes("application/json")) {
    // Edge: backend returned JSON with error but 200
    try {
      const text = await blob.text();
      const data = JSON.parse(text);
      if (data && data.success === false) throw new Error(data.message || "PDF generation failed.");
    } catch {}
  }
  const disposition = res.headers.get("content-disposition");
  const fallback = `report-${sanitizeFilenamePart(payload.category)}-${sanitizeFilenamePart(payload.fromDate)}-${sanitizeFilenamePart(payload.toDate)}.pdf`;
  triggerPdfDownload(blob, fallback, disposition);
}

export async function downloadInvoicePdf(payload: InvoicePdfRequest): Promise<void> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/api/printing/invoice/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const data = (await res.json()) as any;
      throw new Error(data.message || `PDF generation failed (${res.status})`);
    }
    throw new Error(`PDF generation failed (${res.status})`);
  }
  const blob = await res.blob();
  if (blob.type.includes("application/json")) {
    try {
      const text = await blob.text();
      const data = JSON.parse(text);
      if (data && data.success === false) throw new Error(data.message || "PDF generation failed.");
    } catch {}
  }
  const disposition = res.headers.get("content-disposition");
  const fallback = `invoice-${sanitizeFilenamePart(payload.invoiceId)}.pdf`;
  triggerPdfDownload(blob, fallback, disposition);
}
