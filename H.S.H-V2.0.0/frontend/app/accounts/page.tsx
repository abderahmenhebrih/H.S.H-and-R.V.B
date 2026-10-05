"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDbSync } from "../../src/hooks/useDbSync";
import {
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  Building2,
  ChevronDown,
  CircleDollarSign,
  Pencil,
  Plus,
  Search,
  Trash2,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import StyledDatePicker from "../../src/components/common/StyledDatePicker";
import AppShell from "../../src/components/layout/AppShell";
import { bankAccountService } from "../../src/services/bank-account.service";
import { bankAccountEditOperation } from "../../src/services/operations/bank-account-edit.operation";
import { bankAccountDeleteOperation } from "../../src/services/operations/bank-account-delete.operation";
import { transferOperation } from "../../src/services/operations/transfer.operation";
import { settingsService } from "../../src/services/settings.service";
import {
  DEFAULT_SETTINGS,
  formatCurrency,
  SETTINGS_EVENT,
} from "../../src/lib/settings";
import { exactNumberLabel, formatCompactCurrency, formatCompactNumber } from "../../src/lib/compact-number";
import type { BankAccount } from "../../src/types/entities/bank-account";
import type { Currency, Language } from "../../src/types/settings/settings";
import styles from "./page.module.css";
import countdownStyles from "../../src/components/common/ProtectedDeleteModal.module.css";
import { useCircularDeleteCountdown } from "../../src/hooks/useCircularDeleteCountdown";

type AccountForm = {
  type: "cash" | "bank";
  name: string;
  initialBalance: string;
  notes: string;
};

type TransferForm = {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  date: string;
  note: string;
};

const EMPTY_FORM: AccountForm = {
  type: "cash",
  name: "",
  initialBalance: "",
  notes: "",
};

const TRANSLATIONS = {
  en: {
    title: "Accounts",
    subtitle: "Manage financial accounts, balances and transfers.",
    search: "Search accounts...",
    searchPlaceholder: "Search accounts by name, type, or notes...",
    account: "Account",
    accounts: "accounts",
    accountSingular: "account",
    type: "Type",
    name: "Name",
    balance: "Balance",
    initialBalance: "Initial Balance",
    notes: "Notes",
    actions: "Actions",
    addAccount: "Add Account",
    transfer: "Transfer",
    loading: "Loading accounts...",
    noAccounts: "No accounts yet",
    noAccountsFound: "No accounts found",
    addFirst: "Add your first account to begin.",
    tryAnother: "Try another search term.",
    noInfo: "No notes",
    newAccount: "NEW ACCOUNT",
    editAccount: "EDIT ACCOUNT",
    addAccountTitle: "Add Account",
    editAccountTitle: "Edit Account",
    create: "Create Account",
    save: "Save Changes",
    saving: "Saving...",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    cash: "Cash",
    bank: "Bank",
    cashLabel: "سيولة نقدية",
    bankLabel: "حساب بنكي",
    required: "Required",
    optional: "Optional",
    nameRequired: "Account name is required.",
    failedLoad: "Failed to load accounts.",
    failedSave: "Failed to save account.",
    deleteAccount: "Delete Account",
    deleteQuestion: "Are you sure you want to delete this account?",
    deleteWarning: "Accounts with non-zero balance or linked history cannot be deleted. This uses protected deletion.",
    confirmDelete: "Delete Permanently",
    deleting: "Deleting...",
    deleteAvailable: "Confirm available in",
    permanentAction: "PERMANENT ACTION",
    transferTitle: "Transfer Between Accounts",
    transferButton: "Transfer",
    source: "Source Account",
    destination: "Destination Account",
    amount: "Amount",
    date: "Date",
    transferring: "Transferring...",
    amountRequired: "Amount is required.",
    sameAccount: "Source and destination must be different.",
    insufficient: "Insufficient source balance.",
    totalAccounts: "Total Accounts",
    totalAccountsSub: "All accounts",
    totalBalance: "Total Balance",
    totalBalanceSub: "Combined balance",
    bankAccounts: "Bank Accounts",
    bankAccountsSub: "Bank type accounts",
    cashAccounts: "Cash Accounts",
    cashAccountsSub: "Cash type accounts",
    selectType: "Select account type",
  },
  fr: {
    title: "Comptes",
    subtitle: "Gérer les comptes bancaires et de trésorerie, soldes et transferts.",
    search: "Rechercher des comptes...",
    searchPlaceholder: "Rechercher par nom, type ou notes...",
    account: "Compte",
    accounts: "comptes",
    accountSingular: "compte",
    type: "Type",
    name: "Nom",
    balance: "Solde",
    initialBalance: "Solde initial",
    notes: "Notes",
    actions: "Actions",
    addAccount: "Ajouter un compte",
    transfer: "Transfert",
    loading: "Chargement des comptes...",
    noAccounts: "Aucun compte pour le moment",
    noAccountsFound: "Aucun compte trouvé",
    addFirst: "Ajoutez votre premier compte pour commencer.",
    tryAnother: "Essayez un autre terme de recherche.",
    noInfo: "Aucune note",
    newAccount: "NOUVEAU COMPTE",
    editAccount: "MODIFIER LE COMPTE",
    addAccountTitle: "Ajouter un compte",
    editAccountTitle: "Modifier le compte",
    create: "Créer le compte",
    save: "Enregistrer",
    saving: "Enregistrement...",
    cancel: "Annuler",
    edit: "Modifier",
    delete: "Supprimer",
    cash: "Espèces",
    bank: "Banque",
    cashLabel: "سيولة نقدية",
    bankLabel: "حساب بنكي",
    required: "Obligatoire",
    optional: "Facultatif",
    nameRequired: "Le nom du compte est obligatoire.",
    failedLoad: "Échec du chargement des comptes.",
    failedSave: "Échec de l'enregistrement du compte.",
    deleteAccount: "Supprimer le compte",
    deleteQuestion: "Voulez-vous vraiment supprimer ce compte ?",
    deleteWarning: "Les comptes avec un solde non nul ou avec un historique lié ne peuvent pas être supprimés.",
    confirmDelete: "Supprimer définitivement",
    deleting: "Suppression...",
    deleteAvailable: "Confirmation disponible dans",
    permanentAction: "ACTION PERMANENTE",
    transferTitle: "Transfert entre comptes",
    transferButton: "Transférer",
    source: "Compte source",
    destination: "Compte destination",
    amount: "Montant",
    date: "Date",
    transferring: "Transfert...",
    amountRequired: "Le montant est obligatoire.",
    sameAccount: "Source et destination doivent être différents.",
    insufficient: "Solde source insuffisant.",
    totalAccounts: "Total Comptes",
    totalAccountsSub: "Tous les comptes",
    totalBalance: "Solde Total",
    totalBalanceSub: "Solde combiné",
    bankAccounts: "Comptes Bancaires",
    bankAccountsSub: "Type banque",
    cashAccounts: "Comptes Espèces",
    cashAccountsSub: "Type espèces",
    selectType: "Sélectionner le type de compte",
  },
  ar: {
    title: "الحسابات",
    subtitle: "إدارة الحسابات البنكية والنقدية والتحويلات.",
    search: "البحث عن الحسابات...",
    searchPlaceholder: "البحث بالاسم أو النوع أو الملاحظات...",
    account: "الحساب",
    accounts: "حسابات",
    accountSingular: "حساب",
    type: "النوع",
    name: "الاسم",
    balance: "الرصيد",
    initialBalance: "الرصيد الابتدائي",
    notes: "ملاحظات",
    actions: "الإجراءات",
    addAccount: "إضافة حساب",
    transfer: "تحويل",
    loading: "جارٍ تحميل الحسابات...",
    noAccounts: "لا توجد حسابات بعد",
    noAccountsFound: "لم يتم العثور على حسابات",
    addFirst: "أضف أول حساب للبدء.",
    tryAnother: "جرّب مصطلح بحث آخر.",
    noInfo: "لا توجد ملاحظات",
    newAccount: "حساب جديد",
    editAccount: "تعديل الحساب",
    addAccountTitle: "إضافة حساب",
    editAccountTitle: "تعديل الحساب",
    create: "إنشاء الحساب",
    save: "حفظ التغييرات",
    saving: "جارٍ الحفظ...",
    cancel: "إلغاء",
    edit: "تعديل",
    delete: "حذف",
    cash: "نقدي",
    bank: "بنكي",
    cashLabel: "سيولة نقدية",
    bankLabel: "حساب بنكي",
    required: "مطلوب",
    optional: "اختياري",
    nameRequired: "اسم الحساب مطلوب.",
    failedLoad: "فشل تحميل الحسابات.",
    failedSave: "فشل حفظ الحساب.",
    deleteAccount: "حذف الحساب",
    deleteQuestion: "هل أنت متأكد من رغبتك في حذف هذا الحساب؟",
    deleteWarning: "لا يمكن حذف الحسابات ذات الرصيد غير الصفري أو المرتبطة بسجل.",
    confirmDelete: "حذف نهائي",
    deleting: "جارٍ الحذف...",
    deleteAvailable: "يمكن التأكيد بعد",
    permanentAction: "إجراء دائم",
    transferTitle: "تحويل بين الحسابات",
    transferButton: "تحويل",
    source: "الحساب المصدر",
    destination: "الحساب الوجهة",
    amount: "المبلغ",
    date: "التاريخ",
    transferring: "جارٍ التحويل...",
    amountRequired: "المبلغ مطلوب.",
    sameAccount: "يجب أن يكون المصدر والوجهة مختلفين.",
    insufficient: "رصيد المصدر غير كافٍ.",
    totalAccounts: "إجمالي الحسابات",
    totalAccountsSub: "جميع الحسابات",
    totalBalance: "إجمالي الرصيد",
    totalBalanceSub: "الرصيد الإجمالي",
    bankAccounts: "الحسابات البنكية",
    bankAccountsSub: "حسابات بنكية",
    cashAccounts: "حسابات نقدية",
    cashAccountsSub: "حسابات نقدية",
    selectType: "اختر نوع الحساب",
  },
} as const;

function AccountTypeDropdown({
  value,
  onChange,
  placeholder,
  triggerRef,
  onEnterNavigate,
  t,
}: {
  value: "cash" | "bank" | "";
  options?: string[];
  placeholder: string;
  onChange: (value: "cash" | "bank") => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  onEnterNavigate?: () => void;
  t: { cash: string; bank: string };
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        !(triggerRef?.current && triggerRef.current.contains(e.target as Node))
      ) {
        setOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [triggerRef]);

  const displayLabel = value === "cash" ? t.cash : value === "bank" ? t.bank : "";

  return (
    <div className={styles.customDropdown} ref={containerRef}>
      <button
        ref={triggerRef as React.RefObject<HTMLButtonElement>}
        type="button"
        className={`${styles.customDropdownTrigger} ${open ? styles.customDropdownOpen : ""}`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (!open) {
              setOpen(true);
            } else if (onEnterNavigate) {
              setOpen(false);
              onEnterNavigate();
            }
          }
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={value ? styles.customDropdownValue : styles.customDropdownPlaceholder}>
          {displayLabel || placeholder}
        </span>
        <span className={`${styles.customDropdownArrow} ${open ? styles.customDropdownArrowOpen : ""}`} aria-hidden="true">
          <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
        </span>
      </button>

      {open && (
        <div className={styles.customDropdownMenu} role="listbox">
          {(
            [
              { value: "cash" as const, label: t.cash },
              { value: "bank" as const, label: t.bank },
            ] as const
          ).map((option) => (
            <button
              type="button"
              key={option.value}
              role="option"
              aria-selected={value === option.value}
              className={`${styles.customDropdownOption} ${value === option.value ? styles.customDropdownOptionSelected : ""}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                if (onEnterNavigate) {
                  // allow focus to move after selection if needed via caller
                }
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TransferAccountDropdown({
  value,
  placeholder,
  accounts,
  currency,
  onChange,
}: {
  value: string;
  placeholder: string;
  accounts: BankAccount[];
  currency: Currency;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        // allow focus movement if needed, keep open
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  const selected = accounts.find((a) => a.id === value);
  const displayLabel = selected ? `${selected.name} — ${formatCurrency(selected.balance, currency)}` : "";

  return (
    <div className={styles.customDropdown} ref={containerRef}>
      <button
        type="button"
        className={`${styles.customDropdownTrigger} ${open ? styles.customDropdownOpen : ""}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          } else if (e.key === "Escape") {
            setOpen(false);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={value ? styles.customDropdownValue : styles.customDropdownPlaceholder}>
          {displayLabel || placeholder}
        </span>
        <span
          className={`${styles.customDropdownArrow} ${open ? styles.customDropdownArrowOpen : ""}`}
          aria-hidden="true"
        >
          <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
        </span>
      </button>

      {open && (
        <div className={styles.customDropdownMenu} role="listbox">
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className={`${styles.customDropdownOption} ${!value ? styles.customDropdownOptionSelected : ""}`}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            {placeholder}
          </button>
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              role="option"
              aria-selected={value === a.id}
              className={`${styles.customDropdownOption} ${
                value === a.id ? styles.customDropdownOptionSelected : ""
              }`}
              onClick={() => {
                onChange(a.id);
                setOpen(false);
              }}
            >
              {a.name} — {formatCurrency(a.balance, currency)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [transferForm, setTransferForm] = useState<TransferForm>({
    fromAccountId: "",
    toAccountId: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    note: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<Language>(DEFAULT_SETTINGS.language);
  const [currency, setCurrency] = useState<Currency>(DEFAULT_SETTINGS.currency);

  const nameRef = useRef<HTMLInputElement>(null);
  const typeTriggerRef = useRef<HTMLButtonElement>(null);
  const initialBalanceRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const t = TRANSLATIONS[language];

  const {
    displaySec: deleteDisplaySec,
    isReady: deleteReady,
    startRef: deleteStartRef,
  } = useCircularDeleteCountdown(
    !!deleteTarget,
    deleteTarget?.id ?? null,
  );

  async function loadSettings() {
    const s = await settingsService.get();
    setLanguage(s?.language ?? DEFAULT_SETTINGS.language);
    setCurrency(s?.currency ?? DEFAULT_SETTINGS.currency);
  }

  async function loadAccounts() {
    setLoading(true);
    try {
      setAccounts(await bankAccountService.getAll());
    } catch {
      setError(t.failedLoad);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
    void loadAccounts();
    const h = () => void loadSettings();
    window.addEventListener(SETTINGS_EVENT, h);
    return () => window.removeEventListener(SETTINGS_EVENT, h);
  }, []);

  useDbSync(() => {
    void loadAccounts();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) =>
      [a.name, a.type, a.notes, String(a.balance)].some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }, [accounts, search]);

  const totalAccounts = accounts.length;
  const hasInvalidBalance = useMemo(() => accounts.some((a) => a.balance !== undefined && a.balance !== null && !Number.isFinite(a.balance)), [accounts]);
  const totalBalance = useMemo(() => accounts.reduce((sum, a) => sum + (Number.isFinite(a.balance) ? a.balance : 0), 0), [accounts]);
  const bankCount = useMemo(() => accounts.filter((a) => a.type === "bank").length, [accounts]);
  const cashCount = useMemo(() => accounts.filter((a) => a.type === "cash").length, [accounts]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
    setShowForm(true);
  }

  function openEdit(a: BankAccount) {
    setEditingId(a.id);
    setForm({ type: a.type, name: a.name, initialBalance: String(a.initialBalance), notes: a.notes ?? "" });
    setError("");
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  function closeTransfer() {
    if (transferring) return;
    setShowTransfer(false);
    setError("");
  }

  async function saveAccount() {
    if (!form.name.trim()) {
      setError(t.nameRequired);
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await bankAccountEditOperation.edit({ accountId: editingId, name: form.name.trim() });
      } else {
        const initial = form.initialBalance.trim() ? Number(form.initialBalance) : 0;
        if (!Number.isFinite(initial) || initial < 0) {
          setError(t.failedSave);
          setSaving(false);
          return;
        }
        await bankAccountService.create({
          type: form.type,
          name: form.name.trim(),
          initialBalance: initial,
          notes: form.notes.trim() || undefined,
        });
      }
      await loadAccounts();
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedSave);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteStartRef.current !== null) {
      const elapsed = Date.now() - deleteStartRef.current;
      if (elapsed < 3500) return;
    } else if (!deleteReady) {
      return;
    }
    setDeleting(true);
    setError("");
    try {
      await bankAccountDeleteOperation.delete(deleteTarget.id);
      setAccounts((c) => c.filter((a) => a.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedSave);
    } finally {
      setDeleting(false);
    }
  }

  async function doTransfer() {
    if (!transferForm.fromAccountId || !transferForm.toAccountId) {
      setError(t.failedSave);
      return;
    }
    if (transferForm.fromAccountId === transferForm.toAccountId) {
      setError(t.sameAccount);
      return;
    }
    const amount = Number(transferForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t.amountRequired);
      return;
    }
    setTransferring(true);
    setError("");
    try {
      await transferOperation.create({
        fromAccountId: transferForm.fromAccountId,
        toAccountId: transferForm.toAccountId,
        amount,
        date: new Date(`${transferForm.date}T12:00:00`).getTime(),
        note: transferForm.note.trim() || undefined,
      });
      await loadAccounts();
      setShowTransfer(false);
      setTransferForm({ fromAccountId: "", toAccountId: "", amount: "", date: new Date().toISOString().slice(0, 10), note: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedSave);
    } finally {
      setTransferring(false);
    }
  }

  function typeLabel(type: string) {
    if (language === "ar") return type === "cash" ? "سيولة نقدية" : "حساب بنكي";
    return type === "cash" ? t.cash : t.bank;
  }

  return (
    <AppShell activePage="accounts" showHeader={false}>
      <main className={styles.accountsPage}>
        <div className={styles.accountsShell}>
          {/* Unified Accounts header — brand / search / transfer / add */}
          <div className={styles.headerContainer}>
          <section className={styles.accountsHeader}>
            <div className={styles.accountsHeaderBrand}>
              <div className={styles.accountsLogo}>
                <img src="/chicken.jpg" alt="" />
              </div>
              <div className={styles.accountsTitle}>
                <h1>{t.title}</h1>
                <p>{t.subtitle}</p>
              </div>
            </div>

            <div className={styles.searchBox}>
              <span aria-hidden="true">
                <Search size={18} strokeWidth={2} aria-hidden="true" />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.searchPlaceholder}
                aria-label={t.search}
              />
            </div>

            <button type="button" className={styles.secondaryButton} onClick={() => setShowTransfer(true)}>
              <ArrowRightLeft size={16} strokeWidth={2} aria-hidden="true" />
              {t.transfer}
            </button>

            <button type="button" className={styles.primaryButton} onClick={openCreate}>
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              {t.addAccount}
            </button>
          </section>
          </div>

          {/* KPI Cards — RED→YELLOW→RED→YELLOW */}
          <section className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconTotalAccounts}`}>
                <UsersRound size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.totalAccounts}</span>
                <strong className={styles.summaryValue} title={exactNumberLabel(totalAccounts)}>{formatCompactNumber(totalAccounts)}</strong>
                <small className={styles.summarySub}>{t.totalAccountsSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconTotalBalance}`}>
                <CircleDollarSign size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.totalBalance}</span>
                <strong className={styles.summaryValue} title={formatCurrency(totalBalance, currency)}>{formatCompactCurrency(totalBalance, currency)}{hasInvalidBalance && <span title="Invalid balance value detected (NaN/Infinity)" style={{ marginInlineStart: 6, color: "var(--danger)", fontSize: 11, fontWeight: 800 }}>⚠ Data integrity</span>}</strong>
                <small className={styles.summarySub}>{t.totalBalanceSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconBank}`}>
                <Building2 size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.bankAccounts}</span>
                <strong className={styles.summaryValue} title={exactNumberLabel(bankCount)}>{formatCompactNumber(bankCount)}</strong>
                <small className={styles.summarySub}>{t.bankAccountsSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconCash}`}>
                <Banknote size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.cashAccounts}</span>
                <strong className={styles.summaryValue} title={exactNumberLabel(cashCount)}>{formatCompactNumber(cashCount)}</strong>
                <small className={styles.summarySub}>{t.cashAccountsSub}</small>
              </div>
            </div>
          </section>

          {error && <div className={styles.errorBanner}>{error}</div>}

          <section className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <span>{t.account}</span>
              <span>{t.type}</span>
              <span>{t.balance}</span>
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
                  <Wallet size={32} strokeWidth={2} aria-hidden="true" />
                </div>
                <strong>{accounts.length === 0 ? t.noAccounts : t.noAccountsFound}</strong>
                <p>{accounts.length === 0 ? t.addFirst : t.tryAnother}</p>
                {accounts.length === 0 && (
                  <button type="button" className={styles.primaryButton} onClick={openCreate}>
                    <Plus size={16} strokeWidth={2} aria-hidden="true" />
                    {t.addAccount}
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.accountRows}>
                {filtered.map((a) => (
                  <article key={a.id} className={styles.accountRow} onDoubleClick={() => openEdit(a)}>
                    <div className={styles.accountIdentity}>
                      <div className={styles.avatar} aria-hidden="true">
                        {a.type === "bank" ? <Building2 size={16} strokeWidth={2} /> : <Banknote size={16} strokeWidth={2} />}
                      </div>
                      <div>
                        <strong>{a.name}</strong>
                        <small>{a.notes || t.noInfo}</small>
                      </div>
                    </div>

                    <span className={styles.typeText}>{typeLabel(a.type)}</span>

                    {Number.isFinite(a.balance) ? (
                      <strong className={a.balance === 0 ? styles.balanceZero : styles.balanceValue}>
                        {formatCurrency(a.balance, currency)}
                      </strong>
                    ) : a.balance === undefined || a.balance === null ? (
                      <span title="No balance" style={{ color: "var(--muted)" }}>—</span>
                    ) : (
                      <span title={`Invalid balance: ${String(a.balance)}`} style={{ color: "var(--danger)", fontWeight: 700 }}>Invalid</span>
                    )}

                    <div className={styles.rowActions}>
                      <button type="button" className={styles.rowEditButton} onClick={() => openEdit(a)}>
                        <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                        {t.edit}
                      </button>
                      <button type="button" className={styles.rowDeleteButton} onClick={() => setDeleteTarget(a)}>
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
            <div className={styles.modalBackdrop}>
              <section className={styles.modal} role="dialog" aria-modal="true">
                <header className={styles.modalHeader}>
                  <h2>{editingId ? t.editAccountTitle : t.addAccountTitle}</h2>
                  <button type="button" className={styles.closeButton} onClick={closeForm} aria-label="Close">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </header>

                <div className={styles.formGrid}>
                  <label>
                    <span>{t.name} *</span>
                    <input
                      ref={nameRef}
                      value={form.name}
                      onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (editingId) {
                            notesRef.current?.focus();
                          } else {
                            typeTriggerRef.current?.focus();
                          }
                        }
                      }}
                      autoFocus
                    />
                  </label>

                  {!editingId ? (
                    <>
                      <label>
                        <span>{t.type} *</span>
                        <AccountTypeDropdown
                          value={form.type}
                          placeholder={t.selectType}
                          onChange={(value) => setForm((c) => ({ ...c, type: value }))}
                          triggerRef={typeTriggerRef}
                          onEnterNavigate={() => initialBalanceRef.current?.focus()}
                          t={t}
                        />
                      </label>

                      <label>
                        <span>
                          {t.initialBalance} <small>{t.optional}</small>
                        </span>
                        <input
                          ref={initialBalanceRef}
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.initialBalance}
                          onChange={(e) => setForm((c) => ({ ...c, initialBalance: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              notesRef.current?.focus();
                            }
                          }}
                        />
                      </label>

                      <label className={styles.fullWidth}>
                        <span>
                          {t.notes} <small>{t.optional}</small>
                        </span>
                        <textarea
                          ref={notesRef}
                          rows={4}
                          value={form.notes}
                          onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))}
                        />
                      </label>
                    </>
                  ) : (
                    <p className={styles.hint} style={{ gridColumn: "1 / -1" }}>
                      {language === "ar"
                        ? "يمكن تعديل اسم الحساب فقط حسب المتطلبات."
                        : language === "fr"
                          ? "Seul le nom du compte peut être modifié."
                          : "Only account name is editable per specification."}
                    </p>
                  )}
                </div>

                {error && <div className={styles.formError}>{error}</div>}

                <footer className={styles.modalFooter}>
                  <button type="button" className={styles.secondaryButton} onClick={closeForm} disabled={saving}>
                    {t.cancel}
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={saveAccount} disabled={saving}>
                    {saving ? t.saving : editingId ? t.save : t.create}
                  </button>
                </footer>
              </section>
            </div>
          )}

          {showTransfer && (
            <div className={styles.modalBackdrop}>
              <section className={styles.modal} role="dialog" aria-modal="true">
                <header className={styles.modalHeader}>
                  <h2>{t.transferTitle}</h2>
                  <button type="button" className={styles.closeButton} onClick={closeTransfer} aria-label="Close">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </header>

                <div className={styles.formGrid}>
                  <label>
                    <span>{t.source} *</span>
                    <TransferAccountDropdown
                      value={transferForm.fromAccountId}
                      placeholder={t.source}
                      accounts={accounts}
                      currency={currency}
                      onChange={(value) => setTransferForm((c) => ({ ...c, fromAccountId: value }))}
                    />
                  </label>

                  <label>
                    <span>{t.destination} *</span>
                    <TransferAccountDropdown
                      value={transferForm.toAccountId}
                      placeholder={t.destination}
                      accounts={accounts}
                      currency={currency}
                      onChange={(value) => setTransferForm((c) => ({ ...c, toAccountId: value }))}
                    />
                  </label>

                  <label>
                    <span>{t.amount} *</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={transferForm.amount}
                      onChange={(e) => setTransferForm((c) => ({ ...c, amount: e.target.value }))}
                    />
                  </label>

                  <label>
                    <span>{t.date}</span>
                    <StyledDatePicker value={transferForm.date} onChange={(v)=>setTransferForm((c)=>({ ...c, date: v }))} language={language} placeholder={t.date} ariaLabel={t.date} />
                  </label>

                  <label className={styles.fullWidth}>
                    <span>
                      {t.notes} <small>{t.optional}</small>
                    </span>
                    <input
                      type="text"
                      value={transferForm.note}
                      onChange={(e) => setTransferForm((c) => ({ ...c, note: e.target.value }))}
                    />
                  </label>
                </div>

                {error && <div className={styles.formError}>{error}</div>}

                <footer className={styles.modalFooter}>
                  <button type="button" className={styles.secondaryButton} onClick={closeTransfer} disabled={transferring}>
                    {t.cancel}
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={doTransfer} disabled={transferring}>
                    {transferring ? t.transferring : t.transferButton}
                  </button>
                </footer>
              </section>
            </div>
          )}

          {deleteTarget && (
            <div className={styles.modalBackdrop}>
              <section className={styles.deleteModal} role="dialog" aria-modal="true">
                <div className={styles.warningIcon} aria-hidden="true">
                  <AlertTriangle size={24} strokeWidth={2} aria-hidden="true" />
                </div>
                <span className={styles.modalEyebrow}>{t.permanentAction}</span>
                <h2>
                  {t.deleteAccount}: {deleteTarget.name}?
                </h2>
                <p>{t.deleteQuestion}</p>
                <div className={styles.deleteWarning}>{t.deleteWarning}</div>
                <div
                  className={countdownStyles.circularCountdown}
                  aria-live="polite"
                >
                  <div
                    className={countdownStyles.circleWrapper}
                    aria-hidden="true"
                  >
                    <svg width="64" height="64" viewBox="0 0 64 64">
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        className={countdownStyles.circleTrack}
                      />
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        className={countdownStyles.circleProgress}
                        style={{
                          strokeDasharray: `${2 * Math.PI * 28}`,
                          strokeDashoffset: `${2 * Math.PI * 28 * (deleteDisplaySec / 3.5)}`,
                        }}
                      />
                    </svg>
                    <span className={countdownStyles.circleText}>
                      {deleteDisplaySec > 0 ? deleteDisplaySec.toFixed(1) : "0.0"}
                    </span>
                  </div>
                  <span className={countdownStyles.circleLabel}>
                    {deleteReady ? t.confirmDelete : "Confirm deletion"}
                  </span>
                </div>
                {error && <div className={styles.formError}>{error}</div>}
                <div className={styles.modalFooter}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setDeleteTarget(null)} disabled={deleting}>
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={confirmDelete}
                    disabled={!deleteReady || deleting}
                  >
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


