"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import { useDbSync } from "../src/hooks/useDbSync";

import { settingsService } from "../src/services/settings.service";
import { RVB_UI_PREFERENCES_EVENT } from "../src/services/rvb-ui-preferences.service";
import { saleService } from "../src/services/sale.service";
import { purchaseService } from "../src/services/purchase.service";
import { customerService } from "../src/services/customer.service";
import { supplierService } from "../src/services/supplier.service";
import { workerService } from "../src/services/worker.service";
import { roundMoney } from "../src/lib/money";
import {
  SETTINGS_EVENT,
  DEFAULT_SETTINGS,
  formatCurrency,
  getDirection,
  getCachedSettings,
  setCachedSettings,
  resolveNavigationStyle,
} from "../src/lib/settings";
import type { Settings } from "../src/types/settings/settings";
import CompactHeader from "../src/components/layout/CompactHeader";
import HshNotificationBell from "../src/components/notifications/HshNotificationBell";
import WorkspaceTransition from "../src/components/rvb/WorkspaceTransition";
import { getSavedTheme, applyTheme } from "../src/lib/theme";
import BusinessOverviewChart, {
  ChartError,
  ChartSkeleton,
} from "../src/components/dashboard/BusinessOverviewChart";
import {
  aggregateByBuckets,
  getPeriodRange,
  type OverviewBucket,
  type OverviewPeriod,
} from "../src/lib/dashboard-overview";
import {
  Activity,
  ArrowRight,
  Banknote,
  BarChart3,
  CarFront,
  ClipboardCheck,
  ChevronDown,
  FileText,
  Info,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Sun,
  TrendingUp,
  Truck,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  CANONICAL_NAVIGATION,
  MANAGEMENT_KEYS,
  OPERATIONS_KEYS,
  navGroupForKey,
} from "../src/lib/navigation";
import FloatingNav from "../src/components/layout/FloatingNav";
import type { FloatingNavEntry } from "../src/components/layout/FloatingNav";
import ClassicSidebar from "../src/components/layout/ClassicSidebar";

// Dashboard now consumes canonical navigation to prevent drift with AppShell
type SidebarItem = { icon: LucideIcon; key: string };
const sidebarItems: readonly SidebarItem[] = CANONICAL_NAVIGATION.map(({ icon, key }) => ({ icon, key })) as unknown as readonly SidebarItem[];

// Sidebar routes mirror the canonical paths; children reuse them unchanged.
const dashboardRoutes: Record<string, string> = {
  dashboard: "/",
  office: "/office",
  products: "/products",
  customers: "/customers",
  suppliers: "/suppliers",
  accounts: "/accounts",
  purchases: "/purchases",
  sales: "/sales",
  payments: "/payments",
  workers: "/workers",
  vehicles: "/vehicles",
  tasks: "/tasks",
  reports: "/reports",
  invoice: "/invoice",
  settings: "/settings",
};

type QuickAction = { icon: LucideIcon; key: string; color: string; route: string };
const quickActions: readonly QuickAction[] = [
  { icon: ShoppingCart, key: "purchase", color: "yellow", route: "/purchases" },
  { icon: ShoppingBag, key: "sale", color: "red", route: "/sales" },
  { icon: ClipboardCheck, key: "tasks", color: "yellow", route: "/tasks" },
  { icon: FileText, key: "invoice", color: "red", route: "/invoice" },
  { icon: BarChart3, key: "reports", color: "yellow", route: "/reports" },
  { icon: LogOut, key: "exit", color: "red", route: "/" },
] as const;

const translations = {
  en: {
    dashboard: "Management Dashboard",
    title: "Hebrih Slaughter House",
    description: "Central management workspace for inventory, sales, purchases, finances and workforce operations.",
    operational: "System operational",
    onlineAccess: "Access RVB",
    openMenu: "Open navigation",
    closeMenu: "Close navigation",
    management: "Management",
    operations: "Operations",
    database: "Local database ready",
    sales: "TODAY'S SALES",
    purchases: "TODAY'S PURCHASES",
    outstanding: "OUTSTANDING PAYMENTS",
    workers: "WORKERS",
    transactions: "transactions",
    pending: "pending",
    activeWorkers: "Active workers",
    overview: "Business Overview",
    activity: "Sales and purchase activity",
    week: "This week",
    today: "Today",
    thisWeek: "This week",
    thisMonth: "This month",
    thisYear: "This year",
    chartSales: "Sales",
    chartPurchases: "Purchases",
    retry: "Retry",
    noActivity: "No activity yet",
    activityAppear: "Your business activity will appear here.",
    quick: "Quick Actions",
    frequent: "Frequently used operations",
    purchase: "Record Purchase from Supplier",
    sale: "Record Sale to Customers",
    tasks: "Tasks",
    invoice: "Invoice",
    reports: "Periodic Situation",
    exit: "Exit",
    settings: "Settings",
    products: "Products",
    customers: "Customers",
    suppliers: "Suppliers",
    payments: "Payments",
    expenses: "Expenses",
    purchasesNav: "Purchases",
    salesNav: "Sales",
    workersNav: "Workers",
    vehicles: "Vehicles",
    tasksNav: "Tasks",
    accounts: "Accounts",
    reportsNav: "Reports",
    invoiceNav: "Invoice",
    officeNav: "My Office",
    about: "About",
  },

  fr: {
    dashboard: "Tableau de bord",
    title: "Hebrih Slaughter House",
    description: "Espace central de gestion des stocks, ventes, achats, finances et personnel.",
    operational: "Système opérationnel",
    onlineAccess: "Accéder à RVB",
    openMenu: "Ouvrir la navigation",
    closeMenu: "Fermer la navigation",
    management: "Gestion",
    operations: "Opérations",
    database: "Base de données locale prête",
    sales: "VENTES DU JOUR",
    purchases: "ACHATS DU JOUR",
    outstanding: "PAIEMENTS EN ATTENTE",
    workers: "EMPLOYÉS",
    transactions: "transactions",
    pending: "en attente",
    activeWorkers: "Employés actifs",
    overview: "Vue d'ensemble",
    activity: "Activité des ventes et achats",
    week: "Cette semaine",
    today: "Aujourd'hui",
    thisWeek: "Cette semaine",
    thisMonth: "Ce mois-ci",
    thisYear: "Cette année",
    chartSales: "Ventes",
    chartPurchases: "Achats",
    retry: "Réessayer",
    noActivity: "Aucune activité",
    activityAppear: "L'activité de votre entreprise apparaîtra ici.",
    quick: "Actions rapides",
    frequent: "Opérations fréquemment utilisées",
    purchase: "Enregistrer l'achat fournisseur",
    sale: "Enregistrer la vente clients",
    tasks: "Tâches",
    invoice: "Facture",
    reports: "Situation périodique",
    exit: "Sortie",
    settings: "Paramètres",
    products: "Produits",
    customers: "Clients",
    suppliers: "Fournisseurs",
    payments: "Paiements",
    expenses: "Dépenses",
    purchasesNav: "Achats",
    salesNav: "Ventes",
    workersNav: "Employés",
    vehicles: "Véhicules",
    tasksNav: "Tâches",
    accounts: "Comptes",
    reportsNav: "Rapports",
    invoiceNav: "Facture",
    officeNav: "Mon Bureau",
    about: "À propos",
  },

  ar: {
    dashboard: "لوحة التحكم",
    title: "مذبح حبريح للدواجن",
    description: "مساحة مركزية لإدارة المخزون والمبيعات والمشتريات والمالية والعمال.",
    operational: "النظام يعمل",
    onlineAccess: "الدخول إلى RVB",
    openMenu: "فتح قائمة التنقل",
    closeMenu: "إغلاق قائمة التنقل",
    management: "الإدارة",
    operations: "العمليات",
    database: "قاعدة البيانات المحلية جاهزة",
    sales: "مبيعات اليوم",
    purchases: "مشتريات اليوم",
    outstanding: "المدفوعات المستحقة",
    workers: "العمال",
    transactions: "معاملات",
    pending: "معلّقة",
    activeWorkers: "العمال النشطون",
    overview: "نظرة عامة على النشاط",
    activity: "نشاط المبيعات والمشتريات",
    week: "هذا الأسبوع",
    today: "اليوم",
    thisWeek: "هذا الأسبوع",
    thisMonth: "هذا الشهر",
    thisYear: "هذا العام",
    chartSales: "المبيعات",
    chartPurchases: "المشتريات",
    retry: "إعادة المحاولة",
    noActivity: "لا يوجد نشاط بعد",
    activityAppear: "سيظهر نشاط المؤسسة هنا.",
    quick: "إجراءات سريعة",
    frequent: "العمليات المستخدمة بشكل متكرر",
    purchase: "تسجيل الشراء من الممول",
    sale: "تسجيل البيع للزبائن",
    tasks: "المهمات",
    invoice: "الفاتورة",
    reports: "الوضعية الدورية",
    exit: "الخروج",
    settings: "الإعدادات",
    products: "المنتجات",
    customers: "العملاء",
    suppliers: "الموردون",
    payments: "المدفوعات",
    expenses: "المصاريف",
    purchasesNav: "المشتريات",
    salesNav: "المبيعات",
    workersNav: "العمال",
    vehicles: "المركبات",
    tasksNav: "المهام",
    accounts: "الحسابات",
    reportsNav: "التقارير",
    invoiceNav: "الفاتورة",
    officeNav: "مكتبي",
    about: "حول البرنامج",
  },
} as const;

type Translation = { [K in keyof typeof translations["en"]]: string };

export default function Dashboard() {
  const router = useRouter();

  const [settings, setSettings] =
    useState<Settings>(() => getCachedSettings() ?? DEFAULT_SETTINGS);

  const [dark, setDark] = useState(false);
  const [themeReady, setThemeReady] = useState(false);

  const [overviewPeriod, setOverviewPeriod] = useState<OverviewPeriod>("week");
  const [overviewData, setOverviewData] = useState<OverviewBucket[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);

  const [transitionVisible, setTransitionVisible] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState<"rvb" | "hsh">("rvb");

  // Mobile drawer for Classic Sidebar mode. Deterministic initial
  // (closed) — hydration-safe; FloatingNav mode never uses it.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    try {
      const target = sessionStorage.getItem("hebrih-transition-target");
      if (target === "hsh") {
        setTransitionTarget("hsh");
        setTransitionVisible(true);
        const hide = setTimeout(() => setTransitionVisible(false), 900);
        const clear = setTimeout(() => { try { sessionStorage.removeItem("hebrih-transition-target"); } catch {} }, 1400);
        return () => { clearTimeout(hide); clearTimeout(clear); };
      }
    } catch {}
  }, []);

  function handleSwitchToRvb() {
    try { sessionStorage.setItem("hebrih-transition-target", "rvb"); } catch {}
    setTransitionTarget("rvb");
    setTransitionVisible(true);
    setSidebarOpen(false);
    setTimeout(() => {
      router.push("/rvb");
    }, 420);
    setTimeout(() => setTransitionVisible(false), 2200);
  }

  useEffect(() => {
    async function loadSettings() {
      const stored = await settingsService.get();

      if (stored) {
        setSettings(stored);
        setCachedSettings(stored);
        document.documentElement.lang = stored.language;
        document.documentElement.dir = getDirection(stored.language);
      } else {
        await settingsService.save(DEFAULT_SETTINGS);
      }
    }

    loadSettings();
  }, []);

  useEffect(() => {
    const readSettings = (event?: Event) => {
      const customEvent = event as CustomEvent<Settings> | undefined;

      if (customEvent?.detail) {
        setSettings(customEvent.detail);
        setCachedSettings(customEvent.detail);
        document.documentElement.lang = customEvent.detail.language;
        document.documentElement.dir = getDirection(
          customEvent.detail.language,
        );
        return;
      }

      settingsService.get().then((stored) => {
        if (!stored) return;

        setSettings(stored);
        setCachedSettings(stored);
        document.documentElement.lang = stored.language;
        document.documentElement.dir = getDirection(stored.language);
      });
    };

    window.addEventListener(SETTINGS_EVENT, readSettings);
    window.addEventListener(RVB_UI_PREFERENCES_EVENT, readSettings);
    window.addEventListener("storage", readSettings);

    return () => {
      window.removeEventListener(SETTINGS_EVENT, readSettings);
      window.removeEventListener(RVB_UI_PREFERENCES_EVENT, readSettings);
      window.removeEventListener("storage", readSettings);
    };
  }, []);

  useEffect(() => {
    const readTheme = () => {
      setDark(getSavedTheme() === "dark");
      setThemeReady(true);
    };
    readTheme();
    window.addEventListener("hebrih-theme-change", readTheme);
    window.addEventListener("storage", readTheme);
    return () => {
      window.removeEventListener("hebrih-theme-change", readTheme);
      window.removeEventListener("storage", readTheme);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadOverview() {
      setOverviewLoading(true);
      setOverviewError(null);
      try {
        const range = getPeriodRange(overviewPeriod);
        const [sales, purchases] = await Promise.all([
          saleService.getByDateRange(range.from, range.to),
          purchaseService.getByDateRange(range.from, range.to),
        ]);
        if (cancelled) return;
        const aggregated = aggregateByBuckets(sales, purchases, range.buckets);
        setOverviewData(aggregated);
      } catch (e) {
        if (cancelled) return;
        setOverviewError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setOverviewLoading(false);
      }
    }
    loadOverview();
    return () => {
      cancelled = true;
    };
  }, [overviewPeriod]);

  const [kpi, setKpi] = useState({ salesToday: 0, salesCount: 0, purchasesToday: 0, purchasesCount: 0, outstanding: 0, outstandingCount: 0, activeWorkers: 0 });
  const [kpiIntegrity, setKpiIntegrity] = useState({ sales: false, purchases: false, outstanding: false });
  const [kpiLoading, setKpiLoading] = useState(true);

  async function loadKpi() {
    try {
      const now = new Date();
      const start = new Date(now); start.setHours(0,0,0,0);
      const end = new Date(now); end.setHours(23,59,59,999);
      const from = start.getTime(); const to = end.getTime();
      const [salesToday, purchasesToday, customers, suppliers, workers] = await Promise.all([
        saleService.getByDateRange(from, to).catch(()=>[]),
        purchaseService.getByDateRange(from, to).catch(()=>[]),
        customerService.getAll().catch(()=>[]),
        supplierService.getAll().catch(()=>[]),
        workerService.getAll().catch(()=>[]),
      ]);
      const hasInvalidSales = (salesToday as any[]).some((s:any)=> s.total !== undefined && s.total !== null && !Number.isFinite(s.total));
      const hasInvalidPurchases = (purchasesToday as any[]).some((p:any)=> p.total !== undefined && p.total !== null && !Number.isFinite(p.total));
      const hasInvalidOutstanding = [...(customers as any[]), ...(suppliers as any[])].some((e:any)=> e.balance !== undefined && e.balance !== null && !Number.isFinite(e.balance));
      setKpiIntegrity({ sales: hasInvalidSales, purchases: hasInvalidPurchases, outstanding: hasInvalidOutstanding });
      const sTotal = roundMoney((salesToday as any[]).reduce((sum, s:any)=> sum + (Number.isFinite(s.total)? s.total : 0), 0));
      const pTotal = roundMoney((purchasesToday as any[]).reduce((sum, p:any)=> sum + (Number.isFinite(p.total)? p.total : 0), 0));
      const outstandingEntities = [...(customers as any[]), ...(suppliers as any[])].filter((e:any)=> Number.isFinite(e.balance) && roundMoney(e.balance) > 0);
      const outstandingVal = roundMoney(outstandingEntities.reduce((sum,e:any)=> sum + roundMoney(e.balance), 0));
      const outstandingCnt = outstandingEntities.length;
      const activeWorkers = (workers as any[]).filter((w:any)=> w.status==="active").length;
      setKpi({ salesToday: sTotal, salesCount: salesToday.length, purchasesToday: pTotal, purchasesCount: purchasesToday.length, outstanding: outstandingVal, outstandingCount: outstandingCnt, activeWorkers });
    } catch {}
    finally { setKpiLoading(false); }
  }

  useEffect(()=>{ void loadKpi(); }, []);

  useDbSync(() => {
    // Reload overview and KPI on remote sync
    void loadKpi();
    const c = overviewPeriod;
    setOverviewPeriod("today" as any);
    setTimeout(() => setOverviewPeriod(c), 0);
  }, []);

  // Close period menu on outside click / Escape
  useEffect(() => {
    if (!periodMenuOpen) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-period-menu]")) setPeriodMenuOpen(false);
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setPeriodMenuOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [periodMenuOpen]);

  useEffect(() => {
    if (!themeReady) return;
    applyTheme(dark ? "dark" : "light");
  }, [dark, themeReady]);

  const t: Translation = translations[settings.language];


  // Floating fan entries reuse canonical icons/routes/labels — unchanged.
  function fanEntry(key: string): FloatingNavEntry {
    const item = sidebarItems.find((entry) => entry.key === key) ?? sidebarItems[0];
    return {
      key,
      label: navLabels[key] ?? key,
      path: dashboardRoutes[key] ?? "/",
      icon: item.icon,
    };
  }

  function fanEntries(keys: readonly string[]): FloatingNavEntry[] {
    return keys.map((key) => fanEntry(key));
  }

  function navigateSidebar(route: string) {
    router.push(route, { scroll: false });
  }

  const navLabels: Record<string, string> = {
    dashboard: t.dashboard,
    office: (t as any).officeNav,
    products: t.products,
    customers: t.customers,
    suppliers: t.suppliers,
    purchases: t.purchasesNav,
    sales: t.salesNav,
    payments: t.payments,
    expenses: t.expenses,
    workers: t.workersNav,
    vehicles: t.vehicles,
    tasks: t.tasksNav,
    accounts: t.accounts,
    reports: t.reportsNav,
    invoice: t.invoiceNav,
    settings: t.settings,
  };

  function openSettings() {
    if (
      "startViewTransition" in document &&
      typeof document.startViewTransition === "function"
    ) {
      document.startViewTransition(() => {
        router.push("/settings");
      });
    } else {
      router.push("/settings");
    }
  }

  // Same canonical navigation-mode decision as AppShell. Exactly one
  // navigation UI is ever mounted. Deterministic from settings state
  // (default "floating") — hydration-safe; the stored preference arrives
  // via the settings effect + SETTINGS_EVENT subscription above.
  const navigationStyle = resolveNavigationStyle(settings.navigationStyle);

  // Classic sidebar partition mirrors AppShell: dashboard + office stay
  // top-level, settings lives only in the footer utility row.
  // FloatingNavEntry is structurally identical to ClassicSidebarItem
  // ({ key, label, path, icon }), so fanEntries feeds both modes.
  const bottomSidebarItems = sidebarItems
    .filter(
      (item) =>
        item.key !== "dashboard" &&
        item.key !== "office" &&
        item.key !== "settings" &&
        navGroupForKey(item.key) === null,
    )
    .map((item) => fanEntry(item.key));

  return (
    <main
      className={`${styles.dashboard} ${
        dark ? styles.themeDark : styles.themeLight
      }`}
    >
      <WorkspaceTransition visible={transitionVisible} target={transitionTarget} language={settings.language} />

      {navigationStyle === "classic" ? (
        <ClassicSidebar
          activeKey="dashboard"
          topItems={[fanEntry("dashboard"), fanEntry("office")]}
          managementLabel={t.management}
          managementItems={fanEntries(MANAGEMENT_KEYS)}
          operationsLabel={t.operations}
          operationsItems={fanEntries(OPERATIONS_KEYS)}
          bottomItems={bottomSidebarItems}
          brand={t.title}
          systemLabel={t.database}
          onlineAccessLabel={t.onlineAccess}
          drawerOpen={sidebarOpen}
          onCloseDrawer={() => setSidebarOpen(false)}
          onNavigate={navigateSidebar}
          onOpenRvb={handleSwitchToRvb}
          dark={dark}
          onToggleTheme={() => setDark((current) => !current)}
          themeLabel={dark ? "Switch to light mode" : "Switch to dark mode"}
          settingsLabel={t.settings}
          onOpenSettings={openSettings}
          bell={<HshNotificationBell language={settings.language} dark={dark} />}
        />
      ) : (
      <FloatingNav
        activeKey="dashboard"
        dashboardEntry={fanEntry("dashboard")}
        officeEntry={fanEntry("office")}
        managementLabel={t.management}
        operationsLabel={t.operations}
        managementItems={fanEntries(MANAGEMENT_KEYS)}
        operationsItems={fanEntries(OPERATIONS_KEYS)}
        openMenuLabel={t.openMenu}
        closeMenuLabel={t.closeMenu}
        onNavigate={navigateSidebar}
        dark={dark}
        onToggleTheme={() => setDark((current) => !current)}
        themeLabel={dark ? "Switch to light mode" : "Switch to dark mode"}
        onOpenSettings={openSettings}
        settingsLabel={t.settings}
        onAccessRvb={handleSwitchToRvb}
        rvbLabel={t.onlineAccess}
        bell={<HshNotificationBell language={settings.language} dark={dark} />}
      />
      )}

      <section className={styles.mainContent}>
        <header className={styles.mobileHeader}>
          {navigationStyle === "classic" && (
            <button
              type="button"
              className={styles.menuButton}
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
          <div className={styles.mobileBrand}>
            <img src="/chicken.jpg" alt="" />
            <span>{t.title}</span>
          </div>

          <button
            type="button"
            className={styles.mobileTheme}
            onClick={() => setDark((current) => !current)}
            aria-label="Toggle theme"
          >
            {dark ? (
              <Sun size={18} strokeWidth={2} aria-hidden="true" />
            ) : (
              <Moon size={18} strokeWidth={2} aria-hidden="true" />
            )}
          </button>
        </header>

        <div className={styles.content}>
          <CompactHeader
            title={t.title}
            description={t.description}
            dark={dark}
            onToggleTheme={() => setDark((current) => !current)}
            language={settings.language}
            settingsHref="/settings"
            showUtilities={false}
            notificationBell={<HshNotificationBell language={settings.language} dark={dark} />}
          />

          <section className={styles.kpiGrid}>
            <KpiCard
              accent="red"
              icon={TrendingUp}
              title={t.sales}
              value={kpiLoading ? "…" : formatCurrency(kpi.salesToday, settings.currency)}
              subtitle={kpiLoading ? "Loading…" : `${kpi.salesCount} ${t.transactions}`}
              warning={kpiIntegrity.sales}
            />

            <KpiCard
              accent="yellow"
              icon={ShoppingCart}
              title={t.purchases}
              value={kpiLoading ? "…" : formatCurrency(kpi.purchasesToday, settings.currency)}
              subtitle={kpiLoading ? "Loading…" : `${kpi.purchasesCount} ${t.transactions}`}
              warning={kpiIntegrity.purchases}
            />

            <KpiCard
              accent="black"
              icon={Wallet}
              title={t.outstanding}
              value={kpiLoading ? "…" : formatCurrency(kpi.outstanding, settings.currency)}
              subtitle={kpiLoading ? "Loading…" : `${kpi.outstandingCount} ${t.pending}`}
              warning={kpiIntegrity.outstanding}
            />

            <KpiCard
              accent="light"
              icon={UsersRound}
              title={t.workers}
              value={kpiLoading ? "…" : String(kpi.activeWorkers)}
              subtitle={t.activeWorkers}
            />
          </section>

          <section className={styles.businessGrid}>
            <section className={styles.overviewPanel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{t.overview}</h2>
                  <p>{t.activity}</p>
                </div>

                <div style={{ position: "relative" }} data-period-menu>
                  <button
                    type="button"
                    className={styles.periodButton}
                    onClick={() => setPeriodMenuOpen((v) => !v)}
                    aria-haspopup="listbox"
                    aria-expanded={periodMenuOpen}
                    aria-label="Select period"
                  >
                    <span>
                      {overviewPeriod === "today"
                        ? t.today
                        : overviewPeriod === "week"
                          ? t.thisWeek ?? t.week
                          : overviewPeriod === "month"
                            ? t.thisMonth
                            : t.thisYear}
                    </span>
                    <span aria-hidden="true" style={{ display: "grid", transition: "transform 0.18s", transform: periodMenuOpen ? "rotate(180deg)" : undefined }}>
                      <ChevronDown size={14} strokeWidth={2} />
                    </span>
                  </button>
                  {periodMenuOpen && (
                    <div
                      role="listbox"
                      aria-label="Period"
                      style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        right: 0,
                        minWidth: 160,
                        background: "var(--panel)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
                        padding: 6,
                        zIndex: 20,
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      {[
                        { value: "today" as const, label: t.today },
                        { value: "week" as const, label: t.thisWeek ?? t.week },
                        { value: "month" as const, label: t.thisMonth },
                        { value: "year" as const, label: t.thisYear },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          role="option"
                          aria-selected={overviewPeriod === opt.value}
                          onClick={() => {
                            setOverviewPeriod(opt.value);
                            setPeriodMenuOpen(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setOverviewPeriod(opt.value);
                              setPeriodMenuOpen(false);
                            } else if (e.key === "Escape") {
                              setPeriodMenuOpen(false);
                            }
                          }}
                          style={{
                            minHeight: 32,
                            padding: "0 10px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            borderRadius: 8,
                            border: 0,
                            background: overviewPeriod === opt.value ? "var(--accent-soft)" : "transparent",
                            color: overviewPeriod === opt.value ? "var(--accent)" : "var(--text)",
                            fontSize: 12,
                            fontWeight: overviewPeriod === opt.value ? 700 : 500,
                            cursor: "pointer",
                            textAlign: "start",
                          }}
                        >
                          <span>{opt.label}</span>
                          {overviewPeriod === opt.value && <span aria-hidden="true">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {overviewLoading ? (
                <ChartSkeleton />
              ) : overviewError ? (
                <ChartError
                  onRetry={() => {
                    // trigger reload by toggling period
                    const p = overviewPeriod;
                    setOverviewPeriod("today" as any);
                    setTimeout(() => setOverviewPeriod(p), 0);
                  }}
                  language={settings.language}
                />
              ) : (() => {
                const totalSales = overviewData.reduce((s, b) => s + b.sales, 0);
                const totalPurchases = overviewData.reduce((s, b) => s + b.purchases, 0);
                if (totalSales === 0 && totalPurchases === 0) {
                  return (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon} aria-hidden="true">
                        <Activity size={22} strokeWidth={2} />
                      </div>
                      <h3>{t.noActivity}</h3>
                      <p>{t.activityAppear}</p>
                    </div>
                  );
                }
                return (
                  <BusinessOverviewChart
                    data={overviewData}
                    currency={settings.currency}
                    language={settings.language}
                    period={overviewPeriod}
                  />
                );
              })()}
            </section>

            <section className={styles.quickPanel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{t.quick}</h2>
                  <p>{t.frequent}</p>
                </div>
              </div>

              <div className={styles.quickActions}>
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.key}
                      type="button"
                      className={styles.quickAction}
                      onClick={() => {
                        if (action.key === "exit") {
                          if (typeof window !== "undefined") window.close();
                          router.push("/");
                          return;
                        }
                        router.push(action.route);
                      }}
                    >
                      <span
                        className={`${styles.quickIcon} ${
                          styles[`quick-${action.color}`]
                        }`}
                        aria-hidden="true"
                      >
                        <Icon size={20} strokeWidth={2} />
                      </span>

                      <strong>{t[action.key as keyof typeof t]}</strong>

                      <span className={styles.quickArrow} aria-hidden="true">
                        <ArrowRight size={16} strokeWidth={2} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </section>
        </div>
      </section>
    </main>
  );
}

function KpiCard({
  accent,
  icon: Icon,
  title,
  value,
  subtitle,
  warning,
}: {
  accent: string;
  icon: LucideIcon;
  title: string;
  value: string;
  subtitle: string;
  warning?: boolean;
}) {
  return (
    <article
      className={`${styles.kpiCard} ${
        styles[`kpi-${accent}`]
      }`}
    >
      <div
        className={`${styles.kpiIcon} ${
          styles[`icon-${accent}`]
        }`}
        aria-hidden="true"
      >
        <Icon size={20} strokeWidth={2} />
      </div>

      <div className={styles.kpiContent}>
        <span>{title}</span>
        <strong>{value}{warning && <span title="Invalid financial value detected (NaN/Infinity)" style={{ marginInlineStart: 6, color: "var(--danger)", fontSize: 11, fontWeight: 800 }}>⚠ Data integrity</span>}</strong>
        <small>{subtitle}</small>
      </div>
    </article>
  );
}





