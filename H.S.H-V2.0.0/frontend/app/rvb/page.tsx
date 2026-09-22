"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import RvbShell from "../../src/components/rvb/RvbShell";
import RvbKpiCard from "../../src/components/rvb/dashboard/RvbKpiCard";
import RvbPendingItem from "../../src/components/rvb/dashboard/RvbPendingItem";
import RvbRoleOverviewCard from "../../src/components/rvb/dashboard/RvbRoleOverviewCard";
import RvbActivityFeed from "../../src/components/rvb/dashboard/RvbActivityFeed";
import RvbQuickAction from "../../src/components/rvb/dashboard/RvbQuickAction";
import RvbSystemStatus from "../../src/components/rvb/dashboard/RvbSystemStatus";
import styles from "./page.module.css";
import { settingsService } from "../../src/services/settings.service";
import { DEFAULT_SETTINGS, formatCurrency, SETTINGS_EVENT } from "../../src/lib/settings";
import type { Settings, Language } from "../../src/types/settings/settings";
import { UsersRound, Inbox, ShoppingCart, MessagesSquare, Users, Truck, UserRound, ShieldCheck, Search, Wallet, FileText, Plus, Eye, X, Download, Briefcase, Phone, Calendar, CreditCard, Package } from "lucide-react";
import { ShieldCheck as ShieldCheckIcon } from "lucide-react";
import { useRvbAuth } from "../../src/contexts/RvbAuthContext";
import { rvbPortalService } from "../../src/services/rvb-portal.service";
import { rvbConfigService } from "../../src/services/rvb-config.service";
import { rvbCatalogService } from "../../src/services/rvb-catalog.service";
import { workerRequestService } from "../../src/services/worker-request.service";
import { supplierRequestService } from "../../src/services/supplier-request.service";
import { customerRequestService } from "../../src/services/customer-request.service";
import { customerOrderService } from "../../src/services/customer-order.service";
import { rvbCustomerService } from "../../src/services/rvb-customer.service";

const TRANSLATIONS = {
  en: {
    kpi: {
      activeAccounts: { title: "Active Accounts", status: "Ready — live data" },
      pendingRequests: { title: "Pending Requests", status: "Ready — live data" },
      ordersReview: { title: "Orders Under Review", status: "Ready — live data" },
      unreadMessages: { title: "Unread Messages", status: "Ready — live" },
    },
    secondary: {
      workers: "Workers",
      suppliers: "Suppliers",
      customers: "Customers",
      supervisors: "Supervisors",
    },
    pendingWork: {
      title: "Pending Work",
      items: [
        { key: "worker", title: "Worker Requests", desc: "Leave, salary and profile requests from workers." },
        { key: "supplier", title: "Supplier Submissions", desc: "New supply proposals and delivery confirmations." },
        { key: "customer", title: "Customer Requests", desc: "Account, credit and order assistance requests." },
        { key: "orders", title: "Orders Under Review", desc: "Customer orders awaiting verification." },
      ],
      view: "View",
    },
    portalOverview: {
      title: "Portal Overview",
      workers: "Workers",
      suppliers: "Suppliers",
      customers: "Customers",
      management: "Management",
      active: "Active",
      archived: "Archived",
    },
    activity: {
      title: "Recent Activity",
      emptyTitle: "No activity yet",
      emptyDesc: "RVB activity will appear here as portal features are activated.",
    },
    quick: {
      title: "Quick Actions",
      manageAccounts: "Manage Accounts",
      reviewRequests: "Review Requests",
      reviewOrders: "Review Orders",
      openChats: "Open Chats",
      openDirectory: "Open Directory",
    },
    system: {
      title: "RVB System Status",
      webWorkspace: "Web Workspace",
      accounts: "Accounts",
      mobile: "Mobile Connection",
      realtime: "Real-time Services",
      notifications: "Notifications",
      ready: "Ready",
      comingSoon: "Coming soon",
    },
    portal: {
      loading: "Loading portal...",
      exportPdf: "Export PDF",
      profile: "Profile",
      financial: "Financial History",
      requests: "Requests",
      activity: "Activity",
      balance: "Current Balance",
      salary: "Monthly Salary",
      position: "Position",
      employment: "Employment Date",
      phone: "Phone",
      name: "Name",
      noData: "No data yet",
      requestHistory: "Request History",
      newRequest: "New Request",
      amount: "Amount",
      description: "Description",
      type: "Type",
      status: "Status",
      submitted: "Submitted",
      payment: "Payment",
      loan: "Loan",
      discrepancy: "Discrepancy",
      submit: "Submit",
      submitting: "Submitting...",
      purchases: "Purchases",
      payments: "Payments",
      sales: "Sales",
      orders: "Orders",
      newSupply: "New Supply",
      placeOrder: "Place Order",
      insertShipment: "Insert Shipment",
      products: "Products",
      quantity: "Quantity",
      total: "Total",
      cancel: "Cancel",
      edit: "Edit",
      save: "Save",
      customerManagement: "Customer Management",
      supervisorNote: "Supervisor Workspace - Customer Management inside Profile",
    },
  },
  fr: {
    kpi: {
      activeAccounts: { title: "Comptes actifs", status: "Prêt — données en direct" },
      pendingRequests: { title: "Demandes en attente", status: "Prêt — données en direct" },
      ordersReview: { title: "Commandes en vérification", status: "Prêt — données en direct" },
      unreadMessages: { title: "Messages non lus", status: "Prêt — en direct" },
    },
    secondary: {
      workers: "Travailleurs",
      suppliers: "Fournisseurs",
      customers: "Clients",
      supervisors: "Superviseurs",
    },
    pendingWork: {
      title: "Travail en attente",
      items: [
        { key: "worker", title: "Demandes travailleurs", desc: "Congés, salaires et demandes de profil." },
        { key: "supplier", title: "Soumissions fournisseurs", desc: "Nouvelles propositions et confirmations de livraison." },
        { key: "customer", title: "Demandes clients", desc: "Demandes d'assistance compte, crédit et commande." },
        { key: "orders", title: "Commandes en vérification", desc: "Commandes clients en attente de vérification." },
      ],
      view: "Voir",
    },
    portalOverview: {
      title: "Vue d’ensemble du portail",
      workers: "Travailleurs",
      suppliers: "Fournisseurs",
      customers: "Clients",
      management: "Direction",
      active: "Actif",
      archived: "Archivé",
    },
    activity: {
      title: "Activité récente",
      emptyTitle: "Aucune activité",
      emptyDesc: "L’activité RVB apparaîtra ici à mesure que les fonctionnalités du portail seront activées.",
    },
    quick: {
      title: "Actions rapides",
      manageAccounts: "Gérer les comptes",
      reviewRequests: "Examiner les demandes",
      reviewOrders: "Examiner les commandes",
      openChats: "Ouvrir les discussions",
      openDirectory: "Ouvrir l’annuaire",
    },
    system: {
      title: "État du système RVB",
      webWorkspace: "Espace web",
      accounts: "Comptes",
      mobile: "Connexion mobile",
      realtime: "Services temps réel",
      notifications: "Notifications",
      ready: "Prêt",
      comingSoon: "Bientôt disponible",
    },
    portal: {
      loading: "Chargement du portail...",
      exportPdf: "Exporter PDF",
      profile: "Profil",
      financial: "Historique financier",
      requests: "Demandes",
      activity: "Activité",
      balance: "Solde actuel",
      salary: "Salaire mensuel",
      position: "Poste",
      employment: "Date d'embauche",
      phone: "Téléphone",
      name: "Nom",
      noData: "Aucune donnée",
      requestHistory: "Historique des demandes",
      newRequest: "Nouvelle demande",
      amount: "Montant",
      description: "Description",
      type: "Type",
      status: "Statut",
      submitted: "Soumis",
      payment: "Paiement",
      loan: "Prêt",
      discrepancy: "Écart",
      submit: "Soumettre",
      submitting: "Envoi...",
      purchases: "Achats",
      payments: "Paiements",
      sales: "Ventes",
      orders: "Commandes",
      newSupply: "Nouvel approvisionnement",
      placeOrder: "Passer commande",
      insertShipment: "Insérer expédition",
      products: "Produits",
      quantity: "Quantité",
      total: "Total",
      cancel: "Annuler",
      edit: "Modifier",
      save: "Enregistrer",
      customerManagement: "Gestion clients",
      supervisorNote: "Espace superviseur - Gestion clients dans Profil",
    },
  },
  ar: {
    kpi: {
      activeAccounts: { title: "الحسابات النشطة", status: "جاهز — بيانات مباشرة" },
      pendingRequests: { title: "الطلبات المعلقة", status: "جاهز — بيانات مباشرة" },
      ordersReview: { title: "الطلبات قيد المراجعة", status: "جاهز — بيانات مباشرة" },
      unreadMessages: { title: "الرسائل غير المقروءة", status: "جاهز — مباشر" },
    },
    secondary: {
      workers: "العمال",
      suppliers: "الموردون",
      customers: "الزبائن",
      supervisors: "المشرفون",
    },
    pendingWork: {
      title: "العمليات المعلقة",
      items: [
        { key: "worker", title: "طلبات العمال", desc: "طلبات الإجازة والرواتب والملف الشخصي." },
        { key: "supplier", title: "تقديمات الموردين", desc: "اقتراحات توريد جديدة وتأكيدات التسليم." },
        { key: "customer", title: "طلبات الزبائن", desc: "طلبات المساعدة للحساب والائتمان والطلبيات." },
        { key: "orders", title: "الطلبات قيد المراجعة", desc: "طلبات زبائن بانتظار التحقق." },
      ],
      view: "عرض",
    },
    portalOverview: {
      title: "نظرة عامة على البوابة",
      workers: "العمال",
      suppliers: "الموردون",
      customers: "الزبائن",
      management: "الإدارة",
      active: "نشط",
      archived: "مؤرشف",
    },
    activity: {
      title: "النشاط الأخير",
      emptyTitle: "لا يوجد نشاط بعد",
      emptyDesc: "سيظهر نشاط RVB هنا عند تفعيل ميزات البوابة.",
    },
    quick: {
      title: "إجراءات سريعة",
      manageAccounts: "إدارة الحسابات",
      reviewRequests: "مراجعة الطلبات",
      reviewOrders: "مراجعة الطلبات",
      openChats: "فتح المحادثات",
      openDirectory: "فتح الدليل",
    },
    system: {
      title: "حالة نظام RVB",
      webWorkspace: "مساحة الويب",
      accounts: "الحسابات",
      mobile: "الاتصال بالجوال",
      realtime: "الخدمات المباشرة",
      notifications: "الإشعارات",
      ready: "جاهز",
      comingSoon: "قريباً",
    },
    portal: {
      loading: "جارٍ تحميل البوابة...",
      exportPdf: "تصدير PDF",
      profile: "الملف الشخصي",
      financial: "السجل المالي",
      requests: "الطلبات",
      activity: "النشاط",
      balance: "الرصيد الحالي",
      salary: "الراتب الشهري",
      position: "المنصب",
      employment: "تاريخ التوظيف",
      phone: "الهاتف",
      name: "الاسم",
      noData: "لا توجد بيانات",
      requestHistory: "سجل الطلبات",
      newRequest: "طلب جديد",
      amount: "المبلغ",
      description: "الوصف",
      type: "النوع",
      status: "الحالة",
      submitted: "تاريخ الإرسال",
      payment: "دفع",
      loan: "سلفة",
      discrepancy: "تناقض",
      submit: "إرسال",
      submitting: "جارٍ الإرسال...",
      purchases: "المشتريات",
      payments: "المدفوعات",
      sales: "المبيعات",
      orders: "الطلبات",
      newSupply: "توريد جديد",
      placeOrder: "تقديم طلب",
      insertShipment: "إدخال شحنة",
      products: "المنتجات",
      quantity: "الكمية",
      total: "الإجمالي",
      cancel: "إلغاء",
      edit: "تعديل",
      save: "حفظ",
      customerManagement: "إدارة الزبائن",
      supervisorNote: "مساحة المشرف - إدارة الزبائن داخل الملف",
    },
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

function WorkerPortal({ settings }: { settings: Settings }) {
  const lang = (settings.language as Language) || "en";
  const t = (TRANSLATIONS as any)[lang]?.portal ?? (TRANSLATIONS as any).en.portal;
  const isRtl = lang === "ar";
  const [worker, setWorker] = useState<any>(null);
  const [financial, setFinancial] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reqType, setReqType] = useState<"payment" | "loan" | "discrepancy">("payment");
  const [reqAmount, setReqAmount] = useState("");
  const [reqDesc, setReqDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const currency = settings.currency as any;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [w, fin, acts, reqs] = await Promise.all([
        rvbPortalService.getWorker().catch(() => null),
        rvbPortalService.getWorkerFinancial().catch(() => []),
        rvbPortalService.getWorkerActivities().catch(() => []),
        workerRequestService.list().catch(() => []),
      ]);
      setWorker(w);
      setFinancial(Array.isArray(fin) ? fin : []);
      setActivities(Array.isArray(acts) ? acts : []);
      setRequests(Array.isArray(reqs) ? reqs : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const handleCreateRequest = async () => {
    if (!worker) return;
    const amt = Number(reqAmount);
    if (reqType !== "discrepancy") {
      if (!Number.isFinite(amt) || amt <= 0) { alert("Amount must be >0"); return; }
      if (reqType === "payment" && amt > Number(worker.balance || 0)) { alert("Payment amount must be <= credit balance"); return; }
      if (reqType === "loan" && amt <= Number(worker.balance || 0)) { alert("Loan amount must be > credit"); return; }
    } else {
      if (!reqDesc.trim()) { alert("Description required for discrepancy"); return; }
    }
    setSubmitting(true);
    try {
      await workerRequestService.create({ workerId: worker.id, type: reqType, amount: reqType === "discrepancy" ? undefined : amt, description: reqDesc.trim() || undefined } as any);
      setReqAmount(""); setReqDesc("");
      await load();
    } catch (e: any) { alert(e?.data?.code || e?.message || "Failed"); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>{t.loading}</div>;
  if (error) return <div style={{ padding: 16, color: "var(--danger)", border: "1px solid var(--danger-border)", borderRadius: 10, background: "var(--danger-soft)" }}>{error}</div>;
  if (!worker) return <div style={{ padding: 16, color: "var(--muted)" }}>{t.noData}</div>;

  return (
    <div dir={isRtl ? "rtl" : "ltr"} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{t.profile}</h2>
        <button type="button" onClick={() => window.print()} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}><Download size={14} /> {t.exportPdf}</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        <div style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 12, background: "var(--panel)", display: "flex", gap: 14, alignItems: "center" }}>
          <span style={{ width: 64, height: 64, display: "grid", placeItems: "center", borderRadius: 12, background: "var(--panel-hover)", border: "1px solid var(--border)", fontWeight: 800, fontSize: 18, color: "var(--muted)", overflow: "hidden" }}>
            {worker.profilePicture ? <img src={worker.profilePicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(worker.name)}
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <strong style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{worker.name}</strong>
            <small style={{ color: "var(--muted)", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}><Phone size={12} /> {worker.phone}</small>
            <small style={{ color: "var(--muted)", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}><Briefcase size={12} /> {worker.position}</small>
          </span>
        </div>
        <div style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 12, background: "var(--panel)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><small style={{ color: "var(--muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{t.salary}</small><div style={{ fontSize: 14, fontWeight: 800 }}>{formatCurrency(Number(worker.monthlySalary||0), currency)}</div></div>
          <div><small style={{ color: "var(--muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{t.balance}</small><div style={{ fontSize: 14, fontWeight: 800, color: Number(worker.balance)>0 ? "#3A7D52" : "var(--muted)" }}>{formatCurrency(Number(worker.balance||0), currency)}</div></div>
          <div><small style={{ color: "var(--muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{t.employment}</small><div style={{ fontSize: 12 }}>{formatDate(worker.employmentDate, lang)}</div></div>
          <div><small style={{ color: "var(--muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Status</small><div style={{ fontSize: 12, fontWeight: 700 }}>{worker.status}</div></div>
        </div>
      </div>

      <div style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 12, background: "var(--panel)" }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800 }}>{t.financial}</h3>
        {financial.length === 0 ? <div style={{ padding: 12, border: "1px dashed var(--border)", borderRadius: 8, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>{t.noData}</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
            {financial.slice(0, 30).map((ev:any)=>(
              <div key={ev.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel-hover)", fontSize: 12 }}>
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontWeight: 700 }}>{ev.type} · {formatCurrency(ev.amount, currency)} <small style={{ color: "var(--muted)" }}>{formatDate(ev.createdAt, lang)}</small></span>{ev.note && <small style={{ color: "var(--subtle)" }}>{ev.note}</small>}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{formatCurrency(ev.balanceAfter ?? ev.balanceAfter ?? 0, currency)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 12, background: "var(--panel)" }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800 }}>{t.requests} · {t.newRequest}</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <select value={reqType} onChange={(e)=>setReqType(e.target.value as any)} style={{ minHeight: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel)", color: "var(--text)" }}>
            <option value="payment">{t.payment} (≤ credit)</option>
            <option value="loan">{t.loan} (&gt; credit)</option>
            <option value="discrepancy">{t.discrepancy}</option>
          </select>
          {reqType !== "discrepancy" && <input type="number" min="0" step="0.01" placeholder={t.amount} value={reqAmount} onChange={(e)=>setReqAmount(e.target.value)} style={{ flex: "1 1 120px", minHeight: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8 }} />}
          <input placeholder={reqType==="discrepancy" ? "Topic / description" : t.description} value={reqDesc} onChange={(e)=>setReqDesc(e.target.value)} style={{ flex: "2 1 160px", minHeight: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8 }} />
          <button type="button" onClick={handleCreateRequest} disabled={submitting} style={{ minHeight: 36, padding: "0 14px", borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{submitting ? t.submitting : t.submit}</button>
        </div>
        <h4 style={{ margin: "10px 0 8px", fontSize: 13, fontWeight: 700 }}>{t.requestHistory}</h4>
        {requests.length===0 ? <div style={{ padding: 12, border: "1px dashed var(--border)", borderRadius: 8, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>{t.noData}</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {requests.map((r:any)=>(
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel-hover)", fontSize: 12 }}>
                <span><strong>{r.type}</strong> · {r.amount ? formatCurrency(r.amount, currency) : ""} <small style={{ color: "var(--muted)" }}>{r.description || ""}</small></span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ padding: "2px 6px", borderRadius: 999, background: r.status==="under_review" ? "var(--accent-soft)" : r.status==="accepted" ? "rgba(58,125,82,0.12)" : "var(--danger-soft)", border: "1px solid var(--border)", fontSize: 10, fontWeight: 800 }}>{r.status}</span><small style={{ color: "var(--muted)" }}>{formatDate(r.submittedAt, lang)}</small></span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 12, background: "var(--panel)" }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800 }}>{t.activity}</h3>
        {activities.length===0 ? <div style={{ padding: 12, border: "1px dashed var(--border)", borderRadius: 8, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>{t.noData}</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
            {activities.slice(0,20).map((a:any)=>(
              <div key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 8px", borderBottom: "1px solid var(--border)", fontSize: 11 }}>
                <span style={{ fontWeight: 600 }}>{a.action}</span><span style={{ color: "var(--muted)" }}>{formatDate(a.createdAt, lang)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SupplierPortal({ settings }: { settings: Settings }) {
  const lang = (settings.language as Language) || "en";
  const t = (TRANSLATIONS as any)[lang]?.portal ?? (TRANSLATIONS as any).en.portal;
  const isRtl = lang === "ar";
  const currency = settings.currency as any;
  const [supplier, setSupplier] = useState<any>(null);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState<Record<string, { quantity: string; weightKg: string }>>({});
  const [discrepancy, setDiscrepancy] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, pur, pay, reqs, cat] = await Promise.all([
        rvbPortalService.getSupplier().catch(()=>null),
        rvbPortalService.getSupplierPurchases().catch(()=>[]),
        rvbPortalService.getSupplierPayments().catch(()=>[]),
        supplierRequestService.list().catch(()=>[]),
        rvbCatalogService.getProductsForSupplier().catch(()=>[]),
      ]);
      setSupplier(s);
      setPurchases(Array.isArray(pur)?pur:[]);
      setPayments(Array.isArray(pay)?pay:[]);
      setRequests(Array.isArray(reqs)?reqs:[]);
      setCatalog(Array.isArray(cat)?cat:[]);
    } finally { setLoading(false); }
  }, []);
  useEffect(()=>{void load();},[load]);

  const handleNewSupply = async () => {
    const items:any[] = [];
    let total = 0;
    for (const p of catalog) {
      const sel = selectedProducts[p.id];
      if (!sel) continue;
      const qty = Number(sel.quantity||0);
      const w = Number(sel.weightKg|| p.weightKg || 0);
      if (!Number.isFinite(qty) || qty<=0) continue;
      const price = Number(p.price||0);
      const itTotal = qty * w * price;
      items.push({ productId: p.id, quantity: qty, weightKg: w, price, total: itTotal });
      total += itTotal;
    }
    if (items.length===0) { alert("Select at least one product with quantity"); return; }
    setSubmitting(true);
    try {
      await supplierRequestService.create({ supplierId: supplier.id, type: "new_supply", items, total } as any);
      setSelectedProducts({});
      await load();
    } catch(e:any){ alert(e?.data?.code || e?.message || "Failed"); }
    finally{ setSubmitting(false); }
  };
  const handleDiscrepancy = async () => {
    if (!discrepancy.trim()) { alert("Description required"); return; }
    setSubmitting(true);
    try {
      await supplierRequestService.create({ supplierId: supplier.id, type: "discrepancy", description: discrepancy.trim() } as any);
      setDiscrepancy("");
      await load();
    } catch(e:any){ alert(e?.message || "Failed"); }
    finally{ setSubmitting(false); }
  };

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>{t.loading}</div>;
  if (!supplier) return <div style={{ padding: 16, color: "var(--muted)" }}>{t.noData}</div>;

  return (
    <div dir={isRtl?"rtl":"ltr"} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin:0, fontSize:18, fontWeight:800 }}>{t.profile}</h2>
        <button type="button" onClick={()=>window.print()} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--panel)", cursor:"pointer", fontSize:12, fontWeight:700 }}><Download size={14}/>{t.exportPdf}</button>
      </div>
      <div style={{ padding:16, border:"1px solid var(--border)", borderRadius:12, background:"var(--panel)", display:"flex", gap:14, alignItems:"center" }}>
        <span style={{ width:56, height:56, display:"grid", placeItems:"center", borderRadius:12, background:"var(--panel-hover)", border:"1px solid var(--border)", fontWeight:800 }}>{initials(supplier.name)}</span>
        <span style={{ display:"flex", flexDirection:"column", gap:4 }}><strong>{supplier.name}</strong><small style={{ color:"var(--muted)" }}>{supplier.phone}</small><small style={{ fontWeight:700, color: Number(supplier.balance)>0?"#3A7D52":"var(--muted)" }}>{t.balance}: {formatCurrency(Number(supplier.balance||0), currency)}</small></span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px,1fr))", gap:14 }}>
        <div style={{ padding:16, border:"1px solid var(--border)", borderRadius:12, background:"var(--panel)" }}>
          <h3 style={{ margin:"0 0 8px", fontSize:14, fontWeight:800 }}>{t.purchases}</h3>
          {purchases.length===0 ? <div style={{ padding:12, textAlign:"center", color:"var(--muted)", border:"1px dashed var(--border)", borderRadius:8, fontSize:12 }}>{t.noData}</div> : (
            <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:260, overflowY:"auto" }}>
              {purchases.slice(0,15).map((p:any)=>(
                <div key={p.id} style={{ display:"flex", justifyContent:"space-between", gap:8, fontSize:11, padding:"6px 8px", border:"1px solid var(--border)", borderRadius:8, background:"var(--panel-hover)" }}>
                  <span>{formatDate(p.date||p.createdAt, lang)} · {(p.items||[]).length} items</span><span style={{ fontWeight:700 }}>{formatCurrency(Number(p.total||0), currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding:16, border:"1px solid var(--border)", borderRadius:12, background:"var(--panel)" }}>
          <h3 style={{ margin:"0 0 8px", fontSize:14, fontWeight:800 }}>{t.payments}</h3>
          {payments.length===0 ? <div style={{ padding:12, textAlign:"center", color:"var(--muted)", border:"1px dashed var(--border)", borderRadius:8, fontSize:12 }}>{t.noData}</div> : (
            <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:260, overflowY:"auto" }}>
              {payments.slice(0,15).map((p:any)=>(
                <div key={p.id} style={{ display:"flex", justifyContent:"space-between", gap:8, fontSize:11, padding:"6px 8px", border:"1px solid var(--border)", borderRadius:8, background:"var(--panel-hover)" }}>
                  <span>{formatDate(p.date, lang)}</span><span style={{ fontWeight:700 }}>{formatCurrency(Number(p.amount||0), currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ padding:16, border:"1px solid var(--border)", borderRadius:12, background:"var(--panel)" }}>
        <h3 style={{ margin:"0 0 10px", fontSize:14, fontWeight:800 }}>{t.newSupply}</h3>
        {catalog.length===0 ? <div style={{ color:"var(--muted)", fontSize:12 }}>{t.noData}</div> : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {catalog.slice(0, 20).map((p:any)=>(
              <div key={p.id} style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", padding:"8px 10px", border:"1px solid var(--border)", borderRadius:8, background:"var(--panel-hover)" }}>
                <span style={{ flex:"1 1 160px", fontSize:12, fontWeight:600 }}>{p.name} <small style={{ color:"var(--muted)" }}>{formatCurrency(Number(p.price||0), currency)}/kg</small></span>
                <input placeholder={t.quantity} type="number" min="0" step="1" value={selectedProducts[p.id]?.quantity || ""} onChange={(e)=>setSelectedProducts(prev=>({...prev, [p.id]: {...(prev[p.id]||{weightKg:String(p.weightKg||"")}), quantity:e.target.value, weightKg: prev[p.id]?.weightKg || String(p.weightKg||"") }}))} style={{ width:90, minHeight:32, padding:"0 8px", border:"1px solid var(--border)", borderRadius:8 }} />
                <input placeholder="kg" type="number" min="0" step="0.01" value={selectedProducts[p.id]?.weightKg || ""} onChange={(e)=>setSelectedProducts(prev=>({...prev, [p.id]: {...(prev[p.id]||{quantity:""}), weightKg:e.target.value, quantity: prev[p.id]?.quantity || "" }}))} style={{ width:80, minHeight:32, padding:"0 8px", border:"1px solid var(--border)", borderRadius:8 }} />
              </div>
            ))}
            <button type="button" onClick={handleNewSupply} disabled={submitting} style={{ alignSelf:"flex-start", minHeight:36, padding:"0 14px", borderRadius:8, border:"1px solid var(--accent)", background:"var(--accent)", color:"#fff", fontWeight:700, cursor:"pointer" }}>{submitting? t.submitting : t.submit}</button>
          </div>
        )}
        <div style={{ marginTop:14, paddingTop:12, borderTop:"1px solid var(--border)" }}>
          <h4 style={{ margin:"0 0 8px", fontSize:13, fontWeight:700 }}>{t.discrepancy}</h4>
          <div style={{ display:"flex", gap:8 }}>
            <input placeholder={t.description} value={discrepancy} onChange={(e)=>setDiscrepancy(e.target.value)} style={{ flex:1, minHeight:36, padding:"0 10px", border:"1px solid var(--border)", borderRadius:8 }} />
            <button type="button" onClick={handleDiscrepancy} disabled={submitting} style={{ minHeight:36, padding:"0 14px", borderRadius:8, border:"1px solid var(--border)", background:"var(--panel)", cursor:"pointer", fontWeight:700 }}>{t.submit}</button>
          </div>
        </div>
        <h4 style={{ margin:"14px 0 8px", fontSize:13, fontWeight:700 }}>{t.requestHistory}</h4>
        {requests.length===0 ? <div style={{ padding:8, color:"var(--muted)", fontSize:12, border:"1px dashed var(--border)", borderRadius:8, textAlign:"center" }}>{t.noData}</div> : (
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {requests.map((r:any)=>(
              <div key={r.id} style={{ display:"flex", justifyContent:"space-between", gap:8, padding:"8px 10px", border:"1px solid var(--border)", borderRadius:8, background:"var(--panel-hover)", fontSize:12 }}>
                <span><strong>{r.type}</strong> {r.total ? formatCurrency(r.total, currency):""} <small style={{ color:"var(--muted)" }}>{r.description||""}</small></span><span style={{ fontSize:10, padding:"2px 6px", borderRadius:999, background: r.status==="under_review"?"var(--accent-soft)":"var(--panel)", border:"1px solid var(--border)", fontWeight:800 }}>{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CustomerPortal({ settings }: { settings: Settings }) {
  const lang = (settings.language as Language) || "en";
  const t = (TRANSLATIONS as any)[lang]?.portal ?? (TRANSLATIONS as any).en.portal;
  const isRtl = lang === "ar";
  const currency = settings.currency as any;
  const [customer, setCustomer] = useState<any>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderItems, setOrderItems] = useState<Record<string, { quantity: string; weightKg: string }>>({});
  const [orderNotes, setOrderNotes] = useState("");
  const [shipmentItems, setShipmentItems] = useState<Record<string, { quantity: string; weightKg: string }>>({});
  const [shipmentDesc, setShipmentDesc] = useState("");
  const [discrepancy, setDiscrepancy] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [editItems, setEditItems] = useState<Record<string, { quantity: string; weightKg: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s, pay, ord, reqs, cat] = await Promise.all([
        rvbPortalService.getCustomer().catch(()=>null),
        rvbPortalService.getCustomerSales().catch(()=>[]),
        rvbPortalService.getCustomerPayments().catch(()=>[]),
        rvbPortalService.getCustomerOrders().catch(()=>[]),
        customerRequestService.list().catch(()=>[]),
        rvbCatalogService.getProductsForCustomer().catch(()=>[]),
      ]);
      setCustomer(c);
      setSales(Array.isArray(s)?s:[]);
      setPayments(Array.isArray(pay)?pay:[]);
      setOrders(Array.isArray(ord)?ord:[]);
      setRequests(Array.isArray(reqs)?reqs:[]);
      setCatalog(Array.isArray(cat)?cat:[]);
    } finally { setLoading(false); }
  }, []);
  useEffect(()=>{void load();},[load]);

  const buildItems = (catalogList:any[], sel:Record<string, { quantity:string; weightKg:string }>) => {
    const items:any[] = [];
    let total = 0;
    for (const p of catalogList) {
      const v = sel[p.id];
      if (!v) continue;
      const qty = Number(v.quantity||0);
      if (!Number.isFinite(qty) || qty<=0) continue;
      const w = Number(v.weightKg|| p.weightKg||0);
      const price = Number(p.price||0);
      const itTotal = qty * w * price;
      items.push({ productId: p.id, quantity: qty, weightKg: w, price, total: itTotal });
      total+=itTotal;
    }
    return { items, total };
  };

  const handlePlaceOrder = async () => {
    const { items, total } = buildItems(catalog, orderItems);
    if (items.length===0) { alert("Select products"); return; }
    setSubmitting(true);
    try {
      await customerOrderService.create({ items, total, notes: orderNotes.trim()||undefined } as any);
      setOrderItems({}); setOrderNotes("");
      await load();
    } catch(e:any){ alert(e?.data?.code || e?.message || "Failed"); }
    finally{ setSubmitting(false); }
  };
  const handleInsertShipment = async () => {
    const { items, total } = buildItems(catalog, shipmentItems);
    if (items.length===0 && !shipmentDesc.trim()) { alert("Add items or description"); return; }
    setSubmitting(true);
    try {
      await customerRequestService.create({ customerId: customer.id, type: "insert_shipment", items: items.length?items:undefined, total: items.length?total:undefined, description: shipmentDesc.trim()||undefined } as any);
      setShipmentItems({}); setShipmentDesc("");
      await load();
    } catch(e:any){ alert(e?.message||"Failed"); }
    finally{ setSubmitting(false); }
  };
  const handleDiscrepancy = async () => {
    if (!discrepancy.trim()) { alert("Description required"); return; }
    setSubmitting(true);
    try {
      await customerRequestService.create({ customerId: customer.id, type: "discrepancy", description: discrepancy.trim() } as any);
      setDiscrepancy("");
      await load();
    } catch(e:any){ alert(e?.message||"Failed"); }
    finally{ setSubmitting(false); }
  };
  const handleCancelOrder = async (id:string) => {
    if (!confirm("Cancel order?")) return;
    try { await customerOrderService.cancel(id); await load(); } catch(e:any){ alert(e?.message||"Cancel failed"); }
  };
  const handleEditOrder = async () => {
    if (!editingOrder) return;
    const { items } = buildItems(catalog, editItems);
    if (items.length===0) { alert("Select products"); return; }
    setSubmitting(true);
    try { await customerOrderService.edit(editingOrder.id, items); setEditingOrder(null); setEditItems({}); await load(); } catch(e:any){ alert(e?.message||"Edit failed"); }
    finally{ setSubmitting(false); }
  };

  if (loading) return <div style={{ padding:24, textAlign:"center", color:"var(--muted)" }}>{t.loading}</div>;
  if (!customer) return <div style={{ padding:16, color:"var(--muted)" }}>{t.noData}</div>;

  return (
    <div dir={isRtl?"rtl":"ltr"} style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h2 style={{ margin:0, fontSize:18, fontWeight:800 }}>{t.profile}</h2>
        <button type="button" onClick={()=>window.print()} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--panel)", cursor:"pointer", fontSize:12, fontWeight:700 }}><Download size={14}/>{t.exportPdf}</button>
      </div>
      <div style={{ padding:16, border:"1px solid var(--border)", borderRadius:12, background:"var(--panel)", display:"flex", gap:14, alignItems:"center" }}>
        <span style={{ width:56, height:56, display:"grid", placeItems:"center", borderRadius:12, background:"var(--panel-hover)", border:"1px solid var(--border)", fontWeight:800 }}>{initials(customer.name)}</span>
        <span style={{ display:"flex", flexDirection:"column", gap:4 }}><strong>{customer.name}</strong><small style={{ color:"var(--muted)" }}>{customer.phone} · {customer.type}</small><small style={{ fontWeight:700, color: Number(customer.balance)>0?"#3A7D52":"var(--muted)" }}>{t.balance}: {formatCurrency(Number(customer.balance||0), currency)}</small></span>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px,1fr))", gap:14 }}>
        <div style={{ padding:16, border:"1px solid var(--border)", borderRadius:12, background:"var(--panel)" }}>
          <h3 style={{ margin:"0 0 8px", fontSize:14, fontWeight:800 }}>{t.sales}</h3>
          {sales.length===0 ? <div style={{ padding:12, textAlign:"center", color:"var(--muted)", border:"1px dashed var(--border)", borderRadius:8, fontSize:12 }}>{t.noData}</div> : (
            <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:260, overflowY:"auto" }}>
              {sales.slice(0,10).map((s:any)=>(
                <div key={s.id} style={{ display:"flex", justifyContent:"space-between", gap:8, padding:"6px 8px", border:"1px solid var(--border)", borderRadius:8, background:"var(--panel-hover)", fontSize:11 }}>
                  <span>{formatDate(s.date, lang)} · {(s.items||[]).length} items</span><span style={{ fontWeight:700 }}>{formatCurrency(Number(s.total||0), currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding:16, border:"1px solid var(--border)", borderRadius:12, background:"var(--panel)" }}>
          <h3 style={{ margin:"0 0 8px", fontSize:14, fontWeight:800 }}>{t.payments}</h3>
          {payments.length===0 ? <div style={{ padding:12, textAlign:"center", color:"var(--muted)", border:"1px dashed var(--border)", borderRadius:8, fontSize:12 }}>{t.noData}</div> : (
            <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:260, overflowY:"auto" }}>
              {payments.slice(0,10).map((p:any)=>(
                <div key={p.id} style={{ display:"flex", justifyContent:"space-between", gap:8, padding:"6px 8px", border:"1px solid var(--border)", borderRadius:8, background:"var(--panel-hover)", fontSize:11 }}>
                  <span>{formatDate(p.date, lang)}</span><span style={{ fontWeight:700 }}>{formatCurrency(Number(p.amount||0), currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding:16, border:"1px solid var(--border)", borderRadius:12, background:"var(--panel)" }}>
        <h3 style={{ margin:"0 0 10px", fontSize:14, fontWeight:800 }}>{t.placeOrder}</h3>
        {catalog.length===0 ? <div style={{ color:"var(--muted)", fontSize:12 }}>{t.noData}</div> : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {catalog.slice(0,15).map((p:any)=>(
              <div key={p.id} style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", padding:"8px 10px", border:"1px solid var(--border)", borderRadius:8, background:"var(--panel-hover)" }}>
                <span style={{ flex:"1 1 160px", fontSize:12, fontWeight:600 }}>{p.name} <small style={{ color:"var(--muted)" }}>{formatCurrency(Number(p.price||0), currency)}/kg</small></span>
                <input placeholder={t.quantity} type="number" min="0" step="1" value={orderItems[p.id]?.quantity || ""} onChange={(e)=>setOrderItems(prev=>({...prev, [p.id]: {...(prev[p.id]||{weightKg:String(p.weightKg||"")}), quantity:e.target.value }}))} style={{ width:90, minHeight:32, padding:"0 8px", border:"1px solid var(--border)", borderRadius:8 }} />
                <input placeholder="kg" type="number" min="0" step="0.01" value={orderItems[p.id]?.weightKg || ""} onChange={(e)=>setOrderItems(prev=>({...prev, [p.id]: {...(prev[p.id]||{quantity:""}), weightKg:e.target.value }}))} style={{ width:80, minHeight:32, padding:"0 8px", border:"1px solid var(--border)", borderRadius:8 }} />
              </div>
            ))}
            <input placeholder={t.description + " (optional)"} value={orderNotes} onChange={(e)=>setOrderNotes(e.target.value)} style={{ minHeight:36, padding:"0 10px", border:"1px solid var(--border)", borderRadius:8 }} />
            <button type="button" onClick={handlePlaceOrder} disabled={submitting} style={{ alignSelf:"flex-start", minHeight:36, padding:"0 14px", borderRadius:8, border:"1px solid var(--accent)", background:"var(--accent)", color:"#fff", fontWeight:700, cursor:"pointer" }}>{submitting? t.submitting : t.submit}</button>
          </div>
        )}
      </div>

      <div style={{ padding:16, border:"1px solid var(--border)", borderRadius:12, background:"var(--panel)" }}>
        <h3 style={{ margin:"0 0 10px", fontSize:14, fontWeight:800 }}>{t.insertShipment} / {t.discrepancy}</h3>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div>
            <h4 style={{ margin:"0 0 6px", fontSize:13, fontWeight:700 }}>{t.insertShipment}</h4>
            {catalog.slice(0,10).map((p:any)=>(
              <div key={"ship-"+p.id} style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", padding:"6px 8px", border:"1px solid var(--border)", borderRadius:8, background:"var(--panel-hover)", marginBottom:6 }}>
                <span style={{ flex:"1 1 140px", fontSize:11, fontWeight:600 }}>{p.name}</span>
                <input placeholder={t.quantity} type="number" min="0" step="1" value={shipmentItems[p.id]?.quantity||""} onChange={(e)=>setShipmentItems(prev=>({...prev, [p.id]: {...(prev[p.id]||{weightKg:String(p.weightKg||"")}), quantity:e.target.value}}))} style={{ width:80, minHeight:32, padding:"0 8px", border:"1px solid var(--border)", borderRadius:8 }} />
                <input placeholder="kg" type="number" min="0" step="0.01" value={shipmentItems[p.id]?.weightKg||""} onChange={(e)=>setShipmentItems(prev=>({...prev, [p.id]: {...(prev[p.id]||{quantity:""}), weightKg:e.target.value}}))} style={{ width:70, minHeight:32, padding:"0 8px", border:"1px solid var(--border)", borderRadius:8 }} />
              </div>
            ))}
            <input placeholder={t.description} value={shipmentDesc} onChange={(e)=>setShipmentDesc(e.target.value)} style={{ width:"100%", minHeight:36, padding:"0 10px", border:"1px solid var(--border)", borderRadius:8, marginTop:6 }} />
            <button type="button" onClick={handleInsertShipment} disabled={submitting} style={{ marginTop:8, minHeight:34, padding:"0 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--panel)", cursor:"pointer", fontWeight:700 }}>{t.submit}</button>
          </div>
          <div style={{ borderTop:"1px solid var(--border)", paddingTop:10 }}>
            <h4 style={{ margin:"0 0 6px", fontSize:13, fontWeight:700 }}>{t.discrepancy}</h4>
            <div style={{ display:"flex", gap:8 }}>
              <input placeholder={t.description} value={discrepancy} onChange={(e)=>setDiscrepancy(e.target.value)} style={{ flex:1, minHeight:36, padding:"0 10px", border:"1px solid var(--border)", borderRadius:8 }} />
              <button type="button" onClick={handleDiscrepancy} disabled={submitting} style={{ minHeight:36, padding:"0 14px", borderRadius:8, border:"1px solid var(--border)", background:"var(--panel)", cursor:"pointer", fontWeight:700 }}>{t.submit}</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding:16, border:"1px solid var(--border)", borderRadius:12, background:"var(--panel)" }}>
        <h3 style={{ margin:"0 0 8px", fontSize:14, fontWeight:800 }}>{t.orders}</h3>
        {orders.length===0 ? <div style={{ padding:12, textAlign:"center", color:"var(--muted)", border:"1px dashed var(--border)", borderRadius:8, fontSize:12 }}>{t.noData}</div> : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {orders.slice(0,15).map((o:any)=>(
              <div key={o.id} style={{ display:"flex", flexDirection:"column", gap:6, padding:"10px 12px", border:"1px solid var(--border)", borderRadius:8, background:"var(--panel-hover)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", gap:8, alignItems:"center" }}>
                  <span style={{ fontSize:11, fontWeight:700 }}>{o.id.slice(0,8)} · {formatCurrency(Number(o.total||0), currency)}</span>
                  <span style={{ padding:"2px 6px", borderRadius:999, background: o.status==="under_review"?"var(--accent-soft)": o.status==="accepted"?"rgba(58,125,82,0.12)":"var(--danger-soft)", border:"1px solid var(--border)", fontSize:10, fontWeight:800 }}>{o.status}</span>
                </div>
                <div style={{ fontSize:11, color:"var(--muted)" }}>{(o.items||[]).length} items · {formatDate(o.submittedAt, lang)}</div>
                {o.status==="under_review" && (
                  <div style={{ display:"flex", gap:6 }}>
                    <button type="button" onClick={()=>{ setEditingOrder(o); const map:Record<string, any>={}; for(const it of o.items||[]){ map[it.productId]={ quantity:String(it.quantity), weightKg:String(it.weightKg)} } setEditItems(map); }} style={{ flex:1, minHeight:32, borderRadius:8, border:"1px solid var(--border)", background:"var(--panel)", cursor:"pointer", fontSize:11, fontWeight:700 }}>{t.edit}</button>
                    <button type="button" onClick={()=>handleCancelOrder(o.id)} style={{ flex:1, minHeight:32, borderRadius:8, border:"1px solid var(--danger)", background:"var(--danger-soft)", color:"var(--danger)", cursor:"pointer", fontSize:11, fontWeight:700 }}>{t.cancel}</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {editingOrder && (
          <div style={{ marginTop:12, padding:12, border:"1px solid var(--border)", borderRadius:10, background:"var(--panel-hover)" }}>
            <h4 style={{ margin:"0 0 8px", fontSize:13, fontWeight:700 }}>Edit Order {editingOrder.id.slice(0,8)}</h4>
            {catalog.slice(0,10).map((p:any)=>(
              <div key={"edit-"+p.id} style={{ display:"flex", gap:6, alignItems:"center", marginBottom:6 }}>
                <span style={{ flex:"1 1 120px", fontSize:11 }}>{p.name}</span>
                <input type="number" placeholder={t.quantity} value={editItems[p.id]?.quantity||""} onChange={(e)=>setEditItems(prev=>({...prev, [p.id]: {...(prev[p.id]||{weightKg:String(p.weightKg||"")}), quantity:e.target.value}}))} style={{ width:70, minHeight:32, padding:"0 6px", border:"1px solid var(--border)", borderRadius:8 }} />
                <input type="number" placeholder="kg" value={editItems[p.id]?.weightKg||""} onChange={(e)=>setEditItems(prev=>({...prev, [p.id]: {...(prev[p.id]||{quantity:""}), weightKg:e.target.value}}))} style={{ width:60, minHeight:32, padding:"0 6px", border:"1px solid var(--border)", borderRadius:8 }} />
              </div>
            ))}
            <div style={{ display:"flex", gap:8, marginTop:8 }}>
              <button type="button" onClick={handleEditOrder} disabled={submitting} style={{ flex:1, minHeight:32, borderRadius:8, border:"1px solid var(--accent)", background:"var(--accent)", color:"#fff", fontWeight:700 }}>{t.save}</button>
              <button type="button" onClick={()=>{setEditingOrder(null); setEditItems({});}} style={{ flex:1, minHeight:32, borderRadius:8, border:"1px solid var(--border)", background:"var(--panel)", cursor:"pointer" }}>{t.cancel}</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding:16, border:"1px solid var(--border)", borderRadius:12, background:"var(--panel)" }}>
        <h3 style={{ margin:"0 0 8px", fontSize:14, fontWeight:800 }}>{t.requests}</h3>
        {requests.length===0 ? <div style={{ padding:12, textAlign:"center", color:"var(--muted)", border:"1px dashed var(--border)", borderRadius:8, fontSize:12 }}>{t.noData}</div> : (
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {requests.map((r:any)=>(
              <div key={r.id} style={{ display:"flex", justifyContent:"space-between", gap:8, padding:"8px 10px", border:"1px solid var(--border)", borderRadius:8, background:"var(--panel-hover)", fontSize:12 }}>
                <span><strong>{r.type}</strong> {r.total?formatCurrency(r.total,currency):""} <small style={{ color:"var(--muted)" }}>{r.description||""}</small></span><span style={{ fontSize:10, padding:"2px 6px", borderRadius:999, background: r.status==="under_review"?"var(--accent-soft)":"var(--panel)", border:"1px solid var(--border)", fontWeight:800 }}>{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SupervisorPortal({ settings }: { settings: Settings }) {
  const lang = (settings.language as Language) || "en";
  const t = (TRANSLATIONS as any)[lang]?.portal ?? (TRANSLATIONS as any).en.portal;
  const isRtl = lang === "ar";
  const currency = settings.currency as any;
  const [worker, setWorker] = useState<any>(null);
  const [financial, setFinancial] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reqType, setReqType] = useState<"payment"|"loan"|"discrepancy">("payment");
  const [reqAmount, setReqAmount] = useState("");
  const [reqDesc, setReqDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, fin, acts, reqs, custs, ords] = await Promise.all([
        rvbPortalService.getWorker().catch(()=>null),
        rvbPortalService.getWorkerFinancial().catch(()=>[]),
        rvbPortalService.getWorkerActivities().catch(()=>[]),
        workerRequestService.list().catch(()=>[]),
        rvbCustomerService.list().catch(()=>[]),
        customerOrderService.list({ status: "under_review" }).catch(()=>[]),
      ]);
      setWorker(w); setFinancial(Array.isArray(fin)?fin:[]); setActivities(Array.isArray(acts)?acts:[]); setRequests(Array.isArray(reqs)?reqs:[]); setCustomers(Array.isArray(custs)?custs:[]); setOrders(Array.isArray(ords)?ords:[]);
    } finally { setLoading(false); }
  }, []);
  useEffect(()=>{void load();},[load]);

  const handleCreateRequest = async () => {
    if (!worker) return;
    const amt = Number(reqAmount);
    if (reqType!=="discrepancy" && (!Number.isFinite(amt)||amt<=0)) { alert("Amount >0"); return; }
    if (reqType==="discrepancy" && !reqDesc.trim()) { alert("Description required"); return; }
    setSubmitting(true);
    try {
      await workerRequestService.create({ workerId: worker.id, type: reqType, amount: reqType==="discrepancy"?undefined:amt, description: reqDesc.trim()||undefined } as any);
      setReqAmount(""); setReqDesc(""); await load();
    } catch(e:any){ alert(e?.message||"Failed"); }
    finally{ setSubmitting(false); }
  };

  if (loading) return <div style={{ padding:24, textAlign:"center", color:"var(--muted)" }}>{t.loading}</div>;
  if (!worker) return <div style={{ padding:16, color:"var(--muted)" }}>{t.noData}</div>;

  return (
    <div dir={isRtl?"rtl":"ltr"} style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h2 style={{ margin:0, fontSize:18, fontWeight:800 }}>{t.profile} · Supervisor</h2>
        <button type="button" onClick={()=>window.print()} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--panel)", cursor:"pointer", fontSize:12, fontWeight:700 }}><Download size={14}/>{t.exportPdf}</button>
      </div>
      <div style={{ padding:16, border:"1px solid var(--border)", borderRadius:12, background:"var(--panel)", display:"flex", gap:14, alignItems:"center" }}>
        <span style={{ width:56, height:56, display:"grid", placeItems:"center", borderRadius:12, background:"var(--panel-hover)", border:"1px solid var(--border)", fontWeight:800 }}>{initials(worker.name)}</span>
        <span style={{ display:"flex", flexDirection:"column", gap:4 }}><strong>{worker.name}</strong><small style={{ color:"var(--muted)" }}>{worker.phone} · {worker.position}</small><small style={{ fontWeight:700 }}>{t.balance}: {formatCurrency(Number(worker.balance||0), currency)}</small></span>
      </div>
      <div style={{ padding:16, border:"1px solid var(--border)", borderRadius:12, background:"var(--panel)" }}>
        <h3 style={{ margin:"0 0 10px", fontSize:14, fontWeight:800 }}>{t.financial}</h3>
        {financial.length===0 ? <div style={{ padding:12, textAlign:"center", color:"var(--muted)", border:"1px dashed var(--border)", borderRadius:8, fontSize:12 }}>{t.noData}</div> : (
          <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:240, overflowY:"auto" }}>
            {financial.slice(0,15).map((ev:any)=>(
              <div key={ev.id} style={{ display:"flex", justifyContent:"space-between", gap:8, padding:"6px 8px", border:"1px solid var(--border)", borderRadius:8, background:"var(--panel-hover)", fontSize:11 }}>
                <span>{ev.type} · {formatCurrency(ev.amount, currency)} <small style={{ color:"var(--muted)" }}>{formatDate(ev.createdAt, lang)}</small></span><span style={{ fontWeight:700 }}>{formatCurrency(ev.balanceAfter||0, currency)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ padding:16, border:"1px solid var(--border)", borderRadius:12, background:"var(--panel)" }}>
        <h3 style={{ margin:"0 0 8px", fontSize:14, fontWeight:800 }}>{t.requests}</h3>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
          <select value={reqType} onChange={(e)=>setReqType(e.target.value as any)} style={{ minHeight:36, padding:"0 10px", border:"1px solid var(--border)", borderRadius:8 }}>
            <option value="payment">{t.payment}</option><option value="loan">{t.loan}</option><option value="discrepancy">{t.discrepancy}</option>
          </select>
          {reqType!=="discrepancy" && <input type="number" placeholder={t.amount} value={reqAmount} onChange={(e)=>setReqAmount(e.target.value)} style={{ flex:"1 1 100px", minHeight:36, padding:"0 10px", border:"1px solid var(--border)", borderRadius:8 }} />}
          <input placeholder={t.description} value={reqDesc} onChange={(e)=>setReqDesc(e.target.value)} style={{ flex:"2 1 160px", minHeight:36, padding:"0 10px", border:"1px solid var(--border)", borderRadius:8 }} />
          <button type="button" onClick={handleCreateRequest} disabled={submitting} style={{ minHeight:36, padding:"0 14px", borderRadius:8, border:"1px solid var(--accent)", background:"var(--accent)", color:"#fff", fontWeight:700 }}>{submitting? t.submitting : t.submit}</button>
        </div>
        {requests.length===0 ? <div style={{ padding:8, textAlign:"center", color:"var(--muted)", fontSize:12, border:"1px dashed var(--border)", borderRadius:8 }}>{t.noData}</div> : (
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {requests.map((r:any)=>(
              <div key={r.id} style={{ display:"flex", justifyContent:"space-between", gap:8, padding:"6px 8px", border:"1px solid var(--border)", borderRadius:8, background:"var(--panel-hover)", fontSize:11 }}>
                <span><strong>{r.type}</strong> {r.amount?formatCurrency(r.amount,currency):""}</span><span style={{ fontSize:10, padding:"2px 6px", borderRadius:999, border:"1px solid var(--border)", background:"var(--panel)", fontWeight:800 }}>{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding:16, border:"1px solid var(--border)", borderRadius:12, background:"var(--panel)" }}>
        <h3 style={{ margin:"0 0 10px", fontSize:14, fontWeight:800 }}>{t.customerManagement}</h3>
        <p style={{ margin:"0 0 10px", color:"var(--muted)", fontSize:12 }}>{t.supervisorNote}</p>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div>
            <h4 style={{ margin:"0 0 6px", fontSize:13, fontWeight:700 }}>Customers ({customers.length})</h4>
            {customers.length===0 ? <div style={{ padding:8, color:"var(--muted)", fontSize:11, border:"1px dashed var(--border)", borderRadius:8, textAlign:"center" }}>{t.noData}</div> : (
              <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:240, overflowY:"auto" }}>
                {customers.slice(0,15).map((c:any)=>(
                  <div key={c.id} style={{ display:"flex", justifyContent:"space-between", gap:8, padding:"6px 8px", border:"1px solid var(--border)", borderRadius:8, background:"var(--panel-hover)", fontSize:11 }}>
                    <span><strong>{c.name}</strong> <small style={{ color:"var(--muted)" }}>{c.phone}</small></span><span style={{ fontWeight:700 }}>{formatCurrency(Number(c.balance||0), currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <h4 style={{ margin:"0 0 6px", fontSize:13, fontWeight:700 }}>{t.orders} ({orders.length})</h4>
            {orders.length===0 ? <div style={{ padding:8, color:"var(--muted)", fontSize:11, border:"1px dashed var(--border)", borderRadius:8, textAlign:"center" }}>{t.noData}</div> : (
              <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:240, overflowY:"auto" }}>
                {orders.slice(0,10).map((o:any)=>(
                  <div key={o.id} style={{ display:"flex", justifyContent:"space-between", gap:8, padding:"6px 8px", border:"1px solid var(--border)", borderRadius:8, background:"var(--panel-hover)", fontSize:11 }}>
                    <span>{o.customerName || o.customerId.slice(0,6)} · {formatCurrency(Number(o.total||0), currency)}</span><span style={{ fontSize:10, padding:"2px 6px", borderRadius:999, background:"var(--accent-soft)", border:"1px solid var(--border)", fontWeight:700 }}>{o.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding:16, border:"1px solid var(--border)", borderRadius:12, background:"var(--panel)" }}>
        <h3 style={{ margin:"0 0 8px", fontSize:14, fontWeight:800 }}>{t.activity}</h3>
        {activities.length===0 ? <div style={{ padding:8, color:"var(--muted)", fontSize:12, border:"1px dashed var(--border)", borderRadius:8, textAlign:"center" }}>{t.noData}</div> : (
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {activities.slice(0,10).map((a:any)=>(
              <div key={a.id} style={{ display:"flex", justifyContent:"space-between", gap:8, padding:"6px 8px", borderBottom:"1px solid var(--border)", fontSize:11 }}>
                <span style={{ fontWeight:600 }}>{a.action}</span><span style={{ color:"var(--muted)" }}>{formatDate(a.createdAt, lang)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RvbDashboardPage() {
  const { user } = useRvbAuth();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [acctCounts, setAcctCounts] = useState<{ total: number; active: number; workersActive: number; workersArchived: number; suppliersActive: number; suppliersArchived: number; customersActive: number; customersArchived: number; managementActive: number; managementArchived: number; supervisors: number } | null>(null);
  const [pendingRequests, setPendingRequests] = useState<number | null>(null);
  const [pendingOrders, setPendingOrders] = useState<number | null>(null);
  const [unreadTotal, setUnreadTotal] = useState<number | null>(null);
  const [socketReady, setSocketReady] = useState<boolean>(false);
  const [notificationsReady, setNotificationsReady] = useState<boolean>(false);

  useEffect(() => {
    settingsService.get().then((s) => { if (s) setSettings(s); });
    rvbConfigService.get().then((c) => { if (c?.currency) setSettings((prev:any)=>({...prev, currency: c.currency })); }).catch(()=>{});
    const handler = (e: Event) => {
      const ce = e as CustomEvent<Settings>;
      if (ce?.detail) setSettings(ce.detail);
      else settingsService.get().then((s) => { if (s) setSettings(s); });
    };
    window.addEventListener(SETTINGS_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { rvbAccountService } = await import("../../src/services/rvb-account.service");
        const accs = await rvbAccountService.getAll().catch(() => []);
        if (cancelled) return;
        const total = accs.length;
        const active = accs.filter((a: any) => a.status === "active").length;
        const byRole = (role: string, status: string) => accs.filter((a: any) => a.role === role && a.status === status).length;
        const mgmtActive = accs.filter((a: any) => ["manager","admin","supervisor"].includes(a.role) && a.status === "active").length;
        const mgmtArchived = accs.filter((a: any) => ["manager","admin","supervisor"].includes(a.role) && a.status === "archived").length;
        setAcctCounts({
          total,
          active,
          workersActive: byRole("worker","active"),
          workersArchived: byRole("worker","archived"),
          suppliersActive: byRole("supplier","active"),
          suppliersArchived: byRole("supplier","archived"),
          customersActive: byRole("customer","active"),
          customersArchived: byRole("customer","archived"),
          managementActive: mgmtActive,
          managementArchived: mgmtArchived,
          supervisors: accs.filter((a: any) => a.role === "supervisor").length,
        });
      } catch { if (!cancelled) setAcctCounts(null); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { rvbRequestService } = await import("../../src/services/rvb-request.service");
        const res = await rvbRequestService.list({ status: "under_review", limit: 1 }).catch(() => null);
        if (cancelled) return;
        if (res && res.kpi) setPendingRequests(res.kpi.underReview);
        else if (res && typeof res.total === "number") setPendingRequests(res.total);
        else setPendingRequests(0);
      } catch { if (!cancelled) setPendingRequests(null); }
    })();
    (async () => {
      try {
        const { customerOrderService } = await import("../../src/services/customer-order.service");
        const orders = await customerOrderService.list({ status: "under_review" }).catch(() => [] as any[]);
        if (cancelled) return;
        setPendingOrders(Array.isArray(orders) ? orders.length : 0);
      } catch { if (!cancelled) setPendingOrders(null); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { chatService } = await import("../../src/services/chat.service");
        const counts = await (chatService as any).getUnreadCounts().catch(() => null);
        if (cancelled) return;
        if (counts && typeof counts === "object") {
          const total = Object.values(counts as Record<string, number>).reduce((acc: number, v: any) => acc + (Number(v) || 0), 0);
          setUnreadTotal(total);
        } else if (typeof counts === "number") {
          setUnreadTotal(counts);
        } else {
          setUnreadTotal(0);
        }
      } catch {
        if (!cancelled) setUnreadTotal(null);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    (async () => {
      try {
        const { connectChatSocket, getChatSocket } = await import("../../src/services/chat-socket.service");
        const sock = connectChatSocket();
        if (!sock) {
          setSocketReady(false);
          return;
        }
        const onConnect = () => setSocketReady(true);
        const onDisconnect = () => setSocketReady(false);
        if ((sock as any).connected) setSocketReady(true);
        sock.on("connect", onConnect);
        sock.on("disconnect", onDisconnect);
        cleanup = () => {
          try { sock.off("connect", onConnect); sock.off("disconnect", onDisconnect); } catch {}
        };
        setTimeout(() => {
          try { if ((getChatSocket() as any)?.connected) setSocketReady(true); } catch {}
        }, 600);
      } catch {
        setSocketReady(false);
      }
    })();
    return () => { if (cleanup) cleanup(); };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { rvbNotificationService } = await import("../../src/services/rvb-notification.service");
        await rvbNotificationService.count().catch(async () => {
          await rvbNotificationService.list({ limit: 1 });
        });
        if (!cancelled) setNotificationsReady(true);
      } catch {
        if (!cancelled) setNotificationsReady(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);
  const t = (TRANSLATIONS as any)[settings.language];

  // Role-aware portal routing
  if (user && ["worker","supplier","customer","supervisor"].includes(user.role)) {
    // secondary portals
    if (user.role === "worker") {
      return (<RvbShell activePage="dashboard"><div className={styles.dashboardRoot}><WorkerPortal settings={settings} /></div></RvbShell>);
    }
    if (user.role === "supplier") {
      return (<RvbShell activePage="dashboard"><div className={styles.dashboardRoot}><SupplierPortal settings={settings} /></div></RvbShell>);
    }
    if (user.role === "customer") {
      return (<RvbShell activePage="dashboard"><div className={styles.dashboardRoot}><CustomerPortal settings={settings} /></div></RvbShell>);
    }
    if (user.role === "supervisor") {
      return (<RvbShell activePage="dashboard"><div className={styles.dashboardRoot}><SupervisorPortal settings={settings} /></div></RvbShell>);
    }
  }

  return (
    <RvbShell activePage="dashboard">
      <div className={styles.dashboardRoot}>
        <div className={styles.kpiRow}>
          <RvbKpiCard icon={UsersRound} title={t.kpi.activeAccounts.title} value={acctCounts ? String(acctCounts.active) : "—"} status={acctCounts ? `${acctCounts.total} total${settings.language === "fr" ? " total" : settings.language === "ar" ? " الإجمالي" : ""}` : t.kpi.activeAccounts.status} />
          <RvbKpiCard icon={Inbox} title={t.kpi.pendingRequests.title} value={pendingRequests !== null ? String(pendingRequests) : "—"} status={pendingRequests !== null ? (pendingRequests === 0 ? (settings.language === "ar" ? "لا توجد طلبات قيد المراجعة" : settings.language === "fr" ? "Aucune demande en examen" : "No requests under review") : settings.language === "ar" ? "الطلبات قيد المراجعة" : settings.language === "fr" ? "Demandes en examen" : "Requests under review") : t.kpi.pendingRequests.status} />
          <RvbKpiCard icon={ShoppingCart} title={t.kpi.ordersReview.title} value={pendingOrders !== null ? String(pendingOrders) : "—"} status={pendingOrders !== null ? (pendingOrders === 0 ? (settings.language === "ar" ? "لا توجد طلبيات قيد المراجعة" : settings.language === "fr" ? "Aucune commande en examen" : "No orders under review") : settings.language === "ar" ? "الطلبيات قيد المراجعة" : settings.language === "fr" ? "Commandes en examen" : "Orders under review") : t.kpi.ordersReview.status} />
          <RvbKpiCard icon={MessagesSquare} title={t.kpi.unreadMessages.title} value={unreadTotal !== null ? String(unreadTotal) : "—"} status={unreadTotal !== null ? (unreadTotal === 0 ? (settings.language === "ar" ? "لا توجد رسائل غير مقروءة" : settings.language === "fr" ? "Aucun message non lu" : "No unread messages") : settings.language === "ar" ? `${unreadTotal} رسائل غير مقروءة` : settings.language === "fr" ? `${unreadTotal} non lus` : `${unreadTotal} unread`) : t.kpi.unreadMessages.status} />
        </div>

        <div className={styles.secondaryRow}>
          <RvbKpiCard icon={Users} title={t.secondary.workers} value={acctCounts ? String(acctCounts.workersActive + acctCounts.workersArchived) : "—"} status={acctCounts ? `${acctCounts.workersActive} active / ${acctCounts.workersArchived} archived` : "—"} />
          <RvbKpiCard icon={Truck} title={t.secondary.suppliers} value={acctCounts ? String(acctCounts.suppliersActive + acctCounts.suppliersArchived) : "—"} status={acctCounts ? `${acctCounts.suppliersActive} active / ${acctCounts.suppliersArchived} archived` : "—"} />
          <RvbKpiCard icon={UserRound} title={t.secondary.customers} value={acctCounts ? String(acctCounts.customersActive + acctCounts.customersArchived) : "—"} status={acctCounts ? `${acctCounts.customersActive} active / ${acctCounts.customersArchived} archived` : "—"} />
          <RvbKpiCard icon={ShieldCheckIcon} title={t.secondary.supervisors} value={acctCounts ? String(acctCounts.supervisors) : "—"} status={acctCounts ? `${acctCounts.supervisors} accounts` : "—"} />
        </div>

        <div className={styles.twoCol}>
          <div className={styles.sectionPanel}>
            <div className={styles.sectionHeader}>
              <h3>{t.pendingWork.title}</h3>
            </div>
            <div className={styles.pendingStack}>
              <RvbPendingItem icon={Users} title={t.pendingWork.items[0].title} description={t.pendingWork.items[0].desc} href="/rvb/requests" viewLabel={t.pendingWork.view} />
              <RvbPendingItem icon={Truck} title={t.pendingWork.items[1].title} description={t.pendingWork.items[1].desc} href="/rvb/requests" viewLabel={t.pendingWork.view} />
              <RvbPendingItem icon={UserRound} title={t.pendingWork.items[2].title} description={t.pendingWork.items[2].desc} href="/rvb/requests" viewLabel={t.pendingWork.view} />
              <RvbPendingItem icon={ShoppingCart} title={t.pendingWork.items[3].title} description={t.pendingWork.items[3].desc} href="/rvb/orders" viewLabel={t.pendingWork.view} />
            </div>
          </div>

          <div className={styles.sectionPanel}>
            <div className={styles.sectionHeader}>
              <h3>{t.portalOverview.title}</h3>
            </div>
            <div className={styles.roleGrid}>
              <RvbRoleOverviewCard icon={Users} role={t.portalOverview.workers} activeLabel={t.portalOverview.active} archivedLabel={t.portalOverview.archived} activeValue={acctCounts ? String(acctCounts.workersActive) : "—"} archivedValue={acctCounts ? String(acctCounts.workersArchived) : "—"} />
              <RvbRoleOverviewCard icon={Truck} role={t.portalOverview.suppliers} activeLabel={t.portalOverview.active} archivedLabel={t.portalOverview.archived} activeValue={acctCounts ? String(acctCounts.suppliersActive) : "—"} archivedValue={acctCounts ? String(acctCounts.suppliersArchived) : "—"} />
              <RvbRoleOverviewCard icon={UserRound} role={t.portalOverview.customers} activeLabel={t.portalOverview.active} archivedLabel={t.portalOverview.archived} activeValue={acctCounts ? String(acctCounts.customersActive) : "—"} archivedValue={acctCounts ? String(acctCounts.customersArchived) : "—"} />
              <RvbRoleOverviewCard icon={ShieldCheckIcon} role={t.portalOverview.management} activeLabel={t.portalOverview.active} archivedLabel={t.portalOverview.archived} activeValue={acctCounts ? String(acctCounts.managementActive) : "—"} archivedValue={acctCounts ? String(acctCounts.managementArchived) : "—"} />
            </div>
          </div>
        </div>

        <div className={styles.twoColEqual}>
          <RvbActivityFeed language={settings.language} title={t.activity.title} emptyTitle={t.activity.emptyTitle} emptyDesc={t.activity.emptyDesc} />
          <div className={styles.sectionPanel}>
            <div className={styles.sectionHeader}>
              <h3>{t.quick.title}</h3>
            </div>
            <div className={styles.quickStack}>
              <RvbQuickAction icon={ShieldCheckIcon} label={t.quick.manageAccounts} href="/rvb/accounts" />
              <RvbQuickAction icon={Inbox} label={t.quick.reviewRequests} href="/rvb/requests" />
              <RvbQuickAction icon={ShoppingCart} label={t.quick.reviewOrders} href="/rvb/orders" />
              <RvbQuickAction icon={MessagesSquare} label={t.quick.openChats} href="/rvb/chats" />
              <RvbQuickAction icon={Search} label={t.quick.openDirectory} href="/rvb/directory" />
            </div>
          </div>
        </div>

        <RvbSystemStatus
          title={t.system.title}
          items={[
            { label: t.system.webWorkspace, status: t.system.ready, ready: true },
            { label: t.system.accounts, status: acctCounts ? t.system.ready : t.system.comingSoon, ready: !!acctCounts },
            { label: t.system.mobile, status: t.system.comingSoon, ready: false },
            { label: t.system.realtime, status: socketReady ? t.system.ready : t.system.comingSoon, ready: socketReady },
            { label: t.system.notifications, status: notificationsReady ? t.system.ready : t.system.comingSoon, ready: notificationsReady },
          ]}
        />
      </div>
    </RvbShell>
  );
}
