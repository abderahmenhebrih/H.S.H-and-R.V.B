"use client";

import { useEffect, useState } from "react";
import RvbShell from "../../src/components/rvb/RvbShell";
import RvbKpiCard from "../../src/components/rvb/dashboard/RvbKpiCard";
import RvbPendingItem from "../../src/components/rvb/dashboard/RvbPendingItem";
import RvbRoleOverviewCard from "../../src/components/rvb/dashboard/RvbRoleOverviewCard";
import RvbActivityFeed from "../../src/components/rvb/dashboard/RvbActivityFeed";
import RvbQuickAction from "../../src/components/rvb/dashboard/RvbQuickAction";
import RvbSystemStatus from "../../src/components/rvb/dashboard/RvbSystemStatus";
import styles from "./page.module.css";
import { settingsService } from "../../src/services/settings.service";
import { DEFAULT_SETTINGS } from "../../src/lib/settings";
import type { Settings } from "../../src/types/settings/settings";
import { SETTINGS_EVENT } from "../../src/lib/settings";
import { UsersRound, Inbox, ShoppingCart, MessagesSquare, Users, Truck, UserRound, ShieldCheck, Search } from "lucide-react";
import { ShieldCheck as ShieldCheckIcon } from "lucide-react";
import { useRvbAuth } from "../../src/contexts/RvbAuthContext";
import { RvbPortalPlaceholder } from "../../src/components/rvb/RvbRoleGuard";

const TRANSLATIONS = {
  en: {
    kpi: {
      activeAccounts: { title: "Active Accounts", status: "Account system not connected yet" },
      pendingRequests: { title: "Pending Requests", status: "Request system not connected yet" },
      ordersReview: { title: "Orders Under Review", status: "Order system not connected yet" },
      unreadMessages: { title: "Unread Messages", status: "Messaging not connected yet" },
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
  },
  fr: {
    kpi: {
      activeAccounts: { title: "Comptes actifs", status: "Système de comptes non connecté" },
      pendingRequests: { title: "Demandes en attente", status: "Système de demandes non connecté" },
      ordersReview: { title: "Commandes en vérification", status: "Système de commandes non connecté" },
      unreadMessages: { title: "Messages non lus", status: "Messagerie non connectée" },
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
  },
  ar: {
    kpi: {
      activeAccounts: { title: "الحسابات النشطة", status: "نظام الحسابات غير متصل بعد" },
      pendingRequests: { title: "الطلبات المعلقة", status: "نظام الطلبات غير متصل بعد" },
      ordersReview: { title: "الطلبات قيد المراجعة", status: "نظام الطلبات غير متصل بعد" },
      unreadMessages: { title: "الرسائل غير المقروءة", status: "نظام المراسلة غير متصل بعد" },
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
  },
} as const;

export default function RvbDashboardPage() {
  const { user } = useRvbAuth();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [acctCounts, setAcctCounts] = useState<{ total: number; active: number; workersActive: number; workersArchived: number; suppliersActive: number; suppliersArchived: number; customersActive: number; customersArchived: number; managementActive: number; managementArchived: number; supervisors: number } | null>(null);

  useEffect(() => {
    settingsService.get().then((s) => { if (s) setSettings(s); });
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
  const t = TRANSLATIONS[settings.language];

  // Role-aware: non-management sees portal placeholder
  if (user && !["manager", "admin", "supervisor"].includes(user.role)) {
    return (
      <RvbShell activePage="dashboard">
        <div className={styles.dashboardRoot}>
          <RvbPortalPlaceholder role={user.role} />
        </div>
      </RvbShell>
    );
  }
  // Supervisor sees dashboard but without management actions? For now show dashboard with note
  if (user && user.role === "supervisor") {
    // supervisor allowed dashboard, but we note limited
  }

  return (
    <RvbShell activePage="dashboard">
      <div className={styles.dashboardRoot}>
        {/* A Header is handled by RvbShell CompactHeader (Control Center) */}

        {/* B Top KPI */}
        <div className={styles.kpiRow}>
          <RvbKpiCard icon={UsersRound} title={t.kpi.activeAccounts.title} value={acctCounts ? String(acctCounts.active) : "—"} status={acctCounts ? `${acctCounts.total} total${settings.language === "fr" ? " total" : settings.language === "ar" ? " الإجمالي" : ""}` : t.kpi.activeAccounts.status} />
          <RvbKpiCard icon={Inbox} title={t.kpi.pendingRequests.title} value="—" status={t.kpi.pendingRequests.status} />
          <RvbKpiCard icon={ShoppingCart} title={t.kpi.ordersReview.title} value="—" status={t.kpi.ordersReview.status} />
          <RvbKpiCard icon={MessagesSquare} title={t.kpi.unreadMessages.title} value="—" status={t.kpi.unreadMessages.status} />
        </div>

        {/* Secondary status */}
        <div className={styles.secondaryRow}>
          <RvbKpiCard icon={Users} title={t.secondary.workers} value={acctCounts ? String(acctCounts.workersActive + acctCounts.workersArchived) : "—"} status={acctCounts ? `${acctCounts.workersActive} active / ${acctCounts.workersArchived} archived` : "—"} />
          <RvbKpiCard icon={Truck} title={t.secondary.suppliers} value={acctCounts ? String(acctCounts.suppliersActive + acctCounts.suppliersArchived) : "—"} status={acctCounts ? `${acctCounts.suppliersActive} active / ${acctCounts.suppliersArchived} archived` : "—"} />
          <RvbKpiCard icon={UserRound} title={t.secondary.customers} value={acctCounts ? String(acctCounts.customersActive + acctCounts.customersArchived) : "—"} status={acctCounts ? `${acctCounts.customersActive} active / ${acctCounts.customersArchived} archived` : "—"} />
          <RvbKpiCard icon={ShieldCheckIcon} title={t.secondary.supervisors} value={acctCounts ? String(acctCounts.supervisors) : "—"} status={acctCounts ? `${acctCounts.supervisors} accounts` : "—"} />
        </div>

        {/* C + D */}
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

        {/* E + F */}
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

        {/* G System Status */}
        <RvbSystemStatus
          title={t.system.title}
          items={[
            { label: t.system.webWorkspace, status: t.system.ready, ready: true },
            { label: t.system.accounts, status: acctCounts ? t.system.ready : t.system.comingSoon, ready: !!acctCounts },
            { label: t.system.mobile, status: t.system.comingSoon, ready: false },
            { label: t.system.realtime, status: t.system.comingSoon, ready: false },
            { label: t.system.notifications, status: t.system.comingSoon, ready: false },
          ]}
        />
      </div>
    </RvbShell>
  );
}
