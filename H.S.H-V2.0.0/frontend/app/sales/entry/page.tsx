"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
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
import { customerService } from "../../../src/services/customer.service";
import { saleService } from "../../../src/services/sale.service";
import { saleOperation } from "../../../src/services/operations/sale.operation";
import { saleEditOperation } from "../../../src/services/operations/sale-edit.operation";
import { settingsService } from "../../../src/services/settings.service";
import {
  DEFAULT_SETTINGS,
  formatCurrency,
  getDirection,
  SETTINGS_EVENT,
} from "../../../src/lib/settings";
import { formatDate as formatDateLib } from "../../../src/lib/datetime";

import type { Product } from "../../../src/types/entities/product";
import type { Customer } from "../../../src/types/entities/customer";
import type { Currency, Language } from "../../../src/types/settings/settings";

type SaleRow = {
  customerId: string;
  productId: string;
  quantity: string;
  weightKg: string;
  price: string;
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
    backToSales: "Back to Sales",
    addSale: "Add Sale",
    editSale: "Edit Sale",
    createSubtitle: "Create a new customer sale.",
    editSubtitle: "Update customer sale.",
    date: "Date",
    customer: "Customer",
    product: "Product",
    quantity: "Quantity",
    weight: "Weight",
    pricePerKg: "Price / Kg",
    total: "Total",
    actions: "Actions",
    noCustomer: "No customer selected",
    selectCustomer: "Select Customer",
    noProductsAdded: "No products added",
    noProductsHint: "Add products to build your sale.",
    addProducts: "Add Products",
    addMoreProducts: "Add Products",
    saleTotal: "Sale Total",
    cancel: "Cancel",
    saveSale: "Save Sale",
    saving: "Saving...",
    productRequired: "Please select at least one product.",
    customerRequired: "Please select a customer.",
    invalidRows: "Each sale row must have a valid weight, price and quantity.",
    invalidNumber: "Please enter valid numbers.",
    failedLoad: "Failed to load sale data.",
    failedSave: "Failed to save sale.",
    selectProducts: "Select Products",
    continue: "Continue",
    close: "Close",
    noProducts: "No products available.",
    selected: "selected",
    kg: "kg",
  },
  fr: {
    backToSales: "Retour aux ventes",
    addSale: "Ajouter une vente",
    editSale: "Modifier la vente",
    createSubtitle: "Créer une nouvelle vente client.",
    editSubtitle: "Mettre à jour la vente client.",
    date: "Date",
    customer: "Client",
    product: "Produit",
    quantity: "Quantité",
    weight: "Poids",
    pricePerKg: "Prix / Kg",
    total: "Total",
    actions: "Actions",
    noCustomer: "Aucun client sélectionné",
    selectCustomer: "Sélectionner un client",
    noProductsAdded: "Aucun produit ajouté",
    noProductsHint: "Ajoutez des produits pour composer votre vente.",
    addProducts: "Ajouter des produits",
    addMoreProducts: "Ajouter des produits",
    saleTotal: "Total de la vente",
    cancel: "Annuler",
    saveSale: "Enregistrer la vente",
    saving: "Enregistrement...",
    productRequired: "Veuillez sélectionner au moins un produit.",
    customerRequired: "Veuillez sélectionner un client.",
    invalidRows: "Chaque ligne de vente doit avoir un poids, un prix et une quantité valides.",
    invalidNumber: "Veuillez saisir des nombres valides.",
    failedLoad: "Échec du chargement des données de vente.",
    failedSave: "Échec de l'enregistrement de la vente.",
    selectProducts: "Sélectionner les produits",
    continue: "Continuer",
    close: "Fermer",
    noProducts: "Aucun produit disponible.",
    selected: "sélectionné(s)",
    kg: "kg",
  },
  ar: {
    backToSales: "العودة إلى المبيعات",
    addSale: "إضافة بيع",
    editSale: "تعديل البيع",
    createSubtitle: "إنشاء عملية بيع جديدة للزبون.",
    editSubtitle: "تحديث عملية بيع الزبون.",
    date: "التاريخ",
    customer: "الزبون",
    product: "السلعة",
    quantity: "الكمية",
    weight: "الوزن",
    pricePerKg: "السعر / كغ",
    total: "المجموع",
    actions: "الإجراءات",
    noCustomer: "لم يتم اختيار زبون",
    selectCustomer: "اختيار زبون",
    noProductsAdded: "لم يتم إضافة سلع",
    noProductsHint: "أضف السلع لبناء عملية البيع.",
    addProducts: "إضافة سلع",
    addMoreProducts: "إضافة سلع",
    saleTotal: "إجمالي البيع",
    cancel: "إلغاء",
    saveSale: "حفظ البيع",
    saving: "جارٍ الحفظ...",
    productRequired: "يرجى اختيار سلعة واحدة على الأقل.",
    customerRequired: "يرجى اختيار زبون.",
    invalidRows: "يجب أن يحتوي كل سطر بيع على وزن وسعر وكمية صحيحة.",
    invalidNumber: "يرجى إدخال أرقام صحيحة.",
    failedLoad: "فشل تحميل بيانات البيع.",
    failedSave: "فشل حفظ عملية البيع.",
    selectProducts: "اختيار السلع",
    continue: "متابعة",
    close: "إغلاق",
    noProducts: "لا توجد سلع متاحة.",
    selected: "محدد",
    kg: "كغ",
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

export default function SaleEntryPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [language, setLanguage] = useState<Language>(DEFAULT_SETTINGS.language);
  const [currency, setCurrency] = useState<Currency>(DEFAULT_SETTINGS.currency);

  const [saleDate, setSaleDate] = useState(() => toISODate(new Date()));
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [singleCustomerId, setSingleCustomerId] = useState<string>("");

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [showProductSelector, setShowProductSelector] = useState(false);
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

  // Load settings + products + customers
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
        const [loadedProducts, loadedCustomers] = await Promise.all([
          productService.getAll(),
          customerService.getAll(),
        ]);
        setProducts(loadedProducts);
        setCustomers(loadedCustomers);
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
      saleDate?: string;
      rows?: SaleRow[];
      selectedProductIds?: string[];
      selectedCustomerIds?: string[];
      editingSaleId?: string | null;
    } | null = null;

    try {
      const raw = localStorage.getItem("hebrih-sale-entry");
      if (raw) {
        payload = JSON.parse(raw);
      }
    } catch {}

    if (payload) {
      if (payload.saleDate && /^\d{4}-\d{2}-\d{2}$/.test(payload.saleDate)) {
        setSaleDate(payload.saleDate);
      } else if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
        setSaleDate(urlDate);
      }

      if (Array.isArray(payload.rows) && payload.rows.length > 0) {
        setRows(payload.rows);
        const firstCustomer = payload.rows[0]?.customerId;
        if (firstCustomer) setSingleCustomerId(firstCustomer);
        else if (payload.selectedCustomerIds && payload.selectedCustomerIds[0]) {
          setSingleCustomerId(payload.selectedCustomerIds[0]);
        }
      } else {
        if (payload.selectedCustomerIds && payload.selectedCustomerIds[0]) {
          setSingleCustomerId(payload.selectedCustomerIds[0]);
        }
        if (
          payload.selectedProductIds &&
          payload.selectedCustomerIds &&
          payload.selectedProductIds.length > 0 &&
          payload.selectedCustomerIds.length > 0
        ) {
          const nextRows: SaleRow[] = [];
          for (const customerId of payload.selectedCustomerIds) {
            for (const productId of payload.selectedProductIds) {
              const product = products.find((p) => p.id === productId);
              nextRows.push({
                customerId,
                productId,
                quantity: "0",
                weightKg: "0",
                price: product?.price.toString() ?? "0",
              });
            }
          }
          if (nextRows.length > 0) setRows(nextRows);
        }
      }

      if (payload.editingSaleId) setEditingSaleId(payload.editingSaleId);
      else if (urlEdit) setEditingSaleId(urlEdit);

      if (payload.selectedProductIds) setSelectedProductIds(payload.selectedProductIds);
    } else {
      if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
        setSaleDate(urlDate);
      }
      if (urlEdit) setEditingSaleId(urlEdit);
      if (urlEdit) {
        void (async () => {
          try {
            const s = await saleService.getById(urlEdit as string);
            if (s) {
              setEditingSaleId(s.id);
              setSaleDate(toISODate(new Date(s.date)));
              setRows(
                s.items.map((item) => ({
                  customerId: s.customerId,
                  productId: item.productId,
                  quantity: String(item.quantity),
                  weightKg: String(item.weightKg),
                  price: String(item.price),
                }))
              );
              setSingleCustomerId(s.customerId);
            }
          } catch {}
        })();
      }
    }
  }, [products]);

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "—";

  function updateRow(index: number, field: keyof SaleRow, value: string) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value, customerId: singleCustomerId || row.customerId } : row
      )
    );
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  function calculateSaleTotal() {
    return rows.reduce((sum, row) => {
      const weight = Number(row.weightKg);
      const price = Number(row.price);
      if (!Number.isFinite(weight) || !Number.isFinite(price)) return sum;
      return sum + weight * price;
    }, 0);
  }

  function handleCancel() {
    try {
      localStorage.removeItem("hebrih-sale-entry");
    } catch {}
    router.push("/sales");
  }

  async function saveSale() {
    setError("");
    if (rows.length === 0) {
      setError(t.invalidRows);
      return;
    }
    const effectiveCustomerId = singleCustomerId || rows[0]?.customerId;
    if (!effectiveCustomerId) {
      setError(t.customerRequired);
      return;
    }
    const normalizedRows = rows.map((r) => ({
      ...r,
      customerId: r.customerId || effectiveCustomerId,
    }));

    const parsedRows = normalizedRows.map((row) => ({
      customerId: row.customerId,
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

      if (editingSaleId) {
        const customerIds = [...new Set(parsedRows.map((row) => row.customerId))];
        if (customerIds.length !== 1) {
          setError(t.customerRequired);
          setSaving(false);
          return;
        }
        const customerId = customerIds[0];
        const total = Number(parsedRows.reduce((sum, row) => sum + row.weightKg * row.price, 0).toFixed(2));
        await saleEditOperation.edit({
          saleId: editingSaleId,
          customerId,
          date: new Date(`${saleDate}T12:00:00`).getTime(),
          items: parsedRows.map((row) => ({
            productId: row.productId,
            quantity: row.quantity,
            weightKg: row.weightKg,
            price: row.price,
            total: Number((row.weightKg * row.price).toFixed(2)),
          })),
          total,
        });
      } else {
        // One product = one independent sale record
        for (const row of parsedRows) {
          await saleOperation.create({
            customerId: row.customerId,
            date: new Date(`${saleDate}T12:00:00`).getTime(),
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
          });
        }
      }

      try {
        localStorage.removeItem("hebrih-sale-entry");
      } catch {}
      router.push("/sales");
    } catch (err) {
      const message = err instanceof Error ? err.message : t.failedSave;
      if (message.includes("Insufficient")) {
        setError(
          language === "fr"
            ? "Stock insuffisant. Vérifiez la quantité ou le poids disponible."
            : language === "ar"
              ? "المخزون غير كافٍ. تحقق من الكمية أو الوزن المتاح."
              : "Insufficient stock. Check quantity or weight availability."
        );
      } else {
        setError(message);
      }
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
    let targetCustomerId = singleCustomerId;
    if (!targetCustomerId) {
      if (customers.length > 0) {
        targetCustomerId = customers[0].id;
        setSingleCustomerId(targetCustomerId);
      } else {
        setError(t.customerRequired);
        return;
      }
    }

    const existingIds = new Set(rows.map((r) => r.productId));
    const newIds = selectedProductIds.filter((id) => !existingIds.has(id));

    const nextRows: SaleRow[] = newIds.map((productId) => {
      const product = products.find((p) => p.id === productId);
      return {
        customerId: targetCustomerId,
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

  const displayDate = useMemo(() => {
    try {
      const d = parseISODate(saleDate);
      if (Number.isNaN(d.getTime())) return saleDate;
      return formatSelectedDate(d, language);
    } catch {
      return saleDate;
    }
  }, [saleDate, language]);

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
              className={`${dashboardStyles.sidebarItem} ${key === "sales" ? dashboardStyles.active : ""}`}
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
            <h1>{editingSaleId ? t.editSale : t.addSale}</h1>
            <p>{editingSaleId ? t.editSubtitle : t.createSubtitle}</p>
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
            {t.backToSales}
          </button>

          {error && <div className={styles.errorBanner}>{error}</div>}

          <section className={styles.workspaceCard}>
            <div className={styles.tableHeaderBar}>
              <span>
                {t.product} {rows.length > 0 ? `· ${rows.length}` : ""}
              </span>
              <button type="button" className={styles.ghostButton} onClick={() => setShowProductSelector(true)}>
                <Plus size={14} strokeWidth={2} aria-hidden="true" />
                {t.addProducts}
              </button>
            </div>

            <div className={styles.tableContainer}>
              <div className={styles.tableHeader} role="row">
                <span>{t.customer}</span>
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
                    <div key={`${row.customerId}-${row.productId}-${index}`} className={styles.tableRow} role="row">
                      <span className={styles.customerCell} title={customerName(row.customerId)}>
                        {customerName(row.customerId)}
                      </span>
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
                                  void saveSale();
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
            <span>{t.saleTotal}</span>
            <strong>{formatCurrency(calculateSaleTotal(), currency)}</strong>
          </div>

          <p
            style={{
              margin: 0,
              color: "var(--muted)",
              fontSize: "12px",
              lineHeight: 1.5,
            }}
          >
            {language === "ar"
              ? "يمكن تجاوز سعر البيع لهذه العملية فقط — لا يتغير السعر العام للمنتج."
              : language === "fr"
                ? "Le prix peut être remplacé pour cette vente uniquement — le prix global du produit reste inchangé."
                : "Price can be overridden for this sale only — global product price stays unchanged."}
          </p>

          <footer className={styles.pageActions}>
            <button type="button" className={styles.secondaryButton} onClick={handleCancel} disabled={saving}>
              {t.cancel}
            </button>
            <button type="button" className={styles.primaryButton} onClick={saveSale} disabled={saving}>
              {saving ? t.saving : t.saveSale}
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
    </div>
  );
}


