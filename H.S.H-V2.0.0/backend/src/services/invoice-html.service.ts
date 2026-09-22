import fs from "fs";
import path from "path";

type GenerateInvoiceHtmlOptions = {
  invoiceId: string;
  paperSize: "A4" | "Letter" | "Legal";
  margins: "normal" | "narrow" | "wide";
  scale: number;
  documentHeaderFooter: boolean;
};

function formatCurrency(amount: number, currency: string = "DA") {
  return `${amount.toFixed(2)} ${currency}`;
}

function formatDateLocalized(dateNum: number, lang: string) {
  const locale = lang === "ar" ? "ar-DZ-u-nu-latn" : lang === "fr" ? "fr-FR" : "en-GB";
  try {
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", numberingSystem: "latn" } as any).format(new Date(dateNum));
  } catch {
    return new Date(dateNum).toLocaleDateString("en-GB");
  }
}

function escapeHtml(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function sanitizeImageUrl(url: string): string {
  const u = String(url || "").trim();
  if (u.startsWith("https://") || u.startsWith("data:image/")) return u;
  return "";
}

function getLogoDataUrl(): string {
  try {
    const possiblePaths = [
      path.join(process.cwd(), "..", "frontend", "public", "chicken.jpg"),
      path.join(process.cwd(), "frontend", "public", "chicken.jpg"),
      path.join(__dirname, "..", "..", "..", "frontend", "public", "chicken.jpg"),
      path.join(__dirname, "..", "..", "frontend", "public", "chicken.jpg"),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        const data = fs.readFileSync(p);
        const base64 = data.toString("base64");
        const ext = path.extname(p).toLowerCase() === ".png" ? "png" : "jpeg";
        return `data:image/${ext};base64,${base64}`;
      }
    }
  } catch {}
  return "";
}

export async function generateInvoiceHtml(opts: GenerateInvoiceHtmlOptions): Promise<string> {
  const { invoiceId, paperSize, margins, documentHeaderFooter } = opts;

  const { InvoiceModel } = await import("../models/invoice.model");
  const invoice: any = await InvoiceModel.findOne({ id: invoiceId }).lean();
  if (!invoice) {
    throw new Error("Invoice not found");
  }

  const docLang = invoice.documentLanguage || "fr";
  const currency = invoice.currencyCode || "DA";
  const t = {
    en: { invoice: "INVOICE", from: "FROM", billTo: "BILL TO", invoiceNo: "Invoice No.", issueDate: "Issue Date", dueDate: "Due Date", paymentMethod: "Payment Method", status: "Status", description: "DESCRIPTION", quantity: "QTY", weight: "WEIGHT", unit: "UNIT", unitPrice: "UNIT PRICE", discount: "DISCOUNT", tax: "TAX", totalHT: "TOTAL HT", totalTTC: "TOTAL TTC", subtotalHT: "Subtotal HT", discountTotal: "Discount", taxableBase: "Taxable base", taxTotal: "VAT", otherTaxTotal: "Other tax", grandTotal: "TOTAL TTC", amountInWords: "Amount in words", notes: "Notes", bankDetails: "Bank details", bankName: "Bank", bankAccount: "Account", rib: "RIB", phone: "Phone", email: "Email", address: "Address", rc: "RC", nif: "NIF", nis: "NIS", capital: "Capital", authorizedSignature: "Authorized Signature", customerSignature: "Customer Signature", cancellationReason: "Cancellation reason", cancelled: "CANCELLED INVOICE", draft: "DRAFT", cancelledLabel: "CANCELLED", issued: "ISSUED" },
    fr: { invoice: "FACTURE", from: "DE", billTo: "FACTURER À", invoiceNo: "N° Facture", issueDate: "Date d'émission", dueDate: "Date d'échéance", paymentMethod: "Mode de paiement", status: "Statut", description: "DÉSIGNATION", quantity: "QTÉ", weight: "POIDS", unit: "UNITÉ", unitPrice: "PU HT", discount: "REMISE", tax: "TVA", totalHT: "TOTAL HT", totalTTC: "TOTAL TTC", subtotalHT: "Sous-total HT", discountTotal: "Remise", taxableBase: "Base imposable", taxTotal: "TVA", otherTaxTotal: "Autre taxe", grandTotal: "TOTAL TTC", amountInWords: "Montant en lettres", notes: "Notes", bankDetails: "Coordonnées bancaires", bankName: "Banque", bankAccount: "Compte", rib: "RIB", phone: "Téléphone", email: "Email", address: "Adresse", rc: "RC", nif: "NIF", nis: "NIS", capital: "Capital", authorizedSignature: "Signature Autorisée", customerSignature: "Signature Client", cancellationReason: "Motif d'annulation", cancelled: "FACTURE ANNULÉE", draft: "BROUILLON", cancelledLabel: "ANNULÉE", issued: "ÉMISE" },
    ar: { invoice: "فاتورة", from: "من", billTo: "فاتورة إلى", invoiceNo: "رقم الفاتورة", issueDate: "تاريخ الإصدار", dueDate: "تاريخ الاستحقاق", paymentMethod: "طريقة الدفع", status: "الحالة", description: "الوصف", quantity: "الكمية", weight: "الوزن", unit: "الوحدة", unitPrice: "سعر الوحدة HT", discount: "الخصم", tax: "الضريبة", totalHT: "المجموع HT", totalTTC: "المجموع TTC", subtotalHT: "المجموع HT", discountTotal: "الخصم", taxableBase: "الوعاء الضريبي", taxTotal: "الضريبة", otherTaxTotal: "ضريبة أخرى", grandTotal: "المجموع TTC", amountInWords: "المبلغ كتابة", notes: "ملاحظات", bankDetails: "البيانات البنكية", bankName: "البنك", bankAccount: "الحساب", rib: "RIB", phone: "الهاتف", email: "البريد", address: "العنوان", rc: "السجل التجاري", nif: "NIF", nis: "NIS", capital: "رأس المال", authorizedSignature: "التوقيع المعتمد", customerSignature: "توقيع الزبون", cancellationReason: "سبب الإلغاء", cancelled: "فاتورة ملغاة", draft: "مسودة", cancelledLabel: "ملغاة", issued: "صادرة" },
  } as const;
  const tr = (t as any)[docLang] || t.en;
  const dir = docLang === "ar" ? "rtl" : "ltr";
  const seller = invoice.sellerSnapshot || {};
  const customer = invoice.customerSnapshot || {};
  const defaults = invoice.documentDefaultsSnapshot || {
    showBankDetails: true,
    showRC: true,
    showNIF: true,
    showNIS: true,
    showCapital: true,
    showStamp: true,
  };
  const isCancelled = invoice.status === "CANCELLED";
  const isDraft = invoice.status === "DRAFT" || !invoice.invoiceNumber;
  const logoUrl = seller.logo ? seller.logo : getLogoDataUrl();

  const linesHtml = (invoice.lines || []).map((line: any) => `
    <tr>
      <td class="descCell">${escapeHtml(line.description)}</td>
      <td class="numeric">${escapeHtml(String(line.quantity))}</td>
      <td class="numeric">${escapeHtml(Number(line.weightKg).toFixed(2))} kg</td>
      <td class="numeric">${escapeHtml(line.unit || "kg")}</td>
      <td class="numeric">${escapeHtml(formatCurrency(line.unitPriceHT, currency))}</td>
      <td class="numeric">${escapeHtml(String(line.taxRate))}%${line.otherTaxRate ? ` + ${escapeHtml(String(line.otherTaxRate))}%` : ""}</td>
      <td class="numeric">${escapeHtml(formatCurrency(line.totalHT, currency))}</td>
      <td class="numeric">${escapeHtml(formatCurrency(line.totalTTC, currency))}</td>
    </tr>`).join("") || `<tr><td colspan="8" class="emptyCell">—</td></tr>`;

  const cancelledBanner = isCancelled ? `<div style="position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;opacity:0.08;transform:rotate(-22deg);font-size:56px;font-weight:900;color:#B00020;border:6px solid #B00020;letter-spacing:0.12em;text-transform:uppercase;">${escapeHtml(tr.cancelled)}</div>` : "";
  const cancellationReasonHtml = isCancelled && invoice.cancellationReason ? `<div style="padding:10px 12px;background:#FFF0F0;border:1px solid #F5C2C2;border-radius:8px;font-size:11px;"><strong style="color:#B00020;">${escapeHtml(tr.cancellationReason || "Cancellation reason")}: </strong><span style="color:#2F261F;">${escapeHtml(invoice.cancellationReason)}</span>${invoice.cancelledAt ? ` — ${escapeHtml(formatDateLocalized(invoice.cancelledAt, docLang))}` : ""}</div>` : "";

  const html = `<!DOCTYPE html>
<html dir="${dir}"><head><meta charset="utf-8" />
<style>
  @page { size: ${paperSize} portrait; margin: ${margins === "narrow" ? "6mm" : margins === "wide" ? "20mm" : "12mm"}; }
  html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a}
  .invoicePaper{background:#fff;color:#1a1a1a;padding:32px;display:flex;flex-direction:column;gap:24px;min-height:100vh;box-sizing:border-box;position:relative}
  .topHeader{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;padding-bottom:20px;border-bottom:2px solid #6B3A26}
  .brandBlock{display:flex;align-items:center;gap:14px}
  .logo{width:56px;height:56px;flex:0 0 56px;border-radius:10px;overflow:hidden;background:#FCF6EF;border:1px solid #E2D4C5;display:grid;place-items:center}
  .logo img{width:100%;height:100%;object-fit:contain}
  .brandText h1{margin:0;font-size:16px;font-weight:800;color:#2F261F;line-height:1.2}
  .brandText span{display:block;margin-top:2px;font-size:11px;color:#81756C}
  .invoiceTitleBlock{text-align:right}
  .invoiceTitleBlock h2{margin:0;font-size:28px;font-weight:800;color:#2F261F;letter-spacing:0.04em;line-height:1}
  .invoiceTitleBlock span{display:block;margin-top:4px;font-size:11px;color:#81756C;font-weight:600;letter-spacing:0.08em;text-transform:uppercase}
  .metaGrid{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:16px 0;border-bottom:1px solid #E8DDD0}
  .invoiceMeta{display:flex;flex-direction:column;gap:8px;text-align:right;min-width:180px}
  .invoiceMeta div{display:flex;justify-content:space-between;gap:16px;font-size:11px}
  .invoiceMeta span{color:#81756C;font-weight:600;text-transform:uppercase;letter-spacing:0.04em}
  .invoiceMeta strong{color:#2F261F;font-weight:700}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:32px;padding:16px 0;border-bottom:1px solid #E8DDD0}
  .party{display:flex;flex-direction:column;gap:6px}
  .party h4{margin:0 0 8px;font-size:10px;font-weight:800;color:#6B3A26;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #F0E5DA;padding-bottom:6px}
  .party strong{font-size:13px;font-weight:700;color:#2F261F}
  .party span{font-size:11px;color:#81756C;line-height:1.4}
  .invoiceTable{width:100%;border-collapse:collapse;font-size:11px;color:#1a1a1a}
  .invoiceTable th{background:#F8F0E7;color:#2F261F;font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:0.04em;padding:10px 8px;border:1px solid #E2D4C5;text-align:left;white-space:nowrap}
  .invoiceTable td{padding:8px;border:1px solid #E8DDD0;font-size:11px;vertical-align:top}
  .invoiceTable td.numeric{text-align:right;font-variant-numeric:tabular-nums}
  .invoiceTable td.descCell{max-width:200px;word-break:break-word}
  .totalsSection{display:flex;justify-content:flex-end;padding-top:16px;border-top:1px solid #E2D4C5}
  .totalsBox{min-width:260px;display:flex;flex-direction:column;gap:8px}
  .totalsRow{display:flex;justify-content:space-between;gap:24px;font-size:12px;padding:6px 0}
  .totalsRow span{color:#81756C;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:0.04em}
  .totalsRow strong{color:#2F261F;font-weight:700;text-align:right}
  .totalsRowGrand{display:flex;justify-content:space-between;gap:24px;font-size:13px;padding:10px 0;border-top:2px solid #6B3A26;margin-top:4px}
  .totalsRowGrand span{color:#2F261F;font-weight:800;text-transform:uppercase}
  .totalsRowGrand strong{color:#2F261F;font-weight:800;font-size:14px}
  .signatureSection{display:grid;grid-template-columns:1fr 1fr;gap:48px;padding-top:32px;margin-top:16px}
  .signatureBlock{display:flex;flex-direction:column;gap:32px;text-align:center}
  .signatureBlock span{font-size:10px;color:#81756C;font-weight:600;text-transform:uppercase}
  .signatureLine{height:1px;background:#6B3A26;width:100%}
  .invoiceFooter{margin-top:auto;padding-top:16px;border-top:1px solid #E2D4C5;text-align:center;font-size:10px;color:#81756C}
</style></head><body>
<div class="invoicePaper" dir="${dir}">
  ${cancelledBanner}
  <div class="topHeader">
    <div class="brandBlock">
      <div class="logo">${logoUrl ? `<img src="${escapeHtml(sanitizeImageUrl(logoUrl))}" alt="${escapeHtml(seller.commercialName || "")}" />` : ""}</div>
      <div class="brandText">
        <h1>${escapeHtml(seller.commercialName || "")}</h1>
        ${seller.legalDenomination ? `<span>${escapeHtml(seller.legalDenomination)}</span>` : ""}
        ${seller.legalForm ? `<span>${escapeHtml(seller.legalForm)}</span>` : ""}
        ${seller.activity ? `<span>${escapeHtml(seller.activity)}</span>` : ""}
      </div>
    </div>
    <div class="invoiceTitleBlock">
      <h2>${tr.invoice}</h2>
      <span>${isDraft ? tr.draft : isCancelled ? tr.cancelledLabel : tr.invoice}</span>
      ${isDraft ? `<span style="display:block;margin-top:6px;font-size:11px;font-weight:800;color:#B00020;">${tr.draft}</span>` : isCancelled ? `<span style="display:block;margin-top:6px;font-size:11px;font-weight:800;color:#B00020;">${tr.cancelledLabel}</span>` : ""}
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:11px;color:#81756C;">
    <div style="display:flex;flex-direction:column;gap:2px;">
      ${seller.address ? `<span>${escapeHtml(seller.address)}${seller.city ? `, ${escapeHtml(seller.city)}` : ""}${seller.wilaya ? ` - ${escapeHtml(seller.wilaya)}` : ""}</span>` : ""}
      ${seller.phone ? `<span>${escapeHtml(tr.phone)}: ${escapeHtml(seller.phone)}</span>` : ""}
      ${seller.email ? `<span>${escapeHtml(tr.email)}: ${escapeHtml(seller.email)}</span>` : ""}
    </div>
    <div style="display:flex;flex-direction:column;gap:2px;text-align:right;">
      ${defaults.showRC !== false && seller.rc ? `<span>${escapeHtml(tr.rc)}: ${escapeHtml(seller.rc)}</span>` : ""}
      ${defaults.showNIF !== false && seller.nif ? `<span>${escapeHtml(tr.nif)}: ${escapeHtml(seller.nif)}</span>` : ""}
      ${defaults.showNIS !== false && seller.nis ? `<span>${escapeHtml(tr.nis)}: ${escapeHtml(seller.nis)}</span>` : ""}
      ${defaults.showCapital !== false && seller.capital ? `<span>${escapeHtml(tr.capital)}: ${escapeHtml(seller.capital)}</span>` : ""}
    </div>
  </div>

  <div class="metaGrid">
    <div>
      <h4 style="margin:0;font-size:10px;font-weight:800;color:#6B3A26;letter-spacing:0.08em;">${tr.from}</h4>
      <strong>${escapeHtml(seller.commercialName || "")}</strong>
    </div>
    <div class="invoiceMeta">
      <div><span>${escapeHtml(tr.invoiceNo)}</span><strong>${escapeHtml(isDraft ? tr.draft : invoice.invoiceNumber || "")}</strong></div>
      <div><span>${escapeHtml(tr.issueDate)}</span><strong>${escapeHtml(formatDateLocalized(invoice.invoiceDate, docLang))}</strong></div>
      ${invoice.dueDate ? `<div><span>${escapeHtml(tr.dueDate)}</span><strong>${escapeHtml(formatDateLocalized(invoice.dueDate, docLang))}</strong></div>` : ""}
      ${(invoice.paymentMethodId || invoice.paymentMethod) ? `<div><span>${escapeHtml(tr.paymentMethod)}</span><strong>${escapeHtml(invoice.paymentMethodLabel || invoice.paymentMethod || "")}</strong></div>` : ""}
      <div><span>${escapeHtml(tr.status)}</span><strong>${escapeHtml(invoice.status === "CANCELLED" ? tr.cancelledLabel : invoice.status === "ISSUED" ? tr.issued : tr.draft)}</strong></div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h4>${escapeHtml(tr.from)}</h4>
      <strong>${escapeHtml(seller.commercialName || "")}</strong>
      ${seller.address ? `<span>${escapeHtml(tr.address)}: ${escapeHtml(seller.address)}</span>` : ""}
      ${seller.phone ? `<span>${escapeHtml(tr.phone)}: ${escapeHtml(seller.phone)}</span>` : ""}
      ${seller.email ? `<span>${escapeHtml(tr.email)}: ${escapeHtml(seller.email)}</span>` : ""}
    </div>
    <div class="party">
      <h4>${escapeHtml(tr.billTo)}</h4>
      <strong>${escapeHtml(customer.legalName || customer.name || "")}</strong>
      ${customer.commercialName ? `<span>${escapeHtml(customer.commercialName)}</span>` : ""}
      ${customer.address ? `<span>${escapeHtml(tr.address)}: ${escapeHtml(customer.address)}</span>` : ""}
      ${customer.phone ? `<span>${escapeHtml(tr.phone)}: ${escapeHtml(customer.phone)}</span>` : ""}
      ${customer.email ? `<span>${escapeHtml(tr.email)}: ${escapeHtml(customer.email)}</span>` : ""}
      ${customer.rc ? `<span>${escapeHtml(tr.rc)}: ${escapeHtml(customer.rc)}</span>` : ""}
      ${customer.nif ? `<span>${escapeHtml(tr.nif)}: ${escapeHtml(customer.nif)}</span>` : ""}
      ${customer.nis ? `<span>${escapeHtml(tr.nis)}: ${escapeHtml(customer.nis)}</span>` : ""}
    </div>
  </div>

  ${cancellationReasonHtml}

  <div>
    <h4 style="font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;margin:0 0 12px;">${tr.description}</h4>
    <table class="invoiceTable">
      <thead><tr><th>${tr.description}</th><th>${tr.quantity}</th><th>${tr.weight}</th><th>${tr.unit}</th><th>${tr.unitPrice}</th><th>${tr.tax}</th><th>${tr.totalHT}</th><th>${tr.totalTTC}</th></tr></thead>
      <tbody>${linesHtml}</tbody>
    </table>
  </div>

  <div class="totalsSection">
    <div class="totalsBox">
      <div class="totalsRow"><span>${escapeHtml(tr.subtotalHT)}</span><strong>${escapeHtml(formatCurrency(invoice.subtotalHT, currency))}</strong></div>
      ${invoice.discountTotal ? `<div class="totalsRow"><span>${escapeHtml(tr.discountTotal)}</span><strong>-${escapeHtml(formatCurrency(invoice.discountTotal, currency))}</strong></div>` : ""}
      <div class="totalsRow"><span>${escapeHtml(tr.taxableBase)}</span><strong>${escapeHtml(formatCurrency(invoice.taxableBase, currency))}</strong></div>
      <div class="totalsRow"><span>${escapeHtml(tr.taxTotal)}</span><strong>${escapeHtml(formatCurrency(invoice.taxTotal, currency))}</strong></div>
      ${invoice.otherTaxTotal ? `<div class="totalsRow"><span>${escapeHtml(tr.otherTaxTotal)}</span><strong>${escapeHtml(formatCurrency(invoice.otherTaxTotal, currency))}</strong></div>` : ""}
      <div class="totalsRowGrand"><span>${escapeHtml(tr.grandTotal)}</span><strong>${escapeHtml(formatCurrency(invoice.totalTTC, currency))}</strong></div>
    </div>
  </div>

  <div style="padding:10px 12px;background:#FCF6EF;border:1px solid #E2D4C5;border-radius:8px;font-size:11px;">
    <strong>${escapeHtml(tr.amountInWords)}: </strong><span style="font-style:italic;">${escapeHtml(invoice.amountInWords || "")}</span>
  </div>

  ${defaults.showBankDetails !== false && (seller.bankName || seller.bankAccount || seller.rib) ? `<div style="padding:12px;background:#F8F0E7;border:1px solid #E2D4C5;border-radius:8px;font-size:11px;"><h4 style="margin:0 0 6px;font-size:10px;font-weight:800;color:#6B3A26;">${escapeHtml(tr.bankDetails)}</h4>${seller.bankName ? `<div>${escapeHtml(tr.bankName)}: ${escapeHtml(seller.bankName)}</div>` : ""}${seller.bankAccount ? `<div>${escapeHtml(tr.bankAccount)}: ${escapeHtml(seller.bankAccount)}</div>` : ""}${seller.rib ? `<div>${escapeHtml(tr.rib)}: ${escapeHtml(seller.rib)}</div>` : ""}</div>` : ""}
  ${invoice.notes ? `<div style="padding:12px;background:#FFF;border:1px solid #E2D4C5;border-radius:8px;font-size:11px;"><h4 style="margin:0 0 6px;font-size:10px;font-weight:800;">${escapeHtml(tr.notes)}</h4><div style="white-space:pre-wrap;">${escapeHtml(invoice.notes)}</div></div>` : ""}

  ${defaults.showStamp !== false ? `<div class="signatureSection">
    <div class="signatureBlock"><span>${escapeHtml(tr.authorizedSignature)}</span>${seller.stampImage ? `<img src="${escapeHtml(sanitizeImageUrl(seller.stampImage))}" alt="stamp" style="width:90px;height:90px;object-fit:contain;margin:0 auto;" />` : `<div class="signatureLine"></div>`}</div>
    <div class="signatureBlock"><span>${escapeHtml(tr.customerSignature)}</span><div class="signatureLine"></div></div>
  </div>` : ""}

  ${documentHeaderFooter ? `<div class="invoiceFooter"><span>${escapeHtml(seller.commercialName || "")} — Management System</span></div>` : ""}
</div>
</body></html>`;

  return html;
}
