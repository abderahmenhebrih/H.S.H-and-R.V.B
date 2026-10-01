"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDbSync } from "../../src/hooks/useDbSync";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Pencil,
  Plus,
  Receipt,
  Search,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react";

import AppShell from "../../src/components/layout/AppShell";
import StyledSelect from "../../src/components/common/StyledSelect";
import StyledDatePicker from "../../src/components/common/StyledDatePicker";
import { supplierService } from "../../src/services/supplier.service";
import { customerService } from "../../src/services/customer.service";
import { workerService } from "../../src/services/worker.service";
import { bankAccountService } from "../../src/services/bank-account.service";
import { expenseService } from "../../src/services/expense.service";
import { vehicleService } from "../../src/services/vehicle.service";
import { paymentService } from "../../src/services/payment.service";
import { paymentOperation } from "../../src/services/operations/payment.operation";
import { paymentEditOperation } from "../../src/services/operations/payment-edit.operation";
import { paymentReversalOperation } from "../../src/services/operations/payment-reversal.operation";
import { workerBalanceOperation } from "../../src/services/operations/worker-balance.operation";
import { expenseOperation } from "../../src/services/operations/expense.operation";
import { expenseReversalOperation } from "../../src/services/operations/expense-reversal.operation";
import { settingsService } from "../../src/services/settings.service";
import {
  DEFAULT_SETTINGS,
  formatCurrency,
  SETTINGS_EVENT,
} from "../../src/lib/settings";
import { formatDate as formatDateLib } from "../../src/lib/datetime";

import type { Supplier } from "../../src/types/entities/supplier";
import type { Customer } from "../../src/types/entities/customer";
import type { Worker } from "../../src/types/entities/worker";
import type { BankAccount } from "../../src/types/entities/bank-account";
import type { Payment } from "../../src/types/entities/payment";
import type { Expense } from "../../src/types/entities/expense";
import type { Vehicle } from "../../src/types/entities/vehicle";
import type { Currency, Language } from "../../src/types/settings/settings";

import styles from "./page.module.css";

type Tab = "supplier" | "customer" | "worker" | "expense" | "vehicle";

function getDayBounds(date: Date): { start: number; end: number } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).getTime();
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();
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
    const locale = language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB";
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
    title: "Payments",
    subtitle: "Manage payments, expenses, worker adjustments and transaction records.",
    supplier: "Supplier Payments",
    customer: "Customer Payments",
    worker: "Worker Payments",
    expense: "Expenses",
    vehicle: "Vehicle Expenses",
    search: "Search payments...",
    searchPlaceholder: "Search payments by entity, account, note...",
    payments: "payments",
    add: "Add Payment",
    edit: "Edit",
    delete: "Delete",
    amount: "Amount",
    account: "Account",
    date: "Date",
    entity: "Entity",
    description: "Description",
    note: "Note",
    actions: "Actions",
    loading: "Loading payments...",
    noPayments: "No payments yet",
    noPaymentsFound: "No payments found",
    noPaymentsForDate: "No payments for this date",
    addFirst: "Add a payment to begin recording transactions.",
    tryAnother: "Try another search term.",
    selectSupplier: "Select supplier",
    selectCustomer: "Select customer",
    selectWorker: "Select worker",
    selectAccount: "Select account",
    selectVehicle: "Select vehicle",
    selectExpense: "Expense name",
    salary: "Pay Salary",
    bonus: "Add Bonus",
    absence: "Add Absence",
    bonusAmount: "Bonus amount",
    absenceAmount: "Absence amount",
    archive: "Archive/Restore",
    required: "Required",
    optional: "Optional",
    saving: "Saving...",
    create: "Create",
    save: "Save",
    cancel: "Cancel",
    confirmDelete: "Delete Permanently",
    deleteWarning: "Deleting this payment will reverse its financial effects. This action cannot be undone.",
    deleteAvailable: "Confirm available in",
    deleting: "Deleting...",
    failedDelete: "Failed to delete payment.",
    failed: "Failed to save payment.",
    insufficientAccount: "Insufficient account balance.",
    insufficientEntity: "Insufficient entity balance.",
    totalPayments: "Total Payments",
    totalPaymentsSub: "Registered payments",
    totalPaid: "Total Paid",
    totalPaidSub: "Combined amount",
    accountsInvolved: "Accounts Involved",
    accountsInvolvedSub: "Unique accounts",
    entitiesInvolved: "Entities Involved",
    entitiesInvolvedSub: "Unique entities",
    permanentAction: "PERMANENT ACTION",
  },
  fr: {
    title: "Paiements",
    subtitle: "Gérer les paiements, les dépenses, les ajustements des employés et les relevés de transactions.",
    supplier: "Paiements fournisseurs",
    customer: "Paiements clients",
    worker: "Paiements employés",
    expense: "Dépenses",
    vehicle: "Dépenses véhicules",
    search: "Rechercher des paiements...",
    searchPlaceholder: "Rechercher par entité, compte, note...",
    payments: "paiements",
    add: "Ajouter un paiement",
    edit: "Modifier",
    delete: "Supprimer",
    amount: "Montant",
    account: "Compte",
    date: "Date",
    entity: "Entité",
    description: "Description",
    note: "Note",
    actions: "Actions",
    loading: "Chargement des paiements...",
    noPayments: "Aucun paiement pour le moment",
    noPaymentsFound: "Aucun paiement trouvé",
    noPaymentsForDate: "Aucun paiement pour cette date",
    addFirst: "Ajoutez un paiement pour commencer.",
    tryAnother: "Essayez un autre terme de recherche.",
    selectSupplier: "Sélectionner fournisseur",
    selectCustomer: "Sélectionner client",
    selectWorker: "Sélectionner employé",
    selectAccount: "Sélectionner compte",
    selectVehicle: "Sélectionner véhicule",
    selectExpense: "Nom de la dépense",
    salary: "Payer salaire",
    bonus: "Ajouter prime",
    absence: "Ajouter absence",
    bonusAmount: "Montant prime",
    absenceAmount: "Montant absence",
    archive: "Archiver/Restaurer",
    required: "Obligatoire",
    optional: "Facultatif",
    saving: "Enregistrement...",
    create: "Créer",
    save: "Enregistrer",
    cancel: "Annuler",
    confirmDelete: "Supprimer définitivement",
    deleteWarning: "La suppression de ce paiement annulera ses effets financiers. Cette action est irréversible.",
    deleteAvailable: "Confirmation disponible dans",
    deleting: "Suppression...",
    failedDelete: "Échec de la suppression du paiement.",
    failed: "Échec de l'enregistrement du paiement.",
    insufficientAccount: "Solde du compte insuffisant.",
    insufficientEntity: "Solde de l'entité insuffisant.",
    totalPayments: "Total Paiements",
    totalPaymentsSub: "Paiements enregistrés",
    totalPaid: "Total Payé",
    totalPaidSub: "Montant combiné",
    accountsInvolved: "Comptes Impliqués",
    accountsInvolvedSub: "Comptes uniques",
    entitiesInvolved: "Entités Impliquées",
    entitiesInvolvedSub: "Entités uniques",
    permanentAction: "ACTION PERMANENTE",
  },
  ar: {
    title: "المدفوعات",
    subtitle: "إدارة المدفوعات والمصاريف وتعديلات العمال وسجلات المعاملات.",
    supplier: "دفع الموردين",
    customer: "دفع الزبائن",
    worker: "دفع العمال",
    expense: "المصاريف",
    vehicle: "مصاريف المركبات",
    search: "البحث عن المدفوعات...",
    searchPlaceholder: "البحث بالجهة أو الحساب أو الملاحظة...",
    payments: "مدفوعات",
    add: "إضافة دفعة",
    edit: "تعديل",
    delete: "حذف",
    amount: "المبلغ",
    account: "الحساب",
    date: "التاريخ",
    entity: "الجهة",
    description: "الوصف",
    note: "ملاحظة",
    actions: "الإجراءات",
    loading: "جارٍ تحميل المدفوعات...",
    noPayments: "لا توجد مدفوعات بعد",
    noPaymentsFound: "لم يتم العثور على مدفوعات",
    noPaymentsForDate: "لا توجد مدفوعات لهذا التاريخ",
    addFirst: "أضف دفعة للبدء في تسجيل المعاملات.",
    tryAnother: "جرّب مصطلح بحث آخر.",
    selectSupplier: "اختر المورد",
    selectCustomer: "اختر الزبون",
    selectWorker: "اختر العامل",
    selectAccount: "اختر الحساب",
    selectVehicle: "اختر المركبة",
    selectExpense: "اسم المصروف",
    salary: "دفع الراتب",
    bonus: "إضافة مكافأة",
    absence: "إضافة غياب",
    bonusAmount: "مبلغ المكافأة",
    absenceAmount: "مبلغ الغياب",
    archive: "أرشفة/استعادة",
    required: "مطلوب",
    optional: "اختياري",
    saving: "جارٍ الحفظ...",
    create: "إنشاء",
    save: "حفظ",
    cancel: "إلغاء",
    confirmDelete: "حذف نهائي",
    deleteWarning: "حذف هذه الدفعة سيؤدي إلى عكس آثارها المالية. لا يمكن التراجع عن هذا الإجراء.",
    deleteAvailable: "يمكن التأكيد بعد",
    deleting: "جارٍ الحذف...",
    failedDelete: "فشل حذف الدفعة.",
    failed: "فشل حفظ الدفعة.",
    insufficientAccount: "رصيد الحساب غير كافٍ.",
    insufficientEntity: "رصيد الجهة غير كافٍ.",
    totalPayments: "إجمالي المدفوعات",
    totalPaymentsSub: "مدفوعات مسجلة",
    totalPaid: "إجمالي المدفوع",
    totalPaidSub: "المبلغ الإجمالي",
    accountsInvolved: "الحسابات المعنية",
    accountsInvolvedSub: "حسابات فريدة",
    entitiesInvolved: "الجهات المعنية",
    entitiesInvolvedSub: "جهات فريدة",
    permanentAction: "إجراء دائم",
  },
} as const;

export default function PaymentsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("supplier");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [formEntityId, setFormEntityId] = useState("");
  const [formAccountId, setFormAccountId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formNote, setFormNote] = useState("");
  const [formVehicleId, setFormVehicleId] = useState("");
  const [formExpenseName, setFormExpenseName] = useState("");
  const [bonusForm, setBonusForm] = useState({ workerId: "", amount: "", date: new Date().toISOString().slice(0, 10) });
  const [absenceForm, setAbsenceForm] = useState({ workerId: "", amount: "", date: new Date().toISOString().slice(0, 10) });
  const [showBonus, setShowBonus] = useState(false);
  const [showAbsence, setShowAbsence] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);
  const [deleteExpenseTarget, setDeleteExpenseTarget] = useState<Expense | null>(null);
  const [deleteCountdown, setDeleteCountdown] = useState(3.5);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<Language>(DEFAULT_SETTINGS.language);
  const [currency, setCurrency] = useState<Currency>(DEFAULT_SETTINGS.currency);

  const t = TRANSLATIONS[language];

  const deleteStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!deleteTarget && !deleteExpenseTarget) {
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
      if (remaining <= 0) window.clearInterval(interval);
    }, 50);
    return () => window.clearInterval(interval);
  }, [deleteTarget, deleteExpenseTarget]);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, c, w, a, p, ex, v] = await Promise.all([
        supplierService.getAll(),
        customerService.getAll(),
        workerService.getAll(),
        bankAccountService.getAll(),
        paymentService.getAll(),
        expenseService.getAll(),
        vehicleService.getAll(),
      ]);
      setSuppliers(s);
      setCustomers(c);
      setWorkers(w);
      setAccounts(a);
      setPayments(p);
      setExpenses(ex);
      setVehicles(v);
    } finally {
      setLoading(false);
    }
  }

  async function loadSettings() {
    const s = await settingsService.get();
    setLanguage(s?.language ?? DEFAULT_SETTINGS.language);
    setCurrency(s?.currency ?? DEFAULT_SETTINGS.currency);
  }

  useEffect(() => {
    void loadSettings();
    void loadAll();
    const h = () => void loadSettings();
    window.addEventListener(SETTINGS_EVENT, h);
    return () => window.removeEventListener(SETTINGS_EVENT, h);
  }, []);

  useDbSync(() => {
    void loadAll();
  }, []);

  // Filter pipeline: category + date -> search -> render
  const { start: dayStart, end: dayEnd } = useMemo(() => getDayBounds(selectedDate), [selectedDate]);

  const paymentsByDate = useMemo(() => {
    return payments.filter((p) => p.date >= dayStart && p.date <= dayEnd);
  }, [payments, dayStart, dayEnd]);

  const expensesByDate = useMemo(() => {
    return expenses.filter((e) => e.date >= dayStart && e.date <= dayEnd);
  }, [expenses, dayStart, dayEnd]);

  const filteredPaymentsByTab = useMemo(() => {
    if (activeTab === "supplier") return paymentsByDate.filter((p) => p.entityType === "supplier");
    if (activeTab === "customer") return paymentsByDate.filter((p) => p.entityType === "customer");
    if (activeTab === "worker") return paymentsByDate.filter((p) => p.entityType === "worker");
    return [];
  }, [paymentsByDate, activeTab]);

  const filteredExpensesByTab = useMemo(() => {
    if (activeTab === "expense") return expensesByDate.filter((e) => !e.note?.startsWith("vehicle:"));
    if (activeTab === "vehicle") return expensesByDate.filter((e) => e.note?.startsWith("vehicle:"));
    return [];
  }, [expensesByDate, activeTab]);

  const isExpenseTab = activeTab === "expense" || activeTab === "vehicle";

  const activeRawList = isExpenseTab ? filteredExpensesByTab : filteredPaymentsByTab;
  const activeCountForKPI = activeRawList.length;
  const activeTotalForKPI = useMemo(() => activeRawList.reduce((sum, item) => sum + (Number((item as Payment).amount ?? (item as Expense).amount) || 0), 0), [activeRawList]);
  const activeAccountsInvolved = useMemo(() => new Set(activeRawList.map((item) => (item as Payment).accountId ?? (item as Expense).accountId)).size, [activeRawList]);
  const activeEntitiesInvolved = useMemo(() => {
    if (isExpenseTab) {
      // for expenses, unique by name or note
      return new Set(filteredExpensesByTab.map((e) => e.name ?? e.note ?? e.id)).size;
    }
    return new Set(filteredPaymentsByTab.map((p) => p.entityId)).size;
  }, [filteredPaymentsByTab, filteredExpensesByTab, isExpenseTab]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (isExpenseTab) {
      const list = filteredExpensesByTab;
      if (!q) return list;
      return list.filter((e) =>
        [e.name, e.note, e.accountId, String(e.amount), accounts.find((a) => a.id === e.accountId)?.name]
          .some((v) => String(v ?? "").toLowerCase().includes(q)),
      );
    }
    // payments path
    const list = filteredPaymentsByTab;
    if (!q) return list;
    return list.filter((p) =>
      [p.entityId, p.accountId, String(p.amount), p.note, entityName(p), accountName(p.accountId)]
        .some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filteredPaymentsByTab, filteredExpensesByTab, isExpenseTab, suppliers, customers, workers, accounts]);

  function entityName(p: Payment) {
    if (p.entityType === "supplier") return suppliers.find((s) => s.id === p.entityId)?.name ?? p.entityId.slice(0, 8);
    if (p.entityType === "customer") return customers.find((c) => c.id === p.entityId)?.name ?? p.entityId.slice(0, 8);
    if (p.entityType === "worker") return workers.find((w) => w.id === p.entityId)?.name ?? p.entityId.slice(0, 8);
    if (p.entityType === "expense") {
      if (p.note?.startsWith("vehicle:")) {
        const parts = p.note.split("|");
        return parts[1] || "Vehicle Expense";
      }
      return p.note || "Expense";
    }
    return p.entityId.slice(0, 8);
  }

  function expenseEntityName(e: Expense) {
    if (e.note?.startsWith("vehicle:")) {
      const parts = e.note.split("|");
      const vehName = parts[1] || "";
      const expName = parts[2] || e.name;
      return vehName ? `${vehName} — ${expName}` : expName;
    }
    return e.name;
  }

  function accountName(id: string) {
    return accounts.find((a) => a.id === id)?.name ?? "—";
  }

  function openCreate() {
    setEditingId(null);
    setEditingExpenseId(null);
    setFormEntityId("");
    setFormAccountId(accounts[0]?.id ?? "");
    setFormAmount("");
    setFormDate(toISODate(selectedDate));
    setFormNote("");
    setFormExpenseName("");
    setFormVehicleId("");
    setError("");
    setShowForm(true);
  }

  function openEdit(p: Payment) {
    setEditingId(p.id);
    setEditingExpenseId(null);
    setFormEntityId(p.entityId);
    setFormAccountId(p.accountId);
    setFormAmount(String(p.amount));
    setFormDate(toISODate(new Date(p.date)));
    setFormNote(p.note ?? "");
    if (p.entityType === "expense" && p.note?.startsWith("vehicle:")) {
      const parts = p.note.split("|");
      const veh = parts[0].replace("vehicle:", "");
      setFormVehicleId(veh);
      setFormExpenseName(parts.slice(2, 3).join("|") || parts.slice(1).join("|"));
      setFormNote(parts.slice(3).join("|"));
    } else if (p.entityType === "expense") {
      setFormExpenseName(p.note ?? "");
      setFormNote("");
    }
    setError("");
    setShowForm(true);
  }

  function openEditExpense(e: Expense) {
    setEditingExpenseId(e.id);
    setEditingId(null);
    setFormAccountId(e.accountId);
    setFormAmount(String(e.amount));
    setFormDate(toISODate(new Date(e.date)));
    if (e.note?.startsWith("vehicle:")) {
      const parts = e.note.split("|");
      setFormVehicleId(parts[0].replace("vehicle:", ""));
      setFormExpenseName(parts[2] ?? e.name);
      setFormNote(parts.slice(3).join("|"));
    } else {
      setFormExpenseName(e.name);
      setFormNote(e.note ?? "");
      setFormVehicleId("");
    }
    setFormEntityId("");
    setError("");
    setShowForm(true);
  }

  function startDeletePayment(p: Payment) {
    setError("");
    setDeleteTarget(p);
    setDeleteExpenseTarget(null);
    setDeleteCountdown(3.5);
    deleteStartRef.current = Date.now();
  }

  function startDeleteExpense(e: Expense) {
    setError("");
    setDeleteExpenseTarget(e);
    setDeleteTarget(null);
    setDeleteCountdown(3.5);
    deleteStartRef.current = Date.now();
  }

  async function confirmDelete() {
    if (deleting) return;
    if (deleteStartRef.current !== null) {
      const elapsed = Date.now() - deleteStartRef.current;
      if (elapsed < 3500) return;
    } else if (deleteCountdown > 0) return;

    setSaving(true);
    try {
      if (deleteTarget) {
        await paymentReversalOperation.delete(deleteTarget.id);
        setDeleteTarget(null);
      } else if (deleteExpenseTarget) {
        await expenseReversalOperation.delete(deleteExpenseTarget.id);
        setDeleteExpenseTarget(null);
      }
      await loadAll();
      setDeleteCountdown(3.5);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedDelete);
    } finally {
      setSaving(false);
    }
  }

  async function savePayment() {
    const amount = Number(formAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !formAccountId) {
      setError(t.failed);
      return;
    }
    let entityType: Payment["entityType"] = "supplier";
    let entityId = formEntityId;
    let note = formNote.trim() || undefined;

    if (activeTab === "supplier") {
      entityType = "supplier";
      if (!entityId) {
        setError(t.failed);
        return;
      }
    } else if (activeTab === "customer") {
      entityType = "customer";
      if (!entityId) {
        setError(t.failed);
        return;
      }
    } else if (activeTab === "worker") {
      entityType = "worker";
      if (!entityId) {
        setError(t.failed);
        return;
      }
    } else if (activeTab === "expense") {
      if (!formExpenseName.trim()) {
        setError(t.failed);
        return;
      }
      // Expense branch: create/update expense
      setSaving(true);
      setError("");
      try {
        const date = new Date(`${formDate}T12:00:00`).getTime();
        if (editingExpenseId) {
          // For expense edit, delete old and create new (simplified)
          await expenseReversalOperation.delete(editingExpenseId);
          await expenseOperation.create({ name: formExpenseName.trim(), amount, accountId: formAccountId, date, note: formNote.trim() || undefined });
        } else if (editingId) {
          const payment = payments.find((p) => p.id === editingId);
          if (payment) await paymentReversalOperation.delete(payment.id);
          await expenseOperation.create({ name: formExpenseName.trim(), amount, accountId: formAccountId, date, note: formNote.trim() || undefined });
        } else {
          await expenseOperation.create({ name: formExpenseName.trim(), amount, accountId: formAccountId, date, note: formNote.trim() || undefined });
        }
        await loadAll();
        setShowForm(false);
        setEditingId(null);
        setEditingExpenseId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failed);
      } finally {
        setSaving(false);
      }
      return;
    } else if (activeTab === "vehicle") {
      if (!formVehicleId || !formExpenseName.trim()) {
        setError(t.failed);
        return;
      }
      const vehicle = vehicles.find((v) => v.id === formVehicleId);
      note = `vehicle:${formVehicleId}|${vehicle?.name ?? ""}|${formExpenseName.trim()}|${formNote.trim()}`;
      setSaving(true);
      setError("");
      try {
        const date = new Date(`${formDate}T12:00:00`).getTime();
        if (editingExpenseId) {
          await expenseReversalOperation.delete(editingExpenseId);
          await expenseOperation.create({ name: formExpenseName.trim(), amount, accountId: formAccountId, date, note });
        } else if (editingId) {
          const payment = payments.find((p) => p.id === editingId);
          if (payment) await paymentReversalOperation.delete(payment.id);
          await expenseOperation.create({ name: formExpenseName.trim(), amount, accountId: formAccountId, date, note });
        } else {
          await expenseOperation.create({ name: formExpenseName.trim(), amount, accountId: formAccountId, date, note });
        }
        await loadAll();
        setShowForm(false);
        setEditingId(null);
        setEditingExpenseId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failed);
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    setError("");
    try {
      const date = new Date(`${formDate}T12:00:00`).getTime();
      if (editingId) {
        await paymentEditOperation.edit({ paymentId: editingId, entityType, entityId, accountId: formAccountId, amount, date, note });
      } else {
        await paymentOperation.create({ entityType, entityId, accountId: formAccountId, amount, date, note });
      }
      await loadAll();
      setShowForm(false);
      setEditingId(null);
      setEditingExpenseId(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t.failed;
      if (msg.includes("account")) setError(t.insufficientAccount);
      else if (msg.includes("balance")) setError(t.insufficientEntity);
      else setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function doBonus() {
    const amount = Number(bonusForm.amount);
    if (!bonusForm.workerId || !Number.isFinite(amount) || amount <= 0) {
      setError(t.failed);
      return;
    }
    setSaving(true);
    try {
      await workerBalanceOperation.addBonus({ workerId: bonusForm.workerId, date: new Date(`${bonusForm.date}T12:00:00`).getTime(), amount });
      await loadAll();
      setShowBonus(false);
      setBonusForm({ workerId: "", amount: "", date: toISODate(selectedDate) });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failed);
    } finally {
      setSaving(false);
    }
  }

  async function doAbsence() {
    const amount = Number(absenceForm.amount);
    if (!absenceForm.workerId || !Number.isFinite(amount) || amount <= 0) {
      setError(t.failed);
      return;
    }
    setSaving(true);
    try {
      await workerBalanceOperation.addAbsence({ workerId: absenceForm.workerId, date: new Date(`${absenceForm.date}T12:00:00`).getTime(), amount });
      await loadAll();
      setShowAbsence(false);
      setAbsenceForm({ workerId: "", amount: "", date: toISODate(selectedDate) });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failed);
    } finally {
      setSaving(false);
    }
  }

  const tabLabel = (tab: Tab) => {
    if (tab === "supplier") return t.supplier;
    if (tab === "customer") return t.customer;
    if (tab === "worker") return t.worker;
    if (tab === "expense") return t.expense;
    return t.vehicle;
  };

  const entityColumnLabel = useMemo(() => {
    if (activeTab === "supplier") return language === "fr" ? "Fournisseur" : language === "ar" ? "المورد" : "Supplier";
    if (activeTab === "customer") return language === "fr" ? "Client" : language === "ar" ? "الزبون" : "Customer";
    if (activeTab === "worker") return language === "fr" ? "Employé" : language === "ar" ? "العامل" : "Worker";
    if (activeTab === "vehicle") return language === "fr" ? "Véhicule" : language === "ar" ? "المركبة" : "Vehicle";
    return language === "fr" ? "Dépense" : language === "ar" ? "المصروف" : "Expense";
  }, [activeTab, language]);

  return (
    <AppShell activePage="payments" showHeader={false}>
      <main className={styles.paymentsPage}>
        <div className={styles.paymentsShell}>
          {/* Unified Payments header — brand / search / date / contextual actions / add */}
          <div className={styles.headerContainer}>
          <section className={activeTab === "worker" ? `${styles.paymentsHeader} ${styles.paymentsHeaderWorker}` : styles.paymentsHeader}>
            <div className={styles.paymentsHeaderBrand}>
              <div className={styles.paymentsLogo}>
                <img src="/chicken.jpg" alt="" />
              </div>
              <div className={styles.paymentsTitle}>
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
                onChange={(e) => setSearch(e.target.value)}
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

            {activeTab === "worker" && (
              <>
                <button type="button" className={styles.secondaryButton} onClick={() => { setBonusForm((c) => ({ ...c, date: toISODate(selectedDate) })); setShowBonus(true); }}>
                  {t.bonus}
                </button>
                <button type="button" className={styles.secondaryButton} onClick={() => { setAbsenceForm((c) => ({ ...c, date: toISODate(selectedDate) })); setShowAbsence(true); }}>
                  {t.absence}
                </button>
              </>
            )}

            <button type="button" className={styles.primaryButton} onClick={openCreate}>
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              {t.add}
            </button>
          </section>
          </div>

          {/* Category Tabs */}
          <nav className={styles.categoryTabs} aria-label="Payment categories">
            {(["supplier", "customer", "worker", "expense", "vehicle"] as Tab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={tab === activeTab ? styles.tabActive : styles.tab}
                onClick={() => setActiveTab(tab)}
                aria-pressed={tab === activeTab}
              >
                {tabLabel(tab)}
              </button>
            ))}
          </nav>

          {/* KPI Cards — RED→YELLOW→RED→YELLOW */}
          <section className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconPurchases}`}>
                <Receipt size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.totalPayments}</span>
                <strong className={styles.summaryValue}>{activeCountForKPI}</strong>
                <small className={styles.summarySub}>{t.totalPaymentsSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconValue}`}>
                <CircleDollarSign size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.totalPaid}</span>
                <strong className={styles.summaryValue}>{formatCurrency(activeTotalForKPI, currency)}</strong>
                <small className={styles.summarySub}>{t.totalPaidSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconWeight}`}>
                <Wallet size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.accountsInvolved}</span>
                <strong className={styles.summaryValue}>{activeAccountsInvolved}</strong>
                <small className={styles.summarySub}>{t.accountsInvolvedSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconSuppliers}`}>
                <Users size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.entitiesInvolved}</span>
                <strong className={styles.summaryValue}>{activeEntitiesInvolved}</strong>
                <small className={styles.summarySub}>{t.entitiesInvolvedSub}</small>
              </div>
            </div>
          </section>

          {error && !showForm && !deleteTarget && !deleteExpenseTarget && !showBonus && !showAbsence && (
            <div className={styles.errorBanner}>{error}</div>
          )}

          <section className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <span>{entityColumnLabel}</span>
              <span>{t.description}</span>
              <span>{t.account}</span>
              <span>{t.amount}</span>
              <span>{t.actions}</span>
            </div>

            {loading ? (
              <div className={styles.emptyState}>
                <div className={styles.loadingPulse} />
                <strong>{t.loading}</strong>
              </div>
            ) : filtered.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon} aria-hidden="true">
                  <Banknote size={32} strokeWidth={2} aria-hidden="true" />
                </div>
                <strong>{activeCountForKPI === 0 ? t.noPaymentsForDate : t.noPaymentsFound}</strong>
                <p>{activeCountForKPI === 0 ? t.addFirst : t.tryAnother}</p>
              </div>
            ) : (
              <div className={styles.paymentRows}>
                {isExpenseTab
                  ? (filtered as Expense[]).map((e) => (
                      <article key={e.id} className={styles.paymentRow} onDoubleClick={() => openEditExpense(e)}>
                        <span className={styles.entityText}>{expenseEntityName(e)}</span>
                        <span className={styles.noteCell}>{e.note?.startsWith("vehicle:") ? e.note.split("|").slice(3).join("|") || e.name : e.note || "—"}</span>
                        <span className={styles.accountText}>{accountName(e.accountId)}</span>
                        <strong className={styles.amountText}>{formatCurrency(e.amount, currency)}</strong>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.rowEditButton}
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditExpense(e);
                            }}
                            aria-label={t.edit}
                          >
                            <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                            {t.edit}
                          </button>
                          <button
                            type="button"
                            className={styles.rowDeleteButton}
                            onClick={(event) => {
                              event.stopPropagation();
                              startDeleteExpense(e);
                            }}
                            aria-label={t.delete}
                          >
                            <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                            {t.delete}
                          </button>
                        </div>
                      </article>
                    ))
                  : (filtered as Payment[]).map((p) => (
                      <article key={p.id} className={styles.paymentRow} onDoubleClick={() => openEdit(p)}>
                        <span className={styles.entityText}>{entityName(p)}</span>
                        <span className={styles.noteCell}>{p.note ? (p.note.startsWith("vehicle:") ? p.note.split("|").slice(3).join("|") || p.note.split("|").slice(2).join("|") : p.note) : "—"}</span>
                        <span className={styles.accountText}>{accountName(p.accountId)}</span>
                        <strong className={styles.amountText}>{formatCurrency(p.amount, currency)}</strong>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.rowEditButton}
                            onClick={(event) => {
                              event.stopPropagation();
                              openEdit(p);
                            }}
                            aria-label={t.edit}
                          >
                            <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                            {t.edit}
                          </button>
                          <button
                            type="button"
                            className={styles.rowDeleteButton}
                            onClick={(event) => {
                              event.stopPropagation();
                              startDeletePayment(p);
                            }}
                            aria-label={t.delete}
                          >
                            <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                            {t.delete}
                          </button>
                        </div>
                      </article>
                    ))}
              </div>
            )}
          </section>

          {showForm && (
            <div className={styles.modalBackdrop} onClick={() => { if (!saving) setShowForm(false); }}>
              <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <header className={styles.modalHeader}>
                  <h2>
                    {editingId || editingExpenseId ? t.edit : t.add} — {tabLabel(activeTab)}
                  </h2>
                  <button type="button" className={styles.closeButton} onClick={() => setShowForm(false)} aria-label="Close">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </header>
                <div className={styles.formGrid}>
                  {activeTab === "supplier" && (
                    <label className={styles.fullWidth}>
                      <span>{t.selectSupplier}</span>
                      <StyledSelect
                        value={formEntityId}
                        onChange={setFormEntityId}
                        placeholder={t.selectSupplier}
                        ariaLabel={t.selectSupplier}
                        options={suppliers.map((s) => ({
                          value: s.id,
                          label: s.name,
                          sublabel: formatCurrency(Number(s.balance) || 0, currency),
                        }))}
                      />
                    </label>
                  )}
                  {activeTab === "customer" && (
                    <label className={styles.fullWidth}>
                      <span>{t.selectCustomer}</span>
                      <StyledSelect
                        value={formEntityId}
                        onChange={setFormEntityId}
                        placeholder={t.selectCustomer}
                        ariaLabel={t.selectCustomer}
                        options={customers.map((c) => ({
                          value: c.id,
                          label: c.name,
                          sublabel: formatCurrency(Number(c.balance) || 0, currency),
                        }))}
                      />
                    </label>
                  )}
                  {activeTab === "worker" && (
                    <label className={styles.fullWidth}>
                      <span>{t.selectWorker}</span>
                      <StyledSelect
                        value={formEntityId}
                        onChange={setFormEntityId}
                        placeholder={t.selectWorker}
                        ariaLabel={t.selectWorker}
                        options={workers
                          .filter((w) => w.status === "active")
                          .map((w) => ({
                            value: w.id,
                            label: w.name,
                            sublabel: formatCurrency(Number(w.balance) || 0, currency),
                          }))}
                      />
                    </label>
                  )}
                  {activeTab === "expense" && (
                    <label className={styles.fullWidth}>
                      <span>{t.selectExpense}</span>
                      <input value={formExpenseName} onChange={(e) => setFormExpenseName(e.target.value)} placeholder={t.selectExpense} />
                    </label>
                  )}
                  {activeTab === "vehicle" && (
                    <>
                      <label>
                        <span>{t.selectVehicle}</span>
                        <StyledSelect
                          value={formVehicleId}
                          onChange={setFormVehicleId}
                          placeholder={t.selectVehicle}
                          ariaLabel={t.selectVehicle}
                          options={vehicles.map((v) => ({
                            value: v.id,
                            label: v.name,
                            sublabel: v.registrationNumber,
                          }))}
                        />
                      </label>
                      <label>
                        <span>{t.selectExpense}</span>
                        <input value={formExpenseName} onChange={(e) => setFormExpenseName(e.target.value)} placeholder={t.selectExpense} />
                      </label>
                    </>
                  )}
                  <label>
                    <span>{t.selectAccount}</span>
                    <StyledSelect
                      value={formAccountId}
                      onChange={setFormAccountId}
                      placeholder={t.selectAccount}
                      ariaLabel={t.selectAccount}
                      options={accounts.map((a) => ({
                        value: a.id,
                        label: a.name,
                        sublabel: formatCurrency(Number(a.balance) || 0, currency),
                      }))}
                    />
                  </label>
                  <label>
                    <span>{t.amount}</span>
                    <input type="number" min="0.01" step="0.01" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} />
                  </label>
                  <label>
                    <span>{t.date}</span>
                    <StyledDatePicker value={formDate} onChange={setFormDate} language={language} placeholder={t.date} ariaLabel={t.date} />
                  </label>
                  <label className={activeTab === "vehicle" ? "" : styles.fullWidth}>
                    <span>
                      {t.note} <small style={{ color: "var(--muted)", fontWeight: 600 }}>({t.optional})</small>
                    </span>
                    <input value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder={t.note} />
                  </label>
                </div>
                {error && <div className={styles.formError}>{error}</div>}
                <footer className={styles.modalFooter}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setShowForm(false)} disabled={saving}>
                    {t.cancel}
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={savePayment} disabled={saving}>
                    {saving ? t.saving : editingId || editingExpenseId ? t.save : t.create}
                  </button>
                </footer>
              </section>
            </div>
          )}

          {showBonus && (
            <div className={styles.modalBackdrop} onClick={() => setShowBonus(false)}>
              <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <header className={styles.modalHeader}>
                  <h2>{t.bonus}</h2>
                  <button type="button" className={styles.closeButton} onClick={() => setShowBonus(false)} aria-label="Close">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </header>
                <div className={styles.formGrid}>
                  <label className={styles.fullWidth}>
                    <span>{t.selectWorker}</span>
                    <StyledSelect
                      value={bonusForm.workerId}
                      onChange={(v) => setBonusForm((c) => ({ ...c, workerId: v }))}
                      placeholder={t.selectWorker}
                      ariaLabel={t.selectWorker}
                      options={workers
                        .filter((w) => w.status === "active")
                        .map((w) => ({
                          value: w.id,
                          label: w.name,
                          sublabel: formatCurrency(Number(w.balance) || 0, currency),
                        }))}
                    />
                  </label>
                  <label>
                    <span>{t.bonusAmount}</span>
                    <input type="number" min="0.01" step="0.01" value={bonusForm.amount} onChange={(e) => setBonusForm((c) => ({ ...c, amount: e.target.value }))} />
                  </label>
                  <label>
                    <span>{t.date}</span>
                    <StyledDatePicker value={bonusForm.date} onChange={(v) => setBonusForm((c) => ({ ...c, date: v }))} language={language} placeholder={t.date} ariaLabel={t.date} />
                  </label>
                </div>
                {error && <div className={styles.formError}>{error}</div>}
                <footer className={styles.modalFooter}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setShowBonus(false)} disabled={saving}>
                    {t.cancel}
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={doBonus} disabled={saving}>
                    {saving ? t.saving : t.create}
                  </button>
                </footer>
              </section>
            </div>
          )}

          {showAbsence && (
            <div className={styles.modalBackdrop} onClick={() => setShowAbsence(false)}>
              <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <header className={styles.modalHeader}>
                  <h2>{t.absence}</h2>
                  <button type="button" className={styles.closeButton} onClick={() => setShowAbsence(false)} aria-label="Close">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </header>
                <div className={styles.formGrid}>
                  <label className={styles.fullWidth}>
                    <span>{t.selectWorker}</span>
                    <StyledSelect
                      value={absenceForm.workerId}
                      onChange={(v) => setAbsenceForm((c) => ({ ...c, workerId: v }))}
                      placeholder={t.selectWorker}
                      ariaLabel={t.selectWorker}
                      options={workers
                        .filter((w) => w.status === "active")
                        .map((w) => ({
                          value: w.id,
                          label: w.name,
                          sublabel: formatCurrency(Number(w.balance) || 0, currency),
                        }))}
                    />
                  </label>
                  <label>
                    <span>{t.absenceAmount}</span>
                    <input type="number" min="0.01" step="0.01" value={absenceForm.amount} onChange={(e) => setAbsenceForm((c) => ({ ...c, amount: e.target.value }))} />
                  </label>
                  <label>
                    <span>{t.date}</span>
                    <StyledDatePicker value={absenceForm.date} onChange={(v) => setAbsenceForm((c) => ({ ...c, date: v }))} language={language} placeholder={t.date} ariaLabel={t.date} />
                  </label>
                </div>
                {error && <div className={styles.formError}>{error}</div>}
                <footer className={styles.modalFooter}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setShowAbsence(false)} disabled={saving}>
                    {t.cancel}
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={doAbsence} disabled={saving}>
                    {saving ? t.saving : t.create}
                  </button>
                </footer>
              </section>
            </div>
          )}

          {(deleteTarget || deleteExpenseTarget) && (
            <div className={styles.modalBackdrop}>
              <section className={styles.deleteModalCompact} role="dialog" aria-modal="true" aria-labelledby="delete-title">
                <div className={styles.warningIconSmall} aria-hidden="true">
                  <AlertTriangle size={20} strokeWidth={2} />
                </div>
                <h2 id="delete-title">{t.confirmDelete}</h2>
                <p className={styles.deleteDescription}>{t.deleteWarning}</p>
                <p className={styles.deleteContext}>
                  {deleteTarget
                    ? `${entityName(deleteTarget)} · ${accountName(deleteTarget.accountId)} · ${formatCurrency(deleteTarget.amount, currency)}`
                    : deleteExpenseTarget
                      ? `${expenseEntityName(deleteExpenseTarget)} · ${accountName(deleteExpenseTarget.accountId)} · ${formatCurrency(deleteExpenseTarget.amount, currency)}`
                      : ""}
                </p>
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
                    <span className={styles.circleText}>{deleteCountdown > 0 ? deleteCountdown.toFixed(1) : "0.0"}</span>
                  </div>
                  <span className={styles.circleLabel}>{deleteCountdown > 0 ? "Confirm deletion" : t.confirmDelete}</span>
                </div>
                {error && <div className={styles.formError}>{error}</div>}
                <div className={styles.modalFooterCompact}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      if (!deleting) {
                        setDeleteTarget(null);
                        setDeleteExpenseTarget(null);
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
                    onClick={() => void confirmDelete()}
                    disabled={deleteCountdown > 0 || deleting}
                  >
                    <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                    {deleting ? t.deleting : t.confirmDelete}
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


