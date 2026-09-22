"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import RvbShell from "../../../src/components/rvb/RvbShell";
import StyledSelect from "../../../src/components/common/StyledSelect";
import { settingsService } from "../../../src/services/settings.service";
import { DEFAULT_SETTINGS, formatCurrency, SETTINGS_EVENT } from "../../../src/lib/settings";
import type { Settings, Language } from "../../../src/types/settings/settings";
import { supplierService } from "../../../src/services/supplier.service";
import { supplierEditOperation } from "../../../src/services/operations/supplier-edit.operation";
import { rvbAccountService } from "../../../src/services/rvb-account.service";
import { supplierRequestService, type SupplierRequest } from "../../../src/services/supplier-request.service";
import type { Supplier } from "../../../src/types/entities/supplier";
import type { RvbAccount } from "../../../src/types/rvb/rvb-account";
import { normalizeTag, isValidTag } from "../../../src/types/rvb/rvb-account";
import { useRvbAuth } from "../../../src/contexts/RvbAuthContext";
import RvbAuthGuard from "../../../src/components/rvb/RvbAuthGuard";
import { RvbWorkersGuard } from "../../../src/components/rvb/RvbRoleGuard";
import { db } from "../../../src/lib/database/db";
import type { Payment } from "../../../src/types/entities/payment";
import type { Purchase } from "../../../src/types/entities/purchase";
import {
  Search,
  Plus,
  Truck,
  Eye,
  X,
  Archive,
  Wallet,
  ShieldCheck,
  Link2,
  Unlink,
  KeyRound,
} from "lucide-react";
import styles from "./page.module.css";

const TR: Record<Language, any> = {
  en: {
    headerTitle: "Suppliers",
    headerSubtitle: "Manage supplier profiles, balances, supply history and portal access.",
    kpi: { total: "Total Suppliers", outstanding: "Outstanding Balance", linked: "Portal Access", unlinked: "Unlinked" },
    searchPlaceholder: "Search suppliers by name, phone or @tag",
    allPortal: "All Portal",
    portal: { all: "All", linked: "Linked", notLinked: "Not linked" },
    allStatus: "All Statuses",
    portalStatus: { all: "All", active: "Active", disabled: "Disabled", archived: "Archived" },
    table: { supplier: "Supplier", linkedAccount: "Linked Account", balance: "Current Balance", portalStatus: "Portal Status", access: "Access", linkNow: "Link now" },
    view: "Access",
    addSupplier: "Add Supplier",
    loading: "Loading suppliers...",
    failedLoad: "Failed to load suppliers",
    noSuppliers: "No suppliers found.",
    noSuppliersDesc: "Add your first supplier to begin managing supplies and portal access.",
    create: { title: "Add Supplier", name: "Name", phone: "Phone", address: "Address", identificationNumber: "Identification Number", email: "Email", notes: "Notes", cancel: "Cancel", create: "Create Supplier", creating: "Creating...", required: "Required" },
    edit: { title: "Edit Supplier", save: "Save Changes", saving: "Saving..." },
    details: {
      title: "Supplier Details",
      overview: "Overview",
      purchases: "Purchases",
      payments: "Payments",
      portal: "Portal Access",
      requests: "Requests",
      activity: "Activity",
      identity: "Identity",
      contact: "Contact",
      finance: "Finance",
      archive: "Archive",
      close: "Close",
      balance: "Current Balance",
      name: "Name",
      phone: "Phone",
      email: "Email",
      address: "Address",
      identificationNumber: "Identification Number",
      notes: "Notes",
      notLinked: "Not linked",
      linked: "Linked",
      viewAccount: "View Account",
      unlink: "Unlink",
      linkExisting: "Link Existing Account",
      createAccount: "Create R.V.B Account",
      searchAccounts: "Search by name or @tag",
      confirmLink: "Link account",
      confirmUnlink: "Unlink account",
      unlinkConfirm: "Unlink @tag from Supplier Name?",
      unlinkDesc: "The R.V.B account will remain, but Supplier data will no longer be connected to it.",
      linkConfirm: "Link @tag to Supplier Name?",
      noAccounts: "No eligible unlinked accounts (supplier, active).",
      noPurchases: "No purchases recorded.",
      noPayments: "No payments recorded.",
      noRequests: "No requests yet.",
      noActivity: "No activity yet.",
    },
    validation: { nameRequired: "Name required", phoneRequired: "Phone required" },
    roles: { supplier: "Supplier" },
    statuses: { active: "Active", disabled: "Disabled", archived: "Archived", noAccess: "No access" },
  },
  fr: {
    headerTitle: "Fournisseurs",
    headerSubtitle: "Gérez les profils fournisseurs, soldes, historique et accès portail.",
    kpi: { total: "Total Fournisseurs", outstanding: "Solde Dû", linked: "Accès Portail", unlinked: "Non Liés" },
    searchPlaceholder: "Rechercher par nom, téléphone ou @tag",
    allPortal: "Tous",
    portal: { all: "Tous", linked: "Lié", notLinked: "Non lié" },
    allStatus: "Tous",
    portalStatus: { all: "Tous", active: "Actif", disabled: "Désactivé", archived: "Archivé" },
    table: { supplier: "Fournisseur", linkedAccount: "Compte lié", balance: "Solde actuel", portalStatus: "Statut du portail", access: "Accéder", linkNow: "Lier maintenant" },
    view: "Accéder",
    addSupplier: "Ajouter Fournisseur",
    loading: "Chargement...",
    failedLoad: "Échec chargement",
    noSuppliers: "Aucun fournisseur trouvé.",
    noSuppliersDesc: "Ajoutez votre premier fournisseur.",
    create: { title: "Ajouter Fournisseur", name: "Nom", phone: "Téléphone", address: "Adresse", identificationNumber: "Numéro d'identification", email: "E-mail", notes: "Notes", cancel: "Annuler", create: "Créer", creating: "Création...", required: "Requis" },
    edit: { title: "Modifier Fournisseur", save: "Enregistrer", saving: "Enregistrement..." },
    details: { title: "Détails Fournisseur", overview: "Aperçu", purchases: "Achats", payments: "Paiements", portal: "Accès Portail", requests: "Demandes", activity: "Activité", identity: "Identité", contact: "Contact", finance: "Finance", archive: "Archiver", close: "Fermer", balance: "Solde actuel", name: "Nom", phone: "Téléphone", email: "E-mail", address: "Adresse", identificationNumber: "Numéro d'identification", notes: "Notes", notLinked: "Non lié", linked: "Lié", viewAccount: "Voir Compte", unlink: "Dissocier", linkExisting: "Lier Compte Existant", createAccount: "Créer Compte R.V.B", searchAccounts: "Rechercher par nom ou @tag", confirmLink: "Lier", confirmUnlink: "Dissocier", unlinkConfirm: "Dissocier @tag de Supplier Name?", unlinkDesc: "Le compte reste mais sera déconnecté.", linkConfirm: "Lier @tag à Supplier Name?", noAccounts: "Aucun compte éligible.", noPurchases: "Aucun achat.", noPayments: "Aucun paiement.", noRequests: "Aucune demande.", noActivity: "Aucune activité." },
    validation: { nameRequired: "Nom requis", phoneRequired: "Téléphone requis" },
    roles: { supplier: "Fournisseur" },
    statuses: { active: "Actif", disabled: "Désactivé", archived: "Archivé", noAccess: "Pas d'accès" },
  },
  ar: {
    headerTitle: "الموردون",
    headerSubtitle: "إدارة ملفات الموردين والأرصدة وسجل التوريد والوصول للبوابة.",
    kpi: { total: "إجمالي الموردين", outstanding: "الرصيد المستحق", linked: "الوصول للبوابة", unlinked: "غير مرتبط" },
    searchPlaceholder: "ابحث بالاسم أو الهاتف أو @tag",
    allPortal: "الكل",
    portal: { all: "الكل", linked: "مرتبط", notLinked: "غير مرتبط" },
    allStatus: "الكل",
    portalStatus: { all: "الكل", active: "نشط", disabled: "معطّل", archived: "مؤرشف" },
    table: { supplier: "المورد", linkedAccount: "الحساب المرتبط", balance: "الرصيد الحالي", portalStatus: "حالة البوابة", access: "دخول", linkNow: "ربط الآن" },
    view: "دخول",
    addSupplier: "إضافة مورد",
    loading: "جارٍ التحميل...",
    failedLoad: "فشل التحميل",
    noSuppliers: "لا يوجد موردون.",
    noSuppliersDesc: "أضف أول مورد للبدء.",
    create: { title: "إضافة مورد", name: "الاسم", phone: "الهاتف", address: "العنوان", identificationNumber: "رقم التعريف", email: "البريد الإلكتروني", notes: "ملاحظات", cancel: "إلغاء", create: "إنشاء", creating: "جارٍ الإنشاء...", required: "مطلوب" },
    edit: { title: "تعديل مورد", save: "حفظ", saving: "جارٍ الحفظ..." },
    details: { title: "تفاصيل المورد", overview: "نظرة عامة", purchases: "المشتريات", payments: "المدفوعات", portal: "الوصول", requests: "الطلبات", activity: "النشاط", identity: "الهوية", contact: "الاتصال", finance: "المالية", archive: "أرشفة", close: "إغلاق", balance: "الرصيد الحالي", name: "الاسم", phone: "الهاتف", email: "البريد الإلكتروني", address: "العنوان", identificationNumber: "رقم التعريف", notes: "ملاحظات", notLinked: "غير مرتبط", linked: "مرتبط", viewAccount: "عرض الحساب", unlink: "إلغاء الربط", linkExisting: "ربط حساب موجود", createAccount: "إنشاء حساب R.V.B", searchAccounts: "ابحث بالاسم أو @tag", confirmLink: "ربط", confirmUnlink: "إلغاء الربط", unlinkConfirm: "إلغاء ربط @tag من Supplier Name؟", unlinkDesc: "يبقى الحساب لكن سيتم فصله.", linkConfirm: "ربط @tag بـ Supplier Name؟", noAccounts: "لا يوجد حسابات مؤهلة.", noPurchases: "لا توجد مشتريات.", noPayments: "لا توجد مدفوعات.", noRequests: "لا توجد طلبات بعد.", noActivity: "لا يوجد نشاط بعد." },
    validation: { nameRequired: "الاسم مطلوب", phoneRequired: "الهاتف مطلوب" },
    roles: { supplier: "مورد" },
    statuses: { active: "نشط", disabled: "معطّل", archived: "مؤرشف", noAccess: "لا يوجد وصول" },
  },
} as const;

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function formatDate(ts: number | null | undefined, lang: string) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    const locale = lang === "ar" ? "ar-DZ-u-nu-latn" : lang === "fr" ? "fr-FR" : "en-GB";
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", numberingSystem: "latn" } as any).format(d);
  } catch { return new Date(ts!).toLocaleDateString(); }
}

function RvbSuppliersInner() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<RvbAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [portalFilter, setPortalFilter] = useState("");
  const [portalStatusFilter, setPortalStatusFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", identificationNumber: "", email: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [details, setDetails] = useState<Supplier | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "purchases" | "payments" | "portal" | "requests" | "activity">("overview");
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [supplierRequests, setSupplierRequests] = useState<SupplierRequest[]>([]);
  const [linkModal, setLinkModal] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [selectedLink, setSelectedLink] = useState<RvbAccount | null>(null);
  const [linking, setLinking] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState<RvbAccount | null>(null);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [createTag, setCreateTag] = useState("");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createConfirm, setCreateConfirm] = useState("");
  const [createError, setCreateError] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);

  const lang = (settings.language as Language) || "en";
  const t = (TR as any)[lang] ?? TR.en;
  const isRtl = lang === "ar";
  const { user } = useRvbAuth();
  const isManager = user?.role === "manager" || user?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, acc] = await Promise.all([
        supplierService.getAll().catch(() => [] as Supplier[]),
        rvbAccountService.getAll().catch(() => [] as RvbAccount[]),
      ]);
      setSuppliers(Array.isArray(s) ? s : []);
      setAccounts(Array.isArray(acc) ? acc : []);
    } catch (e: any) {
      setError(t.failedLoad);
    } finally { setLoading(false); }
  }, [t.failedLoad]);

  useEffect(() => {
    settingsService.get().then((s) => { if (s) setSettings(s); });
    const h = (e: Event) => {
      const ce = e as CustomEvent<Settings>;
      if (ce?.detail) setSettings(ce.detail);
      else settingsService.get().then((s) => { if (s) setSettings(s); });
    };
    window.addEventListener(SETTINGS_EVENT, h);
    return () => window.removeEventListener(SETTINGS_EVENT, h);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const supplierAccountMap = useMemo(() => {
    const m = new Map<string, RvbAccount>();
    for (const acc of accounts) {
      if (acc.linkedEntityType === "supplier" && acc.linkedEntityId) m.set(acc.linkedEntityId, acc);
    }
    return m;
  }, [accounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      const acc = supplierAccountMap.get(s.id);
      if (portalFilter === "linked" && !acc) return false;
      if (portalFilter === "notLinked" && acc) return false;
      if (portalStatusFilter) {
        if (!acc) return false;
        if (acc.status !== portalStatusFilter) return false;
      }
      if (!q) return true;
      const tag = acc ? acc.tag.toLowerCase() : "";
      const hay = `${s.name} ${s.phone} ${tag}`.toLowerCase();
      if (hay.includes(q)) return true;
      const nq = q.startsWith("@") ? q.slice(1) : q;
      if (nq && tag.includes(nq)) return true;
      return false;
    });
  }, [suppliers, search, portalFilter, portalStatusFilter, supplierAccountMap]);

  const kpi = useMemo(() => {
    const total = suppliers.length;
    const outstanding = suppliers.reduce((sum, s) => sum + (Number(s.balance) || 0), 0);
    const linked = suppliers.filter((s) => supplierAccountMap.has(s.id)).length;
    const unlinked = total - linked;
    return { total, outstanding, linked, unlinked };
  }, [suppliers, supplierAccountMap]);

  const eligibleAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (a.status !== "active") return false;
      if (a.linkedEntityType || a.linkedEntityId) return false;
      if (a.role !== "supplier") return false;
      return true;
    }).filter((a) => {
      const q = linkSearch.trim().toLowerCase();
      if (!q) return true;
      const nq = q.startsWith("@") ? q.slice(1) : q;
      return a.displayName.toLowerCase().includes(q) || a.tag.toLowerCase().includes(nq);
    });
  }, [accounts, linkSearch]);

  const loadPurchases = useCallback(async (supplierId: string) => {
    try {
      const all: any[] = await db.purchases.where("supplierId").equals(supplierId).toArray();
      setPurchases(all.sort((a,b)=> (b.date||b.createdAt||0)-(a.date||a.createdAt||0)));
    } catch { setPurchases([]); }
  }, []);
  const loadPayments = useCallback(async (supplierId: string) => {
    try {
      const all: any[] = await db.payments.where("entityId").equals(supplierId).toArray();
      setPayments(all.filter((p)=>p.entityType==="supplier").sort((a:any,b:any)=> (b.date||b.createdAt||0)-(a.date||a.createdAt||0)));
    } catch { setPayments([]); }
  }, []);
  const loadSupplierRequests = useCallback(async (supplierId: string) => {
    try {
      const r = await supplierRequestService.list(supplierId).catch(()=>[] as any);
      setSupplierRequests(r as any);
    } catch { setSupplierRequests([]); }
  }, []);

  useEffect(() => {
    if (details) {
      void loadPurchases(details.id);
      void loadPayments(details.id);
      void loadSupplierRequests(details.id);
    }
  }, [details, loadPurchases, loadPayments, loadSupplierRequests]);

  const anyModalOpen = showAdd || !!details || linkModal || !!showUnlinkConfirm || showCreateAccount;
  useEffect(() => {
    if (!anyModalOpen) return;
    const body = document.body;
    const html = document.documentElement;
    const prevBody = body.style.overflow;
    const prevHtml = html.style.overflow;
    const prevPad = body.style.paddingRight;
    const sw = window.innerWidth - html.clientWidth;
    if (sw>0) body.style.paddingRight = `${sw}px`;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    return () => { body.style.overflow = prevBody; html.style.overflow = prevHtml; body.style.paddingRight = prevPad; };
  }, [anyModalOpen]);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", phone: "", address: "", identificationNumber: "", email: "", notes: "" });
    setFormError("");
    setShowAdd(true);
  };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, phone: s.phone, address: s.address||"", identificationNumber: s.identificationNumber||"", email: s.email||"", notes: s.notes||"" });
    setFormError("");
    setShowAdd(true);
  };
  const handleSave = async () => {
    setFormError("");
    if (!form.name.trim()) { setFormError(t.validation.nameRequired); return; }
    if (!form.phone.trim()) { setFormError(t.validation.phoneRequired); return; }
    setSaving(true);
    try {
      if (editing) {
        await supplierEditOperation.edit({ supplierId: editing.id, name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim()||undefined, identificationNumber: form.identificationNumber.trim()||undefined, email: form.email.trim()||undefined, notes: form.notes.trim()||undefined });
      } else {
        await supplierService.create({ name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim()||undefined, identificationNumber: form.identificationNumber.trim()||undefined, email: form.email.trim()||undefined, notes: form.notes.trim()||undefined });
      }
      await load();
      setShowAdd(false);
      setEditing(null);
    } catch (e:any) { setFormError(e?.message || t.failedLoad); }
    finally { setSaving(false); }
  };

  const handleLink = async () => {
    if (!details || !selectedLink) return;
    setLinking(true);
    try {
      await rvbAccountService.linkToWorker(selectedLink.id, details.id); // reuse worker link for supplier (needs supplier handling)
      // For supplier, linkToWorker will be extended to support supplier role; fallback: create link via generic
      // Try supplier-specific if available
      await load();
      setLinkModal(false);
      setSelectedLink(null);
    } catch (e:any) {
      // Try supplier link via direct backend supplier link if worker link failed due to role mismatch
      try {
        // Attempt supplier-specific endpoint via fetch
        const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
        const token = (await import("../../../src/services/rvb-auth.service")).rvbAuthService.getAccessToken();
        const res = await fetch(`${API_BASE}/api/rvb/accounts/${encodeURIComponent(selectedLink.id)}/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token?{Authorization:`Bearer ${token}`}:{}) },
          body: JSON.stringify({ supplierId: details.id, workerId: details.id }),
          credentials: "include",
        });
        const data = await res.json().catch(()=>({}));
        if (!res.ok) throw new Error(data?.code || "Link failed");
        await load();
        setLinkModal(false);
        setSelectedLink(null);
      } catch (inner:any) {
        alert(e?.data?.code || e?.message || inner?.message || "Link failed");
      }
    } finally { setLinking(false); }
  };

  // Use supplier-specific link via backend directly
  const handleLinkSupplier = async () => {
    if (!details || !selectedLink) return;
    setLinking(true);
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
      const { rvbAuthService } = await import("../../../src/services/rvb-auth.service");
      const token = rvbAuthService.getAccessToken();
      // First try generic linkToWorker which now supports supplier if backend updated
      // If not, try direct supplier link endpoint
      let ok = false;
      try {
        await rvbAccountService.linkToWorker(selectedLink.id, details.id);
        ok = true;
      } catch {}
      if (!ok) {
        const res = await fetch(`${API_BASE}/api/rvb/accounts/${encodeURIComponent(selectedLink.id)}/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token?{Authorization:`Bearer ${token}`}:{}) },
          body: JSON.stringify({ workerId: details.id, supplierId: details.id }),
          credentials: "include",
        });
        const data = await res.json().catch(()=>({}));
        if (!res.ok) throw new Error(data?.code || data?.message || "Link failed");
      }
      await load();
      setLinkModal(false);
      setSelectedLink(null);
    } catch (e:any) { alert(e?.data?.code || e?.message || "Link failed"); }
    finally { setLinking(false); }
  };

  const handleUnlink = async () => {
    if (!showUnlinkConfirm) return;
    setLinking(true);
    try {
      await rvbAccountService.unlink(showUnlinkConfirm.id);
      await load();
      setShowUnlinkConfirm(null);
    } catch (e:any) { alert(e?.message || "Unlink failed"); }
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
    setCreatingAccount(true);
    try {
      await rvbAccountService.create({ tag, displayName: createDisplayName.trim(), role: "supplier", linkedEntityType: "supplier", linkedEntityId: details.id, password: createPassword, confirmPassword: createConfirm } as any);
      await load();
      setShowCreateAccount(false);
      setCreateTag(""); setCreateDisplayName(""); setCreatePassword(""); setCreateConfirm("");
    } catch (e:any) { setCreateError(e?.data?.code || e?.message || "Create failed"); }
    finally { setCreatingAccount(false); }
  };

  return (
    <RvbShell activePage="suppliers">
      <div className={styles.rvbAccountsRoot} dir={isRtl ? "rtl" : "ltr"}>
        <div className={styles.headerWrap}>
          <h1 className={styles.headerTitle}>{t.headerTitle}</h1>
          <p className={styles.headerSubtitle}>{t.headerSubtitle}</p>
        </div>

        <div className={styles.kpiRow}>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "var(--accent-soft)", border: "1px solid var(--accent-ring)", color: "var(--accent)", flex: "0 0 44px" }}><Truck size={20} strokeWidth={2} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.kpi.total}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{loading ? "—" : String(kpi.total)}</strong></div>
          </div>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(58,125,82,0.10)", border: "1px solid rgba(58,125,82,0.18)", color: "#3A7D52", flex: "0 0 44px" }}><Wallet size={20} strokeWidth={2} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.kpi.outstanding}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{loading ? "—" : formatCurrency(kpi.outstanding, settings.currency as any)}</strong></div>
          </div>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(175,149,75,0.11)", border: "1px solid rgba(175,149,75,0.16)", color: "#8a6d1b", flex: "0 0 44px" }}><ShieldCheck size={20} strokeWidth={2} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.kpi.linked}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{loading ? "—" : String(kpi.linked)}</strong></div>
          </div>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(120,120,130,0.10)", border: "1px solid rgba(120,120,130,0.18)", color: "var(--muted)", flex: "0 0 44px" }}><Archive size={20} strokeWidth={2} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.kpi.unlinked}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{loading ? "—" : String(kpi.unlinked)}</strong></div>
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <span aria-hidden="true"><Search size={18} /></span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchPlaceholder} aria-label={t.searchPlaceholder} />
          </div>
          <div className={styles.filterGroup}>
            <div style={{ minWidth: 160 }}>
              <StyledSelect value={portalFilter} onChange={setPortalFilter} options={[{ value: "", label: t.allPortal }, { value: "linked", label: t.portal.linked }, { value: "notLinked", label: t.portal.notLinked }]} placeholder={t.allPortal} ariaLabel={t.allPortal} />
            </div>
            <div style={{ minWidth: 160 }}>
              <StyledSelect value={portalStatusFilter} onChange={setPortalStatusFilter} options={[{ value: "", label: t.allStatus }, { value: "active", label: t.portalStatus.active }, { value: "disabled", label: t.portalStatus.disabled }, { value: "archived", label: t.portalStatus.archived }]} placeholder={t.allStatus} ariaLabel={t.allStatus} />
            </div>
          </div>
          {isManager && <button type="button" className={styles.primaryButton} onClick={openAdd}><Plus size={16} />{t.addSupplier}</button>}
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        <div className={styles.card}>
          {loading ? (
            <div className={styles.loadingBox}><div className={styles.loadingPulse} /><strong style={{ fontSize: 13, color: "var(--muted)" }}>{t.loading}</strong></div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon} aria-hidden="true"><Truck size={26} /></div>
              <h3 className={styles.emptyTitle}>{t.noSuppliers}</h3>
              <p className={styles.emptyDesc}>{t.noSuppliersDesc}</p>
              {isManager && <button type="button" className={styles.primaryButton} onClick={openAdd}><Plus size={16} />{t.addSupplier}</button>}
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table} role="table" aria-label={t.headerTitle}>
                <thead className={styles.tableHead}>
                  <tr>
                    <th style={{ width: "30%" }}>{t.table.supplier}</th>
                    <th style={{ width: "24%" }}>{t.table.linkedAccount}</th>
                    <th style={{ width: "18%" }}>{t.table.balance}</th>
                    <th style={{ width: "14%" }}>{t.table.portalStatus}</th>
                    <th style={{ width: "14%", textAlign: "center" }}>{t.table.access}</th>
                  </tr>
                </thead>
                <tbody className={styles.tableBody}>
                  {filtered.map((s) => {
                    const acc = supplierAccountMap.get(s.id);
                    const portalStatus = acc ? acc.status : "noaccess";
                    const statusLabel = acc ? ((t as any).statuses[acc.status] ?? acc.status) : (t as any).statuses.noAccess ?? "No access";
                    return (
                      <tr key={s.id}>
                        <td>
                          <div className={styles.accountCell}>
                            <span className={styles.avatar} aria-hidden="true">{initials(s.name)}</span>
                            <span className={styles.accountName} style={{ minWidth: 0 }}>
                              <strong title={s.name} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</strong>
                              <small dir="ltr" style={{ display: "block", fontSize: 11, color: "var(--muted)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.phone}</small>
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
                                  onClick={(e) => { e.stopPropagation(); setDetails(s); setActiveTab("portal" as any); setSelectedLink(null); setLinkSearch(""); setLinkModal(true); }}
                                  style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 26, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--accent)", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                                  aria-label={`${(t.table as any).linkNow ?? "Link now"} ${s.name}`}
                                >
                                  <Link2 size={12} aria-hidden="true" />{(t.table as any).linkNow ?? "Link now"}
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: 12, fontWeight: 700, color: Number(s.balance) > 0 ? "#3A7D52" : "var(--muted)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{formatCurrency(Number(s.balance) || 0, settings.currency as any)}</td>
                        <td>
                          {acc ? (
                            <span className={`${styles.badge} ${acc.status === "active" ? styles.badgeStatusActive : acc.status === "archived" ? styles.badgeStatusArchived : styles.badgeStatusDisabled}`}>{statusLabel}</span>
                          ) : (
                            <span className={`${styles.badge} ${styles.badgeStatusArchived}`}>{statusLabel}</span>
                          )}
                        </td>
                        <td>
                          <div className={styles.actionsCell} style={{ justifyContent: "center" }}>
                            <button type="button" className={styles.viewButton} onClick={() => { setDetails(s); setActiveTab("overview"); }} aria-label={`${t.view} ${s.name}`}>
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
              <div className={styles.field}><label>{t.create.email}</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" /></div>
              <div className={styles.field}><label>{t.create.address}</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div className={styles.field}><label>{t.create.identificationNumber}</label><input value={form.identificationNumber} onChange={(e) => setForm({ ...form, identificationNumber: e.target.value })} dir="ltr" /></div>
              <div className={styles.field}><label>{t.create.notes}</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} style={{ width: "100%", padding: 10, border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel)", color: "var(--text)" }} /></div>
              {formError && <div className={styles.formError}>{formError}</div>}
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.secondaryButton} onClick={() => setShowAdd(false)} disabled={saving}>{t.create.cancel}</button>
              <button type="button" className={styles.primaryButton} onClick={handleSave} disabled={saving}>{saving ? t.create.creating : editing ? t.edit.save : t.create.create}</button>
            </div>
          </section>
        </div>
      )}

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
                ["purchases", t.details.purchases],
                ["payments", t.details.payments],
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
                      <small dir="ltr" style={{ color: "var(--muted)", fontSize: 12 }}>{details.phone}</small>
                      <span className={`${styles.badge} ${styles.badgeStatusActive}`} style={{ alignSelf: "flex-start", marginTop: 4 }}>{formatCurrency(Number(details.balance), settings.currency as any)}</span>
                    </span>
                  </div>
                  <div className={styles.detailSection}>
                    <h3 className={styles.detailSectionTitle}>{t.details.identity}</h3>
                    <div className={styles.detailGrid}>
                      <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.name}</span><span className={styles.detailValue}>{details.name}</span></div>
                      <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.phone}</span><span className={styles.detailValue} dir="ltr">{details.phone}</span></div>
                      {details.email && <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.email}</span><span className={styles.detailValue} dir="ltr">{details.email}</span></div>}
                      {details.address && <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.address}</span><span className={styles.detailValue}>{details.address}</span></div>}
                      {details.identificationNumber && <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.identificationNumber}</span><span className={styles.detailValue}>{details.identificationNumber}</span></div>}
                      {details.notes && <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.notes}</span><span className={styles.detailValueWrap}>{details.notes}</span></div>}
                    </div>
                  </div>
                  <div className={styles.detailSection}>
                    <h3 className={styles.detailSectionTitle}>{t.details.finance}</h3>
                    <div className={styles.detailGrid}>
                      <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.balance}</span><span className={styles.detailValue} style={{ fontWeight: 800, color: Number(details.balance) > 0 ? "#3A7D52" : "var(--muted)" }}>{formatCurrency(Number(details.balance), settings.currency as any)}</span></div>
                      <div className={styles.detailRow}><span className={styles.detailLabel}>Status</span><span className={`${styles.badge} ${supplierAccountMap.get(details.id) ? (supplierAccountMap.get(details.id)!.status === "active" ? styles.badgeStatusActive : styles.badgeStatusArchived) : styles.badgeStatusArchived}`}>{supplierAccountMap.get(details.id) ? supplierAccountMap.get(details.id)!.status : t.details.notLinked}</span></div>
                    </div>
                  </div>
                  {isManager && (
                    <div className={styles.drawerActions}>
                      <button type="button" className={styles.actionButton} onClick={() => openEdit(details)}><Archive size={14} />{t.edit.title}</button>
                      <button type="button" className={styles.actionButton} onClick={() => setDetails(null)} style={{ marginInlineStart: "auto" }}>{t.details.close}</button>
                    </div>
                  )}
                </>
              )}
              {activeTab === "purchases" && (
                <div className={styles.detailSection}>
                  <h3 className={styles.detailSectionTitle}>{t.details.purchases}</h3>
                  {purchases.length === 0 ? (
                    <div style={{ padding: 16, border: "1px dashed var(--border)", borderRadius: 10, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>{t.details.noPurchases}</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {purchases.slice(0, 20).map((p: any) => (
                        <div key={p.id} className={styles.detailRow}>
                          <span className={styles.detailLabel} style={{ display: "flex", flexDirection: "column", gap: 2 }}><span>{formatDate(p.date, lang)}</span><small style={{ color: "var(--subtle)", fontSize: 11 }}>{(p.items||[]).length} items · {p.items?.map((i:any)=>i.productId.slice(0,6)).join(", ")}</small></span>
                          <span className={styles.detailValue} style={{ fontVariantNumeric: "tabular-nums" }}>{formatCurrency(Number(p.total), settings.currency as any)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {activeTab === "payments" && (
                <div className={styles.detailSection}>
                  <h3 className={styles.detailSectionTitle}>{t.details.payments}</h3>
                  {payments.length === 0 ? (
                    <div style={{ padding: 16, border: "1px dashed var(--border)", borderRadius: 10, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>{t.details.noPayments}</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {payments.slice(0, 20).map((p: any) => (
                        <div key={p.id} className={styles.detailRow}>
                          <span className={styles.detailLabel}>{formatDate(p.date, lang)}</span>
                          <span className={styles.detailValue} style={{ fontVariantNumeric: "tabular-nums" }}>{formatCurrency(Number(p.amount), settings.currency as any)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {activeTab === "portal" && (
                <div className={styles.detailSection}>
                  <h3 className={styles.detailSectionTitle}>{t.details.portal}</h3>
                  {(() => {
                    const acc = supplierAccountMap.get(details.id);
                    if (!acc) {
                      return (
                        <div style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 10, background: "var(--panel-hover)", textAlign: "center" }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{t.details.notLinked}</div>
                          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 12 }}>Portal access has not been configured.</p>
                          {isManager && (
                            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
                              <button type="button" className={styles.primaryButton} onClick={() => setLinkModal(true)}><Link2 size={14} />{t.details.linkExisting}</button>
                              <button type="button" className={styles.secondaryButton} onClick={() => { setCreateDisplayName(details.name); setCreateTag(details.name.toLowerCase().replace(/\s+/g,".").replace(/[^a-z0-9._]/g,"").slice(0,20)), setShowCreateAccount(true); }}><Plus size={14} />{t.details.createAccount}</button>
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
                          <div className={styles.detailRow}><span className={styles.detailLabel}>Status</span><span className={`${styles.badge} ${acc.status === "active" ? styles.badgeStatusActive : acc.status === "archived" ? styles.badgeStatusArchived : styles.badgeStatusDisabled}`}>{acc.status}</span></div>
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
              )}
              {activeTab === "requests" && (
                <div className={styles.detailSection}>
                  <h3 className={styles.detailSectionTitle}>{t.details.requests}</h3>
                  {supplierRequests.length === 0 ? (
                    <div style={{ padding: 16, border: "1px dashed var(--border)", borderRadius: 10, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>{t.details.noRequests}</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {supplierRequests.map((r) => (
                        <div key={r.id} className={styles.detailRow} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                            <span className={`${styles.badge} ${r.status === "under_review" ? styles.badgeOnboardingPending : r.status === "accepted" ? styles.badgeStatusActive : styles.badgeStatusDisabled}`} style={{ fontSize: 10 }}>{r.type} · {r.status}</span>
                            <span style={{ fontSize: 11, color: "var(--muted)" }}>{formatDate(r.submittedAt, lang)}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 600 }}>{r.type === "new_supply" ? `${r.total ? formatCurrency(r.total, settings.currency as any) : ""} ${r.items ? `· ${(r.items as any[]).length} items` : ""}` : r.description || "—"}</div>
                          {r.notes && <small style={{ color: "var(--muted)", fontSize: 11 }}>Review notes: {r.notes}</small>}
                          {r.status === "under_review" && isManager && (
                            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                              <button type="button" className={styles.primaryButton} onClick={async () => { if (!confirm("Accept? This will create purchase once.")) return; try { await supplierRequestService.review(r.id, "accepted"); if (details) { const updated = await supplierRequestService.list(details.id); setSupplierRequests(updated as any); await loadPurchases(details.id); } } catch(e:any){ alert(e?.message||"Review failed"); } }} style={{ flex: 1, minHeight: 32, fontSize: 11, background: "#3A7D52", borderColor: "#3A7D52" }}>Accept</button>
                              <button type="button" className={styles.secondaryButton} onClick={async () => { try { await supplierRequestService.review(r.id, "rejected"); if (details) setSupplierRequests(await supplierRequestService.list(details.id) as any); } catch(e:any){ alert(e?.message||"Review failed"); } }} style={{ flex: 1, minHeight: 32, fontSize: 11 }}>Reject</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {activeTab === "activity" && (
                <div className={styles.detailSection}>
                  <h3 className={styles.detailSectionTitle}>{t.details.activity}</h3>
                  <div style={{ padding: 12, border: "1px dashed var(--border)", borderRadius: 10, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>{t.details.noActivity}</div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

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
              {selectedLink && <div style={{ padding: 10, background: "var(--accent-soft)", border: "1px solid var(--accent-ring)", borderRadius: 8, fontSize: 12, color: "var(--text)", fontWeight: 600 }}>{t.details.linkConfirm.replace("@tag", `@${selectedLink.tag}`).replace("Supplier Name", details.name)}</div>}
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.secondaryButton} onClick={() => setLinkModal(false)}>{t.create.cancel}</button>
              <button type="button" className={styles.primaryButton} onClick={async () => {
                if (!selectedLink || !details) return;
                setLinking(true);
                try {
                  // Supplier link - reuse linkToWorker but backend now handles supplier via link endpoint
                  // Try supplier-specific
                  const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
                  const { rvbAuthService } = await import("../../../src/services/rvb-auth.service");
                  const token = rvbAuthService.getAccessToken();
                  const res = await fetch(`${API_BASE}/api/rvb/accounts/${encodeURIComponent(selectedLink.id)}/link`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...(token?{Authorization:`Bearer ${token}`}:{}) },
                    body: JSON.stringify({ workerId: details.id, supplierId: details.id }),
                    credentials: "include",
                  });
                  const data = await res.json().catch(()=>({}));
                  if (!res.ok) throw new Error(data?.code || "Link failed");
                  await load();
                  setLinkModal(false);
                  setSelectedLink(null);
                } catch (e:any) {
                  try {
                    await rvbAccountService.linkToWorker(selectedLink.id, details.id);
                    await load();
                    setLinkModal(false);
                    setSelectedLink(null);
                  } catch (inner:any) { alert(e?.message || inner?.message || "Link failed"); }
                } finally { setLinking(false); }
              }} disabled={!selectedLink || linking}>{linking ? "Linking..." : t.details.confirmLink}</button>
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
              <div className={styles.field}><label>Display Name *</label><input value={createDisplayName} onChange={(e) => setCreateDisplayName(e.target.value)} placeholder={details.name} /></div>
              <div className={styles.field}>
                <label>Tag *</label>
                <div className={styles.inputWithPrefix}><span aria-hidden="true">@</span><input value={createTag} onChange={(e) => setCreateTag(e.target.value)} placeholder="supplier.tag" dir="ltr" style={{ flex: 1, border: 0, background: "transparent", outline: 0, padding: "10px 12px 10px 4px" }} /></div>
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
    </RvbShell>
  );
}

export default function RvbSuppliersPage() {
  return (
    <RvbAuthGuard>
      <RvbWorkersGuard>
        <RvbSuppliersInner />
      </RvbWorkersGuard>
    </RvbAuthGuard>
  );
}
