"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CarFront,
  Check,
  ClipboardCheck,
  Banknote,
  FileText,
  Store,
  Info,
  LayoutDashboard,
  Menu,
  Moon,
  Package,
  Plus,
  Receipt,
  Settings as SettingsIcon,
  ShoppingBag,
  ShoppingCart,
  Sun,
  Trash2,
  Truck,
  Users,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import dashboardStyles from "../../page.module.css";
import styles from "./page.module.css";
import DateTimeDisplay from "../../../src/components/common/DateTimeDisplay";
import { productService } from "../../../src/services/product.service";
import { supplierService } from "../../../src/services/supplier.service";
import { purchaseService } from "../../../src/services/purchase.service";
import { purchaseOperation } from "../../../src/services/operations/purchase.operation";
import { purchaseEditOperation } from "../../../src/services/operations/purchase-edit.operation";
import { purchaseCalculationOperation } from "../../../src/services/operations/purchase-calculation.operation";
import { settingsService } from "../../../src/services/settings.service";
import {
  DEFAULT_SETTINGS,
  formatCurrency,
  getDirection,
  SETTINGS_EVENT,
} from "../../../src/lib/settings";
import { formatDate as formatDateLib } from "../../../src/lib/datetime";

import type { Product } from "../../../src/types/entities/product";
import type { Supplier } from "../../../src/types/entities/supplier";
import type { PurchaseCalculation } from "../../../src/types/entities/purchase-calculation";
import type { Currency, Language } from "../../../src/types/settings/settings";

type PurchaseRow = {
  supplierId: string;
  productId: string;
  quantity: string;
  weightKg: string;
  price: string;
};

type CalculationForm = {
  weightBeforeSlaughterKg: string;
  weightAfterSlaughterKg: string;
  amount: string;
};

const EMPTY_CALCULATION: CalculationForm = {
  weightBeforeSlaughterKg: "",
  weightAfterSlaughterKg: "",
  amount: "",
};

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatSelectedDate(date: Date, language: Language): string {
  try {
    return formatDateLib(date, language).dateStr;
  } catch {
    const locale =
      language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB";
    try {
      return new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
        numberingSystem: "latn",
      } as any).format(date);
    } catch {
      return new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
    }
  }
}

const TRANSLATIONS = {
  en: {
    backToPurchases: "Back to Purchases",
    addPurchase: "Add Purchase",
    editPurchase: "Edit Purchase",
    createSubtitle: "Create a new supplier purchase.",
    editSubtitle: "Update supplier purchase.",
    date: "Date",
    supplier: "Supplier",
    product: "Product",
    quantity: "Quantity",
    weight: "Weight",
    pricePerKg: "Price / Kg",
    total: "Total",
    actions: "Actions",
    noSupplier: "No supplier selected",
    selectSupplier: "Select Supplier",
    noProductsAdded: "No products added",
    noProductsHint: "Add products to build your purchase.",
    addProducts: "Add Products",
    addMoreProducts: "Add Products",
    purchaseTotal: "Purchase Total",
    cancel: "Cancel",
    savePurchase: "Save Purchase",
    saving: "Saving...",
    productRequired: "Please select at least one product.",
    supplierRequired: "Please select a supplier.",
    invalidRows: "Each purchase row must have a valid weight, price and quantity.",
    invalidNumber: "Please enter valid numbers.",
    failedLoad: "Failed to load purchase data.",
    failedSave: "Failed to save purchase.",
    selectProducts: "Select Products",
    continue: "Continue",
    close: "Close",
    noProducts: "No products available.",
    selected: "selected",
    kg: "kg",
    calculate: "Calculations",
    calculations: "Slaughter Calculations",
    weightBefore: "Weight Before Slaughter",
    weightAfter: "Weight After Slaughter",
    amount: "Amount",
    averageWeight: "Average Weight",
    lossPercent: "Loss %",
    averageLoss: "Average Weight Lost",
  },
  fr: {
    backToPurchases: "Retour aux achats",
    addPurchase: "Ajouter un achat",
    editPurchase: "Modifier l'achat",
    createSubtitle: "Créer un nouvel achat fournisseur.",
    editSubtitle: "Mettre à jour l'achat fournisseur.",
    date: "Date",
    supplier: "Fournisseur",
    product: "Produit",
    quantity: "Quantité",
    weight: "Poids",
    pricePerKg: "Prix / Kg",
    total: "Total",
    actions: "Actions",
    noSupplier: "Aucun fournisseur sélectionné",
    selectSupplier: "Sélectionner un fournisseur",
    noProductsAdded: "Aucun produit ajouté",
    noProductsHint: "Ajoutez des produits pour composer votre achat.",
    addProducts: "Ajouter des produits",
    addMoreProducts: "Ajouter des produits",
    purchaseTotal: "Total de l'achat",
    cancel: "Annuler",
    savePurchase: "Enregistrer l'achat",
    saving: "Enregistrement...",
    productRequired: "Veuillez sélectionner au moins un produit.",
    supplierRequired: "Veuillez sélectionner un fournisseur.",
    invalidRows: "Chaque ligne d'achat doit avoir un poids, un prix et une quantité valides.",
    invalidNumber: "Veuillez saisir des nombres valides.",
    failedLoad: "Échec du chargement des données d'achat.",
    failedSave: "Échec de l'enregistrement de l'achat.",
    selectProducts: "Sélectionner les produits",
    continue: "Continuer",
    close: "Fermer",
    noProducts: "Aucun produit disponible.",
    selected: "sélectionné(s)",
    kg: "kg",
    calculate: "Calculs",
    calculations: "Calculs d'abattage",
    weightBefore: "Poids avant abattage",
    weightAfter: "Poids après abattage",
    amount: "Nombre",
    averageWeight: "Poids moyen",
    lossPercent: "Perte %",
    averageLoss: "Perte de poids moyenne",
  },
  ar: {
    backToPurchases: "العودة إلى المشتريات",
    addPurchase: "إضافة شراء",
    editPurchase: "تعديل الشراء",
    createSubtitle: "إنشاء عملية شراء جديدة من المورد.",
    editSubtitle: "تحديث عملية شراء المورد.",
    date: "التاريخ",
    supplier: "المورد",
    product: "السلعة",
    quantity: "الكمية",
    weight: "الوزن",
    pricePerKg: "السعر / كغ",
    total: "المجموع",
    actions: "الإجراءات",
    noSupplier: "لم يتم اختيار مورد",
    selectSupplier: "اختيار مورد",
    noProductsAdded: "لم يتم إضافة سلع",
    noProductsHint: "أضف السلع لبناء عملية الشراء.",
    addProducts: "إضافة سلع",
    addMoreProducts: "إضافة سلع",
    purchaseTotal: "إجمالي الشراء",
    cancel: "إلغاء",
    savePurchase: "حفظ الشراء",
    saving: "جارٍ الحفظ...",
    productRequired: "يرجى اختيار سلعة واحدة على الأقل.",
    supplierRequired: "يرجى اختيار مورد.",
    invalidRows: "يجب أن يحتوي كل سطر شراء على وزن وسعر وكمية صحيحة.",
    invalidNumber: "يرجى إدخال أرقام صحيحة.",
    failedLoad: "فشل تحميل بيانات الشراء.",
    failedSave: "فشل حفظ عملية الشراء.",
    selectProducts: "اختيار السلع",
    continue: "متابعة",
    close: "إغلاق",
    noProducts: "لا توجد سلع متاحة.",
    selected: "محدد",
    kg: "كغ",
    calculate: "الحسابات",
    calculations: "حسابات الذبح",
    weightBefore: "الوزن قبل الذبح",
    weightAfter: "الوزن بعد الذبح",
    amount: "العدد",
    averageWeight: "متوسط الوزن",
    lossPercent: "نسبة الفقد",
    averageLoss: "متوسط الوزن المفقود",
  },
} as const;

// Shell translations for drawer navigation (copied from AppShell)
const SHELL_TRANSLATIONS = {
  en: {
    nav: {
      dashboard: "Management Dashboard",
      products: "Products",
      customers: "Customers",
      suppliers: "Suppliers",
      purchases: "Purchases",
      sales: "Sales",
      payments: "Payments",
      expenses: "Expenses",
      workers: "Workers",
      vehicles: "Vehicles",
      tasks: "Tasks",
      accounts: "Accounts",
      reports: "Reports",
      invoice: "Invoice",
      about: "About",
      settings: "Settings",
    },
    brand: "Hebrih Slaughter House",
    system: "Management System",
    onlineAccess: "Access RVB",
    database: "Local database ready",
    ready: "Ready",
  },
  fr: {
    nav: {
      dashboard: "Tableau de bord",
      products: "Produits",
      customers: "Clients",
      suppliers: "Fournisseurs",
      purchases: "Achats",
      sales: "Ventes",
      payments: "Paiements",
      expenses: "Dépenses",
      workers: "Employés",
      vehicles: "Véhicules",
      tasks: "Tâches",
      accounts: "Comptes",
      reports: "Rapports",
      invoice: "Facture",
      about: "À propos",
      settings: "Paramètres",
    },
    brand: "Abattoire Hebrih",
    system: "Système de gestion",
    onlineAccess: "Accéder à RVB",
    database: "Base de données locale prête",
    ready: "Prêt",
  },
  ar: {
    nav: {
      dashboard: "لوحة التحكم",
      products: "المنتجات",
      customers: "العملاء",
      suppliers: "الموردون",
      purchases: "المشتريات",
      sales: "المبيعات",
      payments: "المدفوعات",
      expenses: "المصاريف",
      workers: "العمال",
      vehicles: "المركبات",
      tasks: "المهام",
      accounts: "الحسابات",
      reports: "التقارير",
      invoice: "الفاتورة",
      about: "حول البرنامج",
      settings: "الإعدادات",
    },
    brand: "مذبح حبريح للدواجن",
    system: "نظام الإدارة",
    onlineAccess: "الدخول إلى RVB",
    database: "قاعدة البيانات المحلية جاهزة",
    ready: "جاهز",
  },
} as const;

type ActivePage =
  | "dashboard"
  | "products"
  | "customers"
  | "suppliers"
  | "purchases"
  | "sales"
  | "payments"
  | "expenses"
  | "workers"
  | "vehicles"
  | "tasks"
  | "accounts"
  | "reports"
  | "invoice"
  | "about"
  | "settings";

type NavItem = {
  icon: LucideIcon;
  key: ActivePage;
  label: string;
  path: string;
};

const navigation: readonly NavItem[] = [
  { icon: LayoutDashboard, key: "dashboard", label: "Management Dashboard", path: "/" },
  { icon: Package, key: "products", label: "Products", path: "/products" },
  { icon: Users, key: "customers", label: "Customers", path: "/customers" },
  { icon: Truck, key: "suppliers", label: "Suppliers", path: "/suppliers" },
  { icon: Wallet, key: "accounts", label: "Accounts", path: "/accounts" },
  { icon: ShoppingCart, key: "purchases", label: "Purchases", path: "/purchases" },
  { icon: ShoppingBag, key: "sales", label: "Sales", path: "/sales" },
  { icon: Banknote, key: "payments", label: "Payments", path: "/payments" },
  { icon: UsersRound, key: "workers", label: "Workers", path: "/workers" },
  { icon: CarFront, key: "vehicles", label: "Vehicles", path: "/vehicles" },
  { icon: ClipboardCheck, key: "tasks", label: "Tasks", path: "/tasks" },
  { icon: BarChart3, key: "reports", label: "Reports", path: "/reports" },
  { icon: FileText, key: "invoice", label: "Invoice", path: "/invoice" },
  { icon: SettingsIcon, key: "settings", label: "Settings", path: "/settings" },
  { icon: Info, key: "about", label: "About", path: "/about" },
] as const;

export default function PurchaseEntryPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [language, setLanguage] = useState<Language>(DEFAULT_SETTINGS.language);
  const [currency, setCurrency] = useState<Currency>(DEFAULT_SETTINGS.currency);

  const [purchaseDate, setPurchaseDate] = useState(() => toISODate(new Date()));
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [calculation, setCalculation] = useState<PurchaseCalculation | null>(null);
  const [calculationForm, setCalculationForm] = useState<CalculationForm>(EMPTY_CALCULATION);
  const [showCalculation, setShowCalculation] = useState(false);
  const weightBeforeRef = useRef<HTMLInputElement>(null);
  const weightAfterRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const [singleSupplierId, setSingleSupplierId] = useState<string>("");

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [showProductSelector, setShowProductSelector] = useState(false);
  const [showSupplierSelector, setShowSupplierSelector] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  // Shell / drawer state
  const [dark, setDark] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const t = TRANSLATIONS[language];
  const shellT = SHELL_TRANSLATIONS[language];

  // Theme handling (same as AppShell)
  useEffect(() => {
    const readTheme = () => {
      setDark(localStorage.getItem("hebrih-theme") === "dark");
    };
    readTheme();
    window.addEventListener("hebrih-theme-change", readTheme);
    window.addEventListener("storage", readTheme);
    return () => {
      window.removeEventListener("hebrih-theme-change", readTheme);
      window.removeEventListener("storage", readTheme);
    };
  }, []);

  function toggleTheme() {
    const next = localStorage.getItem("hebrih-theme") === "dark" ? "light" : "dark";
    localStorage.setItem("hebrih-theme", next);
    setDark(next === "dark");
    window.dispatchEvent(new Event("hebrih-theme-change"));
  }

  function navigate(path: string) {
    setSidebarOpen(false);
    router.push(path, { scroll: false });
  }

  // ESC closes drawer
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  const navLabels: Record<ActivePage, string> = {
    dashboard: shellT.nav.dashboard,
    products: shellT.nav.products,
    customers: shellT.nav.customers,
    suppliers: shellT.nav.suppliers,
    purchases: shellT.nav.purchases,
    sales: shellT.nav.sales,
    payments: shellT.nav.payments,
    expenses: shellT.nav.expenses,
    workers: shellT.nav.workers,
    vehicles: shellT.nav.vehicles,
    tasks: shellT.nav.tasks,
    accounts: shellT.nav.accounts,
    reports: shellT.nav.reports,
    invoice: shellT.nav.invoice,
    about: shellT.nav.about,
    settings: shellT.nav.settings,
  };

  // Load settings + products + suppliers
  useEffect(() => {
    async function loadSettings() {
      const s = await settingsService.get();
      if (s) {
        setLanguage(s.language ?? DEFAULT_SETTINGS.language);
        setCurrency(s.currency ?? DEFAULT_SETTINGS.currency);
        document.documentElement.lang = s.language ?? DEFAULT_SETTINGS.language;
        document.documentElement.dir = getDirection(s.language ?? DEFAULT_SETTINGS.language);
      }
    }
    async function loadMeta() {
      try {
        const [loadedProducts, loadedSuppliers] = await Promise.all([
          productService.getAll(),
          supplierService.getAll(),
        ]);
        setProducts(loadedProducts);
        setSuppliers(loadedSuppliers);
      } catch {
        setError(t.failedLoad);
      } finally {
        setLoadingMeta(false);
      }
    }
    void loadSettings();
    void loadMeta();

    const handleSettingsChange = (event?: Event) => {
      const ce = event as CustomEvent<typeof DEFAULT_SETTINGS> | undefined;
      if (ce?.detail) {
        setLanguage(ce.detail.language ?? DEFAULT_SETTINGS.language);
        setCurrency(ce.detail.currency ?? DEFAULT_SETTINGS.currency);
        document.documentElement.lang = ce.detail.language ?? DEFAULT_SETTINGS.language;
        document.documentElement.dir = getDirection(ce.detail.language ?? DEFAULT_SETTINGS.language);
        return;
      }
      void loadSettings();
    };
    window.addEventListener(SETTINGS_EVENT, handleSettingsChange as EventListener);
    window.addEventListener("storage", handleSettingsChange as EventListener);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, handleSettingsChange as EventListener);
      window.removeEventListener("storage", handleSettingsChange as EventListener);
    };
  }, [t.failedLoad]);

  // Load payload from localStorage or URL
  useEffect(() => {
    let urlDate: string | null = null;
    let urlEdit: string | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      urlDate = params.get("date");
      urlEdit = params.get("edit");
    } catch {}

    let payload: {
      purchaseDate?: string;
      rows?: PurchaseRow[];
      selectedProductIds?: string[];
      selectedSupplierIds?: string[];
      editingPurchaseId?: string | null;
      calculation?: PurchaseCalculation | null;
      calculationForm?: CalculationForm;
    } | null = null;

    try {
      const raw = localStorage.getItem("hebrih-purchase-entry");
      if (raw) {
        payload = JSON.parse(raw);
      }
    } catch {}

    if (payload) {
      if (payload.purchaseDate && /^\d{4}-\d{2}-\d{2}$/.test(payload.purchaseDate)) {
        setPurchaseDate(payload.purchaseDate);
      } else if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
        setPurchaseDate(urlDate);
      }

      if (Array.isArray(payload.rows) && payload.rows.length > 0) {
        setRows(payload.rows);
        const firstSupplier = payload.rows[0]?.supplierId;
        if (firstSupplier) setSingleSupplierId(firstSupplier);
        else if (payload.selectedSupplierIds && payload.selectedSupplierIds[0]) {
          setSingleSupplierId(payload.selectedSupplierIds[0]);
        }
      } else {
        if (payload.selectedSupplierIds && payload.selectedSupplierIds[0]) {
          setSingleSupplierId(payload.selectedSupplierIds[0]);
        }
        if (
          payload.selectedProductIds &&
          payload.selectedSupplierIds &&
          payload.selectedProductIds.length > 0 &&
          payload.selectedSupplierIds.length > 0
        ) {
          const nextRows: PurchaseRow[] = [];
          const supplierId = payload.selectedSupplierIds[0];
          for (const productId of payload.selectedProductIds) {
            const product = products.find((p) => p.id === productId);
            nextRows.push({
              supplierId,
              productId,
              quantity: "0",
              weightKg: "0",
              price: product?.price.toString() ?? "0",
            });
          }
          if (nextRows.length > 0) setRows(nextRows);
        }
      }

      if (payload.editingPurchaseId) setEditingPurchaseId(payload.editingPurchaseId);
      else if (urlEdit) setEditingPurchaseId(urlEdit);

      if (payload.calculation !== undefined) setCalculation(payload.calculation as PurchaseCalculation | null);
      if (payload.calculationForm) setCalculationForm(payload.calculationForm);
      if (payload.selectedProductIds) setSelectedProductIds(payload.selectedProductIds);
    } else {
      if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
        setPurchaseDate(urlDate);
      }
      if (urlEdit) setEditingPurchaseId(urlEdit);
      if (urlEdit) {
        void (async () => {
          try {
            const p = await purchaseService.getById(urlEdit as string);
            if (p) {
              setEditingPurchaseId(p.id);
              setPurchaseDate(toISODate(new Date(p.date)));
              setRows(
                p.items.map((item) => ({
                  supplierId: p.supplierId,
                  productId: item.productId,
                  quantity: String(item.quantity),
                  weightKg: String(item.weightKg),
                  price: String(item.price),
                }))
              );
              setSingleSupplierId(p.supplierId);
              setCalculation(p.calculation ?? null);
              if (p.calculation) {
                setCalculationForm({
                  weightBeforeSlaughterKg: String(p.calculation.weightBeforeSlaughterKg),
                  weightAfterSlaughterKg: String(p.calculation.weightAfterSlaughterKg),
                  amount: String(p.calculation.amount),
                });
              }
            }
          } catch {}
        })();
      }
    }
  }, [products]);

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "—";
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "—";

  const currentSupplierName = singleSupplierId ? supplierName(singleSupplierId) : "";

  function updateRow(index: number, field: keyof PurchaseRow, value: string) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value, supplierId: singleSupplierId || row.supplierId } : row
      )
    );
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  function calculatePurchaseTotal() {
    return rows.reduce((sum, row) => {
      const weight = Number(row.weightKg);
      const price = Number(row.price);
      if (!Number.isFinite(weight) || !Number.isFinite(price)) return sum;
      return sum + weight * price;
    }, 0);
  }

  function calculateSlaughter() {
    setError("");
    const weightBefore = Number(calculationForm.weightBeforeSlaughterKg);
    const weightAfter = Number(calculationForm.weightAfterSlaughterKg);
    const amount = Number(calculationForm.amount);
    if (!Number.isFinite(weightBefore) || !Number.isFinite(weightAfter) || !Number.isFinite(amount)) {
      setError(t.invalidNumber);
      return;
    }
    try {
      const result = purchaseCalculationOperation.calculate({
        weightBeforeSlaughterKg: weightBefore,
        weightAfterSlaughterKg: weightAfter,
        amount,
      });
      setCalculation(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.invalidNumber);
    }
  }

  function handleCancel() {
    try {
      localStorage.removeItem("hebrih-purchase-entry");
    } catch {}
    router.push("/purchases");
  }

  async function savePurchase() {
    setError("");
    if (rows.length === 0) {
      setError(t.invalidRows);
      return;
    }
    const effectiveSupplierId = singleSupplierId || rows[0]?.supplierId;
    if (!effectiveSupplierId) {
      setError(t.supplierRequired);
      return;
    }
    const normalizedRows = rows.map((r) => ({
      ...r,
      supplierId: r.supplierId || effectiveSupplierId,
    }));

    const parsedRows = normalizedRows.map((row) => ({
      supplierId: row.supplierId,
      productId: row.productId,
      quantity: Number(row.quantity),
      weightKg: Number(row.weightKg),
      price: Number(row.price),
    }));

    if (
      parsedRows.some(
        (row) =>
          !Number.isFinite(row.quantity) ||
          !Number.isFinite(row.weightKg) ||
          !Number.isFinite(row.price) ||
          row.quantity < 0 ||
          row.weightKg < 0 ||
          row.price < 0
      )
    ) {
      setError(t.invalidRows);
      return;
    }

    try {
      setSaving(true);

      if (editingPurchaseId) {
        const supplierIds = [...new Set(parsedRows.map((row) => row.supplierId))];
        if (supplierIds.length !== 1) {
          setError(t.supplierRequired);
          setSaving(false);
          return;
        }
        const supplierId = supplierIds[0];
        const total = Number(parsedRows.reduce((sum, row) => sum + row.weightKg * row.price, 0).toFixed(2));
        await purchaseEditOperation.edit({
          purchaseId: editingPurchaseId,
          supplierId,
          date: new Date(`${purchaseDate}T12:00:00`).getTime(),
          items: parsedRows.map((row) => ({
            productId: row.productId,
            quantity: row.quantity,
            weightKg: row.weightKg,
            price: row.price,
            total: Number((row.weightKg * row.price).toFixed(2)),
          })),
          total,
          calculation: calculation ?? undefined,
        });
      } else {
        // One product = one independent purchase record
        for (const row of parsedRows) {
          await purchaseOperation.create({
            supplierId: row.supplierId,
            date: new Date(`${purchaseDate}T12:00:00`).getTime(),
            items: [
              {
                productId: row.productId,
                quantity: row.quantity,
                weightKg: row.weightKg,
                price: row.price,
                total: Number((row.weightKg * row.price).toFixed(2)),
              },
            ],
            total: Number((row.weightKg * row.price).toFixed(2)),
            calculation: calculation ?? undefined,
          });
        }
      }

      try {
        localStorage.removeItem("hebrih-purchase-entry");
      } catch {}
      router.push("/purchases");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedSave);
    } finally {
      setSaving(false);
    }
  }

  function toggleProduct(productId: string) {
    setSelectedProductIds((current) =>
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]
    );
  }

  function confirmAddProducts() {
    if (selectedProductIds.length === 0) {
      setError(t.productRequired);
      return;
    }
    let targetSupplierId = singleSupplierId;
    if (!targetSupplierId) {
      if (suppliers.length > 0) {
        targetSupplierId = suppliers[0].id;
        setSingleSupplierId(targetSupplierId);
      } else {
        setError(t.supplierRequired);
        return;
      }
    }

    const existingIds = new Set(rows.map((r) => r.productId));
    const newIds = selectedProductIds.filter((id) => !existingIds.has(id));

    const nextRows: PurchaseRow[] = newIds.map((productId) => {
      const product = products.find((p) => p.id === productId);
      return {
        supplierId: targetSupplierId,
        productId,
        quantity: "0",
        weightKg: "0",
        price: product?.price.toString() ?? "0",
      };
    });

    if (nextRows.length > 0) {
      setRows((prev) => [...prev, ...nextRows]);
    }
    setSelectedProductIds([]);
    setShowProductSelector(false);
    setError("");
  }

  function handleSupplierSelect(supplierId: string) {
    setSingleSupplierId(supplierId);
    setRows((prev) => prev.map((r) => ({ ...r, supplierId })));
    setShowSupplierSelector(false);
  }

  const displayDate = useMemo(() => {
    try {
      const d = parseISODate(purchaseDate);
      if (Number.isNaN(d.getTime())) return purchaseDate;
      return formatSelectedDate(d, language);
    } catch {
      return purchaseDate;
    }
  }, [purchaseDate, language]);

  return (
    <div
      className={`${dashboardStyles.dashboard} ${styles.fullViewport} ${
        dark ? dashboardStyles.themeDark : dashboardStyles.themeLight
      }`}
    >
      {sidebarOpen && (
        <button
          className={styles.drawerOverlay}
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`${dashboardStyles.sidebar} ${styles.drawerSidebar} ${
          sidebarOpen ? dashboardStyles.sidebarOpen : ""
        } ${sidebarOpen ? styles.drawerSidebarOpen : ""}`}
      >
        <div className={dashboardStyles.sidebarBrand}>
          <div className={dashboardStyles.brandLogo}>
            <img src="/chicken.jpg" alt="Hebrih logo" />
          </div>
          <div>
            <h2>{shellT.brand}</h2>
            <span>{shellT.system}</span>
          </div>
        </div>

        <div className={dashboardStyles.sidebarDivider} />

        <nav className={dashboardStyles.sidebarNav}>
          {navigation.map(({ icon: Icon, key, path }) => (
            <button
              key={key}
              type="button"
              className={`${dashboardStyles.sidebarItem} ${key === "purchases" ? dashboardStyles.active : ""}`}
              onClick={() => navigate(path)}
            >
              <span className={dashboardStyles.sidebarIcon} aria-hidden="true">
                <Icon size={18} strokeWidth={2} />
              </span>
              <span>{navLabels[key]}</span>
            </button>
          ))}
        </nav>

        <div className={dashboardStyles.sidebarFooter}>
          <button
            type="button"
            className={dashboardStyles.onlineButton}
            onClick={() => navigate("/rvb")}
            aria-label={shellT.onlineAccess}
          >
            <span className={dashboardStyles.onlineButtonIcon} aria-hidden="true">
              <Store size={18} strokeWidth={2} />
            </span>
            <span>{shellT.onlineAccess}</span>
          </button>
        </div>
      </aside>

      <header className={styles.topHeader}>
        <div className={styles.topHeaderLeft}>
          <button
            type="button"
            className={styles.hamburgerButton}
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label={sidebarOpen ? "Close menu" : "Open menu"}
          >
            <Menu size={18} strokeWidth={2} aria-hidden="true" />
          </button>
          <div className={styles.topHeaderTitleBlock}>
            <h1>{editingPurchaseId ? t.editPurchase : t.addPurchase}</h1>
            <p>{editingPurchaseId ? t.editSubtitle : t.createSubtitle}</p>
          </div>
        </div>
        <div className={styles.topHeaderRight}>
          <button
            type="button"
            className={styles.headerIconButton}
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <Sun size={18} strokeWidth={2} aria-hidden="true" /> : <Moon size={18} strokeWidth={2} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className={styles.headerIconButton}
            onClick={() => router.push("/settings")}
            aria-label="Settings"
            title="Settings"
          >
            <SettingsIcon size={18} strokeWidth={2} aria-hidden="true" />
          </button>
          <span className={styles.headerDivider} aria-hidden="true" />
          <DateTimeDisplay language={language} />
        </div>
      </header>

      <main className={styles.contentFull}>
        <div className={styles.entryShell}>
          <button type="button" className={styles.backButton} onClick={handleCancel}>
            <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
            {t.backToPurchases}
          </button>

          {error && <div className={styles.errorBanner}>{error}</div>}

          <section className={styles.calculationCard}>
            <div className={styles.calculationHeader}>
              <h3>{t.calculations}</h3>
              <button type="button" className={styles.secondaryButton} onClick={() => setShowCalculation(true)}>
                {t.calculate}
              </button>
            </div>
            {calculation && (
              <div className={styles.calculationResult}>
                <div>
                  <span>{t.averageWeight}</span>
                  <strong>{calculation.averageWeightKg.toFixed(2)} {t.kg}</strong>
                </div>
                <div>
                  <span>{t.lossPercent}</span>
                  <strong>{calculation.averageLossPercent.toFixed(2)}%</strong>
                </div>
                <div>
                  <span>{t.averageLoss}</span>
                  <strong>{calculation.averageLossKg.toFixed(2)} {t.kg}</strong>
                </div>
              </div>
            )}
          </section>

          <section className={styles.workspaceCard}>
            <div className={styles.tableHeaderBar}>
              <span>
                {t.product} {rows.length > 0 ? `· ${rows.length}` : ""}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className={styles.ghostButton} onClick={() => setShowCalculation(true)}>
                  {t.calculate}
                </button>
                <button type="button" className={styles.ghostButton} onClick={() => setShowProductSelector(true)}>
                  <Plus size={14} strokeWidth={2} aria-hidden="true" />
                  {t.addProducts}
                </button>
              </div>
            </div>

            <div className={styles.tableContainer}>
              <div className={styles.tableHeader} role="row">
                <span>{t.product}</span>
                <span>{t.quantity}</span>
                <span>{t.weight}</span>
                <span>{t.pricePerKg}</span>
                <span>{t.total}</span>
                <span>{t.actions}</span>
              </div>

              <div className={styles.tableBody}>
                {loadingMeta ? (
                  <div className={styles.emptyTableState}>
                    <div className={styles.loadingPulse} />
                    <strong>{language === "fr" ? "Chargement..." : language === "ar" ? "جارٍ التحميل..." : "Loading..."}</strong>
                  </div>
                ) : rows.length === 0 ? (
                  <div className={styles.emptyTableState}>
                    <div className={styles.emptyIcon} aria-hidden="true">
                      <Package size={28} strokeWidth={2} />
                    </div>
                    <strong>{t.noProductsAdded}</strong>
                    <p>{t.noProductsHint}</p>
                    <button type="button" className={styles.primaryButton} onClick={() => setShowProductSelector(true)}>
                      <Plus size={14} strokeWidth={2} aria-hidden="true" />
                      {t.addProducts}
                    </button>
                  </div>
                ) : (
                  rows.map((row, index) => (
                    <div key={`${row.productId}-${index}`} className={styles.tableRow} role="row">
                      <span className={styles.productCell}>
                        <span className={styles.productIcon} aria-hidden="true">
                          <Package size={16} strokeWidth={2} />
                        </span>
                        <strong title={productName(row.productId)}>{productName(row.productId)}</strong>
                      </span>

                      <div className={styles.inputCell}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.quantity}
                          onChange={(e) => updateRow(index, "quantity", e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const next = document.querySelectorAll<HTMLInputElement>(`.${styles.tableRow} input`)[index * 3 + 1];
                              (next as HTMLElement)?.focus();
                            }
                          }}
                          inputMode="numeric"
                          aria-label={`${t.quantity} ${index + 1}`}
                        />
                      </div>

                      <div className={styles.inputCell}>
                        <div className={styles.inputWithSuffix}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.weightKg}
                            onChange={(e) => updateRow(index, "weightKg", e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const next = document.querySelectorAll<HTMLInputElement>(`.${styles.tableRow} input`)[index * 3 + 2];
                                (next as HTMLElement)?.focus();
                              }
                            }}
                            aria-label={`${t.weight} ${index + 1}`}
                          />
                          <span>{t.kg}</span>
                        </div>
                      </div>

                      <div className={styles.inputCell}>
                        <div className={styles.inputWithSuffix}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.price}
                            onChange={(e) => updateRow(index, "price", e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const all = document.querySelectorAll<HTMLInputElement>(`.${styles.tableRow} input`);
                                const nextRowFirst = all[(index + 1) * 3];
                                if (nextRowFirst) {
                                  nextRowFirst.focus();
                                } else {
                                  void savePurchase();
                                }
                              }
                            }}
                            aria-label={`${t.pricePerKg} ${index + 1}`}
                          />
                          <span>{currency}</span>
                        </div>
                      </div>

                      <strong className={styles.totalCell}>
                        {formatCurrency(Number(row.weightKg || 0) * Number(row.price || 0), currency)}
                      </strong>

                      <div className={styles.actionsCell}>
                        <button
                          type="button"
                          className={styles.iconAction}
                          onClick={() => removeRow(index)}
                          aria-label={`Remove ${productName(row.productId)}`}
                        >
                          <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <div className={styles.summaryCard}>
            <span>{t.purchaseTotal}</span>
            <strong>{formatCurrency(calculatePurchaseTotal(), currency)}</strong>
          </div>

          <footer className={styles.pageActions}>
            <button type="button" className={styles.secondaryButton} onClick={handleCancel} disabled={saving}>
              {t.cancel}
            </button>
            <button type="button" className={styles.primaryButton} onClick={savePurchase} disabled={saving}>
              {saving ? t.saving : t.savePurchase}
            </button>
          </footer>
        </div>
      </main>

      {showProductSelector && (
        <div className={styles.modalBackdrop} onClick={() => setShowProductSelector(false)}>
          <section
            className={`${styles.modal} ${styles.selectorModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="select-products-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className={styles.modalHeader}>
              <h2 id="select-products-title">{t.selectProducts}</h2>
              <button type="button" className={styles.closeButton} onClick={() => setShowProductSelector(false)} aria-label={t.close}>
                <X size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </header>

            <div className={styles.selectorList} role="group" aria-labelledby="select-products-title">
              {products.length === 0 ? (
                <p style={{ color: "var(--muted)", fontSize: "13px" }}>{t.noProducts}</p>
              ) : (
                products.map((product) => {
                  const selected = selectedProductIds.includes(product.id);
                  const alreadyAdded = rows.some((r) => r.productId === product.id);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      className={`${styles.productSelectCard} ${selected ? styles.productSelectCardSelected : ""} ${alreadyAdded ? styles.productSelectCardDisabled : ""}`}
                      onClick={() => {
                        if (alreadyAdded) return;
                        toggleProduct(product.id);
                      }}
                      aria-pressed={selected}
                      disabled={alreadyAdded}
                      title={alreadyAdded ? (language === "ar" ? "تمت إضافته مسبقاً" : language === "fr" ? "Déjà ajouté" : "Already added") : undefined}
                    >
                      <span className={`${styles.customCheckbox} ${selected ? styles.customCheckboxSelected : ""}`} aria-hidden="true">
                        {selected ? <Check size={12} strokeWidth={2.5} /> : null}
                      </span>
                      <span className={styles.productSelectIcon} aria-hidden="true">
                        <Package size={18} strokeWidth={2} />
                      </span>
                      <span className={styles.productSelectText}>
                        <strong>{product.name}</strong>
                        <small>
                          {formatCurrency(product.price, currency)} / {t.kg}
                        </small>
                      </span>
                      {alreadyAdded && <span className={styles.alreadyBadge}>✓</span>}
                    </button>
                  );
                })
              )}
            </div>

            {error && <div className={styles.formError}>{error}</div>}

            <footer className={styles.modalFooter}>
              <span className={styles.selectionCount} aria-live="polite">
                {selectedProductIds.length} {t.selected}
              </span>
              <div className={styles.modalFooterActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => setShowProductSelector(false)}>
                  {t.cancel}
                </button>
                <button type="button" className={styles.primaryButton} onClick={confirmAddProducts} disabled={selectedProductIds.length === 0}>
                  {t.continue}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      {showSupplierSelector && (
        <div className={styles.modalBackdrop} onClick={() => setShowSupplierSelector(false)}>
          <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h2>{t.supplier}</h2>
              <button type="button" className={styles.closeButton} onClick={() => setShowSupplierSelector(false)} aria-label={t.close}>
                <X size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </header>

            <div className={styles.selectorList}>
              {suppliers.length === 0 ? (
                <p style={{ color: "var(--muted)", fontSize: "13px" }}>{t.noSupplier}</p>
              ) : (
                suppliers.map((supplier) => {
                  const selected = singleSupplierId === supplier.id;
                  return (
                    <button
                      key={supplier.id}
                      type="button"
                      className={`${styles.productSelectCard} ${selected ? styles.productSelectCardSelected : ""}`}
                      onClick={() => handleSupplierSelect(supplier.id)}
                      aria-pressed={selected}
                    >
                      <span className={`${styles.customCheckbox} ${selected ? styles.customCheckboxSelected : ""}`} aria-hidden="true">
                        {selected ? <Check size={12} strokeWidth={2.5} /> : null}
                      </span>
                      <span className={styles.productSelectText}>
                        <strong>{supplier.name}</strong>
                        <small>{formatCurrency(Number(supplier.balance) || 0, currency)}</small>
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <footer className={styles.modalFooter}>
              <div className={styles.modalFooterActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => setShowSupplierSelector(false)}>
                  {t.cancel}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      {showCalculation && (
        <div className={styles.modalBackdrop}>
          <section className={styles.modal} role="dialog" aria-modal="true">
            <header className={styles.modalHeader}>
              <h2>{t.calculations}</h2>
              <button type="button" className={styles.closeButton} onClick={() => setShowCalculation(false)} aria-label={t.close}>
                <X size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </header>

            <div className={styles.calcForm}>
              <label>
                <span>{t.weightBefore}</span>
                <input
                  ref={weightBeforeRef}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={calculationForm.weightBeforeSlaughterKg}
                  onChange={(event) =>
                    setCalculationForm((current) => ({
                      ...current,
                      weightBeforeSlaughterKg: event.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      weightAfterRef.current?.focus();
                    }
                  }}
                />
              </label>

              <label>
                <span>{t.weightAfter}</span>
                <input
                  ref={weightAfterRef}
                  type="number"
                  min="0"
                  step="0.01"
                  value={calculationForm.weightAfterSlaughterKg}
                  onChange={(event) =>
                    setCalculationForm((current) => ({
                      ...current,
                      weightAfterSlaughterKg: event.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      amountRef.current?.focus();
                    }
                  }}
                />
              </label>

              <label>
                <span>{t.amount}</span>
                <input
                  ref={amountRef}
                  type="number"
                  min="0.01"
                  step="1"
                  value={calculationForm.amount}
                  onChange={(event) =>
                    setCalculationForm((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      calculateSlaughter();
                    }
                  }}
                />
              </label>

              {calculation && (
                <div className={styles.calculationResult}>
                  <div>
                    <span>{t.averageWeight}</span>
                    <strong>{calculation.averageWeightKg.toFixed(2)} {t.kg}</strong>
                  </div>
                  <div>
                    <span>{t.lossPercent}</span>
                    <strong>{calculation.averageLossPercent.toFixed(2)}%</strong>
                  </div>
                  <div>
                    <span>{t.averageLoss}</span>
                    <strong>{calculation.averageLossKg.toFixed(2)} {t.kg}</strong>
                  </div>
                </div>
              )}

              {error && <div className={styles.formError} style={{ margin: 0 }}>{error}</div>}
            </div>

            <footer className={styles.modalFooter}>
              <button type="button" className={styles.secondaryButton} onClick={() => setShowCalculation(false)}>
                {t.cancel}
              </button>
              <button type="button" className={styles.primaryButton} onClick={calculateSlaughter}>
                {t.calculate}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}


