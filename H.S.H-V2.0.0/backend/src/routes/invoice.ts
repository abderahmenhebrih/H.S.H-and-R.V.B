import { Router } from "express";
import { InvoiceModel } from "../models/invoice.model";
import { InvoiceSellerProfileModel } from "../models/invoice-seller-profile.model";
import { InvoiceTaxProfileModel } from "../models/invoice-tax-profile.model";
import { SaleModel } from "../models/sale.model";
import { ProductModel } from "../models/product.model";
import { CustomerModel } from "../models/customer.model";
import { SupplierModel } from "../models/supplier.model";
import { SettingsModel } from "../models/settings.model";
import { SyncChangeModel } from "../models/sync-change.model";
import { SyncCounterModel } from "../models/sync-counter.model";
import { InvoiceSourceReservationModel } from "../models/invoice-source-reservation.model";
import { v4 as uuidv4 } from "uuid";
import { roundMoney, computeLineFromTaxRate, amountInWordsBackend } from "../lib/invoice-helpers";

async function getNextRevision(session: any): Promise<number> {
  const doc = await SyncCounterModel.findOneAndUpdate(
    { name: "global" },
    { $inc: { revision: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true, session },
  );
  if (!doc) {
    const created = await SyncCounterModel.create([{ name: "global", revision: 1 }], { session } as any);
    return (created[0] as any).revision;
  }
  return (doc as any).revision;
}

const router = Router();

// Atomic issuance: POST /api/invoices/issue
router.post("/issue", async (req, res) => {
  const {
    draftId,
    sellerProfileId,
    customerId,
    sourceSaleIds,
    invoiceDate,
    dueDate,
    paymentMethod,
    paymentMethodId,
    paymentMethodLabel,
    documentLanguage,
    currencyCode,
    notes,
    lines: clientLines,
    sellerSnapshot: providedSellerSnapshot,
    customerSnapshot: providedCustomerSnapshot,
    documentDefaultsSnapshot,
  } = req.body as any;

  if (!sellerProfileId || !customerId || !Array.isArray(sourceSaleIds) || sourceSaleIds.length === 0) {
    res.status(400).json({ success: false, message: "Missing required fields" });
    return;
  }
  if (!Array.isArray(clientLines) || clientLines.length === 0) {
    // Allow empty lines? No, require at least one for new pipeline
    // But we will compute from sales, so we need at least sourceSaleIds
  }

  try {
    const session = await InvoiceModel.startSession();
    session.startTransaction();
    try {
      // 1. Validate seller
      const sellerProfile: any = await InvoiceSellerProfileModel.findOne({ id: sellerProfileId }).session(session);
      if (!sellerProfile || !sellerProfile.enabled) {
        await session.abortTransaction();
        res.status(400).json({ success: false, message: "Invalid seller profile" });
        return;
      }

      // Migration for defaultPaymentMethodId from old defaultPaymentTerms
      if (!sellerProfile.defaultPaymentMethodId && sellerProfile.defaultPaymentTerms) {
        const old = String(sellerProfile.defaultPaymentTerms);
        if (["cash","bank_transfer","cheque","other"].includes(old) || old.startsWith("pm-")) {
          sellerProfile.defaultPaymentMethodId = old;
        }
      }

      // 2. Validate source sale(s) and ownership
      const sales: any[] = await SaleModel.find({ id: { $in: sourceSaleIds } }).session(session);
      if (sales.length !== sourceSaleIds.length) {
        await session.abortTransaction();
        res.status(400).json({ success: false, message: "Source sale not found" });
        return;
      }
      for (const sale of sales) {
        if (sale.customerId !== customerId) {
          await session.abortTransaction();
          res.status(400).json({ success: false, code: "SOURCE_SALE_CUSTOMER_MISMATCH", message: "Source sale does not belong to customer" });
          return;
        }
      }

      // 2b. Concurrency-safe reservation: try to insert reservation for each sale
      // Check if already reserved
      for (const saleId of sourceSaleIds) {
        const existingReservation = await InvoiceSourceReservationModel.findOne({ saleId }).session(session);
        if (existingReservation) {
          // If reservation exists for same sale, reject even if different seller
          await session.abortTransaction();
          res.status(409).json({ success: false, code: "SOURCE_SALE_ALREADY_INVOICED", message: "Source sale already invoiced" });
          return;
        }
      }

      // 3. Also check existing ISSUED invoices (defense in depth, though reservation is primary)
      const existingIssued = await InvoiceModel.findOne({
        sourceSaleIds: { $in: sourceSaleIds },
        status: "ISSUED",
      }).session(session);
      if (existingIssued) {
        const overlap = existingIssued.sourceSaleIds.some((id: string) => sourceSaleIds.includes(id));
        if (overlap) {
          await session.abortTransaction();
          res.status(409).json({ success: false, code: "SOURCE_SALE_ALREADY_INVOICED", message: "Source sale already invoiced" });
          return;
        }
      }

      // 4. Preflight: seller legal fields, customer legal fields
      const sellerMissing: string[] = [];
      if (!sellerProfile.commercialName) sellerMissing.push("commercialName");
      // Require at least address for legal invoice
      if (!sellerProfile.address) sellerMissing.push("address");
      if (!sellerProfile.rc) sellerMissing.push("rc");
      // We consider these required per spec; if missing, block Issue
      if (sellerMissing.length > 0) {
        await session.abortTransaction();
        res.status(400).json({ success: false, code: "SELLER_PROFILE_INCOMPLETE", message: "Complete the seller invoice profile in Settings" });
        return;
      }
      let customer: any = await CustomerModel.findOne({ id: customerId }).session(session);
      if (!customer) {
        await session.abortTransaction();
        res.status(400).json({ success: false, message: "Customer not found" });
        return;
      }
      const custType = (customer as any).invoiceCustomerType || "consumer";
      if (custType === "consumer") {
        if (!customer.name || (!customer.address && !(customer as any).billingAddress)) {
          await session.abortTransaction();
          res.status(400).json({ success: false, code: "CUSTOMER_IDENTITY_INCOMPLETE", message: "Complete the customer's invoice identity before issuing" });
          return;
        }
      } else {
        // business
        if (!((customer as any).legalName || customer.name) || !(customer as any).rc || !(customer as any).nif) {
          await session.abortTransaction();
          res.status(400).json({ success: false, code: "CUSTOMER_IDENTITY_INCOMPLETE", message: "Complete the customer's invoice identity before issuing" });
          return;
        }
      }

      // 5. Tax resolution: build lines server-side, do not trust client taxRate/taxAmount
      // Hierarchy: 1) Explicit invoice-wide tax override? For now, each line's product tax, then seller default
      // We will use clientLines' productId/quantity/weightKg/price but compute tax from profile
      const now = Date.now();
      const currentYear = new Date(now).getFullYear();
      let sequenceNumber: number;
      let invoiceNumber: string;
      // Year reset logic: if yearly, check lastSequenceYear
      if (sellerProfile.yearResetPolicy === "yearly") {
        if (sellerProfile.lastSequenceYear !== currentYear) {
          // Reset nextNumber to 1 atomically if year changed
          const resetRes = await InvoiceSellerProfileModel.findOneAndUpdate(
            { id: sellerProfileId, lastSequenceYear: { $ne: currentYear } },
            { $set: { nextNumber: 1, lastSequenceYear: currentYear, updatedAt: now } },
            { new: true, session }
          );
          if (resetRes) {
            // Use reset value
            const updated = await InvoiceSellerProfileModel.findOneAndUpdate(
              { id: sellerProfileId },
              { $inc: { nextNumber: 1 }, $set: { updatedAt: now } },
              { new: true, session }
            );
            if (!updated) {
              await session.abortTransaction();
              res.status(500).json({ success: false, message: "Failed to increment seller sequence" });
              return;
            }
            sequenceNumber = updated.nextNumber - 1;
            const padding = updated.paddingLength || 6;
            const prefix = updated.invoicePrefix || "INV";
            invoiceNumber = `${prefix}-${currentYear}-${String(sequenceNumber).padStart(padding, "0")}`;
            // Need to ensure we use this updated profile for later
            sellerProfile.nextNumber = updated.nextNumber;
            sellerProfile.lastSequenceYear = currentYear;
          } else {
            // Another concurrent request already reset, just increment
            const updated = await InvoiceSellerProfileModel.findOneAndUpdate(
              { id: sellerProfileId },
              { $inc: { nextNumber: 1 }, $set: { updatedAt: now, lastSequenceYear: currentYear } },
              { new: true, session }
            );
            if (!updated) {
              await session.abortTransaction();
              res.status(500).json({ success: false, message: "Failed to increment seller sequence" });
              return;
            }
            sequenceNumber = updated.nextNumber - 1;
            const padding = updated.paddingLength || 6;
            const prefix = updated.invoicePrefix || "INV";
            invoiceNumber = `${prefix}-${currentYear}-${String(sequenceNumber).padStart(padding, "0")}`;
          }
        } else {
          const updated = await InvoiceSellerProfileModel.findOneAndUpdate(
            { id: sellerProfileId },
            { $inc: { nextNumber: 1 }, $set: { updatedAt: now } },
            { new: true, session }
          );
          if (!updated) {
            await session.abortTransaction();
            res.status(500).json({ success: false, message: "Failed to increment seller sequence" });
            return;
          }
          sequenceNumber = updated.nextNumber - 1;
          const padding = updated.paddingLength || 6;
          const prefix = updated.invoicePrefix || "INV";
          invoiceNumber = `${prefix}-${currentYear}-${String(sequenceNumber).padStart(padding, "0")}`;
        }
      } else {
        // never
        const updated = await InvoiceSellerProfileModel.findOneAndUpdate(
          { id: sellerProfileId },
          { $inc: { nextNumber: 1 }, $set: { updatedAt: now } },
          { new: true, session }
        );
        if (!updated) {
          await session.abortTransaction();
          res.status(500).json({ success: false, message: "Failed to increment seller sequence" });
          return;
        }
        sequenceNumber = updated.nextNumber - 1;
        const padding = updated.paddingLength || 6;
        const prefix = updated.invoicePrefix || "INV";
        invoiceNumber = `${prefix}-${String(sequenceNumber).padStart(padding, "0")}`;
      }

      const existingNumber = await InvoiceModel.findOne({ sellerProfileId, invoiceNumber }).session(session);
      if (existingNumber) {
        await session.abortTransaction();
        res.status(409).json({ success: false, message: "Invoice number collision" });
        return;
      }

      // Build snapshots canonically from DB, not trusting arbitrary provided snapshots
      let sellerSnapshot: any = {
        commercialName: sellerProfile.commercialName,
        legalDenomination: sellerProfile.legalDenomination,
        legalForm: sellerProfile.legalForm,
        activity: sellerProfile.activity,
        address: sellerProfile.address,
        city: sellerProfile.city,
        wilaya: sellerProfile.wilaya,
        phone: sellerProfile.phone,
        email: sellerProfile.email,
        fax: sellerProfile.fax,
        rc: sellerProfile.rc,
        nif: sellerProfile.nif,
        nis: sellerProfile.nis,
        capital: sellerProfile.capital,
        bankName: sellerProfile.bankName,
        bankAccount: sellerProfile.bankAccount,
        rib: sellerProfile.rib,
        logo: sellerProfile.logo,
        stampImage: sellerProfile.stampImage,
      };
      // If client provided snapshot, validate it matches canonical (do not blindly trust)
      if (providedSellerSnapshot) {
        // Simple validation: commercialName must match
        if (providedSellerSnapshot.commercialName && providedSellerSnapshot.commercialName !== sellerSnapshot.commercialName) {
          // Use canonical, ignore mismatch
        }
      }
      let customerSnapshot: any = {
        name: (customer as any).name,
        legalName: (customer as any).legalName || (customer as any).name,
        commercialName: (customer as any).commercialName,
        legalForm: (customer as any).legalForm,
        activity: (customer as any).activity,
        address: (customer as any).billingAddress || (customer as any).address,
        phone: (customer as any).phone,
        email: (customer as any).email,
        rc: (customer as any).rc,
        nif: (customer as any).nif,
        nis: (customer as any).nis,
      };

      const invoiceId = draftId && typeof draftId === "string" && draftId.startsWith("inv-") ? draftId : `inv-${uuidv4()}`;
      let draftToDelete: any = null;
      if (draftId) {
        draftToDelete = await InvoiceModel.findOne({ id: draftId, status: "DRAFT" }).session(session);
      }

      // Server-side line computation: for each sale item, resolve tax profile
      // We need to load products to snapshot description, and tax profiles
      const allProductIds = Array.from(new Set(sales.flatMap((s:any)=> s.items.map((it:any)=> it.productId))));
      const products = await ProductModel.find({ id: { $in: allProductIds } }).lean().session(session) as any[];
      const productMap = new Map(products.map((p:any)=> [p.id, p]));

      // Determine invoice-wide tax override if provided? For now, clientLines may contain taxProfileId per line if user selected
      // We will respect per-line taxProfileId if provided and valid, otherwise fallback hierarchy
      const taxProfileCache = new Map<string, any>();
      async function getTaxProfile(id: string): Promise<any|null> {
        if (!id) return null;
        if (taxProfileCache.has(id)) return taxProfileCache.get(id);
        const tp = await InvoiceTaxProfileModel.findOne({ id }).session(session).then((d:any)=> d ? d.toObject ? d.toObject() : d : null);
        taxProfileCache.set(id, tp);
        return tp;
      }

      const lines: any[] = [];
      let unresolvedTax = false;
      for (const sale of sales) {
        for (const item of sale.items) {
          const product: any = productMap.get(item.productId);
          const description = product?.name ?? item.productId;
          // Tax resolution hierarchy: 1) Explicit per-line taxProfileId from client (if valid), 2) Product.taxProfileId, 3) Seller.defaultTaxProfileId, 4) UNRESOLVED
          let taxProfileId: string | undefined = undefined;
          // Check if client sent taxProfileId for this product - must be enabled and valid
          const clientLineForProduct = (clientLines || []).find((cl:any)=> cl.productId === item.productId);
          if (clientLineForProduct?.taxProfileId) {
            const tpCheck = await getTaxProfile(clientLineForProduct.taxProfileId);
            if (tpCheck && tpCheck.enabled === true && Number.isFinite(Number(tpCheck.vatRate)) && Number(tpCheck.vatRate) >= 0) taxProfileId = clientLineForProduct.taxProfileId;
          }
          if (!taxProfileId && product?.taxProfileId) {
            const tpCheck = await getTaxProfile(product.taxProfileId);
            if (tpCheck && tpCheck.enabled === true && Number.isFinite(Number(tpCheck.vatRate)) && Number(tpCheck.vatRate) >= 0) taxProfileId = product.taxProfileId;
          }
          if (!taxProfileId && sellerProfile.defaultTaxProfileId) {
            const tpCheck = await getTaxProfile(sellerProfile.defaultTaxProfileId);
            if (tpCheck && tpCheck.enabled === true && Number.isFinite(Number(tpCheck.vatRate)) && Number(tpCheck.vatRate) >= 0) taxProfileId = sellerProfile.defaultTaxProfileId;
          }
          if (!taxProfileId) {
            unresolvedTax = true;
            // For now, we will block Issue if unresolved
            continue;
          }
          const taxProfile: any = await getTaxProfile(taxProfileId);
          if (!taxProfile) {
            unresolvedTax = true;
            continue;
          }
          const vatRate = Number(taxProfile.vatRate ?? 0);
          const otherTaxRate = Number(taxProfile.otherTaxRate ?? 0);
          const otherTaxLabel = taxProfile.otherTaxLabel || undefined;

          // Validate item matches server sale data
          if (item.quantity == null || item.weightKg == null || item.price == null) {
            await session.abortTransaction();
            res.status(400).json({ success: false, message: "Invalid sale item data" });
            return;
          }
          // Sale total must be weight*price (quantity is informational), within 0.01
          const expectedSaleTotal = roundMoney(item.weightKg * item.price);
          if (Math.abs(Number(item.total) - expectedSaleTotal) > 0.01) {
            await session.abortTransaction();
            res.status(400).json({ success: false, code: "SALE_TOTAL_MISMATCH", message: "Sale total mismatch" });
            return;
          }

          const { totalHT, taxAmount, otherTaxAmount, totalTTC } = computeLineFromTaxRate(item.weightKg, item.price, item.quantity, vatRate, otherTaxRate, 0);

          lines.push({
            productId: item.productId,
            description,
            quantity: item.quantity,
            weightKg: item.weightKg,
            unit: "kg",
            unitPriceHT: item.price,
            discountType: "none",
            discountValue: 0,
            discountAmount: 0,
            totalHT,
            taxProfileId,
            taxCode: taxProfile.code,
            taxLabel: taxProfile.name,
            taxRate: vatRate,
            taxAmount,
            otherTaxRate: otherTaxRate || undefined,
            otherTaxLabel: otherTaxLabel,
            otherTaxAmount: otherTaxAmount || undefined,
            totalTTC,
          });
        }
      }

      if (unresolvedTax || lines.length === 0) {
        await session.abortTransaction();
        res.status(400).json({ success: false, code: "TAX_UNRESOLVED", message: "Tax profile unresolved for one or more lines. Configure product tax or seller default." });
        return;
      }

      // Compute totals server-side from rounded lines
      const subtotalHT = roundMoney(lines.reduce((s,l)=> s + l.totalHT, 0));
      const taxTotal = roundMoney(lines.reduce((s,l)=> s + l.taxAmount, 0));
      const otherTaxTotal = roundMoney(lines.reduce((s,l)=> s + (l.otherTaxAmount||0), 0));
      const totalTTC = roundMoney(lines.reduce((s,l)=> s + l.totalTTC, 0));
      const taxableBase = subtotalHT;

      // Load canonical settings for hierarchy and validation (server owns currency, payment, document defaults)
      let canonicalSettings: any = null;
      try {
        canonicalSettings = await SettingsModel.findOne({ id: "settings" }).session(session);
        if (!canonicalSettings) canonicalSettings = await SettingsModel.findOne({}).session(session);
        if (canonicalSettings && (canonicalSettings as any).toObject) canonicalSettings = (canonicalSettings as any).toObject();
      } catch {}
      const globalCurrency = canonicalSettings?.currency;
      const docDefaultsCanonical = canonicalSettings?.invoiceDocumentDefaults || {};
      const allowedCurrencies = ["DA","€","$"] as const;
      // Outgoing explicit invalid currency must reject (do not silently fallback)
      if (currencyCode != null && String(currencyCode).trim() !== "" && !(allowedCurrencies as readonly string[]).includes(String(currencyCode).trim())) {
        await session.abortTransaction();
        res.status(400).json({ success: false, code: "INVOICE_CURRENCY_INVALID", message: "Invalid currency — use DA, € or $" });
        return;
      }
      // Fallback hierarchy only when currencyCode missing/empty: Seller → docDefaults → global → DA
      const effectiveCurrencyCode = (currencyCode != null && String(currencyCode).trim() !== "") ? String(currencyCode).trim() : undefined;
      const currencyCandidates = [effectiveCurrencyCode, sellerProfile.defaultCurrency, docDefaultsCanonical?.defaultCurrency, globalCurrency, "DA"];
      let currency: string = "DA";
      for (const cand of currencyCandidates) {
        if (typeof cand === "string" && cand.trim() !== "" && (allowedCurrencies as readonly string[]).includes(cand.trim())) {
          currency = cand.trim();
          break;
        }
      }
      if (!(allowedCurrencies as readonly string[]).includes(currency)) currency = "DA";
      const docLangRaw = documentLanguage || docDefaultsCanonical?.defaultInvoiceLanguage || canonicalSettings?.language || "fr";
      const docLang = ["ar","fr","en"].includes(docLangRaw) ? docLangRaw : "fr";
      const words = amountInWordsBackend(totalTTC, currency, docLang);

      // Payment method snapshot: server owns, validate against canonical Settings.invoicePaymentMethods (ignore client label)
      const pmId = (paymentMethodId || paymentMethod || sellerProfile.defaultPaymentMethodId || "").toString().trim() || undefined;
      let pmLabel: string | undefined = undefined;
      if (pmId) {
        let canonicalMethods: any[] = [];
        if (Array.isArray(canonicalSettings?.invoicePaymentMethods) && canonicalSettings.invoicePaymentMethods.length > 0) {
          canonicalMethods = canonicalSettings.invoicePaymentMethods;
        } else {
          canonicalMethods = [
            { id: "cash", label: "Cash", enabled: true, isCustom: false },
            { id: "bank_transfer", label: "Bank transfer", enabled: true, isCustom: false },
            { id: "cheque", label: "Cheque", enabled: true, isCustom: false },
            { id: "other", label: "Other", enabled: true, isCustom: false },
          ];
        }
        const found = canonicalMethods.find((m:any) => m.id === pmId);
        if (!found || found.enabled !== true) {
          await session.abortTransaction();
          res.status(400).json({ success: false, code: "PAYMENT_METHOD_INVALID", message: "Invalid or disabled payment method" });
          return;
        }
        const builtInMap: Record<string, Record<string,string>> = {
          cash: { en: "Cash", fr: "Espèces", ar: "نقداً" },
          bank_transfer: { en: "Bank transfer", fr: "Virement bancaire", ar: "تحويل بنكي" },
          cheque: { en: "Cheque", fr: "Chèque", ar: "شيك" },
          other: { en: "Other", fr: "Autre", ar: "أخرى" },
        };
        if (builtInMap[pmId]) {
          pmLabel = (builtInMap[pmId] as any)[docLang] || builtInMap[pmId].en;
        } else {
          pmLabel = found.label;
        }
      }
      // Document defaults snapshot - server owns, ignore client supplied documentDefaultsSnapshot
      const docDefaultsSnap = {
        showBankDetails: docDefaultsCanonical?.showBankDetails ?? true,
        showRC: docDefaultsCanonical?.showRC ?? true,
        showNIF: docDefaultsCanonical?.showNIF ?? true,
        showNIS: docDefaultsCanonical?.showNIS ?? true,
        showCapital: docDefaultsCanonical?.showCapital ?? true,
        showStamp: docDefaultsCanonical?.showStamp ?? true,
      };
      const issuedInvoiceData: any = {
        id: invoiceId,
        createdAt: draftToDelete ? draftToDelete.createdAt : now,
        updatedAt: now,
        syncStatus: "synced",
        lastSyncedAt: now,
        status: "ISSUED",
        sellerProfileId,
        invoiceNumber,
        sequenceNumber,
        sellerSnapshot,
        customerSnapshot,
        customerId,
        sourceSaleIds,
        invoiceDate: invoiceDate || now,
        dueDate: dueDate || undefined,
        paymentMethod: pmId || undefined,
        paymentMethodId: pmId || undefined,
        paymentMethodLabel: pmLabel || undefined,
        documentDefaultsSnapshot: docDefaultsSnap,
        lines,
        subtotalHT,
        discountTotal: 0,
        additionalCharges: [],
        additionalChargesTotal: 0,
        taxableBase,
        taxTotal,
        otherTaxTotal,
        totalTTC,
        amountInWords: words,
        currencyCode: currency,
        documentLanguage: docLang,
        notes: notes || undefined,
        issuedAt: now,
        paymentStatus: "UNPAID",
      };

      const revision = await getNextRevision(session);
      issuedInvoiceData.serverRevision = revision;
      if (draftToDelete) {
        await InvoiceModel.deleteOne({ id: draftId }).session(session);
      }
      // Insert reservations for each sale (concurrency-safe unique)
      for (const saleId of sourceSaleIds) {
        try {
          await InvoiceSourceReservationModel.create([{
            saleId,
            invoiceId,
            sellerProfileId,
            createdAt: now,
          }], { session } as any);
        } catch (e: any) {
          if (e && (e.code === 11000 || String(e.message).includes("duplicate"))) {
            await session.abortTransaction();
            res.status(409).json({ success: false, code: "SOURCE_SALE_ALREADY_INVOICED", message: "Source sale already invoiced" });
            return;
          }
          throw e;
        }
      }

      const created = await InvoiceModel.create([issuedInvoiceData], { session });
      await SyncChangeModel.create(
        [
          {
            revision,
            entity: "invoice",
            entityId: invoiceId,
            operation: "create",
            payload: issuedInvoiceData,
            changedAt: new Date(),
            sourceClientId: (req.body as any).clientId || "invoice-issue",
            operationId: `issue-${invoiceId}-${Date.now()}`,
          },
        ],
        { session },
      );

      await session.commitTransaction();
      res.json({ success: true, invoice: created[0], invoiceNumber, sequenceNumber, revision });
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error("Invoice issue failed:", error);
    const msg = error instanceof Error ? error.message : "Issue failed";
    if (msg.includes("SOURCE_SALE_ALREADY_INVOICED") || (error as any)?.code === 11000) {
      res.status(409).json({ success: false, code: "SOURCE_SALE_ALREADY_INVOICED", message: "Source sale already invoiced" });
      return;
    }
    res.status(500).json({ success: false, message: msg });
  }
});

// Cancel invoice: POST /api/invoices/cancel
router.post("/cancel", async (req, res) => {
  const { invoiceId, reason } = req.body as any;
  if (!invoiceId || typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ success: false, message: "invoiceId and non-empty reason required" });
    return;
  }
  try {
    const session = await InvoiceModel.startSession();
    session.startTransaction();
    try {
      const invoice: any = await InvoiceModel.findOne({ id: invoiceId }).session(session);
      if (!invoice) {
        await session.abortTransaction();
        res.status(404).json({ success: false, message: "Invoice not found" });
        return;
      }
      if (invoice.status === "CANCELLED") {
        await session.abortTransaction();
        res.status(400).json({ success: false, message: "Already cancelled" });
        return;
      }
      if (invoice.status !== "ISSUED") {
        await session.abortTransaction();
        res.status(400).json({ success: false, message: "Only ISSUED invoices can be cancelled" });
        return;
      }
      const revision = await getNextRevision(session);
      invoice.status = "CANCELLED";
      invoice.cancelledAt = Date.now();
      invoice.cancellationReason = reason.trim();
      invoice.updatedAt = Date.now();
      invoice.syncStatus = "synced";
      (invoice as any).serverRevision = revision;
      invoice.lastSyncedAt = Date.now();
      await invoice.save({ session });
      await SyncChangeModel.create(
        [
          {
            revision,
            entity: "invoice",
            entityId: invoiceId,
            operation: "update",
            payload: invoice.toObject ? invoice.toObject() : invoice,
            changedAt: new Date(),
            sourceClientId: (req.body as any).clientId || "invoice-cancel",
            operationId: `cancel-${invoiceId}-${Date.now()}`,
          },
        ],
        { session },
      );
      await session.commitTransaction();
      res.json({ success: true, invoice, revision });
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error("Invoice cancel failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Cancel failed" });
  }
});

// Incoming invoice: POST /api/invoices/incoming
router.post("/incoming", async (req, res) => {
  const { supplierId, supplierInvoiceNumber, invoiceDate, date, number, total, amountHT, amountTTC, taxAmount, currencyCode, purchaseReference, paymentStatus, notes, attachment, fileName } = req.body as any;
  const effectiveSupplierInvoiceNumber = supplierInvoiceNumber || number;
  const effectiveInvoiceDate = invoiceDate || date;
  const effectiveAmountHT = amountHT != null ? Number(amountHT) : total != null ? Number(total) : undefined;
  const effectiveAmountTTC = amountTTC != null ? Number(amountTTC) : total != null ? Number(total) : effectiveAmountHT;
  if (!supplierId || !effectiveSupplierInvoiceNumber || !effectiveInvoiceDate || effectiveAmountHT == null || effectiveAmountTTC == null) {
    res.status(400).json({ success: false, code: "INCOMING_AMOUNT_INVALID", message: "Missing required fields: supplierId, supplierInvoiceNumber, invoiceDate, amountHT, amountTTC" });
    return;
  }
  // SUPPLIER validation: must exist in canonical Supplier collection
  try {
    const supplierExists = await SupplierModel.findOne({ id: supplierId }).lean();
    if (!supplierExists) {
      res.status(400).json({ success: false, code: "SUPPLIER_NOT_FOUND", message: "Supplier not found" });
      return;
    }
  } catch {}
  // SUPPLIER INVOICE NUMBER: trim and must be non-empty
  const trimmedSupplierNumber = String(effectiveSupplierInvoiceNumber).trim();
  if (!trimmedSupplierNumber) {
    res.status(400).json({ success: false, code: "SUPPLIER_INVOICE_NUMBER_REQUIRED", message: "Supplier invoice number is required" });
    return;
  }
  // INVOICE DATE: must parse to valid finite date
  const invoiceDateMs = typeof effectiveInvoiceDate === "number" ? effectiveInvoiceDate : new Date(effectiveInvoiceDate).getTime();
  if (!Number.isFinite(invoiceDateMs)) {
    res.status(400).json({ success: false, code: "INVOICE_DATE_INVALID", message: "Invalid invoice date" });
    return;
  }
  // CURRENCY: must be one of DA, €, $ with hierarchy docDefaults → global → DA
  const allowedCurrencies = ["DA","€","$"] as const;
  let canonicalSettingsPre: any = null;
  try {
    canonicalSettingsPre = await SettingsModel.findOne({ id: "settings" }).lean();
    if (!canonicalSettingsPre) canonicalSettingsPre = await SettingsModel.findOne({}).lean();
  } catch {}
  const docDefaultsCurrencyPre = canonicalSettingsPre?.invoiceDocumentDefaults?.defaultCurrency;
  const globalCurrencyPre = canonicalSettingsPre?.currency;
  // If currencyCode explicitly provided and not allowed, reject
  if (currencyCode != null && String(currencyCode).trim() !== "" && !(allowedCurrencies as readonly string[]).includes(String(currencyCode).trim())) {
    res.status(400).json({ success: false, code: "INVOICE_CURRENCY_INVALID", message: "Invalid currency — use DA, € or $" });
    return;
  }
  let finalCurrencyPre = String(currencyCode || "").trim();
  if (!finalCurrencyPre) {
    const candidates = [docDefaultsCurrencyPre, globalCurrencyPre, "DA"];
    for (const cand of candidates) {
      if (typeof cand === "string" && cand.trim() !== "" && (allowedCurrencies as readonly string[]).includes(cand.trim())) { finalCurrencyPre = cand.trim(); break; }
    }
    if (!(allowedCurrencies as readonly string[]).includes(finalCurrencyPre)) finalCurrencyPre = "DA";
  }
  if (!(allowedCurrencies as readonly string[]).includes(finalCurrencyPre)) {
    res.status(400).json({ success: false, code: "INVOICE_CURRENCY_INVALID", message: "Invalid currency — use DA, € or $" });
    return;
  }
  const htNum = Number(effectiveAmountHT);
  const ttcNum = Number(effectiveAmountTTC);
  const taxNum = taxAmount != null ? Number(taxAmount) : ttcNum - htNum;
  if (!Number.isFinite(htNum) || !Number.isFinite(ttcNum) || !Number.isFinite(taxNum) || htNum < 0 || ttcNum < 0 || taxNum < 0 || ttcNum < htNum) {
    res.status(400).json({ success: false, code: "INCOMING_AMOUNT_INVALID", message: "Invalid amounts: HT/TTC must be finite >=0 and TTC >= HT" });
    return;
  }
  try {
  const { IncomingInvoiceModel } = await import("../models/incoming-invoice.model");
      const now = Date.now();
      const session = await IncomingInvoiceModel.startSession();
      session.startTransaction();
      try {
        const revision = await getNextRevision(session);
        const doc: any = {
          id: `inc-${uuidv4()}`,
          supplierId,
          supplierInvoiceNumber: trimmedSupplierNumber,
          invoiceDate: invoiceDateMs,
          amountHT: htNum,
          taxAmount: taxNum,
          amountTTC: ttcNum,
        currencyCode: finalCurrencyPre,
        purchaseReference: purchaseReference || undefined,
        paymentStatus: paymentStatus || "UNPAID",
        notes: notes || undefined,
        attachment: attachment || fileName || undefined,
        createdAt: now,
        updatedAt: now,
        syncStatus: "synced",
        serverRevision: revision,
        lastSyncedAt: now,
      };
      const created = await IncomingInvoiceModel.create([doc], { session });
      await SyncChangeModel.create(
        [
          {
            revision,
            entity: "incomingInvoice",
            entityId: doc.id,
            operation: "create",
            payload: doc,
            changedAt: new Date(),
            sourceClientId: (req.body as any).clientId || "incoming-create",
            operationId: `incoming-${doc.id}-${Date.now()}`,
          },
        ],
        { session },
      );
      await session.commitTransaction();
      res.json({ success: true, invoice: created[0], revision });
    } catch (e: any) {
      if (e && (e.code === 11000 || String(e.message || "").includes("duplicate") || String(e.message || "").includes("E11000"))) {
        await session.abortTransaction();
        res.status(409).json({ success: false, code: "INCOMING_INVOICE_DUPLICATE", message: "An invoice with this number already exists for this supplier." });
        return;
      }
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    if (error && (error.code === 11000 || String(error.message || "").includes("duplicate") || String(error.message || "").includes("E11000"))) {
      res.status(409).json({ success: false, code: "INCOMING_INVOICE_DUPLICATE", message: "An invoice with this number already exists for this supplier." });
      return;
    }
    console.error("Incoming invoice create failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Failed" });
  }
});

router.delete("/incoming/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ success: false, message: "id required" });
    return;
  }
  try {
    const { IncomingInvoiceModel } = await import("../models/incoming-invoice.model");
    const session = await IncomingInvoiceModel.startSession();
    session.startTransaction();
    try {
      const existing = await IncomingInvoiceModel.findOne({ id }).session(session);
      if (!existing) {
        await session.abortTransaction();
        res.status(404).json({ success: false, message: "Not found" });
        return;
      }
      const revision = await getNextRevision(session);
      await IncomingInvoiceModel.deleteOne({ id }).session(session);
      await SyncChangeModel.create(
        [
          {
            revision,
            entity: "incomingInvoice",
            entityId: id,
            operation: "delete",
            payload: undefined,
            changedAt: new Date(),
            sourceClientId: (req.body as any)?.clientId || "incoming-delete",
            operationId: `incoming-delete-${id}-${Date.now()}`,
          },
        ],
        { session },
      );
      await session.commitTransaction();
      res.json({ success: true, revision });
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error("Incoming delete failed:", error);
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Failed" });
  }
});

export default router;
