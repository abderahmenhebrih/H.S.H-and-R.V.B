"use client";

import type { Invoice } from "../../types/entities/invoice";
import type { Currency, Language } from "../../types/settings/settings";
import type { InvoiceDocumentDefaults } from "../../types/settings/settings";
import { formatCurrency, getDirection } from "../../lib/settings";
import { amountInWords } from "../../lib/amountInWords";
import styles from "./FormalInvoiceDocument.module.css";

const DOC_T = {
  en: {
    invoice: "INVOICE",
    facture: "FACTURE",
    from: "FROM",
    billTo: "BILL TO",
    invoiceNo: "Invoice No.",
    issueDate: "Issue Date",
    dueDate: "Due Date",
    paymentMethod: "Payment Method",
    status: "Status",
    description: "DESCRIPTION",
    quantity: "QTY",
    weight: "WEIGHT",
    unit: "UNIT",
    unitPrice: "UNIT PRICE",
    discount: "DISCOUNT",
    tax: "TAX",
    totalHT: "TOTAL HT",
    totalTTC: "TOTAL TTC",
    subtotalHT: "Subtotal HT",
    discountTotal: "Discount",
    additionalCharges: "Additional charges",
    taxableBase: "Taxable base",
    taxTotal: "VAT",
    otherTaxTotal: "Other tax",
    grandTotal: "TOTAL TTC",
    amountInWords: "Amount in words",
    notes: "Notes",
    bankDetails: "Bank details",
    bankName: "Bank",
    bankAccount: "Account",
    rib: "RIB",
    authorizedSignature: "Authorized Signature",
    customerSignature: "Customer Signature",
    cancelled: "CANCELLED INVOICE",
    draft: "DRAFT",
    brouillon: "DRAFT",
    issued: "ISSUED",
    cancelledLabel: "CANCELLED",
    cancellationReason: "Cancellation reason",
    paymentStatus: "Payment status",
    phone: "Phone",
    email: "Email",
    address: "Address",
    rc: "RC",
    nif: "NIF",
    nis: "NIS",
    capital: "Capital",
    managementSystem: "Management System",
  },
  fr: {
    invoice: "FACTURE",
    facture: "FACTURE",
    from: "DE",
    billTo: "FACTURER À",
    invoiceNo: "N° Facture",
    issueDate: "Date d'émission",
    dueDate: "Date d'échéance",
    paymentMethod: "Mode de paiement",
    status: "Statut",
    description: "DÉSIGNATION",
    quantity: "QTÉ",
    weight: "POIDS",
    unit: "UNITÉ",
    unitPrice: "PU HT",
    discount: "REMISE",
    tax: "TVA",
    totalHT: "TOTAL HT",
    totalTTC: "TOTAL TTC",
    subtotalHT: "Sous-total HT",
    discountTotal: "Remise",
    additionalCharges: "Frais supplémentaires",
    taxableBase: "Base imposable",
    taxTotal: "TVA",
    otherTaxTotal: "Autre taxe",
    grandTotal: "TOTAL TTC",
    amountInWords: "Montant en lettres",
    notes: "Notes",
    bankDetails: "Coordonnées bancaires",
    bankName: "Banque",
    bankAccount: "Compte",
    rib: "RIB",
    authorizedSignature: "Signature Autorisée",
    customerSignature: "Signature Client",
    cancelled: "FACTURE ANNULÉE",
    draft: "BROUILLON",
    brouillon: "BROUILLON",
    issued: "ÉMISE",
    cancelledLabel: "ANNULÉE",
    cancellationReason: "Motif d'annulation",
    paymentStatus: "Statut paiement",
    phone: "Téléphone",
    email: "Email",
    address: "Adresse",
    rc: "RC",
    nif: "NIF",
    nis: "NIS",
    capital: "Capital",
    managementSystem: "Système de Gestion",
  },
  ar: {
    invoice: "فاتورة",
    facture: "فاتورة",
    from: "من",
    billTo: "فاتورة إلى",
    invoiceNo: "رقم الفاتورة",
    issueDate: "تاريخ الإصدار",
    dueDate: "تاريخ الاستحقاق",
    paymentMethod: "طريقة الدفع",
    status: "الحالة",
    description: "الوصف",
    quantity: "الكمية",
    weight: "الوزن",
    unit: "الوحدة",
    unitPrice: "سعر الوحدة HT",
    discount: "الخصم",
    tax: "الضريبة",
    totalHT: "المجموع HT",
    totalTTC: "المجموع TTC",
    subtotalHT: "المجموع HT",
    discountTotal: "الخصم",
    additionalCharges: "رسوم إضافية",
    taxableBase: "الوعاء الضريبي",
    taxTotal: "الضريبة",
    otherTaxTotal: "ضريبة أخرى",
    grandTotal: "المجموع TTC",
    amountInWords: "المبلغ كتابة",
    notes: "ملاحظات",
    bankDetails: "البيانات البنكية",
    bankName: "البنك",
    bankAccount: "الحساب",
    rib: "RIB",
    authorizedSignature: "التوقيع المعتمد",
    customerSignature: "توقيع الزبون",
    cancelled: "فاتورة ملغاة",
    draft: "مسودة",
    brouillon: "مسودة",
    issued: "صادرة",
    cancelledLabel: "ملغاة",
    cancellationReason: "سبب الإلغاء",
    paymentStatus: "حالة الدفع",
    phone: "الهاتف",
    email: "البريد",
    address: "العنوان",
    rc: "السجل التجاري",
    nif: "NIF",
    nis: "NIS",
    capital: "رأس المال",
    managementSystem: "نظام الإدارة",
  },
} as const;

function formatDateLocalized(date: number, lang: Language) {
  const locale = lang === "ar" ? "ar-DZ-u-nu-latn" : lang === "fr" ? "fr-FR" : "en-GB";
  const d = new Date(date);
  try {
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", numberingSystem: "latn" } as any).format(d);
  } catch {
    return d.toLocaleDateString("en-GB");
  }
}

type Props = {
  invoice: Invoice;
  documentDefaults?: InvoiceDocumentDefaults | null;
  showHeaderFooter?: boolean;
  uiLanguage?: Language;
};

export default function FormalInvoiceDocument(props: Props) {
  const { invoice, documentDefaults, showHeaderFooter = true } = props;

  const docLang: Language = (invoice.documentLanguage as Language) || "fr";
  const t = DOC_T[docLang];
  const dir = getDirection(docLang);
  const currency = invoice.currencyCode as Currency;

  const isCancelled = invoice.status === "CANCELLED";
  const isDraft = invoice.status === "DRAFT" || !invoice.invoiceNumber;

  const seller = invoice.sellerSnapshot;
  const customer = invoice.customerSnapshot;

  const effectiveDefaults = (invoice as any).documentDefaultsSnapshot || documentDefaults;
  const showBank = effectiveDefaults?.showBankDetails !== false;
  const showRC = effectiveDefaults?.showRC !== false;
  const showNIF = effectiveDefaults?.showNIF !== false;
  const showNIS = effectiveDefaults?.showNIS !== false;
  const showCapital = effectiveDefaults?.showCapital !== false;
  const showStamp = effectiveDefaults?.showStamp !== false;

  const words = invoice.amountInWords || amountInWords(invoice.totalTTC, currency, docLang);

  return (
    <div dir={dir} className={styles.invoicePaper} style={{ position: "relative" }}>
      {isCancelled && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
            opacity: 0.08,
            transform: "rotate(-22deg)",
            fontSize: 56,
            fontWeight: 900,
            color: "#B00020",
            border: "6px solid #B00020",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {t.cancelled}
        </div>
      )}

      {/* Header */}
      <div className={styles.topHeader}>
        <div className={styles.brandBlock}>
          <div className={styles.logo}>
            {seller.logo ? (
              <img src={seller.logo} alt={seller.commercialName} />
            ) : (
              <img src="/chicken.jpg" alt={seller.commercialName} />
            )}
          </div>
          <div className={styles.brandText}>
            <h1>{seller.commercialName}</h1>
            {seller.legalDenomination && <span>{seller.legalDenomination}</span>}
            {seller.legalForm && <span>{seller.legalForm}</span>}
            {seller.activity && <span>{seller.activity}</span>}
          </div>
        </div>
        <div className={styles.invoiceTitleBlock}>
          <h2>{t.invoice}</h2>
          <span>{t.facture}</span>
          {isDraft ? (
            <span style={{ display: "block", marginTop: 6, fontSize: 11, fontWeight: 800, color: "#B00020", letterSpacing: "0.08em" }}>{t.draft}</span>
          ) : isCancelled ? (
            <span style={{ display: "block", marginTop: 6, fontSize: 11, fontWeight: 800, color: "#B00020" }}>{t.cancelledLabel}</span>
          ) : null}
        </div>
      </div>

      {/* Seller header details */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 11, color: "#81756C" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {seller.address && <span>{seller.address}{seller.city ? `, ${seller.city}` : ""}{seller.wilaya ? ` - ${seller.wilaya}` : ""}</span>}
          {seller.phone && <span>{t.phone}: {seller.phone}</span>}
          {seller.email && <span>{t.email}: {seller.email}</span>}
          {seller.fax && <span>Fax: {seller.fax}</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "right" as const }}>
          {showRC && seller.rc && <span>{t.rc}: {seller.rc}</span>}
          {showNIF && seller.nif && <span>{t.nif}: {seller.nif}</span>}
          {showNIS && seller.nis && <span>{t.nis}: {seller.nis}</span>}
          {showCapital && seller.capital && <span>{t.capital}: {seller.capital}</span>}
        </div>
      </div>

      {/* Invoice meta */}
      <div className={styles.metaGrid}>
        <div className={styles.metaLeft}>
          <div className={styles.partyBlock}>
            <h4>{t.from}</h4>
            <strong>{seller.commercialName}</strong>
            {seller.legalDenomination && <span>{seller.legalDenomination}</span>}
          </div>
        </div>
        <div className={styles.metaRight}>
          <div className={styles.invoiceMeta}>
            <div>
              <span>{t.invoiceNo}</span>
              <strong>{isDraft ? t.draft : invoice.invoiceNumber}</strong>
            </div>
            <div>
              <span>{t.issueDate}</span>
              <strong>{formatDateLocalized(invoice.invoiceDate, docLang)}</strong>
            </div>
            {invoice.dueDate && (
              <div>
                <span>{t.dueDate}</span>
                <strong>{formatDateLocalized(invoice.dueDate, docLang)}</strong>
              </div>
            )}
            {(invoice.paymentMethodId || invoice.paymentMethod) && (
              <div>
                <span>{t.paymentMethod}</span>
                <strong>{(invoice as any).paymentMethodLabel || invoice.paymentMethod || (invoice as any).paymentMethodId}</strong>
              </div>
            )}
            <div>
              <span>{t.status}</span>
              <strong>{invoice.status === "CANCELLED" ? t.cancelledLabel : invoice.status === "ISSUED" ? t.issued : t.draft}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Parties - customer snapshot (immutable) */}
      <div className={styles.parties}>
        <div className={styles.party}>
          <h4>{t.from}</h4>
          <strong>{seller.commercialName}</strong>
          {seller.legalDenomination && <span>{seller.legalDenomination}</span>}
          {seller.address && <span>{seller.address}{seller.city ? `, ${seller.city}` : ""}</span>}
          {seller.phone && <span>{t.phone}: {seller.phone}</span>}
          {seller.email && <span>{t.email}: {seller.email}</span>}
          {showRC && seller.rc && <span>{t.rc}: {seller.rc}</span>}
          {showNIF && seller.nif && <span>{t.nif}: {seller.nif}</span>}
          {showNIS && seller.nis && <span>{t.nis}: {seller.nis}</span>}
        </div>
        <div className={styles.party}>
          <h4>{t.billTo}</h4>
          <strong>{customer.legalName || customer.name}</strong>
          {customer.commercialName && <span>{customer.commercialName}</span>}
          {customer.legalForm && <span>{customer.legalForm}</span>}
          {customer.activity && <span>{customer.activity}</span>}
          {customer.address && <span>{t.address}: {customer.address}</span>}
          {customer.phone && <span>{t.phone}: {customer.phone}</span>}
          {customer.email && <span>{t.email}: {customer.email}</span>}
          {customer.rc && <span>{t.rc}: {customer.rc}</span>}
          {customer.nif && <span>{t.nif}: {customer.nif}</span>}
          {customer.nis && <span>{t.nis}: {customer.nis}</span>}
        </div>
      </div>

      {isCancelled && invoice.cancellationReason && (
        <div style={{ padding: "10px 12px", background: "#FFF0F0", border: "1px solid #F5C2C2", borderRadius: 8, fontSize: 11 }}>
          <strong style={{ color: "#B00020" }}>{t.cancellationReason}: </strong>
          <span style={{ color: "#2F261F" }}>{invoice.cancellationReason}</span>
          {invoice.cancelledAt && <span style={{ color: "#81756C" }}> — {formatDateLocalized(invoice.cancelledAt, docLang)}</span>}
        </div>
      )}

      {/* Line items - from snapshot, no live sale recalc */}
      <div className={styles.itemsSection}>
        <h4>
          {docLang === "ar" ? "البنود" : docLang === "fr" ? "DÉSIGNATION / ARTICLES" : "DESCRIPTION / ITEMS"}
        </h4>
        <table className={styles.invoiceTable}>
          <thead>
            <tr>
              <th>{t.description}</th>
              <th>{t.quantity}</th>
              <th>{t.weight}</th>
              <th>{t.unit}</th>
              <th>{t.unitPrice}</th>
              {invoice.lines.some(l=> (l.discountAmount||0) > 0) && <th>{t.discount}</th>}
              <th>{t.tax}</th>
              <th>{t.totalHT}</th>
              <th>{t.totalTTC}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.length === 0 ? (
              <tr><td colSpan={9} className={styles.emptyCell}>—</td></tr>
            ) : (
              invoice.lines.map((line, idx) => (
                <tr key={idx}>
                  <td className={styles.descCell}>{line.description}</td>
                  <td className={styles.numeric}>{line.quantity}</td>
                  <td className={styles.numeric}>{line.weightKg.toFixed(2)} kg</td>
                  <td className={styles.numeric}>{line.unit || "kg"}</td>
                  <td className={styles.numeric}>{formatCurrency(line.unitPriceHT, currency)}</td>
                  {invoice.lines.some(l=> (l.discountAmount||0) > 0) && (
                    <td className={styles.numeric}>{line.discountAmount ? `-${formatCurrency(line.discountAmount, currency)}` : "—"}</td>
                  )}
                  <td className={styles.numeric}>{line.taxRate}%{line.otherTaxRate ? ` + ${line.otherTaxRate}%` : ""}</td>
                  <td className={styles.numeric}>{formatCurrency(line.totalHT, currency)}</td>
                  <td className={styles.numeric}>{formatCurrency(line.totalTTC, currency)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Totals - from snapshot */}
      <div className={styles.totalsSection}>
        <div className={styles.totalsBox}>
          <div className={styles.totalsRow}><span>{t.subtotalHT}</span><strong>{formatCurrency(invoice.subtotalHT, currency)}</strong></div>
          {invoice.discountTotal ? <div className={styles.totalsRow}><span>{t.discountTotal}</span><strong>-{formatCurrency(invoice.discountTotal, currency)}</strong></div> : null}
          {invoice.additionalCharges && invoice.additionalCharges.length > 0 && (
            invoice.additionalCharges.map((ch, i) => (
              <div key={i} className={styles.totalsRow}><span>{ch.label}</span><strong>{formatCurrency(ch.total, currency)}</strong></div>
            ))
          )}
          <div className={styles.totalsRow}><span>{t.taxableBase}</span><strong>{formatCurrency(invoice.taxableBase, currency)}</strong></div>
          <div className={styles.totalsRow}><span>{t.taxTotal}</span><strong>{formatCurrency(invoice.taxTotal, currency)}</strong></div>
          {invoice.otherTaxTotal ? <div className={styles.totalsRow}><span>{t.otherTaxTotal}</span><strong>{formatCurrency(invoice.otherTaxTotal, currency)}</strong></div> : null}
          <div className={styles.totalsRowGrand}><span>{t.grandTotal}</span><strong>{formatCurrency(invoice.totalTTC, currency)}</strong></div>
        </div>
      </div>

      {/* Amount in words */}
      <div style={{ padding: "10px 12px", background: "#FCF6EF", border: "1px solid #E2D4C5", borderRadius: 8, fontSize: 11 }}>
        <strong style={{ color: "#2F261F" }}>{t.amountInWords}: </strong>
        <span style={{ color: "#1a1a1a", fontStyle: "italic" }}>{words}</span>
      </div>

      {/* Bank / notes */}
      {(showBank && (seller.bankName || seller.bankAccount || seller.rib)) || invoice.notes ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 11 }}>
          {showBank && (seller.bankName || seller.bankAccount || seller.rib) && (
            <div style={{ padding: 12, background: "#F8F0E7", border: "1px solid #E2D4C5", borderRadius: 8 }}>
              <h4 style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 800, color: "#6B3A26" }}>{t.bankDetails}</h4>
              {seller.bankName && <div>{t.bankName}: {seller.bankName}</div>}
              {seller.bankAccount && <div>{t.bankAccount}: {seller.bankAccount}</div>}
              {seller.rib && <div>{t.rib}: {seller.rib}</div>}
            </div>
          )}
          {invoice.notes && (
            <div style={{ padding: 12, background: "#FFF", border: "1px solid #E2D4C5", borderRadius: 8 }}>
              <h4 style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 800 }}>{t.notes}</h4>
              <div style={{ whiteSpace: "pre-wrap" }}>{invoice.notes}</div>
            </div>
          )}
        </div>
      ) : null}

      {/* Signature / stamp */}
      {showStamp && (
        <div className={styles.signatureSection}>
          <div className={styles.signatureBlock}>
            <span>{t.authorizedSignature}</span>
            {seller.stampImage ? <img src={seller.stampImage} alt="stamp" style={{ width: 90, height: 90, objectFit: "contain", margin: "0 auto" }} /> : <div className={styles.signatureLine}></div>}
          </div>
          <div className={styles.signatureBlock}>
            <span>{t.customerSignature}</span>
            <div className={styles.signatureLine}></div>
          </div>
        </div>
      )}

      {/* Footer */}
      {showHeaderFooter && (
        <div className={styles.invoiceFooter}>
          <span>{seller.commercialName} — {t.managementSystem}</span>
        </div>
      )}
    </div>
  );
}
