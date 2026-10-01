"use client";

import { Suspense, useEffect, useState, useRef, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import styles from "./page.module.css";
import { useDbSync } from "../../src/hooks/useDbSync";

import { settingsService } from "../../src/services/settings.service";
import { rvbUiPreferencesService } from "../../src/services/rvb-ui-preferences.service";
import { productService } from "../../src/services/product.service";
import { injuryEquationService } from "../../src/services/injury-equation.service";
import {
  SETTINGS_EVENT,
  DEFAULT_SETTINGS,
  getDirection,
  resolveNavigationStyle,
  resolveRvbNavigationStyle,
} from "../../src/lib/settings";
import { getSavedTheme, applyTheme } from "../../src/lib/theme";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Briefcase,
  Building2,
  CarFront,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CreditCard,
  Database,
  FileText,
  Globe,
  Hash,
  Image as ImageIcon,
  Info,
  Landmark,
  Languages,
  Mail,
  MapPin,
  Moon,
  Palette,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Search,
  Settings as SettingsIcon,
  ShoppingCart,
  ShieldAlert,
  Sun,
  Trash2,
  X,
  Home,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import DateTimeDisplay from "../../src/components/common/DateTimeDisplay";
import StyledSelect from "../../src/components/common/StyledSelect";
import ThemeAppearanceSelector from "../../src/components/settings/ThemeAppearanceSelector";
import NavigationStyleSelector from "../../src/components/settings/NavigationStyleSelector";

import type {
  Settings as AppSettings,
  Language,
  Currency,
  NavigationStyle,
} from "../../src/types/settings/settings";

const TRANSLATIONS = {
  en: {
    eyebrow: "SYSTEM CONFIGURATION",
    title: "Settings",
    description: "Configure the core options used throughout Hebrih Slaughter House.",
    back: "Back to Dashboard",
    saved: "Saved",
    local: "Local configuration",
    sectionGeneral: "GENERAL",
    sectionMasterData: "MASTER DATA",
    sectionPurchasing: "PURCHASING",
  sectionInvoice: "INVOICE",
  sectionAppearance: "APPEARANCE",
  sectionAbout: "ABOUT",
  language: "Language",
  languageDescription: "Choose the application language.",
    english: "English",
    french: "Français",
    arabic: "Arabic",
    currency: "Global Currency",
    currencyDescription: "Currency used throughout the application.",
    dinar: "DA — Algerian Dinar",
    euro: "€ — Euro",
    dollar: "$ — US Dollar",
    customerTypes: "Customer Types",
    customerTypesDescription: "Manage the customer categories used by the system.",
    workerPositions: "Worker Positions",
    workerPositionsDescription: "Manage worker positions and ranks.",
    vehicleTypes: "Vehicle Types",
    vehicleTypesDescription: "Manage the vehicle categories used by the system.",
    purchaseInjury: "Purchase / Injury Parameters",
    purchaseInjuryDescription: "Configure product injury equations used in purchase calculations.",
    expenseTypes: "Expense Types",
    expenseTypesDescription: "Manage the expense categories used by the system.",
    addCustomerType: "Add customer type",
    addWorkerPosition: "Add worker position",
    addVehicleType: "Add vehicle type",
    addExpenseType: "Add expense type",
    add: "Add",
    empty: "No items configured",
    product: "Product",
    equationName: "Parameter name",
    equation: "Equation",
    enabled: "Enabled",
    disabled: "Disabled",
    createEquation: "Add parameter",
    noEquations: "No injury parameters configured",
    delete: "Delete",
    searchPlaceholder: "Search settings...",
    aboutTitle: "Hebrih Slaughter House",
    aboutDescription: "Management System for poultry slaughter operations.",
    aboutVersion: "Version",
    aboutDetails: "All settings are stored locally and synchronized with the backend when available.",
    // Invoice
    invoiceTitle: "Invoice",
    invoiceDesc: "Manage invoicing legal entities, taxes, numbering and document appearance.",
    invoiceSellerProfiles: "Seller Profiles",
    invoiceSellerProfilesDesc: "HEBRIH entities authorized to issue invoices",
    invoiceTaxProfiles: "Tax Profiles",
    invoiceTaxProfilesDesc: "VAT and other taxes applied to invoice lines",
    invoicePaymentMethods: "Payment Methods",
    invoicePaymentMethodsDesc: "Control which payment methods appear on invoices",
    invoiceNumbering: "Numbering",
    invoiceNumberingDesc: "Per-seller sequence, prefix and padding",
    invoiceDocumentDefaults: "Document Defaults",
    invoiceDocumentDefaultsDesc: "Default language, currency and visibility of fields on the printed invoice",
    edit: "Edit",
    notConfigured: "Not configured",
    commercialName: "Commercial name",
    legalDenomination: "Legal denomination",
    legalForm: "Legal form",
    activity: "Activity",
    registeredAddress: "Registered address",
    city: "City",
    wilaya: "Wilaya",
    rc: "RC",
    nif: "NIF",
    nis: "NIS",
    shareCapital: "Share capital",
    phone: "Phone",
    email: "Email",
    fax: "Fax",
    bankName: "Bank name",
    bankAccount: "Bank account",
    rib: "RIB",
    invoicePrefix: "Invoice prefix",
    nextInvoiceNumber: "Next invoice number",
    paddingLength: "Padding length",
    yearResetPolicy: "Year reset policy",
    yearResetNever: "Never",
    yearResetYearly: "Yearly",
    defaultTaxProfile: "Default tax profile",
    defaultPaymentTerms: "Default payment method",
    defaultPaymentMethodId: "Default payment method",
    defaultCurrency: "Default currency",
    logo: "Logo",
    stampImage: "Stamp image",
    vatRate: "VAT rate",
    otherTaxRate: "Other tax rate",
    otherTaxLabel: "Other tax label",
    code: "Code",
    nameLabel: "Name",
    prefix: "Prefix",
    nextNumber: "Next number",
    padding: "Padding",
    cash: "Cash",
    bankTransfer: "Bank transfer",
    cheque: "Cheque",
    other: "Other",
    addTaxProfile: "+ Add Tax Profile",
    addPaymentMethod: "+ Add Payment Method",
    defaultInvoiceLanguage: "Default invoice language",
    showBankDetails: "Show bank details",
    showRC: "Show RC",
    showNIF: "Show NIF",
    showNIS: "Show NIS",
    showShareCapital: "Show share capital",
    showStamp: "Show stamp / signature area",
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    identity: "IDENTITY",
    legal: "LEGAL",
    contact: "CONTACT",
    banking: "BANKING",
    numberingSection: "NUMBERING",
    taxDefaults: "TAX / DEFAULTS",
    branding: "BRANDING",
    sellerProfileEdit: "Edit Seller Profile",
    taxProfileEdit: "Edit Tax Profile",
    addTaxProfileTitle: "Add Tax Profile",
    deleteTaxConfirm: "Delete this tax profile?",
    deleteTaxDesc: "This action cannot be undone.",
    numberingSafetyError: "Next number cannot be lower than already issued invoices",
    enabledLabel: "Enabled",
    disabledLabel: "Disabled",
    next: "Next",
    customPaymentPlaceholder: "Payment method name",
    paymentMethodCash: "Cash",
    paymentMethodBankTransfer: "Bank transfer",
    paymentMethodCheque: "Cheque",
    paymentMethodOther: "Other",
  },
  fr: {
    eyebrow: "CONFIGURATION DU SYSTÈME",
    title: "Paramètres",
    description: "Configurez les options principales utilisées dans Abattoire Hebrih.",
    back: "Retour au tableau de bord",
    saved: "Enregistré",
    local: "Configuration locale",
    sectionGeneral: "GÉNÉRAL",
    sectionMasterData: "DONNÉES DE BASE",
    sectionPurchasing: "ACHATS",
  sectionInvoice: "FACTURATION",
  sectionAppearance: "APPARENCE",
  sectionAbout: "À PROPOS",
  language: "Langue",
  languageDescription: "Choisissez la langue de l'application.",
    english: "Anglais",
    french: "Français",
    arabic: "Arabe",
    currency: "Devise globale",
    currencyDescription: "Devise utilisée dans toute l'application.",
    dinar: "DA — Dinar algérien",
    euro: "€ — Euro",
    dollar: "$ — Dollar américain",
    customerTypes: "Types de clients",
    customerTypesDescription: "Gérez les catégories de clients utilisées par le système.",
    workerPositions: "Postes des employés",
    workerPositionsDescription: "Gérez les postes et les fonctions des employés.",
    vehicleTypes: "Types de véhicules",
    vehicleTypesDescription: "Gérez les catégories de véhicules utilisées par le système.",
    purchaseInjury: "Paramètres achats / blessures",
    purchaseInjuryDescription: "Configurez les équations de blessures utilisées dans les calculs d'achat.",
    expenseTypes: "Types de dépenses",
    expenseTypesDescription: "Gérez les catégories de dépenses utilisées par le système.",
    addCustomerType: "Ajouter un type de client",
    addWorkerPosition: "Ajouter un poste",
    addVehicleType: "Ajouter un type de véhicule",
    addExpenseType: "Ajouter un type de dépense",
    add: "Ajouter",
    empty: "Aucun élément configuré",
    product: "Produit",
    equationName: "Nom du paramètre",
    equation: "Équation",
    enabled: "Activé",
    disabled: "Désactivé",
    createEquation: "Ajouter le paramètre",
    noEquations: "Aucun paramètre de blessure configuré",
    delete: "Supprimer",
    searchPlaceholder: "Rechercher les paramètres...",
    aboutTitle: "Hebrih Slaughter House",
    aboutDescription: "Système de gestion pour les opérations d'abattage de volaille.",
    aboutVersion: "Version",
    aboutDetails: "Tous les paramètres sont stockés localement et synchronisés avec le backend lorsqu'il est disponible.",
    invoiceTitle: "Facturation",
    invoiceDesc: "Gérez les entités légales, taxes, numérotation et apparence des factures.",
    invoiceSellerProfiles: "Profils vendeurs",
    invoiceSellerProfilesDesc: "Entités HEBRIH autorisées à émettre des factures",
    invoiceTaxProfiles: "Profils fiscaux",
    invoiceTaxProfilesDesc: "TVA et autres taxes appliquées aux lignes",
    invoicePaymentMethods: "Modes de paiement",
    invoicePaymentMethodsDesc: "Choisissez les modes de paiement affichés",
    invoiceNumbering: "Numérotation",
    invoiceNumberingDesc: "Séquence, préfixe et remplissage par vendeur",
    invoiceDocumentDefaults: "Par défaut du document",
    invoiceDocumentDefaultsDesc: "Langue, devise et visibilité des champs sur la facture imprimée",
    edit: "Modifier",
    notConfigured: "Non configuré",
    commercialName: "Nom commercial",
    legalDenomination: "Dénomination légale",
    legalForm: "Forme juridique",
    activity: "Activité",
    registeredAddress: "Adresse",
    city: "Ville",
    wilaya: "Wilaya",
    rc: "RC",
    nif: "NIF",
    nis: "NIS",
    shareCapital: "Capital social",
    phone: "Téléphone",
    email: "Email",
    fax: "Fax",
    bankName: "Banque",
    bankAccount: "Compte bancaire",
    rib: "RIB",
    invoicePrefix: "Préfixe facture",
    nextInvoiceNumber: "Prochain numéro",
    paddingLength: "Longueur de remplissage",
    yearResetPolicy: "Réinitialisation annuelle",
    yearResetNever: "Jamais",
    yearResetYearly: "Annuelle",
    defaultTaxProfile: "Profil fiscal par défaut",
    defaultPaymentTerms: "Mode de paiement par défaut",
    defaultPaymentMethodId: "Mode de paiement par défaut",
    defaultCurrency: "Devise par défaut",
    logo: "Logo",
    stampImage: "Cachet",
    vatRate: "Taux TVA",
    otherTaxRate: "Autre taxe",
    otherTaxLabel: "Libellé autre taxe",
    code: "Code",
    nameLabel: "Nom",
    prefix: "Préfixe",
    nextNumber: "Prochain",
    padding: "Remplissage",
    cash: "Espèces",
    bankTransfer: "Virement bancaire",
    cheque: "Chèque",
    other: "Autre",
    addTaxProfile: "+ Ajouter profil fiscal",
    addPaymentMethod: "+ Ajouter mode de paiement",
    defaultInvoiceLanguage: "Langue facture par défaut",
    showBankDetails: "Afficher coordonnées bancaires",
    showRC: "Afficher RC",
    showNIF: "Afficher NIF",
    showNIS: "Afficher NIS",
    showShareCapital: "Afficher capital social",
    showStamp: "Afficher cachet / signature",
    save: "Enregistrer",
    cancel: "Annuler",
    close: "Fermer",
    identity: "IDENTITÉ",
    legal: "JURIDIQUE",
    contact: "CONTACT",
    banking: "BANCAIRE",
    numberingSection: "NUMÉROTATION",
    taxDefaults: "FISCALITÉ / DÉFAUTS",
    branding: "MARQUE",
    sellerProfileEdit: "Modifier le profil vendeur",
    taxProfileEdit: "Modifier le profil fiscal",
    addTaxProfileTitle: "Ajouter un profil fiscal",
    deleteTaxConfirm: "Supprimer ce profil fiscal ?",
    deleteTaxDesc: "Cette action est irréversible.",
    numberingSafetyError: "Le prochain numéro ne peut pas être inférieur aux factures déjà émises",
    enabledLabel: "Activé",
    disabledLabel: "Désactivé",
    next: "Suivant",
    customPaymentPlaceholder: "Nom du mode de paiement",
    paymentMethodCash: "Espèces",
    paymentMethodBankTransfer: "Virement bancaire",
    paymentMethodCheque: "Chèque",
    paymentMethodOther: "Autre",
  },
  ar: {
    eyebrow: "إعدادات النظام",
    title: "الإعدادات",
    description: "قم بتهيئة الخيارات الأساسية المستخدمة في مذبح حبريح للدواجن.",
    back: "العودة إلى لوحة التحكم",
    saved: "تم الحفظ",
    local: "الإعدادات المحلية",
    sectionGeneral: "عام",
    sectionMasterData: "البيانات الرئيسية",
    sectionPurchasing: "المشتريات",
  sectionInvoice: "الفوترة",
  sectionAppearance: "المظهر",
  sectionAbout: "حول",
  language: "اللغة",
  languageDescription: "اختر لغة التطبيق.",
    english: "الإنجليزية",
    french: "الفرنسية",
    arabic: "العربية",
    currency: "العملة الرئيسية",
    currencyDescription: "العملة المستخدمة في جميع أنحاء التطبيق.",
    dinar: "دج — الدينار الجزائري",
    euro: "€ — اليورو",
    dollar: "$ — الدولار الأمريكي",
    customerTypes: "أنواع العملاء",
    customerTypesDescription: "إدارة فئات العملاء المستخدمة في النظام.",
    workerPositions: "مناصب العمال",
    workerPositionsDescription: "إدارة مناصب ورتب العمال.",
    vehicleTypes: "أنواع المركبات",
    vehicleTypesDescription: "إدارة فئات المركبات المستخدمة في النظام.",
    purchaseInjury: "معايير المشتريات / الإصابات",
    purchaseInjuryDescription: "إدارة معادلات الإصابات المستخدمة في حسابات المشتريات.",
    expenseTypes: "أنواع المصاريف",
    expenseTypesDescription: "إدارة فئات المصاريف المستخدمة في النظام.",
    addCustomerType: "إضافة نوع عميل",
    addWorkerPosition: "إضافة منصب عامل",
    addVehicleType: "إضافة نوع مركبة",
    addExpenseType: "إضافة نوع مصروف",
    add: "إضافة",
    empty: "لا توجد عناصر مهيأة",
    product: "المنتج",
    equationName: "اسم المعيار",
    equation: "المعادلة",
    enabled: "مفعّل",
    disabled: "معطّل",
    createEquation: "إضافة المعيار",
    noEquations: "لا توجد معايير إصابات مهيأة",
    delete: "حذف",
    searchPlaceholder: "البحث في الإعدادات...",
    aboutTitle: "Hebrih Slaughter House",
    aboutDescription: "نظام إدارة عمليات ذبح الدواجن.",
    aboutVersion: "الإصدار",
    aboutDetails: "يتم تخزين جميع الإعدادات محلياً ومزامنتها مع الخادم عند توفره.",
    invoiceTitle: "الفوترة",
    invoiceDesc: "إدارة الكيانات القانونية والضرائب والترقيم ومظهر الفاتورة.",
    invoiceSellerProfiles: "ملفات البائع",
    invoiceSellerProfilesDesc: "كيانات HEBRIH المخوّلة لإصدار الفواتير",
    invoiceTaxProfiles: "الملفات الضريبية",
    invoiceTaxProfilesDesc: "الضريبة وأنواع الرسوم المطبقة على السطور",
    invoicePaymentMethods: "طرق الدفع",
    invoicePaymentMethodsDesc: "التحكم في طرق الدفع الظاهرة في الفاتورة",
    invoiceNumbering: "الترقيم",
    invoiceNumberingDesc: "التسلسل والبادئة وعدد الخانات لكل بائع",
    invoiceDocumentDefaults: "الإعدادات الافتراضية للمستند",
    invoiceDocumentDefaultsDesc: "اللغة والعملة وحقول الظهور في الفاتورة المطبوعة",
    edit: "تعديل",
    notConfigured: "غير مُهيأ",
    commercialName: "الاسم التجاري",
    legalDenomination: "التسمية القانونية",
    legalForm: "الشكل القانوني",
    activity: "النشاط",
    registeredAddress: "العنوان",
    city: "المدينة",
    wilaya: "الولاية",
    rc: "السجل التجاري",
    nif: "NIF",
    nis: "NIS",
    shareCapital: "رأس المال",
    phone: "الهاتف",
    email: "البريد",
    fax: "الفاكس",
    bankName: "البنك",
    bankAccount: "الحساب البنكي",
    rib: "RIB",
    invoicePrefix: "بادئة الفاتورة",
    nextInvoiceNumber: "الرقم التالي",
    paddingLength: "طول التعبئة",
    yearResetPolicy: "سياسة التصفير السنوي",
    yearResetNever: "أبداً",
    yearResetYearly: "سنوي",
    defaultTaxProfile: "الملف الضريبي الافتراضي",
    defaultPaymentTerms: "طريقة الدفع الافتراضية",
    defaultPaymentMethodId: "طريقة الدفع الافتراضية",
    defaultCurrency: "العملة الافتراضية",
    logo: "الشعار",
    stampImage: "الختم",
    vatRate: "نسبة الضريبة",
    otherTaxRate: "نسبة ضريبة أخرى",
    otherTaxLabel: "تسمية الضريبة الأخرى",
    code: "الرمز",
    nameLabel: "الاسم",
    prefix: "البادئة",
    nextNumber: "التالي",
    padding: "التعبئة",
    cash: "نقداً",
    bankTransfer: "تحويل بنكي",
    cheque: "شيك",
    other: "أخرى",
    addTaxProfile: "+ إضافة ملف ضريبي",
    addPaymentMethod: "+ إضافة طريقة دفع",
    defaultInvoiceLanguage: "لغة الفاتورة الافتراضية",
    showBankDetails: "إظهار البيانات البنكية",
    showRC: "إظهار السجل التجاري",
    showNIF: "إظهار NIF",
    showNIS: "إظهار NIS",
    showShareCapital: "إظهار رأس المال",
    showStamp: "إظهار الختم / التوقيع",
    save: "حفظ",
    cancel: "إلغاء",
    close: "إغلاق",
    identity: "الهوية",
    legal: "قانوني",
    contact: "اتصال",
    banking: "بنكي",
    numberingSection: "الترقيم",
    taxDefaults: "الضرائب / الافتراضي",
    branding: "العلامة",
    sellerProfileEdit: "تعديل ملف البائع",
    taxProfileEdit: "تعديل الملف الضريبي",
    addTaxProfileTitle: "إضافة ملف ضريبي",
    deleteTaxConfirm: "حذف هذا الملف الضريبي؟",
    deleteTaxDesc: "لا يمكن التراجع عن هذا الإجراء.",
    numberingSafetyError: "لا يمكن أن يكون الرقم التالي أقل من الفواتير المصدرة",
    enabledLabel: "مفعّل",
    disabledLabel: "معطّل",
    next: "التالي",
    customPaymentPlaceholder: "اسم طريقة الدفع",
    paymentMethodCash: "نقداً",
    paymentMethodBankTransfer: "تحويل بنكي",
    paymentMethodCheque: "شيك",
    paymentMethodOther: "أخرى",
  },
} as const;

type SectionId = "general" | "appearance" | "master-data" | "purchasing" | "invoice" | "about";

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  // PBS-BUG-017: synchronous mirror of the latest settings for concurrency-safe
  // partial updates. Written synchronously wherever `settings` state is set and
  // re-synced after every commit by the mirror effect below, so
  // `updateSettingsPartial` never needs an impure state updater and never reads
  // a stale render closure. This ref is never persisted and never dispatches.
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);
  // PBS-BUG-017: serialization chain for settings persistence. Each queued
  // snapshot is saved strictly in request order, so an older save can never
  // complete after (and clobber) a newer one.
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const [dark, setDark] = useState(() => {
    try {
      if (typeof window !== "undefined") return getSavedTheme() === "dark";
    } catch {}
    return false;
  });
  const [activeSection, setActiveSection] = useState<SectionId>("general");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [pendingChange, setPendingChange] = useState<
    | null
    | { type: "language"; oldValue: Language; newValue: Language }
    | { type: "currency"; oldValue: Currency; newValue: Currency }
  >(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [products, setProducts] = useState<
    Awaited<ReturnType<typeof productService.getAll>>
  >([]);

  const [injuryEquations, setInjuryEquations] = useState<
    Awaited<ReturnType<typeof injuryEquationService.getAll>>
  >([]);

  const t = TRANSLATIONS[settings.language];

  // PBS-BUG-017: backstop mirror sync. Writes the ref only -- never persists,
  // never dispatches -- so the ref always matches the latest committed state
  // before any discrete user event handler (which flushes passive effects first)
  // can call `updateSettingsPartial`.
  useEffect(() => {
    settingsRef.current = settings;
  });

  useEffect(() => {
    const readTheme = () => {
      setDark(getSavedTheme() === "dark");
    };
    readTheme();
    window.addEventListener("storage", readTheme);
    window.addEventListener("hebrih-theme-change", readTheme);
    return () => {
      window.removeEventListener("storage", readTheme);
      window.removeEventListener("hebrih-theme-change", readTheme);
    };
  }, []);

  const loadSettings = async () => {
    const stored = await settingsService.get();
    if (stored) {
      const normalized: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...stored,
        expenseTypes: stored.expenseTypes ?? [],
        navigationStyle: resolveNavigationStyle(stored.navigationStyle),
        rvbNavigationStyle: resolveRvbNavigationStyle(stored.rvbNavigationStyle),
      };
      setSettings(normalized);
      settingsRef.current = normalized;
      document.documentElement.lang = normalized.language;
      document.documentElement.dir = getDirection(normalized.language);
    } else {
      await settingsService.save(DEFAULT_SETTINGS);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  useDbSync(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    async function loadPurchaseParameters() {
      const [loadedProducts, loadedEquations] = await Promise.all([
        productService.getAll(),
        injuryEquationService.getAll(),
      ]);
      setProducts(loadedProducts);
      setInjuryEquations(loadedEquations);
    }
    loadPurchaseParameters();
  }, []);

  useEffect(() => {
    document.documentElement.lang = settings.language;
    document.documentElement.dir = getDirection(settings.language);
  }, [settings.language]);

  // Sync activeSection with URL ?section=
  useEffect(() => {
    const section = searchParams.get("section") as SectionId | null;
    if (section && ["general", "appearance", "master-data", "purchasing", "invoice", "about"].includes(section)) {
      setActiveSection(section);
    } else if (!section) {
      // No param → default to general without pushing
      setActiveSection("general");
    } else {
      setActiveSection("general");
    }
  }, [searchParams]);

  function navigateSection(section: SectionId) {
    setActiveSection(section);
    setSearchQuery("");
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", section);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Ctrl+K to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function updateSettings(nextSettings: AppSettings) {
    setSettings(nextSettings);
    document.documentElement.lang = nextSettings.language;
    document.documentElement.dir = getDirection(nextSettings.language);
    settingsService
      .save(nextSettings)
      .then(() => {
        window.dispatchEvent(
          new CustomEvent(SETTINGS_EVENT, {
            detail: nextSettings,
          })
        );
      })
      .catch((error) => {
        console.error("Failed to save settings:", error);
      });
  }

  // PBS-BUG-017: persists one committed settings snapshot, then notifies the app.
  // Runs exclusively on the serialization chain (see `queueSettingsPersistence`),
  // never inside a React state updater.
  async function persistSettingsSnapshot(nextSettings: AppSettings): Promise<void> {
    await settingsService.save(nextSettings);
    window.dispatchEvent(
      new CustomEvent(SETTINGS_EVENT, {
        detail: nextSettings,
      })
    );
  }

  // PBS-BUG-017: queues a snapshot for persistence strictly in request order.
  // The chain never stays rejected, so one failed save cannot block later ones;
  // each failure is logged exactly once and (as before) dispatches no event.
  function queueSettingsPersistence(nextSettings: AppSettings): void {
    const previous = saveChainRef.current.catch(() => {});
    const current = previous.then(() => persistSettingsSnapshot(nextSettings));
    saveChainRef.current = current.catch(() => {});
    current.catch((error) => {
      console.error("Failed to save settings:", error);
    });
  }

  function updateSettingsPartial(partial: Partial<AppSettings>) {
    // PBS-BUG-017: pure state update -- no save, no dispatch, no DOM write inside
    // an updater. `settingsRef` is synchronously advanced here (and mirrors the
    // latest committed state everywhere else), so rapid successive partials chain
    // without loss and without a stale render closure.
    const next = { ...settingsRef.current, ...partial } as AppSettings;
    settingsRef.current = next;
    setSettings(next);
    document.documentElement.lang = next.language;
    document.documentElement.dir = getDirection(next.language);
    queueSettingsPersistence(next);
  }

  function toggleRow(key: string) {
    setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleTheme() {
    const next = getSavedTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    setDark(next === "dark");
  }

  function handleLanguageSelect(newLang: Language) {
    if (newLang === settings.language) return;
    setPendingChange({ type: "language", oldValue: settings.language, newValue: newLang });
  }

  function handleCurrencySelect(newCurrency: Currency) {
    if (newCurrency === settings.currency) return;
    setPendingChange({ type: "currency", oldValue: settings.currency, newValue: newCurrency });
  }

  function handleCancelPending() {
    setPendingChange(null);
    setConfirmLoading(false);
  }

  async function handleConfirmPending() {
    if (!pendingChange || confirmLoading) return;
    setConfirmLoading(true);
    try {
      const nextSettings: AppSettings =
        pendingChange.type === "language"
          ? { ...settings, language: pendingChange.newValue }
          : { ...settings, currency: pendingChange.newValue };
      await settingsService.save(nextSettings);
      setSettings(nextSettings);
      settingsRef.current = nextSettings;
      document.documentElement.lang = nextSettings.language;
      document.documentElement.dir = getDirection(nextSettings.language);
      window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: nextSettings }));
      setPendingChange(null);
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setConfirmLoading(false);
      setPendingChange(null);
    }
  }

  const onConfirm = handleConfirmPending;
  const onCancel = handleCancelPending;

  function getLanguageLabel(lang: Language): string {
    if (lang === "fr") return t.french === "Français" ? "Français" : lang;
    if (lang === "ar") return t.arabic;
    return t.english;
    // Fallback to raw mapping for consistent display in modal
  }

  function getCurrencyLabel(cur: Currency): string {
    if (cur === "€") return t.euro;
    if (cur === "$") return t.dollar;
    return t.dinar;
  }

  const appearanceLabel = settings.language === "fr" ? "Apparence" : settings.language === "ar" ? "المظهر" : "Appearance";
  const sections: { id: SectionId; label: string; icon: LucideIcon; description: string }[] = [
    { id: "general", label: t.sectionGeneral === "GENERAL" ? "General" : t.sectionGeneral === "GÉNÉRAL" ? "Général" : "عام", icon: SettingsIcon, description: "General" },
    { id: "appearance", label: appearanceLabel, icon: Palette, description: "Appearance" },
    { id: "master-data", label: t.sectionMasterData, icon: Database, description: "Master Data" },
    { id: "purchasing", label: t.sectionPurchasing, icon: ShoppingCart, description: "Purchasing" },
    { id: "invoice", label: t.sectionInvoice, icon: Receipt, description: "Invoice" },
    { id: "about", label: t.sectionAbout, icon: Info, description: "About" },
  ];

  // For display, use translated labels
  const navItems = [
    { id: "general" as SectionId, label: settings.language === "fr" ? "Général" : settings.language === "ar" ? "عام" : "General", icon: SettingsIcon },
    { id: "appearance" as SectionId, label: appearanceLabel, icon: Palette },
    { id: "master-data" as SectionId, label: settings.language === "fr" ? "Données de base" : settings.language === "ar" ? "البيانات الرئيسية" : "Master Data", icon: Database },
    { id: "purchasing" as SectionId, label: settings.language === "fr" ? "Achats" : settings.language === "ar" ? "المشتريات" : "Purchasing", icon: ShoppingCart },
    { id: "invoice" as SectionId, label: settings.language === "fr" ? "Facturation" : settings.language === "ar" ? "الفوترة" : "Invoice", icon: Receipt },
    { id: "about" as SectionId, label: settings.language === "fr" ? "À propos" : settings.language === "ar" ? "حول" : "About", icon: Info },
  ];

  const allRows = useMemo(() => {
    return [
      { key: "language", section: "general" as SectionId, title: t.language, description: t.languageDescription, keywords: "language langue اللغة general" },
      { key: "currency", section: "general" as SectionId, title: t.currency, description: t.currencyDescription, keywords: "currency devise عملة general" },
      { key: "appearance", section: "appearance" as SectionId, title: appearanceLabel, description: "appearance theme thème المظهر", keywords: "appearance theme dark light navigation sidebar floating bubbles thème clair sombre المظهر تنقل" },
      { key: "customerTypes", section: "master-data" as SectionId, title: t.customerTypes, description: t.customerTypesDescription, keywords: "customer client عميل master data" },
      { key: "workerPositions", section: "master-data" as SectionId, title: t.workerPositions, description: t.workerPositionsDescription, keywords: "worker position poste عامل master data" },
      { key: "vehicleTypes", section: "master-data" as SectionId, title: t.vehicleTypes, description: t.vehicleTypesDescription, keywords: "vehicle voiture مركبة master data" },
      { key: "expenseTypes", section: "master-data" as SectionId, title: t.expenseTypes, description: t.expenseTypesDescription, keywords: "expense dépense مصروف master data" },
      { key: "purchaseInjury", section: "purchasing" as SectionId, title: t.purchaseInjury, description: t.purchaseInjuryDescription, keywords: "purchase injury achat blessure شراء إصابة purchasing" },
      { key: "about", section: "about" as SectionId, title: t.aboutTitle, description: t.aboutDescription, keywords: "about à propos حول" },
    ];
  }, [t, appearanceLabel]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    return allRows.filter((row) => {
      const hay = `${row.title} ${row.description} ${row.keywords} ${row.section}`.toLowerCase();
      return hay.includes(q);
    });
  }, [searchQuery, allRows]);

  const isSearching = !!searchQuery.trim();

  return (
    <main className={`${styles.settingsPage} ${dark ? styles.themeDark : styles.themeLight}`}>
      <div className={styles.settingsLayout}>
        {/* LEFT: Settings Navigation */}
        <aside className={styles.settingsNav} aria-label="Settings navigation">
          <div className={styles.brandBlock}>
            <div className={styles.brandLogo} aria-hidden="true">
              <img src="/chicken.jpg" alt="Hebrih logo" />
            </div>
            <div className={styles.brandText}>
              <strong>Hebrih Slaughter House</strong>
              <span>Management System</span>
            </div>
          </div>

          <div className={styles.searchWrap}>
            <Search size={16} strokeWidth={2} aria-hidden="true" className={styles.searchIcon} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
              aria-label="Search settings"
            />
            <span className={styles.searchHint} aria-hidden="true">Ctrl + K</span>
          </div>

          <nav className={styles.navList} aria-label="Settings sections">
            {navItems.map((item) => {
              const isActive = !isSearching && activeSection === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                  onClick={() => navigateSection(item.id)}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className={styles.navIcon} aria-hidden="true">
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  <span className={styles.navLabel}>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* RIGHT: Main Content */}
        <section className={styles.settingsMain}>
          <header className={styles.mainHeader}>
            <div className={styles.mainHeaderLeft}>
              <div className={styles.breadcrumb}>
                <Home size={14} strokeWidth={2} aria-hidden="true" />
                <span>Home</span>
                <ChevronRight size={12} strokeWidth={2} aria-hidden="true" />
                <span>Settings</span>
              </div>
              <h1>{t.title}</h1>
              <p>{t.description}</p>
            </div>
            <div className={styles.mainHeaderRight}>
              <button type="button" className={styles.backButton} onClick={() => router.push("/")}>
                <span aria-hidden="true">
                  {settings.language === "ar" ? <ArrowRight size={16} strokeWidth={2} /> : <ArrowLeft size={16} strokeWidth={2} />}
                </span>
                {t.back}
              </button>
              <button
                type="button"
                className={styles.themeToggle}
                onClick={toggleTheme}
                aria-label="Toggle theme"
                title={dark ? "Switch to light mode" : "Switch to dark mode"}
              >
                {dark ? <Sun size={18} strokeWidth={2} aria-hidden="true" /> : <Moon size={18} strokeWidth={2} aria-hidden="true" />}
              </button>
              <DateTimeDisplay language={settings.language} />
            </div>
          </header>

          <div className={styles.mainContent}>
            {isSearching ? (
              <>
                <h2 className={styles.sectionHeading}>SEARCH RESULTS</h2>
                <div className={styles.rowsStack}>
                  {filteredRows && filteredRows.length === 0 ? (
                    <div className={styles.emptySearch}>No settings found for &quot;{searchQuery}&quot;</div>
                  ) : (
                    filteredRows?.map((row) => {
                      const sectionLabel = navItems.find((n) => n.id === row.section)?.label ?? row.section;
                      if (row.key === "language") {
                        return (
                          <SettingSelectRow
                            key={row.key}
                            icon={Languages}
                            title={row.title}
                            description={row.description}
                            sectionLabel={sectionLabel}
                            control={
                              <StyledSelect
                                value={settings.language}
                                onChange={(v) => handleLanguageSelect(v as Language)}
                                ariaLabel={t.language}
                                options={[
                                  { value: "en", label: "English" },
                                  { value: "fr", label: "Français" },
                                  { value: "ar", label: "العربية" },
                                ]}
                              />
                            }
                          />
                        );
                      }
                      if (row.key === "currency") {
                        return (
                          <SettingSelectRow
                            key={row.key}
                            icon={Banknote}
                            title={row.title}
                            description={row.description}
                            sectionLabel={sectionLabel}
                            control={
                              <StyledSelect
                                value={settings.currency}
                                onChange={(v) => handleCurrencySelect(v as Currency)}
                                ariaLabel={t.currency}
                                options={[
                                  { value: "DA", label: "DA — Algerian Dinar" },
                                  { value: "€", label: "€ — Euro" },
                                  { value: "$", label: "$ — US Dollar" },
                                ]}
                              />
                            }
                          />
                        );
                      }
                      if (row.key === "appearance") {
                        return (
                          <div
                            key={row.key}
                            className={styles.settingRow}
                            onClick={() => navigateSection("appearance")}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                navigateSection("appearance");
                              }
                            }}
                            style={{ cursor: "pointer" }}
                          >
                            <div className={styles.rowMain}>
                              <div className={styles.rowIcon} aria-hidden="true">
                                <Palette size={22} strokeWidth={2} />
                              </div>
                              <div className={styles.rowText}>
                                <span className={styles.rowSectionLabel}>{sectionLabel}</span>
                                <strong>{row.title}</strong>
                                <span>{row.description}</span>
                              </div>
                            </div>
                            <span className={styles.rowChevron} aria-hidden="true">
                              <ChevronRight size={18} strokeWidth={2} />
                            </span>
                          </div>
                        );
                      }
                      if (row.key === "customerTypes") {
                        return (
                          <SettingNavigationRow
                            key={row.key}
                            icon={Database}
                            title={row.title}
                            description={row.description}
                            sectionLabel={sectionLabel}
                            expanded={!!expandedRows[row.key]}
                            onToggle={() => toggleRow(row.key)}
                          >
                            <ListManager
                              items={settings.customerTypes}
                              placeholder={t.addCustomerType}
                              emptyText={t.empty}
                              addText={t.add}
                              onChange={(items) => updateSettingsPartial({ customerTypes: items })}
                            />
                          </SettingNavigationRow>
                        );
                      }
                      if (row.key === "workerPositions") {
                        return (
                          <SettingNavigationRow
                            key={row.key}
                            icon={Briefcase}
                            title={row.title}
                            description={row.description}
                            sectionLabel={sectionLabel}
                            expanded={!!expandedRows[row.key]}
                            onToggle={() => toggleRow(row.key)}
                          >
                            <ListManager
                              items={settings.workerPositions}
                              placeholder={t.addWorkerPosition}
                              emptyText={t.empty}
                              addText={t.add}
                              onChange={(items) => updateSettingsPartial({ workerPositions: items })}
                            />
                          </SettingNavigationRow>
                        );
                      }
                      if (row.key === "vehicleTypes") {
                        return (
                          <SettingNavigationRow
                            key={row.key}
                            icon={CarFront}
                            title={row.title}
                            description={row.description}
                            sectionLabel={sectionLabel}
                            expanded={!!expandedRows[row.key]}
                            onToggle={() => toggleRow(row.key)}
                          >
                            <ListManager
                              items={settings.vehicleTypes}
                              placeholder={t.addVehicleType}
                              emptyText={t.empty}
                              addText={t.add}
                              onChange={(items) => updateSettingsPartial({ vehicleTypes: items })}
                            />
                          </SettingNavigationRow>
                        );
                      }
                      if (row.key === "expenseTypes") {
                        return (
                          <SettingNavigationRow
                            key={row.key}
                            icon={Receipt}
                            title={row.title}
                            description={row.description}
                            sectionLabel={sectionLabel}
                            expanded={!!expandedRows[row.key]}
                            onToggle={() => toggleRow(row.key)}
                          >
                            <ListManager
                              items={settings.expenseTypes}
                              placeholder={t.addExpenseType}
                              emptyText={t.empty}
                              addText={t.add}
                              onChange={(items) => updateSettingsPartial({ expenseTypes: items })}
                            />
                          </SettingNavigationRow>
                        );
                      }
                      if (row.key === "purchaseInjury") {
                        return (
                          <SettingNavigationRow
                            key={row.key}
                            icon={ShieldAlert}
                            title={row.title}
                            description={row.description}
                            sectionLabel={sectionLabel}
                            expanded={!!expandedRows[row.key]}
                            onToggle={() => toggleRow(row.key)}
                          >
                            <InjuryParameterManager
                              products={products}
                              equations={injuryEquations}
                              productText={t.product}
                              nameText={t.equationName}
                              equationText={t.equation}
                              enabledText={t.enabled}
                              disabledText={t.disabled}
                              addText={t.createEquation}
                              emptyText={t.noEquations}
                              deleteText={t.delete}
                              onCreated={(item) => setInjuryEquations((current) => [...current, item])}
                              onDeleted={(id) => setInjuryEquations((current) => current.filter((item) => item.id !== id))}
                            />
                          </SettingNavigationRow>
                        );
                      }
                      if (row.key === "about") {
                        return (
                          <div
                            key={row.key}
                            className={styles.settingRow}
                            onClick={() => navigateSection("about")}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                navigateSection("about");
                              }
                            }}
                            style={{ cursor: "pointer" }}
                          >
                            <div className={styles.rowMain}>
                              <div className={styles.rowIcon} aria-hidden="true">
                                <Info size={22} strokeWidth={2} />
                              </div>
                              <div className={styles.rowText}>
                                <span className={styles.rowSectionLabel}>{sectionLabel}</span>
                                <strong>{row.title}</strong>
                                <span>{row.description}</span>
                              </div>
                            </div>
                            <span className={styles.rowChevron} aria-hidden="true">
                              <ChevronRight size={18} strokeWidth={2} />
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })
                  )}
                </div>
              </>
            ) : activeSection === "general" ? (
              <>
                <h2 className={styles.sectionHeading}>{t.sectionGeneral}</h2>
                <div className={styles.card}>
                  <div className={styles.row}>
                    <div className={styles.rowText}>
                      <strong>
                        <Globe size={16} strokeWidth={2} aria-hidden="true" /> {t.language}
                      </strong>
                      <span>{t.languageDescription}</span>
                    </div>
                    <div style={{ minWidth: 180 }}>
                      <StyledSelect
                        value={settings.language}
                        onChange={(v) => handleLanguageSelect(v as Language)}
                        ariaLabel={t.language}
                        options={[
                          { value: "en", label: "English" },
                          { value: "fr", label: "Français" },
                          { value: "ar", label: "العربية" },
                        ]}
                      />
                    </div>
                  </div>
                  <div className={styles.divider} />
                  <div className={styles.row}>
                    <div className={styles.rowText}>
                      <strong>
                        <Banknote size={16} strokeWidth={2} aria-hidden="true" /> {t.currency}
                      </strong>
                      <span>{t.currencyDescription}</span>
                    </div>
                    <div style={{ minWidth: 180 }}>
                      <StyledSelect
                        value={settings.currency}
                        onChange={(v) => handleCurrencySelect(v as Currency)}
                        ariaLabel={t.currency}
                        options={[
                          { value: "DA", label: "DA — Algerian Dinar" },
                          { value: "€", label: "€ — Euro" },
                          { value: "$", label: "$ — US Dollar" },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : activeSection === "appearance" ? (
              <>
                <ThemeAppearanceSelector language={settings.language} dark={dark} onThemeChange={(v) => setDark(v === "dark")} />
                <div style={{ height: 20 }} aria-hidden="true" />
                <NavigationStyleSelector
                  language={settings.language}
                  value={resolveNavigationStyle(settings.navigationStyle)}
                  onChange={(style: NavigationStyle) => updateSettingsPartial({ navigationStyle: style })}
                />
                <div style={{ height: 20 }} aria-hidden="true" />
                <NavigationStyleSelector
                  language={settings.language}
                  variant="rvb"
                  value={resolveRvbNavigationStyle(settings.rvbNavigationStyle)}
                  onChange={(style: NavigationStyle) => {
                    // Instant card feedback + Dexie coherence via the canonical
                    // partial path; authoritative RVB persistence (account /
                    // local fallback) + live RvbShell switch via the RVB
                    // preferences service event.
                    updateSettingsPartial({ rvbNavigationStyle: style });
                    rvbUiPreferencesService.setRvbNavigationStyle(style).catch((error) => {
                      console.error("Failed to save RVB navigation style:", error);
                    });
                  }}
                />
              </>
            ) : activeSection === "master-data" ? (
              <>
                <h2 className={styles.sectionHeading}>{t.sectionMasterData}</h2>
                <div className={styles.rowsStack}>
                  <SettingNavigationRow
                    icon={Database}
                    title={t.customerTypes}
                    description={t.customerTypesDescription}
                    expanded={!!expandedRows["customerTypes"]}
                    onToggle={() => toggleRow("customerTypes")}
                  >
                    <ListManager
                      items={settings.customerTypes}
                      placeholder={t.addCustomerType}
                      emptyText={t.empty}
                      addText={t.add}
                      onChange={(items) => updateSettingsPartial({ customerTypes: items })}
                    />
                  </SettingNavigationRow>
                  <SettingNavigationRow
                    icon={Briefcase}
                    title={t.workerPositions}
                    description={t.workerPositionsDescription}
                    expanded={!!expandedRows["workerPositions"]}
                    onToggle={() => toggleRow("workerPositions")}
                  >
                    <ListManager
                      items={settings.workerPositions}
                      placeholder={t.addWorkerPosition}
                      emptyText={t.empty}
                      addText={t.add}
                      onChange={(items) => updateSettingsPartial({ workerPositions: items })}
                    />
                  </SettingNavigationRow>
                  <SettingNavigationRow
                    icon={CarFront}
                    title={t.vehicleTypes}
                    description={t.vehicleTypesDescription}
                    expanded={!!expandedRows["vehicleTypes"]}
                    onToggle={() => toggleRow("vehicleTypes")}
                  >
                    <ListManager
                      items={settings.vehicleTypes}
                      placeholder={t.addVehicleType}
                      emptyText={t.empty}
                      addText={t.add}
                      onChange={(items) => updateSettingsPartial({ vehicleTypes: items })}
                    />
                  </SettingNavigationRow>
                  <SettingNavigationRow
                    icon={Receipt}
                    title={t.expenseTypes}
                    description={t.expenseTypesDescription}
                    expanded={!!expandedRows["expenseTypes"]}
                    onToggle={() => toggleRow("expenseTypes")}
                  >
                    <ListManager
                      items={settings.expenseTypes}
                      placeholder={t.addExpenseType}
                      emptyText={t.empty}
                      addText={t.add}
                      onChange={(items) => updateSettingsPartial({ expenseTypes: items })}
                    />
                  </SettingNavigationRow>
                </div>
              </>
            ) : activeSection === "purchasing" ? (
              <>
                <h2 className={styles.sectionHeading}>{t.sectionPurchasing}</h2>
                <div className={styles.rowsStack}>
                  <SettingNavigationRow
                    icon={ShieldAlert}
                    title={t.purchaseInjury}
                    description={t.purchaseInjuryDescription}
                    expanded={!!expandedRows["purchaseInjury"]}
                    onToggle={() => toggleRow("purchaseInjury")}
                  >
                    <InjuryParameterManager
                      products={products}
                      equations={injuryEquations}
                      productText={t.product}
                      nameText={t.equationName}
                      equationText={t.equation}
                      enabledText={t.enabled}
                      disabledText={t.disabled}
                      addText={t.createEquation}
                      emptyText={t.noEquations}
                      deleteText={t.delete}
                      onCreated={(item) => setInjuryEquations((current) => [...current, item])}
                      onDeleted={(id) => setInjuryEquations((current) => current.filter((item) => item.id !== id))}
                    />
                  </SettingNavigationRow>
                </div>
              </>
            ) : activeSection === "invoice" ? (
              <InvoiceSettingsSection t={t} language={settings.language} currency={settings.currency} />
            ) : activeSection === "about" ? (
              <>
                <h2 className={styles.sectionHeading}>{t.sectionAbout}</h2>
                <div className={styles.rowsStack}>
                  {/* Hero */}
                  <div className={styles.aboutHero}>
                    <div className={styles.aboutHeroLogo} aria-hidden="true">
                      <img src="/chicken.jpg" alt="Hebrih logo" />
                    </div>
                    <div className={styles.aboutHeroText}>
                      <h3>Hebrih Slaughter House</h3>
                      <span>Management System</span>
                      <small>Version 1.1.0</small>
                    </div>
                  </div>

                  {/* APPLICATION */}
                  <h3 className={styles.subSectionHeading}>APPLICATION</h3>
                  <div className={styles.infoRows}>
                    <div className={styles.infoRow}>
                      <div className={styles.infoRowLeft}>
                        <div className={styles.rowIcon} aria-hidden="true"><Info size={18} strokeWidth={2} /></div>
                        <div className={styles.rowText}><strong>Product</strong><span>Hebrih Slaughter House Management System</span></div>
                      </div>
                      <span className={styles.infoValue}>Hebrih Slaughter House</span>
                    </div>
                    <div className={styles.infoRow}>
                      <div className={styles.infoRowLeft}>
                        <div className={styles.rowIcon} aria-hidden="true"><Info size={18} strokeWidth={2} /></div>
                        <div className={styles.rowText}><strong>Version</strong><span>Current release</span></div>
                      </div>
                      <span className={styles.infoValue}>1.1.0</span>
                    </div>
                  </div>

                  {/* SYSTEM */}
                  <h3 className={styles.subSectionHeading}>SYSTEM</h3>
                  <div className={styles.infoRows}>
                    <div className={styles.infoRow}>
                      <div className={styles.infoRowLeft}>
                        <div className={styles.rowIcon} aria-hidden="true"><Database size={18} strokeWidth={2} /></div>
                        <div className={styles.rowText}><strong>Application Mode</strong><span>Offline-first operation</span></div>
                      </div>
                      <span className={styles.infoValue}>Offline-first</span>
                    </div>
                    <div className={styles.infoRow}>
                      <div className={styles.infoRowLeft}>
                        <div className={styles.rowIcon} aria-hidden="true"><ShoppingCart size={18} strokeWidth={2} /></div>
                        <div className={styles.rowText}><strong>Data Storage</strong><span>Local data with backend synchronization</span></div>
                      </div>
                      <span className={styles.infoValue}>Local + Sync</span>
                    </div>
                  </div>

                  {/* LANGUAGE & REGION */}
                  <h3 className={styles.subSectionHeading}>LANGUAGE & REGION</h3>
                  <div className={styles.infoRows}>
                    <button type="button" className={styles.infoRowClickable} onClick={() => navigateSection("general")}>
                      <div className={styles.infoRowLeft}>
                        <div className={styles.rowIcon} aria-hidden="true"><Languages size={18} strokeWidth={2} /></div>
                        <div className={styles.rowText}><strong>{t.language}</strong><span>{t.languageDescription}</span></div>
                      </div>
                      <span className={styles.infoValue}>{getLanguageLabel(settings.language)} <ChevronRight size={14} strokeWidth={2} aria-hidden="true" /></span>
                    </button>
                    <button type="button" className={styles.infoRowClickable} onClick={() => navigateSection("general")}>
                      <div className={styles.infoRowLeft}>
                        <div className={styles.rowIcon} aria-hidden="true"><Banknote size={18} strokeWidth={2} /></div>
                        <div className={styles.rowText}><strong>{t.currency}</strong><span>{t.currencyDescription}</span></div>
                      </div>
                      <span className={styles.infoValue}>{getCurrencyLabel(settings.currency)} <ChevronRight size={14} strokeWidth={2} aria-hidden="true" /></span>
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </section>
      </div>

      {pendingChange && (
        <SettingChangeConfirmModal
          pending={pendingChange}
          t={t}
          loading={confirmLoading}
          onConfirm={onConfirm}
          onCancel={onCancel}
          getLanguageLabel={getLanguageLabel}
          getCurrencyLabel={getCurrencyLabel}
        />
      )}
    </main>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className={styles.settingsPage}><div className={styles.settingsLayout}><div>Loading settings...</div></div></div>}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingChangeConfirmModal({
  pending,
  t,
  loading,
  onConfirm,
  onCancel,
  getLanguageLabel,
  getCurrencyLabel,
}: {
  pending: { type: "language"; oldValue: Language; newValue: Language } | { type: "currency"; oldValue: Currency; newValue: Currency };
  t: (typeof TRANSLATIONS)[keyof typeof TRANSLATIONS];
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  getLanguageLabel: (lang: Language) => string;
  getCurrencyLabel: (cur: Currency) => string;
}) {
  const isLanguage = pending.type === "language";
  const title = isLanguage ? "Change application language?" : "Change global currency?";
  const description = isLanguage
    ? "This will change the language used throughout Hebrih Slaughter House."
    : "This will change the currency displayed throughout Hebrih Slaughter House.";
  const settingLabel = isLanguage ? t.language : t.currency;
  const oldLabel = isLanguage ? getLanguageLabel(pending.oldValue as Language) : getCurrencyLabel(pending.oldValue as Currency);
  const newLabel = isLanguage ? getLanguageLabel(pending.newValue as Language) : getCurrencyLabel(pending.newValue as Currency);
  const confirmLabel = isLanguage ? "Change Language" : "Change Currency";
  const Icon = isLanguage ? Languages : Banknote;

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onCancel]);

  return (
    <div className={styles.confirmBackdrop} onClick={onCancel} role="presentation">
      <div
        className={styles.confirmModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.confirmHeader}>
          <div className={styles.confirmIcon} aria-hidden="true">
            <Icon size={20} strokeWidth={2} />
          </div>
          <h2 id="confirm-title">{title}</h2>
          <button type="button" className={styles.confirmClose} onClick={onCancel} aria-label="Close">
            <X size={16} strokeWidth={2} />
          </button>
        </div>
        <p className={styles.confirmDescription}>{description}</p>

        <div className={styles.changeCard}>
          <span className={styles.changeLabel}>{settingLabel}</span>
          <div className={styles.changeValues}>
            <span className={styles.oldValue}>{oldLabel}</span>
            <span className={styles.changeArrow} aria-hidden="true">↓</span>
            <span className={styles.newValue}>{newLabel}</span>
          </div>
          {!isLanguage && (
            <p className={styles.changeNote}>Existing monetary amounts will not be converted.</p>
          )}
        </div>

        <div className={styles.confirmActions}>
          <button type="button" className={styles.cancelButton} onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button type="button" className={styles.confirmButton} onClick={onConfirm} disabled={loading}>
            {loading ? "Changing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingSelectRow({
  icon: Icon,
  title,
  description,
  control,
  sectionLabel,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  control: React.ReactNode;
  sectionLabel?: string;
}) {
  return (
    <div className={styles.settingRow}>
      <div className={styles.rowMain}>
        <div className={styles.rowIcon} aria-hidden="true">
          <Icon size={22} strokeWidth={2} />
        </div>
        <div className={styles.rowText}>
          {sectionLabel && <span className={styles.rowSectionLabel}>{sectionLabel}</span>}
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
      </div>
      <div className={styles.rowControl}>{control}</div>
    </div>
  );
}

function SettingNavigationRow({
  icon: Icon,
  title,
  description,
  expanded,
  onToggle,
  children,
  sectionLabel,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  sectionLabel?: string;
}) {
  return (
    <div className={`${styles.settingRow} ${styles.settingRowNav} ${expanded ? styles.settingRowExpanded : ""}`}>
      <button type="button" className={styles.rowButton} onClick={onToggle} aria-expanded={expanded}>
        <div className={styles.rowMain}>
          <div className={styles.rowIcon} aria-hidden="true">
            <Icon size={22} strokeWidth={2} />
          </div>
          <div className={styles.rowText}>
            {sectionLabel && <span className={styles.rowSectionLabel}>{sectionLabel}</span>}
            <strong>{title}</strong>
            <span>{description}</span>
          </div>
        </div>
        <span className={styles.rowChevron} aria-hidden="true">
          <ChevronRight size={18} strokeWidth={2} className={expanded ? styles.chevronRotated : ""} />
        </span>
      </button>
      <div className={`${styles.rowExpand} ${expanded ? styles.rowExpandOpen : ""}`}>
        <div className={styles.rowExpandInner}>{children}</div>
      </div>
    </div>
  );
}

function ListManager({
  items,
  placeholder,
  emptyText,
  addText,
  onChange,
}: {
  items: string[];
  placeholder: string;
  emptyText: string;
  addText: string;
  onChange: (items: string[]) => void;
}) {
  const [value, setValue] = useState("");
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);

  function addItem() {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (items.includes(trimmed)) {
      setValue("");
      return;
    }
    onChange([...items, trimmed]);
    setValue("");
  }

  function handleEdit(item: string) {
    setEditingItem(item);
    setEditingValue(item);
  }

  function handleCancelEdit() {
    setEditingItem(null);
    setEditingValue("");
  }

  function handleSaveEdit() {
    if (editingItem === null) return;
    const trimmed = editingValue.trim();
    if (!trimmed) return;
    if (trimmed !== editingItem && items.includes(trimmed)) return;
    onChange(items.map((it) => (it === editingItem ? trimmed : it)));
    setEditingItem(null);
    setEditingValue("");
  }

  function handleDeleteConfirm() {
    if (deleteCandidate === null) return;
    onChange(items.filter((current) => current !== deleteCandidate));
    setDeleteCandidate(null);
  }

  function handleDeleteCancel() {
    setDeleteCandidate(null);
  }

  return (
    <div className={styles.listManager}>
      <div className={styles.addRow}>
        <input
          value={value}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addItem();
            }
          }}
        />
        <button type="button" onClick={addItem}>
          {addText}
        </button>
      </div>
      <div className={styles.items}>
        {items.length === 0 ? (
          <span className={styles.emptyList}>{emptyText}</span>
        ) : (
          items.map((item) => (
            <div className={styles.item} key={item}>
              {editingItem === item ? (
                <>
                  <input
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSaveEdit();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        handleCancelEdit();
                      }
                    }}
                    autoFocus
                    className={styles.editInput}
                  />
                  <div className={styles.itemActions}>
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      aria-label={`Save ${item}`}
                      className={styles.saveButton}
                      disabled={!editingValue.trim() || (editingValue.trim() !== item && items.includes(editingValue.trim()))}
                    >
                      <Check size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      aria-label="Cancel edit"
                      className={styles.cancelEditButton}
                    >
                      <X size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span>{item}</span>
                  <div className={styles.itemActions}>
                    <button
                      type="button"
                      onClick={() => handleEdit(item)}
                      aria-label={`Edit ${item}`}
                      className={styles.editButton}
                    >
                      <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteCandidate(item)}
                      aria-label={`Delete ${item}`}
                      className={styles.deleteButton}
                    >
                      <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {deleteCandidate !== null && (
        <div className={styles.confirmBackdrop} onClick={handleDeleteCancel} role="presentation">
          <div
            className={styles.confirmModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.confirmHeader}>
              <div className={`${styles.confirmIcon} ${styles.confirmIconDanger}`} aria-hidden="true">
                <Trash2 size={20} strokeWidth={2} />
              </div>
              <h2 id="delete-confirm-title">Are you sure you want to delete this item?</h2>
              <button type="button" className={styles.confirmClose} onClick={handleDeleteCancel} aria-label="Close">
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <p className={styles.confirmDescription}>
              This will permanently remove <strong>{deleteCandidate}</strong> from the list.
            </p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.cancelButton} onClick={handleDeleteCancel}>
                Cancel
              </button>
              <button type="button" className={`${styles.confirmButton} ${styles.confirmButtonDanger}`} onClick={handleDeleteConfirm}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InjuryParameterManager({
  products,
  equations,
  productText,
  nameText,
  equationText,
  enabledText,
  disabledText,
  addText,
  emptyText,
  deleteText,
  onCreated,
  onDeleted,
}: {
  products: Awaited<ReturnType<typeof productService.getAll>>;
  equations: Awaited<ReturnType<typeof injuryEquationService.getAll>>;
  productText: string;
  nameText: string;
  equationText: string;
  enabledText: string;
  disabledText: string;
  addText: string;
  emptyText: string;
  deleteText: string;
  onCreated: (item: Awaited<ReturnType<typeof injuryEquationService.create>>) => void;
  onDeleted: (id: string) => void;
}) {
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [equation, setEquation] = useState("B = A");
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);

  async function createEquation() {
    if (!productId || !name.trim() || !equation.trim()) return;
    try {
      setBusy(true);
      const created = await injuryEquationService.create({
        productId,
        name: name.trim(),
        equation: equation.trim(),
        enabled,
      });
      onCreated(created);
      setName("");
      setEquation("B = A");
      setEnabled(true);
    } catch (error) {
      console.error("Failed to create injury parameter:", error);
    } finally {
      setBusy(false);
    }
  }

  async function deleteEquation(id: string) {
    try {
      await injuryEquationService.delete(id);
      onDeleted(id);
    } catch (error) {
      console.error("Failed to delete injury parameter:", error);
    }
  }

  function productName(pid: string) {
    return products.find((p) => p.id === pid)?.name ?? pid;
  }

  return (
    <div className={styles.parameterManager}>
      <div className={styles.parameterForm}>
        <StyledSelect
          value={productId}
          onChange={setProductId}
          ariaLabel={productText}
          placeholder={productText}
          options={products.map((product) => ({ value: product.id, label: product.name }))}
        />
        <input value={name} placeholder={nameText} onChange={(event) => setName(event.target.value)} />
        <input value={equation} placeholder={equationText} onChange={(event) => setEquation(event.target.value)} />
        <label className={styles.parameterEnabled}>
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          <span>{enabledText}</span>
        </label>
        <button type="button" onClick={createEquation} disabled={busy || !productId || !name.trim() || !equation.trim()}>
          {busy ? "..." : addText}
        </button>
      </div>
      <div className={styles.parameterList}>
        {equations.length === 0 ? (
          <span className={styles.emptyList}>{emptyText}</span>
        ) : (
          equations.map((item) => (
            <div className={styles.parameterItem} key={item.id}>
              <div className={styles.parameterInfo}>
                <strong>{item.name}</strong>
                <span>
                  {productName(item.productId)} · {item.equation}
                </span>
              </div>
              <div className={styles.parameterActions}>
                <span className={item.enabled ? styles.parameterEnabledBadge : styles.parameterDisabledBadge}>
                  {item.enabled ? enabledText : disabledText}
                </span>
                <button type="button" onClick={() => deleteEquation(item.id)} aria-label={`${deleteText} ${item.name}`}>
                  <X size={14} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function InvoiceSettingsSection({ t, language, currency }: { t: any; language: Language; currency: Currency }) {
  type Seller = import("../../src/types/entities/invoice-seller-profile").InvoiceSellerProfile;
  type Tax = import("../../src/types/entities/invoice-tax-profile").InvoiceTaxProfile;
  type Inv = import("../../src/types/entities/invoice").Invoice;

  const [sellerProfiles, setSellerProfiles] = useState<Seller[]>([]);
  const [taxProfiles, setTaxProfiles] = useState<Tax[]>([]);
  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingSeller, setEditingSeller] = useState<Seller | null>(null);
  const [showSellerModal, setShowSellerModal] = useState(false);
  const [sellerForm, setSellerForm] = useState<Partial<Seller>>({});
  const [sellerError, setSellerError] = useState("");

  const [editingTax, setEditingTax] = useState<Tax | null>(null);
  const [showTaxModal, setShowTaxModal] = useState(false);
  const [taxForm, setTaxForm] = useState<Partial<Tax>>({});
  const [deleteTaxId, setDeleteTaxId] = useState<string | null>(null);

  // Payment methods
  type PaymentMethod = { id: string; label: string; enabled: boolean; isCustom?: boolean };
  const defaultPayments: PaymentMethod[] = useMemo(() => [
    { id: "cash", label: "Cash", enabled: true },
    { id: "bank_transfer", label: "Bank transfer", enabled: true },
    { id: "cheque", label: "Cheque", enabled: true },
    { id: "other", label: "Other", enabled: true },
  ], []);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(defaultPayments);
  const [customPaymentName, setCustomPaymentName] = useState("");

  // Document defaults
  const [docDefaults, setDocDefaults] = useState({
    defaultInvoiceLanguage: language as Language,
    defaultCurrency: currency as Currency,
    showBankDetails: true,
    showRC: true,
    showNIF: true,
    showNIS: true,
    showCapital: true,
    showStamp: true,
  });

  // helpers
  const notConfigured = t.notConfigured as string;
  const formatNext = (seller: Seller) => {
    const n = seller.nextNumber ?? 1;
    const pad = seller.paddingLength ?? 6;
    return `${seller.invoicePrefix || ""}-${String(n).padStart(pad, "0")}`;
  };
  const getTaxName = (id?: string) => {
    if (!id) return notConfigured;
    const found = taxProfiles.find((x) => x.id === id);
    return found ? `${found.name} (${found.vatRate}%)` : notConfigured;
  };
  const displayValue = (v?: string | null) => (v && String(v).trim() ? String(v).trim() : notConfigured);

  const getMinNext = (sellerId: string) => {
    const related = invoices.filter((inv) => inv.sellerProfileId === sellerId && inv.status === "ISSUED");
    let max = 0;
    for (const inv of related) {
      if (typeof inv.sequenceNumber === "number" && inv.sequenceNumber > max) max = inv.sequenceNumber;
      else if (inv.invoiceNumber) {
        const m = inv.invoiceNumber.match(/-(\d+)$/);
        if (m) {
          const n = parseInt(m[1], 10);
          if (!isNaN(n) && n > max) max = n;
        }
      }
    }
    return max + 1;
  };

  const isBuiltInTax = (tax: Tax) => ["TVA19", "TVA17", "TVA9", "EXO", "HORS", "tax-19", "tax-17", "tax-9", "tax-0", "tax-outside"].includes(tax.code) || ["TVA 19%", "TVA 17%", "TVA 9%", "Exonéré", "Hors TVA"].includes(tax.name) || ["tax-19", "tax-17", "tax-9", "tax-0", "tax-outside"].includes(tax.id);

  const paymentLabel = (id: string) => {
    if (language === "fr") {
      if (id === "cash") return t.paymentMethodCash || "Espèces";
      if (id === "bank_transfer") return t.paymentMethodBankTransfer || "Virement bancaire";
      if (id === "cheque") return t.paymentMethodCheque || "Chèque";
      if (id === "other") return t.paymentMethodOther || "Autre";
    } else if (language === "ar") {
      if (id === "cash") return t.paymentMethodCash || "نقداً";
      if (id === "bank_transfer") return t.paymentMethodBankTransfer || "تحويل بنكي";
      if (id === "cheque") return t.paymentMethodCheque || "شيك";
      if (id === "other") return t.paymentMethodOther || "أخرى";
    }
    if (id === "cash") return t.paymentMethodCash || "Cash";
    if (id === "bank_transfer") return t.paymentMethodBankTransfer || "Bank transfer";
    if (id === "cheque") return t.paymentMethodCheque || "Cheque";
    if (id === "other") return t.paymentMethodOther || "Other";
    return id;
  };

  // Load
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { invoiceSellerProfileService } = await import("../../src/services/invoice-seller-profile.service");
        const { invoiceTaxProfileService } = await import("../../src/services/invoice-tax-profile.service");
        const { invoiceService } = await import("../../src/services/invoice.service");
        const { db } = await import("../../src/lib/database/db");

        const [sellersRaw, taxesRaw, invRaw] = await Promise.all([
          invoiceSellerProfileService.getAll().catch(() => [] as Seller[]),
          invoiceTaxProfileService.getAll().catch(() => [] as Tax[]),
          invoiceService.getAll().catch(() => [] as Inv[]),
        ]);

        // Ensure sellers: create defaults if empty, ensure TVA17 exists
        let sellers = sellersRaw as Seller[];
        let taxes = taxesRaw as Tax[];

        // Auto-create defaults if sellers empty (idempotent)
        if (sellers.length === 0) {
          const now = Date.now();
          const defaults: Seller[] = [
            { id: "seller-hsh", commercialName: "HEBRIH Slaughter House", legalDenomination: "", invoicePrefix: "HSH", nextNumber: 1, paddingLength: 6, yearResetPolicy: "never", enabled: true, createdAt: now, updatedAt: now, syncStatus: "pending" } as Seller,
            { id: "seller-hv", commercialName: "SARL HEBRIH Volaille", legalDenomination: "SARL HEBRIH Volaille", invoicePrefix: "HV", nextNumber: 1, paddingLength: 6, yearResetPolicy: "never", enabled: true, createdAt: now, updatedAt: now, syncStatus: "pending" } as Seller,
          ];
          for (const s of defaults) {
            try { await invoiceSellerProfileService.create(s as any); } catch {}
          }
          sellers = defaults;
        }

        // Ensure taxes: defaults + TVA17 guarantee
        if (taxes.length === 0) {
          const now = Date.now();
          const defaults: Tax[] = [
            { id: "tax-19", name: "TVA 19%", code: "TVA19", vatRate: 19, enabled: true, createdAt: now, updatedAt: now, syncStatus: "pending" } as Tax,
            { id: "tax-17", name: "TVA 17%", code: "TVA17", vatRate: 17, enabled: true, createdAt: now, updatedAt: now, syncStatus: "pending" } as Tax,
            { id: "tax-9", name: "TVA 9%", code: "TVA9", vatRate: 9, enabled: true, createdAt: now, updatedAt: now, syncStatus: "pending" } as Tax,
            { id: "tax-0", name: "Exonéré", code: "EXO", vatRate: 0, enabled: true, createdAt: now, updatedAt: now, syncStatus: "pending" } as Tax,
            { id: "tax-outside", name: "Hors TVA", code: "HORS", vatRate: 0, enabled: true, createdAt: now, updatedAt: now, syncStatus: "pending" } as Tax,
          ];
          for (const tx of defaults) {
            try { await invoiceTaxProfileService.create(tx as any); } catch {}
          }
          taxes = defaults;
        } else {
          const hasTva17 = taxes.some((t) => t.id === "tax-17" || t.code === "TVA17");
          if (!hasTva17) {
            const now = Date.now();
            const tva17: Tax = { id: "tax-17", name: "TVA 17%", code: "TVA17", vatRate: 17, enabled: true, createdAt: now, updatedAt: now, syncStatus: "pending" } as Tax;
            try { await invoiceTaxProfileService.create(tva17 as any); taxes = [...taxes, tva17]; } catch {}
          }
        }

        // Sort sellers: HSH first, then HV
        sellers = [...sellers].sort((a, b) => {
          if (a.id === "seller-hsh") return -1;
          if (b.id === "seller-hsh") return 1;
          if (a.id === "seller-hv") return -1;
          if (b.id === "seller-hv") return 1;
          return a.commercialName.localeCompare(b.commercialName);
        });

        // Sort taxes: predefined order
        const order: Record<string, number> = { TVA19: 0, TVA17: 1, TVA9: 2, EXO: 3, HORS: 4 };
        taxes = [...taxes].sort((a, b) => {
          const oa = order[a.code] ?? 99;
          const ob = order[b.code] ?? 99;
          if (oa !== ob) return oa - ob;
          return a.name.localeCompare(b.name);
        });

        // Load payment methods - canonical Settings ONLY, legacy is migration-only
        let pm: PaymentMethod[] | null = null;
        let pmIsLegacy = false;
        try {
          const s = await settingsService.get() as any;
          if (s?.invoicePaymentMethods && Array.isArray(s.invoicePaymentMethods) && s.invoicePaymentMethods.length > 0) {
            pm = s.invoicePaymentMethods;
          }
        } catch {}
        if (!pm) {
          try {
            const ls = typeof window !== "undefined" ? localStorage.getItem("hebrih_payment_methods") : null;
            if (ls) { pm = JSON.parse(ls); pmIsLegacy = true; }
          } catch {}
        }
        if (!pm) {
          try {
            const stored = await db.settings.get("hebrih_payment_methods" as any) as any;
            if (stored && Array.isArray(stored.data)) { pm = stored.data; pmIsLegacy = true; }
            else if (stored && Array.isArray(stored.value)) { pm = stored.value; pmIsLegacy = true; }
          } catch {}
        }
        let finalPm = pm && Array.isArray(pm) && pm.length > 0 ? pm : defaultPayments;
        // One-time migration: if legacy was used, save canonical and delete legacy
        if (pmIsLegacy && pm && pm.length > 0) {
          try {
            const s = await settingsService.get() as any;
            if (s) await settingsService.save({ ...s, invoicePaymentMethods: finalPm } as any);
            try { localStorage.removeItem("hebrih_payment_methods"); } catch {}
            try { await db.settings.delete("hebrih_payment_methods" as any); } catch {}
          } catch {}
        }
        // Ensure required ids exist
        const required = ["cash", "bank_transfer", "cheque", "other"];
        for (const rid of required) {
          if (!finalPm.find((p) => p.id === rid)) {
            const def = defaultPayments.find((d) => d.id === rid);
            if (def) finalPm.push(def);
          }
        }

        // Load doc defaults - canonical Settings ONLY, legacy is migration-only
        let dd: any = null;
        let ddIsLegacy = false;
        try {
          const s2 = await settingsService.get() as any;
          if (s2?.invoiceDocumentDefaults && typeof s2.invoiceDocumentDefaults === "object") {
            dd = s2.invoiceDocumentDefaults;
          }
        } catch {}
        if (!dd) {
          try {
            const ls2 = typeof window !== "undefined" ? localStorage.getItem("hebrih_document_defaults") : null;
            if (ls2) { dd = JSON.parse(ls2); ddIsLegacy = true; }
          } catch {}
        }
        if (!dd) {
          try {
            const stored2 = await db.settings.get("hebrih_document_defaults" as any) as any;
            if (stored2 && stored2.data) { dd = stored2.data; ddIsLegacy = true; }
            else if (stored2 && stored2.value) { dd = stored2.value; ddIsLegacy = true; }
            else if (stored2 && stored2.defaultCurrency) { dd = stored2; ddIsLegacy = true; }
          } catch {}
        }
        const finalDd = dd && typeof dd === "object" ? {
          defaultInvoiceLanguage: (dd.defaultInvoiceLanguage as Language) || language,
          defaultCurrency: (dd.defaultCurrency as Currency) || currency,
          showBankDetails: dd.showBankDetails ?? true,
          showRC: dd.showRC ?? true,
          showNIF: dd.showNIF ?? true,
          showNIS: dd.showNIS ?? true,
          showCapital: dd.showCapital ?? true,
          showStamp: dd.showStamp ?? true,
        } : {
          defaultInvoiceLanguage: language,
          defaultCurrency: currency,
          showBankDetails: true,
          showRC: true,
          showNIF: true,
          showNIS: true,
          showCapital: true,
          showStamp: true,
        };

        // One-time migration for doc defaults if legacy was used
        if (ddIsLegacy && dd) {
          try {
            const s = await settingsService.get() as any;
            if (s) await settingsService.save({ ...s, invoiceDocumentDefaults: finalDd } as any);
            try { localStorage.removeItem("hebrih_document_defaults"); } catch {}
            try { await db.settings.delete("hebrih_document_defaults" as any); } catch {}
          } catch {}
        }
        if (!cancelled) {
          setSellerProfiles(sellers);
          setTaxProfiles(taxes);
          setInvoices(invRaw as Inv[]);
          setPaymentMethods(finalPm);
          setDocDefaults(finalDd);
          setLoading(false);
        }
      } catch (e) {
        console.error("InvoiceSettings load failed", e);
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [language, currency, defaultPayments]);

  // Persist helpers — canonical Settings ONLY (legacy is migration-only)
  async function persistPayments(next: PaymentMethod[]) {
    setPaymentMethods(next);
    try {
      const { settingsService } = await import("../../src/services/settings.service");
      const s = await settingsService.get();
      if (s) {
        await settingsService.save({ ...s, invoicePaymentMethods: next as any } as any);
      }
      // One-time legacy cleanup
      try { localStorage.removeItem("hebrih_payment_methods"); } catch {}
      try {
        const { db } = await import("../../src/lib/database/db");
        await db.settings.delete("hebrih_payment_methods" as any);
      } catch {}
    } catch {}
  }

  async function persistDocDefaults(next: typeof docDefaults) {
    setDocDefaults(next);
    try {
      const { settingsService } = await import("../../src/services/settings.service");
      const s = await settingsService.get();
      if (s) await settingsService.save({ ...s, invoiceDocumentDefaults: next as any } as any);
      // One-time legacy cleanup
      try { localStorage.removeItem("hebrih_document_defaults"); } catch {}
      try {
        const { db } = await import("../../src/lib/database/db");
        await db.settings.delete("hebrih_document_defaults" as any);
      } catch {}
    } catch {}
  }

  function openEditSeller(seller: Seller) {
    setEditingSeller(seller);
    setSellerForm({ ...seller });
    setSellerError("");
    setShowSellerModal(true);
  }

  async function saveSeller() {
    if (!editingSeller) return;
    const form = sellerForm as Seller;
    if (!form.commercialName || !String(form.commercialName).trim()) {
      setSellerError(t.commercialName + " " + (language === "fr" ? "requis" : language === "ar" ? "مطلوب" : "required"));
      return;
    }
    if (!form.invoicePrefix || !String(form.invoicePrefix).trim()) {
      setSellerError(t.invoicePrefix + " " + (language === "fr" ? "requis" : language === "ar" ? "مطلوب" : "required"));
      return;
    }
    const min = getMinNext(editingSeller.id);
    if (typeof form.nextNumber === "number" && form.nextNumber < min) {
      setSellerError(t.numberingSafetyError);
      return;
    }
    try {
      const { invoiceSellerProfileService } = await import("../../src/services/invoice-seller-profile.service");
      const updates: Partial<Seller> = { ...form, updatedAt: Date.now() } as any;
      // Remove readonly fields like id, createdAt
      const { id, createdAt, syncStatus, ...rest } = updates as any;
      await invoiceSellerProfileService.update(editingSeller.id, rest);
      setSellerProfiles((prev) => prev.map((p) => (p.id === editingSeller.id ? { ...p, ...rest, id: p.id, createdAt: p.createdAt } as Seller : p)));
      setShowSellerModal(false);
      setEditingSeller(null);
    } catch (e) {
      console.error(e);
      setSellerError(e instanceof Error ? e.message : "Failed to save");
    }
  }

  function openEditTax(tax: Tax) {
    setEditingTax(tax);
    setTaxForm({ ...tax });
    setShowTaxModal(true);
  }

  function openAddTax() {
    setEditingTax(null);
    setTaxForm({ name: "", code: "", vatRate: 19, otherTaxRate: 0, otherTaxLabel: "", enabled: true });
    setShowTaxModal(true);
  }

  async function saveTax() {
    const form = taxForm as Tax;
    if (!form.name || !String(form.name).trim()) return;
    if (!form.code || !String(form.code).trim()) return;
    // prevent duplicate code/name
    const duplicate = taxProfiles.some((tp) => tp.id !== editingTax?.id && (tp.code.toLowerCase() === String(form.code).toLowerCase() || tp.name.toLowerCase() === String(form.name).toLowerCase()));
    if (duplicate) {
      // simple inline alert via console, but prevent save
      return;
    }
    try {
      const { invoiceTaxProfileService } = await import("../../src/services/invoice-tax-profile.service");
      if (editingTax) {
        const { id, createdAt, syncStatus, ...rest } = form as any;
        await invoiceTaxProfileService.update(editingTax.id, { ...rest, updatedAt: Date.now() });
        setTaxProfiles((prev) => prev.map((p) => (p.id === editingTax.id ? { ...p, ...rest, id: p.id } as Tax : p)));
      } else {
        const now = Date.now();
        const newTax: Tax = { id: `tax-${Date.now()}`, name: String(form.name).trim(), code: String(form.code).trim().toUpperCase(), vatRate: Number(form.vatRate) || 0, otherTaxRate: Number(form.otherTaxRate) || 0, otherTaxLabel: form.otherTaxLabel ? String(form.otherTaxLabel).trim() : undefined, enabled: !!form.enabled, createdAt: now, updatedAt: now, syncStatus: "pending" } as Tax;
        await invoiceTaxProfileService.create(newTax as any);
        setTaxProfiles((prev) => {
          const next = [...prev, newTax];
          const order: Record<string, number> = { TVA19: 0, TVA17: 1, TVA9: 2, EXO: 3, HORS: 4 };
          return next.sort((a, b) => {
            const oa = order[a.code] ?? 99;
            const ob = order[b.code] ?? 99;
            if (oa !== ob) return oa - ob;
            return a.name.localeCompare(b.name);
          });
        });
      }
      setShowTaxModal(false);
      setEditingTax(null);
    } catch (e) {
      console.error(e);
    }
  }

  async function toggleTaxEnabled(tax: Tax) {
    try {
      const { invoiceTaxProfileService } = await import("../../src/services/invoice-tax-profile.service");
      const nextEnabled = !tax.enabled;
      await invoiceTaxProfileService.update(tax.id, { enabled: nextEnabled });
      setTaxProfiles((prev) => prev.map((p) => (p.id === tax.id ? { ...p, enabled: nextEnabled } : p)));
    } catch (e) { console.error(e); }
  }

  async function confirmDeleteTax() {
    if (!deleteTaxId) return;
    const target = taxProfiles.find((x) => x.id === deleteTaxId);
    if (!target || isBuiltInTax(target)) {
      setDeleteTaxId(null);
      return;
    }
    try {
      const { invoiceTaxProfileRepository } = await import("../../src/repositories/invoice-tax-profile.repository");
      await invoiceTaxProfileRepository.delete(target.id);
      setTaxProfiles((prev) => prev.filter((p) => p.id !== target.id));
    } catch (e) { console.error(e); }
    setDeleteTaxId(null);
  }

  function handleTogglePayment(id: string) {
    const next = paymentMethods.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p));
    void persistPayments(next);
  }

  function handleAddCustomPayment() {
    const trimmed = customPaymentName.trim();
    if (!trimmed) return;
    if (paymentMethods.some((p) => p.label.toLowerCase() === trimmed.toLowerCase() || p.id.toLowerCase() === trimmed.toLowerCase().replace(/\s+/g, "_"))) return;
    const newEntry: PaymentMethod = { id: trimmed.toLowerCase().replace(/\s+/g, "_"), label: trimmed, enabled: true, isCustom: true };
    const next = [...paymentMethods, newEntry];
    void persistPayments(next);
    setCustomPaymentName("");
  }

  function handleDeletePayment(id: string) {
    const next = paymentMethods.filter((p) => p.id !== id);
    void persistPayments(next);
  }

  function handleDocToggle(key: keyof typeof docDefaults) {
    const next = { ...docDefaults, [key]: !docDefaults[key] };
    void persistDocDefaults(next);
  }

  // Logo / stamp file handling
  function handleFileToBase64(file: File, field: "logo" | "stampImage") {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setSellerForm((prev) => ({ ...prev, [field]: result }));
    };
    reader.readAsDataURL(file);
  }

  if (loading) {
    return <div className={styles.rowsStack}><div className={styles.emptySearch}>Loading...</div></div>;
  }

  return (
    <div className={styles.invoiceStack}>
      <h2 className={styles.sectionHeading} style={{ marginBottom: 2 }}>{t.invoiceTitle as string}</h2>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 12, lineHeight: 1.5 }}>{t.invoiceDesc as string}</p>

      {/* SELLER PROFILES */}
      <section className={styles.invoiceSection} aria-labelledby="inv-seller-head">
        <div className={styles.invoiceSectionHead}>
          <div className={styles.invoiceSectionHeadLeft}>
            <div className={styles.invoiceSectionIcon} aria-hidden="true"><Building2 size={18} strokeWidth={2} /></div>
            <div className={styles.invoiceSectionText}>
              <strong id="inv-seller-head">{t.invoiceSellerProfiles as string}</strong>
              <span>{t.invoiceSellerProfilesDesc as string}</span>
            </div>
          </div>
        </div>
        <div className={styles.invoiceSellerGrid}>
          {sellerProfiles.map((seller) => {
            const legalDen = displayValue(seller.legalDenomination);
            const rc = displayValue(seller.rc);
            const nif = displayValue(seller.nif);
            const nis = displayValue(seller.nis);
            const prefix = displayValue(seller.invoicePrefix);
            const nextDisplay = `${seller.invoicePrefix || ""}-${String(seller.nextNumber ?? 1).padStart(seller.paddingLength ?? 6, "0")}`;
            const defaultTax = getTaxName(seller.defaultTaxProfileId);
            return (
              <div key={seller.id} className={styles.invoiceSellerCard}>
                <div className={styles.invoiceSellerCardHeader}>
                  <div className={styles.invoiceSellerTitle}>
                    <strong>{seller.commercialName}</strong>
                    <small>{legalDen}</small>
                  </div>
                  <button type="button" className={styles.invoiceSellerEdit} onClick={() => openEditSeller(seller)} aria-label={`${t.edit as string} ${seller.commercialName}`}>
                    <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
                <div className={styles.invoiceSellerMeta}>
                  <div className={styles.invoiceMetaItem}><label>{t.commercialName as string}</label><span>{displayValue(seller.commercialName)}</span></div>
                  <div className={styles.invoiceMetaItem}><label>{t.legalDenomination as string}</label><span>{legalDen}</span></div>
                  <div className={styles.invoiceMetaItem}><label>{t.rc as string}</label><span>{rc !== notConfigured ? rc : <em>{notConfigured}</em> as any}</span></div>
                  <div className={styles.invoiceMetaItem}><label>{t.nif as string}</label><span>{nif !== notConfigured ? nif : <em>{notConfigured}</em> as any}</span></div>
                  <div className={styles.invoiceMetaItem}><label>{t.nis as string}</label><span>{nis !== notConfigured ? nis : <em>{notConfigured}</em> as any}</span></div>
                  <div className={styles.invoiceMetaItem}><label>{t.invoicePrefix as string}</label><span>{prefix}</span></div>
                  <div className={styles.invoiceMetaItem}><label>{t.nextNumber as string}</label><span>{nextDisplay}</span></div>
                  <div className={styles.invoiceMetaItem}><label>{t.defaultTaxProfile as string}</label><span>{defaultTax}</span></div>
                </div>
                {(seller.bankName || seller.rib) && (
                  <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <Landmark size={12} strokeWidth={2} aria-hidden="true" />
                    <span>{displayValue(seller.bankName)} {seller.rib ? `· ${seller.rib}` : ""}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* TAX PROFILES */}
      <section className={styles.invoiceSection} aria-labelledby="inv-tax-head">
        <div className={styles.invoiceSectionHead}>
          <div className={styles.invoiceSectionHeadLeft}>
            <div className={styles.invoiceSectionIcon} aria-hidden="true"><Receipt size={18} strokeWidth={2} /></div>
            <div className={styles.invoiceSectionText}>
              <strong id="inv-tax-head">{t.invoiceTaxProfiles as string}</strong>
              <span>{t.invoiceTaxProfilesDesc as string}</span>
            </div>
          </div>
          <button type="button" className={styles.invoiceAddButton} onClick={openAddTax}>
            <Plus size={14} strokeWidth={2} aria-hidden="true" /> {t.addTaxProfile as string}
          </button>
        </div>
        <div className={styles.invoiceTaxList}>
          {taxProfiles.map((tax) => (
            <div key={tax.id} className={styles.invoiceTaxRow}>
              <div className={styles.invoiceTaxMain}>
                <div className={styles.invoiceTaxIcon} aria-hidden="true"><Banknote size={16} strokeWidth={2} /></div>
                <div className={styles.invoiceTaxInfo}>
                  <strong>{tax.name} ({tax.vatRate}%)</strong>
                  <span>{tax.code} {tax.otherTaxLabel ? `· ${tax.otherTaxLabel} ${tax.otherTaxRate}%` : ""}</span>
                </div>
                <div className={styles.invoiceTaxBadges}>
                  <span className={tax.enabled ? styles.invoiceBadgeEnabled : styles.invoiceBadgeDisabled}>{tax.enabled ? (t.enabledLabel as string) : (t.disabledLabel as string)}</span>
                </div>
              </div>
              <div className={styles.invoiceTaxActions}>
                <button type="button" className={styles.invoiceIconBtn} onClick={() => openEditTax(tax)} aria-label={`${t.edit as string} ${tax.name}`}>
                  <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                </button>
                <button type="button" className={styles.invoiceToggle} data-enabled={String(tax.enabled)} onClick={() => void toggleTaxEnabled(tax)} aria-label={`Toggle ${tax.name}`} role="switch" aria-checked={tax.enabled}>
                  <span className={styles.invoiceToggleKnob} aria-hidden="true" />
                </button>
                {!isBuiltInTax(tax) && (
                  <button type="button" className={styles.invoiceIconBtnDanger} onClick={() => setDeleteTaxId(tax.id)} aria-label={`${t.delete as string} ${tax.name}`}>
                    <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PAYMENT METHODS */}
      <section className={styles.invoiceSection} aria-labelledby="inv-pay-head">
        <div className={styles.invoiceSectionHead}>
          <div className={styles.invoiceSectionHeadLeft}>
            <div className={styles.invoiceSectionIcon} aria-hidden="true"><CreditCard size={18} strokeWidth={2} /></div>
            <div className={styles.invoiceSectionText}>
              <strong id="inv-pay-head">{t.invoicePaymentMethods as string}</strong>
              <span>{t.invoicePaymentMethodsDesc as string}</span>
            </div>
          </div>
        </div>
        <div className={styles.invoicePaymentList}>
          {paymentMethods.map((pm) => (
            <div key={pm.id} className={styles.invoicePaymentRow}>
              <div className={styles.invoicePaymentLabel}>
                <Banknote size={16} strokeWidth={2} aria-hidden="true" style={{ color: "var(--muted)" }} />
                <strong>{paymentLabel(pm.id) !== pm.id ? paymentLabel(pm.id) : pm.label}</strong>
                {pm.isCustom && <span style={{ fontSize: 10, fontWeight: 800, color: "var(--accent)", border: "1px solid var(--accent-ring)", background: "var(--accent-soft)", padding: "2px 6px", borderRadius: 999 }}>{pm.id}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: pm.enabled ? "var(--success)" : "var(--muted)" }}>{pm.enabled ? (t.enabledLabel as string) : (t.disabledLabel as string)}</span>
                <button type="button" className={styles.invoiceToggle} data-enabled={String(pm.enabled)} onClick={() => handleTogglePayment(pm.id)} role="switch" aria-checked={pm.enabled} aria-label={`Toggle ${pm.label}`}>
                  <span className={styles.invoiceToggleKnob} aria-hidden="true" />
                </button>
                {pm.isCustom && (
                  <button type="button" className={styles.invoiceIconBtnDanger} onClick={() => handleDeletePayment(pm.id)} aria-label={`${t.delete as string} ${pm.label}`}>
                    <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          ))}
          <div className={styles.invoiceCustomRow}>
            <input className={styles.invoiceCustomInput} placeholder={t.customPaymentPlaceholder as string} value={customPaymentName} onChange={(e) => setCustomPaymentName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCustomPayment(); } }} />
            <button type="button" className={styles.invoiceAddButton} onClick={handleAddCustomPayment} disabled={!customPaymentName.trim()}>
              <Plus size={14} strokeWidth={2} aria-hidden="true" /> {t.addPaymentMethod as string}
            </button>
          </div>
        </div>
      </section>

      {/* NUMBERING */}
      <section className={styles.invoiceSection} aria-labelledby="inv-num-head">
        <div className={styles.invoiceSectionHead}>
          <div className={styles.invoiceSectionHeadLeft}>
            <div className={styles.invoiceSectionIcon} aria-hidden="true"><Hash size={18} strokeWidth={2} /></div>
            <div className={styles.invoiceSectionText}>
              <strong id="inv-num-head">{t.invoiceNumbering as string}</strong>
              <span>{t.invoiceNumberingDesc as string}</span>
            </div>
          </div>
        </div>
        <div className={styles.invoiceNumberingGrid}>
          {sellerProfiles.map((seller) => (
            <div key={seller.id + "-num"} className={styles.invoiceNumberingCard}>
              <strong>{seller.commercialName}</strong>
              <div className={styles.invoiceNumberingMeta}>
                <span><label>{t.prefix as string}</label> <b>{seller.invoicePrefix || notConfigured}</b></span>
                <span><label>{t.nextNumber as string}</label> <span className={styles.invoiceNumberChip}>{String(seller.nextNumber ?? 1).padStart(seller.paddingLength ?? 6, "0")}</span></span>
                <span><label>{t.padding as string}</label> <b>{String(seller.paddingLength ?? 6)}</b></span>
                <span><label>Preview</label> <b>{formatNext(seller)}</b></span>
              </div>
              <button type="button" className={styles.invoiceSecondaryBtn} style={{ alignSelf: "flex-start", minHeight: 32, fontSize: 12, padding: "0 12px" }} onClick={() => openEditSeller(seller)}>
                <Pencil size={12} strokeWidth={2} aria-hidden="true" style={{ marginInlineEnd: 6 }} /> {t.edit as string}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* DOCUMENT DEFAULTS */}
      <section className={styles.invoiceSection} aria-labelledby="inv-doc-head">
        <div className={styles.invoiceSectionHead}>
          <div className={styles.invoiceSectionHeadLeft}>
            <div className={styles.invoiceSectionIcon} aria-hidden="true"><SettingsIcon size={18} strokeWidth={2} /></div>
            <div className={styles.invoiceSectionText}>
              <strong id="inv-doc-head">{t.invoiceDocumentDefaults as string}</strong>
              <span>{t.invoiceDocumentDefaultsDesc as string}</span>
            </div>
          </div>
        </div>
        <div className={styles.invoiceDocGrid}>
          <div className={styles.invoiceDocRow}>
            <div className={styles.invoiceDocRowLeft}>
              <div className={styles.invoiceSectionIcon} style={{ width: 36, height: 36, flex: "0 0 36px" }} aria-hidden="true"><Globe size={16} strokeWidth={2} /></div>
              <div>
                <strong>{t.defaultInvoiceLanguage as string}</strong>
                <span>{t.languageDescription as string}</span>
              </div>
            </div>
            <div className={styles.invoiceDocSelect}>
              <StyledSelect
                value={docDefaults.defaultInvoiceLanguage}
                onChange={(v) => void persistDocDefaults({ ...docDefaults, defaultInvoiceLanguage: v as Language })}
                ariaLabel={t.defaultInvoiceLanguage as string}
                options={[
                  { value: "en", label: "English" },
                  { value: "fr", label: "Français" },
                  { value: "ar", label: "العربية" },
                ]}
              />
            </div>
          </div>

          <div className={styles.invoiceDocRow}>
            <div className={styles.invoiceDocRowLeft}>
              <div className={styles.invoiceSectionIcon} style={{ width: 36, height: 36, flex: "0 0 36px" }} aria-hidden="true"><Banknote size={16} strokeWidth={2} /></div>
              <div>
                <strong>{t.defaultCurrency as string}</strong>
                <span>{t.currencyDescription as string}</span>
              </div>
            </div>
            <div className={styles.invoiceDocSelect}>
              <StyledSelect
                value={docDefaults.defaultCurrency}
                onChange={(v) => void persistDocDefaults({ ...docDefaults, defaultCurrency: v as Currency })}
                ariaLabel={t.defaultCurrency as string}
                options={[
                  { value: "DA", label: t.dinar as string },
                  { value: "€", label: t.euro as string },
                  { value: "$", label: t.dollar as string },
                ]}
              />
            </div>
          </div>

          {[
            { key: "showBankDetails" as const, label: t.showBankDetails as string },
            { key: "showRC" as const, label: t.showRC as string },
            { key: "showNIF" as const, label: t.showNIF as string },
            { key: "showNIS" as const, label: t.showNIS as string },
            { key: "showCapital" as const, label: t.showShareCapital as string },
            { key: "showStamp" as const, label: t.showStamp as string },
          ].map((row) => (
            <div key={row.key} className={styles.invoiceDocRow}>
              <div className={styles.invoiceDocRowLeft}>
                <div className={styles.invoiceSectionIcon} style={{ width: 36, height: 36, flex: "0 0 36px" }} aria-hidden="true"><FileText size={16} strokeWidth={2} /></div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <strong>{row.label}</strong>
                </div>
              </div>
              <button type="button" className={styles.invoiceToggle} data-enabled={String((docDefaults as any)[row.key])} onClick={() => handleDocToggle(row.key)} role="switch" aria-checked={(docDefaults as any)[row.key]} aria-label={row.label}>
                <span className={styles.invoiceToggleKnob} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* SELLER MODAL */}
      {showSellerModal && editingSeller && (
        <div className={styles.invoiceModalBackdrop} onClick={() => setShowSellerModal(false)} role="presentation">
          <section className={styles.invoiceModal} role="dialog" aria-modal="true" aria-labelledby="seller-modal-title" onClick={(e) => e.stopPropagation()}>
            <header className={styles.invoiceModalHeader}>
              <div className={styles.invoiceModalHeaderIcon} aria-hidden="true"><Building2 size={18} strokeWidth={2} /></div>
              <h2 id="seller-modal-title">{t.sellerProfileEdit as string} — {editingSeller.commercialName}</h2>
              <button type="button" className={styles.invoiceModalClose} onClick={() => setShowSellerModal(false)} aria-label={t.close as string}><X size={16} strokeWidth={2} /></button>
            </header>
            <div className={styles.invoiceModalBody}>
              {sellerError && <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--danger-soft)", border: "1px solid var(--danger-ring)", color: "var(--danger)", fontSize: 12, fontWeight: 700 }}>{sellerError}</div>}

              <div className={styles.invoiceModalSection}>
                <h3 className={styles.invoiceModalSectionTitle}>{t.identity as string}</h3>
                <div className={styles.invoiceFormGrid}>
                  <div className={styles.invoiceField}><label>{t.commercialName as string} <small>*</small></label><input value={(sellerForm.commercialName as string) || ""} onChange={(e) => setSellerForm((p) => ({ ...p, commercialName: e.target.value }))} placeholder={t.commercialName as string} /></div>
                  <div className={styles.invoiceField}><label>{t.legalDenomination as string}</label><input value={(sellerForm.legalDenomination as string) || ""} onChange={(e) => setSellerForm((p) => ({ ...p, legalDenomination: e.target.value }))} /></div>
                  <div className={styles.invoiceField}><label>{t.legalForm as string}</label><input value={(sellerForm.legalForm as string) || ""} onChange={(e) => setSellerForm((p) => ({ ...p, legalForm: e.target.value }))} /></div>
                  <div className={styles.invoiceField}><label>{t.activity as string}</label><input value={(sellerForm.activity as string) || ""} onChange={(e) => setSellerForm((p) => ({ ...p, activity: e.target.value }))} /></div>
                </div>
              </div>

              <div className={styles.invoiceModalSection}>
                <h3 className={styles.invoiceModalSectionTitle}>{t.legal as string}</h3>
                <div className={styles.invoiceFormGrid}>
                  <div className={styles.invoiceField} style={{ gridColumn: "span 2" }}><label>{t.registeredAddress as string}</label><input value={(sellerForm.address as string) || ""} onChange={(e) => setSellerForm((p) => ({ ...p, address: e.target.value }))} /></div>
                  <div className={styles.invoiceField}><label>{t.city as string}</label><input value={(sellerForm.city as string) || ""} onChange={(e) => setSellerForm((p) => ({ ...p, city: e.target.value }))} /></div>
                  <div className={styles.invoiceField}><label>{t.wilaya as string}</label><input value={(sellerForm.wilaya as string) || ""} onChange={(e) => setSellerForm((p) => ({ ...p, wilaya: e.target.value }))} /></div>
                  <div className={styles.invoiceField}><label>{t.rc as string}</label><input value={(sellerForm.rc as string) || ""} onChange={(e) => setSellerForm((p) => ({ ...p, rc: e.target.value }))} /></div>
                  <div className={styles.invoiceField}><label>{t.nif as string}</label><input value={(sellerForm.nif as string) || ""} onChange={(e) => setSellerForm((p) => ({ ...p, nif: e.target.value }))} /></div>
                  <div className={styles.invoiceField}><label>{t.nis as string}</label><input value={(sellerForm.nis as string) || ""} onChange={(e) => setSellerForm((p) => ({ ...p, nis: e.target.value }))} /></div>
                  <div className={styles.invoiceField}><label>{t.shareCapital as string}</label><input value={(sellerForm.capital as string) || ""} onChange={(e) => setSellerForm((p) => ({ ...p, capital: e.target.value }))} /></div>
                </div>
              </div>

              <div className={styles.invoiceModalSection}>
                <h3 className={styles.invoiceModalSectionTitle}>{t.contact as string}</h3>
                <div className={styles.invoiceFormGrid}>
                  <div className={styles.invoiceField}><label>{t.phone as string}</label><input value={(sellerForm.phone as string) || ""} onChange={(e) => setSellerForm((p) => ({ ...p, phone: e.target.value }))} /></div>
                  <div className={styles.invoiceField}><label>{t.email as string}</label><input type="email" value={(sellerForm.email as string) || ""} onChange={(e) => setSellerForm((p) => ({ ...p, email: e.target.value }))} /></div>
                  <div className={styles.invoiceField}><label>{t.fax as string}</label><input value={(sellerForm.fax as string) || ""} onChange={(e) => setSellerForm((p) => ({ ...p, fax: e.target.value }))} /></div>
                </div>
              </div>

              <div className={styles.invoiceModalSection}>
                <h3 className={styles.invoiceModalSectionTitle}>{t.banking as string}</h3>
                <div className={styles.invoiceFormGrid}>
                  <div className={styles.invoiceField}><label>{t.bankName as string}</label><input value={(sellerForm.bankName as string) || ""} onChange={(e) => setSellerForm((p) => ({ ...p, bankName: e.target.value }))} /></div>
                  <div className={styles.invoiceField}><label>{t.bankAccount as string}</label><input value={(sellerForm.bankAccount as string) || ""} onChange={(e) => setSellerForm((p) => ({ ...p, bankAccount: e.target.value }))} /></div>
                  <div className={styles.invoiceField} style={{ gridColumn: "span 2" }}><label>{t.rib as string}</label><input value={(sellerForm.rib as string) || ""} onChange={(e) => setSellerForm((p) => ({ ...p, rib: e.target.value }))} placeholder="007 99999 000..." /></div>
                </div>
              </div>

              <div className={styles.invoiceModalSection}>
                <h3 className={styles.invoiceModalSectionTitle}>{t.numberingSection as string}</h3>
                <div className={styles.invoiceFormGrid}>
                  <div className={styles.invoiceField}><label>{t.invoicePrefix as string} <small>*</small></label><input value={(sellerForm.invoicePrefix as string) || ""} onChange={(e) => setSellerForm((p) => ({ ...p, invoicePrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") }))} placeholder="HSH" /></div>
                  <div className={styles.invoiceField}><label>{t.nextInvoiceNumber as string}</label><input type="number" min={getMinNext(editingSeller.id)} value={(sellerForm.nextNumber as number) ?? 1} onChange={(e) => setSellerForm((p) => ({ ...p, nextNumber: Math.max(1, Number(e.target.value) || 1) }))} /></div>
                  <div className={styles.invoiceField}><label>{t.paddingLength as string}</label><input type="number" min={3} max={8} value={(sellerForm.paddingLength as number) ?? 6} onChange={(e) => setSellerForm((p) => ({ ...p, paddingLength: Math.min(8, Math.max(3, Number(e.target.value) || 6)) }))} /></div>
                  <div className={styles.invoiceField}><label>{t.yearResetPolicy as string}</label>
                    <StyledSelect value={(sellerForm.yearResetPolicy as string) || "never"} onChange={(v) => setSellerForm((p) => ({ ...p, yearResetPolicy: v as any }))} ariaLabel={t.yearResetPolicy as string} options={[{ value: "never", label: t.yearResetNever as string }, { value: "yearly", label: t.yearResetYearly as string }]} />
                  </div>
                </div>
                <small style={{ color: "var(--muted)", fontSize: 11 }}>Min allowed: {getMinNext(editingSeller.id)} — {t.numberingSafetyError as string}</small>
              </div>

              <div className={styles.invoiceModalSection}>
                <h3 className={styles.invoiceModalSectionTitle}>{t.taxDefaults as string}</h3>
                <div className={styles.invoiceFormGrid}>
                  <div className={styles.invoiceField}><label>{t.defaultTaxProfile as string}</label>
                    <StyledSelect value={(sellerForm.defaultTaxProfileId as string) || ""} onChange={(v) => setSellerForm((p) => ({ ...p, defaultTaxProfileId: v || undefined }))} ariaLabel={t.defaultTaxProfile as string} placeholder={notConfigured} options={[{ value: "", label: notConfigured }, ...taxProfiles.map((tp) => ({ value: tp.id, label: `${tp.name} (${tp.vatRate}%)` }))]} />
                  </div>
                  <div className={styles.invoiceField}><label>{(t as any).defaultPaymentMethodId as string}</label>
                    <StyledSelect value={(sellerForm.defaultPaymentMethodId as string) || (sellerForm as any).defaultPaymentTerms || ""} onChange={(v) => setSellerForm((p) => ({ ...p, defaultPaymentMethodId: v || undefined }))} ariaLabel={(t as any).defaultPaymentMethodId as string} placeholder={notConfigured} options={[{ value: "", label: notConfigured }, ...paymentMethods.filter((pm) => pm.enabled).map((pm) => ({ value: pm.id, label: paymentLabel(pm.id) }))]} />
                  </div>
                  <div className={styles.invoiceField}><label>{t.defaultCurrency as string}</label>
                    <StyledSelect value={(sellerForm.defaultCurrency as string) || ""} onChange={(v) => setSellerForm((p) => ({ ...p, defaultCurrency: v || undefined }))} ariaLabel={t.defaultCurrency as string} placeholder={notConfigured} options={[{ value: "", label: notConfigured }, { value: "DA", label: t.dinar as string }, { value: "€", label: t.euro as string }, { value: "$", label: t.dollar as string }]} />
                  </div>
                </div>
              </div>

              <div className={styles.invoiceModalSection}>
                <h3 className={styles.invoiceModalSectionTitle}>{t.branding as string}</h3>
                <div className={styles.invoiceFormGrid}>
                  <div className={styles.invoiceField}><label>{t.logo as string}</label>
                    <input type="file" accept="image/*" className={styles.invoiceFileInput} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileToBase64(f, "logo"); }} />
                    {(sellerForm.logo as string) && <span style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(sellerForm.logo).slice(0, 60)}...</span>}
                    <input value={(sellerForm.logo as string) || ""} onChange={(e) => setSellerForm((p) => ({ ...p, logo: e.target.value }))} placeholder="https://... or data URL" style={{ marginTop: 6 }} />
                  </div>
                  <div className={styles.invoiceField}><label>{t.stampImage as string}</label>
                    <input type="file" accept="image/*" className={styles.invoiceFileInput} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileToBase64(f, "stampImage"); }} />
                    {(sellerForm.stampImage as string) && <span style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(sellerForm.stampImage).slice(0, 60)}...</span>}
                    <input value={(sellerForm.stampImage as string) || ""} onChange={(e) => setSellerForm((p) => ({ ...p, stampImage: e.target.value }))} placeholder="https://... or data URL" style={{ marginTop: 6 }} />
                  </div>
                </div>
              </div>
            </div>
            <footer className={styles.invoiceModalFooter}>
              <button type="button" className={styles.invoiceSecondaryBtn} onClick={() => setShowSellerModal(false)}>{t.cancel as string}</button>
              <button type="button" className={styles.invoicePrimaryBtn} onClick={() => void saveSeller()}>{t.save as string}</button>
            </footer>
          </section>
        </div>
      )}

      {/* TAX MODAL */}
      {showTaxModal && (
        <div className={styles.invoiceModalBackdrop} onClick={() => setShowTaxModal(false)} role="presentation">
          <section className={styles.invoiceModal} role="dialog" aria-modal="true" aria-labelledby="tax-modal-title" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <header className={styles.invoiceModalHeader}>
              <div className={styles.invoiceModalHeaderIcon} aria-hidden="true"><Receipt size={18} strokeWidth={2} /></div>
              <h2 id="tax-modal-title">{editingTax ? (t.taxProfileEdit as string) : (t.addTaxProfileTitle as string)}</h2>
              <button type="button" className={styles.invoiceModalClose} onClick={() => setShowTaxModal(false)} aria-label={t.close as string}><X size={16} strokeWidth={2} /></button>
            </header>
            <div className={styles.invoiceModalBody}>
              <div className={styles.invoiceFormGrid}>
                <div className={styles.invoiceField}><label>{t.nameLabel as string} <small>*</small></label><input value={(taxForm.name as string) || ""} onChange={(e) => setTaxForm((p) => ({ ...p, name: e.target.value }))} placeholder="TVA 19%" /></div>
                <div className={styles.invoiceField}><label>{t.code as string} <small>*</small></label><input value={(taxForm.code as string) || ""} onChange={(e) => setTaxForm((p) => ({ ...p, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") }))} placeholder="TVA19" /></div>
                <div className={styles.invoiceField}><label>{t.vatRate as string} (%)</label><input type="number" min={0} max={100} step={0.1} value={(taxForm.vatRate as number) ?? 0} onChange={(e) => setTaxForm((p) => ({ ...p, vatRate: Number(e.target.value) }))} /></div>
                <div className={styles.invoiceField}><label>{t.otherTaxRate as string} (%)</label><input type="number" min={0} max={100} step={0.1} value={(taxForm.otherTaxRate as number) ?? 0} onChange={(e) => setTaxForm((p) => ({ ...p, otherTaxRate: Number(e.target.value) }))} /></div>
                <div className={styles.invoiceField} style={{ gridColumn: "span 2" }}><label>{t.otherTaxLabel as string}</label><input value={(taxForm.otherTaxLabel as string) || ""} onChange={(e) => setTaxForm((p) => ({ ...p, otherTaxLabel: e.target.value }))} placeholder={language === "fr" ? "Timbre, Droit..." : language === "ar" ? "رسوم إضافية" : "Stamp, Levy..."} /></div>
                <div className={styles.invoiceField}><label>{t.enabledLabel as string}</label>
                  <button type="button" className={styles.invoiceToggle} data-enabled={String(!!taxForm.enabled)} onClick={() => setTaxForm((p) => ({ ...p, enabled: !p.enabled }))} role="switch" aria-checked={!!taxForm.enabled}>
                    <span className={styles.invoiceToggleKnob} aria-hidden="true" />
                  </button>
                  <span style={{ fontSize: 11, color: "var(--muted)", marginInlineStart: 8 }}>{taxForm.enabled ? (t.enabledLabel as string) : (t.disabledLabel as string)}</span>
                </div>
              </div>
            </div>
            <footer className={styles.invoiceModalFooter}>
              <button type="button" className={styles.invoiceSecondaryBtn} onClick={() => setShowTaxModal(false)}>{t.cancel as string}</button>
              <button type="button" className={styles.invoicePrimaryBtn} onClick={() => void saveTax()} disabled={!String(taxForm.name || "").trim() || !String(taxForm.code || "").trim()}>{t.save as string}</button>
            </footer>
          </section>
        </div>
      )}

      {/* DELETE TAX CONFIRM */}
      {deleteTaxId && (
        <div className={styles.invoiceModalBackdrop} onClick={() => setDeleteTaxId(null)} role="presentation">
          <section className={styles.invoiceModal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <header className={styles.invoiceModalHeader}>
              <div className={styles.invoiceModalHeaderIcon} style={{ background: "var(--danger-soft)", color: "var(--danger)", borderColor: "var(--danger-ring)" }} aria-hidden="true"><Trash2 size={18} strokeWidth={2} /></div>
              <h2>{t.deleteTaxConfirm as string}</h2>
              <button type="button" className={styles.invoiceModalClose} onClick={() => setDeleteTaxId(null)} aria-label={t.close as string}><X size={16} strokeWidth={2} /></button>
            </header>
            <div className={styles.invoiceModalBody}>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>{t.deleteTaxDesc as string} <strong style={{ color: "var(--text)" }}>{taxProfiles.find((x) => x.id === deleteTaxId)?.name}</strong></p>
            </div>
            <footer className={styles.invoiceModalFooter}>
              <button type="button" className={styles.invoiceSecondaryBtn} onClick={() => setDeleteTaxId(null)}>{t.cancel as string}</button>
              <button type="button" className={styles.invoiceDeleteBtn} onClick={() => void confirmDeleteTax()}>{t.delete as string}</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
