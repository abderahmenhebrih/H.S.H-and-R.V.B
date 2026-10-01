"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "../../src/components/layout/AppShell";
import StyledSelect from "../../src/components/common/StyledSelect";
import { CalendarRange } from "lucide-react";
import StyledDatePicker from "../../src/components/common/StyledDatePicker";
import { productService } from "../../src/services/product.service";
import { supplierService } from "../../src/services/supplier.service";
import { customerService } from "../../src/services/customer.service";
import { bankAccountService } from "../../src/services/bank-account.service";
import { workerService } from "../../src/services/worker.service";
import { expenseService } from "../../src/services/expense.service";
import { vehicleService } from "../../src/services/vehicle.service";
import { purchaseService } from "../../src/services/purchase.service";
import { saleService } from "../../src/services/sale.service";
import { paymentService } from "../../src/services/payment.service";
import { transferService } from "../../src/services/transfer.service";
import { settingsService } from "../../src/services/settings.service";
import { useDbSync } from "../../src/hooks/useDbSync";
import { DEFAULT_SETTINGS, formatCurrency, SETTINGS_EVENT } from "../../src/lib/settings";
import type { Supplier } from "../../src/types/entities/supplier";
import type { Customer } from "../../src/types/entities/customer";
import type { BankAccount } from "../../src/types/entities/bank-account";
import type { Worker } from "../../src/types/entities/worker";
import type { Expense } from "../../src/types/entities/expense";
import type { Vehicle } from "../../src/types/entities/vehicle";
import type { Purchase } from "../../src/types/entities/purchase";
import type { Sale } from "../../src/types/entities/sale";
import type { Payment } from "../../src/types/entities/payment";
import type { Transfer } from "../../src/types/entities/transfer";
import type { Product } from "../../src/types/entities/product";
import type { Currency, Language } from "../../src/types/settings/settings";
import styles from "./page.module.css";

type Category = "suppliers" | "customers" | "accounts" | "workers" | "expenses" | "vehicles";

const TRANSLATIONS = {
  en: {
    title: "Periodic Reports",
    subtitle: "الوضعية الدورية",
    from: "From date",
    to: "To date",
    apply: "Apply",
    cancel: "Cancel",
    selectCategory: "Category",
    selectEntity: "Select entity",
    all: "All active",
    printSelected: "Print Selected",
    printAll: "Print All (with activity)",
    noActivity: "No activity in this period.",
    date: "Date",
    totalSales: "Total Sales",
    payment: "Payment",
    serial: "Serial",
    quantity: "Quantity",
    product: "Product",
    weight: "Weight",
    price: "Price",
    total: "Total",
    history: "History",
    loading: "Loading reports...",
    noData: "No data",
    supplier: "Supplier",
    customer: "Customer",
    account: "Account",
    worker: "Worker",
    expense: "Expense",
    vehicle: "Vehicle",
    suppliers: "Suppliers",
    customers: "Customers",
    accounts: "Bank/Cash Accounts",
    workers: "Workers",
    expenses: "Expenses",
    vehicles: "Vehicles",
    fastPresets: "Quick period",
    today: "Today",
    thisWeek: "This Week",
    thisMonth: "This Month",
    prevMonth: "Previous Month",
    thisYear: "This Year",
    showAdvanced: "Advanced ▾",
    hideAdvanced: "Advanced ▴",
    selectMonth: "Month",
    selectYear: "Year",
    customRange: "Custom range",
  },
  fr: {
    title: "Rapports périodiques",
    subtitle: "الوضعية الدورية",
    from: "Du",
    to: "Au",
    apply: "Appliquer",
    cancel: "Annuler",
    selectCategory: "Catégorie",
    selectEntity: "Sélectionner une entité",
    all: "Tous actifs",
    printSelected: "Imprimer la sélection",
    printAll: "Imprimer tout (avec activité)",
    noActivity: "Aucune activité sur cette période.",
    date: "Date",
    totalSales: "Ventes totales",
    payment: "Paiement",
    serial: "Série",
    quantity: "Quantité",
    product: "Produit",
    weight: "Poids",
    price: "Prix",
    total: "Total",
    history: "Historique",
    loading: "Chargement des rapports...",
    noData: "Aucune donnée",
    supplier: "Fournisseur",
    customer: "Client",
    account: "Compte",
    worker: "Employé",
    expense: "Dépense",
    vehicle: "Véhicule",
    suppliers: "Fournisseurs",
    customers: "Clients",
    accounts: "Comptes",
    workers: "Employés",
    expenses: "Dépenses",
    vehicles: "Véhicules",
    fastPresets: "Période rapide",
    today: "Aujourd'hui",
    thisWeek: "Cette semaine",
    thisMonth: "Ce mois",
    prevMonth: "Mois précédent",
    thisYear: "Cette année",
    showAdvanced: "Avancé ▾",
    hideAdvanced: "Avancé ▴",
    selectMonth: "Mois",
    selectYear: "Année",
    customRange: "Plage perso",
  },
  ar: {
    title: "الوضعية الدورية",
    subtitle: "Periodic Situation",
    from: "من تاريخ",
    to: "إلى",
    apply: "تطبيق",
    cancel: "إلغاء",
    selectCategory: "الفئة",
    selectEntity: "اختر الجهة",
    all: "الكل النشط",
    printSelected: "طباعة المحدد",
    printAll: "طباعة الكل (مع النشاط)",
    noActivity: "لا يوجد نشاط في هذه الفترة.",
    date: "التاريخ",
    totalSales: "مجموع المبيعات",
    payment: "الدفع",
    serial: "التسلسل",
    quantity: "الكمية",
    product: "السلعة",
    weight: "الوزن",
    price: "السعر",
    total: "المجموع",
    history: "السجل",
    loading: "جارٍ تحميل التقارير...",
    noData: "لا توجد بيانات",
    supplier: "المورد",
    customer: "الزبون",
    account: "الحساب",
    worker: "العامل",
    expense: "المصروف",
    vehicle: "المركبة",
    suppliers: "الممولين",
    customers: "الزبائن",
    accounts: "الحسابات البنكية",
    workers: "العمال",
    expenses: "المصاريف",
    vehicles: "المركبات",
    fastPresets: "فترة سريعة",
    today: "اليوم",
    thisWeek: "هذا الأسبوع",
    thisMonth: "هذا الشهر",
    prevMonth: "الشهر السابق",
    thisYear: "هذه السنة",
    showAdvanced: "متقدم ▾",
    hideAdvanced: "متقدم ▴",
    selectMonth: "الشهر",
    selectYear: "السنة",
    customRange: "نطاق مخصص",
  },
} as const;

function formatDate(ts: number, language: string = "en") {
  return new Date(ts).toLocaleDateString(language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB", { numberingSystem: "latn" } as any);
}

function serialForDate(date: number, index: number) {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  const seq = String(index + 1).padStart(3, "0");
  return `${dd}${mm}${yyyy}${seq}`;
}

// --- Canonical from/to helpers: fast / month / year / custom all produce same from/to ISO ---
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function lastDayOfMonth(year: number, monthIndex: number): number {
  // monthIndex 0-11; using day 0 of next month gives last day of target month — handles leap year Feb 29, 31->30, Dec->Jan
  return new Date(year, monthIndex + 1, 0).getDate();
}
function getMonthRange(year: number, monthIndex: number): { from: string; to: string } {
  const from = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const last = lastDayOfMonth(year, monthIndex);
  const to = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}
function getYearRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}
function getTodayRange(now = new Date()): { from: string; to: string } {
  const s = toISO(now);
  return { from: s, to: s };
}
function getThisWeekRange(now = new Date()): { from: string; to: string } {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diffToMonday = (day + 6) % 7; // Monday 0
  const mon = new Date(d);
  mon.setDate(d.getDate() - diffToMonday);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { from: toISO(mon), to: toISO(sun) };
}
function getThisMonthRange(now = new Date()): { from: string; to: string } {
  return getMonthRange(now.getFullYear(), now.getMonth());
}
function getPrevMonthRange(now = new Date()): { from: string; to: string } {
  // Handles December→January via Date underflow; and Feb 29 leap etc via lastDayOfMonth
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return getMonthRange(d.getFullYear(), d.getMonth());
}
function getThisYearRange(now = new Date()): { from: string; to: string } {
  return getYearRange(now.getFullYear());
}

const MONTH_OPTIONS = [
  { value: "0", label: "Jan" },
  { value: "1", label: "Feb" },
  { value: "2", label: "Mar" },
  { value: "3", label: "Apr" },
  { value: "4", label: "May" },
  { value: "5", label: "Jun" },
  { value: "6", label: "Jul" },
  { value: "7", label: "Aug" },
  { value: "8", label: "Sep" },
  { value: "9", label: "Oct" },
  { value: "10", label: "Nov" },
  { value: "11", label: "Dec" },
];
function buildYearOptions(center = new Date().getFullYear(), span = 7) {
  const opts: { value: string; label: string }[] = [];
  for (let y = center - span; y <= center + span; y++) opts.push({ value: String(y), label: String(y) });
  return opts;
}

export default function ReportsPage() {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>(DEFAULT_SETTINGS.language);
  const [currency, setCurrency] = useState<Currency>(DEFAULT_SETTINGS.currency);
  const [fromDate, setFromDate] = useState(new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [showDatePopup, setShowDatePopup] = useState(true);
  const [applied, setApplied] = useState(false);
  const [category, setCategory] = useState<Category>("customers");
  const [selectedId, setSelectedId] = useState<string>("all");

  // Advanced inline settings: month/year selectors staying with existing report design
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [pickerMonth, setPickerMonth] = useState<number>(() => new Date().getMonth());
  const [pickerYear, setPickerYear] = useState<number>(() => new Date().getFullYear());
  const [yearSelector, setYearSelector] = useState<number>(() => new Date().getFullYear());

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const t = TRANSLATIONS[language];

  // Stale async protection: sequence token + cancelled flag + debounce, keep useDbSync
  const loadSeqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadSettings() {
    const s = await settingsService.get();
    setLanguage(s?.language ?? DEFAULT_SETTINGS.language);
    setCurrency(s?.currency ?? DEFAULT_SETTINGS.currency);
  }

  const loadData = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const [sup, cust, acc, work, exp, veh, purch, sal, pay, trans, prod] = await Promise.all([
        supplierService.getAll(),
        customerService.getAll(),
        bankAccountService.getAll(),
        workerService.getAll(),
        expenseService.getAll(),
        vehicleService.getAll(),
        purchaseService.getAll(),
        saleService.getAll(),
        paymentService.getAll(),
        transferService.getAll(),
        productService.getAll(),
      ]);
      // stale guard: if newer loadData started, discard this result
      if (seq !== loadSeqRef.current) return;
      setSuppliers(sup);
      setCustomers(cust);
      setAccounts(acc);
      setWorkers(work);
      setExpenses(exp);
      setVehicles(veh);
      setPurchases(purch);
      setSales(sal);
      setPayments(pay);
      setTransfers(trans);
      setProducts(prod);
    } finally {
      // only clear loading if this is the latest sequence
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // cancelled flag protects unmount races
    let cancelled = false;
    void loadSettings();
    void loadData();
    const h = () => {
      if (cancelled) return;
      void loadSettings();
    };
    window.addEventListener(SETTINGS_EVENT, h);
    return () => {
      cancelled = true;
      window.removeEventListener(SETTINGS_EVENT, h);
    };
  }, [loadData]);

  useDbSync(() => {
    // debounce prevents burst sync events from causing overlapping loads
    if (debounceRef.current) clearTimeout(debounceRef.current as any);
    debounceRef.current = setTimeout(() => {
      void loadData();
    }, 120);
  }, [loadData]);

  // Keep pickers in sync when fromDate changes via custom pickers? Optional: reflect month/year selectors when user edits custom range to last chosen preset's month
  // No auto-sync to avoid overriding manual edits; month/year apply explicitly sets canonical from/to.

  const fromTs = new Date(`${fromDate}T00:00:00`).getTime();
  const toTs = new Date(`${toDate}T23:59:59`).getTime();
  const hasInvalidDate = Number.isNaN(fromTs) || Number.isNaN(toTs);

  const filteredSales = hasInvalidDate ? [] : sales.filter((s) => s.date >= fromTs && s.date <= toTs);
  const filteredPurchases = hasInvalidDate ? [] : purchases.filter((p) => p.date >= fromTs && p.date <= toTs);
  const filteredPayments = hasInvalidDate ? [] : payments.filter((p) => p.date >= fromTs && p.date <= toTs);
  const filteredExpenses = hasInvalidDate ? [] : expenses.filter((e) => e.date >= fromTs && e.date <= toTs);
  const filteredTransfers = hasInvalidDate ? [] : transfers.filter((tr) => tr.date >= fromTs && tr.date <= toTs);

  function getEntityOptions() {
    if (category === "suppliers") return suppliers.map((s) => ({ id: s.id, name: s.name }));
    if (category === "customers") return customers.map((c) => ({ id: c.id, name: c.name }));
    if (category === "accounts") return accounts.map((a) => ({ id: a.id, name: a.name }));
    if (category === "workers") return workers.filter((w) => w.status === "active").map((w) => ({ id: w.id, name: w.name }));
    if (category === "expenses") return [{ id: "all", name: t.expenses }];
    if (category === "vehicles") return vehicles.map((v) => ({ id: v.id, name: v.name }));
    return [];
  }

  function hasActivity(entityId: string) {
    if (category === "customers") {
      return filteredSales.some((s) => s.customerId === entityId) || filteredPayments.some((p) => p.entityType === "customer" && p.entityId === entityId);
    }
    if (category === "suppliers") {
      return filteredPurchases.some((p) => p.supplierId === entityId) || filteredPayments.some((p) => p.entityType === "supplier" && p.entityId === entityId);
    }
    if (category === "accounts") {
      return filteredPayments.some((p) => p.accountId === entityId) || filteredTransfers.some((tr) => tr.fromAccountId === entityId || tr.toAccountId === entityId) || filteredExpenses.some((e) => e.accountId === entityId);
    }
    if (category === "workers") {
      return filteredPayments.some((p) => p.entityType === "worker" && p.entityId === entityId);
    }
    if (category === "expenses") {
      // 'all' is the only valid pseudo-entity for expenses
      if (entityId !== "all") return false;
      return filteredExpenses.length > 0;
    }
    if (category === "vehicles") {
      if (entityId === "all") {
        return filteredExpenses.some((e) => e.note?.startsWith("vehicle:"));
      }
      return filteredExpenses.some((e) => e.note === `vehicle:${entityId}` || e.note?.startsWith(`vehicle:${entityId}|`));
    }
    return false;
  }

  const [reportFeedback, setReportFeedback] = useState<string | null>(null);
  useEffect(()=>{ if(!reportFeedback) return; const id=setTimeout(()=>setReportFeedback(null), 3000); return ()=>clearTimeout(id); }, [reportFeedback]);
  useEffect(()=>{
    if (hasInvalidDate) setReportFeedback(language === "ar" ? "تاريخ غير صالح" : language === "fr" ? "Date invalide" : "Invalid date range");
  }, [hasInvalidDate, language]);
  function handlePrintSelected() {
    if (hasInvalidDate) {
      setReportFeedback(language === "ar" ? "تاريخ غير صالح" : language === "fr" ? "Date invalide" : "Invalid date range");
      return;
    }
    if (!selectedId && category !== "expenses") return;
    if (selectedId !== "all" && !hasActivity(selectedId) && category !== "expenses") {
      setReportFeedback(t.noActivity); return;
    }
    if (selectedId === "all") {
      const hasAnyActivity = getEntityOptions().some((opt) => opt.id !== "all" && hasActivity(opt.id)) || (category === "expenses" && filteredExpenses.length > 0);
      if (!hasAnyActivity) {
        setReportFeedback(t.noActivity); return;
      }
    }
    const params = new URLSearchParams({
      category,
      entity: selectedId,
      from: fromDate,
      to: toDate,
      mode: "selected",
    });
    router.push(`/reports/print-preview?${params.toString()}`);
  }

  // Exit the Reports entry flow: /reports has no useful state once the
  // Periodic Reports modal is dismissed, so Cancel returns to the
  // Management Dashboard. replace() keeps the cancelled /reports
  // entry out of history so Back does not reopen a blank screen.
  function cancelReports() {
    router.replace("/");
  }

  function handlePrintAll() {
    if (hasInvalidDate) {
      setReportFeedback(language === "ar" ? "تاريخ غير صالح" : language === "fr" ? "Date invalide" : "Invalid date range");
      return;
    }
    const activeIds = getEntityOptions().map((o) => o.id).filter((id) => id !== "all" && hasActivity(id));
    if (activeIds.length === 0 && !(category === "expenses" && filteredExpenses.length > 0)) {
      setReportFeedback(t.noActivity); return;
    }
    const params = new URLSearchParams({
      category,
      entity: "all",
      from: fromDate,
      to: toDate,
      mode: "all",
    });
    router.push(`/reports/print-preview?${params.toString()}`);
  }

  function productName(id: string) {
    return products.find((p) => p.id === id)?.name ?? id.slice(0, 6);
  }

  // Fast period selection handlers: all produce canonical from/to
  function applyPreset(kind: "today" | "thisWeek" | "thisMonth" | "prevMonth" | "thisYear") {
    const now = new Date();
    let r: { from: string; to: string };
    if (kind === "today") r = getTodayRange(now);
    else if (kind === "thisWeek") r = getThisWeekRange(now);
    else if (kind === "thisMonth") r = getThisMonthRange(now);
    else if (kind === "prevMonth") r = getPrevMonthRange(now);
    else r = getThisYearRange(now);
    setFromDate(r.from);
    setToDate(r.to);
    setActivePreset(kind);
  }
  function applyMonthYear(monthIdx: number, year: number) {
    const r = getMonthRange(year, monthIdx);
    setFromDate(r.from);
    setToDate(r.to);
    setActivePreset(null);
  }
  function applyYearOnly(year: number) {
    const r = getYearRange(year);
    setFromDate(r.from);
    setToDate(r.to);
    setActivePreset(null);
  }

  function renderHistory() {
    if (loading) return <div className={styles.statePanel}><h2>{t.loading}</h2></div>;
    if (hasInvalidDate) return <div className={styles.empty}><p>{language === "ar" ? "تاريخ غير صالح" : language === "fr" ? "Date invalide" : "Invalid date range"}</p></div>;

    if (category === "customers" && selectedId) {
      if (selectedId === "all") {
        const salesForCustomer = [...filteredSales].sort((a, b) => a.date - b.date);
        const paymentsForCustomer = [...filteredPayments].filter((p) => p.entityType === "customer");
        if (salesForCustomer.length === 0 && paymentsForCustomer.length === 0) {
          return <div className={styles.empty}><p>{t.noActivity}</p></div>;
        }
        return (
          <div className={styles.historyTable}>
            <div className={styles.historyHeader}>
              <span>{t.date}</span>
              <span>{t.serial}</span>
              <span>{t.product}</span>
              <span>{t.quantity}</span>
              <span>{t.weight}</span>
              <span>{t.price}</span>
              <span>{t.total}</span>
            </div>
            {salesForCustomer.map((sale, sIdx) =>
              sale.items.map((item) => (
                <div key={`${sale.id}-${item.productId}`} className={styles.historyRow}>
                  <span>{formatDate(sale.date, language)}</span>
                  <span>{serialForDate(sale.date, sIdx)}</span>
                  <span>{productName(item.productId)}</span>
                  <span>{item.quantity}</span>
                  <span>{item.weightKg.toFixed(2)} kg</span>
                  <span>{formatCurrency(item.price, currency)}</span>
                  <span>{formatCurrency(item.total, currency)}</span>
                </div>
              )),
            )}
            {paymentsForCustomer.map((p) => (
              <div key={p.id} className={`${styles.historyRow} ${styles.paymentRow}`}>
                <span>{formatDate(p.date, language)}</span>
                <span>{t.payment}</span>
                <span>—</span>
                <span>—</span>
                <span>—</span>
                <span>—</span>
                <span>{formatCurrency(p.amount, currency)}</span>
              </div>
            ))}
            <div className={styles.summaryRow}>
              <span>{t.totalSales}: {formatCurrency(salesForCustomer.reduce((s, sale) => s + sale.total, 0), currency)}</span>
              <span>{t.payment}: {formatCurrency(paymentsForCustomer.reduce((s, p) => s + p.amount, 0), currency)}</span>
            </div>
          </div>
        );
      }
      const salesForCustomer = filteredSales.filter((s) => s.customerId === selectedId).sort((a, b) => a.date - b.date);
      const paymentsForCustomer = filteredPayments.filter((p) => p.entityType === "customer" && p.entityId === selectedId);
      if (salesForCustomer.length === 0 && paymentsForCustomer.length === 0) {
        return <div className={styles.empty}><p>{t.noActivity}</p></div>;
      }
      return (
        <div className={styles.historyTable}>
          <div className={styles.historyHeader}>
            <span>{t.date}</span>
            <span>{t.serial}</span>
            <span>{t.product}</span>
            <span>{t.quantity}</span>
            <span>{t.weight}</span>
            <span>{t.price}</span>
            <span>{t.total}</span>
          </div>
          {salesForCustomer.map((sale, sIdx) =>
            sale.items.map((item) => (
              <div key={`${sale.id}-${item.productId}`} className={styles.historyRow}>
                <span>{formatDate(sale.date, language)}</span>
                <span>{serialForDate(sale.date, sIdx)}</span>
                <span>{productName(item.productId)}</span>
                <span>{item.quantity}</span>
                <span>{item.weightKg.toFixed(2)} kg</span>
                <span>{formatCurrency(item.price, currency)}</span>
                <span>{formatCurrency(item.total, currency)}</span>
              </div>
            )),
          )}
          {paymentsForCustomer.map((p) => (
            <div key={p.id} className={`${styles.historyRow} ${styles.paymentRow}`}>
              <span>{formatDate(p.date, language)}</span>
              <span>{t.payment}</span>
              <span>—</span>
              <span>—</span>
              <span>—</span>
              <span>—</span>
              <span>{formatCurrency(p.amount, currency)}</span>
            </div>
          ))}
          <div className={styles.summaryRow}>
            <span>{t.totalSales}: {formatCurrency(salesForCustomer.reduce((s, sale) => s + sale.total, 0), currency)}</span>
            <span>{t.payment}: {formatCurrency(paymentsForCustomer.reduce((s, p) => s + p.amount, 0), currency)}</span>
          </div>
        </div>
      );
    }

    if (category === "suppliers" && selectedId) {
      if (selectedId === "all") {
        const purchForSupplier = [...filteredPurchases];
        if (purchForSupplier.length === 0) return <div className={styles.empty}><p>{t.noActivity}</p></div>;
        return (
          <div className={styles.historyTable}>
            <div className={styles.historyHeader}>
              <span>{t.date}</span>
              <span>{t.product}</span>
              <span>{t.quantity}</span>
              <span>{t.weight}</span>
              <span>{t.price}</span>
              <span>{t.total}</span>
            </div>
            {purchForSupplier.map((pur) =>
              pur.items.map((item) => (
                <div key={`${pur.id}-${item.productId}`} className={styles.historyRow}>
                  <span>{formatDate(pur.date, language)}</span>
                  <span>{productName(item.productId)}</span>
                  <span>{item.quantity}</span>
                  <span>{item.weightKg.toFixed(2)} kg</span>
                  <span>{formatCurrency(item.price, currency)}</span>
                  <span>{formatCurrency(item.total, currency)}</span>
                </div>
              )),
            )}
          </div>
        );
      }
      const purchForSupplier = filteredPurchases.filter((p) => p.supplierId === selectedId);
      if (purchForSupplier.length === 0) return <div className={styles.empty}><p>{t.noActivity}</p></div>;
      return (
        <div className={styles.historyTable}>
          <div className={styles.historyHeader}>
            <span>{t.date}</span>
            <span>{t.product}</span>
            <span>{t.quantity}</span>
            <span>{t.weight}</span>
            <span>{t.price}</span>
            <span>{t.total}</span>
          </div>
          {purchForSupplier.map((pur) =>
            pur.items.map((item) => (
              <div key={`${pur.id}-${item.productId}`} className={styles.historyRow}>
                <span>{formatDate(pur.date, language)}</span>
                <span>{productName(item.productId)}</span>
                <span>{item.quantity}</span>
                <span>{item.weightKg.toFixed(2)} kg</span>
                <span>{formatCurrency(item.price, currency)}</span>
                <span>{formatCurrency(item.total, currency)}</span>
              </div>
            )),
          )}
        </div>
      );
    }

    if (category === "accounts" && selectedId) {
      if (selectedId === "all") {
        const pays = [...filteredPayments];
        const trans = [...filteredTransfers];
        const exps = [...filteredExpenses];
        if (pays.length === 0 && trans.length === 0 && exps.length === 0) return <div className={styles.empty}><p>{t.noActivity}</p></div>;
        return (
          <div className={styles.simpleList}>
            {pays.map((p) => (
              <div key={p.id} className={styles.simpleRow}><span>{formatDate(p.date, language)}</span><span>{p.entityType} · {formatCurrency(p.amount, currency)}</span><span>{p.note ?? ""}</span></div>
            ))}
            {trans.map((tr) => (
              <div key={tr.id} className={styles.simpleRow}><span>{formatDate(tr.date, language)}</span><span>Transfer {formatCurrency(tr.amount, currency)}</span><span>{tr.note ?? ""}</span></div>
            ))}
            {exps.map((e) => (
              <div key={e.id} className={styles.simpleRow}><span>{formatDate(e.date, language)}</span><span>{e.name} · {formatCurrency(e.amount, currency)}</span><span>{e.note ?? ""}</span></div>
            ))}
          </div>
        );
      }
      const pays = filteredPayments.filter((p) => p.accountId === selectedId);
      const trans = filteredTransfers.filter((tr) => tr.fromAccountId === selectedId || tr.toAccountId === selectedId);
      const exps = filteredExpenses.filter((e) => e.accountId === selectedId);
      if (pays.length === 0 && trans.length === 0 && exps.length === 0) return <div className={styles.empty}><p>{t.noActivity}</p></div>;
      return (
        <div className={styles.simpleList}>
          {pays.map((p) => (
            <div key={p.id} className={styles.simpleRow}><span>{formatDate(p.date, language)}</span><span>{p.entityType} · {formatCurrency(p.amount, currency)}</span><span>{p.note ?? ""}</span></div>
          ))}
          {trans.map((tr) => (
            <div key={tr.id} className={styles.simpleRow}><span>{formatDate(tr.date, language)}</span><span>Transfer {formatCurrency(tr.amount, currency)}</span><span>{tr.note ?? ""}</span></div>
          ))}
          {exps.map((e) => (
            <div key={e.id} className={styles.simpleRow}><span>{formatDate(e.date, language)}</span><span>{e.name} · {formatCurrency(e.amount, currency)}</span><span>{e.note ?? ""}</span></div>
          ))}
        </div>
      );
    }

    if (category === "workers" && selectedId) {
      if (selectedId === "all") {
        const pays = filteredPayments.filter((p) => p.entityType === "worker");
        if (pays.length === 0) return <div className={styles.empty}><p>{t.noActivity}</p></div>;
        return (
          <div className={styles.simpleList}>
            {pays.map((p) => (
              <div key={p.id} className={styles.simpleRow}><span>{formatDate(p.date, language)}</span><span>{formatCurrency(p.amount, currency)}</span><span>{p.note ?? ""}</span></div>
            ))}
          </div>
        );
      }
      const pays = filteredPayments.filter((p) => p.entityType === "worker" && p.entityId === selectedId);
      if (pays.length === 0) return <div className={styles.empty}><p>{t.noActivity}</p></div>;
      return (
        <div className={styles.simpleList}>
          {pays.map((p) => (
            <div key={p.id} className={styles.simpleRow}><span>{formatDate(p.date, language)}</span><span>{formatCurrency(p.amount, currency)}</span><span>{p.note ?? ""}</span></div>
          ))}
        </div>
      );
    }

    if (category === "expenses") {
      if (filteredExpenses.length === 0) return <div className={styles.empty}><p>{t.noActivity}</p></div>;
      return (
        <div className={styles.simpleList}>
          {filteredExpenses.map((e) => (
            <div key={e.id} className={styles.simpleRow}><span>{formatDate(e.date, language)}</span><span>{e.name}</span><span>{formatCurrency(e.amount, currency)}</span><span>{accounts.find((a) => a.id === e.accountId)?.name ?? ""}</span></div>
          ))}
        </div>
      );
    }

    if (category === "vehicles" && selectedId) {
      if (selectedId === "all") {
        const related = filteredExpenses.filter((e) => e.note?.startsWith("vehicle:"));
        if (related.length === 0) return <div className={styles.empty}><p>{t.noActivity}</p></div>;
        return (
          <div className={styles.simpleList}>
            {related.map((e) => (
              <div key={e.id} className={styles.simpleRow}><span>{formatDate(e.date, language)}</span><span>{e.name}</span><span>{formatCurrency(e.amount, currency)}</span></div>
            ))}
          </div>
        );
      }
      const related = filteredExpenses.filter((e) => e.note === `vehicle:${selectedId}` || e.note?.startsWith(`vehicle:${selectedId}|`));
      if (related.length === 0) return <div className={styles.empty}><p>{t.noActivity}</p></div>;
      return (
        <div className={styles.simpleList}>
          {related.map((e) => (
            <div key={e.id} className={styles.simpleRow}><span>{formatDate(e.date, language)}</span><span>{e.name}</span><span>{formatCurrency(e.amount, currency)}</span></div>
          ))}
        </div>
      );
    }

    if (hasInvalidDate) {
      return <div className={styles.empty}><p>{language === "ar" ? "تاريخ غير صالح" : language === "fr" ? "Date invalide" : "Invalid date range"}</p></div>;
    }

    return <div className={styles.empty}><p>{language === "ar" ? "اختر جهة لعرض السجل" : language === "fr" ? "Sélectionnez une entité pour afficher l'historique" : "Select an entity to view history"}</p></div>;
  }

  const yearOptions = buildYearOptions(new Date().getFullYear(), 8);

  return (
    <AppShell activePage="reports">
      <main className={styles.reportsPage}>
        {showDatePopup && (
          <div className={styles.modalBackdrop}>
            <section className={styles.dateModal}>
              <h2>{t.title}</h2>
              <p>{t.subtitle}</p>
              <div className={styles.dateForm}>
                <label>
                  <span>{t.from}</span>
                  <StyledDatePicker value={fromDate} onChange={(v)=>{ setFromDate(v); setActivePreset(null); }} language={language} placeholder={t.from} ariaLabel={t.from} />
                </label>
                <label>
                  <span>{t.to}</span>
                  <StyledDatePicker value={toDate} onChange={(v)=>{ setToDate(v); setActivePreset(null); }} language={language} placeholder={t.to} ariaLabel={t.to} />
                </label>
              </div>

              {/* Fast period selection — canonical from/to */}
              <div className={styles.fastSection}>
                <span className={styles.fastLabel}>{t.fastPresets}</span>
                <div className={styles.presetGrid}>
                  <button type="button" className={`${styles.presetButton} ${activePreset==="today"?styles.presetActive:""}`} onClick={()=>applyPreset("today")}>{t.today}</button>
                  <button type="button" className={`${styles.presetButton} ${activePreset==="thisWeek"?styles.presetActive:""}`} onClick={()=>applyPreset("thisWeek")}>{t.thisWeek}</button>
                  <button type="button" className={`${styles.presetButton} ${activePreset==="thisMonth"?styles.presetActive:""}`} onClick={()=>applyPreset("thisMonth")}>{t.thisMonth}</button>
                  <button type="button" className={`${styles.presetButton} ${activePreset==="prevMonth"?styles.presetActive:""}`} onClick={()=>applyPreset("prevMonth")}>{t.prevMonth}</button>
                  <button type="button" className={`${styles.presetButton} ${activePreset==="thisYear"?styles.presetActive:""}`} onClick={()=>applyPreset("thisYear")}>{t.thisYear}</button>
                </div>
              </div>

              {/* Advanced inline settings staying with existing report design */}
              <div className={styles.advancedInline}>
                <button
                  type="button"
                  className={styles.advancedToggle}
                  onClick={()=>setShowAdvanced(v=>!v)}
                  aria-expanded={showAdvanced}
                >
                  {showAdvanced ? t.hideAdvanced : t.showAdvanced}
                </button>
                {showAdvanced && (
                  <div className={styles.advancedPanel}>
                    <div className={styles.inlineSelectors}>
                      <label>
                        <span>{t.selectMonth}</span>
                        <div className={styles.monthYearRow}>
                          <StyledSelect
                            value={String(pickerMonth)}
                            onChange={(v)=>{ const m=Number(v); setPickerMonth(m); applyMonthYear(m, pickerYear); }}
                            ariaLabel={t.selectMonth}
                            options={MONTH_OPTIONS}
                          />
                          <StyledSelect
                            value={String(pickerYear)}
                            onChange={(v)=>{ const y=Number(v); setPickerYear(y); applyMonthYear(pickerMonth, y); }}
                            ariaLabel={t.selectYear}
                            options={yearOptions}
                          />
                        </div>
                      </label>
                    </div>
                    <div className={styles.inlineSelectors}>
                      <label>
                        <span>{t.selectYear}</span>
                        <StyledSelect
                          value={String(yearSelector)}
                          onChange={(v)=>{ const y=Number(v); setYearSelector(y); applyYearOnly(y); }}
                          ariaLabel={t.selectYear}
                          options={yearOptions}
                        />
                      </label>
                    </div>
                    <p className={styles.advancedHint}>
                      {language==="ar" ? "اختيار الشهر/السنة يحدد نفس الحقلين من/إلى" : language==="fr" ? "Mois/Année alimente le même intervalle Du→Au" : "Month/Year feeds the same From→To interval"}
                    </p>
                  </div>
                )}
              </div>

              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelButton} onClick={cancelReports}>{t.cancel}</button>
                <button type="button" className={styles.primaryButton} onClick={() => { setShowDatePopup(false); setApplied(true); }}>{t.apply}</button>
              </div>
            </section>
          </div>
        )}

        {applied ? (
          <div className={styles.layout}>
            <section className={styles.historySection}>
              <div className={styles.historyTitle}>
                <h2>{t.history}</h2>
                <button type="button" className={styles.periodControl} onClick={() => setShowDatePopup(true)} aria-label="Change report period" title="Change report period">
                  <CalendarRange size={14} strokeWidth={2} aria-hidden="true" />
                  <span>{fromDate} → {toDate}</span>
                </button>
              </div>
              {renderHistory()}
            </section>

            <aside className={styles.navSection}>
              <div className={styles.categorySelector}>
                <label>
                  <span>{t.selectCategory}</span>
                  <StyledSelect
                    value={category}
                    onChange={(value) => {
                      setCategory(value as Category);
                      setSelectedId("all");
                    }}
                    placeholder={t.selectCategory}
                    ariaLabel={t.selectCategory}
                    fitContent
                    options={[
                      { value: "customers", label: t.customers },
                      { value: "suppliers", label: t.suppliers },
                      { value: "accounts", label: t.accounts },
                      { value: "workers", label: t.workers },
                      { value: "expenses", label: t.expenses },
                      { value: "vehicles", label: t.vehicles },
                    ]}
                  />
                </label>

                {category !== "expenses" && (
                  <label>
                    <span>{t.selectEntity}</span>
                    <StyledSelect
                      value={selectedId}
                      onChange={setSelectedId}
                      placeholder={t.selectEntity}
                      ariaLabel={t.selectEntity}
                      options={[{ value: "all", label: "All" }, ...getEntityOptions().map((opt) => ({ value: opt.id, label: opt.name }))]}
                    />
                  </label>
                )}

                <div className={styles.printActions}>
                  <button type="button" className={styles.primaryButton} onClick={handlePrintSelected} disabled={!selectedId && category !== "expenses"}>
                    {t.printSelected}
                  </button>
                  <button type="button" className={styles.secondaryButton} onClick={handlePrintAll}>
                    {t.printAll}
                  </button>
                </div>

                <p className={styles.hint}>{language === "ar" ? "طباعة الكل تشمل فقط الجهات التي كان لها نشاط في الفترة المحددة." : language === "fr" ? "Imprimer tout n'inclut que les entités avec activité sur la période." : "Print all includes only entities with activity in the selected period."}</p>
              </div>
            </aside>
          </div>
        ) : (
          !showDatePopup && <div className={styles.empty}><p>{t.selectCategory}</p></div>
        )}
        {reportFeedback && <div role="status" aria-live="polite" style={{ position:"fixed", bottom:16, left:"50%", transform:"translateX(-50%)", background:"var(--panel)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700, color:"var(--text)", boxShadow:"0 6px 20px rgba(0,0,0,0.12)", zIndex: 999 }}>{reportFeedback}</div>}
      </main>
    </AppShell>
  );
}
