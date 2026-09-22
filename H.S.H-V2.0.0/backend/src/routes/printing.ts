import { Router } from "express";
import fs from "fs";
import { getAvailablePrinters, printPdfToPrinter } from "../services/printer.service";
import { generateReportHtml } from "../services/report-html.service";
import { generateInvoiceHtml } from "../services/invoice-html.service";
import { htmlToPdfTempFile } from "../services/report-pdf.service";

const router = Router();

const ALLOWED_PAPER_SIZES = ["A4", "Letter", "Legal"] as const;
const ALLOWED_MARGINS = ["normal", "narrow", "wide"] as const;
const ALLOWED_CATEGORIES = ["customers", "suppliers", "accounts", "workers", "expenses", "vehicles"] as const;
const ALLOWED_MODES = ["selected", "all"] as const;
const ALLOWED_SIDES = ["one-sided", "two-sided"] as const;
const ALLOWED_COLOR = ["color", "grayscale", "black & white", "black&white", "bw"] as const;

function isValidDateStr(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());
}

router.get("/printers", async (_req, res) => {
  try {
    const result = await getAvailablePrinters();
    res.json({
      success: true,
      printers: result.printers,
      defaultPrinter: result.defaultPrinter,
    });
  } catch (error) {
    console.error("[printing] GET /printers failed:", error instanceof Error ? error.message : error);
    const isWin = (error as Error).message?.includes("only supported on Windows");
    res.status(isWin ? 501 : 500).json({
      success: false,
      message: error instanceof Error ? error.message : "Unable to load printers.",
      printers: [],
      defaultPrinter: null,
    });
  }
});

router.post("/print", async (req, res) => {
  const body = req.body as any;

  // Validation
  const printer: string | undefined = body?.printer;
  const category: string | undefined = body?.category;
  const entity: string | undefined = body?.entity;
  const fromDate: string | undefined = body?.fromDate;
  const toDate: string | undefined = body?.toDate;
  const mode: string | undefined = body?.mode;
  const paperSize: string | undefined = body?.paperSize;
  const copiesRaw = body?.copies;
  const sidesRaw: string | undefined = body?.sides;
  const colorModeRaw: string | undefined = body?.colorMode;
  const margins: string | undefined = body?.margins;
  const scaleRaw = body?.scale;
  const documentHeaderFooterRaw = body?.documentHeaderFooter;
  const repeatHeaderRaw = body?.repeatHeader;

  if (!printer || typeof printer !== "string" || !printer.trim()) {
    res.status(400).json({ success: false, message: "Printer is required." });
    return;
  }
  if (!category || !ALLOWED_CATEGORIES.includes(category as any)) {
    res.status(400).json({ success: false, message: "Invalid category." });
    return;
  }
  if (typeof entity !== "string") {
    res.status(400).json({ success: false, message: "Invalid entity." });
    return;
  }
  if (!fromDate || !isValidDateStr(fromDate) || !toDate || !isValidDateStr(toDate)) {
    res.status(400).json({ success: false, message: "Invalid date range." });
    return;
  }
  if (new Date(fromDate).getTime() > new Date(toDate).getTime()) {
    res.status(400).json({ success: false, message: "fromDate must be before toDate." });
    return;
  }
  if (!mode || !ALLOWED_MODES.includes(mode as any)) {
    res.status(400).json({ success: false, message: "Invalid mode." });
    return;
  }

  const paperSizeVal = paperSize && ALLOWED_PAPER_SIZES.includes(paperSize as any) ? paperSize : "A4";
  const marginsVal = margins && ALLOWED_MARGINS.includes(margins as any) ? margins : "normal";
  const scale = Number(scaleRaw);
  const scaleVal = Number.isFinite(scale) && scale >= 70 && scale <= 130 ? Math.round(scale) : 100;

  let copies = 1;
  if (copiesRaw !== undefined) {
    const n = Math.floor(Number(copiesRaw));
    if (!Number.isFinite(n) || n < 1 || n > 99) {
      res.status(400).json({ success: false, message: "Copies must be integer 1-99." });
      return;
    }
    copies = n;
  }

  let sides: "one-sided" | "two-sided" = "one-sided";
  if (sidesRaw) {
    const s = String(sidesRaw).toLowerCase();
    if (s === "two-sided" || s === "two_sided" || s === "duplex" || s === "duplexlong") sides = "two-sided";
    else if (s === "one-sided" || s === "one_sided" || s === "simplex") sides = "one-sided";
    else if (ALLOWED_SIDES.includes(s as any)) sides = s as any;
    else {
      res.status(400).json({ success: false, message: "Invalid sides value." });
      return;
    }
  }

  let colorMode: "color" | "grayscale" = "color";
  if (colorModeRaw) {
    const c = String(colorModeRaw).toLowerCase();
    if (c === "grayscale" || c === "black & white" || c === "black&white" || c === "bw" || c === "black and white") colorMode = "grayscale";
    else if (c === "color") colorMode = "color";
    else {
      res.status(400).json({ success: false, message: "Invalid colorMode." });
      return;
    }
  }

  const documentHeaderFooter = documentHeaderFooterRaw === undefined ? true : Boolean(documentHeaderFooterRaw);
  const repeatHeader = repeatHeaderRaw === undefined ? true : Boolean(repeatHeaderRaw);

  // Validate printer exists (security)
  let pdfPath: string | null = null;
  try {
    // This will throw if printer not found or not Windows
    const { getAvailablePrinters: getPrintersCheck } = await import("../services/printer.service");
    const { printers } = await getPrintersCheck();
    const exists = printers.some((p) => p.name === printer);
    if (!exists) {
      res.status(400).json({ success: false, message: `Printer not found: ${printer}` });
      return;
    }

    // Generate HTML matching preview
    const html = await generateReportHtml({
      category: category as any,
      entity,
      fromDate,
      toDate,
      mode: mode as any,
      paperSize: paperSizeVal as any,
      margins: marginsVal as any,
      scale: scaleVal,
      documentHeaderFooter,
      repeatHeader,
    });

    // Convert to PDF temp file
    pdfPath = await htmlToPdfTempFile({
      html,
      paperSize: paperSizeVal as any,
      margins: marginsVal as any,
      scale: scaleVal,
      landscape: false, // portrait internally; orientation removed from UI
    });

    // Map to printer options
    const sideOpt: "simplex" | "duplexlong" = sides === "two-sided" ? "duplexlong" : "simplex";
    const monochrome = colorMode === "grayscale";

    await printPdfToPrinter(pdfPath, {
      printer,
      copies,
      paperSize: paperSizeVal,
      monochrome,
      side: sideOpt,
    });

    res.json({
      success: true,
      message: `Report sent to printer successfully.`,
      printer,
      copies,
      sides,
      colorMode,
      paperSize: paperSizeVal,
    });
  } catch (error) {
    console.error("[printing] POST /print failed:", error instanceof Error ? error.message : error, error instanceof Error ? error.stack : "");
    const msg = error instanceof Error ? error.message : "Print job failed.";
    // Handle duplex not supported etc.
    const status = msg.includes("not found") || msg.includes("Printer") ? 400 : 500;
    res.status(status).json({ success: false, message: msg });
  } finally {
    if (pdfPath) {
      try {
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      } catch {}
    }
  }
});

router.post("/invoice", async (req, res) => {
  const body = req.body as any;
  const printer: string | undefined = body?.printer;
  const invoiceId: string | undefined = body?.invoiceId;
  const paperSize: string | undefined = body?.paperSize;
  const copiesRaw = body?.copies;
  const sidesRaw: string | undefined = body?.sides;
  const colorModeRaw: string | undefined = body?.colorMode;
  const margins: string | undefined = body?.margins;
  const scaleRaw = body?.scale;
  const documentHeaderFooterRaw = body?.documentHeaderFooter;

  if (!printer || typeof printer !== "string" || !printer.trim()) {
    res.status(400).json({ success: false, message: "Printer is required." });
    return;
  }
  if (!invoiceId || typeof invoiceId !== "string" || !invoiceId.trim()) {
    res.status(400).json({ success: false, message: "invoiceId is required." });
    return;
  }

  const paperSizeVal = paperSize && ALLOWED_PAPER_SIZES.includes(paperSize as any) ? paperSize : "A4";
  const marginsVal = margins && ALLOWED_MARGINS.includes(margins as any) ? margins : "normal";
  const scale = Number(scaleRaw);
  const scaleVal = Number.isFinite(scale) && scale >= 70 && scale <= 130 ? Math.round(scale) : 100;

  let copies = 1;
  if (copiesRaw !== undefined) {
    const n = Math.floor(Number(copiesRaw));
    if (!Number.isFinite(n) || n < 1 || n > 99) {
      res.status(400).json({ success: false, message: "Copies must be integer 1-99." });
      return;
    }
    copies = n;
  }

  let sides: "one-sided" | "two-sided" = "one-sided";
  if (sidesRaw) {
    const s = String(sidesRaw).toLowerCase();
    if (s === "two-sided" || s === "two_sided" || s === "duplex" || s === "duplexlong") sides = "two-sided";
    else if (s === "one-sided" || s === "one_sided" || s === "simplex") sides = "one-sided";
    else if (ALLOWED_SIDES.includes(s as any)) sides = s as any;
    else {
      res.status(400).json({ success: false, message: "Invalid sides value." });
      return;
    }
  }

  let colorMode: "color" | "grayscale" = "color";
  if (colorModeRaw) {
    const c = String(colorModeRaw).toLowerCase();
    if (c === "grayscale" || c === "black & white" || c === "black&white" || c === "bw" || c === "black and white") colorMode = "grayscale";
    else if (c === "color") colorMode = "color";
    else {
      res.status(400).json({ success: false, message: "Invalid colorMode." });
      return;
    }
  }

  const documentHeaderFooter = documentHeaderFooterRaw === undefined ? true : Boolean(documentHeaderFooterRaw);

  let pdfPath: string | null = null;
  try {
    const { getAvailablePrinters: getPrintersCheck } = await import("../services/printer.service");
    const { printers } = await getPrintersCheck();
    const exists = printers.some((p) => p.name === printer);
    if (!exists) {
      res.status(400).json({ success: false, message: `Printer not found: ${printer}` });
      return;
    }

    const html = await generateInvoiceHtml({
      invoiceId,
      paperSize: paperSizeVal as any,
      margins: marginsVal as any,
      scale: scaleVal,
      documentHeaderFooter,
    });

    pdfPath = await htmlToPdfTempFile({
      html,
      paperSize: paperSizeVal as any,
      margins: marginsVal as any,
      scale: scaleVal,
      landscape: false,
    });

    const sideOpt: "simplex" | "duplexlong" = sides === "two-sided" ? "duplexlong" : "simplex";
    const monochrome = colorMode === "grayscale";

    await printPdfToPrinter(pdfPath, {
      printer,
      copies,
      paperSize: paperSizeVal,
      monochrome,
      side: sideOpt,
    });

    res.json({
      success: true,
      message: `Invoice sent to printer successfully.`,
      printer,
      copies,
      sides,
      colorMode,
      paperSize: paperSizeVal,
    });
  } catch (error) {
    console.error("[printing] POST /invoice failed:", error instanceof Error ? error.message : error, error instanceof Error ? error.stack : "");
    const msg = error instanceof Error ? error.message : "Print job failed.";
    const status = msg.includes("not found") || msg.includes("Printer") ? 400 : 500;
    res.status(status).json({ success: false, message: msg });
  } finally {
    if (pdfPath) {
      try {
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      } catch {}
    }
  }
});

// --- PDF GENERATION (app-level Print to PDF) — no printer required, returns PDF bytes ---

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
}

router.post("/pdf", async (req, res) => {
  // Reuse same validation as /print but WITHOUT printer
  const body = req.body as any;
  const category: string | undefined = body?.category;
  const entity: string | undefined = body?.entity;
  const fromDate: string | undefined = body?.fromDate;
  const toDate: string | undefined = body?.toDate;
  const mode: string | undefined = body?.mode;
  const paperSize: string | undefined = body?.paperSize;
  const margins: string | undefined = body?.margins;
  const scaleRaw = body?.scale;
  const documentHeaderFooterRaw = body?.documentHeaderFooter;
  const repeatHeaderRaw = body?.repeatHeader;
  const colorModeRaw: string | undefined = body?.colorMode;

  if (!category || !ALLOWED_CATEGORIES.includes(category as any)) {
    res.status(400).json({ success: false, message: "Invalid category." });
    return;
  }
  if (typeof entity !== "string") {
    res.status(400).json({ success: false, message: "Invalid entity." });
    return;
  }
  if (!fromDate || !isValidDateStr(fromDate) || !toDate || !isValidDateStr(toDate)) {
    res.status(400).json({ success: false, message: "Invalid date range." });
    return;
  }
  if (new Date(fromDate).getTime() > new Date(toDate).getTime()) {
    res.status(400).json({ success: false, message: "fromDate must be before toDate." });
    return;
  }
  if (!mode || !ALLOWED_MODES.includes(mode as any)) {
    res.status(400).json({ success: false, message: "Invalid mode." });
    return;
  }

  const paperSizeVal = paperSize && ALLOWED_PAPER_SIZES.includes(paperSize as any) ? paperSize : "A4";
  const marginsVal = margins && ALLOWED_MARGINS.includes(margins as any) ? margins : "normal";
  const scale = Number(scaleRaw);
  const scaleVal = Number.isFinite(scale) && scale >= 70 && scale <= 130 ? Math.round(scale) : 100;

  let colorMode: "color" | "grayscale" = "color";
  if (colorModeRaw) {
    const c = String(colorModeRaw).toLowerCase();
    if (c === "grayscale" || c === "black & white" || c === "black&white" || c === "bw" || c === "black and white") colorMode = "grayscale";
    else if (c === "color") colorMode = "color";
  }

  const documentHeaderFooter = documentHeaderFooterRaw === undefined ? true : Boolean(documentHeaderFooterRaw);
  const repeatHeader = repeatHeaderRaw === undefined ? true : Boolean(repeatHeaderRaw);

  let pdfPath: string | null = null;
  try {
    let html = await generateReportHtml({
      category: category as any,
      entity,
      fromDate,
      toDate,
      mode: mode as any,
      paperSize: paperSizeVal as any,
      margins: marginsVal as any,
      scale: scaleVal,
      documentHeaderFooter,
      repeatHeader,
    });

    // Honor B&W for PDF — inject grayscale filter if requested (Puppeteer honors CSS)
    if (colorMode === "grayscale") {
      html = html.replace("</head>", "<style>html,body{filter:grayscale(1) !important;}</style></head>");
    }

    pdfPath = await htmlToPdfTempFile({
      html,
      paperSize: paperSizeVal as any,
      margins: marginsVal as any,
      scale: scaleVal,
      landscape: false,
    });

    const buffer = fs.readFileSync(pdfPath);
    const safeCategory = sanitizeFilename(category);
    const safeFrom = sanitizeFilename(fromDate);
    const safeTo = sanitizeFilename(toDate);
    const filename = `report-${safeCategory}-${safeFrom}-${safeTo}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.send(buffer);
  } catch (error) {
    console.error("[printing] POST /pdf failed:", error instanceof Error ? error.message : error);
    const msg = error instanceof Error ? error.message : "PDF generation failed.";
    res.status(500).json({ success: false, message: msg });
  } finally {
    if (pdfPath) {
      try {
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      } catch {}
    }
  }
});

router.post("/invoice/pdf", async (req, res) => {
  const body = req.body as any;
  const invoiceId: string | undefined = body?.invoiceId;
  const paperSize: string | undefined = body?.paperSize;
  const margins: string | undefined = body?.margins;
  const scaleRaw = body?.scale;
  const documentHeaderFooterRaw = body?.documentHeaderFooter;
  const colorModeRaw: string | undefined = body?.colorMode;

  if (!invoiceId || typeof invoiceId !== "string" || !invoiceId.trim()) {
    res.status(400).json({ success: false, message: "invoiceId is required." });
    return;
  }

  const paperSizeVal = paperSize && ALLOWED_PAPER_SIZES.includes(paperSize as any) ? paperSize : "A4";
  const marginsVal = margins && ALLOWED_MARGINS.includes(margins as any) ? margins : "normal";
  const scale = Number(scaleRaw);
  const scaleVal = Number.isFinite(scale) && scale >= 70 && scale <= 130 ? Math.round(scale) : 100;

  let colorMode: "color" | "grayscale" = "color";
  if (colorModeRaw) {
    const c = String(colorModeRaw).toLowerCase();
    if (c === "grayscale" || c === "black & white" || c === "black&white" || c === "bw" || c === "black and white") colorMode = "grayscale";
  }

  const documentHeaderFooter = documentHeaderFooterRaw === undefined ? true : Boolean(documentHeaderFooterRaw);

  let pdfPath: string | null = null;
  try {
    let html = await generateInvoiceHtml({
      invoiceId,
      paperSize: paperSizeVal as any,
      margins: marginsVal as any,
      scale: scaleVal,
      documentHeaderFooter,
    });

    if (colorMode === "grayscale") {
      html = html.replace("</head>", "<style>html,body{filter:grayscale(1) !important;}</style></head>");
    }

    pdfPath = await htmlToPdfTempFile({
      html,
      paperSize: paperSizeVal as any,
      margins: marginsVal as any,
      scale: scaleVal,
      landscape: false,
    });

    const buffer = fs.readFileSync(pdfPath);
    // Load invoice for sanitized filename
    let filename = `invoice-${sanitizeFilename(invoiceId)}.pdf`;
    try {
      const { InvoiceModel } = await import("../models/invoice.model");
      const inv: any = await InvoiceModel.findOne({ id: invoiceId }).lean();
      if (inv) {
        const safeNum = sanitizeFilename(inv.invoiceNumber || inv.id);
        const safeCust = sanitizeFilename(inv.customerSnapshot?.name || inv.customerId || "customer");
        filename = `${safeNum}_${safeCust}.pdf`;
      }
    } catch {}
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.send(buffer);
  } catch (error) {
    console.error("[printing] POST /invoice/pdf failed:", error instanceof Error ? error.message : error);
    const msg = error instanceof Error ? error.message : "PDF generation failed.";
    const status = msg.includes("not found") ? 404 : 500;
    res.status(status).json({ success: false, message: msg });
  } finally {
    if (pdfPath) {
      try {
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      } catch {}
    }
  }
});

export default router;
