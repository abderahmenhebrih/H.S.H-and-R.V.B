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
  ClipboardList,
  Package,
  Pencil,
  Plus,
  Scale,
  Search,
  Trash2,
  Truck,
  X,
} from "lucide-react";

import { useRouter } from "next/navigation";

import AppShell from "../../src/components/layout/AppShell";
import { productService } from "../../src/services/product.service";
import { supplierService } from "../../src/services/supplier.service";
import { purchaseService } from "../../src/services/purchase.service";
import { purchaseCalculationOperation } from "../../src/services/operations/purchase-calculation.operation";
import { purchaseReversalOperation } from "../../src/services/operations/purchase-reversal.operation";
import { settingsService } from "../../src/services/settings.service";
import {
  DEFAULT_SETTINGS,
  formatCurrency,
  SETTINGS_EVENT,
} from "../../src/lib/settings";
import { formatDate as formatDateLib } from "../../src/lib/datetime";

import type { Product } from "../../src/types/entities/product";
import type { Supplier } from "../../src/types/entities/supplier";
import type { Purchase } from "../../src/types/entities/purchase";
import type { PurchaseCalculation } from "../../src/types/entities/purchase-calculation";
import type { Currency, Language } from "../../src/types/settings/settings";
import StyledDatePicker from "../../src/components/common/StyledDatePicker";

import styles from "./page.module.css";

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
    search: "Search purchases...",
    searchPlaceholder: "Search purchases by supplier, product, date...",
    purchases: "purchases",
    purchase: "Purchase",
    addPurchase: "Add Purchase",
    editPurchase: "Edit Purchase",
    deletePurchase: "Delete Purchase",
    deleteWarning:
      "Deleting this purchase will reverse its inventory and supplier balance. This action cannot be undone.",
    deleteConfirm: "Delete Permanently",
    deleteAvailable: "Confirm available in",
    deleting: "Deleting...",
    failedDelete: "Failed to delete purchase.",
    loading: "Loading purchases...",
    noPurchases: "No purchases yet",
    noPurchasesFound: "No purchases found",
    noPurchasesForDate: "No purchases for this date",
    addFirst: "Add your first purchase to begin.",
    tryAnother: "Try another search term.",
    date: "Date",
    supplier: "Supplier",
    product: "Product",
    quantity: "Quantity",
    weight: "Weight",
    pricePerKg: "Price / kg",
    total: "Total",
    actions: "Actions",
    selectProducts: "Select Products",
    selectSuppliers: "Select Suppliers",
    continue: "Continue",
    back: "Back",
    confirm: "Confirm",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    addRows: "Add Purchase Rows",
    savePurchase: "Save Purchase",
    saving: "Saving...",
    calculate: "Calculations",
    calculations: "Slaughter Calculations",
    weightBefore: "Weight Before Slaughter",
    weightAfter: "Weight After Slaughter",
    amount: "Amount",
    averageWeight: "Average Weight",
    lossPercent: "Loss %",
    averageLoss: "Average Weight Lost",
    noProducts: "No products available.",
    noSuppliers: "No suppliers available.",
    selected: "selected",
    required: "Required",
    invalidNumber: "Please enter valid numbers.",
    invalidRows:
      "Each purchase row must have a valid weight, price and quantity.",
    supplierRequired: "Please select at least one supplier.",
    productRequired: "Please select at least one product.",
    purchaseCreated: "Purchase created successfully.",
    failedLoad: "Failed to load purchase data.",
    failedSave: "Failed to save purchase.",
    currency: "Currency",
    totalPurchases: "Total Purchases",
    totalPurchasesSub: "Registered purchases",
    totalValue: "Total Purchase Value",
    totalValueSub: "Combined purchase value",
    totalWeight: "Total Purchase Weight",
    totalWeightSub: "Combined weight",
    suppliersInvolved: "Suppliers Involved",
    suppliersInvolvedSub: "Unique suppliers",
    permanentAction: "PERMANENT ACTION",
    kg: "kg",
  },

  fr: {
    search: "Rechercher des achats...",
    searchPlaceholder: "Rechercher par fournisseur, produit, date...",
    purchases: "achats",
    purchase: "Achat",
    addPurchase: "Ajouter un achat",
    editPurchase: "Modifier l'achat",
    deletePurchase: "Supprimer l'achat",
    deleteWarning:
      "La suppression de cet achat annulera son stock et le solde du fournisseur. Cette action est irréversible.",
    deleteConfirm: "Supprimer définitivement",
    deleteAvailable: "Confirmation disponible dans",
    deleting: "Suppression...",
    failedDelete: "Échec de la suppression de l'achat.",
    loading: "Chargement des achats...",
    noPurchases: "Aucun achat pour le moment",
    noPurchasesFound: "Aucun achat trouvé",
    noPurchasesForDate: "Aucun achat pour cette date",
    addFirst: "Ajoutez votre premier achat pour commencer.",
    tryAnother: "Essayez un autre terme de recherche.",
    date: "Date",
    supplier: "Fournisseur",
    product: "Produit",
    quantity: "Quantité",
    weight: "Poids",
    pricePerKg: "Prix / kg",
    total: "Total",
    actions: "Actions",
    selectProducts: "Sélectionner les produits",
    selectSuppliers: "Sélectionner les fournisseurs",
    continue: "Continuer",
    back: "Retour",
    confirm: "Confirmer",
    cancel: "Annuler",
    edit: "Modifier",
    delete: "Supprimer",
    addRows: "Ajouter les lignes d'achat",
    savePurchase: "Enregistrer l'achat",
    saving: "Enregistrement...",
    calculate: "Calculs",
    calculations: "Calculs d'abattage",
    weightBefore: "Poids avant abattage",
    weightAfter: "Poids après abattage",
    amount: "Nombre",
    averageWeight: "Poids moyen",
    lossPercent: "Perte %",
    averageLoss: "Perte de poids moyenne",
    noProducts: "Aucun produit disponible.",
    noSuppliers: "Aucun fournisseur disponible.",
    selected: "sélectionné(s)",
    required: "Obligatoire",
    invalidNumber: "Veuillez saisir des nombres valides.",
    invalidRows:
      "Chaque ligne d'achat doit avoir un poids, un prix et une quantité valides.",
    supplierRequired: "Veuillez sélectionner au moins un fournisseur.",
    productRequired: "Veuillez sélectionner au moins un produit.",
    purchaseCreated: "Achat créé avec succès.",
    failedLoad: "Échec du chargement des données d'achat.",
    failedSave: "Échec de l'enregistrement de l'achat.",
    currency: "Devise",
    totalPurchases: "Total Achats",
    totalPurchasesSub: "Achats enregistrés",
    totalValue: "Valeur Totale Achats",
    totalValueSub: "Valeur combinée",
    totalWeight: "Poids Total Achats",
    totalWeightSub: "Poids combiné",
    suppliersInvolved: "Fournisseurs Impliqués",
    suppliersInvolvedSub: "Fournisseurs uniques",
    permanentAction: "ACTION PERMANENTE",
    kg: "kg",
  },

  ar: {
    search: "البحث عن المشتريات...",
    searchPlaceholder: "البحث بالمورد أو السلعة أو التاريخ...",
    purchases: "مشتريات",
    purchase: "شراء",
    addPurchase: "إضافة شراء",
    editPurchase: "تعديل الشراء",
    deletePurchase: "حذف الشراء",
    deleteWarning:
      "حذف عملية الشراء سيؤدي إلى عكس الكمية من المخزون ورصيد المورد. هذا الإجراء لا يمكن التراجع عنه.",
    deleteConfirm: "حذف نهائي",
    deleteAvailable: "يمكن التأكيد بعد",
    deleting: "جارٍ الحذف...",
    failedDelete: "فشل حذف عملية الشراء.",
    loading: "جارٍ تحميل المشتريات...",
    noPurchases: "لا توجد مشتريات بعد",
    noPurchasesFound: "لم يتم العثور على مشتريات",
    noPurchasesForDate: "لا توجد مشتريات لهذا التاريخ",
    addFirst: "أضف أول عملية شراء للبدء.",
    tryAnother: "جرّب مصطلح بحث آخر.",
    date: "التاريخ",
    supplier: "المورد",
    product: "السلعة",
    quantity: "الكمية",
    weight: "الوزن",
    pricePerKg: "السعر / كغ",
    total: "المجموع",
    actions: "الإجراءات",
    selectProducts: "اختيار السلع",
    selectSuppliers: "اختيار الموردين",
    continue: "متابعة",
    back: "رجوع",
    confirm: "تأكيد",
    cancel: "إلغاء",
    edit: "تعديل",
    delete: "حذف",
    addRows: "إضافة أسطر الشراء",
    savePurchase: "حفظ الشراء",
    saving: "جارٍ الحفظ...",
    calculate: "الحسابات",
    calculations: "حسابات الذبح",
    weightBefore: "الوزن قبل الذبح",
    weightAfter: "الوزن بعد الذبح",
    amount: "العدد",
    averageWeight: "متوسط الوزن",
    lossPercent: "نسبة الفقد",
    averageLoss: "متوسط الوزن المفقود",
    noProducts: "لا توجد سلع متاحة.",
    noSuppliers: "لا يوجد موردون متاحون.",
    selected: "محدد",
    required: "مطلوب",
    invalidNumber: "يرجى إدخال أرقام صحيحة.",
    invalidRows: "يجب أن يحتوي كل سطر شراء على وزن وسعر وكمية صحيحة.",
    supplierRequired: "يرجى اختيار مورد واحد على الأقل.",
    productRequired: "يرجى اختيار سلعة واحدة على الأقل.",
    purchaseCreated: "تم إنشاء عملية الشراء بنجاح.",
    failedLoad: "فشل تحميل بيانات الشراء.",
    failedSave: "فشل حفظ عملية الشراء.",
    currency: "العملة",
    totalPurchases: "إجمالي المشتريات",
    totalPurchasesSub: "مشتريات مسجلة",
    totalValue: "إجمالي قيمة المشتريات",
    totalValueSub: "القيمة الإجمالية",
    totalWeight: "إجمالي وزن المشتريات",
    totalWeightSub: "الوزن الإجمالي",
    suppliersInvolved: "الموردون المشاركون",
    suppliersInvolvedSub: "موردون منفردون",
    permanentAction: "إجراء دائم",
    kg: "كغ",
  },
} as const;

export default function PurchasesPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  const [search, setSearch] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Purchase | null>(null);
  const [deleteCountdown, setDeleteCountdown] = useState(3.5);
  const [deleting, setDeleting] = useState(false);

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [purchaseDate, setPurchaseDate] = useState(() =>
    toISODate(new Date()),
  );

  const [calculationForm, setCalculationForm] =
    useState<CalculationForm>(EMPTY_CALCULATION);

  const [calculation, setCalculation] =
    useState<PurchaseCalculation | null>(null);

  const [language, setLanguage] = useState<Language>(
    DEFAULT_SETTINGS.language,
  );

  const [currency, setCurrency] = useState<Currency>(
    DEFAULT_SETTINGS.currency,
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showProductSelector, setShowProductSelector] = useState(false);
  const [showSupplierSelector, setShowSupplierSelector] = useState(false);
  const [showCalculation, setShowCalculation] = useState(false);

  const weightBeforeRef = useRef<HTMLInputElement>(null);
  const weightAfterRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

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
      // display with 0.5 precision style, but keep one decimal for accuracy
      const display = remaining === 0 ? 0 : Math.ceil(remaining * 2) / 2;
      // For smoother display, use one decimal (e.g., 3.5, 3.4...), but spec shows 0.5 steps, we support both
      // Use one decimal for the circular text to show 3.5 -> 0.0
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
      const [loadedProducts, loadedSuppliers] = await Promise.all([
        productService.getAll(),
        supplierService.getAll(),
      ]);
      setProducts(loadedProducts);
      setSuppliers(loadedSuppliers);
    } catch {
      // keep existing error handling via purchases load
    }
  }

  async function loadPurchasesForDate(date: Date) {
    setLoading(true);
    setError("");
    try {
      const { start, end } = getDayBounds(date);
      const loadedPurchases = await purchaseService.getByDateRange(start, end);
      setPurchases(loadedPurchases);
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
    void (async () => {
      try {
        await purchaseService.migrateLegacyPurchases();
        await loadPurchasesForDate(selectedDate);
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadPurchasesForDate(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  useDbSync(() => {
    void loadPurchasesForDate(selectedDate);
  }, [selectedDate]);

  const filteredPurchases = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return purchases;
    }

    return purchases.filter((purchase) => {
      const supplier = suppliers.find(
        (item) => item.id === purchase.supplierId,
      );

      const productNames = purchase.items
        .map(
          (item) =>
            products.find((product) => product.id === item.productId)?.name,
        )
        .filter(Boolean)
        .join(" ");

      return [
        supplier?.name,
        productNames,
        String(purchase.total),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [purchases, suppliers, products, search]);

  // KPI — derived from selected date's purchases only
  const totalPurchases = purchases.length;
  const totalValue = useMemo(
    () => purchases.reduce((sum, p) => sum + (Number(p.total) || 0), 0),
    [purchases],
  );
  const totalWeight = useMemo(
    () =>
      purchases.reduce(
        (sum, p) =>
          sum + p.items.reduce((s, item) => s + (Number(item.weightKg) || 0), 0),
        0,
      ),
    [purchases],
  );
  const suppliersInvolved = useMemo(
    () => new Set(purchases.map((p) => p.supplierId)).size,
    [purchases],
  );

  function startPurchase() {
    setError("");
    setSelectedProductIds([]);
    setSelectedSupplierIds([]);
    setCalculationForm(EMPTY_CALCULATION);
    setCalculation(null);
    setPurchaseDate(toISODate(selectedDate));
    setShowProductSelector(true);
  }

  function startEditPurchase(purchase: Purchase) {
    setError("");
    const d = new Date(purchase.date);
    const iso = toISODate(d);
    const rowsForEntry = purchase.items.map((item) => ({
      supplierId: purchase.supplierId,
      productId: item.productId,
      quantity: String(item.quantity),
      weightKg: String(item.weightKg),
      price: String(item.price),
    }));
    const payload = {
      purchaseDate: iso,
      rows: rowsForEntry,
      selectedProductIds: purchase.items.map((item) => item.productId),
      selectedSupplierIds: [purchase.supplierId],
      editingPurchaseId: purchase.id,
      calculation: purchase.calculation ?? null,
      calculationForm: purchase.calculation
        ? {
            weightBeforeSlaughterKg: String(purchase.calculation.weightBeforeSlaughterKg),
            weightAfterSlaughterKg: String(purchase.calculation.weightAfterSlaughterKg),
            amount: String(purchase.calculation.amount),
          }
        : EMPTY_CALCULATION,
    };
    try {
      localStorage.setItem("hebrih-purchase-entry", JSON.stringify(payload));
    } catch {}
    router.push(`/purchases/entry?date=${iso}&edit=${purchase.id}`);
  }

  function startDeletePurchase(purchase: Purchase) {
    setError("");
    setDeleteTarget(purchase);
    setDeleteCountdown(3.5);
    deleteStartRef.current = Date.now();
  }

  async function confirmDeletePurchase() {
    if (!deleteTarget || deleting) {
      return;
    }
    // Prevent early delete even if UI glitches — check actual elapsed time
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

      await purchaseReversalOperation.delete(deleteTarget.id);
      await loadPurchasesForDate(selectedDate);
      await loadMeta();

      setDeleteTarget(null);
      setDeleteCountdown(10);
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

  function createPurchaseRows() {
    if (selectedProductIds.length === 0) {
      setError(t.productRequired);
      return;
    }

    setError("");
    setShowProductSelector(false);
    setShowSupplierSelector(true);
  }

  function toggleSupplier(supplierId: string) {
    setSelectedSupplierIds((current) =>
      current.includes(supplierId)
        ? current.filter((id) => id !== supplierId)
        : [...current, supplierId],
    );
  }

  function createSupplierProductRows() {
    if (selectedSupplierIds.length === 0) {
      setError(t.supplierRequired);
      return;
    }

    const nextRows: PurchaseRow[] = [];

    for (const supplierId of selectedSupplierIds) {
      for (const productId of selectedProductIds) {
        const product = products.find((item) => item.id === productId);

        nextRows.push({
          supplierId,
          productId,
          quantity: "0",
          weightKg: "0",
          price: product?.price.toString() ?? "0",
        });
      }
    }

    const payload = {
      purchaseDate,
      rows: nextRows,
      selectedProductIds,
      selectedSupplierIds,
      editingPurchaseId: null,
      calculation,
      calculationForm,
    };
    try {
      localStorage.setItem("hebrih-purchase-entry", JSON.stringify(payload));
    } catch {}
    setError("");
    setShowSupplierSelector(false);
    router.push(`/purchases/entry?date=${purchaseDate}`);
  }

  function calculateSlaughter() {
    setError("");

    const weightBefore = Number(
      calculationForm.weightBeforeSlaughterKg,
    );
    const weightAfter = Number(
      calculationForm.weightAfterSlaughterKg,
    );
    const amount = Number(calculationForm.amount);

    if (
      !Number.isFinite(weightBefore) ||
      !Number.isFinite(weightAfter) ||
      !Number.isFinite(amount)
    ) {
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

  function supplierName(id: string) {
    return suppliers.find((supplier) => supplier.id === id)?.name ?? "—";
  }

  function productName(id: string) {
    return products.find((product) => product.id === id)?.name ?? "—";
  }

  return (
    <AppShell activePage="purchases">
      <main className={styles.purchasesPage}>
        <div className={styles.purchasesShell}>
          {/* KPI Cards — RED→YELLOW→RED→YELLOW */}
          <section className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconPurchases}`}>
                <ClipboardList size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.totalPurchases}</span>
                <strong className={styles.summaryValue}>{totalPurchases}</strong>
                <small className={styles.summarySub}>{t.totalPurchasesSub}</small>
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
              <div className={`${styles.summaryIcon} ${styles.iconSuppliers}`}>
                <Truck size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.suppliersInvolved}</span>
                <strong className={styles.summaryValue}>{suppliersInvolved}</strong>
                <small className={styles.summarySub}>{t.suppliersInvolvedSub}</small>
              </div>
            </div>
          </section>

          {/* Toolbar: Search + Date + Calculations + Add Purchase */}
          <section className={styles.toolbar}>
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
              className={styles.secondaryButton}
              onClick={() => setShowCalculation(true)}
            >
              {t.calculate}
            </button>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={startPurchase}
            >
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              {t.addPurchase}
            </button>
          </section>

          {error && !showProductSelector && !showSupplierSelector && !showCalculation && !deleteTarget && (
            <div className={styles.errorBanner}>{error}</div>
          )}

          <section className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <span>{t.supplier}</span>
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
            ) : filteredPurchases.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon} aria-hidden="true">
                  <ClipboardList size={32} strokeWidth={2} />
                </div>
                <strong>{purchases.length === 0 ? t.noPurchasesForDate : t.noPurchasesFound}</strong>
                <p>{purchases.length === 0 ? t.addFirst : t.tryAnother}</p>
                {purchases.length === 0 && (
                  <button type="button" className={styles.primaryButton} onClick={startPurchase}>
                    <Plus size={16} strokeWidth={2} aria-hidden="true" />
                    {t.addPurchase}
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.purchaseRows}>
                {filteredPurchases.map((purchase) => {
                  const item = purchase.items[0];
                  if (!item) return null;
                  return (
                    <article
                      key={purchase.id}
                      className={styles.purchaseRow}
                      onDoubleClick={() => startEditPurchase(purchase)}
                    >
                      <span className={styles.supplierText}>{supplierName(purchase.supplierId)}</span>
                      <span className={styles.productText}>{productName(item.productId)}</span>
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
                            startEditPurchase(purchase);
                          }}
                          aria-label={`${t.edit} ${purchase.id}`}
                        >
                          <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                          {t.edit}
                        </button>
                        <button
                          type="button"
                          className={styles.rowDeleteButton}
                          onClick={(event) => {
                            event.stopPropagation();
                            startDeletePurchase(purchase);
                          }}
                          aria-label={t.deletePurchase}
                        >
                          <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                          {t.delete}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
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
                              {formatCurrency(product.price, currency)} / {t.kg}
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
                      onClick={createPurchaseRows}
                      disabled={selectedProductIds.length === 0}
                    >
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
                  <h2>{t.selectSuppliers}</h2>
                  <button type="button" className={styles.closeButton} onClick={() => setShowSupplierSelector(false)} aria-label="Close">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </header>

                <div className={styles.selectorList}>
                  {suppliers.length === 0 ? (
                    <p style={{ color: "var(--muted)", fontSize: "13px" }}>{t.noSuppliers}</p>
                  ) : (
                    suppliers.map((supplier) => (
                      <label key={supplier.id} className={styles.selectorItem}>
                        <input
                          type="checkbox"
                          checked={selectedSupplierIds.includes(supplier.id)}
                          onChange={() => toggleSupplier(supplier.id)}
                        />
                        <span>
                          <strong>{supplier.name}</strong>
                          <small>{formatCurrency(Number(supplier.balance) || 0, currency)}</small>
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
                      setShowSupplierSelector(false);
                      setShowProductSelector(true);
                    }}
                  >
                    {t.back}
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={createSupplierProductRows}>
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
                <h2 id="delete-title">{t.deletePurchase}</h2>
                <p className={styles.deleteDescription}>{t.deleteWarning}</p>
                {deleteTarget && (
                  <p className={styles.deleteContext}>
                    {supplierName(deleteTarget.supplierId)} · {deleteTarget.items.map((it) => productName(it.productId)).join(", ")} · {formatCurrency(deleteTarget.total, currency)}
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
                    onClick={() => void confirmDeletePurchase()}
                    disabled={deleteCountdown > 0 || deleting}
                  >
                    <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                    {deleting ? t.deleting : t.deleteConfirm}
                  </button>
                </div>
              </section>
            </div>
          )}

          {showCalculation && (
            <div className={styles.modalBackdrop}>
              <section className={styles.modal} role="dialog" aria-modal="true">
                <header className={styles.modalHeader}>
                  <h2>{t.calculations}</h2>
                  <button type="button" className={styles.closeButton} onClick={() => setShowCalculation(false)} aria-label="Close">
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
      </main>
    </AppShell>
  );
}


