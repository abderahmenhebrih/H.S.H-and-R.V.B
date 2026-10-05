"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDbSync } from "../../src/hooks/useDbSync";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Briefcase,
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

import AppShell from "../../src/components/layout/AppShell";
import StyledSelect from "../../src/components/common/StyledSelect";
import StyledDatePicker from "../../src/components/common/StyledDatePicker";
import { workerService } from "../../src/services/worker.service";
import { workerEditOperation } from "../../src/services/operations/worker-edit.operation";
import { workerLifecycleOperation } from "../../src/services/operations/worker-lifecycle.operation";
import { settingsService } from "../../src/services/settings.service";
import { DEFAULT_SETTINGS, formatCurrency, SETTINGS_EVENT } from "../../src/lib/settings";
import type { Worker } from "../../src/types/entities/worker";
import type { Currency, Language } from "../../src/types/settings/settings";
import styles from "./page.module.css";

type FormState = {
  name: string;
  phone: string;
  address: string;
  birthDate: string;
  employmentDate: string;
  position: string;
  notes: string;
  startingSalary: string;
  monthlySalary: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  phone: "",
  address: "",
  birthDate: "",
  employmentDate: new Date().toISOString().slice(0, 10),
  position: "",
  notes: "",
  startingSalary: "",
  monthlySalary: "",
};

const TRANSLATIONS = {
  en: {
    title: "Workers",
    subtitle: "Manage workers, positions, payroll and balances.",
    search: "Search workers...",
    searchPlaceholder: "Search workers by name, phone, position...",
    worker: "Worker",
    workers: "workers",
    workerSingular: "worker",
    phone: "Phone",
    position: "Position",
    salary: "Salary",
    balance: "Balance",
    actions: "Actions",
    allPositions: "All Positions",
    addWorker: "Add Worker",
    edit: "Edit",
    delete: "Delete",
    archive: "Archive",
    restore: "Restore",
    loading: "Loading workers...",
    noWorkers: "No workers yet",
    noWorkersFound: "No workers found",
    addFirst: "Add your first worker to begin.",
    tryAnother: "Try another search term.",
    newWorker: "NEW WORKER",
    editWorker: "EDIT WORKER",
    addWorkerTitle: "Add Worker",
    editWorkerTitle: "Edit Worker",
    name: "Full Name",
    phoneLabel: "Phone",
    address: "Address",
    birthDate: "Birth Date",
    employmentDate: "Employment Date",
    notes: "Notes",
    startingSalary: "Starting Salary",
    monthlySalary: "Monthly Salary",
    required: "Required",
    optional: "Optional",
    saving: "Saving...",
    create: "Create Worker",
    save: "Save Changes",
    cancel: "Cancel",
    deleteWorker: "Delete Worker",
    deleteQuestion: "Are you sure you want to delete this worker?",
    deleteWarning: "Worker records with history cannot be deleted arbitrarily. Protected deletion applies.",
    confirmDelete: "Delete",
    deleting: "Deleting...",
    deleteAvailable: "Confirm available in",
    archiveTitle: "Archive Worker",
    archiveWarning: "Archiving sets balance to 0. Worker will not be able to receive payments while archived. Requires confirmation.",
    restoreTitle: "Restore Worker",
    restoreWarning: "Restoring requires starting salary and monthly salary.",
    failedLoad: "Failed to load workers.",
    failedSave: "Failed to save worker.",
    nameRequired: "Worker name is required.",
    phoneRequired: "Phone is required.",
    positionRequired: "Position is required.",
    selectPosition: "Select position",
    noPositions: "No positions configured in Settings.",
    totalWorkers: "Total Workers",
    totalWorkersSub: "Active workers",
    totalPayroll: "Total Payroll",
    totalPayrollSub: "Combined salaries",
    positions: "Worker Positions",
    positionsSub: "Defined positions",
    outstandingBalance: "Outstanding Balance",
    outstandingBalanceSub: "Total unpaid balance",
  },
  fr: {
    title: "Employés",
    subtitle: "Gérer les employés, postes, salaires et soldes.",
    search: "Rechercher des employés...",
    searchPlaceholder: "Rechercher par nom, téléphone, poste...",
    worker: "Employé",
    workers: "employés",
    workerSingular: "employé",
    phone: "Téléphone",
    position: "Poste",
    salary: "Salaire",
    balance: "Solde",
    actions: "Actions",
    allPositions: "Tous les postes",
    addWorker: "Ajouter un employé",
    edit: "Modifier",
    delete: "Supprimer",
    archive: "Archiver",
    restore: "Restaurer",
    loading: "Chargement des employés...",
    noWorkers: "Aucun employé pour le moment",
    noWorkersFound: "Aucun employé trouvé",
    addFirst: "Ajoutez votre premier employé pour commencer.",
    tryAnother: "Essayez un autre terme de recherche.",
    newWorker: "NOUVEL EMPLOYÉ",
    editWorker: "MODIFIER L'EMPLOYÉ",
    addWorkerTitle: "Ajouter un employé",
    editWorkerTitle: "Modifier l'employé",
    name: "Nom complet",
    phoneLabel: "Téléphone",
    address: "Adresse",
    birthDate: "Date de naissance",
    employmentDate: "Date d'embauche",
    notes: "Notes",
    startingSalary: "Salaire de départ",
    monthlySalary: "Salaire mensuel",
    required: "Obligatoire",
    optional: "Facultatif",
    saving: "Enregistrement...",
    create: "Créer l'employé",
    save: "Enregistrer",
    cancel: "Annuler",
    deleteWorker: "Supprimer l'employé",
    deleteQuestion: "Voulez-vous vraiment supprimer cet employé ?",
    deleteWarning: "Les employés avec historique ne peuvent pas être supprimés arbitrairement.",
    confirmDelete: "Supprimer",
    deleting: "Suppression...",
    deleteAvailable: "Confirmation disponible dans",
    archiveTitle: "Archiver l'employé",
    archiveWarning: "L'archivage met le solde à 0. L'employé ne pourra plus recevoir de paiements.",
    restoreTitle: "Restaurer l'employé",
    restoreWarning: "La restauration nécessite le salaire de départ et le salaire mensuel.",
    failedLoad: "Échec du chargement des employés.",
    failedSave: "Échec de l'enregistrement de l'employé.",
    nameRequired: "Le nom de l'employé est obligatoire.",
    phoneRequired: "Le téléphone est obligatoire.",
    positionRequired: "Le poste est obligatoire.",
    selectPosition: "Sélectionner un poste",
    noPositions: "Aucun poste configuré dans les paramètres.",
    totalWorkers: "Total Employés",
    totalWorkersSub: "Employés actifs",
    totalPayroll: "Masse Salariale",
    totalPayrollSub: "Salaires combinés",
    positions: "Postes",
    positionsSub: "Postes définis",
    outstandingBalance: "Solde Dû",
    outstandingBalanceSub: "Solde impayé total",
  },
  ar: {
    title: "العمال",
    subtitle: "إدارة العمال والمناصب والرواتب والأرصدة.",
    search: "البحث عن العمال...",
    searchPlaceholder: "البحث بالاسم أو الهاتف أو المنصب...",
    worker: "العامل",
    workers: "عمال",
    workerSingular: "عامل",
    phone: "الهاتف",
    position: "المنصب",
    salary: "الراتب",
    balance: "الرصيد",
    actions: "الإجراءات",
    allPositions: "جميع المناصب",
    addWorker: "إضافة عامل",
    edit: "تعديل",
    delete: "حذف",
    archive: "أرشفة",
    restore: "استعادة",
    loading: "جارٍ تحميل العمال...",
    noWorkers: "لا يوجد عمال بعد",
    noWorkersFound: "لم يتم العثور على عمال",
    addFirst: "أضف أول عامل للبدء.",
    tryAnother: "جرّب مصطلح بحث آخر.",
    newWorker: "عامل جديد",
    editWorker: "تعديل العامل",
    addWorkerTitle: "إضافة عامل",
    editWorkerTitle: "تعديل العامل",
    name: "الاسم الكامل",
    phoneLabel: "الهاتف",
    address: "العنوان",
    birthDate: "تاريخ الميلاد",
    employmentDate: "تاريخ التوظيف",
    notes: "ملاحظات",
    startingSalary: "الراتب الابتدائي",
    monthlySalary: "الراتب الشهري",
    required: "مطلوب",
    optional: "اختياري",
    saving: "جارٍ الحفظ...",
    create: "إنشاء العامل",
    save: "حفظ التغييرات",
    cancel: "إلغاء",
    deleteWorker: "حذف العامل",
    deleteQuestion: "هل أنت متأكد من رغبتك في حذف هذا العامل؟",
    deleteWarning: "لا يمكن حذف سجلات العمال المرتبطة بشكل عشوائي. يتم تطبيق الحذف المحمي.",
    confirmDelete: "حذف",
    deleting: "جارٍ الحذف...",
    deleteAvailable: "يمكن التأكيد بعد",
    archiveTitle: "أرشفة العامل",
    archiveWarning: "الأرشفة تجعل الرصيد 0. لن يتمكن العامل من استلام المدفوعات أثناء الأرشفة.",
    restoreTitle: "استعادة العامل",
    restoreWarning: "الاستعادة تتطلب الراتب الابتدائي والراتب الشهري.",
    failedLoad: "فشل تحميل العمال.",
    failedSave: "فشل حفظ العامل.",
    nameRequired: "اسم العامل مطلوب.",
    phoneRequired: "الهاتف مطلوب.",
    positionRequired: "المنصب مطلوب.",
    selectPosition: "اختر المنصب",
    noPositions: "لا توجد مناصب مهيأة في الإعدادات.",
    totalWorkers: "إجمالي العمال",
    totalWorkersSub: "عمال نشطون",
    totalPayroll: "إجمالي الرواتب",
    totalPayrollSub: "الرواتب المجمعة",
    positions: "المناصب",
    positionsSub: "مناصب محددة",
    outstandingBalance: "الرصيد المستحق",
    outstandingBalanceSub: "إجمالي الرصيد غير المدفوع",
  },
} as const;

function PositionFilter({
  value,
  onChange,
  positions,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  positions: string[];
  t: { allPositions: string };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
  }, []);

  const label = value || t.allPositions;

  return (
    <div className={styles.filterDropdown} ref={ref}>
      <button
        type="button"
        className={`${styles.filterTrigger} ${open ? styles.filterTriggerOpen : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{label}</span>
        <span className={`${styles.filterChevron} ${open ? styles.filterChevronOpen : ""}`} aria-hidden="true">
          <ChevronDown size={14} strokeWidth={2} />
        </span>
      </button>
      {open && (
        <div className={styles.filterMenu} role="listbox">
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className={`${styles.filterOption} ${!value ? styles.filterOptionActive : ""}`}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            {t.allPositions}
          </button>
          {positions.map((pos) => (
            <button
              key={pos}
              type="button"
              role="option"
              aria-selected={value === pos}
              className={`${styles.filterOption} ${value === pos ? styles.filterOptionActive : ""}`}
              onClick={() => {
                onChange(pos);
                setOpen(false);
              }}
            >
              {pos}
            </button>
          ))}
          {positions.length === 0 && (
            <span style={{ padding: "8px 12px", color: "var(--muted)", fontSize: "12px" }}>{t.allPositions}</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [positions, setPositions] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Worker | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Worker | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Worker | null>(null);
  const [restoreStarting, setRestoreStarting] = useState("");
  const [restoreMonthly, setRestoreMonthly] = useState("");
  const [deleteCountdown, setDeleteCountdown] = useState(3.5);
  const [archiveCountdown, setArchiveCountdown] = useState(10);
  const [deleting, setDeleting] = useState(false);
  const deleteStartRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<Language>(DEFAULT_SETTINGS.language);
  const [currency, setCurrency] = useState<Currency>(DEFAULT_SETTINGS.currency);

  const t = TRANSLATIONS[language];

  async function loadSettings() {
    const s = await settingsService.get();
    setLanguage(s?.language ?? DEFAULT_SETTINGS.language);
    setCurrency(s?.currency ?? DEFAULT_SETTINGS.currency);
    setPositions(s?.workerPositions ?? []);
  }

  async function loadWorkers() {
    setLoading(true);
    try {
      setWorkers(await workerService.getAll());
    } catch {
      setError(t.failedLoad);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
    void loadWorkers();
    const h = () => void loadSettings();
    window.addEventListener(SETTINGS_EVENT, h);
    return () => window.removeEventListener(SETTINGS_EVENT, h);
  }, []);

  useDbSync(() => {
    void loadWorkers();
  }, []);

  // Delete countdown — new standard 3.5s circular (matches purchases/payments)
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
      const display = Math.ceil(remaining * 10) / 10;
      setDeleteCountdown(display > 0 ? display : 0);
      if (remaining <= 0) window.clearInterval(interval);
    }, 50);
    return () => window.clearInterval(interval);
  }, [deleteTarget]);

  // Archive countdown — keep legacy 10s rectangular
  useEffect(() => {
    if (!archiveTarget) return;
    setArchiveCountdown(10);
    const timer = window.setInterval(() => {
      setArchiveCountdown((c) => {
        if (c <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [archiveTarget]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = workers;
    if (positionFilter) {
      result = result.filter((w) => w.position === positionFilter);
    }
    if (!q) return result;
    return result.filter((w) =>
      [w.name, w.phone, w.position, w.address, String(w.balance)].some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }, [workers, search, positionFilter]);

  // Summary metrics
  const totalWorkers = workers.length;
  const activeWorkers = useMemo(() => workers.filter((w) => w.status === "active").length, [workers]);
  const hasInvalidPayroll = useMemo(() => workers.some((w) => w.monthlySalary !== undefined && w.monthlySalary !== null && !Number.isFinite(w.monthlySalary)), [workers]);
  const hasInvalidBalance = useMemo(() => workers.some((w) => w.balance !== undefined && w.balance !== null && !Number.isFinite(w.balance)), [workers]);
  const totalPayroll = useMemo(() => workers.reduce((sum, w) => sum + (Number.isFinite(w.monthlySalary) ? w.monthlySalary : 0), 0), [workers]);
  const totalOutstanding = useMemo(() => workers.reduce((sum, w) => sum + (Number.isFinite(w.balance) ? w.balance : 0), 0), [workers]);
  const workersWithBalance = useMemo(() => workers.filter((w) => Number.isFinite(w.balance) && w.balance > 0).length, [workers]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, employmentDate: new Date().toISOString().slice(0, 10), position: positions[0] ?? "" });
    setError("");
    setShowForm(true);
  }

  function openEdit(w: Worker) {
    setEditingId(w.id);
    setForm({
      name: w.name,
      phone: w.phone,
      address: w.address ?? "",
      birthDate: w.birthDate ? new Date(w.birthDate).toISOString().slice(0, 10) : "",
      employmentDate: new Date(w.employmentDate).toISOString().slice(0, 10),
      position: w.position,
      notes: w.notes ?? "",
      startingSalary: String(w.startingSalary),
      monthlySalary: String(w.monthlySalary),
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

  async function saveWorker() {
    if (!form.name.trim()) {
      setError(t.nameRequired);
      return;
    }
    if (!form.phone.trim()) {
      setError(t.phoneRequired);
      return;
    }
    if (!form.position.trim()) {
      setError(t.positionRequired);
      return;
    }
    // startingSalary = opening balance: signed finite allowed (negative/zero/positive).
    // Monthly salary policy preserved: zero or positive only.
    const starting = Number(form.startingSalary || 0);
    const monthly = Number(form.monthlySalary || 0);
    if (!Number.isFinite(starting) || !Number.isFinite(monthly) || monthly < 0) {
      setError(t.failedSave);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const employmentDate = form.employmentDate ? new Date(`${form.employmentDate}T12:00:00`).getTime() : Date.now();
      const birthDate = form.birthDate ? new Date(`${form.birthDate}T12:00:00`).getTime() : undefined;
      if (editingId) {
        await workerEditOperation.edit({
          workerId: editingId,
          name: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim() || undefined,
          birthDate,
          employmentDate,
          position: form.position.trim(),
          notes: form.notes.trim() || undefined,
          startingSalary: starting,
          monthlySalary: monthly,
        });
      } else {
        await workerService.create({
          name: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim() || undefined,
          birthDate,
          employmentDate,
          position: form.position.trim(),
          notes: form.notes.trim() || undefined,
          startingSalary: starting,
          monthlySalary: monthly,
        });
      }
      await loadWorkers();
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedSave);
    } finally {
      setSaving(false);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget || archiveCountdown !== 0) return;
    setSaving(true);
    try {
      await workerLifecycleOperation.archive(archiveTarget.id);
      await loadWorkers();
      setArchiveTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedSave);
    } finally {
      setSaving(false);
    }
  }

  async function confirmRestore() {
    if (!restoreTarget) return;
    const s = Number(restoreStarting);
    const m = Number(restoreMonthly);
    // Restore startingSalary follows same opening-balance rule: signed finite allowed.
    if (!Number.isFinite(s) || !Number.isFinite(m) || m < 0) {
      setError(t.failedSave);
      return;
    }
    setSaving(true);
    try {
      await workerLifecycleOperation.restore({ workerId: restoreTarget.id, startingSalary: s, monthlySalary: m });
      await loadWorkers();
      setRestoreTarget(null);
      setRestoreStarting("");
      setRestoreMonthly("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedSave);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (deleting) return;
    if (deleteStartRef.current !== null) {
      const elapsed = Date.now() - deleteStartRef.current;
      if (elapsed < 3500) return;
    } else if (deleteCountdown > 0) return;
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { workerRepository } = await import("../../src/repositories/worker.repository");
      await workerRepository.delete(deleteTarget.id);
      setWorkers((c) => c.filter((w) => w.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteCountdown(3.5);
      deleteStartRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedSave);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell activePage="workers" showHeader={false}>
      <main className={styles.workersPage}>
        <div className={styles.workersShell}>
          {/* Unified Workers header — brand / search / position filter / add */}
          <div className={styles.headerContainer}>
          <section className={styles.workersHeader}>
            <div className={styles.workersHeaderBrand}>
              <div className={styles.workersLogo}>
                <img src="/chicken.jpg" alt="" />
              </div>
              <div className={styles.workersTitle}>
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
                placeholder={t.searchPlaceholder}
                aria-label={t.search}
              />
            </div>

            <PositionFilter value={positionFilter} onChange={setPositionFilter} positions={positions} t={{ allPositions: t.allPositions }} />

            <button type="button" className={styles.primaryButton} onClick={openCreate}>
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              {t.addWorker}
            </button>
          </section>
          </div>

          {/* Summary Cards */}
          <section className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconWorkers}`}>
                <UsersRound size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.totalWorkers}</span>
                <strong className={styles.summaryValue}>{totalWorkers}</strong>
                <small className={styles.summarySub}>{activeWorkers} {t.totalWorkersSub.toLowerCase()}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconPayroll}`}>
                <CircleDollarSign size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.totalPayroll}</span>
                <strong className={styles.summaryValue}>{formatCurrency(totalPayroll, currency)}{hasInvalidPayroll && <span title="Invalid salary value detected (NaN/Infinity)" style={{ marginInlineStart: 6, color: "var(--danger)", fontSize: 11, fontWeight: 800 }}>⚠ Data integrity</span>}</strong>
                <small className={styles.summarySub}>{t.totalPayrollSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconPositions}`}>
                <Briefcase size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.positions}</span>
                <strong className={styles.summaryValue}>{positions.length}</strong>
                <small className={styles.summarySub}>{t.positionsSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconBalance}`}>
                <Wallet size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.outstandingBalance}</span>
                <strong className={styles.summaryValue}>{formatCurrency(totalOutstanding, currency)}{hasInvalidBalance && <span title="Invalid balance value detected (NaN/Infinity)" style={{ marginInlineStart: 6, color: "var(--danger)", fontSize: 11, fontWeight: 800 }}>⚠ Data integrity</span>}</strong>
                <small className={styles.summarySub}>{workersWithBalance} {t.outstandingBalanceSub.toLowerCase()}</small>
              </div>
            </div>
          </section>

          {error && !showForm && !deleteTarget && !archiveTarget && !restoreTarget && (
            <div className={styles.errorBanner}>{error}</div>
          )}

          <section className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <span>{t.worker}</span>
              <span>{t.position}</span>
              <span>{t.phone}</span>
              <span>{t.salary}</span>
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
                  <UsersRound size={32} strokeWidth={2} />
                </div>
                <strong>{workers.length === 0 ? t.noWorkers : t.noWorkersFound}</strong>
                <p>{workers.length === 0 ? t.addFirst : t.tryAnother}</p>
                {workers.length === 0 && (
                  <button type="button" className={styles.primaryButton} onClick={openCreate}>
                    <Plus size={16} strokeWidth={2} aria-hidden="true" />
                    {t.addWorker}
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.workerRows}>
                {filtered.map((w) => (
                  <article key={w.id} className={styles.workerRow} onDoubleClick={() => openEdit(w)}>
                    <span className={styles.workerIdentity}>
                      <span className={styles.avatar} aria-hidden="true">
                        {w.name.charAt(0).toUpperCase()}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <strong>{w.name}</strong>
                        <small>{w.address || w.notes || "—"}</small>
                      </span>
                    </span>
                    <span className={styles.positionText}>{w.position}</span>
                    <span className={styles.phoneText}>{w.phone}</span>
                    {Number.isFinite(w.monthlySalary) ? (
                      <span className={styles.salaryText}>{formatCurrency(w.monthlySalary, currency)}</span>
                    ) : w.monthlySalary === undefined || w.monthlySalary === null ? (
                      <span title="No salary" style={{ color: "var(--muted)" }}>—</span>
                    ) : (
                      <span title={`Invalid salary: ${String(w.monthlySalary)}`} style={{ color: "var(--danger)", fontWeight: 700 }}>Invalid</span>
                    )}
                    {Number.isFinite(w.balance) ? (
                      <strong className={w.balance === 0 ? styles.balanceZero : styles.balanceValue}>
                        {formatCurrency(w.balance, currency)}
                      </strong>
                    ) : w.balance === undefined || w.balance === null ? (
                      <span title="No balance" style={{ color: "var(--muted)" }}>—</span>
                    ) : (
                      <span title={`Invalid balance: ${String(w.balance)}`} style={{ color: "var(--danger)", fontWeight: 700 }}>Invalid</span>
                    )}
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.rowEditButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(w);
                        }}
                        title={t.edit}
                        aria-label={`${t.edit} ${w.name}`}
                      >
                        <Pencil size={16} strokeWidth={2} aria-hidden="true" />
                      </button>
                      {w.status === "active" ? (
                        <button
                          type="button"
                          className={styles.rowArchiveButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            setArchiveTarget(w);
                          }}
                          title={t.archive}
                          aria-label={`${t.archive} ${w.name}`}
                        >
                          <Archive size={16} strokeWidth={2} aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.rowArchiveButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            setRestoreTarget(w);
                          }}
                          title={t.restore}
                          aria-label={`${t.restore} ${w.name}`}
                        >
                          <ArchiveRestore size={16} strokeWidth={2} aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.rowDeleteButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          setError("");
                          setDeleteTarget(w);
                        }}
                        title={t.delete}
                        aria-label={`${t.delete} ${w.name}`}
                      >
                        <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {showForm && (
            <div className={styles.modalBackdrop} onClick={closeForm}>
              <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                  <h2>{editingId ? t.editWorkerTitle : t.addWorkerTitle}</h2>
                  <button type="button" className={styles.closeButton} onClick={closeForm} disabled={saving} aria-label="Close">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
                <div className={styles.formGrid}>
                  <label>
                    <span>{t.name} *</span>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </label>
                  <label>
                    <span>{t.phoneLabel} *</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })}
                    />
                  </label>
                  <label>
                    <span>{t.position} *</span>
                    <StyledSelect
                      value={form.position}
                      onChange={(value) => setForm({ ...form, position: value })}
                      placeholder={t.selectPosition}
                      ariaLabel={t.position}
                      options={positions.map((p) => ({
                        value: p,
                        label: p,
                      }))}
                    />
                    {positions.length === 0 && <small className={styles.fieldHint}>{t.noPositions}</small>}
                  </label>
                  <label>
                    <span>{t.employmentDate} *</span>
                    <StyledDatePicker
                      value={form.employmentDate}
                      onChange={(value) => setForm({ ...form, employmentDate: value })}
                      language={language}
                      placeholder={t.employmentDate}
                      ariaLabel={t.employmentDate}
                    />
                  </label>
                  <label>
                    <span>{t.birthDate}</span>
                    <StyledDatePicker
                      value={form.birthDate}
                      onChange={(value) => setForm({ ...form, birthDate: value })}
                      language={language}
                      placeholder={t.birthDate}
                      ariaLabel={t.birthDate}
                    />
                  </label>
                  <label>
                    <span>{t.address}</span>
                    <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                  </label>
                  <label>
                    <span>{t.startingSalary} *</span>
                    <div className={styles.inputWithSuffix}>
                      <input type="number" step="0.01" value={form.startingSalary} onChange={(e) => setForm({ ...form, startingSalary: e.target.value })} />
                      <span>{currency}</span>
                    </div>
                  </label>
                  <label>
                    <span>{t.monthlySalary} *</span>
                    <div className={styles.inputWithSuffix}>
                      <input type="number" min="0" step="0.01" value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} />
                      <span>{currency}</span>
                    </div>
                  </label>
                  <label className={styles.fullWidth}>
                    <span>{t.notes}</span>
                    <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
                  </label>
                </div>
                {error && <div className={styles.formError}>{error}</div>}
                <footer className={styles.modalFooter}>
                  <button type="button" className={styles.secondaryButton} onClick={closeForm} disabled={saving}>
                    {t.cancel}
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={saveWorker} disabled={saving}>
                    {saving ? t.saving : editingId ? t.save : t.create}
                  </button>
                </footer>
              </section>
            </div>
          )}

          {archiveTarget && (
            <div className={styles.modalBackdrop}>
              <section className={styles.deleteModal} role="dialog" aria-modal="true">
                <div className={styles.warningIcon} aria-hidden="true">
                  <AlertTriangle size={24} strokeWidth={2} aria-hidden="true" />
                </div>
                <h2>{t.archiveTitle}</h2>
                <p>{t.archiveWarning}</p>
                <div className={styles.deleteWarning}>
                  {t.balance}: {formatCurrency(archiveTarget.balance, currency)}
                </div>
                <div className={styles.countdown}>{archiveCountdown > 0 ? `${t.deleteAvailable} ${archiveCountdown}s` : t.confirmDelete}</div>
                <div className={styles.modalFooter}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setArchiveTarget(null)}>
                    {t.cancel}
                  </button>
                  <button type="button" className={styles.dangerButton} disabled={archiveCountdown !== 0 || saving} onClick={confirmArchive}>
                    {t.archive}
                  </button>
                </div>
              </section>
            </div>
          )}

          {restoreTarget && (
            <div className={styles.modalBackdrop} onClick={() => setRestoreTarget(null)}>
              <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                  <h2>{t.restoreTitle}</h2>
                  <button type="button" className={styles.closeButton} onClick={() => setRestoreTarget(null)} aria-label="Close">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
                <div className={styles.formGrid}>
                  <p className={styles.fullWidth}>{t.restoreWarning}</p>
                  <label>
                    <span>{t.startingSalary} *</span>
                    <input type="number" step="0.01" value={restoreStarting} onChange={(e) => setRestoreStarting(e.target.value)} />
                  </label>
                  <label>
                    <span>{t.monthlySalary} *</span>
                    <input type="number" min="0" step="0.01" value={restoreMonthly} onChange={(e) => setRestoreMonthly(e.target.value)} />
                  </label>
                </div>
                {error && <div className={styles.formError}>{error}</div>}
                <footer className={styles.modalFooter}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setRestoreTarget(null)}>
                    {t.cancel}
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={confirmRestore} disabled={saving}>
                    {saving ? t.saving : t.restore}
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
                <h2 id="delete-title">{t.deleteWorker}</h2>
                <p className={styles.deleteDescription}>{t.deleteWarning}</p>
                <p className={styles.deleteContext}>
                  {deleteTarget.name} · {deleteTarget.position} · {deleteTarget.phone}
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


