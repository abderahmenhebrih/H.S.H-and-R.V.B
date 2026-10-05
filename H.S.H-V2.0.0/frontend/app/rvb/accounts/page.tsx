"use client";

import { formatTimestampToDisplay } from "../../../src/lib/date-format";

import { useEffect, useMemo, useState, useCallback } from "react";
import RvbShell from "../../../src/components/rvb/RvbShell";
import StyledSelect from "../../../src/components/common/StyledSelect";
import ProtectedDeleteModal from "../../../src/components/common/ProtectedDeleteModal";
import { useCircularDeleteCountdown } from "../../../src/hooks/useCircularDeleteCountdown";
import { rvbUiPreferencesService, RVB_UI_PREFERENCES_EVENT } from "@/src/services/rvb-ui-preferences.service";
import { DEFAULT_SETTINGS } from "../../../src/lib/settings";
import type { Settings, Language } from "../../../src/types/settings/settings";
import { rvbAccountService } from "../../../src/services/rvb-account.service";
import { rvbConfigService } from "../../../src/services/rvb-config.service";
import type { RvbAccount } from "../../../src/types/rvb/rvb-account";
import { normalizeTag, isValidTag, TAG_REGEX } from "../../../src/types/rvb/rvb-account";
import { RVB_ROLES } from "../../../src/types/rvb/roles";
import {
  Search,
  Plus,
  ShieldCheck,
  Eye,
  Archive,
  ArchiveRestore,
  Ban,
  X,
  UsersRound,
  Truck,
  Users,
  AlertTriangle,
  EyeOff,
  KeyRound,
} from "lucide-react";
import { useRvbAuth } from "../../../src/contexts/RvbAuthContext";
import RvbAuthGuard from "../../../src/components/rvb/RvbAuthGuard";
import { RvbAccountsGuard } from "../../../src/components/rvb/RvbRoleGuard";
import styles from "./page.module.css";

// ---- Translations ----
const TR: Record<Language, any> = {
  en: {
    headerTitle: "Account & Access Management",
    headerSubtitle: "Manage RVB identities, roles, linked entities and access lifecycle",
    kpi: { total: "Total Accounts", active: "Active", pending: "Pending Onboarding", archived: "Archived" },
    searchPlaceholder: "Search accounts by name or @tag",
    allRoles: "All Roles",
    allStatuses: "All Statuses",
    roles: { manager: "Manager", admin: "Admin", supervisor: "Supervisor", worker: "Worker", supplier: "Supplier", customer: "Customer" },
    statuses: { active: "Active", archived: "Archived", disabled: "Disabled" },
    onboarding: { pending: "Pending", complete: "Complete" },
    filters: {
      pendingOnboarding: "Pending Onboarding",
      archived: "Archived",
      disabled: "Disabled",
      active: "Active",
    },
    table: {
      account: "Account",
      tag: "@Tag",
      role: "Role",
      linkedEntity: "Linked Entity",
      status: "Status",
      onboarding: "Onboarding",
      lastActivity: "Last Activity",
      actions: "Actions",
    },
    emptyTitle: "No RVB accounts yet",
    emptyDesc: "Create the first RVB account to give a management user, worker, supplier or customer access to the RVB ecosystem.",
    createAccount: "Create Account",
    loading: "Loading accounts...",
    failedLoad: "Failed to load accounts",
    view: "View",
    management: "Management",
    details: {
      title: "Account Details",
      identity: "Identity",
      link: "Link",
      access: "Access",
      linkedEntityType: "Linked Entity Type",
      linkedEntityName: "Linked Entity Name / ID",
      status: "Status",
      onboardingStatus: "Onboarding Status",
      created: "Created",
      lastLogin: "Last Login",
      tag: "Tag",
      displayName: "Display Name",
      role: "Role",
    },
    actions: { archive: "Archive", reactivate: "Reactivate", disable: "Disable", cancel: "Cancel", close: "Close" },
    archiveConfirm: { title: "Archive Account", desc: "This account will be frozen and lose access until reactivated.", warning: "You can reactivate it later. History is preserved." },
    disableConfirm: { title: "Disable Account", desc: "This account will be blocked from access immediately.", warning: "Reactivation is manual. Use carefully." },
    create: {
      title: "Create RVB Account",
      role: "Role",
      linkedEntity: "Linked Entity",
      displayName: "Display Name",
      tag: "Tag",
      tagHint: "3–30 chars: letters, numbers, dot, underscore. Stored without @.",
      password: "Password",
      confirmPassword: "Confirm Password",
      passwordHint: "8–128 characters, temporary password communicated outside app",
      show: "Show",
      hide: "Hide",
      selectRole: "Select role",
      selectEntity: "Select entity",
      creating: "Creating...",
      cancel: "Cancel",
      create: "Create Account",
      autoFilled: "Auto-filled from entity",
      noEntities: "No available entities — all are already linked.",
      loadingEntities: "Loading available entities…",
      linkableLoadError: "Could not load linkable entities. Check your connection or permissions, then retry.",
      retry: "Retry",
    },
    validation: {
      tagRequired: "Tag is required",
      tagInvalid: "Tag is invalid (3–30 chars, a-z 0-9 . _ , start with letter/number)",
      roleRequired: "Role is required",
      displayNameRequired: "Display name is required",
      linkedRequired: "Linked entity is required for this role",
    },
    errors: {
      RVB_TAG_REQUIRED: "Tag is required",
      RVB_TAG_INVALID: "Tag is invalid",
      RVB_TAG_ALREADY_EXISTS: "Tag already exists",
      RVB_TAG_IMMUTABLE: "Tag cannot be changed",
      RVB_FIELD_NOT_ALLOWED: "Field not allowed",
      RVB_DISPLAY_NAME_REQUIRED: "Display name is required",
      RVB_ROLE_INVALID: "Invalid role",
      RVB_ENTITY_ALREADY_LINKED: "This entity already has an RVB account",
      RVB_ENTITY_ROLE_MISMATCH: "Role and entity type mismatch",
      RVB_LINKED_ENTITY_INACTIVE: "Restore this H.S.H entity before granting portal access.",
      RVB_LINKED_ENTITY_NOT_FOUND: "Linked entity not found",
      RVB_LINKED_ENTITY_REQUIRED: "Linked entity is required for this role",
      RVB_ACCOUNT_NOT_FOUND: "Account not found",
      RVB_PASSWORD_REQUIRED: "Password is required",
      RVB_PASSWORD_TOO_SHORT: "Password must be at least 8 characters",
      RVB_PASSWORD_TOO_LONG: "Password must be at most 128 characters",
      RVB_PASSWORD_CONFIRM_MISMATCH: "Passwords do not match",
      RVB_PASSWORD_ALREADY_SET: "Password already set",
      RVB_PASSWORD_NOT_SET: "Password not set",
      RVB_UNAUTHENTICATED: "Authentication required",
      RVB_FORBIDDEN: "Insufficient permissions",
    },
    search: "Search accounts",
    linkedNone: "—",
    setInitial: { title: "Set Initial Password", desc: "Set a temporary password for this account. User must change it on first login.", password: "New Password", confirm: "Confirm Password", hint: "8–128 characters", cancel: "Cancel", confirmBtn: "Set Password", setting: "Setting...", credentialsNotConfigured: "Credentials not configured", credentialsConfigured: "Credentials configured", mustChange: "Must change on first login" },
  },
  fr: {
    headerTitle: "Gestion des comptes et des accès",
    headerSubtitle: "Gérez les identités RVB, les rôles, les entités liées et le cycle d’accès",
    kpi: { total: "Total Comptes", active: "Actifs", pending: "En attente d’onboarding", archived: "Archivés" },
    searchPlaceholder: "Rechercher par nom ou @tag",
    allRoles: "Tous les rôles",
    allStatuses: "Tous les statuts",
    roles: { manager: "Manager", admin: "Admin", supervisor: "Superviseur", worker: "Travailleur", supplier: "Fournisseur", customer: "Client" },
    statuses: { active: "Actif", archived: "Archivé", disabled: "Désactivé" },
    onboarding: { pending: "En attente", complete: "Complet" },
    filters: { pendingOnboarding: "En attente d’onboarding", archived: "Archivé", disabled: "Désactivé", active: "Actif" },
    table: { account: "Compte", tag: "@Tag", role: "Rôle", linkedEntity: "Entité liée", status: "Statut", onboarding: "Onboarding", lastActivity: "Dernière activité", actions: "Actions" },
    emptyTitle: "Aucun compte RVB pour le moment",
    emptyDesc: "Créez le premier compte RVB pour donner l’accès à un manager, travailleur, fournisseur ou client.",
    createAccount: "Créer un compte",
    loading: "Chargement des comptes...",
    failedLoad: "Échec du chargement des comptes",
    view: "Voir",
    management: "Direction",
    details: { title: "Détails du compte", identity: "Identité", link: "Lien", access: "Accès", linkedEntityType: "Type d’entité liée", linkedEntityName: "Nom / ID entité liée", status: "Statut", onboardingStatus: "Statut d’onboarding", created: "Créé", lastLogin: "Dernière connexion", tag: "Tag", displayName: "Nom d’affichage", role: "Rôle" },
    actions: { archive: "Archiver", reactivate: "Réactiver", disable: "Désactiver", cancel: "Annuler", close: "Fermer" },
    archiveConfirm: { title: "Archiver le compte", desc: "Ce compte sera gelé et perdra l’accès jusqu’à réactivation.", warning: "Vous pourrez le réactiver plus tard. L’historique est conservé." },
    disableConfirm: { title: "Désactiver le compte", desc: "Ce compte sera bloqué immédiatement.", warning: "La réactivation est manuelle. Utilisez avec prudence." },
    create: { title: "Créer un compte RVB", role: "Rôle", linkedEntity: "Entité liée", displayName: "Nom d’affichage", tag: "Tag", tagHint: "3–30 car. : lettres, chiffres, point, underscore. Stocké sans @.", password: "Mot de passe", confirmPassword: "Confirmer", passwordHint: "8–128 caractères, mot de passe temporaire communiqué hors app", show: "Afficher", hide: "Masquer", selectRole: "Sélectionner un rôle", selectEntity: "Sélectionner une entité", creating: "Création...", cancel: "Annuler", create: "Créer le compte", autoFilled: "Rempli automatiquement depuis l’entité", noEntities: "Aucune entité disponible — toutes sont déjà liées.", loadingEntities: "Chargement des entités disponibles…", linkableLoadError: "Impossible de charger les entités associables. Vérifiez la connexion ou les autorisations, puis réessayez.", retry: "Réessayer" },
    validation: { tagRequired: "Tag requis", tagInvalid: "Tag invalide (3–30 car., a-z 0-9 . _ , commence par lettre/chiffre)", roleRequired: "Rôle requis", displayNameRequired: "Nom d’affichage requis", linkedRequired: "Entité liée requise pour ce rôle" },
    errors: { RVB_TAG_REQUIRED: "Tag requis", RVB_TAG_INVALID: "Tag invalide", RVB_TAG_ALREADY_EXISTS: "Tag déjà existant", RVB_TAG_IMMUTABLE: "Tag immuable", RVB_FIELD_NOT_ALLOWED: "Champ non autorisé", RVB_DISPLAY_NAME_REQUIRED: "Nom d’affichage requis", RVB_ROLE_INVALID: "Rôle invalide", RVB_ENTITY_ALREADY_LINKED: "Cette entité a déjà un compte RVB", RVB_ENTITY_ROLE_MISMATCH: "Rôle et type d’entité incompatibles", RVB_LINKED_ENTITY_INACTIVE: "Restaurez cette entité H.S.H avant de lui donner un accès portail.", RVB_LINKED_ENTITY_NOT_FOUND: "Entité liée introuvable", RVB_LINKED_ENTITY_REQUIRED: "Entité liée requise pour ce rôle", RVB_ACCOUNT_NOT_FOUND: "Compte introuvable", RVB_PASSWORD_REQUIRED: "Mot de passe requis", RVB_PASSWORD_TOO_SHORT: "Au moins 8 caractères", RVB_PASSWORD_TOO_LONG: "Au plus 128 caractères", RVB_PASSWORD_CONFIRM_MISMATCH: "Mots de passe différents", RVB_PASSWORD_ALREADY_SET: "Mot de passe déjà défini", RVB_PASSWORD_NOT_SET: "Mot de passe non défini", RVB_UNAUTHENTICATED: "Authentification requise", RVB_FORBIDDEN: "Permissions insuffisantes" },
    search: "Rechercher des comptes",
    linkedNone: "—",
    setInitial: { title: "Définir le mot de passe initial", desc: "Définir un mot de passe temporaire. L’utilisateur doit le changer à la première connexion.", password: "Nouveau mot de passe", confirm: "Confirmer", hint: "8–128 caractères", cancel: "Annuler", confirmBtn: "Définir", setting: "Définition...", credentialsNotConfigured: "Identifiants non configurés", credentialsConfigured: "Identifiants configurés", mustChange: "Changement requis à la première connexion" },
  },
  ar: {
    headerTitle: "إدارة الحسابات والصلاحيات",
    headerSubtitle: "إدارة هويات RVB والأدوار والجهات المرتبطة ودورة الوصول",
    kpi: { total: "إجمالي الحسابات", active: "النشطة", pending: "بانتظار الإعداد", archived: "المؤرشفة" },
    searchPlaceholder: "ابحث بالاسم أو @tag",
    allRoles: "جميع الأدوار",
    allStatuses: "جميع الحالات",
    roles: { manager: "المدير", admin: "الإداري", supervisor: "المشرف", worker: "العامل", supplier: "المورد", customer: "الزبون" },
    statuses: { active: "نشط", archived: "مؤرشف", disabled: "معطّل" },
    onboarding: { pending: "معلق", complete: "مكتمل" },
    filters: { pendingOnboarding: "بانتظار الإعداد", archived: "مؤرشف", disabled: "معطّل", active: "نشط" },
    table: { account: "الحساب", tag: "@Tag", role: "الدور", linkedEntity: "الجهة المرتبطة", status: "الحالة", onboarding: "الإعداد", lastActivity: "آخر نشاط", actions: "الإجراءات" },
    emptyTitle: "لا يوجد حسابات RVB بعد",
    emptyDesc: "أنشئ أول حساب RVB لمنح مدير أو عامل أو مورد أو زبون الوصول إلى منظومة RVB.",
    createAccount: "إنشاء حساب",
    loading: "جارٍ تحميل الحسابات...",
    failedLoad: "فشل تحميل الحسابات",
    view: "عرض",
    management: "الإدارة",
    details: { title: "تفاصيل الحساب", identity: "الهوية", link: "الربط", access: "الوصول", linkedEntityType: "نوع الجهة المرتبطة", linkedEntityName: "اسم / معرّف الجهة المرتبطة", status: "الحالة", onboardingStatus: "حالة الإعداد", created: "تاريخ الإنشاء", lastLogin: "آخر تسجيل دخول", tag: "المعرّف", displayName: "الاسم المعروض", role: "الدور" },
    actions: { archive: "أرشفة", reactivate: "إعادة التفعيل", disable: "تعطيل", cancel: "إلغاء", close: "إغلاق" },
    archiveConfirm: { title: "أرشفة الحساب", desc: "سيتم تجميد هذا الحساب وفقدان الوصول حتى إعادة التفعيل.", warning: "يمكنك إعادة تفعيله لاحقاً. السجل محفوظ." },
    disableConfirm: { title: "تعطيل الحساب", desc: "سيتم حظر هذا الحساب فوراً.", warning: "إعادة التفعيل يدوية. استخدم بحذر." },
    create: { title: "إنشاء حساب RVB", role: "الدور", linkedEntity: "الجهة المرتبطة", displayName: "الاسم المعروض", tag: "المعرّف", tagHint: "3–30 حرف: أحرف، أرقام، نقطة، شرطة سفلية. يُخزّن بدون @.", password: "كلمة المرور", confirmPassword: "تأكيد كلمة المرور", passwordHint: "8–128 حرفاً، كلمة مرور مؤقتة تُتواصل خارج التطبيق", show: "إظهار", hide: "إخفاء", selectRole: "اختر الدور", selectEntity: "اختر الجهة", creating: "جارٍ الإنشاء...", cancel: "إلغاء", create: "إنشاء الحساب", autoFilled: "تعبئة تلقائية من الجهة", noEntities: "لا توجد جهات متاحة — جميعها مرتبطة بالفعل.", loadingEntities: "جارٍ تحميل الجهات المتاحة…", linkableLoadError: "تعذر تحميل الجهات القابلة للربط. تحقق من الاتصال أو الصلاحيات ثم أعد المحاولة.", retry: "إعادة المحاولة" },
    validation: { tagRequired: "المعرّف مطلوب", tagInvalid: "المعرّف غير صالح (3–30 حرف، a-z 0-9 . _ يبدأ بحرف/رقم)", roleRequired: "الدور مطلوب", displayNameRequired: "الاسم المعروض مطلوب", linkedRequired: "الجهة المرتبطة مطلوبة لهذا الدور" },
    errors: { RVB_TAG_REQUIRED: "المعرّف مطلوب", RVB_TAG_INVALID: "المعرّف غير صالح", RVB_TAG_ALREADY_EXISTS: "المعرّف موجود مسبقاً", RVB_TAG_IMMUTABLE: "المعرّف غير قابل للتغيير", RVB_FIELD_NOT_ALLOWED: "حقل غير مسموح", RVB_DISPLAY_NAME_REQUIRED: "الاسم المعروض مطلوب", RVB_ROLE_INVALID: "دور غير صالح", RVB_ENTITY_ALREADY_LINKED: "هذه الجهة لديها حساب RVB بالفعل", RVB_ENTITY_ROLE_MISMATCH: "عدم تطابق الدور ونوع الجهة", RVB_LINKED_ENTITY_INACTIVE: "أعد تفعيل كيان H.S.H قبل منحه وصول البوابة.", RVB_LINKED_ENTITY_NOT_FOUND: "الجهة المرتبطة غير موجودة", RVB_LINKED_ENTITY_REQUIRED: "الجهة المرتبطة مطلوبة لهذا الدور", RVB_ACCOUNT_NOT_FOUND: "الحساب غير موجود", RVB_PASSWORD_REQUIRED: "كلمة المرور مطلوبة", RVB_PASSWORD_TOO_SHORT: "8 أحرف على الأقل", RVB_PASSWORD_TOO_LONG: "128 حرفاً على الأكثر", RVB_PASSWORD_CONFIRM_MISMATCH: "كلمتا المرور غير متطابقتين", RVB_PASSWORD_ALREADY_SET: "كلمة المرور مضبوطة مسبقاً", RVB_PASSWORD_NOT_SET: "كلمة المرور غير مضبوطة", RVB_UNAUTHENTICATED: "يلزم تسجيل الدخول", RVB_FORBIDDEN: "صلاحيات غير كافية" },
    search: "ابحث عن الحسابات",
    linkedNone: "—",
    setInitial: { title: "تعيين كلمة المرور الأولية", desc: "تعيين كلمة مرور مؤقتة. يجب على المستخدم تغييرها عند أول تسجيل دخول.", password: "كلمة المرور الجديدة", confirm: "تأكيد", hint: "8–128 حرفاً", cancel: "إلغاء", confirmBtn: "تعيين", setting: "جارٍ التعيين...", credentialsNotConfigured: "بيانات الاعتماد غير مضبوطة", credentialsConfigured: "بيانات الاعتماد مضبوطة", mustChange: "يجب التغيير عند أول دخول" },
  },
} as const;

function formatDateForDisplay(ts: number | null | undefined, lang: Language): string {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    const locale = lang === "ar" ? "ar-DZ-u-nu-latn" : lang === "fr" ? "fr-FR" : "en-GB";
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", numberingSystem: "latn" } as any).format(d);
  } catch { return formatTimestampToDisplay(ts); }
}

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function RoleBadge({ role, label }: { role: string; label: string }) {
  return <span className={`${styles.badge} ${styles.badgeRole}`}>{label}</span>;
}

function RvbAccountsInner() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [accounts, setAccounts] = useState<RvbAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createRole, setCreateRole] = useState<string>("");
  const [createTag, setCreateTag] = useState("");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createLinkedId, setCreateLinkedId] = useState<string>("");
  const [createPassword, setCreatePassword] = useState("");
  const [createConfirm, setCreateConfirm] = useState("");
  const [showCreatePwd, setShowCreatePwd] = useState(false);
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  // Set initial password
  const [setPwdTarget, setSetPwdTarget] = useState<RvbAccount | null>(null);
  const [setPwd, setSetPwd] = useState("");
  const [setPwdConfirm, setSetPwdConfirm] = useState("");
  const [showSetPwd, setShowSetPwd] = useState(false);
  const [showSetPwdConfirm, setShowSetPwdConfirm] = useState(false);
  const [setPwdError, setSetPwdError] = useState("");
  const [settingPwd, setSettingPwd] = useState(false);

  // Entities - now fetched via backend linkable endpoint, not Dexie
  const [linkableEntities, setLinkableEntities] = useState<any[]>([]);
  const [linkableLoading, setLinkableLoading] = useState(false);
  const [linkableLoadFailed, setLinkableLoadFailed] = useState(false);
  const [linkableRetryKey, setLinkableRetryKey] = useState(0);

  // Details
  const [detailsAccount, setDetailsAccount] = useState<RvbAccount | null>(null);

  // Protected modals
  const [archiveTarget, setArchiveTarget] = useState<RvbAccount | null>(null);
  const [disableTarget, setDisableTarget] = useState<RvbAccount | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<RvbAccount | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const lang = (settings.language as Language) || "en";
  const t = (TR as any)[lang] ?? TR.en;
  const isRtl = lang === "ar";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const accs = await rvbAccountService.getAll().catch(() => { throw new Error("FETCH_FAIL"); });
      setAccounts(Array.isArray(accs) ? accs : []);
    } catch (e: any) {
      const msg = e?.message === "FETCH_FAIL" ? t.failedLoad : (e?.message || t.failedLoad);
      setError(msg);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [t.failedLoad]);

  useEffect(() => {
    rvbUiPreferencesService.get().then((s) => { if (s) setSettings(s); });
    rvbConfigService.get().then((c) => { if (c?.currency) setSettings((prev:any)=>({...prev, currency:c.currency})); }).catch(()=>{});
    const h = (e: Event) => {
      const ce = e as CustomEvent<Settings>;
      if (ce?.detail) setSettings(ce.detail);
      else rvbUiPreferencesService.get().then((s) => { if (s) setSettings(s); });
    };
    window.addEventListener(RVB_UI_PREFERENCES_EVENT, h);
    window.addEventListener("storage", h);
    return () => { window.removeEventListener(RVB_UI_PREFERENCES_EVENT, h); window.removeEventListener("storage", h); };
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Keep KPI translations reactive when language changes after initial load failure
  useEffect(() => {
    if (error === "Failed to load accounts" || error === "Échec du chargement des comptes" || error === "فشل تحميل الحسابات") {
      // don't auto-reload; just keep message; will update on next load
    }
  }, [lang]);

  const linkedMap = useMemo(() => {
    // Now relies on backend enrichment linkedEntityDisplayName rather than local Dexie maps
    const m = new Map<string, { name: string; type: string }>();
    for (const a of accounts) {
      if (a.linkedEntityType && a.linkedEntityId && (a as any).linkedEntityDisplayName) {
        m.set(`${a.linkedEntityType}:${a.linkedEntityId}`, { name: (a as any).linkedEntityDisplayName, type: a.linkedEntityType });
      }
    }
    return m;
  }, [accounts]);

  const linkedIdsUsed = useMemo(() => {
    const set = new Set<string>();
    for (const a of accounts) {
      if (a.linkedEntityType && a.linkedEntityId) set.add(`${a.linkedEntityType}:${a.linkedEntityId}`);
    }
    return set;
  }, [accounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (roleFilter && a.role !== roleFilter) return false;
      if (statusFilter) {
        if (statusFilter === "pending") {
          if (a.onboardingStatus !== "pending") return false;
        } else if (a.status !== statusFilter) return false;
      }
      if (!q) return true;
      const hay = `${a.displayName} ${a.tag} ${a.role}`.toLowerCase();
      if (hay.includes(q)) return true;
      const normalizedQ = q.startsWith("@") ? q.slice(1) : q;
      if (normalizedQ && `@${a.tag}`.toLowerCase().includes(`@${normalizedQ}`)) return true;
      return false;
    });
  }, [accounts, search, roleFilter, statusFilter]);

  const kpi = useMemo(() => {
    const total = accounts.length;
    const active = accounts.filter((a) => a.status === "active").length;
    const pending = accounts.filter((a) => a.onboardingStatus === "pending").length;
    const archived = accounts.filter((a) => a.status === "archived").length;
    return { total, active, pending, archived };
  }, [accounts]);

  // Fetch linkable entities through the account service so failures are distinguishable from an empty result.
  useEffect(() => {
    if (!createRole || !["worker","supplier","customer"].includes(createRole)) {
      setLinkableEntities([]);
      setLinkableLoading(false);
      setLinkableLoadFailed(false);
      return;
    }
    let cancelled = false;
    setLinkableEntities([]);
    setLinkableLoading(true);
    setLinkableLoadFailed(false);
    void rvbAccountService.getLinkableEntities(createRole as "worker" | "supplier" | "customer")
      .then((entities) => { if (!cancelled) setLinkableEntities(entities); })
      .catch(() => { if (!cancelled) setLinkableLoadFailed(true); })
      .finally(() => { if (!cancelled) setLinkableLoading(false); });
    return () => { cancelled = true; };
  }, [createRole, linkableRetryKey]);

  const entityOptions = useMemo(() => {
    if (!createRole) return [];
    // linkableEntities already filtered to available (not linked) by backend
    return linkableEntities.map((e:any)=>({ value:e.id, label:e.name, sublabel: e.type || createRole }));
  }, [createRole, linkableEntities, linkedIdsUsed]);

  const roleOptions = useMemo(() => {
    return (RVB_ROLES as readonly string[]).map((r) => ({ value: r, label: (t.roles as any)[r] ?? r }));
  }, [t.roles]);

  const statusOptions = useMemo(() => [
    { value: "", label: t.allStatuses },
    { value: "active", label: t.statuses.active },
    { value: "pending", label: t.filters.pendingOnboarding },
    { value: "archived", label: t.statuses.archived },
    { value: "disabled", label: t.statuses.disabled },
  ], [t]);

  const handleSelectEntity = (id: string) => {
    setCreateLinkedId(id);
    if (!id) return;
    const ent = linkableEntities.find((e:any)=>e.id===id);
    const name = ent?.name ?? "";
    if (name) setCreateDisplayName(name);
  };

  const handleCreate = async () => {
    setCreateError("");
    const role = createRole.trim();
    if (!role) { setCreateError(t.validation.roleRequired); return; }
    const tagNorm = normalizeTag(createTag);
    if (!tagNorm) { setCreateError(t.validation.tagRequired); return; }
    if (!isValidTag(tagNorm)) { setCreateError(t.validation.tagInvalid); return; }
    const dn = createDisplayName.trim();
    if (!dn) { setCreateError(t.validation.displayNameRequired); return; }
    const needsLink = role === "worker" || role === "supplier" || role === "customer";
    if (needsLink && !createLinkedId) { setCreateError(t.validation.linkedRequired); return; }
    if (!createPassword) { setCreateError(t.errors.RVB_PASSWORD_REQUIRED || "Password is required"); return; }
    if (createPassword.length < 8) { setCreateError(t.errors.RVB_PASSWORD_TOO_SHORT || "Password too short"); return; }
    if (createPassword.length > 128) { setCreateError(t.errors.RVB_PASSWORD_TOO_LONG || "Password too long"); return; }
    if (createPassword !== createConfirm) { setCreateError(t.errors.RVB_PASSWORD_CONFIRM_MISMATCH || "Passwords do not match"); return; }

    setCreating(true);
    try {
      const payload: any = {
        tag: tagNorm,
        displayName: dn,
        role,
        linkedEntityType: needsLink ? role : null,
        linkedEntityId: needsLink ? createLinkedId : null,
        password: createPassword,
        confirmPassword: createConfirm,
      };
      await rvbAccountService.create(payload);
      setShowCreate(false);
      setCreateRole("");
      setCreateTag("");
      setCreateDisplayName("");
      setCreateLinkedId("");
      setCreatePassword("");
      setCreateConfirm("");
      setCreateError("");
      await load();
    } catch (e: any) {
      const code = e?.data?.code || e?.code || e?.message || "";
      const translated = (t.errors as any)[code] || code || e?.data?.message || e?.message || "Failed";
      setCreateError(translated);
    } finally {
      setCreating(false);
    }
  };

  const handleSetInitialPassword = async () => {
    if (!setPwdTarget) return;
    setSetPwdError("");
    if (!setPwd) { setSetPwdError(t.errors.RVB_PASSWORD_REQUIRED || "Password required"); return; }
    if (setPwd.length < 8) { setSetPwdError(t.errors.RVB_PASSWORD_TOO_SHORT || "Too short"); return; }
    if (setPwd.length > 128) { setSetPwdError(t.errors.RVB_PASSWORD_TOO_LONG || "Too long"); return; }
    if (setPwd !== setPwdConfirm) { setSetPwdError(t.errors.RVB_PASSWORD_CONFIRM_MISMATCH || "Mismatch"); return; }
    setSettingPwd(true);
    try {
      await rvbAccountService.setInitialPassword(setPwdTarget.id, setPwd, setPwdConfirm);
      setSetPwdTarget(null);
      setSetPwd("");
      setSetPwdConfirm("");
      setSetPwdError("");
      await load();
      // also refresh details if open
      if (detailsAccount && detailsAccount.id === setPwdTarget.id) {
        const fresh = await rvbAccountService.getById(setPwdTarget.id).catch(() => null);
        if (fresh) setDetailsAccount(fresh);
      }
    } catch (e: any) {
      const code = e?.data?.code || e?.code || "";
      const translated = (t.errors as any)[code] || code || e?.message || "Failed";
      setSetPwdError(translated);
    } finally {
      setSettingPwd(false);
    }
  };

  const doArchive = async () => {
    if (!archiveTarget) return;
    setActionLoading(true);
    try {
      await rvbAccountService.archive(archiveTarget.id);
      setArchiveTarget(null);
      setDetailsAccount(null);
      await load();
    } catch (e: any) {
      setError(e?.data?.code || e?.message || t.failedLoad);
    } finally { setActionLoading(false); }
  };

  const doDisable = async () => {
    if (!disableTarget) return;
    setActionLoading(true);
    try {
      await rvbAccountService.disable(disableTarget.id);
      setDisableTarget(null);
      setDetailsAccount(null);
      await load();
    } catch (e: any) {
      setError(e?.data?.code || e?.message || t.failedLoad);
    } finally { setActionLoading(false); }
  };

  const doReactivate = async () => {
    if (!reactivateTarget) return;
    setActionLoading(true);
    try {
      await rvbAccountService.reactivate(reactivateTarget.id);
      setReactivateTarget(null);
      setDetailsAccount(null);
      await load();
    } catch (e: any) {
      setError(e?.data?.code || e?.message || t.failedLoad);
    } finally { setActionLoading(false); }
  };

  const getLinkedDisplay = (a: RvbAccount) => {
    if (!a.linkedEntityType || !a.linkedEntityId) return { typeLabel: t.management, name: t.linkedNone };
    const enriched = (a as any).linkedEntityDisplayName as string | null | undefined;
    if (enriched) {
      const typeLabel = a.linkedEntityType.charAt(0).toUpperCase() + a.linkedEntityType.slice(1);
      return { typeLabel, name: enriched };
    }
    const key = `${a.linkedEntityType}:${a.linkedEntityId}`;
    const entry = linkedMap.get(key);
    if (entry) return { typeLabel: entry.type, name: entry.name };
    const typeLabel = a.linkedEntityType.charAt(0).toUpperCase() + a.linkedEntityType.slice(1);
    return { typeLabel, name: a.linkedEntityId.slice(0, 8) + "…" };
  };

  const needsLinkForRole = (r: string) => r === "worker" || r === "supplier" || r === "customer";
  const isCreateLinkedRole = needsLinkForRole(createRole);

  const createTagNormalized = useMemo(() => normalizeTag(createTag), [createTag]);
  const isCreateTagValid = useMemo(() => {
    const t = createTagNormalized;
    return !!t && isValidTag(t);
  }, [createTagNormalized]);
  const isCreatePasswordValid = createPassword.length >= 8 && createPassword.length <= 128;
  const isCreateConfirmValid = !!createConfirm && createPassword === createConfirm;
  const isCreateFormValid = useMemo(() => {
    if (creating) return false;
    if (!createRole) return false;
    if (!createDisplayName.trim()) return false;
    if (!isCreateTagValid) return false;
    if (!isCreatePasswordValid) return false;
    if (!isCreateConfirmValid) return false;
    if (isCreateLinkedRole && !createLinkedId) return false;
    return true;
  }, [creating, createRole, createDisplayName, isCreateTagValid, isCreatePasswordValid, isCreateConfirmValid, isCreateLinkedRole, createLinkedId]);

  // Background scroll lock while create modal is open — restore on close/unmount, compensate scrollbar to avoid horizontal jump
  useEffect(() => {
    if (!showCreate) return;
    const body = document.body;
    const html = document.documentElement;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - html.clientWidth;
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    return () => {
      body.style.overflow = prevBodyOverflow;
      html.style.overflow = prevHtmlOverflow;
      body.style.paddingRight = prevBodyPaddingRight;
    };
  }, [showCreate]);

  // Escape closes modal unless submitting
  useEffect(() => {
    if (!showCreate) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !creating) setShowCreate(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showCreate, creating]);

  return (
    <RvbShell activePage="accounts">
      <div className={styles.rvbAccountsRoot} dir={isRtl ? "rtl" : "ltr"}>
        {/* Header — managed by RvbShell CompactHeader, but keep spec subtitle visibility inside page for non-shell? Shell already shows, so keep minimal */}
        <div className={styles.headerWrap}>
          <h1 className={styles.headerTitle}>{t.headerTitle}</h1>
          <p className={styles.headerSubtitle}>{t.headerSubtitle}</p>
        </div>

        {/* KPI */}
        <div className={styles.kpiRow}>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "var(--accent-soft)", border: "1px solid var(--accent-ring)", color: "var(--accent)", flex: "0 0 44px" }}><ShieldCheck size={20} strokeWidth={2} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.kpi.total}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{loading ? "—" : String(kpi.total)}</strong></div>
          </div>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(58,125,82,0.10)", border: "1px solid rgba(58,125,82,0.18)", color: "#3A7D52", flex: "0 0 44px" }}><ShieldCheck size={20} strokeWidth={2} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.kpi.active}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{loading ? "—" : String(kpi.active)}</strong></div>
          </div>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(175,149,75,0.11)", border: "1px solid rgba(175,149,75,0.16)", color: "#8a6d1b", flex: "0 0 44px" }}><AlertTriangle size={20} strokeWidth={2} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.kpi.pending}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{loading ? "—" : String(kpi.pending)}</strong></div>
          </div>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(120,120,130,0.10)", border: "1px solid rgba(120,120,130,0.18)", color: "var(--muted)", flex: "0 0 44px" }}><Archive size={20} strokeWidth={2} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.kpi.archived}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{loading ? "—" : String(kpi.archived)}</strong></div>
          </div>
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <span aria-hidden="true"><Search size={18} strokeWidth={2} /></span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.searchPlaceholder}
              aria-label={t.search}
            />
          </div>

          <div className={styles.filterGroup}>
            <div style={{ minWidth: 160 }}>
              <StyledSelect
                value={roleFilter}
                onChange={setRoleFilter}
                options={[{ value: "", label: t.allRoles }, ...roleOptions]}
                placeholder={t.allRoles}
                ariaLabel={t.allRoles}
              />
            </div>
            <div style={{ minWidth: 160 }}>
              <StyledSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={statusOptions}
                placeholder={t.allStatuses}
                ariaLabel={t.allStatuses}
              />
            </div>
          </div>

          <button type="button" className={styles.primaryButton} onClick={() => { setCreateError(""); setShowCreate(true); }}>
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            {t.createAccount}
          </button>
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        {/* Table */}
        <div className={styles.card}>
          {loading ? (
            <div className={styles.loadingBox}>
              <div className={styles.loadingPulse} />
              <strong style={{ fontSize: 13, color: "var(--muted)" }}>{t.loading}</strong>
            </div>
          ) : filtered.length === 0 && accounts.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon} aria-hidden="true"><ShieldCheck size={26} strokeWidth={2} /></div>
              <h3 className={styles.emptyTitle}>{t.emptyTitle}</h3>
              <p className={styles.emptyDesc}>{t.emptyDesc}</p>
              <button type="button" className={styles.primaryButton} onClick={() => setShowCreate(true)}>
                <Plus size={16} strokeWidth={2} aria-hidden="true" />
                {t.createAccount}
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon} aria-hidden="true"><Search size={22} strokeWidth={2} /></div>
              <h3 className={styles.emptyTitle} style={{ fontSize: 15 }}>{lang === "fr" ? "Aucun résultat" : lang === "ar" ? "لا نتائج" : "No results"}</h3>
              <p className={styles.emptyDesc} style={{ fontSize: 12 }}>{lang === "fr" ? "Aucun compte ne correspond aux filtres actuels." : lang === "ar" ? "لا يوجد حساب يطابق الفلاتر الحالية." : "No account matches the current filters."}</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table} role="table" aria-label={t.headerTitle}>
                <thead className={styles.tableHead}>
                  <tr>
                    <th style={{ width: "20%" }}>{t.table.account}</th>
                    <th style={{ width: "12%" }}>{t.table.tag}</th>
                    <th style={{ width: "10%" }}>{t.table.role}</th>
                    <th style={{ width: "15%" }}>{t.table.linkedEntity}</th>
                    <th style={{ width: "9%" }}>{t.table.status}</th>
                    <th style={{ width: "10%" }}>{t.table.onboarding}</th>
                    <th style={{ width: "13%" }}>{t.table.lastActivity}</th>
                    <th style={{ width: "11%", textAlign: isRtl ? "start" : "end" }}>{t.table.actions}</th>
                  </tr>
                </thead>
                <tbody className={styles.tableBody}>
                  {filtered.map((a) => {
                    const linked = getLinkedDisplay(a);
                    const roleLabel = (t.roles as any)[a.role] ?? a.role;
                    const statusLabel = (t.statuses as any)[a.status] ?? a.status;
                    const onboardingLabel = (t.onboarding as any)[a.onboardingStatus] ?? a.onboardingStatus;
                    return (
                      <tr key={a.id}>
                        <td>
                          <div className={styles.accountCell}>
                            <span className={styles.avatar} aria-hidden="true">
                              {a.profilePicture ? <img src={a.profilePicture} alt="" /> : initials(a.displayName)}
                            </span>
                            <span className={styles.accountName}>
                              <strong title={a.displayName}>{a.displayName}</strong>
                              <small style={{ display: "none" }}>{a.id}</small>
                            </span>
                          </div>
                        </td>
                        <td><span className={styles.tag}>@{a.tag}</span></td>
                        <td><RoleBadge role={a.role} label={roleLabel} /></td>
                        <td>
                          <span className={styles.linkedEntity}>
                            <strong>{linked.typeLabel}</strong>
                            <small title={linked.name}>{linked.name}</small>
                          </span>
                        </td>
                        <td>
                          <span className={`${styles.badge} ${a.status === "active" ? styles.badgeStatusActive : a.status === "archived" ? styles.badgeStatusArchived : styles.badgeStatusDisabled}`}>
                            {statusLabel}
                          </span>
                        </td>
                        <td>
                          <span className={`${styles.badge} ${a.onboardingStatus === "pending" ? styles.badgeOnboardingPending : styles.badgeOnboardingComplete}`}>
                            {onboardingLabel}
                          </span>
                        </td>
                        <td style={{ color: "var(--muted)", fontSize: 12 }} title={a.lastLoginAt ? formatDateForDisplay(a.lastLoginAt, lang) : undefined}>{a.lastLoginAt ? formatDateForDisplay(a.lastLoginAt, lang) : "—"}</td>
                        <td>
                          <div className={styles.actionsCell}>
                            <button type="button" className={styles.viewButton} onClick={() => setDetailsAccount(a)} aria-label={`${t.view} ${a.displayName}`}>
                              <Eye size={14} strokeWidth={2} aria-hidden="true" />
                              {t.view}
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

      {/* Create Modal */}
      {showCreate && (
        <div className={styles.backdrop} onClick={() => { if (!creating) setShowCreate(false); }}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="create-title" onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 id="create-title">{t.create.title}</h2>
              <button type="button" className={styles.closeButton} onClick={() => setShowCreate(false)} disabled={creating} aria-label={t.actions.close || "Close"}><X size={16} strokeWidth={2} /></button>
            </div>
            <div className={styles.formBody}>
              <div className={styles.field}>
                <label htmlFor="create-role">{t.create.role} <small style={{ color: "var(--muted)", fontWeight: 600 }}> *</small></label>
                <StyledSelect
                  value={createRole}
                  onChange={(v) => { setCreateRole(v); setCreateLinkedId(""); if (needsLinkForRole(v)) { /* keep displayName for autofill */ } else { /* management keep editable */ } }}
                  options={[{ value: "", label: t.create.selectRole }, ...roleOptions]}
                  placeholder={t.create.selectRole}
                  ariaLabel={t.create.role}
                />
              </div>

              {isCreateLinkedRole && (
                <div className={styles.field}>
                  <label htmlFor="create-linked">{t.create.linkedEntity} <small style={{ color: "var(--muted)", fontWeight: 600 }}> *</small></label>
                  <StyledSelect
                    value={createLinkedId}
                    onChange={handleSelectEntity}
                    options={entityOptions.length ? entityOptions : [{ value: "", label: t.create.selectEntity }]}
                    placeholder={t.create.selectEntity}
                    ariaLabel={t.create.linkedEntity}
                    disabled={linkableLoading || linkableLoadFailed}
                  />
                  {linkableLoading ? <small className={styles.hint} aria-live="polite">{t.create.loadingEntities}</small> : null}
                  {linkableLoadFailed ? (
                    <div className={styles.formError} role="alert" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <span>{t.create.linkableLoadError}</span>
                      <button type="button" className={styles.secondaryButton} onClick={() => setLinkableRetryKey((key) => key + 1)}>{t.create.retry}</button>
                    </div>
                  ) : null}
                  {!linkableLoading && !linkableLoadFailed && entityOptions.length === 0 && createRole ? <small className={styles.hint}>{t.create.noEntities}</small> : null}
                </div>
              )}

              <div className={styles.field}>
                <label htmlFor="create-displayName">{t.create.displayName} <small style={{ color: "var(--muted)", fontWeight: 600 }}> *</small></label>
                <input
                  id="create-displayName"
                  value={createDisplayName}
                  onChange={(e) => setCreateDisplayName(e.target.value)}
                  placeholder={isCreateLinkedRole ? t.create.autoFilled : "e.g., Ahmed Manager"}
                  readOnly={isCreateLinkedRole && !!createLinkedId}
                  style={isCreateLinkedRole && !!createLinkedId ? { background: "var(--panel-hover)", cursor: "not-allowed" } : undefined}
                  title={isCreateLinkedRole && !!createLinkedId ? t.create.autoFilled : undefined}
                  autoComplete="off"
                />
                {isCreateLinkedRole && !!createLinkedId && <small className={styles.hint}>{t.create.autoFilled}</small>}
              </div>

              <div className={styles.field}>
                <label htmlFor="create-tag">{t.create.tag} <small style={{ color: "var(--muted)", fontWeight: 600 }}> *</small></label>
                <div className={styles.inputWithPrefix}>
                  <span aria-hidden="true">@</span>
                  <input
                    id="create-tag"
                    value={createTag}
                    onChange={(e) => setCreateTag(e.target.value)}
                    placeholder="ahmed.b"
                    dir="ltr"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    autoComplete="off"
                    inputMode="text"
                  />
                </div>
                <small className={styles.hint}>{t.create.tagHint}</small>
              </div>

              <div className={styles.field}>
                <label htmlFor="create-password">{t.create.password} <small style={{ color: "var(--muted)", fontWeight: 600 }}> *</small></label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <input
                    id="create-password"
                    type={showCreatePwd ? "text" : "password"}
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="••••••••"
                    dir="ltr"
                    autoComplete="new-password"
                    style={{ paddingInlineEnd: 70 }}
                  />
                  <button type="button" onClick={() => setShowCreatePwd((v) => !v)} aria-label={showCreatePwd ? t.create.hide : t.create.show} style={{ position: "absolute", insetInlineEnd: 6, minHeight: 28, padding: "0 8px", display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid var(--border)", borderRadius: 6, background: "var(--panel)", color: "var(--muted)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {showCreatePwd ? <EyeOff size={14} strokeWidth={2} /> : <Eye size={14} strokeWidth={2} />}
                    {showCreatePwd ? t.create.hide : t.create.show}
                  </button>
                </div>
                <small className={styles.hint}>{t.create.passwordHint}</small>
              </div>

              <div className={styles.field}>
                <label htmlFor="create-confirm">{t.create.confirmPassword} <small style={{ color: "var(--muted)", fontWeight: 600 }}> *</small></label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <input
                    id="create-confirm"
                    type={showCreateConfirm ? "text" : "password"}
                    value={createConfirm}
                    onChange={(e) => setCreateConfirm(e.target.value)}
                    placeholder="••••••••"
                    dir="ltr"
                    autoComplete="new-password"
                    style={{ paddingInlineEnd: 70 }}
                  />
                  <button type="button" onClick={() => setShowCreateConfirm((v) => !v)} aria-label={showCreateConfirm ? t.create.hide : t.create.show} style={{ position: "absolute", insetInlineEnd: 6, minHeight: 28, padding: "0 8px", display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid var(--border)", borderRadius: 6, background: "var(--panel)", color: "var(--muted)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {showCreateConfirm ? <EyeOff size={14} strokeWidth={2} /> : <Eye size={14} strokeWidth={2} />}
                    {showCreateConfirm ? t.create.hide : t.create.show}
                  </button>
                </div>
              </div>

              {createError && <div className={styles.formError} role="alert">{createError}</div>}
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.secondaryButton} onClick={() => setShowCreate(false)} disabled={creating}>{t.create.cancel}</button>
              <button type="button" className={styles.primaryButton} onClick={handleCreate} disabled={!isCreateFormValid} aria-disabled={!isCreateFormValid} style={!isCreateFormValid ? { cursor: "not-allowed" } : undefined}>{creating ? t.create.creating : t.create.create}</button>
            </div>
          </section>
        </div>
      )}

      {/* Details Drawer */}
      {detailsAccount && (
        <div className={styles.drawerBackdrop} onClick={() => setDetailsAccount(null)}>
          <section className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="details-title" onClick={(e) => e.stopPropagation()} dir={isRtl ? "rtl" : "ltr"}>
            <div className={styles.drawerHeader}>
              <h2 id="details-title" className={styles.drawerTitle}>{t.details.title}</h2>
              <button type="button" className={styles.closeButton} onClick={() => setDetailsAccount(null)} aria-label="Close"><X size={16} strokeWidth={2} /></button>
            </div>
            <div className={styles.drawerBody}>
              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>{t.details.identity}</h3>
                <div className={styles.identityCard}>
                  <span className={styles.identityAvatar} aria-hidden="true">
                    {detailsAccount.profilePicture ? <img src={detailsAccount.profilePicture} alt="" /> : initials(detailsAccount.displayName)}
                  </span>
                  <span className={styles.identityInfo}>
                    <strong>{detailsAccount.displayName}</strong>
                    <span className={styles.tag} style={{ fontSize: 13 }}>@{detailsAccount.tag}</span>
                    <span className={`${styles.badge} ${styles.badgeRole}`} style={{ alignSelf: "flex-start", marginTop: 4 }}>{(t.roles as any)[detailsAccount.role] ?? detailsAccount.role}</span>
                  </span>
                </div>
                <div className={styles.detailGrid}>
                  <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.displayName}</span><span className={styles.detailValue}>{detailsAccount.displayName}</span></div>
                  <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.tag}</span><span className={styles.detailValue} dir="ltr">@{detailsAccount.tag}</span></div>
                  <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.role}</span><span className={styles.detailValue}>{(t.roles as any)[detailsAccount.role] ?? detailsAccount.role}</span></div>
                </div>
              </div>

              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>{t.details.link}</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.linkedEntityType}</span><span className={styles.detailValue}>{detailsAccount.linkedEntityType ? (detailsAccount.linkedEntityType.charAt(0).toUpperCase() + detailsAccount.linkedEntityType.slice(1)) : t.management}</span></div>
                  <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.linkedEntityName}</span>
                    <span className={styles.detailValueWrap} title={detailsAccount.linkedEntityId || t.linkedNone}>
                      {(() => {
                        if (!detailsAccount.linkedEntityType || !detailsAccount.linkedEntityId) return t.linkedNone;
                        const linked = getLinkedDisplay(detailsAccount);
                        return `${linked.name} (${linked.typeLabel})`;
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>{t.details.access}</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.status}</span><span className={`${styles.badge} ${detailsAccount.status === "active" ? styles.badgeStatusActive : detailsAccount.status === "archived" ? styles.badgeStatusArchived : styles.badgeStatusDisabled}`} style={{ fontSize: 11 }}>{(t.statuses as any)[detailsAccount.status] ?? detailsAccount.status}</span></div>
                  <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.onboardingStatus}</span><span className={`${styles.badge} ${detailsAccount.onboardingStatus === "pending" ? styles.badgeOnboardingPending : styles.badgeOnboardingComplete}`} style={{ fontSize: 11 }}>{(t.onboarding as any)[detailsAccount.onboardingStatus] ?? detailsAccount.onboardingStatus}</span></div>
                  <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.created}</span><span className={styles.detailValue}>{formatDateForDisplay(detailsAccount.createdAt, lang)}</span></div>
                  <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.lastLogin}</span><span className={styles.detailValue}>{detailsAccount.lastLoginAt ? formatDateForDisplay(detailsAccount.lastLoginAt, lang) : "—"}</span></div>
                </div>
              </div>

              {/* Credentials status */}
              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>{lang === "fr" ? "Identifiants" : lang === "ar" ? "بيانات الاعتماد" : "Credentials"}</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>{(detailsAccount as any).passwordHash === null || (detailsAccount as any).passwordHash === undefined ? (t as any).setInitial.credentialsNotConfigured : (t as any).setInitial.credentialsConfigured}</span>
                    {(detailsAccount as any).mustChangePassword ? <span className={`${styles.badge} ${styles.badgeOnboardingPending}`} style={{ fontSize: 10 }}>{(t as any).setInitial.mustChange}</span> : null}
                  </div>
                  {(!(detailsAccount as any).passwordHash) && (
                    <button type="button" className={styles.primaryButton} style={{ minHeight: 36, fontSize: 12 }} onClick={() => { setSetPwdTarget(detailsAccount); setSetPwd(""); setSetPwdConfirm(""); setSetPwdError(""); }}>
                      <KeyRound size={14} strokeWidth={2} />
                      {(t as any).setInitial.title}
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.drawerActions}>
                {detailsAccount.status === "active" && (
                  <>
                    <button type="button" className={`${styles.actionButton} ${styles.actionDanger}`} onClick={() => setArchiveTarget(detailsAccount)}><Archive size={14} strokeWidth={2} />{t.actions.archive}</button>
                    <button type="button" className={`${styles.actionButton} ${styles.actionDanger}`} onClick={() => setDisableTarget(detailsAccount)}><Ban size={14} strokeWidth={2} />{t.actions.disable}</button>
                  </>
                )}
                {(detailsAccount.status === "archived" || detailsAccount.status === "disabled") && (
                  <button type="button" className={styles.actionButton} onClick={() => setReactivateTarget(detailsAccount)}><ArchiveRestore size={14} strokeWidth={2} />{t.actions.reactivate}</button>
                )}
                <button type="button" className={styles.actionButton} onClick={() => setDetailsAccount(null)} style={{ marginInlineStart: "auto" }}>{t.actions.close}</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Archive confirmation */}
      <ProtectedDeleteModal
        isOpen={!!archiveTarget}
        title={t.archiveConfirm.title}
        entityName={archiveTarget ? `${archiveTarget.displayName} @${archiveTarget.tag}` : undefined}
        description={t.archiveConfirm.desc}
        warning={t.archiveConfirm.warning}
        confirmLabel={t.actions.archive}
        cancelLabel={t.actions.cancel}
        deletingLabel={t.actions.archive}
        eyebrowLabel={lang === "fr" ? "ACTION PROTÉGÉE" : lang === "ar" ? "إجراء محمي" : "PROTECTED ACTION"}
        countdownWaitingLabel={lang === "fr" ? "Confirmer l’archivage" : lang === "ar" ? "تأكيد الأرشفة" : "Confirm archive"}
        isDeleting={actionLoading}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={doArchive}
        resetKey={archiveTarget?.id ?? null}
      />

      <ProtectedDeleteModal
        isOpen={!!disableTarget}
        title={t.disableConfirm.title}
        entityName={disableTarget ? `${disableTarget.displayName} @${disableTarget.tag}` : undefined}
        description={t.disableConfirm.desc}
        warning={t.disableConfirm.warning}
        confirmLabel={t.actions.disable}
        cancelLabel={t.actions.cancel}
        deletingLabel={t.actions.disable}
        eyebrowLabel={lang === "fr" ? "ACTION PROTÉGÉE" : lang === "ar" ? "إجراء محمي" : "PROTECTED ACTION"}
        countdownWaitingLabel={lang === "fr" ? "Confirmer la désactivation" : lang === "ar" ? "تأكيد التعطيل" : "Confirm disable"}
        isDeleting={actionLoading}
        onCancel={() => setDisableTarget(null)}
        onConfirm={doDisable}
        resetKey={disableTarget?.id ?? null}
      />

      {/* Reactivate simple */}
      {reactivateTarget && (
        <div className={styles.backdrop} onClick={() => setReactivateTarget(null)}>
          <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, textAlign: "center" as any, padding: 20 }}>
            <div style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent-ring)", margin: "0 auto 10px" }}><ArchiveRestore size={20} strokeWidth={2} /></div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{t.actions.reactivate}</h2>
            <p style={{ margin: "8px auto 0", maxWidth: 340, color: "var(--muted)", fontSize: 13 }}>{reactivateTarget.displayName} @{reactivateTarget.tag}</p>
            <p style={{ margin: "8px auto 0", maxWidth: 340, color: "var(--muted)", fontSize: 12 }}>{lang === "fr" ? "Ce compte sera réactivé et retrouvera l’accès." : lang === "ar" ? "سيتم إعادة تفعيل هذا الحساب واستعادة الوصول." : "This account will be reactivated and regain access."}</p>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "center", gap: 8 }}>
              <button type="button" className={styles.secondaryButton} onClick={() => setReactivateTarget(null)} disabled={actionLoading}>{t.actions.cancel}</button>
              <button type="button" className={styles.primaryButton} onClick={doReactivate} disabled={actionLoading}>{actionLoading ? t.create.creating : t.actions.reactivate}</button>
            </div>
          </section>
        </div>
      )}

      {/* Set Initial Password */}
      {setPwdTarget && (
        <div className={styles.backdrop} onClick={() => { if (!settingPwd) setSetPwdTarget(null); }}>
          <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{(t as any).setInitial.title}</h2>
              <button type="button" className={styles.closeButton} onClick={() => setSetPwdTarget(null)} disabled={settingPwd}><X size={16} strokeWidth={2} /></button>
            </div>
            <div className={styles.formBody}>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 12, lineHeight: 1.5 }}>{(t as any).setInitial.desc}</p>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{setPwdTarget.displayName} @{setPwdTarget.tag}</div>
              <div className={styles.field}>
                <label>{(t as any).setInitial.password} *</label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <input type={showSetPwd ? "text" : "password"} value={setPwd} onChange={(e) => setSetPwd(e.target.value)} placeholder="••••••••" dir="ltr" style={{ paddingInlineEnd: 70 }} />
                  <button type="button" onClick={() => setShowSetPwd((v) => !v)} style={{ position: "absolute", insetInlineEnd: 6, minHeight: 28, padding: "0 8px", display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid var(--border)", borderRadius: 6, background: "var(--panel)", color: "var(--muted)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {showSetPwd ? <EyeOff size={14} strokeWidth={2} /> : <Eye size={14} strokeWidth={2} />}
                    {showSetPwd ? (t as any).create.hide : (t as any).create.show}
                  </button>
                </div>
                <small className={styles.hint}>{(t as any).setInitial.hint}</small>
              </div>
              <div className={styles.field}>
                <label>{(t as any).setInitial.confirm} *</label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <input type={showSetPwdConfirm ? "text" : "password"} value={setPwdConfirm} onChange={(e) => setSetPwdConfirm(e.target.value)} placeholder="••••••••" dir="ltr" style={{ paddingInlineEnd: 70 }} />
                  <button type="button" onClick={() => setShowSetPwdConfirm((v) => !v)} style={{ position: "absolute", insetInlineEnd: 6, minHeight: 28, padding: "0 8px", display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid var(--border)", borderRadius: 6, background: "var(--panel)", color: "var(--muted)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {showSetPwdConfirm ? <EyeOff size={14} strokeWidth={2} /> : <Eye size={14} strokeWidth={2} />}
                    {showSetPwdConfirm ? (t as any).create.hide : (t as any).create.show}
                  </button>
                </div>
              </div>
              {setPwdError && <div className={styles.formError}>{setPwdError}</div>}
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.secondaryButton} onClick={() => setSetPwdTarget(null)} disabled={settingPwd}>{(t as any).setInitial.cancel}</button>
              <button type="button" className={styles.primaryButton} onClick={handleSetInitialPassword} disabled={settingPwd}>{settingPwd ? (t as any).setInitial.setting : (t as any).setInitial.confirmBtn}</button>
            </div>
          </section>
        </div>
      )}
    </RvbShell>
  );
}

export default function RvbAccountsPage() {
  return (
    <RvbAuthGuard>
      <RvbAccountsGuard>
        <RvbAccountsInner />
      </RvbAccountsGuard>
    </RvbAuthGuard>
  );
}

