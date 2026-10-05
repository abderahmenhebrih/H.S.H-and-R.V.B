"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import RvbShell from "../../../src/components/rvb/RvbShell";
import StyledSelect from "../../../src/components/common/StyledSelect";
import StyledDatePicker from "../../../src/components/common/StyledDatePicker";
import { rvbUiPreferencesService, RVB_UI_PREFERENCES_EVENT } from "@/src/services/rvb-ui-preferences.service";
import { DEFAULT_SETTINGS, formatCurrency } from "../../../src/lib/settings";
import type { Settings, Language } from "../../../src/types/settings/settings";
import { rvbWorkerService } from "../../../src/services/rvb-worker.service";
import { rvbAccountService } from "../../../src/services/rvb-account.service";
import { rvbConfigService } from "../../../src/services/rvb-config.service";
import { workerRequestService, type WorkerRequest } from "../../../src/services/worker-request.service";
import { workerFinancialEventService, type WorkerFinancialEvent } from "../../../src/services/worker-financial-event.service";
import { workerActivityService, type WorkerActivity } from "../../../src/services/worker-activity.service";
import type { Worker } from "../../../src/types/entities/worker";
import type { RvbAccount } from "../../../src/types/rvb/rvb-account";
import { normalizeTag, isValidTag } from "../../../src/types/rvb/rvb-account";
import { RVB_ROLES } from "../../../src/types/rvb/roles";
import { useRvbAuth } from "../../../src/contexts/RvbAuthContext";
import RvbAuthGuard from "../../../src/components/rvb/RvbAuthGuard";
import { RvbWorkersGuard } from "../../../src/components/rvb/RvbRoleGuard";
import {
  Search,
  Plus,
  Users,
  Eye,
  X,
  Archive,
  ArchiveRestore,
  Wallet,
  Briefcase,
  ShieldCheck,
  AlertTriangle,
  Link2,
  Unlink,
  KeyRound,
  EyeOff,
} from "lucide-react";
import styles from "./page.module.css";

const TR: Record<Language, any> = {
  en: {
    headerTitle: "Workers",
    headerSubtitle: "Manage worker profiles, employment, finances and portal access.",
    kpi: { total: "Total Workers", active: "Active", linked: "Portal Access", archived: "Archived" },
    searchPlaceholder: "Search workers by name, phone or @tag",
    allStatuses: "All Statuses",
    statuses: { active: "Active", archived: "Archived" },
    allPortal: "All Portal",
    portal: { all: "All", linked: "Linked", notLinked: "Not linked" },
    table: { worker: "Worker", linkedAccount: "Linked Account", credit: "Current Credit", status: "Status", access: "Access", linkNow: "Link now" },
    view: "Access",
    addWorker: "Add Worker",
    loading: "Loading workers...",
    failedLoad: "Failed to load workers",
    noWorkers: "No workers found.",
    noWorkersDesc: "Add your first worker to begin managing employment and portal access.",
    create: {
      title: "Add Worker",
      name: "Full Name",
      phone: "Phone",
      address: "Address",
      birthDate: "Birth Date",
      employmentDate: "Employment Date",
      position: "Position / Job",
      notes: "Notes",
      startingSalary: "Starting Salary",
      monthlySalary: "Monthly Salary",
      cancel: "Cancel",
      create: "Create Worker",
      creating: "Creating...",
      required: "Required",
    },
    edit: { title: "Edit Worker", save: "Save Changes", saving: "Saving..." },
    details: {
      title: "Worker Details",
      overview: "Overview",
      financial: "Financial",
      attendance: "Attendance",
      portal: "Portal Access",
      requests: "Requests",
      activity: "Activity",
      identity: "Identity",
      employment: "Employment",
      finance: "Finance",
      archive: "Archive",
      reactivate: "Reactivate",
      edit: "Edit Worker",
      close: "Close",
      salary: "Salary",
      credit: "Current Credit",
      balance: "Balance",
      hireDate: "Hire Date",
      status: "Status",
      position: "Position",
      phone: "Phone",
      name: "Name",
      notLinked: "Not linked",
      linked: "Linked",
      viewAccount: "View Account",
      unlink: "Unlink",
      linkExisting: "Link Existing Account",
      createAccount: "Create R.V.B Account",
      searchAccounts: "Search by name or @tag",
      selectAccount: "Select account",
      confirmLink: "Link account",
      confirmUnlink: "Unlink account",
      unlinkConfirm: "Unlink @tag from Worker Name?",
      unlinkDesc: "Credentials remain but worker will be disconnected from portal. This does not delete the account.",
      linkConfirm: "Link @tag to Worker Name?",
      noAccounts: "No eligible unlinked accounts (worker/supervisor, active).",
      payments: "Payments",
      bonuses: "Bonuses / Absences",
      loans: "Loans",
      noPayments: "No payments recorded.",
      noBonuses: "No bonuses/absences recorded.",
      noLoans: "No loans recorded.",
      absences: "Absences",
      noAbsences: "No absences recorded.",
      attendanceHint: "Absences adjust worker credit via existing balance logic.",
      requestsEmpty: "No requests yet.",
      activityEmpty: "No activity yet.",
      archivedNote: "Worker archived — portal access suspended.",
    },
    validation: { nameRequired: "Name required", phoneRequired: "Phone required", positionRequired: "Position required", salaryInvalid: "Salary must be >=0" },
    archiveConfirm: { title: "Archive Worker", desc: "Worker will be archived and balance must be 0.", warning: "Archived workers lose portal access until reactivated." },
    roles: { worker: "Worker", supervisor: "Supervisor" },
  },
  fr: {
    headerTitle: "Travailleurs",
    headerSubtitle: "Gérez les profils, emploi, finances et accès portail.",
    kpi: { total: "Total Travailleurs", active: "Actifs", linked: "Accès Portail", archived: "Archivés" },
    searchPlaceholder: "Rechercher par nom, téléphone ou @tag",
    allStatuses: "Tous les statuts",
    statuses: { active: "Actif", archived: "Archivé" },
    allPortal: "Tous",
    portal: { all: "Tous", linked: "Lié", notLinked: "Non lié" },
    table: { worker: "Travailleur", linkedAccount: "Compte lié", credit: "Crédit actuel", status: "Statut", access: "Accéder", linkNow: "Lier maintenant" },
    view: "Accéder",
    addWorker: "Ajouter Travailleur",
    loading: "Chargement...",
    failedLoad: "Échec chargement",
    noWorkers: "Aucun travailleur trouvé.",
    noWorkersDesc: "Ajoutez votre premier travailleur.",
    create: { title: "Ajouter Travailleur", name: "Nom complet", phone: "Téléphone", address: "Adresse", birthDate: "Date naissance", employmentDate: "Date embauche", position: "Poste", notes: "Notes", startingSalary: "Salaire début", monthlySalary: "Salaire mensuel", cancel: "Annuler", create: "Créer", creating: "Création...", required: "Requis" },
    edit: { title: "Modifier Travailleur", save: "Enregistrer", saving: "Enregistrement..." },
    details: { title: "Détails Travailleur", overview: "Aperçu", financial: "Financier", attendance: "Présence", portal: "Accès Portail", requests: "Demandes", activity: "Activité", identity: "Identité", employment: "Emploi", finance: "Finance", archive: "Archiver", reactivate: "Réactiver", edit: "Modifier", close: "Fermer", salary: "Salaire", credit: "Crédit", balance: "Solde", hireDate: "Date embauche", status: "Statut", position: "Poste", phone: "Téléphone", name: "Nom", notLinked: "Non lié", linked: "Lié", viewAccount: "Voir Compte", unlink: "Dissocier", linkExisting: "Lier Compte Existant", createAccount: "Créer Compte R.V.B", searchAccounts: "Rechercher par nom ou @tag", selectAccount: "Sélectionner", confirmLink: "Lier", confirmUnlink: "Dissocier", unlinkConfirm: "Dissocier @tag de Worker Name?", unlinkDesc: "Le compte reste mais sera déconnecté.", linkConfirm: "Lier @tag à Worker Name?", noAccounts: "Aucun compte éligible.", payments: "Paiements", bonuses: "Bonus/Absences", loans: "Prêts", noPayments: "Aucun paiement.", noBonuses: "Aucun bonus/absence.", noLoans: "Aucun prêt.", absences: "Absences", noAbsences: "Aucune absence.", attendanceHint: "Les absences ajustent le crédit.", requestsEmpty: "Aucune demande.", activityEmpty: "Aucune activité.", archivedNote: "Travailleur archivé — accès suspendu." },
    validation: { nameRequired: "Nom requis", phoneRequired: "Téléphone requis", positionRequired: "Poste requis", salaryInvalid: "Salaire >=0" },
    archiveConfirm: { title: "Archiver Travailleur", desc: "Le travailleur sera archivé.", warning: "Accès portail suspendu jusqu'à réactivation." },
    roles: { worker: "Travailleur", supervisor: "Superviseur" },
  },
  ar: {
    headerTitle: "العمال",
    headerSubtitle: "إدارة ملفات العمال والتوظيف والمالية والوصول للبوابة.",
    kpi: { total: "إجمالي العمال", active: "النشطون", linked: "الوصول للبوابة", archived: "المؤرشفون" },
    searchPlaceholder: "ابحث بالاسم أو الهاتف أو @tag",
    allStatuses: "جميع الحالات",
    statuses: { active: "نشط", archived: "مؤرشف" },
    allPortal: "الكل",
    portal: { all: "الكل", linked: "مرتبط", notLinked: "غير مرتبط" },
    table: { worker: "العامل", linkedAccount: "الحساب المرتبط", credit: "الرصيد الحالي", status: "الحالة", access: "دخول", linkNow: "ربط الآن" },
    view: "دخول",
    addWorker: "إضافة عامل",
    loading: "جارٍ التحميل...",
    failedLoad: "فشل التحميل",
    noWorkers: "لا يوجد عمال.",
    noWorkersDesc: "أضف أول عامل للبدء.",
    create: { title: "إضافة عامل", name: "الاسم الكامل", phone: "الهاتف", address: "العنوان", birthDate: "تاريخ الميلاد", employmentDate: "تاريخ التوظيف", position: "المنصب", notes: "ملاحظات", startingSalary: "الراتب الابتدائي", monthlySalary: "الراتب الشهري", cancel: "إلغاء", create: "إنشاء", creating: "جارٍ الإنشاء...", required: "مطلوب" },
    edit: { title: "تعديل عامل", save: "حفظ", saving: "جارٍ الحفظ..." },
    details: { title: "تفاصيل العامل", overview: "نظرة عامة", financial: "المالية", attendance: "الحضور", portal: "الوصول", requests: "الطلبات", activity: "النشاط", identity: "الهوية", employment: "التوظيف", finance: "المالية", archive: "أرشفة", reactivate: "إعادة تفعيل", edit: "تعديل", close: "إغلاق", salary: "الراتب", credit: "الرصيد", balance: "الرصيد", hireDate: "تاريخ التوظيف", status: "الحالة", position: "المنصب", phone: "الهاتف", name: "الاسم", notLinked: "غير مرتبط", linked: "مرتبط", viewAccount: "عرض الحساب", unlink: "إلغاء الربط", linkExisting: "ربط حساب موجود", createAccount: "إنشاء حساب R.V.B", searchAccounts: "ابحث بالاسم أو @tag", selectAccount: "اختر حساب", confirmLink: "ربط", confirmUnlink: "إلغاء الربط", unlinkConfirm: "إلغاء ربط @tag من Worker Name؟", unlinkDesc: "يبقى الحساب لكن سيتم فصله.", linkConfirm: "ربط @tag بـ Worker Name؟", noAccounts: "لا يوجد حسابات مؤهلة.", payments: "المدفوعات", bonuses: "المكافآت/الغيابات", loans: "القروض", noPayments: "لا توجد مدفوعات.", noBonuses: "لا توجد مكافآت.", noLoans: "لا توجد قروض.", absences: "الغيابات", noAbsences: "لا توجد غيابات.", attendanceHint: "الغيابات تؤثر على الرصيد.", requestsEmpty: "لا توجد طلبات بعد.", activityEmpty: "لا يوجد نشاط بعد.", archivedNote: "العامل مؤرشف — الوصول معلق." },
    validation: { nameRequired: "الاسم مطلوب", phoneRequired: "الهاتف مطلوب", positionRequired: "المنصب مطلوب", salaryInvalid: "الراتب >=0" },
    archiveConfirm: { title: "أرشفة عامل", desc: "سيتم أرشفة العامل.", warning: "سيتم تعليق الوصول حتى إعادة التفعيل." },
    roles: { worker: "عامل", supervisor: "مشرف" },
  },
} as const;

function formatDate(ts: number | null | undefined, lang: string) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    const locale = lang === "ar" ? "ar-DZ-u-nu-latn" : lang === "fr" ? "fr-FR" : "en-GB";
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", numberingSystem: "latn" } as any).format(d);
  } catch { return new Date(ts!).toLocaleDateString(); }
}
function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function RvbWorkersInner() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [accounts, setAccounts] = useState<RvbAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [portalFilter, setPortalFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Worker | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", birthDate: "", employmentDate: new Date().toISOString().slice(0, 10), position: "", notes: "", startingSalary: "", monthlySalary: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [positions, setPositions] = useState<string[]>([]);
  const [details, setDetails] = useState<Worker | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "financial" | "attendance" | "portal" | "requests" | "activity">("overview");
  const [payments, setPayments] = useState<any[]>([]);
  const [requests, setRequests] = useState<WorkerRequest[]>([]);
  const [linkModal, setLinkModal] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [selectedLink, setSelectedLink] = useState<RvbAccount | null>(null);
  const [linking, setLinking] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState<RvbAccount | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState<Worker | null>(null);
  const [showReactivate, setShowReactivate] = useState<Worker | null>(null);
  const [reactivateForm, setReactivateForm] = useState({ startingSalary: "", monthlySalary: "" });
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [createTag, setCreateTag] = useState("");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createRole, setCreateRole] = useState("worker");
  const [createPassword, setCreatePassword] = useState("");
  const [createConfirm, setCreateConfirm] = useState("");
  const [createError, setCreateError] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [financialEvents, setFinancialEvents] = useState<WorkerFinancialEvent[]>([]);
  const [activities, setActivities] = useState<WorkerActivity[]>([]);
  const [activityMap, setActivityMap] = useState<Map<string, number>>(new Map());
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusNote, setBonusNote] = useState("");
  const [absenceAmount, setAbsenceAmount] = useState("");
  const [absenceNote, setAbsenceNote] = useState("");
  const [bonusLoading, setBonusLoading] = useState(false);
  const lang = (settings.language as Language) || "en";
  const t = (TR as any)[lang] ?? TR.en;
  const isRtl = lang === "ar";
  const { user } = useRvbAuth();
  const isManager = user?.role === "manager" || user?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [w, acc] = await Promise.all([
        rvbWorkerService.list().catch(() => [] as any[]),
        rvbAccountService.getAll().catch(() => [] as RvbAccount[]),
      ]);
      setWorkers(Array.isArray(w) ? w : []);
      setAccounts(Array.isArray(acc) ? acc : []);
    } catch (e: any) {
      setError(t.failedLoad);
    } finally { setLoading(false); }
  }, [t.failedLoad]);

  useEffect(() => {
    rvbUiPreferencesService.get().then((s) => { if (s) { setSettings(s); setPositions(s.workerPositions || []); } });
    rvbConfigService.get().then((c) => {
      if (c?.currency) setSettings((prev: any) => ({ ...prev, currency: c.currency }));
      if ((c as any)?.workerPositions) setPositions((c as any).workerPositions);
    }).catch(()=>{});
    const h = (e: Event) => {
      const ce = e as CustomEvent<Settings>;
      if (ce?.detail) { setSettings(ce.detail); setPositions(ce.detail.workerPositions || []); }
      else rvbUiPreferencesService.get().then((s) => { if (s) { setSettings(s); setPositions(s?.workerPositions || []); } });
    };
    window.addEventListener(RVB_UI_PREFERENCES_EVENT, h);
    return () => window.removeEventListener(RVB_UI_PREFERENCES_EVENT, h);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // map worker -> linked account
  const workerAccountMap = useMemo(() => {
    const m = new Map<string, RvbAccount>();
    for (const acc of accounts) {
      if (acc.linkedEntityType === "worker" && acc.linkedEntityId) m.set(acc.linkedEntityId, acc);
    }
    return m;
  }, [accounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workers.filter((w) => {
      if (statusFilter && w.status !== statusFilter) return false;
      const acc = workerAccountMap.get(w.id);
      if (portalFilter === "linked" && !acc) return false;
      if (portalFilter === "notLinked" && acc) return false;
      if (!q) return true;
      const tag = acc ? acc.tag.toLowerCase() : "";
      const hay = `${w.name} ${w.phone} ${w.position} ${tag}`.toLowerCase();
      if (hay.includes(q)) return true;
      const nq = q.startsWith("@") ? q.slice(1) : q;
      if (nq && tag.includes(nq)) return true;
      return false;
    });
  }, [workers, search, statusFilter, portalFilter, workerAccountMap]);

  const kpi = useMemo(() => {
    const total = workers.length;
    const active = workers.filter((w) => w.status === "active").length;
    const linked = workers.filter((w) => workerAccountMap.has(w.id)).length;
    const archived = workers.filter((w) => w.status === "archived").length;
    return { total, active, linked, archived };
  }, [workers, workerAccountMap]);

  const eligibleAccounts = useMemo(() => {
    const linkedIds = new Set(accounts.filter((a) => a.linkedEntityType && a.linkedEntityId).map((a) => `${a.linkedEntityType}:${a.linkedEntityId}`));
    return accounts.filter((a) => {
      if (a.status !== "active") return false;
      if (a.linkedEntityType || a.linkedEntityId) return false;
      if (a.role !== "worker" && a.role !== "supervisor") return false;
      return true;
    }).filter((a) => {
      const q = linkSearch.trim().toLowerCase();
      if (!q) return true;
      const nq = q.startsWith("@") ? q.slice(1) : q;
      return a.displayName.toLowerCase().includes(q) || a.tag.toLowerCase().includes(nq);
    });
  }, [accounts, linkSearch]);

  const loadPayments = useCallback(async (workerId: string) => {
    // Payments for workers are represented via financial events; keep empty array to avoid Dexie usage
    // If needed, could derive from financial events filtered by type "payment"
    setPayments([]);
  }, []);
  const loadRequests = useCallback(async (workerId: string) => {
    try {
      const r = await workerRequestService.list(workerId).catch(()=>[] as any);
      setRequests(r as any);
    } catch { setRequests([]); }
  }, []);
  const loadFinancialEvents = useCallback(async (workerId: string) => {
    try {
      const ev = await rvbWorkerService.getFinancialEvents(workerId).catch(()=>[] as any);
      // fallback to legacy service if rvbWorkerService returns empty and legacy has data
      if (!ev || ev.length===0) {
        const legacy = await workerFinancialEventService.list(workerId).catch(()=>[] as any);
        setFinancialEvents((legacy as any) || []);
      } else setFinancialEvents(ev as any);
    } catch {
      try {
        const legacy = await workerFinancialEventService.list(workerId).catch(()=>[] as any);
        setFinancialEvents(legacy as any);
      } catch { setFinancialEvents([]); }
    }
  }, []);
  const loadActivities = useCallback(async (workerId: string) => {
    try {
      const a = await rvbWorkerService.getActivities(workerId).catch(()=>[] as any);
      if (!a || a.length===0) {
        const legacy = await workerActivityService.list(workerId).catch(()=>[] as any);
        setActivities(legacy as any);
      } else setActivities(a as any);
    } catch {
      try {
        const legacy = await workerActivityService.list(workerId).catch(()=>[] as any);
        setActivities(legacy as any);
      } catch { setActivities([]); }
    }
  }, []);
  const refreshWorkerRelated = useCallback(async (workerId: string) => {
    await Promise.all([loadPayments(workerId), loadRequests(workerId), loadFinancialEvents(workerId), loadActivities(workerId)]);
  }, [loadPayments, loadRequests, loadFinancialEvents, loadActivities]);

  useEffect(() => {
    if (details) {
      void refreshWorkerRelated(details.id);
    }
  }, [details, refreshWorkerRelated]);

  // Build lastActivity map from real audit: newest activity per worker, fallback updatedAt
  useEffect(() => {
    if (workers.length === 0) { setActivityMap(new Map()); return; }
    let cancelled = false;
    (async () => {
      try {
        const allActs = await workerActivityService.list().catch(()=>[] as any);
        if (cancelled) return;
        const map = new Map<string, number>();
        for (const a of allActs as any[]) {
          const prev = map.get(a.workerId);
          if (!prev || a.createdAt > prev) map.set(a.workerId, a.createdAt);
        }
        setActivityMap(map);
      } catch { if (!cancelled) setActivityMap(new Map()); }
    })();
    return () => { cancelled = true; };
  }, [workers, accounts]);

  // Scroll lock for modals
  const anyModalOpen = showAdd || !!details || linkModal || !!showUnlinkConfirm || !!showArchiveConfirm || !!showReactivate || showCreateAccount;
  useEffect(() => {
    if (!anyModalOpen) return;
    const body = document.body;
    const html = document.documentElement;
    const prevBody = body.style.overflow;
    const prevHtml = html.style.overflow;
    const prevPad = body.style.paddingRight;
    const sw = window.innerWidth - html.clientWidth;
    if (sw > 0) body.style.paddingRight = `${sw}px`;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    return () => { body.style.overflow = prevBody; html.style.overflow = prevHtml; body.style.paddingRight = prevPad; };
  }, [anyModalOpen]);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", phone: "", address: "", birthDate: "", employmentDate: new Date().toISOString().slice(0, 10), position: positions[0] || "", notes: "", startingSalary: "", monthlySalary: "" });
    setFormError("");
    setShowAdd(true);
  };
  const openEdit = (w: Worker) => {
    setEditing(w);
    setForm({
      name: w.name,
      phone: w.phone,
      address: w.address || "",
      birthDate: w.birthDate ? new Date(w.birthDate).toISOString().slice(0, 10) : "",
      employmentDate: new Date(w.employmentDate).toISOString().slice(0, 10),
      position: w.position,
      notes: w.notes || "",
      startingSalary: String(w.startingSalary),
      monthlySalary: String(w.monthlySalary),
    });
    setFormError("");
    setShowAdd(true);
  };

  const handleSave = async () => {
    setFormError("");
    if (!form.name.trim()) { setFormError(t.validation.nameRequired); return; }
    if (!form.phone.trim()) { setFormError(t.validation.phoneRequired); return; }
    if (!form.position.trim()) { setFormError(t.validation.positionRequired); return; }
    // startingSalary = opening balance: signed finite allowed (negative/zero/positive).
    // Monthly salary policy preserved: zero or positive only.
    const starting = Number(form.startingSalary || 0);
    const monthly = Number(form.monthlySalary || 0);
    if (!Number.isFinite(starting) || !Number.isFinite(monthly) || monthly < 0) { setFormError(t.validation.salaryInvalid); return; }
    setSaving(true);
    try {
      const employmentDate = form.employmentDate ? new Date(`${form.employmentDate}T12:00:00`).getTime() : Date.now();
      const birthDate = form.birthDate ? new Date(`${form.birthDate}T12:00:00`).getTime() : undefined;
      if (editing) {
        await rvbWorkerService.update(editing.id, { name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() || undefined, birthDate, employmentDate, position: form.position.trim(), notes: form.notes.trim() || undefined, startingSalary: starting, monthlySalary: monthly });
      } else {
        await rvbWorkerService.create({ name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() || undefined, birthDate, employmentDate, position: form.position.trim(), notes: form.notes.trim() || undefined, startingSalary: starting, monthlySalary: monthly });
      }
      await load();
      setShowAdd(false);
      setEditing(null);
    } catch (e: any) { setFormError(e?.message || t.failedLoad); }
    finally { setSaving(false); }
  };

  const handleLink = async () => {
    if (!details || !selectedLink) return;
    setLinking(true);
    try {
      await rvbAccountService.linkToWorker(selectedLink.id, details.id);
      await load();
      setLinkModal(false);
      setSelectedLink(null);
      // refresh details payments/requests not needed but update account map
    } catch (e: any) {
      const code = e?.code || e?.data?.code;
      alert(code || e?.message || "Link failed");
    } finally { setLinking(false); }
  };
  const handleUnlink = async () => {
    if (!showUnlinkConfirm) return;
    setLinking(true);
    try {
      await rvbAccountService.unlink(showUnlinkConfirm.id);
      await load();
      setShowUnlinkConfirm(null);
    } catch (e: any) { alert(e?.message || "Unlink failed"); }
    finally { setLinking(false); }
  };
  const handleCreateAccount = async () => {
    setCreateError("");
    const tag = normalizeTag(createTag);
    if (!tag || !isValidTag(tag)) { setCreateError("Tag invalid"); return; }
    if (!createDisplayName.trim()) { setCreateError("Display name required"); return; }
    if (!createPassword || createPassword.length < 8) { setCreateError("Password >=8"); return; }
    if (createPassword !== createConfirm) { setCreateError("Mismatch"); return; }
    if (!details) return;
    const role = createRole === "supervisor" ? "supervisor" : "worker";
    setCreatingAccount(true);
    try {
      const acc = await rvbAccountService.create({ tag, displayName: createDisplayName.trim(), role, linkedEntityType: "worker", linkedEntityId: details.id, password: createPassword, confirmPassword: createConfirm } as any);
      await load();
      setShowCreateAccount(false);
      setCreateTag(""); setCreateDisplayName(""); setCreatePassword(""); setCreateConfirm("");
      // auto link already done via creation
    } catch (e: any) { setCreateError(e?.data?.code || e?.message || "Create failed"); }
    finally { setCreatingAccount(false); }
  };

  const handleArchive = async () => {
    if (!showArchiveConfirm) return;
    try {
      await rvbWorkerService.archive(showArchiveConfirm.id);
      // Suspend portal access: only archive if currently active to preserve intentionally disabled state
      const acc = workerAccountMap.get(showArchiveConfirm.id);
      if (acc && acc.status === "active") { try { await rvbAccountService.archive(acc.id); } catch {} }
      await load();
      setShowArchiveConfirm(null);
      setDetails(null);
    } catch (e: any) { alert(e?.message || "Archive failed"); }
  };
  const handleReactivate = async () => {
    if (!showReactivate) return;
    const s = Number(reactivateForm.startingSalary);
    const m = Number(reactivateForm.monthlySalary);
    if (!Number.isFinite(s) || !Number.isFinite(m)) { alert(t.validation.salaryInvalid); return; }
    try {
      await rvbWorkerService.reactivate(showReactivate.id);
      // backend reactivate handles salaries via separate patch if needed; apply salary update if provided
      if (s !== undefined && m !== undefined) {
        try { await rvbWorkerService.update(showReactivate.id, { startingSalary: s, monthlySalary: m }); } catch {}
      }
      const acc = workerAccountMap.get(showReactivate.id);
      // Preserve intentionally disabled account: only reactivate if it was archived (not disabled)
      if (acc && acc.status === "archived") { try { await rvbAccountService.reactivate(acc.id); } catch {} }
      await load();
      setShowReactivate(null);
      setDetails(null);
    } catch (e: any) { alert(e?.message || "Reactivate failed"); }
  };

  const handleBonus = async () => {
    if (!details) return;
    const amt = Number(bonusAmount);
    if (!Number.isFinite(amt) || amt <= 0) { alert(t.validation.salaryInvalid); return; }
    setBonusLoading(true);
    try {
      const res: any = await rvbWorkerService.bonusAbsence(details.id, { type: "bonus", amount: amt, note: bonusNote.trim() || undefined });
      const newBalance = res?.worker?.balance ?? res?.balance;
      if (newBalance !== undefined) {
        setWorkers((prev) => prev.map((w) => (w.id === details.id ? { ...w, balance: newBalance, updatedAt: Date.now() } : w)));
        setDetails((prev) => (prev ? { ...prev, balance: newBalance, updatedAt: Date.now() } : null));
      } else {
        await load();
      }
      await refreshWorkerRelated(details.id);
      setBonusAmount(""); setBonusNote("");
    } catch (e: any) {
      // fallback to legacy service
      try {
        const res2: any = await workerFinancialEventService.create({ workerId: details.id, type: "bonus", amount: amt, note: bonusNote.trim() || undefined });
        const nb = res2?.worker?.balance;
        if (nb !== undefined) {
          setWorkers((prev) => prev.map((w) => (w.id === details.id ? { ...w, balance: nb, updatedAt: Date.now() } : w)));
          setDetails((prev) => (prev ? { ...prev, balance: nb, updatedAt: Date.now() } : null));
        } else await load();
        await refreshWorkerRelated(details.id);
        setBonusAmount(""); setBonusNote("");
      } catch (er: any) { alert(er?.data?.code || er?.message || e?.data?.code || e?.message || "Bonus failed"); }
    }
    finally { setBonusLoading(false); }
  };
  const handleAbsence = async () => {
    if (!details) return;
    const amt = Number(absenceAmount);
    if (!Number.isFinite(amt) || amt <= 0) { alert(t.validation.salaryInvalid); return; }
    setBonusLoading(true);
    try {
      const res: any = await rvbWorkerService.bonusAbsence(details.id, { type: "absence", amount: amt, note: absenceNote.trim() || undefined });
      const newBalance = res?.worker?.balance ?? res?.balance;
      if (newBalance !== undefined) {
        setWorkers((prev) => prev.map((w) => (w.id === details.id ? { ...w, balance: newBalance, updatedAt: Date.now() } : w)));
        setDetails((prev) => (prev ? { ...prev, balance: newBalance, updatedAt: Date.now() } : null));
      } else {
        await load();
      }
      await refreshWorkerRelated(details.id);
      setAbsenceAmount(""); setAbsenceNote("");
    } catch (e: any) {
      try {
        const res2: any = await workerFinancialEventService.create({ workerId: details.id, type: "absence", amount: amt, note: absenceNote.trim() || undefined });
        const nb = res2?.worker?.balance;
        if (nb !== undefined) {
          setWorkers((prev) => prev.map((w) => (w.id === details.id ? { ...w, balance: nb, updatedAt: Date.now() } : w)));
          setDetails((prev) => (prev ? { ...prev, balance: nb, updatedAt: Date.now() } : null));
        } else await load();
        await refreshWorkerRelated(details.id);
        setAbsenceAmount(""); setAbsenceNote("");
      } catch (er: any) { alert(er?.data?.code || er?.message || e?.data?.code || e?.message || "Absence failed"); }
    }
    finally { setBonusLoading(false); }
  };
  const handleReviewRequest = async (reqId: string, status: "accepted" | "rejected") => {
    try {
      if (status === "accepted" && !confirm(status === "accepted" ? "Accept request? This will perform financial mutation once." : "Reject request?")) return;
      await workerRequestService.review(reqId, status);
      if (details) await refreshWorkerRelated(details.id);
      await load(); // refresh KPI etc.
    } catch (e: any) { alert(e?.data?.code || e?.message || "Review failed"); }
  };

  return (
    <RvbShell activePage="workers">
      <div className={styles.rvbAccountsRoot} dir={isRtl ? "rtl" : "ltr"}>
        <div className={styles.headerWrap}>
          <h1 className={styles.headerTitle}>{t.headerTitle}</h1>
          <p className={styles.headerSubtitle}>{t.headerSubtitle}</p>
        </div>

        <div className={styles.kpiRow}>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "var(--accent-soft)", border: "1px solid var(--accent-ring)", color: "var(--accent)", flex: "0 0 44px" }}><Users size={20} strokeWidth={2} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.kpi.total}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{loading ? "—" : String(kpi.total)}</strong></div>
          </div>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(58,125,82,0.10)", border: "1px solid rgba(58,125,82,0.18)", color: "#3A7D52", flex: "0 0 44px" }}><Users size={20} strokeWidth={2} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.kpi.active}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{loading ? "—" : String(kpi.active)}</strong></div>
          </div>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(175,149,75,0.11)", border: "1px solid rgba(175,149,75,0.16)", color: "#8a6d1b", flex: "0 0 44px" }}><ShieldCheck size={20} strokeWidth={2} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.kpi.linked}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{loading ? "—" : String(kpi.linked)}</strong></div>
          </div>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(120,120,130,0.10)", border: "1px solid rgba(120,120,130,0.18)", color: "var(--muted)", flex: "0 0 44px" }}><Archive size={20} strokeWidth={2} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.kpi.archived}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{loading ? "—" : String(kpi.archived)}</strong></div>
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <span aria-hidden="true"><Search size={18} /></span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchPlaceholder} aria-label={t.searchPlaceholder} />
          </div>
          <div className={styles.filterGroup}>
            <div style={{ minWidth: 160 }}>
              <StyledSelect value={statusFilter} onChange={setStatusFilter} options={[{ value: "", label: t.allStatuses }, { value: "active", label: t.statuses.active }, { value: "archived", label: t.statuses.archived }]} placeholder={t.allStatuses} ariaLabel={t.allStatuses} />
            </div>
            <div style={{ minWidth: 160 }}>
              <StyledSelect value={portalFilter} onChange={setPortalFilter} options={[{ value: "", label: t.allPortal }, { value: "linked", label: t.portal.linked }, { value: "notLinked", label: t.portal.notLinked }]} placeholder={t.allPortal} ariaLabel={t.allPortal} />
            </div>
          </div>
          {isManager && <button type="button" className={styles.primaryButton} onClick={openAdd}><Plus size={16} />{t.addWorker}</button>}
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        <div className={styles.card}>
          {loading ? (
            <div className={styles.loadingBox}><div className={styles.loadingPulse} /><strong style={{ fontSize: 13, color: "var(--muted)" }}>{t.loading}</strong></div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon} aria-hidden="true"><Users size={26} /></div>
              <h3 className={styles.emptyTitle}>{t.noWorkers}</h3>
              <p className={styles.emptyDesc}>{t.noWorkersDesc}</p>
              {isManager && <button type="button" className={styles.primaryButton} onClick={openAdd}><Plus size={16} />{t.addWorker}</button>}
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table} role="table" aria-label={t.headerTitle}>
                <thead className={styles.tableHead}>
                  <tr>
                    <th style={{ width: "32%" }}>{t.table.worker}</th>
                    <th style={{ width: "24%" }}>{t.table.linkedAccount}</th>
                    <th style={{ width: "18%" }}>{t.table.credit}</th>
                    <th style={{ width: "13%" }}>{t.table.status}</th>
                    <th style={{ width: "13%", textAlign: "center" }}>{t.table.access}</th>
                  </tr>
                </thead>
                <tbody className={styles.tableBody}>
                  {filtered.map((w) => {
                    const acc = workerAccountMap.get(w.id);
                    return (
                      <tr key={w.id}>
                        <td>
                          <div className={styles.accountCell}>
                            <span className={styles.avatar} aria-hidden="true">{initials(w.name)}</span>
                            <span className={styles.accountName} style={{ minWidth: 0 }}>
                              <strong title={w.name} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</strong>
                              <small dir="ltr" style={{ display: "block", fontSize: 11, color: "var(--muted)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.phone}</small>
                            </span>
                          </div>
                        </td>
                        <td>
                          {acc ? (
                            <span className={styles.tag} dir="ltr" title={`@${acc.tag}`} style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block", maxWidth: "100%" }}>@{acc.tag}</span>
                          ) : (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 12, color: "var(--subtle)", fontWeight: 500 }}>{t.details.notLinked}</span>
                              {isManager && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDetails(w);
                                    setActiveTab("overview");
                                    setSelectedLink(null);
                                    setLinkSearch("");
                                    setLinkModal(true);
                                  }}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    minHeight: 26,
                                    padding: "0 10px",
                                    borderRadius: 8,
                                    border: "1px solid var(--border)",
                                    background: "var(--panel)",
                                    color: "var(--accent)",
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    whiteSpace: "nowrap",
                                  }}
                                  aria-label={`${t.table.linkNow} ${w.name}`}
                                >
                                  <Link2 size={12} aria-hidden="true" />
                                  {(t.table as any).linkNow ?? "Link now"}
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: 12, fontWeight: 700, color: Number(w.balance) > 0 ? "#3A7D52" : "var(--muted)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{formatCurrency(Number(w.balance) || 0, settings.currency as any)}</td>
                        <td><span className={`${styles.badge} ${w.status === "active" ? styles.badgeStatusActive : styles.badgeStatusArchived}`}>{(t.statuses as any)[w.status] ?? w.status}</span></td>
                        <td>
                          <div className={styles.actionsCell} style={{ justifyContent: "center" }}>
                            <button type="button" className={styles.viewButton} onClick={() => { setDetails(w); setActiveTab("overview"); }} aria-label={`${t.view} ${w.name}`}>
                              <Eye size={14} aria-hidden="true" />{t.view}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Worker Modal */}
      {showAdd && (
        <div className={styles.backdrop} onClick={() => !saving && setShowAdd(false)}>
          <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{editing ? t.edit.title : t.create.title}</h2>
              <button type="button" className={styles.closeButton} onClick={() => setShowAdd(false)} disabled={saving} aria-label="Close"><X size={16} /></button>
            </div>
            <div className={styles.formBody}>
              <div className={styles.field}><label>{t.create.name} *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className={styles.field}><label>{t.create.phone} *</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })} inputMode="numeric" /></div>
              <div className={styles.field}>
                <label>{t.create.position} *</label>
                <StyledSelect value={form.position} onChange={(v) => setForm({ ...form, position: v })} options={positions.map((p) => ({ value: p, label: p }))} placeholder={positions.length ? "Select position" : t.create.position} ariaLabel={t.create.position} />
                {positions.length === 0 && <small className={styles.hint}>No positions configured</small>}
              </div>
              <div className={styles.field}><label>{t.create.employmentDate} *</label><StyledDatePicker value={form.employmentDate} onChange={(v) => setForm({ ...form, employmentDate: v })} language={lang} placeholder={t.create.employmentDate} ariaLabel={t.create.employmentDate} /></div>
              <div className={styles.field}><label>{t.create.birthDate}</label><StyledDatePicker value={form.birthDate} onChange={(v) => setForm({ ...form, birthDate: v })} language={lang} placeholder={t.create.birthDate} ariaLabel={t.create.birthDate} /></div>
              <div className={styles.field}><label>{t.create.address}</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div className={styles.field}><label>{t.create.startingSalary} *</label><div style={{ display: "flex", gap: 8 }}><input type="number" step="0.01" value={form.startingSalary} onChange={(e) => setForm({ ...form, startingSalary: e.target.value })} style={{ flex: 1 }} /><span style={{ display: "grid", placeItems: "center", padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel-hover)", fontSize: 12, fontWeight: 700 }}>{settings.currency}</span></div></div>
              <div className={styles.field}><label>{t.create.monthlySalary} *</label><div style={{ display: "flex", gap: 8 }}><input type="number" min="0" step="0.01" value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} style={{ flex: 1 }} /><span style={{ display: "grid", placeItems: "center", padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel-hover)", fontSize: 12, fontWeight: 700 }}>{settings.currency}</span></div></div>
              <div className={styles.field}><label>{t.create.notes}</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} style={{ width: "100%", padding: 10, border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel)", color: "var(--text)" }} /></div>
              {formError && <div className={styles.formError}>{formError}</div>}
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.secondaryButton} onClick={() => setShowAdd(false)} disabled={saving}>{t.create.cancel}</button>
              <button type="button" className={styles.primaryButton} onClick={handleSave} disabled={saving}>{saving ? (editing ? t.edit.saving : t.create.creating) : editing ? t.edit.save : t.create.create}</button>
            </div>
          </section>
        </div>
      )}

      {/* Details Drawer */}
      {details && (
        <div className={styles.drawerBackdrop} onClick={() => setDetails(null)}>
          <section className={styles.drawer} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} dir={isRtl ? "rtl" : "ltr"} style={{ width: "min(560px, 100vw)", maxWidth: "100vw" }}>
            <div className={styles.drawerHeader}>
              <h2 className={styles.drawerTitle}>{t.details.title}</h2>
              <button type="button" className={styles.closeButton} onClick={() => setDetails(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div style={{ display: "flex", gap: 6, padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "var(--panel)", overflowX: "auto" }}>
              {[
                ["overview", t.details.overview],
                ["financial", t.details.financial],
                ["attendance", t.details.attendance],
                ["portal", t.details.portal],
                ["requests", t.details.requests],
                ["activity", t.details.activity],
              ].map(([key, label]) => (
                <button key={key} type="button" onClick={() => setActiveTab(key as any)} style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid var(--border)", background: activeTab === key ? "var(--accent)" : "var(--panel)", color: activeTab === key ? "#fff" : "var(--muted)", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap", cursor: "pointer" }}>{label as string}</button>
              ))}
            </div>
            <div className={styles.drawerBody}>
              {activeTab === "overview" && (
                <>
                  <div className={styles.identityCard}>
                    <span className={styles.identityAvatar} aria-hidden="true">{initials(details.name)}</span>
                    <span className={styles.identityInfo}>
                      <strong>{details.name}</strong>
                      <span className={styles.tag}>@{workerAccountMap.get(details.id)?.tag || "no-tag"}</span>
                      <span className={`${styles.badge} ${styles.badgeRole}`} style={{ alignSelf: "flex-start", marginTop: 4 }}>{details.position}</span>
                    </span>
                  </div>
                  <div className={styles.detailSection}>
                    <h3 className={styles.detailSectionTitle}>{t.details.identity}</h3>
                    <div className={styles.detailGrid}>
                      <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.name}</span><span className={styles.detailValue}>{details.name}</span></div>
                      <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.phone}</span><span className={styles.detailValue} dir="ltr">{details.phone}</span></div>
                      <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.position}</span><span className={styles.detailValue}>{details.position}</span></div>
                      <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.hireDate}</span><span className={styles.detailValue}>{formatDate(details.employmentDate, lang)}</span></div>
                    </div>
                  </div>
                  <div className={styles.detailSection}>
                    <h3 className={styles.detailSectionTitle}>{t.details.finance}</h3>
                    <div className={styles.detailGrid}>
                      <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.salary}</span><span className={styles.detailValue}>{formatCurrency(Number(details.monthlySalary), settings.currency as any)}</span></div>
                      <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.credit}</span><span className={styles.detailValue} style={{ color: Number(details.balance) > 0 ? "#3A7D52" : "var(--muted)", fontWeight: 800 }}>{formatCurrency(Number(details.balance), settings.currency as any)}</span></div>
                      <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.status}</span><span className={`${styles.badge} ${details.status === "active" ? styles.badgeStatusActive : styles.badgeStatusArchived}`}>{(t.statuses as any)[details.status]}</span></div>
                    </div>
                  </div>
                  {details.status === "archived" && <div style={{ padding: 10, border: "1px solid var(--danger-border)", background: "var(--danger-soft)", borderRadius: 8, color: "var(--danger)", fontSize: 12, fontWeight: 600 }}>{t.details.archivedNote}</div>}
                  {isManager && (
                    <div className={styles.drawerActions}>
                      <button type="button" className={styles.actionButton} onClick={() => openEdit(details)}><ArchiveRestore size={14} />{t.details.edit}</button>
                      {details.status === "active" ? (
                        <button type="button" className={`${styles.actionButton} ${styles.actionDanger}`} onClick={() => setShowArchiveConfirm(details)}><Archive size={14} />{t.details.archive}</button>
                      ) : (
                        <button type="button" className={styles.actionButton} onClick={() => setShowReactivate(details)}><ArchiveRestore size={14} />{t.details.reactivate}</button>
                      )}
                      <button type="button" className={styles.actionButton} onClick={() => setDetails(null)} style={{ marginInlineStart: "auto" }}>{t.details.close}</button>
                    </div>
                  )}
                </>
              )}

              {activeTab === "financial" && (
                <>
                  <div className={styles.detailSection}>
                    <h3 className={styles.detailSectionTitle}>{t.details.finance}</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 10, background: "var(--panel-hover)" }}><small style={{ color: "var(--muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{t.details.salary}</small><div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{formatCurrency(Number(details.monthlySalary), settings.currency as any)}</div></div>
                      <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 10, background: "var(--panel-hover)" }}><small style={{ color: "var(--muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{t.details.credit}</small><div style={{ fontSize: 16, fontWeight: 800, color: Number(details.balance) > 0 ? "#3A7D52" : "var(--muted)" }}>{formatCurrency(Number(details.balance), settings.currency as any)}</div></div>
                    </div>
                  </div>
                  <div className={styles.detailSection}>
                    <h3 className={styles.detailSectionTitle}>{t.details.payments}</h3>
                    {payments.length === 0 ? (
                      <div style={{ padding: 16, border: "1px dashed var(--border)", borderRadius: 10, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>{t.details.noPayments}</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {payments.slice(0, 10).map((p: any) => (
                          <div key={p.id} className={styles.detailRow}>
                            <span className={styles.detailLabel}>{formatDate(p.date, lang)}</span>
                            <span className={styles.detailValue} style={{ fontVariantNumeric: "tabular-nums" }}>{formatCurrency(Number(p.amount), settings.currency as any)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={styles.detailSection}>
                    <h3 className={styles.detailSectionTitle}>{t.details.bonuses}</h3>
                    {(() => {
                      const bonuses = financialEvents.filter((e) => e.type === "bonus");
                      return bonuses.length === 0 ? (
                        <div style={{ padding: 16, border: "1px dashed var(--border)", borderRadius: 10, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>{t.details.noBonuses}</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {bonuses.slice(0, 10).map((ev) => (
                            <div key={ev.id} className={styles.detailRow}>
                              <span className={styles.detailLabel} style={{ display: "flex", flexDirection: "column", gap: 2 }}><span>{formatDate(ev.createdAt, lang)} · {ev.amount > 0 ? "+" : ""}{formatCurrency(ev.amount, settings.currency as any)}</span>{ev.note && <small style={{ color: "var(--subtle)", fontSize: 11 }}>{ev.note}</small>}{ev.actorTag && <small style={{ color: "var(--subtle)", fontSize: 10 }}>by @{ev.actorTag}</small>}</span>
                              <span className={styles.detailValue} style={{ fontSize: 11, color: "var(--muted)" }}>{formatCurrency(ev.balanceAfter, settings.currency as any)}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {isManager && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        <input type="number" min="0" step="0.01" value={bonusAmount} onChange={(e) => setBonusAmount(e.target.value)} placeholder="Amount" style={{ flex: "1 1 100px", minHeight: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel)", color: "var(--text)" }} />
                        <input value={bonusNote} onChange={(e) => setBonusNote(e.target.value)} placeholder="Note (optional)" style={{ flex: "2 1 140px", minHeight: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel)", color: "var(--text)" }} />
                        <button type="button" className={styles.primaryButton} onClick={handleBonus} disabled={bonusLoading || !bonusAmount} style={{ minHeight: 36 }}>{bonusLoading ? "..." : "Add Bonus"}</button>
                      </div>
                    )}
                  </div>
                  <div className={styles.detailSection}>
                    <h3 className={styles.detailSectionTitle}>{t.details.loans}</h3>
                    {(() => {
                      const loans = financialEvents.filter((e) => e.type === "loan");
                      return loans.length === 0 ? (
                        <div style={{ padding: 16, border: "1px dashed var(--border)", borderRadius: 10, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>{t.details.noLoans}</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {loans.slice(0, 10).map((ev) => (
                            <div key={ev.id} className={styles.detailRow}>
                              <span className={styles.detailLabel}>{formatDate(ev.createdAt, lang)} · {formatCurrency(ev.amount, settings.currency as any)}</span>
                              <span className={styles.detailValue} style={{ fontSize: 11 }}>{ev.note || "—"}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}

              {activeTab === "attendance" && (
                <>
                  <div className={styles.detailSection}>
                    <h3 className={styles.detailSectionTitle}>{t.details.attendance}</h3>
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: 12 }}>{t.details.attendanceHint}</p>
                    {(() => {
                      const absences = financialEvents.filter((e) => e.type === "absence");
                      return absences.length === 0 ? (
                        <div style={{ padding: 16, border: "1px dashed var(--border)", borderRadius: 10, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>{t.details.noAbsences}</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {absences.slice(0, 20).map((ev) => (
                            <div key={ev.id} className={styles.detailRow}>
                              <span className={styles.detailLabel} style={{ display: "flex", flexDirection: "column", gap: 2 }}><span>{formatDate(ev.createdAt, lang)} · -{formatCurrency(ev.amount, settings.currency as any)}</span>{ev.note && <small style={{ color: "var(--subtle)", fontSize: 11 }}>{ev.note}</small>}{ev.actorTag && <small style={{ color: "var(--subtle)", fontSize: 10 }}>by @{ev.actorTag}</small>}</span>
                              <span className={styles.detailValue} style={{ fontSize: 11, color: "var(--muted)" }}>{formatCurrency(ev.balanceAfter, settings.currency as any)}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {isManager && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        <input type="number" min="0" step="0.01" value={absenceAmount} onChange={(e) => setAbsenceAmount(e.target.value)} placeholder="Amount" style={{ flex: "1 1 100px", minHeight: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel)", color: "var(--text)" }} />
                        <input value={absenceNote} onChange={(e) => setAbsenceNote(e.target.value)} placeholder="Reason/note" style={{ flex: "2 1 140px", minHeight: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel)", color: "var(--text)" }} />
                        <button type="button" className={styles.primaryButton} onClick={handleAbsence} disabled={bonusLoading || !absenceAmount} style={{ minHeight: 36, background: "var(--danger)", borderColor: "var(--danger)" }}>Add Absence</button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {activeTab === "portal" && (
                <>
                  <div className={styles.detailSection}>
                    <h3 className={styles.detailSectionTitle}>{t.details.portal}</h3>
                    {(() => {
                      const acc = workerAccountMap.get(details.id);
                      if (!acc) {
                        return (
                          <div style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 10, background: "var(--panel-hover)", textAlign: "center" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{t.details.notLinked}</div>
                            <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 12 }}>Portal access has not been configured.</p>
                            {isManager && (
                              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
                                <button type="button" className={styles.primaryButton} onClick={() => setLinkModal(true)}><Link2 size={14} />{t.details.linkExisting}</button>
                                <button type="button" className={styles.secondaryButton} onClick={() => { setCreateDisplayName(details.name); setCreateTag(details.name.toLowerCase().replace(/\s+/g,".") ), setShowCreateAccount(true); }}><Plus size={14} />{t.details.createAccount}</button>
                              </div>
                            )}
                          </div>
                        );
                      }
                      return (
                        <div style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 10, background: "var(--panel-hover)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ width: 36, height: 36, display: "grid", placeItems: "center", borderRadius: 8, background: "var(--panel)", border: "1px solid var(--border)", color: "var(--muted)", fontWeight: 800, fontSize: 11 }}>{initials(acc.displayName)}</span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <strong style={{ display: "block", fontSize: 13 }}>{acc.displayName}</strong>
                              <small style={{ color: "var(--muted)", fontFamily: "ui-monospace", fontSize: 11 }} dir="ltr">@{acc.tag}</small>
                            </span>
                            <span className={`${styles.badge} ${styles.badgeRole}`}>{(t as any).roles[acc.role] ?? acc.role}</span>
                          </div>
                          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                            <div className={styles.detailRow}><span className={styles.detailLabel}>Role</span><span className={styles.detailValue}>{acc.role}</span></div>
                            <div className={styles.detailRow}><span className={styles.detailLabel}>Status</span><span className={`${styles.badge} ${acc.status === "active" ? styles.badgeStatusActive : styles.badgeStatusArchived}`}>{acc.status}</span></div>
                            <div className={styles.detailRow}><span className={styles.detailLabel}>Onboarding</span><span className={`${styles.badge} ${acc.onboardingStatus === "pending" ? styles.badgeOnboardingPending : styles.badgeOnboardingComplete}`}>{acc.onboardingStatus}</span></div>
                            <div className={styles.detailRow}><span className={styles.detailLabel}>Last Login</span><span className={styles.detailValue}>{acc.lastLoginAt ? formatDate(acc.lastLoginAt, lang) : "—"}</span></div>
                            <div className={styles.detailRow}><span className={styles.detailLabel}>Password</span><span className={styles.detailValue}>{(acc as any).mustChangePassword ? "Must change" : "Configured"}</span></div>
                          </div>
                          {isManager && (
                            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                              <button type="button" className={styles.secondaryButton} onClick={() => setShowUnlinkConfirm(acc)} style={{ flex: 1 }}><Unlink size={14} />{t.details.unlink}</button>
                              <button type="button" className={styles.secondaryButton} onClick={() => window.open("/rvb/accounts", "_self")} style={{ flex: 1 }}><Eye size={14} />{t.details.viewAccount}</button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}

              {activeTab === "requests" && (
                <div className={styles.detailSection}>
                  <h3 className={styles.detailSectionTitle}>{t.details.requests}</h3>
                  {requests.length === 0 ? (
                    <div style={{ padding: 16, border: "1px dashed var(--border)", borderRadius: 10, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>{t.details.requestsEmpty}</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {requests.map((r) => (
                        <div key={r.id} className={styles.detailRow} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                            <span className={`${styles.badge} ${r.status === "under_review" ? styles.badgeOnboardingPending : r.status === "accepted" ? styles.badgeStatusActive : styles.badgeStatusDisabled}`} style={{ fontSize: 10 }}>{r.type} · {r.status}</span>
                            <span style={{ fontSize: 11, color: "var(--muted)" }}>{formatDate(r.submittedAt, lang)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                            <span style={{ color: "var(--text)", fontWeight: 600 }}>{r.amount ? formatCurrency(r.amount, settings.currency as any) : ""} {r.description ? `· ${r.description}` : ""}</span>
                            {r.amount && r.type === "payment" && <span style={{ color: "var(--muted)", fontSize: 11 }}>credit check: {formatCurrency(r.amount, settings.currency as any)}</span>}
                          </div>
                          {r.notes && <small style={{ color: "var(--muted)", fontSize: 11 }}>Review notes: {r.notes}</small>}
                          {r.status === "under_review" && isManager && (
                            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                              <button type="button" className={styles.primaryButton} onClick={() => handleReviewRequest(r.id, "accepted")} style={{ flex: 1, minHeight: 32, fontSize: 11, background: "#3A7D52", borderColor: "#3A7D52" }}>Accept</button>
                              <button type="button" className={styles.secondaryButton} onClick={() => handleReviewRequest(r.id, "rejected")} style={{ flex: 1, minHeight: 32, fontSize: 11 }}>Reject</button>
                            </div>
                          )}
                          {r.status !== "under_review" && r.reviewedAt && <small style={{ color: "var(--subtle)", fontSize: 10 }}>Reviewed {formatDate(r.reviewedAt, lang)}</small>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "activity" && (
                <div className={styles.detailSection}>
                  <h3 className={styles.detailSectionTitle}>{t.details.activity}</h3>
                  <div className={styles.detailGrid}>
                    <div className={styles.detailRow}><span className={styles.detailLabel}>Created</span><span className={styles.detailValue}>{formatDate(details.createdAt, lang)}</span></div>
                    <div className={styles.detailRow}><span className={styles.detailLabel}>Updated</span><span className={styles.detailValue}>{formatDate(details.updatedAt, lang)}</span></div>
                    <div className={styles.detailRow}><span className={styles.detailLabel}>Balance</span><span className={styles.detailValue}>{formatCurrency(Number(details.balance), settings.currency as any)}</span></div>
                    {workerAccountMap.get(details.id) && <div className={styles.detailRow}><span className={styles.detailLabel}>Linked</span><span className={styles.detailValue}>@{workerAccountMap.get(details.id)!.tag}</span></div>}
                  </div>
                  {activities.length === 0 ? (
                    <div style={{ padding: 12, border: "1px dashed var(--border)", borderRadius: 8, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>{t.details.activityEmpty}</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
                      {activities.slice(0, 30).map((a) => (
                        <div key={a.id} className={styles.detailRow} style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)" }}>{a.action}</span>
                            <span style={{ fontSize: 10, color: "var(--muted)" }}>{formatDate(a.createdAt, lang)}</span>
                          </div>
                          {a.details && <small style={{ color: "var(--muted)", fontSize: 11 }}>{a.details}</small>}
                          {a.actorTag && <small style={{ color: "var(--subtle)", fontSize: 10 }}>by @{a.actorTag}</small>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Link Existing Account Modal */}
      {linkModal && details && (
        <div className={styles.backdrop} onClick={() => setLinkModal(false)}>
          <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ width: "min(480px, calc(100vw - 32px))" }}>
            <div className={styles.modalHeader}>
              <h2>{t.details.linkExisting}</h2>
              <button type="button" className={styles.closeButton} onClick={() => setLinkModal(false)}><X size={16} /></button>
            </div>
            <div className={styles.formBody}>
              <div className={styles.field}>
                <label>{t.details.searchAccounts}</label>
                <div className={styles.searchBox} style={{ height: 40 }}>
                  <span aria-hidden="true"><Search size={16} /></span>
                  <input type="search" value={linkSearch} onChange={(e) => setLinkSearch(e.target.value)} placeholder={t.details.searchAccounts} />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" }}>
                {eligibleAccounts.length === 0 ? (
                  <div style={{ padding: 14, textAlign: "center", color: "var(--muted)", fontSize: 12, border: "1px dashed var(--border)", borderRadius: 8 }}>{t.details.noAccounts}</div>
                ) : eligibleAccounts.map((acc) => (
                  <button key={acc.id} type="button" onClick={() => setSelectedLink(acc)} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, border: selectedLink?.id === acc.id ? "2px solid var(--accent)" : "1px solid var(--border)", borderRadius: 10, background: selectedLink?.id === acc.id ? "var(--accent-soft)" : "var(--panel-hover)", cursor: "pointer", textAlign: "start" }}>
                    <span style={{ width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: 8, background: "var(--panel)", border: "1px solid var(--border)", fontWeight: 800, fontSize: 11 }}>{initials(acc.displayName)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: "block", fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.displayName}</strong>
                      <small style={{ color: "var(--muted)", fontFamily: "ui-monospace", fontSize: 11 }} dir="ltr">@{acc.tag}</small>
                    </span>
                    <span className={`${styles.badge} ${styles.badgeRole}`} style={{ fontSize: 10 }}>{acc.role}</span>
                  </button>
                ))}
              </div>
              {selectedLink && <div style={{ padding: 10, background: "var(--accent-soft)", border: "1px solid var(--accent-ring)", borderRadius: 8, fontSize: 12, color: "var(--text)", fontWeight: 600 }}>{t.details.linkConfirm.replace("@tag", `@${selectedLink.tag}`).replace("Worker Name", details.name)}</div>}
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.secondaryButton} onClick={() => setLinkModal(false)}>{t.create.cancel}</button>
              <button type="button" className={styles.primaryButton} onClick={handleLink} disabled={!selectedLink || linking}>{linking ? "Linking..." : t.details.confirmLink}</button>
            </div>
          </section>
        </div>
      )}

      {showUnlinkConfirm && details && (
        <div className={styles.backdrop} onClick={() => setShowUnlinkConfirm(null)}>
          <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ width: "min(420px, calc(100vw - 32px))", textAlign: "center" as any, padding: 20 }}>
            <div style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: "50%", background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid var(--danger-ring)", margin: "0 auto 10px" }}><Unlink size={20} /></div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{t.details.confirmUnlink}</h2>
            <p style={{ margin: "8px auto 0", maxWidth: 340, color: "var(--muted)", fontSize: 12 }}>{t.details.unlinkDesc}</p>
            <p style={{ margin: "8px auto 0", maxWidth: 340, color: "var(--text)", fontSize: 12, fontWeight: 700 }}>@{showUnlinkConfirm.tag}</p>
            <div style={{ marginTop: 16, display: "flex", justifyContent: "center", gap: 8 }}>
              <button type="button" className={styles.secondaryButton} onClick={() => setShowUnlinkConfirm(null)} disabled={linking}>{t.create.cancel}</button>
              <button type="button" className={styles.primaryButton} onClick={handleUnlink} disabled={linking} style={{ background: "var(--danger)", borderColor: "var(--danger)" }}>{linking ? "Unlinking..." : t.details.unlink}</button>
            </div>
          </section>
        </div>
      )}

      {showCreateAccount && details && (
        <div className={styles.backdrop} onClick={() => !creatingAccount && setShowCreateAccount(false)}>
          <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{t.details.createAccount}</h2>
              <button type="button" className={styles.closeButton} onClick={() => setShowCreateAccount(false)} disabled={creatingAccount}><X size={16} /></button>
            </div>
            <div className={styles.formBody}>
              <div className={styles.field}>
                <label>Role *</label>
                <StyledSelect value={createRole} onChange={setCreateRole} options={[{ value: "worker", label: "Worker" }, { value: "supervisor", label: "Supervisor" }]} placeholder="Select role" ariaLabel="Role" />
              </div>
              <div className={styles.field}><label>Display Name *</label><input value={createDisplayName} onChange={(e) => setCreateDisplayName(e.target.value)} placeholder="Worker name" /></div>
              <div className={styles.field}>
                <label>Tag *</label>
                <div className={styles.inputWithPrefix}><span aria-hidden="true">@</span><input value={createTag} onChange={(e) => setCreateTag(e.target.value)} placeholder="worker.tag" dir="ltr" style={{ flex: 1, border: 0, background: "transparent", outline: 0, padding: "10px 12px 10px 4px" }} /></div>
                <small className={styles.hint}>3–30 chars a-z 0-9 . _</small>
              </div>
              <div className={styles.field}><label>Password *</label><div style={{ position: "relative", display: "flex", alignItems: "center" }}><input type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} placeholder="••••••••" dir="ltr" style={{ flex: 1, paddingInlineEnd: 60 }} /><span style={{ position: "absolute", insetInlineEnd: 6, fontSize: 11, color: "var(--muted)" }}><KeyRound size={14} /></span></div></div>
              <div className={styles.field}><label>Confirm *</label><input type="password" value={createConfirm} onChange={(e) => setCreateConfirm(e.target.value)} placeholder="••••••••" dir="ltr" /></div>
              {createError && <div className={styles.formError}>{createError}</div>}
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.secondaryButton} onClick={() => setShowCreateAccount(false)} disabled={creatingAccount}>{t.create.cancel}</button>
              <button type="button" className={styles.primaryButton} onClick={handleCreateAccount} disabled={creatingAccount}>{creatingAccount ? "Creating..." : t.details.createAccount}</button>
            </div>
          </section>
        </div>
      )}

      {showArchiveConfirm && (
        <div className={styles.backdrop} onClick={() => setShowArchiveConfirm(null)}>
          <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ width: "min(420px, calc(100vw - 32px))", textAlign: "center" as any, padding: 20 }}>
            <div style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent-ring)", margin: "0 auto 10px" }}><Archive size={20} /></div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{t.archiveConfirm.title}</h2>
            <p style={{ margin: "8px auto 0", maxWidth: 340, color: "var(--muted)", fontSize: 12 }}>{t.archiveConfirm.desc}</p>
            <p style={{ margin: "8px auto 0", maxWidth: 340, color: "var(--muted)", fontSize: 11 }}>{t.archiveConfirm.warning}</p>
            <div style={{ marginTop: 16, display: "flex", justifyContent: "center", gap: 8 }}>
              <button type="button" className={styles.secondaryButton} onClick={() => setShowArchiveConfirm(null)}>{t.create.cancel}</button>
              <button type="button" className={styles.primaryButton} onClick={handleArchive} style={{ background: "var(--danger)", borderColor: "var(--danger)" }}>Archive</button>
            </div>
          </section>
        </div>
      )}

      {showReactivate && (
        <div className={styles.backdrop} onClick={() => setShowReactivate(null)}>
          <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}><h2>Reactivate Worker</h2><button type="button" className={styles.closeButton} onClick={() => setShowReactivate(null)}><X size={16} /></button></div>
            <div className={styles.formBody}>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 12 }}>Restoring requires starting and monthly salary.</p>
              <div className={styles.field}><label>Starting Salary *</label><input type="number" step="0.01" value={reactivateForm.startingSalary} onChange={(e) => setReactivateForm({ ...reactivateForm, startingSalary: e.target.value })} /></div>
              <div className={styles.field}><label>Monthly Salary *</label><input type="number" min="0" step="0.01" value={reactivateForm.monthlySalary} onChange={(e) => setReactivateForm({ ...reactivateForm, monthlySalary: e.target.value })} /></div>
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.secondaryButton} onClick={() => setShowReactivate(null)}>Cancel</button>
              <button type="button" className={styles.primaryButton} onClick={handleReactivate}>Reactivate</button>
            </div>
          </section>
        </div>
      )}
    </RvbShell>
  );
}

export default function RvbWorkersPage() {
  return (
    <RvbAuthGuard>
      <RvbWorkersGuard>
        <RvbWorkersInner />
      </RvbWorkersGuard>
    </RvbAuthGuard>
  );
}

