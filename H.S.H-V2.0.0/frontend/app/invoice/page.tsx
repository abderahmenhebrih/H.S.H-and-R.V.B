"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "../../src/components/layout/AppShell";
import StyledSelect from "../../src/components/common/StyledSelect";
import StyledDatePicker from "../../src/components/common/StyledDatePicker";
import ProtectedDeleteModal from "../../src/components/common/ProtectedDeleteModal";
import CancelInvoiceModal from "../../src/components/common/CancelInvoiceModal";
import { 
  Building2,
  Eye,
  FileText,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Download,
  Ban,
  FilePlus,
  Archive,
  FileCheck,
  Truck,
  X
} from "lucide-react";
import { customerService } from "../../src/services/customer.service";
import { saleService } from "../../src/services/sale.service";
import { productService } from "../../src/services/product.service";
import { supplierService } from "../../src/services/supplier.service";
import { paymentService } from "../../src/services/payment.service";
import { invoiceRepository } from "../../src/repositories/invoice.repository";
import { incomingInvoiceRepository } from "../../src/repositories/incoming-invoice.repository";
import { settingsService } from "../../src/services/settings.service";
import { invoiceService } from "../../src/services/invoice.service";
import { invoiceSellerProfileService } from "../../src/services/invoice-seller-profile.service";
import { invoiceTaxProfileService } from "../../src/services/invoice-tax-profile.service";
import { incomingInvoiceService } from "../../src/services/incoming-invoice.service";
import { DEFAULT_SETTINGS, SETTINGS_EVENT, getDirection, formatCurrency } from "../../src/lib/settings";
import FormalInvoiceDocument from "../../src/components/invoice/FormalInvoiceDocument";
import type { Customer } from "../../src/types/entities/customer";
import type { Sale } from "../../src/types/entities/sale";
import type { Product } from "../../src/types/entities/product";
import type { Supplier } from "../../src/types/entities/supplier";
import type { Invoice } from "../../src/types/entities/invoice";
import type { InvoiceSellerProfile } from "../../src/types/entities/invoice-seller-profile";
import type { InvoiceTaxProfile } from "../../src/types/entities/invoice-tax-profile";
import type { IncomingInvoice } from "../../src/types/entities/incoming-invoice";
import type { Currency, Language } from "../../src/types/settings/settings";
import styles from "./page.module.css";

type Tab = "create" | "issued" | "cancelled" | "incoming" | "drafts";

const TRANSLATIONS = {
  en: {
    title: "Invoices",
    subtitle: "Seller → Customer invoicing",
    createInvoice: "Create Invoice",
    issuedInvoices: "Issued Invoices",
    cancelledInvoices: "Cancelled Invoices",
    incomingInvoices: "Incoming Supplier Invoices",
    invoiceSettings: "Invoice Settings",
    seller: "Seller",
    customer: "Customer",
    sourceSale: "Source Sale",
    invoiceDate: "Invoice Date",
    dueDate: "Due Date",
    paymentMethod: "Payment Method",
    taxProfile: "Tax Profile",
    documentLanguage: "Document Language",
    notes: "Notes",
    previewInvoice: "Preview Invoice",
    issueInvoice: "Issue Invoice",
    saveDraft: "Save Draft",
    sellerProfile: "Seller Profile",
    hebrisSlaughterHouse: "HEBRIH Slaughter House",
    sarlHebrihVolaille: "SARL HEBRIH Volaille",
    invoiceNumber: "Invoice Number",
    subtotal: "Subtotal HT",
    vat: "VAT",
    totalTTC: "Total TTC",
    amountInWords: "Amount in words",
    cancelInvoice: "Cancel Invoice",
    draft: "Draft",
    issued: "Issued",
    cancelled: "Cancelled",
    noInvoiceSelected: "No invoice selected",
    selectSellerCustomerSale: "Select a seller, customer and source sale to preview the invoice.",
    noIssuedInvoices: "No issued invoices",
    noCancelledInvoices: "No cancelled invoices",
    noIncomingInvoices: "No incoming invoices",
    createFirstInvoice: "Create your first invoice to begin.",
    searchInvoices: "Search invoices...",
    sellerProfiles: "Seller Profiles",
    taxProfiles: "Tax Profiles",
    paymentMethods: "Payment Methods",
    numbering: "Numbering",
    documentDefaults: "Document Defaults",
    edit: "Edit",
    view: "View",
    print: "Print",
    exportPdf: "Export PDF",
    cancel: "Cancel",
    delete: "Delete",
    addIncoming: "Add Incoming Invoice",
    supplier: "Supplier",
    supplierInvoiceNumber: "Supplier Invoice No.",
    amountHT: "Amount HT",
    amountTTC: "Amount TTC",
    purchaseReference: "Purchase Reference",
    paymentStatus: "Payment Status",
    selectSeller: "Select seller",
    selectCustomer: "Select customer",
    selectSale: "Select source sale",
    selectSourceSale: "Select source sale",
    selectTaxProfile: "Select tax profile",
    selectSupplier: "Select supplier",
    invoicePreview: "Invoice Preview",
    invoiceSetup: "Invoice Setup",
    status: "Status",
    total: "Total",
    currency: "Currency",
    actions: "Actions",
    noSalesForCustomer: "No sales found for this customer",
    sale: "Sale",
    date: "Date",
    required: "Required",
    optional: "Optional",
    add: "Add",
    save: "Save",
    close: "Close",
    saving: "Saving...",
    drafts: "Drafts",
    draftsDesc: "Unfinished invoices — edit or delete before issuing.",
    noDrafts: "No drafts",
    editDraft: "Edit Draft",
    deleteDraft: "Delete Draft",
    draftSaved: "Draft saved",
    // Canonical user-facing strings (translation-covered)
    selectSellerCustomerSaleError: "Please select seller, customer and source sale",
    completeRequiredFields: "Please complete all required fields",
    completeRequiredFieldsIncoming: "Please complete all required fields for incoming invoice",
    internetRequired: "Internet connection required to issue final invoice.",
    incomingArchiveHint: "Supplier → HEBRIH archive. Record supplier invoice number, date, amounts, purchase reference.",
    permanentAction: "PERMANENT ACTION",
    cancelFailed: "Cancel failed",
    failedDelete: "Failed to delete",
    deleteIncomingTitle: "Delete Incoming Invoice",
    deleteIncomingDesc: "This incoming invoice record will be removed permanently.",
    confirmDelete: "Delete Permanently",
    cancelTitle: "Cancel Invoice",
    cancelDesc: "This action will cancel the issued invoice. The original invoice number is preserved and the cancellation is final.",
    cancelWarning: "Cancellation is irreversible. The invoice will remain stored with status CANCELLED.",
    cancellationReason: "Cancellation reason",
    cancellationReasonPlaceholder: "Enter reason for cancellation",
    cancellationReasonRequired: "Cancellation reason is required",
    confirmCancel: "Confirm Cancellation",
    cancelling: "Cancelling...",
    failedSaveDraft: "Failed to save draft",
    failedIssueInvoice: "Failed to issue invoice",
    failedAddIncoming: "Failed to add incoming invoice",
    invalidAmount: "Invalid amount: HT, TTC must be finite >=0 and TTC >= HT",
    incomingDuplicate: "An invoice with this number already exists for this supplier.",
    confirmAvailableIn: "Confirm available in",
    confirmDeletion: "Confirm deletion",
    taxUnresolved: "Tax profile unresolved — configure product or seller default",
    sellerProfileIncomplete: "Complete the seller invoice profile in Settings",
    customerIdentityIncomplete: "Complete the customer's invoice identity before issuing",
    sourceSaleAlreadyInvoiced: "Source sale already invoiced — refresh to update availability",
    paymentMethodInvalid: "Invalid or disabled payment method",
    supplierNotFound: "Supplier not found",
    supplierInvoiceNumberRequired: "Supplier invoice number is required",
    invoiceDateInvalid: "Invalid invoice date",
    invoiceCurrencyInvalid: "Invalid currency — use DA, € or $",
  },
  fr: {
    title: "Factures",
    subtitle: "Facturation Vendeur → Client",
    createInvoice: "Créer une Facture",
    issuedInvoices: "Factures Émises",
    cancelledInvoices: "Factures Annulées",
    incomingInvoices: "Factures Fournisseurs Entrantes",
    invoiceSettings: "Paramètres de Facturation",
    seller: "Vendeur",
    customer: "Client",
    sourceSale: "Vente Source",
    invoiceDate: "Date de Facture",
    dueDate: "Date d'Échéance",
    paymentMethod: "Mode de Paiement",
    taxProfile: "Profil Fiscal",
    documentLanguage: "Langue du Document",
    notes: "Notes",
    previewInvoice: "Aperçu",
    issueInvoice: "Émettre la Facture",
    saveDraft: "Enregistrer Brouillon",
    sellerProfile: "Profil Vendeur",
    hebrisSlaughterHouse: "HEBRIH Slaughter House",
    sarlHebrihVolaille: "SARL HEBRIH Volaille",
    invoiceNumber: "Numéro de Facture",
    subtotal: "Sous-total HT",
    vat: "TVA",
    totalTTC: "Total TTC",
    amountInWords: "Montant en lettres",
    cancelInvoice: "Annuler la Facture",
    draft: "Brouillon",
    issued: "Émise",
    cancelled: "Annulée",
    noInvoiceSelected: "Aucune facture sélectionnée",
    selectSellerCustomerSale: "Sélectionnez un vendeur, un client et une vente source pour prévisualiser la facture.",
    noIssuedInvoices: "Aucune facture émise",
    noCancelledInvoices: "Aucune facture annulée",
    noIncomingInvoices: "Aucune facture entrante",
    createFirstInvoice: "Créez votre première facture pour commencer.",
    searchInvoices: "Rechercher des factures...",
    sellerProfiles: "Profils Vendeurs",
    taxProfiles: "Profils Fiscaux",
    paymentMethods: "Modes de Paiement",
    numbering: "Numérotation",
    documentDefaults: "Par Défaut du Document",
    edit: "Modifier",
    view: "Voir",
    print: "Imprimer",
    exportPdf: "Exporter PDF",
    cancel: "Annuler",
    delete: "Supprimer",
    addIncoming: "Ajouter Facture Entrante",
    supplier: "Fournisseur",
    supplierInvoiceNumber: "N° Facture Fournisseur",
    amountHT: "Montant HT",
    amountTTC: "Montant TTC",
    purchaseReference: "Réf. Achat",
    paymentStatus: "Statut Paiement",
    selectSeller: "Sélectionner vendeur",
    selectCustomer: "Sélectionner client",
    selectSale: "Sélectionner une vente",
    selectSourceSale: "Sélectionner une vente",
    selectTaxProfile: "Sélectionner profil fiscal",
    selectSupplier: "Sélectionner fournisseur",
    invoicePreview: "Aperçu Facture",
    invoiceSetup: "Configuration Facture",
    status: "Statut",
    total: "Total",
    currency: "Devise",
    actions: "Actions",
    noSalesForCustomer: "Aucune vente trouvée pour ce client",
    sale: "Vente",
    date: "Date",
    required: "Obligatoire",
    optional: "Facultatif",
    add: "Ajouter",
    save: "Enregistrer",
    close: "Fermer",
    saving: "Enregistrement...",
    drafts: "Brouillons",
    draftsDesc: "Factures non terminées — modifiez ou supprimez avant émission.",
    noDrafts: "Aucun brouillon",
    editDraft: "Modifier brouillon",
    deleteDraft: "Supprimer brouillon",
    draftSaved: "Brouillon enregistré",
    selectSellerCustomerSaleError: "Veuillez sélectionner vendeur, client et vente source",
    completeRequiredFields: "Veuillez compléter tous les champs obligatoires",
    completeRequiredFieldsIncoming: "Veuillez compléter tous les champs obligatoires pour la facture entrante",
    internetRequired: "Connexion Internet requise pour émettre une facture finale.",
    incomingArchiveHint: "Fournisseur → archive HEBRIH. Enregistrez le numéro, la date, les montants et la référence d'achat.",
    permanentAction: "ACTION PERMANENTE",
    cancelFailed: "Échec de l'annulation",
    failedDelete: "Échec de la suppression",
    deleteIncomingTitle: "Supprimer la facture entrante",
    deleteIncomingDesc: "Cette facture entrante sera supprimée définitivement.",
    confirmDelete: "Supprimer définitivement",
    cancelTitle: "Annuler la facture",
    cancelDesc: "Cette action annulera la facture émise. Le numéro d'origine est conservé et l'annulation est définitive.",
    cancelWarning: "L'annulation est irréversible. La facture restera stockée avec le statut ANNULÉE.",
    cancellationReason: "Motif d'annulation",
    cancellationReasonPlaceholder: "Saisir le motif d'annulation",
    cancellationReasonRequired: "Le motif d'annulation est requis",
    confirmCancel: "Confirmer l'annulation",
    cancelling: "Annulation...",
    failedSaveDraft: "Échec de l'enregistrement du brouillon",
    failedIssueInvoice: "Échec de l'émission de la facture",
    failedAddIncoming: "Échec de l'ajout de la facture entrante",
    invalidAmount: "Montant invalide : HT, TTC doivent être finis >=0 et TTC >= HT",
    incomingDuplicate: "Une facture portant ce numéro existe déjà pour ce fournisseur.",
    confirmAvailableIn: "Confirmation disponible dans",
    confirmDeletion: "Confirmer la suppression",
    taxUnresolved: "Profil fiscal non résolu — configurez le produit ou le vendeur par défaut",
    sellerProfileIncomplete: "Complétez le profil vendeur dans les Paramètres",
    customerIdentityIncomplete: "Complétez l'identité du client avant d'émettre",
    sourceSaleAlreadyInvoiced: "Vente déjà facturée — actualisez",
    paymentMethodInvalid: "Mode de paiement invalide ou désactivé",
    supplierNotFound: "Fournisseur introuvable",
    supplierInvoiceNumberRequired: "Le numéro de facture fournisseur est requis",
    invoiceDateInvalid: "Date de facture invalide",
    invoiceCurrencyInvalid: "Devise invalide — utilisez DA, € ou $",
  },
  ar: {
    title: "الفواتير",
    subtitle: "الفوترة من البائع إلى الزبون",
    createInvoice: "إنشاء فاتورة",
    issuedInvoices: "الفواتير الصادرة",
    cancelledInvoices: "الفواتير الملغاة",
    incomingInvoices: "فواتير الموردين الواردة",
    invoiceSettings: "إعدادات الفواتير",
    seller: "البائع",
    customer: "الزبون",
    sourceSale: "البيع المصدر",
    invoiceDate: "تاريخ الفاتورة",
    dueDate: "تاريخ الاستحقاق",
    paymentMethod: "طريقة الدفع",
    taxProfile: "الملف الضريبي",
    documentLanguage: "لغة المستند",
    notes: "ملاحظات",
    previewInvoice: "معاينة",
    issueInvoice: "إصدار الفاتورة",
    saveDraft: "حفظ المسودة",
    sellerProfile: "ملف البائع",
    hebrisSlaughterHouse: "مذبح حبريح",
    sarlHebrihVolaille: "شركة حبريح للدواجن",
    invoiceNumber: "رقم الفاتورة",
    subtotal: "المجموع HT",
    vat: "الضريبة",
    totalTTC: "المجموع TTC",
    amountInWords: "المبلغ كتابة",
    cancelInvoice: "إلغاء الفاتورة",
    draft: "مسودة",
    issued: "صادرة",
    cancelled: "ملغاة",
    noInvoiceSelected: "لم يتم اختيار فاتورة",
    selectSellerCustomerSale: "اختر البائع والزبون والبيع المصدر لمعاينة الفاتورة.",
    noIssuedInvoices: "لا توجد فواتير صادرة",
    noCancelledInvoices: "لا توجد فواتير ملغاة",
    noIncomingInvoices: "لا توجد فواتير واردة",
    createFirstInvoice: "أنشئ أول فاتورة للبدء.",
    searchInvoices: "البحث عن الفواتير...",
    sellerProfiles: "ملفات البائع",
    taxProfiles: "الملفات الضريبية",
    paymentMethods: "طرق الدفع",
    numbering: "الترقيم",
    documentDefaults: "إعدادات المستند",
    edit: "تعديل",
    view: "عرض",
    print: "طباعة",
    exportPdf: "تصدير PDF",
    cancel: "إلغاء",
    delete: "حذف",
    addIncoming: "إضافة فاتورة واردة",
    supplier: "المورد",
    supplierInvoiceNumber: "رقم فاتورة المورد",
    amountHT: "المبلغ HT",
    amountTTC: "المبلغ TTC",
    purchaseReference: "مرجع الشراء",
    paymentStatus: "حالة الدفع",
    selectSeller: "اختر البائع",
    selectCustomer: "اختر الزبون",
    selectSale: "اختر عملية بيع",
    selectSourceSale: "اختر عملية بيع",
    selectTaxProfile: "اختر الملف الضريبي",
    selectSupplier: "اختر المورد",
    invoicePreview: "معاينة الفاتورة",
    invoiceSetup: "إعداد الفاتورة",
    status: "الحالة",
    total: "المجموع",
    currency: "العملة",
    actions: "الإجراءات",
    noSalesForCustomer: "لا توجد مبيعات لهذا الزبون",
    sale: "البيع",
    date: "التاريخ",
    required: "مطلوب",
    optional: "اختياري",
    add: "إضافة",
    save: "حفظ",
    close: "إغلاق",
    saving: "جارٍ الحفظ...",
    drafts: "المسودات",
    draftsDesc: "فواتير غير مكتملة — عدّل أو احذف قبل الإصدار.",
    noDrafts: "لا توجد مسودات",
    editDraft: "تعديل المسودة",
    deleteDraft: "حذف المسودة",
    draftSaved: "تم حفظ المسودة",
    selectSellerCustomerSaleError: "يرجى اختيار البائع والزبون والبيع المصدر",
    completeRequiredFields: "يرجى إكمال جميع الحقول المطلوبة",
    completeRequiredFieldsIncoming: "يرجى إكمال جميع الحقول المطلوبة للفاتورة الواردة",
    internetRequired: "يتطلب الاتصال بالإنترنت لإصدار فاتورة نهائية.",
    incomingArchiveHint: "المورد → أرشيف حبريح. سجّل رقم الفاتورة والتاريخ والمبالغ ومرجع الشراء.",
    permanentAction: "إجراء دائم",
    cancelFailed: "فشل الإلغاء",
    failedDelete: "فشل الحذف",
    deleteIncomingTitle: "حذف الفاتورة الواردة",
    deleteIncomingDesc: "سيتم حذف هذه الفاتورة الواردة نهائيًا.",
    confirmDelete: "حذف نهائي",
    cancelTitle: "إلغاء الفاتورة",
    cancelDesc: "سيتم إلغاء الفاتورة الصادرة. يتم الحفاظ على رقم الفاتورة الأصلي والإلغاء نهائي.",
    cancelWarning: "الإلغاء لا رجعة فيه. ستبقى الفاتورة مخزنة بحالة ملغاة.",
    cancellationReason: "سبب الإلغاء",
    cancellationReasonPlaceholder: "أدخل سبب الإلغاء",
    cancellationReasonRequired: "سبب الإلغاء مطلوب",
    confirmCancel: "تأكيد الإلغاء",
    cancelling: "جارٍ الإلغاء...",
    failedSaveDraft: "فشل حفظ المسودة",
    failedIssueInvoice: "فشل إصدار الفاتورة",
    failedAddIncoming: "فشل إضافة الفاتورة الواردة",
    invalidAmount: "مبلغ غير صالح: يجب أن يكون HT و TTC منتهيين >=0 و TTC >= HT",
    incomingDuplicate: "توجد بالفعل فاتورة بهذا الرقم لهذا المورد.",
    confirmAvailableIn: "التأكيد متاح بعد",
    confirmDeletion: "تأكيد الحذف",
    taxUnresolved: "الملف الضريبي غير محلول — اضبط المنتج أو البائع الافتراضي",
    sellerProfileIncomplete: "أكمل ملف البائع في الإعدادات",
    customerIdentityIncomplete: "أكمل هوية الزبون قبل الإصدار",
    sourceSaleAlreadyInvoiced: "البيع مفوتر مسبقاً — حدّث",
    paymentMethodInvalid: "طريقة الدفع غير صالحة أو معطلة",
    supplierNotFound: "المورد غير موجود",
    supplierInvoiceNumberRequired: "رقم فاتورة المورد مطلوب",
    invoiceDateInvalid: "تاريخ الفاتورة غير صالح",
    invoiceCurrencyInvalid: "العملة غير صالحة — استخدم DA أو € أو $",
  },
} as const;

export default function InvoicePage() {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>(DEFAULT_SETTINGS.language);
  const [currency, setCurrency] = useState<Currency>(DEFAULT_SETTINGS.currency);
  const [activeTab, setActiveTab] = useState<Tab>("create");
  
  // Data states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [sellerProfiles, setSellerProfiles] = useState<InvoiceSellerProfile[]>([]);
  const [taxProfiles, setTaxProfiles] = useState<InvoiceTaxProfile[]>([]);
  const [incomingInvoices, setIncomingInvoices] = useState<IncomingInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  
  // Form states
  const [selectedSellerId, setSelectedSellerId] = useState<string>("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedSaleId, setSelectedSaleId] = useState<string>("");
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [selectedTaxProfileId, setSelectedTaxProfileId] = useState<string>("");
  const [documentLanguage, setDocumentLanguage] = useState<Language>(DEFAULT_SETTINGS.language);
  const [notes, setNotes] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  
  // UI states
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showIncomingForm, setShowIncomingForm] = useState(false);
  const [incomingForm, setIncomingForm] = useState({ supplierId: "", supplierInvoiceNumber: "", invoiceDate: new Date().toISOString().slice(0, 10), amountHT: "", amountTTC: "", currencyCode: currency, notes: "" });
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | IncomingInvoice | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null);
  const [incomingDeleteTarget, setIncomingDeleteTarget] = useState<IncomingInvoice | null>(null);
  const [incomingDeleting, setIncomingDeleting] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [draftDeleteTarget, setDraftDeleteTarget] = useState<Invoice | null>(null);
  const [draftDeleting, setDraftDeleting] = useState(false);
  const [paymentMethodsConfig, setPaymentMethodsConfig] = useState<any[]>([]);
  const [docDefaults, setDocDefaults] = useState<any>(null);

  const t = TRANSLATIONS[language];
  const dir = getDirection(language);

  useEffect(() => {
    async function loadSettings() {
      const s: any = await settingsService.get();
      setLanguage(s?.language ?? DEFAULT_SETTINGS.language);
      setCurrency(s?.currency ?? DEFAULT_SETTINGS.currency);
      // Document defaults wiring
      const defaults = s?.invoiceDocumentDefaults ?? null;
      setDocDefaults(defaults);
      setDocumentLanguage(defaults?.defaultInvoiceLanguage ?? s?.language ?? DEFAULT_SETTINGS.language);
      // Payment methods wiring with migration from duplicate storage
      let pm = s?.invoicePaymentMethods;
      if (!pm || !Array.isArray(pm) || pm.length===0) {
        try {
          const legacy = localStorage.getItem("hebrih_payment_methods");
          if (legacy) {
            pm = JSON.parse(legacy);
            // Migrate once into canonical settings
            const next = { ...s, invoicePaymentMethods: pm, invoiceDocumentDefaults: defaults };
            await settingsService.save(next);
            localStorage.removeItem("hebrih_payment_methods");
            localStorage.removeItem("hebrih_document_defaults");
          }
        } catch {}
      }
      if (Array.isArray(pm) && pm.length>0) {
        setPaymentMethodsConfig(pm.filter((p:any)=> p.enabled));
      } else {
        // Default built-ins if not configured
        setPaymentMethodsConfig([
          { id: "cash", label: language==="fr"?"Espèces": language==="ar"?"نقداً":"Cash", enabled: true },
          { id: "bank_transfer", label: language==="fr"?"Virement bancaire": language==="ar"?"تحويل بنكي":"Bank transfer", enabled: true },
          { id: "cheque", label: language==="fr"?"Chèque": language==="ar"?"شيك":"Cheque", enabled: true },
          { id: "other", label: language==="fr"?"Autre": language==="ar"?"أخرى":"Other", enabled: true },
        ]);
      }
      // Migration for seller defaultPaymentTerms -> defaultPaymentMethodId already handled in backend, but also handle localStorage cleanup
      try {
        if (localStorage.getItem("hebrih_document_defaults")) localStorage.removeItem("hebrih_document_defaults");
      } catch {}
    }
    void loadSettings();
    const h = () => void loadSettings();
    window.addEventListener(SETTINGS_EVENT, h);
    return () => window.removeEventListener(SETTINGS_EVENT, h);
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        const [cust, saleList, prodList, invList, sellerList, taxList, incomingList, suppList] = await Promise.all([
          customerService.getAll(),
          saleService.getAll(),
          productService.getAll(),
          invoiceService.getAll().catch(() => []),
          invoiceSellerProfileService.getAll().catch(() => []),
          invoiceTaxProfileService.getAll().catch(() => []),
          incomingInvoiceService.getAll().catch(() => []),
          supplierService.getAll().catch(() => []),
        ]);
        setCustomers(cust);
        setSales(saleList);
        setProducts(prodList);
        setInvoices(invList as any);
        setSellerProfiles(sellerList as any);
        setTaxProfiles(taxList as any);
        setIncomingInvoices(incomingList as any);
        setSuppliers(suppList as any);
        
        // Auto-create default seller profiles if missing (idempotent, handle missing table gracefully)
        if (Array.isArray(sellerList) && sellerList.length === 0) {
          const now = Date.now();
          const defaultSellers: InvoiceSellerProfile[] = [
            {
              id: "seller-hsh",
              commercialName: "HEBRIH Slaughter House",
              legalDenomination: "",
              invoicePrefix: "HSH",
              nextNumber: 1,
              paddingLength: 6,
              yearResetPolicy: "never",
              enabled: true,
              createdAt: now,
              updatedAt: now,
              syncStatus: "pending",
            } as InvoiceSellerProfile,
            {
              id: "seller-hv",
              commercialName: "SARL HEBRIH Volaille",
              legalDenomination: "SARL HEBRIH Volaille",
              invoicePrefix: "HV",
              nextNumber: 1,
              paddingLength: 6,
              yearResetPolicy: "never",
              enabled: true,
              createdAt: now,
              updatedAt: now,
              syncStatus: "pending",
            } as InvoiceSellerProfile,
          ];
          for (const seller of defaultSellers) {
            try {
              await invoiceSellerProfileService.create(seller);
            } catch (e: any) {
              if (e?.name === "NotFoundError") {
                console.warn("Seller profile table not found, will rely on DB upgrade");
                break;
              }
              throw e;
            }
          }
          setSellerProfiles(defaultSellers);
        } else if (Array.isArray(sellerList) && sellerList.length > 0 && !selectedSellerId) {
          setSelectedSellerId(sellerList[0].id);
        }
        
        // Auto-create default tax profiles if missing
        if (Array.isArray(taxList) && taxList.length === 0) {
          const now = Date.now();
          const defaultTaxes: InvoiceTaxProfile[] = [
            { id: "tax-19", name: "TVA 19%", code: "TVA19", vatRate: 19, enabled: true, createdAt: now, updatedAt: now, syncStatus: "pending" } as InvoiceTaxProfile,
            { id: "tax-17", name: "TVA 17%", code: "TVA17", vatRate: 17, enabled: true, createdAt: now, updatedAt: now, syncStatus: "pending" } as InvoiceTaxProfile,
            { id: "tax-9", name: "TVA 9%", code: "TVA9", vatRate: 9, enabled: true, createdAt: now, updatedAt: now, syncStatus: "pending" } as InvoiceTaxProfile,
            { id: "tax-0", name: "Exonéré", code: "EXO", vatRate: 0, enabled: true, createdAt: now, updatedAt: now, syncStatus: "pending" } as InvoiceTaxProfile,
            { id: "tax-outside", name: "Hors TVA", code: "HORS", vatRate: 0, enabled: true, createdAt: now, updatedAt: now, syncStatus: "pending" } as InvoiceTaxProfile,
          ];
          for (const tax of defaultTaxes) {
            try {
              await invoiceTaxProfileService.create(tax);
            } catch (e: any) {
              if (e?.name === "NotFoundError") {
                console.warn("Tax profile table not found, will rely on DB upgrade");
                break;
              }
              throw e;
            }
          }
          setTaxProfiles(defaultTaxes);
        } else if (Array.isArray(taxList) && taxList.length > 0) {
          const hasTva17 = taxList.some(t => t.id === "tax-17" || t.code === "TVA17");
          if (!hasTva17) {
            const now = Date.now();
            const tva17: InvoiceTaxProfile = { id: "tax-17", name: "TVA 17%", code: "TVA17", vatRate: 17, enabled: true, createdAt: now, updatedAt: now, syncStatus: "pending" } as InvoiceTaxProfile;
            try {
              await invoiceTaxProfileService.create(tva17);
              setTaxProfiles(prev => [...prev.filter(p => p.id !== "tax-17"), tva17].sort((a, b) => {
                const order: Record<string, number> = { "TVA19": 0, "TVA17": 1, "TVA9": 2, "EXO": 3, "HORS": 4 };
                return (order[a.code] ?? 99) - (order[b.code] ?? 99);
              }));
            } catch (e: any) {
              if (e?.name !== "NotFoundError") console.warn("Failed to create TVA 17%", e);
            }
          }
        }
      } catch (e: any) {
        console.error("Failed to load invoice data", e);
      }
    }
    void loadData();
  }, []);

  // Default payment method semantics: when seller changes, prefer seller.defaultPaymentMethodId if enabled, else first enabled
  useEffect(() => {
    if (!selectedSellerId) return;
    const seller: any = sellerProfiles.find(s => s.id === selectedSellerId);
    if (!seller) return;
    if (!paymentMethodsConfig || paymentMethodsConfig.length === 0) return;
    const enabledIds = new Set(paymentMethodsConfig.filter((p:any)=>p.enabled).map((p:any)=>p.id));
    const sellerDefault = seller.defaultPaymentMethodId || (seller as any).defaultPaymentTerms;
    // Only auto-select if current paymentMethod is not already an enabled value or if seller default changed
    if (sellerDefault && enabledIds.has(sellerDefault)) {
      if (paymentMethod !== sellerDefault) setPaymentMethod(sellerDefault);
    } else {
      const firstEnabled = paymentMethodsConfig.find((p:any)=>p.enabled);
      if (firstEnabled && !enabledIds.has(paymentMethod)) {
        setPaymentMethod(firstEnabled.id);
      }
    }
  }, [selectedSellerId, sellerProfiles, paymentMethodsConfig]);

  const filteredSales = useMemo(() => {
    if (!selectedCustomerId) return [];
    const invoicedSaleIds = new Set(invoices.filter(i=> i.status==="ISSUED" && Array.isArray(i.sourceSaleIds)).flatMap(i=> i.sourceSaleIds));
    return sales.filter(s => s.customerId === selectedCustomerId && !invoicedSaleIds.has(s.id));
  }, [sales, selectedCustomerId, invoices]);

  const selectedSale = useMemo(() => {
    return sales.find(s => s.id === selectedSaleId);
  }, [sales, selectedSaleId]);

  const selectedSeller = useMemo(() => {
    return sellerProfiles.find(s => s.id === selectedSellerId);
  }, [sellerProfiles, selectedSellerId]);

  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === selectedCustomerId);
  }, [customers, selectedCustomerId]);

  const issuedInvoices = useMemo(() => invoices.filter(i => i.status === "ISSUED"), [invoices]);
  const cancelledInvoices = useMemo(() => invoices.filter(i => i.status === "CANCELLED"), [invoices]);
  const draftInvoices = useMemo(() => invoices.filter(i => i.status === "DRAFT"), [invoices]);

  const canPreview = selectedSellerId && selectedCustomerId && selectedSaleId;
  const canIssue = canPreview && selectedSale && selectedSeller && selectedCustomer;

  async function handleSaveDraft() {
    if (!canPreview || !selectedSale) {
      setError(t.selectSellerCustomerSaleError);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const now = Date.now();
      const sale = selectedSale!;
      const seller = selectedSeller!;
      const customer = selectedCustomer!;
      
      // Create snapshot with tax resolution hierarchy: 1) explicit selected, 2) product.taxProfileId, 3) seller.defaultTaxProfileId, 4) UNRESOLVED (block)
      const lines: any[] = [];
      for (const item of sale.items) {
        const product: any = products.find(p => p.id === item.productId) as any;
        let taxProfile: any = null;
        if (selectedTaxProfileId) taxProfile = taxProfiles.find(tp => tp.id === selectedTaxProfileId && (tp as any).enabled === true) || null;
        if (!taxProfile && product?.taxProfileId) taxProfile = taxProfiles.find(tp => tp.id === product.taxProfileId && (tp as any).enabled === true) || null;
        if (!taxProfile && seller.defaultTaxProfileId) taxProfile = taxProfiles.find(tp => tp.id === (seller as any).defaultTaxProfileId && (tp as any).enabled === true) || null;
        if (!taxProfile) {
          setError(t.taxUnresolved);
          setSaving(false);
          return;
        }
        const vatRate = Number(taxProfile.vatRate);
        const otherTaxRate = Number(taxProfile.otherTaxRate || 0);
        const totalHT = Math.round(item.weightKg * item.price * 100)/100;
        const taxAmount = Math.round(totalHT * (vatRate/100) * 100)/100;
        const otherTaxAmount = Math.round(totalHT * (otherTaxRate/100) * 100)/100;
        const totalTTC = Math.round((totalHT + taxAmount + otherTaxAmount)*100)/100;
        lines.push({
          productId: item.productId,
          description: product?.name ?? item.productId,
          quantity: item.quantity,
          weightKg: item.weightKg,
          unit: "kg",
          unitPriceHT: item.price,
          discountType: "none" as const,
          discountValue: 0,
          discountAmount: 0,
          totalHT,
          taxProfileId: taxProfile.id,
          taxCode: taxProfile.code,
          taxLabel: taxProfile.name,
          taxRate: vatRate,
          taxAmount,
          otherTaxRate: otherTaxRate || undefined,
          otherTaxLabel: taxProfile.otherTaxLabel,
          otherTaxAmount: otherTaxAmount || undefined,
          totalTTC,
        });
      }
      
      const subtotalHT = Math.round(lines.reduce((sum, l) => sum + l.totalHT, 0)*100)/100;
      const taxTotal = Math.round(lines.reduce((sum, l) => sum + l.taxAmount, 0)*100)/100;
      const otherTaxTotal = Math.round(lines.reduce((sum, l) => sum + (l.otherTaxAmount||0), 0)*100)/100;
      const totalTTC = Math.round(lines.reduce((sum, l) => sum + l.totalTTC, 0)*100)/100;
      
      // Determine id and timestamps: reuse editingDraftId if editing
      const isEdit = !!editingDraftId;
      const invoiceId = editingDraftId || `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      let createdAtVal = now;
      if (isEdit) {
        try {
          const existing = await invoiceRepository.getById(editingDraftId!);
          if (existing) createdAtVal = (existing as any).createdAt || now;
        } catch {}
      }
      const invoice: Invoice = {
        id: invoiceId,
        status: "DRAFT",
        sellerProfileId: seller.id,
        sellerSnapshot: {
          commercialName: seller.commercialName,
          legalDenomination: seller.legalDenomination,
          legalForm: seller.legalForm,
          activity: seller.activity,
          address: seller.address,
          city: seller.city,
          wilaya: seller.wilaya,
          phone: seller.phone,
          email: seller.email,
          fax: seller.fax,
          rc: seller.rc,
          nif: seller.nif,
          nis: seller.nis,
          capital: seller.capital,
          bankName: seller.bankName,
          bankAccount: seller.bankAccount,
          rib: seller.rib,
          logo: seller.logo,
          stampImage: seller.stampImage,
        },
        customerSnapshot: {
          name: customer.name,
          legalName: customer.legalName || customer.name,
          commercialName: customer.commercialName,
          legalForm: customer.legalForm,
          activity: customer.activity,
          address: customer.billingAddress || customer.address,
          phone: customer.phone,
          email: customer.email,
          rc: customer.rc,
          nif: customer.nif,
          nis: customer.nis,
        },
        customerId: customer.id,
        sourceSaleIds: [sale.id],
        invoiceDate: new Date(invoiceDate).getTime(),
        dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
        paymentMethod,
        paymentMethodId: paymentMethod,
        paymentMethodLabel: (paymentMethodsConfig.find((p:any)=>p.id===paymentMethod)?.label || paymentMethod),
        documentDefaultsSnapshot: docDefaults ? { showBankDetails: !!docDefaults.showBankDetails, showRC: !!docDefaults.showRC, showNIF: !!docDefaults.showNIF, showNIS: !!docDefaults.showNIS, showCapital: !!docDefaults.showCapital, showStamp: !!docDefaults.showStamp } : undefined,
        lines,
        subtotalHT,
        discountTotal: 0,
        additionalCharges: [],
        additionalChargesTotal: 0,
        taxableBase: subtotalHT,
        taxTotal,
        otherTaxTotal,
        totalTTC,
        currencyCode: (() => { const v = seller.defaultCurrency || docDefaults?.defaultCurrency || currency || "DA"; return ["DA","€","$"].includes(v) ? v : "DA"; })(),
        documentLanguage,
        notes: notes || undefined,
        createdAt: createdAtVal,
        updatedAt: now,
        syncStatus: "pending",
      };
      
      if (isEdit) {
        await invoiceRepository.update(invoiceId, invoice as any);
        setInvoices(prev => prev.map(p => (p.id === invoiceId ? (invoice as any) : p)));
      } else {
        await invoiceService.create(invoice);
        setInvoices(prev => [...prev, invoice]);
      }
      setEditingDraftId(null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failedSaveDraft);
    } finally {
      setSaving(false);
    }
  }

  async function handleIssueInvoice() {
    if (!canIssue || !selectedSale || !selectedSeller || !selectedCustomer) {
      setError(t.completeRequiredFields);
      return;
    }
    if (!navigator.onLine) {
      setError(t.internetRequired);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const sale = selectedSale!;
      const seller = selectedSeller!;
      const customer = selectedCustomer!;
      // Tax hierarchy for Issue — block if unresolved
      const lines: any[] = [];
      for (const item of sale.items) {
        const product: any = products.find(p => p.id === item.productId) as any;
        let taxProfile: any = null;
        if (selectedTaxProfileId) taxProfile = taxProfiles.find(tp => tp.id === selectedTaxProfileId && (tp as any).enabled === true) || null;
        if (!taxProfile && product?.taxProfileId) taxProfile = taxProfiles.find(tp => tp.id === product.taxProfileId && (tp as any).enabled === true) || null;
        if (!taxProfile && (seller as any).defaultTaxProfileId) taxProfile = taxProfiles.find(tp => tp.id === (seller as any).defaultTaxProfileId && (tp as any).enabled === true) || null;
        if (!taxProfile) {
          setError(t.taxUnresolved);
          setSaving(false);
          return;
        }
        const vatRate = Number(taxProfile.vatRate);
        const otherTaxRate = Number(taxProfile.otherTaxRate || 0);
        const totalHT = Math.round(item.weightKg * item.price * 100)/100;
        const taxAmount = Math.round(totalHT * (vatRate/100) * 100)/100;
        const otherTaxAmount = Math.round(totalHT * (otherTaxRate/100) * 100)/100;
        lines.push({
          productId: item.productId,
          description: product?.name ?? item.productId,
          quantity: item.quantity,
          weightKg: item.weightKg,
          unit: "kg",
          unitPriceHT: item.price,
          discountType: "none" as const,
          discountValue: 0,
          discountAmount: 0,
          totalHT,
          taxProfileId: taxProfile.id,
          taxCode: taxProfile.code,
          taxLabel: taxProfile.name,
          taxRate: vatRate,
          taxAmount,
          otherTaxRate: otherTaxRate || undefined,
          otherTaxLabel: taxProfile.otherTaxLabel,
          otherTaxAmount: otherTaxAmount || undefined,
          totalTTC: Math.round((totalHT + taxAmount + otherTaxAmount)*100)/100,
        });
      }
      const subtotalHT = Math.round(lines.reduce((s, l) => s + l.totalHT, 0)*100)/100;
      const taxTotal = Math.round(lines.reduce((s, l) => s + l.taxAmount, 0)*100)/100;
      const otherTaxTotal = Math.round(lines.reduce((s, l) => s + (l.otherTaxAmount||0), 0)*100)/100;
      const totalTTC = Math.round(lines.reduce((s, l) => s + l.totalTTC, 0)*100)/100;
      // Find applicable local DRAFT for same seller + source sale to atomically replace on server
      let draftIdToSend: string | undefined;
      try {
        const allInvs: Invoice[] = await invoiceService.getAll().catch(()=>[] as any);
        const draft = allInvs.find((inv:any)=> inv.status==="DRAFT" && inv.sellerProfileId===seller.id && Array.isArray(inv.sourceSaleIds) && inv.sourceSaleIds.includes(sale.id));
        if (draft) draftIdToSend = draft.id;
      } catch {}
      const baseUrl = (process.env.NEXT_PUBLIC_API_URL as string) || "http://localhost:5000";
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/invoices/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(draftIdToSend ? { draftId: draftIdToSend } : {}),
          sellerProfileId: seller.id,
          customerId: customer.id,
          sourceSaleIds: [sale.id],
          invoiceDate: new Date(invoiceDate).getTime(),
          dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
          paymentMethod,
          paymentMethodId: paymentMethod,
          paymentMethodLabel: (paymentMethodsConfig.find((p:any)=>p.id===paymentMethod)?.label || paymentMethod),
          documentLanguage,
          currencyCode: (() => { const v = seller.defaultCurrency || docDefaults?.defaultCurrency || currency || "DA"; return ["DA","€","$"].includes(v) ? v : "DA"; })(),
          notes: notes || undefined,
          lines,
          subtotalHT,
          taxTotal,
          otherTaxTotal,
          totalTTC,
          taxableBase: subtotalHT,
          documentDefaultsSnapshot: docDefaults ? { showBankDetails: !!docDefaults.showBankDetails, showRC: !!docDefaults.showRC, showNIF: !!docDefaults.showNIF, showNIS: !!docDefaults.showNIS, showCapital: !!docDefaults.showCapital, showStamp: !!docDefaults.showStamp } : undefined,
          sellerSnapshot: {
            commercialName: seller.commercialName,
            legalDenomination: seller.legalDenomination,
            legalForm: seller.legalForm,
            activity: seller.activity,
            address: seller.address,
            city: seller.city,
            wilaya: seller.wilaya,
            phone: seller.phone,
            email: seller.email,
            fax: seller.fax,
            rc: seller.rc,
            nif: seller.nif,
            nis: seller.nis,
            capital: seller.capital,
            bankName: seller.bankName,
            bankAccount: seller.bankAccount,
            rib: seller.rib,
          },
          customerSnapshot: {
            name: customer.name,
            legalName: (customer as any).legalName || customer.name,
            commercialName: (customer as any).commercialName,
            legalForm: (customer as any).legalForm,
            activity: (customer as any).activity,
            address: (customer as any).billingAddress || (customer as any).address,
            phone: customer.phone,
            email: customer.email,
            rc: customer.rc,
            nif: customer.nif,
            nis: customer.nis,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const code = (data as any)?.code;
        if (code === "PAYMENT_METHOD_INVALID") throw new Error((t as any).paymentMethodInvalid || "Invalid or disabled payment method");
        if (code === "INVOICE_CURRENCY_INVALID") throw new Error((t as any).invoiceCurrencyInvalid || "Invalid currency");
        throw new Error(data.message || t.failedIssueInvoice);
      }
      const issued = data.invoice;
      const { finalizeIssuedInvoiceLocal } = await import("../../src/services/invoice-finalize.service");
      try {
        await finalizeIssuedInvoiceLocal(issued, data.revision, sale.id, draftIdToSend);
      } catch (err) {
        // Critical local finalization failed after server Issue — show recoverable sync error, trigger reconciliation
        setError(language==="fr"?"Erreur de synchronisation locale — actualisez": language==="ar"?"خطأ في المزامنة المحلية — حدّث":"Local sync error — please refresh");
        try { const { triggerSync } = await import("../../src/services/sync/manager"); triggerSync(); } catch {}
        throw err;
      }
      const refreshed = await invoiceService.getAll();
      setInvoices(refreshed as any);
      setActiveTab("issued");
      setEditingDraftId(null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failedIssueInvoice);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddIncoming() {
    if (!incomingForm.supplierId || !incomingForm.supplierInvoiceNumber || !incomingForm.invoiceDate || !incomingForm.amountHT || !incomingForm.amountTTC) {
      setError(t.completeRequiredFieldsIncoming);
      return;
    }
    // supplier existence check (frontend mirrors backend)
    if (!suppliers.some((s:any)=> s.id === incomingForm.supplierId)) {
      setError((t as any).supplierNotFound || "Supplier not found");
      return;
    }
    const trimmedSupplierNumber = String(incomingForm.supplierInvoiceNumber).trim();
    if (!trimmedSupplierNumber) {
      setError((t as any).supplierInvoiceNumberRequired || "Supplier invoice number is required");
      return;
    }
    const invoiceDateMs = new Date(incomingForm.invoiceDate).getTime();
    if (!Number.isFinite(invoiceDateMs)) {
      setError((t as any).invoiceDateInvalid || "Invalid invoice date");
      return;
    }
    const allowedCurrencies = ["DA","€","$"] as const;
    const rawCur = String(incomingForm.currencyCode || "").trim();
    if (rawCur && !(allowedCurrencies as readonly string[]).includes(rawCur)) {
      setError((t as any).invoiceCurrencyInvalid || "Invalid currency — use DA, € or $");
      return;
    }
    const ht = Number(incomingForm.amountHT);
    const ttc = Number(incomingForm.amountTTC);
    if (!Number.isFinite(ht) || !Number.isFinite(ttc) || ht < 0 || ttc < 0 || ttc < ht) {
      setError(t.invalidAmount);
      return;
    }
    const resolvedCurrency = rawCur || (docDefaults?.defaultCurrency && (allowedCurrencies as readonly string[]).includes(docDefaults.defaultCurrency) ? docDefaults.defaultCurrency : null) || ((allowedCurrencies as readonly string[]).includes(currency) ? currency : "DA");
    const finalCurrency = (allowedCurrencies as readonly string[]).includes(resolvedCurrency) ? resolvedCurrency : "DA";
    setSaving(true);
    setError("");
    try {
      const baseUrl = (process.env.NEXT_PUBLIC_API_URL as string) || "http://localhost:5000";
      const taxAmount = ttc - ht;
      let serverResponded = false;
      let serverData: any = null;
      let serverOk = false;
      let serverStatus = 0;
      try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/invoices/incoming`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplierId: incomingForm.supplierId,
            supplierInvoiceNumber: trimmedSupplierNumber,
            invoiceDate: invoiceDateMs,
            amountHT: ht,
            taxAmount,
            amountTTC: ttc,
            currencyCode: finalCurrency,
            notes: incomingForm.notes || undefined,
          }),
        });
        serverResponded = true;
        serverStatus = res.status;
        serverData = await res.json().catch(()=>({}));
        serverOk = res.ok && !!serverData.success && !!serverData.invoice;
        if (serverOk) {
          try {
            await incomingInvoiceRepository.create(serverData.invoice as any, { source: "remote" as any, serverRevision: serverData.revision });
          } catch {
            await incomingInvoiceService.create(serverData.invoice as any).catch(()=>{});
          }
          const list = await incomingInvoiceService.getAll();
          setIncomingInvoices(list as any);
          setShowIncomingForm(false);
          setIncomingForm({ supplierId: "", supplierInvoiceNumber: "", invoiceDate: new Date().toISOString().slice(0,10), amountHT: "", amountTTC: "", currencyCode: finalCurrency, notes: "" });
          return;
        }
      } catch (e) {
        // network failure: fetch threw — offline fallback is allowed
        // leave serverResponded false so we can fallback
      }

      if (serverResponded) {
        // Server responded with error (400/409/422/500) — DO NOT fallback locally
        // Map stable error codes to translations
        const code = serverData?.code;
        const msg = serverData?.message || "";
        if (code === "INCOMING_INVOICE_DUPLICATE" || serverStatus === 409) {
          setError(t.incomingDuplicate);
        } else if (code === "INCOMING_AMOUNT_INVALID" || msg.includes("Amount")) {
          setError(t.invalidAmount);
        } else if (code === "SUPPLIER_NOT_FOUND" || code === "SUPPLIER_NOT_FOUND" ) {
          setError((t as any).supplierNotFound || t.failedAddIncoming);
        } else if (code === "SUPPLIER_INVOICE_NUMBER_REQUIRED") {
          setError((t as any).supplierInvoiceNumberRequired || t.failedAddIncoming);
        } else if (code === "INVOICE_DATE_INVALID") {
          setError((t as any).invoiceDateInvalid || t.failedAddIncoming);
        } else if (code === "INVOICE_CURRENCY_INVALID") {
          setError((t as any).invoiceCurrencyInvalid || t.failedAddIncoming);
        } else {
          // Show translated generic or server message if safe
          setError(serverData?.message ? `${t.failedAddIncoming}: ${serverData.message}` : t.failedAddIncoming);
        }
        return;
      }

      // Network failure — offline fallback allowed with same validation already passed
      const now = Date.now();
      const inv: any = {
        id: `inc-${now}-${Math.random().toString(36).slice(2,6)}`,
        supplierId: incomingForm.supplierId,
        supplierInvoiceNumber: trimmedSupplierNumber,
        invoiceDate: invoiceDateMs,
        amountHT: ht,
        taxAmount,
        amountTTC: ttc,
        currencyCode: finalCurrency,
        notes: incomingForm.notes || undefined,
        createdAt: now,
        updatedAt: now,
        syncStatus: "pending",
      };
      await incomingInvoiceService.create(inv);
      const list2 = await incomingInvoiceService.getAll();
      setIncomingInvoices(list2 as any);
      setShowIncomingForm(false);
      setIncomingForm({ supplierId: "", supplierInvoiceNumber: "", invoiceDate: new Date().toISOString().slice(0,10), amountHT: "", amountTTC: "", currencyCode: finalCurrency, notes: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failedAddIncoming);
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelInvoiceConfirmed(reason: string) {
    const inv = cancelTarget;
    if (!inv) return;
    try {
      const baseUrl = (process.env.NEXT_PUBLIC_API_URL as string) || "http://localhost:5000";
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/invoices/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId: inv.id, reason }) });
      const data = await res.json().catch(()=>({}));
      if (!res.ok || !data.success) throw new Error(data.message || t.cancelFailed);
      // Apply canonical invoice LOCALLY AS REMOTE — zero newly queued sync operation
      const canonical: any = data.invoice;
      await invoiceRepository.update(canonical.id, { ...canonical, syncStatus: "synced", lastSyncedAt: Date.now(), serverRevision: data.revision } as any, { source: "remote" as any, serverRevision: data.revision });
      // Also ensure full canonical is persisted if update didn't create
      try {
        const existing = await invoiceRepository.getById(canonical.id);
        if (!existing) await invoiceRepository.create({ ...canonical, syncStatus: "synced", lastSyncedAt: Date.now(), serverRevision: data.revision } as any, { source: "remote" as any, serverRevision: data.revision });
      } catch {}
      const refreshed = await invoiceService.getAll();
      setInvoices(refreshed as any);
      setCancelTarget(null);
      setError("");
    } catch (e) {
      throw e instanceof Error ? e : new Error(t.cancelFailed);
    }
  }

  async function handleDeleteIncomingConfirmed() {
    const target = incomingDeleteTarget;
    if (!target) return;
    setIncomingDeleting(true);
    try {
      const id = target.id;
      // Online path: backend DELETE then apply locally as remote (no duplicate queue)
      if (navigator.onLine) {
        try {
          const baseUrl = (process.env.NEXT_PUBLIC_API_URL as string) || "http://localhost:5000";
          const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/invoices/incoming/${id}`, { method: "DELETE" });
          if (res.ok) {
            try { await incomingInvoiceRepository.delete(id, { source: "remote" as any } as any); } catch {}
            const list = await incomingInvoiceService.getAll();
            setIncomingInvoices(list as any);
            setIncomingDeleteTarget(null);
            return;
          }
          throw new Error("backend failed");
        } catch {
          // Fall through to offline queue if backend unavailable — intentional separate offline path
        }
      }
      // Offline path: queue local delete
      await incomingInvoiceService.delete(id).catch(async () => {
        try { const { incomingInvoiceRepository } = await import("../../src/repositories/incoming-invoice.repository"); await incomingInvoiceRepository.delete(id); } catch {}
      });
      const list = await incomingInvoiceService.getAll();
      setIncomingInvoices(list as any);
      setIncomingDeleteTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failedDelete);
    } finally {
      setIncomingDeleting(false);
    }
  }

  async function handleDraftDeleteConfirmed() {
    const target = draftDeleteTarget;
    if (!target) return;
    setDraftDeleting(true);
    try {
      await invoiceRepository.delete(target.id);
      const refreshed = await invoiceService.getAll();
      setInvoices(refreshed as any);
      if (editingDraftId === target.id) setEditingDraftId(null);
      setDraftDeleteTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failedDelete);
      setDraftDeleteTarget(null);
    } finally {
      setDraftDeleting(false);
    }
  }

  const filteredIssued = useMemo(() => {
    const q = search.toLowerCase();
    return issuedInvoices.filter(inv => 
      !q || inv.invoiceNumber?.toLowerCase().includes(q) || inv.customerSnapshot.name.toLowerCase().includes(q)
    );
  }, [issuedInvoices, search]);

  const filteredCancelled = useMemo(() => {
    const q = search.toLowerCase();
    return cancelledInvoices.filter(inv => 
      !q || inv.invoiceNumber?.toLowerCase().includes(q) || inv.customerSnapshot.name.toLowerCase().includes(q)
    );
  }, [cancelledInvoices, search]);

  return (
    <AppShell activePage="invoice">
      <main className={styles.invoicePage} dir={dir}>
        {/* Header - using AppShell's header, no duplicate */}
        <div className={styles.tabBar}>
          <button type="button" className={`${styles.tab} ${activeTab === "create" ? styles.tabActive : ""}`} onClick={() => setActiveTab("create")}>
            <FilePlus size={16} strokeWidth={2} aria-hidden="true" />
            {t.createInvoice}
          </button>
          <button type="button" className={`${styles.tab} ${activeTab === "issued" ? styles.tabActive : ""}`} onClick={() => setActiveTab("issued")}>
            <FileCheck size={16} strokeWidth={2} aria-hidden="true" />
            {t.issuedInvoices} {issuedInvoices.length > 0 && <span className={styles.badge}>{issuedInvoices.length}</span>}
          </button>
          <button type="button" className={`${styles.tab} ${activeTab === "cancelled" ? styles.tabActive : ""}`} onClick={() => setActiveTab("cancelled")}>
            <Ban size={16} strokeWidth={2} aria-hidden="true" />
            {t.cancelledInvoices} {cancelledInvoices.length > 0 && <span className={styles.badge}>{cancelledInvoices.length}</span>}
          </button>
          <button type="button" className={`${styles.tab} ${activeTab === "incoming" ? styles.tabActive : ""}`} onClick={() => setActiveTab("incoming")}>
            <Truck size={16} strokeWidth={2} aria-hidden="true" />
            {t.incomingInvoices} {incomingInvoices.length > 0 && <span className={styles.badge}>{incomingInvoices.length}</span>}
          </button>
          <button type="button" className={`${styles.tab} ${activeTab === "drafts" ? styles.tabActive : ""}`} onClick={() => setActiveTab("drafts")}>
            <FileText size={16} strokeWidth={2} aria-hidden="true" />
            {(t as any).drafts || "Drafts"} {draftInvoices.length > 0 && <span className={styles.badge}>{draftInvoices.length}</span>}
          </button>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        {activeTab === "create" && (
          <div className={styles.createLayout}>
            {/* Left: Preview */}
            <section className={styles.previewSection}>
              <div className={styles.previewHeader}>
                <h2>{t.invoicePreview}</h2>
                <span className={styles.previewHint}>{t.seller} → {t.customer}</span>
              </div>
              <div className={styles.previewBody}>
                {canPreview && selectedSale && selectedSeller && selectedCustomer ? (
                  (() => {
                    const taxProfile = taxProfiles.find(tp => tp.id === selectedTaxProfileId && (tp as any).enabled === true) || (selectedSale.items[0] ? products.find(p=>p.id===selectedSale.items[0].productId)?.taxProfileId ? taxProfiles.find(tp=>tp.id===products.find(p=>p.id===selectedSale.items[0].productId)?.taxProfileId && (tp as any).enabled === true) : null : null) || sellerProfiles.find(s=>s.id===selectedSellerId)?.defaultTaxProfileId ? taxProfiles.find(tp=>tp.id===sellerProfiles.find(s=>s.id===selectedSellerId)?.defaultTaxProfileId && (tp as any).enabled === true) : null;
                    const vatRate = taxProfile?.vatRate;
                    if (vatRate == null) {
                      return <div style={{ padding: 20, color: "#B00020", fontWeight: 700 }}>{language==="fr"?"Sélectionnez un profil fiscal": language==="ar"?"اختر الملف الضريبي":"Select a tax profile — unresolved line"}</div>;
                    }
                    const lines = selectedSale.items.map(item => {
                      const product = products.find(p => p.id === item.productId);
                      const totalHT = Math.round(item.weightKg * item.price * 100)/100;
                      const taxAmount = Math.round(totalHT * (vatRate/100) * 100)/100;
                      return {
                        productId: item.productId,
                        description: product?.name ?? item.productId,
                        quantity: item.quantity,
                        weightKg: item.weightKg,
                        unit: "kg",
                        unitPriceHT: item.price,
                        discountType: "none" as const,
                        discountValue: 0,
                        discountAmount: 0,
                        totalHT,
                        taxProfileId: taxProfile?.id,
                        taxRate: vatRate,
                        taxAmount,
                        otherTaxRate: 0,
                        otherTaxAmount: 0,
                        totalTTC: Math.round((totalHT + taxAmount)*100)/100,
                      };
                    });
                    const subtotalHT = Math.round(lines.reduce((s,l)=>s+l.totalHT,0)*100)/100;
                    const taxTotal = Math.round(lines.reduce((s,l)=>s+l.taxAmount,0)*100)/100;
                    const totalTTC = Math.round(lines.reduce((s,l)=>s+l.totalTTC,0)*100)/100;
                    const draftPreview: Invoice = {
                      id: "draft-preview",
                      status: "DRAFT",
                      sellerProfileId: selectedSeller.id,
                      sellerSnapshot: {
                        commercialName: selectedSeller.commercialName,
                        legalDenomination: selectedSeller.legalDenomination,
                        legalForm: selectedSeller.legalForm,
                        activity: selectedSeller.activity,
                        address: selectedSeller.address,
                        city: selectedSeller.city,
                        wilaya: selectedSeller.wilaya,
                        phone: selectedSeller.phone,
                        email: selectedSeller.email,
                        fax: selectedSeller.fax,
                        rc: selectedSeller.rc,
                        nif: selectedSeller.nif,
                        nis: selectedSeller.nis,
                        capital: selectedSeller.capital,
                        bankName: selectedSeller.bankName,
                        bankAccount: selectedSeller.bankAccount,
                        rib: selectedSeller.rib,
                        logo: selectedSeller.logo,
                        stampImage: selectedSeller.stampImage,
                      },
                      customerSnapshot: {
                        name: selectedCustomer.name,
                        legalName: (selectedCustomer as any).legalName || selectedCustomer.name,
                        commercialName: (selectedCustomer as any).commercialName,
                        legalForm: (selectedCustomer as any).legalForm,
                        activity: (selectedCustomer as any).activity,
                        address: (selectedCustomer as any).billingAddress || (selectedCustomer as any).address,
                        phone: selectedCustomer.phone,
                        email: selectedCustomer.email,
                        rc: selectedCustomer.rc,
                        nif: selectedCustomer.nif,
                        nis: selectedCustomer.nis,
                      },
                      customerId: selectedCustomer.id,
                      sourceSaleIds: [selectedSale.id],
                      invoiceDate: new Date(invoiceDate).getTime(),
                      dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
                      paymentMethod,
                      lines,
                      subtotalHT,
                      discountTotal: 0,
                      additionalCharges: [],
                      additionalChargesTotal: 0,
                      taxableBase: subtotalHT,
                      taxTotal,
                      otherTaxTotal: 0,
                      totalTTC,
                      currencyCode: (() => { const v = selectedSeller.defaultCurrency || docDefaults?.defaultCurrency || currency || "DA"; return ["DA","€","$"].includes(v) ? v : "DA"; })(),
                      documentLanguage,
                      notes: notes || undefined,
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                      syncStatus: "pending",
                    } as Invoice;
                    return <FormalInvoiceDocument invoice={draftPreview} showHeaderFooter={true} />;
                  })()
                ) : (
                  <div className={styles.emptyPreview}>
                    <div className={styles.emptyIcon}>
                      <FileText size={32} strokeWidth={1.5} aria-hidden="true" />
                    </div>
                    <h3>{t.noInvoiceSelected}</h3>
                    <p>{t.selectSellerCustomerSale}</p>
                  </div>
                )}
              </div>
            </section>

            {/* Right: Setup */}
            <aside className={styles.setupSection}>
              <div className={styles.setupCard}>
                <h3>{t.invoiceSetup}</h3>
                
                <label>
                  <span>{t.seller} <small>{t.required}</small></span>
                  <StyledSelect
                    value={selectedSellerId}
                    onChange={setSelectedSellerId}
                    placeholder={t.selectSeller}
                    ariaLabel={t.seller}
                    options={sellerProfiles.map(s => ({ value: s.id, label: s.commercialName }))}
                  />
                </label>

                <label>
                  <span>{t.customer} <small>{t.required}</small></span>
                  <StyledSelect
                    value={selectedCustomerId}
                    onChange={(v) => { setSelectedCustomerId(v); setSelectedSaleId(""); }}
                    placeholder={t.selectCustomer}
                    ariaLabel={t.customer}
                    options={customers.map(c => ({ value: c.id, label: c.name }))}
                  />
                </label>

                <label>
                  <span>{t.sourceSale} <small>{t.required}</small></span>
                  <StyledSelect
                    value={selectedSaleId}
                    onChange={setSelectedSaleId}
                    placeholder={(t as any).selectSourceSale ?? t.selectSale}
                    ariaLabel={t.sourceSale}
                    options={filteredSales.map(s => {
                      const total = s.items.reduce((sum, it) => sum + it.total, 0);
                      return { value: s.id, label: `${new Date(s.date).toLocaleDateString(language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB", { numberingSystem: "latn" } as any)} — ${formatCurrency(total, currency)}` };
                    })}
                  />
                  {selectedCustomerId && filteredSales.length === 0 && (
                    <small className={styles.fieldHint}>{t.noSalesForCustomer}</small>
                  )}
                </label>

                <label>
                  <span>{t.invoiceDate} <small>{t.required}</small></span>
                  <StyledDatePicker value={invoiceDate} onChange={setInvoiceDate} language={language} placeholder={t.invoiceDate} ariaLabel={t.invoiceDate} />
                </label>

                <label>
                  <span>{t.paymentMethod}</span>
                  <StyledSelect
                    value={paymentMethod}
                    onChange={setPaymentMethod}
                    placeholder={t.paymentMethod}
                    ariaLabel={t.paymentMethod}
                    options={paymentMethodsConfig.map((pm:any)=> ({ value: pm.id, label: pm.label }))}
                  />
                </label>

                <label>
                  <span>{t.dueDate} <small>{t.optional}</small></span>
                  <StyledDatePicker value={dueDate} onChange={setDueDate} language={language} placeholder={t.dueDate} ariaLabel={t.dueDate} />
                </label>

                <label>
                  <span>{t.taxProfile}</span>
                  <StyledSelect
                    value={selectedTaxProfileId}
                    onChange={setSelectedTaxProfileId}
                    placeholder={t.selectTaxProfile}
                    ariaLabel={t.taxProfile}
                    options={[...taxProfiles].sort((a, b) => {
                      const order: Record<string, number> = { "TVA19": 0, "TVA17": 1, "TVA9": 2, "EXO": 3, "HORS": 4 };
                      return (order[a.code] ?? 99) - (order[b.code] ?? 99);
                    }).map(tp => ({ value: tp.id, label: `${tp.name} (${tp.vatRate}%)` }))}
                  />
                </label>

                <label>
                  <span>{t.documentLanguage}</span>
                  <StyledSelect
                    value={documentLanguage}
                    onChange={(v) => setDocumentLanguage(v as Language)}
                    placeholder={t.documentLanguage}
                    ariaLabel={t.documentLanguage}
                    options={[
                      { value: "en", label: "English" },
                      { value: "fr", label: "Français" },
                      { value: "ar", label: "العربية" },
                    ]}
                  />
                </label>

                <label>
                  <span>{t.notes} <small>{t.optional}</small></span>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder={t.notes} />
                </label>

                <div className={styles.setupActions}>
                  <button type="button" className={styles.secondaryButton} onClick={handleSaveDraft} disabled={saving || !canPreview}>
                    {t.saveDraft}
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={handleIssueInvoice} disabled={saving || !canIssue}>
                    {t.issueInvoice}
                  </button>
                </div>
                {!canIssue && canPreview && !navigator.onLine && (
                  <small className={styles.fieldHint}>{t.internetRequired}</small>
                )}
                <button type="button" className={styles.linkButton} onClick={() => router.push("/settings?section=invoice")}>
                  {t.invoiceSettings} →
                </button>
              </div>
            </aside>
          </div>
        )}

        {activeTab === "issued" && (
          <section className={styles.historySection}>
            <div className={styles.tableHeader}>
              <div className={styles.searchBox}>
                <Search size={16} strokeWidth={2} aria-hidden="true" />
                <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t.searchInvoices} aria-label={t.searchInvoices} />
              </div>
            </div>
            {filteredIssued.length === 0 ? (
              <div className={styles.emptyState}>
                <FileCheck size={32} strokeWidth={1.5} aria-hidden="true" />
                <h3>{t.noIssuedInvoices}</h3>
                <p>{t.createFirstInvoice}</p>
              </div>
            ) : (
              <div className={styles.tableCard}>
                <div className={styles.tableHeaderRow}>
                  <span>{t.invoiceNumber}</span>
                  <span>{t.seller}</span>
                  <span>{t.customer}</span>
                  <span>{t.invoiceDate}</span>
                  <span>{t.totalTTC}</span>
                  <span>{t.currency}</span>
                  <span>{t.actions}</span>
                </div>
                {filteredIssued.map(inv => (
                  <div key={inv.id} className={styles.tableRow}>
                    <strong>{inv.invoiceNumber || "DRAFT"}</strong>
                    <span>{sellerProfiles.find(s => s.id === inv.sellerProfileId)?.commercialName || inv.sellerProfileId}</span>
                    <span>{inv.customerSnapshot.name}</span>
                    <span>{new Date(inv.invoiceDate).toLocaleDateString(language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB", { numberingSystem: "latn" } as any)}</span>
                    <strong>{formatCurrency(inv.totalTTC, inv.currencyCode as Currency)}</strong>
                    <span>{inv.currencyCode}</span>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.iconButton} title={t.view} aria-label={t.view} onClick={() => router.push(`/invoice/print-preview?invoiceId=${inv.id}`)}><Eye size={16} strokeWidth={2} aria-hidden="true" /></button>
                      <button type="button" className={styles.iconButton} title={t.print} aria-label={t.print} onClick={() => router.push(`/invoice/print-preview?invoiceId=${inv.id}`)}><Printer size={16} strokeWidth={2} aria-hidden="true" /></button>
                      <button type="button" className={styles.iconButton} title={t.exportPdf} aria-label={t.exportPdf} onClick={() => window.open(`/invoice/print-preview?invoiceId=${inv.id}&download=1`, "_blank")}><Download size={16} strokeWidth={2} aria-hidden="true" /></button>
                      <button type="button" className={styles.iconButtonDanger} title={t.cancelInvoice} aria-label={t.cancelInvoice} onClick={() => setCancelTarget(inv)}><Ban size={16} strokeWidth={2} aria-hidden="true" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "cancelled" && (
          <section className={styles.historySection}>
            <div className={styles.tableHeader}>
              <div className={styles.searchBox}>
                <Search size={16} strokeWidth={2} aria-hidden="true" />
                <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t.searchInvoices} aria-label={t.searchInvoices} />
              </div>
            </div>
            {filteredCancelled.length === 0 ? (
              <div className={styles.emptyState}>
                <Ban size={32} strokeWidth={1.5} aria-hidden="true" />
                <h3>{t.noCancelledInvoices}</h3>
                <p>{t.cancelled} invoices remain stored with original number.</p>
              </div>
            ) : (
              <div className={styles.tableCard}>
                <div className={styles.tableHeaderRow}>
                  <span>{t.invoiceNumber}</span>
                  <span>{t.seller}</span>
                  <span>{t.customer}</span>
                  <span>{t.invoiceDate}</span>
                  <span>{t.totalTTC}</span>
                  <span>{t.actions}</span>
                </div>
                {filteredCancelled.map(inv => (
                  <div key={inv.id} className={styles.tableRow}>
                    <strong>{inv.invoiceNumber}</strong>
                    <span>{sellerProfiles.find(s => s.id === inv.sellerProfileId)?.commercialName || inv.sellerSnapshot.commercialName}</span>
                    <span>{inv.customerSnapshot.name}</span>
                    <span>{new Date(inv.invoiceDate).toLocaleDateString(language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB", { numberingSystem: "latn" } as any)}</span>
                    <strong>{formatCurrency(inv.totalTTC, inv.currencyCode as Currency)}</strong>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.iconButton} title={t.view} onClick={() => router.push(`/invoice/print-preview?invoiceId=${inv.id}`)}><Eye size={16} strokeWidth={2} aria-hidden="true" /></button>
                      <button type="button" className={styles.iconButton} title={t.print} onClick={() => router.push(`/invoice/print-preview?invoiceId=${inv.id}`)}><Printer size={16} strokeWidth={2} aria-hidden="true" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "incoming" && (
          <section className={styles.historySection}>
            <div className={styles.sectionHeader}>
              <h2>{t.incomingInvoices}</h2>
              <button type="button" className={styles.primaryButton} onClick={() => { setIncomingForm({ supplierId: "", supplierInvoiceNumber: "", invoiceDate: new Date().toISOString().slice(0,10), amountHT: "", amountTTC: "", currencyCode: currency, notes: "" }); setShowIncomingForm(true); }}>
                <Plus size={16} strokeWidth={2} aria-hidden="true" />
                {t.addIncoming}
              </button>
            </div>
            {incomingInvoices.length === 0 ? (
              <div className={styles.emptyState}>
                <Archive size={32} strokeWidth={1.5} aria-hidden="true" />
                <h3>{t.noIncomingInvoices}</h3>
                <p>{t.incomingArchiveHint}</p>
              </div>
            ) : (
              <div className={styles.tableCard}>
                <div className={styles.tableHeaderRow}>
                  <span>{t.supplier}</span>
                  <span>{t.supplierInvoiceNumber}</span>
                  <span>{t.invoiceDate}</span>
                  <span>{t.amountHT}</span>
                  <span>{t.amountTTC}</span>
                  <span>{t.actions}</span>
                </div>
                {incomingInvoices.map(inv => (
                  <div key={inv.id} className={styles.tableRow}>
                    <span>{(suppliers as any[]).find((s: any)=>s.id===inv.supplierId)?.name || inv.supplierId}</span>
                    <span>{inv.supplierInvoiceNumber}</span>
                    <span>{new Date(inv.invoiceDate).toLocaleDateString(language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB", { numberingSystem: "latn" } as any)}</span>
                    <span>{formatCurrency(inv.amountHT, inv.currencyCode as Currency)}</span>
                    <span>{formatCurrency(inv.amountTTC, inv.currencyCode as Currency)}</span>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.iconButton} title={t.view} onClick={() => setViewingInvoice(inv as any)}><Eye size={16} strokeWidth={2} aria-hidden="true" /></button>
                      <button type="button" className={styles.iconButtonDanger} title={t.delete} onClick={() => setIncomingDeleteTarget(inv as any)}><Trash2 size={16} strokeWidth={2} aria-hidden="true" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "drafts" && (
          <section className={styles.historySection}>
            <div className={styles.sectionHeader}>
              <h2>{(t as any).drafts || "Drafts"}</h2>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{draftInvoices.length} {(t as any).drafts?.toLowerCase() || "drafts"}</span>
            </div>
            {draftInvoices.length === 0 ? (
              <div className={styles.emptyState}>
                <FileText size={32} strokeWidth={1.5} aria-hidden="true" />
                <h3>{(t as any).noDrafts || "No drafts"}</h3>
                <p>{(t as any).draftsDesc || "Unfinished invoices"}</p>
              </div>
            ) : (
              <div className={styles.tableCard}>
                <div className={styles.tableHeaderRow} style={{ gridTemplateColumns: "1.2fr 1fr 1.2fr 1fr 1fr 1.2fr" } as any}>
                  <span>{t.seller}</span>
                  <span>{t.customer}</span>
                  <span>{t.sourceSale}</span>
                  <span>{t.invoiceDate}</span>
                  <span>{t.totalTTC}</span>
                  <span>{t.actions}</span>
                </div>
                {draftInvoices.map(inv => (
                  <div key={inv.id} className={styles.tableRow} style={{ gridTemplateColumns: "1.2fr 1fr 1.2fr 1fr 1fr 1.2fr" } as any}>
                    <span>{sellerProfiles.find(s=>s.id===inv.sellerProfileId)?.commercialName || inv.sellerSnapshot.commercialName}</span>
                    <span>{inv.customerSnapshot.name}</span>
                    <span>{inv.sourceSaleIds[0]?.slice(0,8) || "—"}</span>
                    <span>{new Date(inv.invoiceDate).toLocaleDateString(language==="ar"?"ar-DZ-u-nu-latn": language==="fr"?"fr-FR":"en-GB", {numberingSystem:"latn"} as any)}</span>
                    <strong>{formatCurrency(inv.totalTTC, inv.currencyCode as Currency)}</strong>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.iconButton} title={(t as any).editDraft || "Edit"} aria-label={(t as any).editDraft || "Edit"} onClick={() => {
                        // Load draft into create form - same ID editing
                        setEditingDraftId(inv.id);
                        setSelectedSellerId(inv.sellerProfileId);
                        setSelectedCustomerId(inv.customerId);
                        setSelectedSaleId(inv.sourceSaleIds[0] || "");
                        setInvoiceDate(new Date(inv.invoiceDate).toISOString().slice(0,10));
                        setDueDate(inv.dueDate ? new Date(inv.dueDate).toISOString().slice(0,10) : "");
                        setPaymentMethod(inv.paymentMethod || (inv as any).paymentMethodId || "cash");
                        setDocumentLanguage(inv.documentLanguage as Language);
                        setNotes(inv.notes || "");
                        // Restore tax override if applicable (first line's profile)
                        const firstLineTax = (inv as any).lines?.[0]?.taxProfileId || "";
                        setSelectedTaxProfileId(firstLineTax);
                        setActiveTab("create");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}><Pencil size={16} strokeWidth={2} aria-hidden="true" /></button>
                      <button type="button" className={styles.iconButtonDanger} title={(t as any).deleteDraft || "Delete"} aria-label={(t as any).deleteDraft || "Delete"} onClick={() => setDraftDeleteTarget(inv as any)}><Trash2 size={16} strokeWidth={2} aria-hidden="true" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}


      </main>

      {showIncomingForm && (
        <div className={styles.modalBackdrop} onClick={() => setShowIncomingForm(false)}>
          <section className={styles.modal} role="dialog" aria-modal="true" onClick={e=>e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h2>{t.addIncoming}</h2>
              <button type="button" className={styles.closeButton} onClick={() => setShowIncomingForm(false)}><X size={18} strokeWidth={2} aria-hidden="true" /></button>
            </header>
            <div className={styles.formGrid}>
              <label>
                <span>{t.supplier} *</span>
                <StyledSelect
                  value={incomingForm.supplierId}
                  onChange={(v) => setIncomingForm(prev => ({ ...prev, supplierId: v }))}
                  placeholder={t.selectSupplier}
                  ariaLabel={t.supplier}
                  options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))}
                />
              </label>
              <label>
                <span>{t.supplierInvoiceNumber} *</span>
                <input value={incomingForm.supplierInvoiceNumber} onChange={e=>setIncomingForm({...incomingForm, supplierInvoiceNumber: e.target.value})} placeholder="INV-001" />
              </label>
              <label>
                <span>{t.invoiceDate} *</span>
                <StyledDatePicker value={incomingForm.invoiceDate} onChange={(v) => setIncomingForm(prev => ({ ...prev, invoiceDate: v }))} language={language} placeholder={t.invoiceDate} ariaLabel={t.invoiceDate} />
              </label>
              <label>
                <span>{t.amountHT} *</span>
                <input type="number" step="0.01" value={incomingForm.amountHT} onChange={e=>setIncomingForm({...incomingForm, amountHT: e.target.value})} />
              </label>
              <label>
                <span>{t.amountTTC} *</span>
                <input type="number" step="0.01" value={incomingForm.amountTTC} onChange={e=>setIncomingForm({...incomingForm, amountTTC: e.target.value})} />
              </label>
              <label>
                <span>{(t as any).currency || "Currency"}</span>
                <input value={incomingForm.currencyCode} onChange={e=>setIncomingForm({...incomingForm, currencyCode: e.target.value as any})} />
              </label>
              <label className={styles.fullWidth}>
                <span>{t.notes}</span>
                <textarea value={incomingForm.notes} onChange={e=>setIncomingForm({...incomingForm, notes: e.target.value})} rows={3} />
              </label>
            </div>
            <footer className={styles.modalFooter}>
              <button type="button" className={styles.secondaryButton} onClick={() => setShowIncomingForm(false)}>{t.cancel}</button>
              <button type="button" className={styles.primaryButton} onClick={handleAddIncoming} disabled={saving}>{saving ? t.saving : t.addIncoming}</button>
            </footer>
          </section>
        </div>
      )}

      {viewingInvoice && (
        <div className={styles.modalBackdrop} onClick={() => setViewingInvoice(null)}>
          <section className={styles.modal} role="dialog" aria-modal="true" onClick={e=>e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h2>{(viewingInvoice as any).invoiceNumber || (viewingInvoice as any).supplierInvoiceNumber || "Invoice"}</h2>
              <button type="button" className={styles.closeButton} onClick={() => setViewingInvoice(null)} aria-label={t.close}><X size={18} strokeWidth={2} aria-hidden="true" /></button>
            </header>
            <div className={styles.formGrid}>
              {(viewingInvoice as any).supplierInvoiceNumber ? (
                // Incoming supplier invoice — neutral archive record, NOT HEBRIH outgoing invoice
                <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                  <div style={{ padding: 10, background: "#FCF6EF", border: "1px solid #E2D4C5", borderRadius: 8 }}>
                    <strong>{language==="fr"?"Archive fournisseur → HEBRIH": language==="ar"?"أرشيف المورد → حبريح":"Supplier → HEBRIH archive"}</strong>
                    <div style={{ marginTop: 6, color: "var(--muted)" }}>{t.incomingArchiveHint}</div>
                  </div>
                  <div><strong>{t.supplier}:</strong> {(suppliers as any[]).find((s:any)=> s.id===(viewingInvoice as any).supplierId)?.name || (viewingInvoice as any).supplierId}</div>
                  <div><strong>{t.supplierInvoiceNumber}:</strong> {(viewingInvoice as any).supplierInvoiceNumber}</div>
                  <div><strong>{t.invoiceDate}:</strong> {new Date((viewingInvoice as any).invoiceDate).toLocaleDateString(language==="ar"?"ar-DZ-u-nu-latn": language==="fr"?"fr-FR":"en-GB", {numberingSystem:"latn"} as any)}</div>
                  <div><strong>{t.amountHT}:</strong> {formatCurrency((viewingInvoice as any).amountHT, (viewingInvoice as any).currencyCode as Currency)} — <strong>{t.amountTTC}:</strong> {formatCurrency((viewingInvoice as any).amountTTC, (viewingInvoice as any).currencyCode as Currency)}</div>
                  {(viewingInvoice as any).notes && <div><strong>{t.notes}:</strong> {(viewingInvoice as any).notes}</div>}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "pre-wrap" }}>{JSON.stringify(viewingInvoice, null, 2)}</div>
              )}
            </div>
            <footer className={styles.modalFooter}>
              <button type="button" className={styles.secondaryButton} onClick={() => setViewingInvoice(null)}>{t.close}</button>
              {(viewingInvoice as any).invoiceNumber ? (
                <button type="button" className={styles.primaryButton} onClick={() => viewingInvoice && router.push(`/invoice/print-preview?invoiceId=${(viewingInvoice as any).id}`)}><Printer size={14} strokeWidth={2} aria-hidden="true" /> {t.print}</button>
              ) : (
                <span style={{ fontSize: 11, color: "var(--muted)", padding: "8px 0" }}>{language==="fr"?"Archive — pas d'impression HEBRIH": language==="ar"?"أرشيف — لا طباعة صادرة":"Archive record — no HEBRIH print"}</span>
              )}
            </footer>
          </section>
        </div>
      )}

      <CancelInvoiceModal
        isOpen={!!cancelTarget}
        invoiceNumber={cancelTarget?.invoiceNumber}
        language={language}
        t={t as any}
        onCancel={() => setCancelTarget(null)}
        onConfirm={handleCancelInvoiceConfirmed}
        resetKey={cancelTarget?.id ?? null}
      />

      <ProtectedDeleteModal
        isOpen={!!incomingDeleteTarget}
        title={t.deleteIncomingTitle}
        entityName={incomingDeleteTarget?.supplierInvoiceNumber ? `${incomingDeleteTarget.supplierInvoiceNumber} · ${incomingDeleteTarget.currencyCode} ${incomingDeleteTarget.amountTTC}` : incomingDeleteTarget?.id}
        description={t.deleteIncomingDesc}
        confirmLabel={t.confirmDelete}
        cancelLabel={t.cancel}
        deletingLabel={t.saving}
        eyebrowLabel={t.permanentAction}
        countdownWaitingLabel={(t as any).confirmAvailableIn ?? (t as any).confirmDeletion}
        isDeleting={incomingDeleting}
        onCancel={() => setIncomingDeleteTarget(null)}
        onConfirm={handleDeleteIncomingConfirmed}
        resetKey={incomingDeleteTarget?.id ?? null}
      />

      <ProtectedDeleteModal
        isOpen={!!draftDeleteTarget}
        title={(t as any).deleteDraft || "Delete Draft"}
        entityName={draftDeleteTarget?.id ? `${(draftDeleteTarget as any).customerSnapshot?.name || draftDeleteTarget.customerId} · ${new Date((draftDeleteTarget as any).invoiceDate).toLocaleDateString(language==="ar"?"ar-DZ-u-nu-latn": language==="fr"?"fr-FR":"en-GB", {numberingSystem:"latn"} as any)}` : draftDeleteTarget?.id}
        description={(t as any).draftsDesc || "Unfinished invoices — edit or delete before issuing."}
        confirmLabel={t.confirmDelete}
        cancelLabel={t.cancel}
        deletingLabel={t.saving}
        eyebrowLabel={t.permanentAction}
        countdownWaitingLabel={(t as any).confirmAvailableIn ?? (t as any).confirmDeletion}
        isDeleting={draftDeleting}
        onCancel={() => setDraftDeleteTarget(null)}
        onConfirm={handleDraftDeleteConfirmed}
        resetKey={draftDeleteTarget?.id ?? null}
      />
    </AppShell>
  );
}


