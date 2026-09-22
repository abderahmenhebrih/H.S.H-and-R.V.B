"use client";

import { useEffect, useMemo, useState } from "react";
import { useDbSync } from "../../src/hooks/useDbSync";
import { AlertTriangle, Receipt, Search, X } from "lucide-react";
import StyledSelect from "../../src/components/common/StyledSelect";
import StyledDatePicker from "../../src/components/common/StyledDatePicker";
import AppShell from "../../src/components/layout/AppShell";
import { useCircularDeleteCountdown } from "../../src/hooks/useCircularDeleteCountdown";
import countdownStyles from "../../src/components/common/ProtectedDeleteModal.module.css";
import { expenseService } from "../../src/services/expense.service";
import { expenseEditOperation } from "../../src/services/operations/expense-edit.operation";
import { expenseReversalOperation } from "../../src/services/operations/expense-reversal.operation";
import { expenseOperation } from "../../src/services/operations/expense.operation";
import { bankAccountService } from "../../src/services/bank-account.service";
import { settingsService } from "../../src/services/settings.service";
import { DEFAULT_SETTINGS, formatCurrency, SETTINGS_EVENT } from "../../src/lib/settings";
import type { Expense } from "../../src/types/entities/expense";
import type { BankAccount } from "../../src/types/entities/bank-account";
import type { Currency, Language } from "../../src/types/settings/settings";
import styles from "./page.module.css";

type FormState = {
  name: string;
  amount: string;
  accountId: string;
  date: string;
  note: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  amount: "",
  accountId: "",
  date: new Date().toISOString().slice(0, 10),
  note: "",
};

const TRANSLATIONS = {
  en: {
    search: "Search expenses...",
    expense: "Expense",
    expenses: "expenses",
    expenseSingular: "expense",
    amount: "Amount",
    account: "Account",
    date: "Date",
    note: "Note",
    actions: "Actions",
    addExpense: "Add Expense",
    repeat: "Repeat",
    edit: "Edit",
    delete: "Delete",
    loading: "Loading expenses...",
    noExpenses: "No expenses yet",
    noExpensesFound: "No expenses found",
    addFirst: "Add your first expense to begin.",
    tryAnother: "Try another search term.",
    newExpense: "NEW EXPENSE",
    editExpense: "EDIT EXPENSE",
    addExpenseTitle: "Add Expense",
    editExpenseTitle: "Edit Expense",
    name: "Expense Name",
    required: "Required",
    optional: "Optional",
    saving: "Saving...",
    create: "Create Expense",
    save: "Save Changes",
    cancel: "Cancel",
    deleteExpense: "Delete Expense",
    deleteQuestion: "Are you sure you want to delete this expense?",
    deleteWarning: "This will restore the amount to the linked account and delete the record permanently.",
    confirmDelete: "Delete Permanently",
    deleting: "Deleting...",
    deleteAvailable: "Confirm available in",
    noAccounts: "No accounts available. Create a bank/cash account first.",
    failedLoad: "Failed to load expenses.",
    failedSave: "Failed to save expense.",
  },
  fr: {
    search: "Rechercher des dépenses...",
    expense: "Dépense",
    expenses: "dépenses",
    expenseSingular: "dépense",
    amount: "Montant",
    account: "Compte",
    date: "Date",
    note: "Note",
    actions: "Actions",
    addExpense: "Ajouter une dépense",
    repeat: "Répéter",
    edit: "Modifier",
    delete: "Supprimer",
    loading: "Chargement des dépenses...",
    noExpenses: "Aucune dépense pour le moment",
    noExpensesFound: "Aucune dépense trouvée",
    addFirst: "Ajoutez votre première dépense pour commencer.",
    tryAnother: "Essayez un autre terme de recherche.",
    newExpense: "NOUVELLE DÉPENSE",
    editExpense: "MODIFIER LA DÉPENSE",
    addExpenseTitle: "Ajouter une dépense",
    editExpenseTitle: "Modifier la dépense",
    name: "Nom de la dépense",
    required: "Obligatoire",
    optional: "Facultatif",
    saving: "Enregistrement...",
    create: "Créer la dépense",
    save: "Enregistrer",
    cancel: "Annuler",
    deleteExpense: "Supprimer la dépense",
    deleteQuestion: "Voulez-vous vraiment supprimer cette dépense ?",
    deleteWarning: "Cela restaurera le montant sur le compte lié et supprimera l'enregistrement définitivement.",
    confirmDelete: "Supprimer définitivement",
    deleting: "Suppression...",
    deleteAvailable: "Confirmation disponible dans",
    noAccounts: "Aucun compte disponible. Créez d'abord un compte bancaire/espèces.",
    failedLoad: "Échec du chargement des dépenses.",
    failedSave: "Échec de l'enregistrement de la dépense.",
  },
  ar: {
    search: "البحث عن المصاريف...",
    expense: "المصروف",
    expenses: "مصاريف",
    expenseSingular: "مصروف",
    amount: "المبلغ",
    account: "الحساب",
    date: "التاريخ",
    note: "ملاحظة",
    actions: "الإجراءات",
    addExpense: "إضافة مصروف",
    repeat: "تكرار",
    edit: "تعديل",
    delete: "حذف",
    loading: "جارٍ تحميل المصاريف...",
    noExpenses: "لا توجد مصاريف بعد",
    noExpensesFound: "لم يتم العثور على مصاريف",
    addFirst: "أضف أول مصروف للبدء.",
    tryAnother: "جرّب مصطلح بحث آخر.",
    newExpense: "مصروف جديد",
    editExpense: "تعديل المصروف",
    addExpenseTitle: "إضافة مصروف",
    editExpenseTitle: "تعديل المصروف",
    name: "اسم المصروف",
    required: "مطلوب",
    optional: "اختياري",
    saving: "جارٍ الحفظ...",
    create: "إنشاء المصروف",
    save: "حفظ التغييرات",
    cancel: "إلغاء",
    deleteExpense: "حذف المصروف",
    deleteQuestion: "هل أنت متأكد من رغبتك في حذف هذا المصروف؟",
    deleteWarning: "سيؤدي هذا إلى إرجاع المبلغ إلى الحساب المرتبط وحذف السجل نهائياً.",
    confirmDelete: "حذف نهائي",
    deleting: "جارٍ الحذف...",
    deleteAvailable: "يمكن التأكيد بعد",
    noAccounts: "لا توجد حسابات متاحة. أنشئ حسابًا بنكيًا/نقديًا أولاً.",
    failedLoad: "فشل تحميل المصاريف.",
    failedSave: "فشل حفظ المصروف.",
  },
} as const;

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<Language>(DEFAULT_SETTINGS.language);
  const [currency, setCurrency] = useState<Currency>(DEFAULT_SETTINGS.currency);

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

  async function loadData() {
    setLoading(true);
    try {
      const [e, a] = await Promise.all([expenseService.getAll(), bankAccountService.getAll()]);
      setExpenses(e);
      setAccounts(a);
    } catch {
      setError(t.failedLoad);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
    void loadData();
    const h = () => void loadSettings();
    window.addEventListener(SETTINGS_EVENT, h);
    return () => window.removeEventListener(SETTINGS_EVENT, h);
  }, []);

  useDbSync(() => {
    void loadData();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return expenses;
    return expenses.filter((e) =>
      [e.name, e.note, String(e.amount), accounts.find((a) => a.id === e.accountId)?.name].some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }, [expenses, search, accounts]);

  function openCreate(prefill?: Partial<FormState>) {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10), ...prefill });
    setError("");
    setShowForm(true);
  }

  function openEdit(e: Expense) {
    setEditingId(e.id);
    setForm({
      name: e.name,
      amount: String(e.amount),
      accountId: e.accountId,
      date: new Date(e.date).toISOString().slice(0, 10),
      note: e.note ?? "",
    });
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

  async function saveExpense() {
    if (!form.name.trim() || !form.amount.trim() || !form.accountId) {
      setError(t.failedSave);
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t.failedSave);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const date = new Date(`${form.date}T12:00:00`).getTime();
      if (editingId) {
        await expenseEditOperation.edit({
          expenseId: editingId,
          name: form.name.trim(),
          amount,
          accountId: form.accountId,
          date,
          note: form.note.trim() || undefined,
        });
      } else {
        await expenseOperation.create({
          name: form.name.trim(),
          amount,
          accountId: form.accountId,
          date,
          note: form.note.trim() || undefined,
        });
      }
      await loadData();
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
      await expenseReversalOperation.delete(deleteTarget.id);
      setExpenses((c) => c.filter((e) => e.id !== deleteTarget.id));
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedSave);
    } finally {
      setDeleting(false);
    }
  }

  function accountName(id: string) {
    return accounts.find((a) => a.id === id)?.name ?? "—";
  }

  return (
    <AppShell activePage="expenses">
      <main className={styles.expensesPage}>
        <section className={styles.toolbar}>
          <div className={styles.searchBox}>
            <span className={styles.searchIcon} aria-hidden="true">
              <Search size={18} strokeWidth={2} aria-hidden="true" />
            </span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.search} aria-label={t.search} />
          </div>
          <div className={styles.countBadge}>
            {filtered.length} {filtered.length === 1 ? t.expenseSingular : t.expenses}
          </div>
        </section>

        <div className={styles.headerActions}>
          <button type="button" className={styles.primaryButton} onClick={() => openCreate()}>
            {t.addExpense}
          </button>
        </div>

        {error && !showForm && !deleteTarget && <div className={styles.errorBanner}>{error}</div>}

        {loading ? (
          <section className={styles.statePanel}>
            <div className={styles.stateIcon} aria-hidden="true">
              <Receipt size={32} strokeWidth={2} aria-hidden="true" />
            </div>
            <h2>{t.loading}</h2>
          </section>
        ) : filtered.length === 0 ? (
          <section className={styles.statePanel}>
            <div className={styles.stateIcon} aria-hidden="true">
              <Receipt size={32} strokeWidth={2} aria-hidden="true" />
            </div>
            <h2>{expenses.length === 0 ? t.noExpenses : t.noExpensesFound}</h2>
            <p>{expenses.length === 0 ? t.addFirst : t.tryAnother}</p>
            {expenses.length === 0 && (
              <button type="button" className={styles.primaryButton} onClick={() => openCreate()}>
                {t.addExpense}
              </button>
            )}
          </section>
        ) : (
          <section className={styles.grid}>
            {filtered.map((e) => (
              <article key={e.id} className={styles.card} onDoubleClick={() => openEdit(e)}>
                <div className={styles.cardTop}>
                  <h3>{e.name}</h3>
                  <div className={styles.cardActions}>
                    <button type="button" className={styles.repeatButton} onClick={() => openCreate({ name: e.name, amount: String(e.amount), accountId: e.accountId, note: e.note ?? "" })} title={t.repeat}>
                      {t.repeat}
                    </button>
                    <button type="button" className={styles.editButton} onClick={() => openEdit(e)} aria-label={t.edit} title={t.edit}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </button>
                    <button type="button" className={styles.deleteIconButton} onClick={() => setDeleteTarget(e)} aria-label={t.delete} title={t.delete}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                    </button>
                  </div>
                </div>
                {e.note && <p className={styles.note}>{e.note}</p>}
                <div className={styles.metaRow}>
                  <span>{t.account}: <strong>{accountName(e.accountId)}</strong></span>
                  <span>{t.date}: <strong>{new Date(e.date).toLocaleDateString(language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB", { numberingSystem: "latn" } as any)}</strong></span>
                </div>
                <div className={styles.amount}>
                  <span>{t.amount}</span>
                  <strong>{formatCurrency(e.amount, currency)}</strong>
                </div>
              </article>
            ))}
          </section>
        )}

        {showForm && (
          <div className={styles.modalBackdrop}>
            <section className={styles.modal} role="dialog" aria-modal="true">
              <div className={styles.modalHeader}>
                <div>
                  <span className={styles.modalBadge}>{editingId ? t.editExpense : t.newExpense}</span>
                  <h2>{editingId ? t.editExpenseTitle : t.addExpenseTitle}</h2>
                </div>
                <button type="button" className={styles.closeButton} onClick={closeForm} disabled={saving}>
                  <X size={18} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
              <div className={styles.form}>
                <label>
                  <span>{t.name} <small>{t.required}</small></span>
                  <input type="text" value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} autoFocus />
                </label>
                <label>
                  <span>{t.amount} <small>{t.required}</small></span>
                  <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((c) => ({ ...c, amount: e.target.value }))} />
                </label>
                <label>
                  <span>{t.account} <small>{t.required}</small></span>
                  <StyledSelect
                    value={form.accountId}
                    onChange={(v)=>setForm((c)=>({ ...c, accountId: v }))}
                    placeholder={t.account}
                    ariaLabel={t.account}
                    options={accounts.map((a)=>({ value: a.id, label: a.name, sublabel: formatCurrency(a.balance, currency)}))}
                  />
                  {accounts.length === 0 && <small className={styles.fieldHint}>{t.noAccounts}</small>}
                </label>
                <label>
                  <span>{t.date} <small>{t.required}</small></span>
                  <StyledDatePicker value={form.date} onChange={(v)=>setForm((c)=>({ ...c, date: v }))} language={language} placeholder={t.date} ariaLabel={t.date} />
                </label>
                <label>
                  <span>{t.note} <small>{t.optional}</small></span>
                  <textarea rows={3} value={form.note} onChange={(e) => setForm((c) => ({ ...c, note: e.target.value }))} />
                </label>
                {error && <div className={styles.formError}>{error}</div>}
                <div className={styles.modalActions}>
                  <button type="button" className={styles.cancelButton} onClick={closeForm} disabled={saving}>{t.cancel}</button>
                  <button type="button" className={styles.primaryButton} onClick={saveExpense} disabled={saving}>{saving ? t.saving : editingId ? t.save : t.create}</button>
                </div>
              </div>
            </section>
          </div>
        )}

        {deleteTarget && (
          <div className={styles.modalBackdrop}>
            <section className={styles.deleteModal} role="dialog" aria-modal="true">
              <div className={styles.deleteIcon} aria-hidden="true">
                <AlertTriangle size={24} strokeWidth={2} aria-hidden="true" />
              </div>
              <span className={styles.modalBadge}>{t.deleteExpense}</span>
              <h2>{t.deleteQuestion}</h2>
              <p><strong>{deleteTarget.name}</strong> — {formatCurrency(deleteTarget.amount, currency)}</p>
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
              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelButton} onClick={() => setDeleteTarget(null)} disabled={deleting}>{t.cancel}</button>
                <button type="button" className={styles.deleteConfirmButton} onClick={confirmDelete} disabled={!deleteReady || deleting}>{deleting ? t.deleting : t.confirmDelete}</button>
              </div>
            </section>
          </div>
        )}
      </main>
    </AppShell>
  );
}


