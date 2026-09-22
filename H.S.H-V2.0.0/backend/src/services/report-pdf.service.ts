import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import puppeteer from "puppeteer-core";

type PdfOptions = {
  html: string;
  paperSize: "A4" | "Letter" | "Legal";
  margins: "normal" | "narrow" | "wide";
  scale: number; // 70-130
  landscape?: boolean;
};

function getChromeExecutablePath(): string | undefined {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {}
  }
  // Try where.exe
  try {
    const { execSync } = require("child_process");
    const out = execSync("where chrome", { encoding: "utf8" }).split("\n")[0]?.trim();
    if (out && fs.existsSync(out)) return out;
  } catch {}
  return undefined;
}

function getMarginValues(margins: string) {
  if (margins === "narrow") return { top: "6mm", right: "6mm", bottom: "6mm", left: "6mm" };
  if (margins === "wide") return { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" };
  return { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" };
}

export async function htmlToPdfTempFile(opts: PdfOptions): Promise<string> {
  const chromePath = getChromeExecutablePath();
  if (!chromePath) {
    throw new Error("Chrome/Chromium executable not found. Install Chrome or set CHROME_PATH.");
  }

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(opts.html, { waitUntil: "networkidle0" as any });

    const tmpDir = os.tmpdir();
    const pdfPath = path.join(tmpDir, `hebrih-report-${randomUUID()}.pdf`);

    const margin = getMarginValues(opts.margins);
    const scale = Math.max(0.5, Math.min(2, opts.scale / 100));

    await page.pdf({
      path: pdfPath,
      format: opts.paperSize as any,
      landscape: !!opts.landscape,
      printBackground: true,
      margin,
      scale,
      displayHeaderFooter: false,
      preferCSSPageSize: true,
    });

    await browser.close();
    return pdfPath;
  } catch (e) {
    try {
      await browser.close();
    } catch {}
    throw e;
  }
}

export function getPdfFormat(paperSize: string): "A4" | "Letter" | "Legal" {
  if (paperSize === "Letter") return "Letter";
  if (paperSize === "Legal") return "Legal";
  return "A4";
}
