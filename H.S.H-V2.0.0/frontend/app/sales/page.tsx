"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDbSync } from "../../src/hooks/useDbSync";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Package,
  Pencil,
  Plus,
  Scale,
  Search,
  ShoppingBag,
  Trash2,
  TrendingUp,
  Users,
  X,
} from "lucide-react";

import { useRouter } from "next/navigation";

import AppShell from "../../src/components/layout/AppShell";
import { productService } from "../../src/services/product.service";
import { customerService } from "../../src/services/customer.service";
import { saleService } from "../../src/services/sale.service";
import { saleReversalOperation } from "../../src/services/operations/sale-reversal.operation";
import { settingsService } from "../../src/services/settings.service";
import {
  DEFAULT_SETTINGS,
  formatCurrency,
  SETTINGS_EVENT,
} from "../../src/lib/settings";
import { formatDate as formatDateLib } from "../../src/lib/datetime";

import type { Product } from "../../src/types/entities/product";
import type { Customer } from "../../src/types/entities/customer";
import type { Sale } from "../../src/types/entities/sale";
import type { Currency, Language } from "../../src/types/settings/settings";
import StyledDatePicker from "../../src/components/common/StyledDatePicker";

import styles from "./page.module.css";

type SaleRow = {
  customerId: string;
  productId: string;
  quantity: string;
  weightKg: string;
  price: string;
};

function getDayBounds(date: Date): { start: number; end: number } {
  const start = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
  const end = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();
  return { start, end };
}

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
    title: "Sales",
    subtitle: "Manage customer sales, products, pricing and transaction history.",
    search: "Search sales...",
    searchPlaceholder: "Search sales by customer, product, date...",
    sales: "sales",
    sale: "Sale",
    addSale: "Add Sale",
    editSale: "Edit Sale",
    deleteSale: "Delete Sale",
    deleteWarning:
      "Deleting this sale will reverse its inventory and customer balance. This action cannot be undone.",
    deleteConfirm: "Delete Permanently",
    deleteAvailable: "Confirm available in",
    deleting: "Deleting...",
    failedDelete: "Failed to delete sale.",
    loading: "Loading sales...",
    noSales: "No sales yet",
    noSalesFound: "No sales found",
    noSalesForDate: "No sales for this date",
    addFirst: "Add your first sale to begin.",
    tryAnother: "Try another search term.",
    date: "Date",
    customer: "Customer",
    product: "Product",
    quantity: "Quantity",
    weight: "Weight",
    pricePerKg: "Price / kg",
    total: "Total",
    actions: "Actions",
    selectProducts: "Select Products",
    selectCustomers: "Select Customers",
    continue: "Continue",
    back: "Back",
    confirm: "Confirm",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    addRows: "Add Sale Rows",
    saveSale: "Save Sale",
    saving: "Saving...",
    noProducts: "No products available.",
    noCustomers: "No customers available.",
    selected: "selected",
    required: "Required",
    invalidNumber: "Please enter valid numbers.",
    invalidRows:
      "Each sale row must have a valid weight, price and quantity.",
    customerRequired: "Please select at least one customer.",
    productRequired: "Please select at least one product.",
    saleCreated: "Sale created successfully.",
    failedLoad: "Failed to load sale data.",
    failedSave: "Failed to save sale.",
    insufficientStock:
      "Insufficient stock. Check quantity or weight availability.",
    currency: "Currency",
    totalSales: "Total Sales",
    totalSalesSub: "Registered sales",
    totalValue: "Total Sales Value",
    totalValueSub: "Combined sales value",
    totalWeight: "Total Sales Weight",
    totalWeightSub: "Combined weight",
    customersInvolved: "Customers Involved",
    customersInvolvedSub: "Unique customers",
    permanentAction: "PERMANENT ACTION",
    kg: "kg",
  },

  fr: {
    title: "Ventes",
    subtitle: "Gérer les ventes, clients, produits et historique des transactions.",
    search: "Rechercher des ventes...",
    searchPlaceholder: "Rechercher par client, produit, date...",
    sales: "ventes",
    sale: "Vente",
    addSale: "Ajouter une vente",
    editSale: "Modifier la vente",
    deleteSale: "Supprimer la vente",
    deleteWarning:
      "La suppression de cette vente annulera son stock et le solde du client. Cette action est irréversible.",
    deleteConfirm: "Supprimer définitivement",
    deleteAvailable: "Confirmation disponible dans",
    deleting: "Suppression...",
    failedDelete: "Échec de la suppression de la vente.",
    loading: "Chargement des ventes...",
    noSales: "Aucune vente pour le moment",
    noSalesFound: "Aucune vente trouvée",
    noSalesForDate: "Aucune vente pour cette date",
    addFirst: "Ajoutez votre première vente pour commencer.",
    tryAnother: "Essayez un autre terme de recherche.",
    date: "Date",
    customer: "Client",
    product: "Produit",
    quantity: "Quantité",
    weight: "Poids",
    pricePerKg: "Prix / kg",
    total: "Total",
    actions: "Actions",
    selectProducts: "Sélectionner les produits",
    selectCustomers: "Sélectionner les clients",
    continue: "Continuer",
    back: "Retour",
    confirm: "Confirmer",
    cancel: "Annuler",
    edit: "Modifier",
    delete: "Supprimer",
    addRows: "Ajouter les lignes de vente",
    saveSale: "Enregistrer la vente",
    saving: "Enregistrement...",
    noProducts: "Aucun produit disponible.",
    noCustomers: "Aucun client disponible.",
    selected: "sélectionné(s)",
    required: "Obligatoire",
    invalidNumber: "Veuillez saisir des nombres valides.",
    invalidRows:
      "Chaque ligne de vente doit avoir un poids, un prix et une quantité valides.",
    customerRequired: "Veuillez sélectionner au moins un client.",
    productRequired: "Veuillez sélectionner au moins un produit.",
    saleCreated: "Vente créée avec succès.",
    failedLoad: "Échec du chargement des données de vente.",
    failedSave: "Échec de l'enregistrement de la vente.",
    insufficientStock:
      "Stock insuffisant. Vérifiez la quantité ou le poids disponible.",
    currency: "Devise",
    totalSales: "Total Ventes",
    totalSalesSub: "Ventes enregistrées",
    totalValue: "Valeur Totale Ventes",
    totalValueSub: "Valeur combinée",
    totalWeight: "Poids Total Ventes",
    totalWeightSub: "Poids combiné",
    customersInvolved: "Clients Impliqués",
    customersInvolvedSub: "Clients uniques",
    permanentAction: "ACTION PERMANENTE",
    kg: "kg",
  },

  ar: {
    title: "المبيعات",
    subtitle: "إدارة المبيعات والعملاء والمنتجات وسجل المعاملات.",
    search: "البحث عن المبيعات...",
    searchPlaceholder: "البحث بالزبون أو السلعة أو التاريخ...",
    sales: "مبيعات",
    sale: "بيع",
    addSale: "إضافة بيع",
    editSale: "تعديل البيع",
    deleteSale: "حذف البيع",
    deleteWarning:
      "حذف عملية البيع سيؤدي إلى عكس الكمية من المخزون ورصيد الزبون. هذا الإجراء لا يمكن التراجع عنه.",
    deleteConfirm: "حذف نهائي",
    deleteAvailable: "يمكن التأكيد بعد",
    deleting: "جارٍ الحذف...",
    failedDelete: "فشل حذف عملية البيع.",
    loading: "جارٍ تحميل المبيعات...",
    noSales: "لا توجد مبيعات بعد",
    noSalesFound: "لم يتم العثور على مبيعات",
    noSalesForDate: "لا توجد مبيعات لهذا التاريخ",
    addFirst: "أضف أول عملية بيع للبدء.",
    tryAnother: "جرّب مصطلح بحث آخر.",
    date: "التاريخ",
    customer: "الزبون",
    product: "السلعة",
    quantity: "الكمية",
    weight: "الوزن",
    pricePerKg: "السعر / كغ",
    total: "المجموع",
    actions: "الإجراءات",
    selectProducts: "اختيار السلع",
    selectCustomers: "اختيار الزبائن",
    continue: "متابعة",
    back: "رجوع",
    confirm: "تأكيد",
    cancel: "إلغاء",
    edit: "تعديل",
    delete: "حذف",
    addRows: "إضافة أسطر البيع",
    saveSale: "حفظ البيع",
    saving: "جارٍ الحفظ...",
    noProducts: "لا توجد سلع متاحة.",
    noCustomers: "لا يوجد زبائن متاحون.",
    selected: "محدد",
    required: "مطلوب",
    invalidNumber: "يرجى إدخال أرقام صحيحة.",
    invalidRows: "يجب أن يحتوي كل سطر بيع على وزن وسعر وكمية صحيحة.",
    customerRequired: "يرجى اختيار زبون واحد على الأقل.",
    productRequired: "يرجى اختيار سلعة واحدة على الأقل.",
    saleCreated: "تم إنشاء عملية البيع بنجاح.",
    failedLoad: "فشل تحميل بيانات البيع.",
    failedSave: "فشل حفظ عملية البيع.",
    insufficientStock: "المخزون غير كافٍ. تحقق من الكمية أو الوزن المتاح.",
    currency: "العملة",
    totalSales: "إجمالي المبيعات",
    totalSalesSub: "مبيعات مسجلة",
    totalValue: "إجمالي قيمة المبيعات",
    totalValueSub: "القيمة الإجمالية",
    totalWeight: "إجمالي وزن المبيعات",
    totalWeightSub: "الوزن الإجمالي",
    customersInvolved: "الزبائن المشاركون",
    customersInvolvedSub: "زبائن منفردون",
    permanentAction: "إجراء دائم",
    kg: "كغ",
  },
} as const;

export default function SalesPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);

  const [search, setSearch] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Sale | null>(null);
  const [deleteCountdown, setDeleteCountdown] = useState(3.5);
  const [deleting, setDeleting] = useState(false);

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [language, setLanguage] = useState<Language>(
    DEFAULT_SETTINGS.language,
  );

  const [currency, setCurrency] = useState<Currency>(
    DEFAULT_SETTINGS.currency,
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showProductSelector, setShowProductSelector] = useState(false);
  const [showCustomerSelector, setShowCustomerSelector] = useState(false);

  const t = TRANSLATIONS[language];

  const deleteStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!deleteTarget) {
      deleteStartRef.current = null;
      return;
    }

    deleteStartRef.current = Date.now();
    setDeleteCountdown(3.5);

    const interval = window.setInterval(() => {
      if (deleteStartRef.current === null) return;
      const elapsed = Date.now() - deleteStartRef.current;
      const remaining = Math.max(0, 3.5 - elapsed / 1000);
      const displayOneDecimal = Math.ceil(remaining * 10) / 10;
      setDeleteCountdown(displayOneDecimal > 0 ? displayOneDecimal : 0);
      if (remaining <= 0) {
        window.clearInterval(interval);
      }
    }, 50);

    return () => window.clearInterval(interval);
  }, [deleteTarget]);

  async function loadSettings() {
    const settings = await settingsService.get();

    setLanguage(settings?.language ?? DEFAULT_SETTINGS.language);
    setCurrency(settings?.currency ?? DEFAULT_SETTINGS.currency);
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
      // keep existing error handling via sales load
    }
  }

  async function loadSalesForDate(date: Date) {
    setLoading(true);
    setError("");
    try {
      const { start, end } = getDayBounds(date);
      const loadedSales = await saleService.getByDateRange(start, end);
      setSales(loadedSales);
    } catch {
      setError(t.failedLoad);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
    void loadMeta();

    const handleSettingsChange = () => {
      void loadSettings();
    };

    window.addEventListener(SETTINGS_EVENT, handleSettingsChange);

    return () => {
      window.removeEventListener(SETTINGS_EVENT, handleSettingsChange);
    };
  }, []);

  useEffect(() => {
    void loadSalesForDate(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  useDbSync(() => {
    void loadSalesForDate(selectedDate);
  }, [selectedDate]);

  const filteredSales = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return sales;
    }

    return sales.filter((sale) => {
      const customer = customers.find((item) => item.id === sale.customerId);

      const productNames = sale.items
        .map(
          (item) =>
            products.find((product) => product.id === item.productId)?.name,
        )
        .filter(Boolean)
        .join(" ");

      return [
        customer?.name,
        productNames,
        String(sale.total),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [sales, customers, products, search]);

  // KPI — derived from selected date's sales only
  const totalSales = sales.length;
  const totalValue = useMemo(
    () => sales.reduce((sum, s) => sum + (Number(s.total) || 0), 0),
    [sales],
  );
  const totalWeight = useMemo(
    () =>
      sales.reduce(
        (sum, s) =>
          sum + s.items.reduce((sub, item) => sub + (Number(item.weightKg) || 0), 0),
        0,
      ),
    [sales],
  );
  const customersInvolved = useMemo(
    () => new Set(sales.map((s) => s.customerId)).size,
    [sales],
  );

  function startSale() {
    setError("");
    setSelectedProductIds([]);
    setSelectedCustomerIds([]);
    setShowProductSelector(true);
  }

  function startEditSale(sale: Sale) {
    setError("");
    const iso = toISODate(new Date(sale.date));
    const rowsForEntry = sale.items.map((item) => ({
      customerId: sale.customerId,
      productId: item.productId,
      quantity: String(item.quantity),
      weightKg: String(item.weightKg),
      price: String(item.price),
    }));
    const payload = {
      saleDate: iso,
      rows: rowsForEntry,
      selectedProductIds: sale.items.map((item) => item.productId),
      selectedCustomerIds: [sale.customerId],
      editingSaleId: sale.id,
    };
    try {
      localStorage.setItem("hebrih-sale-entry", JSON.stringify(payload));
    } catch {}
    router.push(`/sales/entry?date=${iso}&edit=${sale.id}`);
  }

  function startDeleteSale(sale: Sale) {
    setError("");
    setDeleteTarget(sale);
    setDeleteCountdown(3.5);
    deleteStartRef.current = Date.now();
  }

  async function confirmDeleteSale() {
    if (!deleteTarget || deleting) {
      return;
    }
    if (deleteStartRef.current !== null) {
      const elapsed = Date.now() - deleteStartRef.current;
      if (elapsed < 3500) {
        return;
      }
    } else if (deleteCountdown > 0) {
      return;
    }

    try {
      setDeleting(true);
      setError("");

      await saleReversalOperation.delete(deleteTarget.id);
      await loadSalesForDate(selectedDate);
      await loadMeta();

      setDeleteTarget(null);
      setDeleteCountdown(3.5);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedDelete);
    } finally {
      setDeleting(false);
    }
  }

  function toggleProduct(productId: string) {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  function createSaleRows() {
    if (selectedProductIds.length === 0) {
      setError(t.productRequired);
      return;
    }

    setError("");
    setShowProductSelector(false);
    setShowCustomerSelector(true);
  }

  function toggleCustomer(customerId: string) {
    setSelectedCustomerIds((current) =>
      current.includes(customerId)
        ? current.filter((id) => id !== customerId)
        : [...current, customerId],
    );
  }

  function createCustomerProductRows() {
    if (selectedCustomerIds.length === 0) {
      setError(t.customerRequired);
      return;
    }

    const nextRows: SaleRow[] = [];

    for (const customerId of selectedCustomerIds) {
      for (const productId of selectedProductIds) {
        const product = products.find((item) => item.id === productId);

        nextRows.push({
          customerId,
          productId,
          quantity: "0",
          weightKg: "0",
          price: product?.price.toString() ?? "0",
        });
      }
    }

    const saleDateStr = toISODate(selectedDate);
    const payload = {
      saleDate: saleDateStr,
      rows: nextRows,
      selectedProductIds,
      selectedCustomerIds,
      editingSaleId: null,
    };
    try {
      localStorage.setItem("hebrih-sale-entry", JSON.stringify(payload));
    } catch {}
    setError("");
    setShowCustomerSelector(false);
    router.push(`/sales/entry?date=${saleDateStr}`);
  }

  function customerName(id: string) {
    return customers.find((customer) => customer.id === id)?.name ?? "—";
  }

  function productName(id: string) {
    return products.find((product) => product.id === id)?.name ?? "—";
  }

  function availableStock(productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return null;
    return `${product.quantity} · ${product.weightKg.toFixed(2)} ${t.kg}`;
  }

  return (
    <AppShell activePage="sales" showHeader={false}>
      <main className={styles.salesPage}>
        <div className={styles.salesShell}>
          {/* Unified Sales header — brand / search / date / add */}
          <section className={styles.salesHeader}>
            <div className={styles.salesHeaderBrand}>
              <div className={styles.salesLogo}>
                <img src="/chicken.jpg" alt="" />
              </div>
              <div className={styles.salesTitle}>
                <h1>{t.title}</h1>
                <p>{t.subtitle}</p>
              </div>
            </div>

            <div className={styles.searchBox}>
              <span aria-hidden="true">
                <Search size={18} strokeWidth={2} aria-hidden="true" />
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t.search}
                aria-label={t.search}
              />
            </div>

            <StyledDatePicker
              value={toISODate(selectedDate)}
              onChange={(v) => {
                if (v) {
                  const d = parseISODate(v);
                  if (d) {
                    const n = new Date(d);
                    n.setHours(0, 0, 0, 0);
                    setSelectedDate(n);
                  }
                }
              }}
              language={language}
              className={styles.toolbarDate}
            />

            <button
              type="button"
              className={styles.primaryButton}
              onClick={startSale}
            >
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              {t.addSale}
            </button>
          </section>

          {/* KPI Cards — RED→YELLOW→RED→YELLOW (same sequence as Purchases) */}
          <section className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconSales}`}>
                <TrendingUp size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.totalSales}</span>
                <strong className={styles.summaryValue}>{totalSales}</strong>
                <small className={styles.summarySub}>{t.totalSalesSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconValue}`}>
                <CircleDollarSign size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.totalValue}</span>
                <strong className={styles.summaryValue}>{formatCurrency(totalValue, currency)}</strong>
                <small className={styles.summarySub}>{t.totalValueSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconWeight}`}>
                <Scale size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.totalWeight}</span>
                <strong className={styles.summaryValue}>{totalWeight.toFixed(2)} {t.kg}</strong>
                <small className={styles.summarySub}>{t.totalWeightSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconCustomers}`}>
                <Users size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.customersInvolved}</span>
                <strong className={styles.summaryValue}>{customersInvolved}</strong>
                <small className={styles.summarySub}>{t.customersInvolvedSub}</small>
              </div>
            </div>
          </section>

          {error && !showProductSelector && !showCustomerSelector && !deleteTarget && (
            <div className={styles.errorBanner}>{error}</div>
          )}

          <section className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <span>{t.customer}</span>
              <span>{t.product}</span>
              <span>{t.weight}</span>
              <span>{t.pricePerKg}</span>
              <span>{t.total}</span>
              <span>{t.actions}</span>
            </div>

            {loading ? (
              <div className={styles.emptyState}>
                <div className={styles.loadingPulse} />
                <strong>{t.loading}</strong>
              </div>
            ) : (() => {
              const displayRows = filteredSales.flatMap((sale) =>
                sale.items.map((item, itemIdx) => ({ sale, item, itemIdx })),
              );
              if (displayRows.length === 0) {
                return (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon} aria-hidden="true">
                      <ShoppingBag size={32} strokeWidth={2} />
                    </div>
                    <strong>{sales.length === 0 ? t.noSalesForDate : t.noSalesFound}</strong>
                    <p>{sales.length === 0 ? t.addFirst : t.tryAnother}</p>
                  </div>
                );
              }
              return (
                <div className={styles.saleRows}>
                  {displayRows.map(({ sale, item, itemIdx }) => (
                    <article
                      key={`${sale.id}-${item.productId}-${itemIdx}`}
                      className={styles.saleRow}
                      onDoubleClick={() => startEditSale(sale)}
                    >
                      <span className={styles.customerText}>{customerName(sale.customerId)}</span>
                      <span className={styles.productCell}>
                        <span className={styles.productIcon} aria-hidden="true">
                          <Package size={14} strokeWidth={2} />
                        </span>
                        {productName(item.productId)}
                      </span>
                      <span className={styles.weightText}>
                        {Number(item.weightKg).toFixed(2)} {t.kg}
                      </span>
                      <span className={styles.priceText}>{formatCurrency(item.price, currency)}</span>
                      <strong className={styles.totalValue}>{formatCurrency(item.total, currency)}</strong>
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.rowEditButton}
                          onClick={(event) => {
                            event.stopPropagation();
                            startEditSale(sale);
                          }}
                          aria-label={`${t.edit} ${sale.id}`}
                        >
                          <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                          {t.edit}
                        </button>
                        <button
                          type="button"
                          className={styles.rowDeleteButton}
                          onClick={(event) => {
                            event.stopPropagation();
                            startDeleteSale(sale);
                          }}
                          aria-label={t.deleteSale}
                        >
                          <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                          {t.delete}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              );
            })()}
          </section>

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
                  <button type="button" className={styles.closeButton} onClick={() => setShowProductSelector(false)} aria-label="Close">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </header>

                <div className={styles.selectorList} role="group" aria-labelledby="select-products-title">
                  {products.length === 0 ? (
                    <p style={{ color: "var(--muted)", fontSize: "13px" }}>{t.noProducts}</p>
                  ) : (
                    products.map((product) => {
                      const selected = selectedProductIds.includes(product.id);
                      return (
                        <button
                          key={product.id}
                          type="button"
                          className={`${styles.productSelectCard} ${selected ? styles.productSelectCardSelected : ""}`}
                          onClick={() => toggleProduct(product.id)}
                          aria-pressed={selected}
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
                              {formatCurrency(product.price, currency)} / {t.kg} · {availableStock(product.id)}
                            </small>
                          </span>
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
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={createSaleRows}
                      disabled={selectedProductIds.length === 0}
                    >
                      {t.continue}
                    </button>
                  </div>
                </footer>
              </section>
            </div>
          )}

          {showCustomerSelector && (
            <div className={styles.modalBackdrop} onClick={() => setShowCustomerSelector(false)}>
              <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <header className={styles.modalHeader}>
                  <h2>{t.selectCustomers}</h2>
                  <button type="button" className={styles.closeButton} onClick={() => setShowCustomerSelector(false)} aria-label="Close">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </header>

                <div className={styles.selectorList}>
                  {customers.length === 0 ? (
                    <p style={{ color: "var(--muted)", fontSize: "13px" }}>{t.noCustomers}</p>
                  ) : (
                    customers.map((customer) => (
                      <label key={customer.id} className={styles.selectorItem}>
                        <input
                          type="checkbox"
                          checked={selectedCustomerIds.includes(customer.id)}
                          onChange={() => toggleCustomer(customer.id)}
                        />
                        <span>
                          <strong>{customer.name}</strong>
                          <small>{formatCurrency(Number(customer.balance) || 0, currency)}</small>
                        </span>
                      </label>
                    ))
                  )}
                </div>

                {error && <div className={styles.formError}>{error}</div>}

                <footer className={styles.modalFooter}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      setShowCustomerSelector(false);
                      setShowProductSelector(true);
                    }}
                  >
                    {t.back}
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={createCustomerProductRows}>
                    {t.continue}
                  </button>
                </footer>
              </section>
            </div>
          )}

          {deleteTarget && (
            <div className={styles.modalBackdrop}>
              <section className={styles.deleteModalCompact} role="dialog" aria-modal="true" aria-labelledby="delete-title">
                <div className={styles.warningIconSmall} aria-hidden="true">
                  <AlertTriangle size={20} strokeWidth={2} />
                </div>
                <h2 id="delete-title">{t.deleteSale}</h2>
                <p className={styles.deleteDescription}>{t.deleteWarning}</p>
                {deleteTarget && (
                  <p className={styles.deleteContext}>
                    {customerName(deleteTarget.customerId)} · {deleteTarget.items.map((it) => productName(it.productId)).join(", ")} · {formatCurrency(deleteTarget.total, currency)}
                  </p>
                )}
                <div className={styles.circularCountdown} aria-live="polite">
                  <div className={styles.circleWrapper} aria-hidden="true">
                    <svg width="64" height="64" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="28" className={styles.circleTrack} />
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        className={styles.circleProgress}
                        style={{
                          strokeDasharray: `${2 * Math.PI * 28}`,
                          strokeDashoffset: `${2 * Math.PI * 28 * (deleteCountdown / 3.5)}`,
                        }}
                      />
                    </svg>
                    <span className={styles.circleText}>
                      {deleteCountdown > 0 ? deleteCountdown.toFixed(1) : "0.0"}
                    </span>
                  </div>
                  <span className={styles.circleLabel}>
                    {deleteCountdown > 0 ? "Confirm deletion" : t.deleteConfirm}
                  </span>
                </div>
                {error && <div className={styles.formError}>{error}</div>}
                <div className={styles.modalFooterCompact}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      if (!deleting) {
                        setDeleteTarget(null);
                        setDeleteCountdown(3.5);
                        deleteStartRef.current = null;
                      }
                    }}
                    disabled={deleting}
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => void confirmDeleteSale()}
                    disabled={deleteCountdown > 0 || deleting}
                  >
                    <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                    {deleting ? t.deleting : t.deleteConfirm}
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}


