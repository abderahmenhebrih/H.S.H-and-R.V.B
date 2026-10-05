"use client";

import { formatTimestampToDisplay } from "../../../src/lib/date-format";

import { useCallback, useEffect, useMemo, useState } from "react";
import RvbShell from "../../../src/components/rvb/RvbShell";
import StyledSelect from "../../../src/components/common/StyledSelect";
import { rvbUiPreferencesService, RVB_UI_PREFERENCES_EVENT } from "@/src/services/rvb-ui-preferences.service";
import { DEFAULT_SETTINGS, formatCurrency } from "../../../src/lib/settings";
import type { Settings, Language } from "../../../src/types/settings/settings";
import { rvbCustomerService } from "../../../src/services/rvb-customer.service";
import { rvbConfigService } from "../../../src/services/rvb-config.service";
import { rvbAccountService } from "../../../src/services/rvb-account.service";
import type { Customer } from "../../../src/types/entities/customer";
import type { RvbAccount } from "../../../src/types/rvb/rvb-account";
import { normalizeTag, isValidTag } from "../../../src/types/rvb/rvb-account";
import { useRvbAuth } from "../../../src/contexts/RvbAuthContext";
import RvbAuthGuard from "../../../src/components/rvb/RvbAuthGuard";
import { RvbCustomersGuard } from "../../../src/components/rvb/RvbRoleGuard";
import {
  Search,
  Plus,
  UsersRound,
  Eye,
  X,
  Wallet,
  ShieldCheck,
  Link2,
  Unlink,
  KeyRound,
} from "lucide-react";
import styles from "./page.module.css";

const TR: Record<Language, any> = {
  en: {
    headerTitle: "Customers",
    headerSubtitle: "Manage customer profiles, balances, orders, shipments and portal access.",
    kpi: { total: "Total Customers", outstanding: "Outstanding Balance", linked: "Portal Access", unlinked: "Unlinked" },
    searchPlaceholder: "Search customers by name, phone or @tag",
    allPortal: "All Portal",
    portal: { all: "All", linked: "Linked", notLinked: "Not linked" },
    allStatus: "All Statuses",
    portalStatus: { all: "All", active: "Active", disabled: "Disabled", archived: "Archived" },
    allTypes: "All Types",
    table: { customer: "Customer", linkedAccount: "Linked Account", balance: "Current Balance", portalStatus: "Portal Status", access: "Access", linkNow: "Link now" },
    view: "Access",
    addCustomer: "Add Customer",
    loading: "Loading customers...",
    failedLoad: "Failed to load customers",
    noCustomers: "No customers found.",
    noCustomersDesc: "Add your first customer to begin managing orders and portal access.",
    create: { title: "Add Customer", name: "Name", phone: "Phone", address: "Address", identificationNumber: "Identification Number", email: "Email", notes: "Notes", type: "Customer Type", invoiceCustomerType: "Invoice Customer Type", legalName: "Legal Name", commercialName: "Commercial Name", legalForm: "Legal Form", activity: "Activity", billingAddress: "Billing Address", rc: "RC", nif: "NIF", nis: "NIS", cancel: "Cancel", create: "Create Customer", creating: "Creating..." },
    edit: { title: "Edit Customer", save: "Save Changes", saving: "Saving..." },
    details: {
      title: "Customer Details",
      overview: "Overview",
      sales: "Sales / Shipments",
      payments: "Payments",
      portal: "Portal Access",
      orders: "Orders",
      requests: "Requests",
      activity: "Activity",
      identity: "Identity",
      contact: "Contact",
      invoiceIdentity: "Invoice Identity",
      finance: "Finance",
      close: "Close",
      balance: "Current Balance",
      name: "Name",
      phone: "Phone",
      type: "Type",
      email: "Email",
      address: "Address",
      identificationNumber: "Identification Number",
      notes: "Notes",
      notLinked: "Not linked",
      viewAccount: "View Account",
      unlink: "Unlink",
      linkExisting: "Link Existing Account",
      createAccount: "Create R.V.B Account",
      searchAccounts: "Search by name or @tag",
      confirmLink: "Link account",
      confirmUnlink: "Unlink account",
      unlinkConfirm: "Unlink @tag from Customer Name?",
      unlinkDesc: "The R.V.B account will remain, but Customer data will no longer be connected to it.",
      linkConfirm: "Link @tag to Customer Name?",
      noAccounts: "No eligible unlinked accounts (customer, active).",
      noSales: "No sales recorded.",
      noPayments: "No payments recorded.",
      noOrders: "No orders yet.",
      noRequests: "No requests yet.",
      noActivity: "No activity yet.",
      consumer: "Consumer",
      business: "Business",
    },
    validation: { nameRequired: "Name required", phoneRequired: "Phone required", typeRequired: "Type required" },
    roles: { customer: "Customer" },
    statuses: { active: "Active", disabled: "Disabled", archived: "Archived", noAccess: "No access" },
  },
  fr: {
    headerTitle: "Clients",
    headerSubtitle: "Gérez les profils clients, soldes, commandes, expéditions et accès portail.",
    kpi: { total: "Total Clients", outstanding: "Solde Dû", linked: "Accès Portail", unlinked: "Non Liés" },
    searchPlaceholder: "Rechercher par nom, téléphone ou @tag",
    allPortal: "Tous",
    portal: { all: "Tous", linked: "Lié", notLinked: "Non lié" },
    allStatus: "Tous",
    portalStatus: { all: "Tous", active: "Actif", disabled: "Désactivé", archived: "Archivé" },
    allTypes: "Tous les types",
    table: { customer: "Client", linkedAccount: "Compte lié", balance: "Solde actuel", portalStatus: "Statut du portail", access: "Accéder", linkNow: "Lier maintenant" },
    view: "Accéder",
    addCustomer: "Ajouter Client",
    loading: "Chargement...",
    failedLoad: "Échec chargement",
    noCustomers: "Aucun client trouvé.",
    noCustomersDesc: "Ajoutez votre premier client.",
    create: { title: "Ajouter Client", name: "Nom", phone: "Téléphone", address: "Adresse", identificationNumber: "Numéro d'identification", email: "E-mail", notes: "Notes", type: "Type de client", invoiceCustomerType: "Type de client facturation", legalName: "Raison sociale", commercialName: "Nom commercial", legalForm: "Forme juridique", activity: "Activité", billingAddress: "Adresse de facturation", rc: "RC", nif: "NIF", nis: "NIS", cancel: "Annuler", create: "Créer", creating: "Création..." },
    edit: { title: "Modifier Client", save: "Enregistrer", saving: "Enregistrement..." },
    details: { title: "Détails Client", overview: "Aperçu", sales: "Ventes", payments: "Paiements", portal: "Accès Portail", orders: "Commandes", requests: "Demandes", activity: "Activité", identity: "Identité", contact: "Contact", invoiceIdentity: "Identité Facturation", finance: "Finance", close: "Fermer", balance: "Solde actuel", name: "Nom", phone: "Téléphone", type: "Type", email: "E-mail", address: "Adresse", identificationNumber: "Numéro d'identification", notes: "Notes", notLinked: "Non lié", viewAccount: "Voir Compte", unlink: "Dissocier", linkExisting: "Lier Compte Existant", createAccount: "Créer Compte R.V.B", searchAccounts: "Rechercher par nom ou @tag", confirmLink: "Lier", confirmUnlink: "Dissocier", unlinkConfirm: "Dissocier @tag de Customer Name?", unlinkDesc: "Le compte reste mais sera déconnecté.", linkConfirm: "Lier @tag à Customer Name?", noAccounts: "Aucun compte éligible.", noSales: "Aucune vente.", noPayments: "Aucun paiement.", noOrders: "Aucune commande.", noRequests: "Aucune demande.", noActivity: "Aucune activité.", consumer: "Particulier", business: "Entreprise" },
    validation: { nameRequired: "Nom requis", phoneRequired: "Téléphone requis", typeRequired: "Type requis" },
    roles: { customer: "Client" },
    statuses: { active: "Actif", disabled: "Désactivé", archived: "Archivé", noAccess: "Pas d'accès" },
  },
  ar: {
    headerTitle: "الزبائن",
    headerSubtitle: "إدارة ملفات الزبائن والأرصدة والطلبات والشحنات والوصول للبوابة.",
    kpi: { total: "إجمالي الزبائن", outstanding: "الرصيد المستحق", linked: "الوصول للبوابة", unlinked: "غير مرتبط" },
    searchPlaceholder: "ابحث بالاسم أو الهاتف أو @tag",
    allPortal: "الكل",
    portal: { all: "الكل", linked: "مرتبط", notLinked: "غير مرتبط" },
    allStatus: "الكل",
    portalStatus: { all: "الكل", active: "نشط", disabled: "معطّل", archived: "مؤرشف" },
    allTypes: "جميع الأنواع",
    table: { customer: "الزبون", linkedAccount: "الحساب المرتبط", balance: "الرصيد الحالي", portalStatus: "حالة البوابة", access: "دخول", linkNow: "ربط الآن" },
    view: "دخول",
    addCustomer: "إضافة زبون",
    loading: "جارٍ التحميل...",
    failedLoad: "فشل التحميل",
    noCustomers: "لا يوجد زبائن.",
    noCustomersDesc: "أضف أول زبون للبدء.",
    create: { title: "إضافة زبون", name: "الاسم", phone: "الهاتف", address: "العنوان", identificationNumber: "رقم التعريف", email: "البريد الإلكتروني", notes: "ملاحظات", type: "نوع الزبون", invoiceCustomerType: "نوع الزبون للفوترة", legalName: "الاسم القانوني", commercialName: "الاسم التجاري", legalForm: "الشكل القانوني", activity: "النشاط", billingAddress: "عنوان الفوترة", rc: "السجل التجاري", nif: "رقم التعريف الجبائي", nis: "رقم التعريف الإحصائي", cancel: "إلغاء", create: "إنشاء", creating: "جارٍ الإنشاء..." },
    edit: { title: "تعديل زبون", save: "حفظ", saving: "جارٍ الحفظ..." },
    details: { title: "تفاصيل الزبون", overview: "نظرة عامة", sales: "المبيعات", payments: "المدفوعات", portal: "الوصول", orders: "الطلبات", requests: "الطلبات", activity: "النشاط", identity: "الهوية", contact: "الاتصال", invoiceIdentity: "هوية الفوترة", finance: "المالية", close: "إغلاق", balance: "الرصيد الحالي", name: "الاسم", phone: "الهاتف", type: "النوع", email: "البريد الإلكتروني", address: "العنوان", identificationNumber: "رقم التعريف", notes: "ملاحظات", notLinked: "غير مرتبط", viewAccount: "عرض الحساب", unlink: "إلغاء الربط", linkExisting: "ربط حساب موجود", createAccount: "إنشاء حساب R.V.B", searchAccounts: "ابحث بالاسم أو @tag", confirmLink: "ربط", confirmUnlink: "إلغاء الربط", unlinkConfirm: "إلغاء ربط @tag من Customer Name؟", unlinkDesc: "يبقى الحساب لكن سيتم فصله.", linkConfirm: "ربط @tag بـ Customer Name؟", noAccounts: "لا يوجد حسابات مؤهلة.", noSales: "لا توجد مبيعات.", noPayments: "لا توجد مدفوعات.", noOrders: "لا توجد طلبات بعد.", noRequests: "لا توجد طلبات بعد.", noActivity: "لا يوجد نشاط بعد.", consumer: "مستهلك", business: "تاجر" },
    validation: { nameRequired: "الاسم مطلوب", phoneRequired: "الهاتف مطلوب", typeRequired: "النوع مطلوب" },
    roles: { customer: "زبون" },
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
  } catch { return formatTimestampToDisplay(ts); }
}

function RvbCustomersInner() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<RvbAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [portalFilter, setPortalFilter] = useState("");
  const [portalStatusFilter, setPortalStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", identificationNumber: "", email: "", notes: "", type: "", invoiceCustomerType: "consumer" as "consumer" | "business", legalName: "", commercialName: "", legalForm: "", activity: "", billingAddress: "", rc: "", nif: "", nis: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [customerTypes, setCustomerTypes] = useState<string[]>([]);
  const [details, setDetails] = useState<Customer | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "sales" | "payments" | "portal" | "orders" | "requests" | "activity">("overview");
  const [sales, setSales] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
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
  const isManager = user?.role === "manager" || user?.role === "supervisor";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [c, acc] = await Promise.all([
        rvbCustomerService.list().catch(() => [] as any[]),
        rvbAccountService.getAll().catch(() => [] as RvbAccount[]),
      ]);
      setCustomers(Array.isArray(c) ? c : []);
      setAccounts(Array.isArray(acc) ? acc : []);
    } catch (e: any) {
      setError(t.failedLoad);
    } finally { setLoading(false); }
  }, [t.failedLoad]);

  useEffect(() => {
    rvbUiPreferencesService.get().then((s) => { if (s) { setSettings(s); setCustomerTypes(s.customerTypes || []); } });
    rvbConfigService.get().then((c) => {
      if (c?.currency) setSettings((prev:any)=>({...prev, currency:c.currency}));
      if ((c as any)?.customerTypes) setCustomerTypes((c as any).customerTypes);
    }).catch(()=>{});
    const h = (e: Event) => {
      const ce = e as CustomEvent<Settings>;
      if (ce?.detail) { setSettings(ce.detail); setCustomerTypes(ce.detail.customerTypes || []); }
      else rvbUiPreferencesService.get().then((s) => { if (s) { setSettings(s); setCustomerTypes(s?.customerTypes || []); } });
    };
    window.addEventListener(RVB_UI_PREFERENCES_EVENT, h);
    return () => window.removeEventListener(RVB_UI_PREFERENCES_EVENT, h);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const customerAccountMap = useMemo(() => {
    const m = new Map<string, RvbAccount>();
    for (const acc of accounts) {
      if (acc.linkedEntityType === "customer" && acc.linkedEntityId) m.set(acc.linkedEntityId, acc);
    }
    return m;
  }, [accounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      const acc = customerAccountMap.get(c.id);
      if (portalFilter === "linked" && !acc) return false;
      if (portalFilter === "notLinked" && acc) return false;
      if (portalStatusFilter) {
        if (!acc) return false;
        if (acc.status !== portalStatusFilter) return false;
      }
      if (typeFilter && c.type !== typeFilter) return false;
      if (!q) return true;
      const tag = acc ? acc.tag.toLowerCase() : "";
      const hay = `${c.name} ${c.phone} ${c.type} ${tag}`.toLowerCase();
      if (hay.includes(q)) return true;
      const nq = q.startsWith("@") ? q.slice(1) : q;
      if (nq && tag.includes(nq)) return true;
      return false;
    });
  }, [customers, search, portalFilter, portalStatusFilter, typeFilter, customerAccountMap]);

  const kpi = useMemo(() => {
    const total = customers.length;
    const outstanding = customers.reduce((sum, c) => sum + (Number(c.balance) || 0), 0);
    const linked = customers.filter((c) => customerAccountMap.has(c.id)).length;
    const unlinked = total - linked;
    return { total, outstanding, linked, unlinked };
  }, [customers, customerAccountMap]);

  const eligibleAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (a.status !== "active") return false;
      if (a.linkedEntityType || a.linkedEntityId) return false;
      if (a.role !== "customer") return false;
      return true;
    }).filter((a) => {
      const q = linkSearch.trim().toLowerCase();
      if (!q) return true;
      const nq = q.startsWith("@") ? q.slice(1) : q;
      return a.displayName.toLowerCase().includes(q) || a.tag.toLowerCase().includes(nq);
    });
  }, [accounts, linkSearch]);

  const loadSales = useCallback(async (customerId: string) => {
    try {
      const data = await rvbCustomerService.getSales(customerId).catch(()=>[] as any[]);
      setSales(Array.isArray(data)?data:[]);
    } catch { setSales([]); }
  }, []);
  const loadPayments = useCallback(async (customerId: string) => {
    try {
      const data = await rvbCustomerService.getPayments(customerId).catch(()=>[] as any[]);
      setPayments(Array.isArray(data)?data:[]);
    } catch { setPayments([]); }
  }, []);

  useEffect(() => {
    if (details) {
      void loadSales(details.id);
      void loadPayments(details.id);
    }
  }, [details, loadSales, loadPayments]);

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
    setForm({ name: "", phone: "", address: "", identificationNumber: "", email: "", notes: "", type: customerTypes[0] || "", invoiceCustomerType: "consumer", legalName: "", commercialName: "", legalForm: "", activity: "", billingAddress: "", rc: "", nif: "", nis: "" });
    setFormError("");
    setShowAdd(true);
  };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone,
      address: c.address||"",
      identificationNumber: c.identificationNumber||"",
      email: c.email||"",
      notes: c.notes||"",
      type: c.type,
      invoiceCustomerType: (c as any).invoiceCustomerType || "consumer",
      legalName: (c as any).legalName||"",
      commercialName: (c as any).commercialName||"",
      legalForm: (c as any).legalForm||"",
      activity: (c as any).activity||"",
      billingAddress: (c as any).billingAddress||"",
      rc: (c as any).rc||"",
      nif: (c as any).nif||"",
      nis: (c as any).nis||"",
    });
    setFormError("");
    setShowAdd(true);
  };
  const handleSave = async () => {
    setFormError("");
    if (!form.name.trim()) { setFormError(t.validation.nameRequired); return; }
    if (!form.phone.trim()) { setFormError(t.validation.phoneRequired); return; }
    if (!form.type.trim()) { setFormError(t.validation.typeRequired); return; }
    setSaving(true);
    try {
      if (editing) {
        await rvbCustomerService.update(editing.id, {
          name: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim()||undefined,
          identificationNumber: form.identificationNumber.trim()||undefined,
          email: form.email.trim()||undefined,
          notes: form.notes.trim()||undefined,
          type: form.type,
          invoiceCustomerType: form.invoiceCustomerType,
          legalName: form.legalName.trim()||undefined,
          commercialName: form.commercialName.trim()||undefined,
          legalForm: form.legalForm.trim()||undefined,
          activity: form.activity.trim()||undefined,
          billingAddress: form.billingAddress.trim()||undefined,
          rc: form.rc.trim()||undefined,
          nif: form.nif.trim()||undefined,
          nis: form.nis.trim()||undefined,
        } as any);
      } else {
        await rvbCustomerService.create({
          name: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim()||undefined,
          identificationNumber: form.identificationNumber.trim()||undefined,
          email: form.email.trim()||undefined,
          notes: form.notes.trim()||undefined,
          type: form.type,
          invoiceCustomerType: form.invoiceCustomerType,
          legalName: form.legalName.trim()||undefined,
          commercialName: form.commercialName.trim()||undefined,
          legalForm: form.legalForm.trim()||undefined,
          activity: form.activity.trim()||undefined,
          billingAddress: form.billingAddress.trim()||undefined,
          rc: form.rc.trim()||undefined,
          nif: form.nif.trim()||undefined,
          nis: form.nis.trim()||undefined,
        });
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
      await rvbAccountService.linkToWorker(selectedLink.id, details.id);
      await load();
      setLinkModal(false);
      setSelectedLink(null);
    } catch (e:any) {
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
        const { rvbAuthService } = await import("../../../src/services/rvb-auth.service");
        const token = rvbAuthService.getAccessToken();
        const res = await fetch(`${API_BASE}/api/rvb/accounts/${encodeURIComponent(selectedLink.id)}/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token?{Authorization:`Bearer ${token}`}:{}) },
          body: JSON.stringify({ customerId: details.id }),
          credentials: "include",
        });
        const data = await res.json().catch(()=>({}));
        if (!res.ok) throw new Error(data?.code || "Link failed");
        await load();
        setLinkModal(false);
        setSelectedLink(null);
      } catch (inner:any) { alert(e?.data?.code || e?.message || inner?.message || "Link failed"); }
    } finally { setLinking(false); }
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
      await rvbAccountService.create({ tag, displayName: createDisplayName.trim(), role: "customer", linkedEntityType: "customer", linkedEntityId: details.id, password: createPassword, confirmPassword: createConfirm } as any);
      await load();
      setShowCreateAccount(false);
      setCreateTag(""); setCreateDisplayName(""); setCreatePassword(""); setCreateConfirm("");
    } catch (e:any) { setCreateError(e?.data?.code || e?.message || "Create failed"); }
    finally { setCreatingAccount(false); }
  };

  return (
    <RvbShell activePage="customers">
      <div className={styles.rvbAccountsRoot} dir={isRtl ? "rtl" : "ltr"}>
        <div className={styles.headerWrap}>
          <h1 className={styles.headerTitle}>{t.headerTitle}</h1>
          <p className={styles.headerSubtitle}>{t.headerSubtitle}</p>
        </div>

        <div className={styles.kpiRow}>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "var(--accent-soft)", border: "1px solid var(--accent-ring)", color: "var(--accent)", flex: "0 0 44px" }}><UsersRound size={20} strokeWidth={2} /></div>
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
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(120,120,130,0.10)", border: "1px solid rgba(120,120,130,0.18)", color: "var(--muted)", flex: "0 0 44px" }}><Link2 size={20} strokeWidth={2} /></div>
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
            <div style={{ minWidth: 160 }}>
              <StyledSelect value={typeFilter} onChange={setTypeFilter} options={[{ value: "", label: t.allTypes }, ...customerTypes.map((ct)=>({value:ct,label:ct}))]} placeholder={t.allTypes} ariaLabel={t.allTypes} />
            </div>
          </div>
          {isManager && <button type="button" className={styles.primaryButton} onClick={openAdd}><Plus size={16} />{t.addCustomer}</button>}
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        <div className={styles.card}>
          {loading ? (
            <div className={styles.loadingBox}><div className={styles.loadingPulse} /><strong style={{ fontSize: 13, color: "var(--muted)" }}>{t.loading}</strong></div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon} aria-hidden="true"><UsersRound size={26} /></div>
              <h3 className={styles.emptyTitle}>{t.noCustomers}</h3>
              <p className={styles.emptyDesc}>{t.noCustomersDesc}</p>
              {isManager && <button type="button" className={styles.primaryButton} onClick={openAdd}><Plus size={16} />{t.addCustomer}</button>}
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table} role="table" aria-label={t.headerTitle}>
                <thead className={styles.tableHead}>
                  <tr>
                    <th style={{ width: "30%" }}>{t.table.customer}</th>
                    <th style={{ width: "24%" }}>{t.table.linkedAccount}</th>
                    <th style={{ width: "18%" }}>{t.table.balance}</th>
                    <th style={{ width: "14%" }}>{t.table.portalStatus}</th>
                    <th style={{ width: "14%", textAlign: "center" }}>{t.table.access}</th>
                  </tr>
                </thead>
                <tbody className={styles.tableBody}>
                  {filtered.map((c) => {
                    const acc = customerAccountMap.get(c.id);
                    const portalStatus = acc ? acc.status : "noaccess";
                    const statusLabel = acc ? ((t as any).statuses[acc.status] ?? acc.status) : ((t as any).statuses.noAccess ?? "No access");
                    return (
                      <tr key={c.id}>
                        <td>
                          <div className={styles.accountCell}>
                            <span className={styles.avatar} aria-hidden="true">{initials(c.name)}</span>
                            <span className={styles.accountName} style={{ minWidth: 0 }}>
                              <strong title={c.name} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</strong>
                              <small dir="ltr" style={{ display: "block", fontSize: 11, color: "var(--muted)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.phone}</small>
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
                                  onClick={(e) => { e.stopPropagation(); setDetails(c); setActiveTab("portal" as any); setSelectedLink(null); setLinkSearch(""); setLinkModal(true); }}
                                  style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 26, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--accent)", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                                  aria-label={`${(t.table as any).linkNow ?? "Link now"} ${c.name}`}
                                >
                                  <Link2 size={12} aria-hidden="true" />{(t.table as any).linkNow ?? "Link now"}
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: 12, fontWeight: 700, color: Number(c.balance) > 0 ? "#3A7D52" : "var(--muted)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{formatCurrency(Number(c.balance) || 0, settings.currency as any)}</td>
                        <td>
                          {acc ? (
                            <span className={`${styles.badge} ${acc.status === "active" ? styles.badgeStatusActive : acc.status === "archived" ? styles.badgeStatusArchived : styles.badgeStatusDisabled}`}>{statusLabel}</span>
                          ) : (
                            <span className={`${styles.badge} ${styles.badgeStatusArchived}`}>{statusLabel}</span>
                          )}
                        </td>
                        <td>
                          <div className={styles.actionsCell} style={{ justifyContent: "center" }}>
                            <button type="button" className={styles.viewButton} onClick={() => { setDetails(c); setActiveTab("overview"); }} aria-label={`${t.view} ${c.name}`}>
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
              <div className={styles.field}><label>{t.create.type} *</label><StyledSelect value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={customerTypes.map((ct)=>({value:ct,label:ct}))} placeholder={customerTypes.length? "Select type": t.create.type} ariaLabel={t.create.type} /></div>
              <div className={styles.field}><label>{t.create.identificationNumber}</label><input value={form.identificationNumber} onChange={(e) => setForm({ ...form, identificationNumber: e.target.value })} /></div>
              <div className={styles.field}><label>{t.create.address}</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div className={styles.field}><label>{t.create.email}</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" /></div>
              <div className={styles.field}><label>{t.create.notes}</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} style={{ width: "100%", padding: 10, border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel)", color: "var(--text)" }} /></div>
              <div style={{ gridColumn: "1 / -1", marginTop: 8, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <strong style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>{t.create.invoiceCustomerType}</strong>
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ fontSize: 13, fontWeight: 700 }}>{t.create.invoiceCustomerType}</span><StyledSelect value={form.invoiceCustomerType} onChange={(v)=>setForm({...form, invoiceCustomerType: v as any})} options={[{value:"consumer",label:t.details.consumer},{value:"business",label:t.details.business}]} placeholder={t.create.invoiceCustomerType} ariaLabel={t.create.invoiceCustomerType} /></label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ fontSize: 13, fontWeight: 700 }}>{t.create.billingAddress}</span><input value={form.billingAddress} onChange={(e)=>setForm({...form, billingAddress:e.target.value})} placeholder={form.address && !form.billingAddress ? form.address : ""} /></label>
                </div>
                {form.invoiceCustomerType === "business" && (
                  <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ fontSize: 13, fontWeight: 700 }}>{t.create.legalName}</span><input value={form.legalName} onChange={(e)=>setForm({...form, legalName:e.target.value})} /></label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ fontSize: 13, fontWeight: 700 }}>{t.create.commercialName}</span><input value={form.commercialName} onChange={(e)=>setForm({...form, commercialName:e.target.value})} /></label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ fontSize: 13, fontWeight: 700 }}>{t.create.legalForm}</span><input value={form.legalForm} onChange={(e)=>setForm({...form, legalForm:e.target.value})} placeholder="SARL" /></label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ fontSize: 13, fontWeight: 700 }}>{t.create.activity}</span><input value={form.activity} onChange={(e)=>setForm({...form, activity:e.target.value})} /></label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ fontSize: 13, fontWeight: 700 }}>{t.create.rc}</span><input value={form.rc} onChange={(e)=>setForm({...form, rc:e.target.value})} /></label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ fontSize: 13, fontWeight: 700 }}>{t.create.nif}</span><input value={form.nif} onChange={(e)=>setForm({...form, nif:e.target.value})} /></label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ fontSize: 13, fontWeight: 700 }}>{t.create.nis}</span><input value={form.nis} onChange={(e)=>setForm({...form, nis:e.target.value})} /></label>
                  </div>
                )}
              </div>
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
                ["sales", t.details.sales],
                ["payments", t.details.payments],
                ["portal", t.details.portal],
                ["orders", t.details.orders],
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
                      <small dir="ltr" style={{ color: "var(--muted)", fontSize: 12 }}>{details.phone} · {details.type}</small>
                      <span className={`${styles.badge} ${styles.badgeStatusActive}`} style={{ alignSelf: "flex-start", marginTop: 4 }}>{formatCurrency(Number(details.balance), settings.currency as any)}</span>
                    </span>
                  </div>
                  <div className={styles.detailSection}>
                    <h3 className={styles.detailSectionTitle}>{t.details.identity}</h3>
                    <div className={styles.detailGrid}>
                      <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.name}</span><span className={styles.detailValue}>{details.name}</span></div>
                      <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.phone}</span><span className={styles.detailValue} dir="ltr">{details.phone}</span></div>
                      <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.type}</span><span className={styles.detailValue}>{details.type}</span></div>
                      {details.email && <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.email}</span><span className={styles.detailValue} dir="ltr">{details.email}</span></div>}
                      {details.address && <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.address}</span><span className={styles.detailValue}>{details.address}</span></div>}
                      <div className={styles.detailRow}><span className={styles.detailLabel}>{t.details.balance}</span><span className={styles.detailValue} style={{ fontWeight: 800 }}>{formatCurrency(Number(details.balance), settings.currency as any)}</span></div>
                    </div>
                  </div>
                  <div className={styles.detailSection}>
                    <h3 className={styles.detailSectionTitle}>{t.details.invoiceIdentity}</h3>
                    <div className={styles.detailGrid}>
                      <div className={styles.detailRow}><span className={styles.detailLabel}>{t.create.invoiceCustomerType}</span><span className={styles.detailValue}>{(details as any).invoiceCustomerType || "consumer"}</span></div>
                      {(details as any).billingAddress && <div className={styles.detailRow}><span className={styles.detailLabel}>{t.create.billingAddress}</span><span className={styles.detailValue}>{(details as any).billingAddress}</span></div>}
                      {(details as any).legalName && <div className={styles.detailRow}><span className={styles.detailLabel}>{t.create.legalName}</span><span className={styles.detailValue}>{(details as any).legalName}</span></div>}
                      {(details as any).commercialName && <div className={styles.detailRow}><span className={styles.detailLabel}>{t.create.commercialName}</span><span className={styles.detailValue}>{(details as any).commercialName}</span></div>}
                      {(details as any).rc && <div className={styles.detailRow}><span className={styles.detailLabel}>{t.create.rc}</span><span className={styles.detailValue}>{(details as any).rc}</span></div>}
                      {(details as any).nif && <div className={styles.detailRow}><span className={styles.detailLabel}>{t.create.nif}</span><span className={styles.detailValue}>{(details as any).nif}</span></div>}
                      {(details as any).nis && <div className={styles.detailRow}><span className={styles.detailLabel}>{t.create.nis}</span><span className={styles.detailValue}>{(details as any).nis}</span></div>}
                    </div>
                  </div>
                  {isManager && (
                    <div className={styles.drawerActions}>
                      <button type="button" className={styles.actionButton} onClick={() => openEdit(details)}>{t.edit.title}</button>
                      <button type="button" className={styles.actionButton} onClick={() => setDetails(null)} style={{ marginInlineStart: "auto" }}>{t.details.close}</button>
                    </div>
                  )}
                </>
              )}
              {activeTab === "sales" && (
                <div className={styles.detailSection}>
                  <h3 className={styles.detailSectionTitle}>{t.details.sales}</h3>
                  {sales.length === 0 ? (
                    <div style={{ padding: 16, border: "1px dashed var(--border)", borderRadius: 10, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>{t.details.noSales}</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {sales.slice(0, 20).map((s: any) => (
                        <div key={s.id} className={styles.detailRow}>
                          <span className={styles.detailLabel} style={{ display: "flex", flexDirection: "column", gap: 2 }}><span>{formatDate(s.date, lang)}</span><small style={{ color: "var(--subtle)", fontSize: 11 }}>{(s.items||[]).length} items</small></span>
                          <span className={styles.detailValue} style={{ fontVariantNumeric: "tabular-nums" }}>{formatCurrency(Number(s.total), settings.currency as any)}</span>
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
                    const acc = customerAccountMap.get(details.id);
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
              {activeTab === "orders" && (
                <div className={styles.detailSection}>
                  <h3 className={styles.detailSectionTitle}>{t.details.orders}</h3>
                  <div style={{ padding: 16, border: "1px dashed var(--border)", borderRadius: 10, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>{t.details.noOrders}</div>
                  <p style={{ margin: 0, color: "var(--subtle)", fontSize: 11, textAlign: "center" }}>Place Order via customer portal — management review in /rvb/orders.</p>
                </div>
              )}
              {activeTab === "requests" && (
                <div className={styles.detailSection}>
                  <h3 className={styles.detailSectionTitle}>{t.details.requests}</h3>
                  <div style={{ padding: 16, border: "1px dashed var(--border)", borderRadius: 10, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>{t.details.noRequests}</div>
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
              {selectedLink && <div style={{ padding: 10, background: "var(--accent-soft)", border: "1px solid var(--accent-ring)", borderRadius: 8, fontSize: 12, color: "var(--text)", fontWeight: 600 }}>{t.details.linkConfirm.replace("@tag", `@${selectedLink.tag}`).replace("Customer Name", details.name)}</div>}
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
              <div className={styles.field}><label>Display Name *</label><input value={createDisplayName} onChange={(e) => setCreateDisplayName(e.target.value)} placeholder={details.name} /></div>
              <div className={styles.field}>
                <label>Tag *</label>
                <div className={styles.inputWithPrefix}><span aria-hidden="true">@</span><input value={createTag} onChange={(e) => setCreateTag(e.target.value)} placeholder="customer.tag" dir="ltr" style={{ flex: 1, border: 0, background: "transparent", outline: 0, padding: "10px 12px 10px 4px" }} /></div>
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

export default function RvbCustomersPage() {
  return (
    <RvbAuthGuard>
      <RvbCustomersGuard>
        <RvbCustomersInner />
      </RvbCustomersGuard>
    </RvbAuthGuard>
  );
}

