"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  BarChart3,
  Boxes,
  BriefcaseBusiness,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Menu,
  Moon,
  Package,
  Receipt,
  Settings as SettingsIcon,
  ShoppingBag,
  ShoppingCart,
  Store,
  Sun,
  Truck,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import dashboardStyles from "../../../app/page.module.css";
import CompactHeader from "./CompactHeader";
import WorkspaceTransition from "../rvb/WorkspaceTransition";
import HshNotificationBell from "../notifications/HshNotificationBell";
import {
  SETTINGS_EVENT,
  DEFAULT_SETTINGS,
  getDirection,
} from "../../lib/settings";
import type { Settings } from "../../types/settings/settings";
import { settingsService } from "../../services/settings.service";
import { getSavedTheme, applyTheme } from "../../lib/theme";
import {
  CANONICAL_NAVIGATION,
  MANAGEMENT_KEYS,
  OPERATIONS_KEYS,
  navGroupForKey,
} from "../../lib/navigation";
import type { NavGroupKey } from "../../lib/navigation";

type ActivePage =
  | "dashboard"
  | "products"
  | "customers"
  | "suppliers"
  | "purchases"
  | "sales"
  | "payments"
  | "workers"
  | "vehicles"
  | "tasks"
  | "accounts"
  | "reports"
  | "invoice"
  | "office"
  | "settings"
  | "online";

type NavItem = {
  icon: LucideIcon;
  key: ActivePage;
  label: string;
  path: string;
};

// Canonical navigation - single source of truth shared with Dashboard
const navigation: readonly NavItem[] = CANONICAL_NAVIGATION.map((item) => ({
  icon: item.icon,
  key: item.key as unknown as ActivePage,
  label: item.key === "dashboard" ? "Management Dashboard" : item.key === "office" ? "My Office" : item.key.charAt(0).toUpperCase() + item.key.slice(1),
  path: item.path,
})) as unknown as readonly NavItem[];

const translations = {
  en: {
    nav: {
      dashboard: "Management Dashboard",
      products: "Products",
      customers: "Customers",
      suppliers: "Suppliers",
      purchases: "Purchases",
      sales: "Sales",
      payments: "Payments",
      workers: "Workers",
      vehicles: "Vehicles",
      tasks: "Tasks",
      accounts: "Accounts",
      reports: "Reports",
      invoice: "Invoice",
      office: "My Office",
      settings: "Settings",
    },
    brand: "Hebrih Slaughter House",
    system: "Management System",
    onlineAccess: "Access RVB",
    management: "Management",
    operations: "Operations",
    database: "Local database ready",
    ready: "Ready",
    operational: "System operational",
    customer: {
      title: "Customers",
      badge: "CUSTOMER MANAGEMENT",
      description: "Manage customer information, types, balances and history.",
    },
    supplier: {
      title: "Suppliers",
      badge: "SUPPLIER MANAGEMENT",
      description: "Manage supplier information, balances, contacts and purchase history.",
    },
    product: {
      title: "Products",
      badge: "PRODUCT MANAGEMENT",
      description: "Manage products, inventory quantities, pricing and weights.",
    },
    purchase: {
      title: "Purchases",
      badge: "PURCHASE MANAGEMENT",
      description: "Manage supplier purchases, calculations and purchase history.",
    },
    sale: {
      title: "Sales",
      badge: "SALES MANAGEMENT",
      description: "Manage sales, customers, products and transaction history.",
    },
    payment: {
      title: "Payments",
      badge: "PAYMENT MANAGEMENT",
      description: "Manage payments, accounts and financial transactions.",
    },
    worker: {
      title: "Workers",
      badge: "WORKFORCE MANAGEMENT",
      description: "Manage workers, positions, salaries and balances.",
    },
    vehicle: {
      title: "Vehicles",
      badge: "VEHICLE MANAGEMENT",
      description: "Manage vehicles and operational transport information.",
    },
    task: {
      title: "Tasks",
      badge: "TASK MANAGEMENT",
      description: "Manage operational tasks and workflow activities.",
    },
    account: {
      title: "Accounts",
      badge: "ACCOUNT MANAGEMENT",
      description: "Manage bank and cash accounts, balances and transfers.",
    },
    report: {
      title: "Reports",
      badge: "PERIODIC REPORTS",
      description: "View periodic situation by date range and category. الوضعية الدورية",
    },
    invoice: {
      title: "Invoice",
      badge: "INVOICE MANAGEMENT",
      description: "Seller → Customer invoicing",
    },
    office: {
      title: "My Office",
      badge: "OFFICE WORKSPACE",
      description: "Documents, spreadsheets and business templates. Integrated office.",
    },
    settings: {
      title: "Settings",
      badge: "SYSTEM SETTINGS",
      description: "Configure languages, currency and system parameters.",
    },
    online: {
      title: "RVB",
      badge: "RVB WORKSPACE",
      description: "The Kingdom of White Meat",
    },
    dashboard: {
      title: "Hebrih Slaughter House",
      badge: "MANAGEMENT DASHBOARD",
      description: "Central management workspace for inventory, sales, purchases, finances and workforce operations.",
    },
  },

  fr: {
    nav: {
      dashboard: "Tableau de bord",
      products: "Produits",
      customers: "Clients",
      suppliers: "Fournisseurs",
      purchases: "Achats",
      sales: "Ventes",
      payments: "Paiements",
      workers: "Employés",
      vehicles: "Véhicules",
      tasks: "Tâches",
      accounts: "Comptes",
      reports: "Rapports",
      invoice: "Facture",
      office: "Mon Bureau",
      settings: "Paramètres",
    },
    brand: "Abattoire Hebrih",
    system: "Système de gestion",
    onlineAccess: "Accéder à RVB",
    management: "Gestion",
    operations: "Opérations",
    database: "Base de données locale prête",
    ready: "Prêt",
    operational: "Système opérationnel",
    customer: {
      title: "Clients",
      badge: "GESTION DES CLIENTS",
      description: "Gérer les informations, types, soldes et historique des clients.",
    },
    supplier: {
      title: "Fournisseurs",
      badge: "GESTION DES FOURNISSEURS",
      description: "Gérer les informations, soldes, contacts et historique des achats.",
    },
    product: {
      title: "Produits",
      badge: "GESTION DES PRODUITS",
      description: "Gérer les produits, quantités en stock, prix et poids.",
    },
    purchase: {
      title: "Achats",
      badge: "GESTION DES ACHATS",
      description: "Gérer les achats fournisseurs, calculs et historique des achats.",
    },
    sale: {
      title: "Ventes",
      badge: "GESTION DES VENTES",
      description: "Gérer les ventes, clients, produits et historique des transactions.",
    },
    payment: {
      title: "Paiements",
      badge: "GESTION DES PAIEMENTS",
      description: "Gérer les paiements, comptes et transactions financières.",
    },
    worker: {
      title: "Employés",
      badge: "GESTION DU PERSONNEL",
      description: "Gérer les employés, postes, salaires et soldes.",
    },
    vehicle: {
      title: "Véhicules",
      badge: "GESTION DES VÉHICULES",
      description: "Gérer les véhicules et les informations de transport opérationnel.",
    },
    task: {
      title: "Tâches",
      badge: "GESTION DES TÂCHES",
      description: "Gérer les tâches opérationnelles et les activités de travail.",
    },
    account: {
      title: "Comptes",
      badge: "GESTION DES COMPTES",
      description: "Gérer les comptes bancaires et de trésorerie, soldes et transferts.",
    },
    report: {
      title: "Rapports",
      badge: "SITUATION PÉRIODIQUE",
      description: "Afficher la situation périodique par période et catégorie. الوضعية الدورية",
    },
    invoice: {
      title: "Facture",
      badge: "GESTION DES FACTURES",
      description: "Facturation Vendeur → Client",
    },
    office: {
      title: "Mon Bureau",
      badge: "ESPACE DE TRAVAIL",
      description: "Documents, tableurs et modèles d'entreprise. Bureau intégré.",
    },
    settings: {
      title: "Paramètres",
      badge: "PARAMÈTRES SYSTÈME",
      description: "Configurer les langues, la devise et les paramètres système.",
    },
    online: {
      title: "RVB",
      badge: "ESPACE RVB",
      description: "Le Royaume des Viandes Blanches",
    },
    dashboard: {
      title: "Abattoire Hebrih",
      badge: "TABLEAU DE BORD",
      description: "Espace central de gestion des stocks, ventes, achats, finances et personnel.",
    },
  },

  ar: {
    nav: {
      dashboard: "لوحة التحكم",
      products: "المنتجات",
      customers: "العملاء",
      suppliers: "الموردون",
      purchases: "المشتريات",
      sales: "المبيعات",
      payments: "المدفوعات",
      workers: "العمال",
      vehicles: "المركبات",
      tasks: "المهام",
      accounts: "الحسابات",
      reports: "التقارير",
      invoice: "الفاتورة",
      office: "مكتبي",
      settings: "الإعدادات",
    },
    brand: "مذبح حبريح للدواجن",
    system: "نظام الإدارة",
    onlineAccess: "الدخول إلى RVB",
    management: "الإدارة",
    operations: "العمليات",
    database: "قاعدة البيانات المحلية جاهزة",
    ready: "جاهز",
    operational: "النظام يعمل",
    customer: {
      title: "العملاء",
      badge: "إدارة العملاء",
      description: "إدارة معلومات العملاء وأنواعهم وأرصدتهم وسجلهم.",
    },
    supplier: {
      title: "الموردون",
      badge: "إدارة الموردين",
      description: "إدارة معلومات الموردين وأرصدتهم وجهات الاتصال وسجل المشتريات.",
    },
    product: {
      title: "المنتجات",
      badge: "إدارة المنتجات",
      description: "إدارة المنتجات وكميات المخزون والأسعار والأوزان.",
    },
    purchase: {
      title: "المشتريات",
      badge: "إدارة المشتريات",
      description: "إدارة مشتريات الموردين والحسابات وسجل المشتريات.",
    },
    sale: {
      title: "المبيعات",
      badge: "إدارة المبيعات",
      description: "إدارة المبيعات والعملاء والمنتجات وسجل المعاملات.",
    },
    payment: {
      title: "المدفوعات",
      badge: "إدارة المدفوعات",
      description: "إدارة المدفوعات والحسابات والمعاملات المالية.",
    },
    worker: {
      title: "العمال",
      badge: "إدارة العمال",
      description: "إدارة العمال والمناصب والرواتب والأرصدة.",
    },
    vehicle: {
      title: "المركبات",
      badge: "إدارة المركبات",
      description: "إدارة المركبات ومعلومات النقل والتشغيل.",
    },
    task: {
      title: "المهام",
      badge: "إدارة المهام",
      description: "إدارة المهام التشغيلية وأنشطة سير العمل.",
    },
    account: {
      title: "الحسابات",
      badge: "إدارة الحسابات",
      description: "إدارة الحسابات البنكية والنقدية والتحويلات.",
    },
    report: {
      title: "التقارير",
      badge: "الوضعية الدورية",
      description: "عرض الوضعية الدورية حسب الفترة والفئة.",
    },
    invoice: {
      title: "الفاتورة",
      badge: "إدارة الفاتورة",
      description: "الفوترة من البائع إلى الزبون",
    },
    office: {
      title: "مكتبي",
      badge: "مساحة المكتب",
      description: "المستندات وجداول البيانات والقوالب المهنية. مكتب متكامل.",
    },
    settings: {
      title: "الإعدادات",
      badge: "إعدادات النظام",
      description: "تهيئة اللغات والعملة ومعايير النظام.",
    },
    online: {
      title: "RVB",
      badge: "مساحة RVB",
      description: "مملكة اللحوم البيضاء",
    },
    dashboard: {
      title: "مذبح حبريح للدواجن",
      badge: "لوحة التحكم",
      description: "مساحة مركزية لإدارة المخزون والمبيعات والمشتريات والمالية والعمال.",
    },
  },
} as const;

export default function AppShell({
  children,
  activePage,
  showHeader = true,
}: {
  children: React.ReactNode;
  activePage: ActivePage;
  showHeader?: boolean;
}) {
  const router = useRouter();

  const [dark, setDark] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Desktop hover/focus expand — ephemeral, never persisted.
  // Desktop sidebar is collapsed unless hovered or keyboard-focused.
  // Mobile drawer remains controlled solely by `sidebarOpen` via CSS.
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [sidebarFocused, setSidebarFocused] = useState(false);

  const desktopSidebarExpanded = sidebarHovered || sidebarFocused;
  const isDesktopCollapsed = !desktopSidebarExpanded;

  // Collapsible nav groups (Management / Operations). Accordion:
  // opening one closes the other. The group holding the active page
  // starts open; hover/focus never changes group state.
  const isManagementActive = (MANAGEMENT_KEYS as readonly string[]).includes(activePage);
  const isOperationsActive = (OPERATIONS_KEYS as readonly string[]).includes(activePage);
  const [openGroup, setOpenGroup] = useState<NavGroupKey | null>(
    isManagementActive ? "management" : isOperationsActive ? "operations" : null,
  );

  function toggleGroup(group: NavGroupKey) {
    setOpenGroup((current) => (current === group ? null : group));
  }

  // Input-modality tracking: pointer focus must not pin the sidebar open,
  // keyboard (Tab/arrows) focus must keep it expanded until focus leaves.
  const lastInputRef = useRef<"pointer" | "keyboard">("pointer");

  useEffect(() => {
    const markPointer = () => {
      lastInputRef.current = "pointer";
    };
    const markKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Tab" || event.key.startsWith("Arrow")) {
        lastInputRef.current = "keyboard";
      }
    };
    window.addEventListener("pointerdown", markPointer, { passive: true });
    window.addEventListener("keydown", markKeyboard);
    return () => {
      window.removeEventListener("pointerdown", markPointer);
      window.removeEventListener("keydown", markKeyboard);
    };
  }, []);

  const [settings, setSettings] =
    useState<Settings>(DEFAULT_SETTINGS);

  const [transitionVisible, setTransitionVisible] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState<"rvb" | "hsh">("rvb");

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

  useEffect(() => {
    try {
      const savedTheme = getSavedTheme();
      setDark(savedTheme === "dark");
      setThemeReady(true);
    } catch {}
  }, []);

  useEffect(() => {
    async function loadSettings() {
      const stored = await settingsService.get();

      if (stored) {
        setSettings(stored);
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
        document.documentElement.lang = customEvent.detail.language;
        document.documentElement.dir = getDirection(
          customEvent.detail.language,
        );
        return;
      }

      settingsService.get().then((stored) => {
        if (!stored) return;

        setSettings(stored);
        document.documentElement.lang = stored.language;
        document.documentElement.dir = getDirection(stored.language);
      });
    };

    window.addEventListener(SETTINGS_EVENT, readSettings);
    window.addEventListener("storage", readSettings);

    return () => {
      window.removeEventListener(SETTINGS_EVENT, readSettings);
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

  const sidebarNavRef = useRef<HTMLDivElement>(null);

  // Preserve sidebar scroll position across remounts (per-page AppShell would otherwise reset to 0)
  useEffect(() => {
    const el = sidebarNavRef.current;
    if (!el) return;
    const saved = sessionStorage.getItem("hebrih-sidebar-scrollTop");
    if (saved) {
      const top = parseInt(saved, 10);
      if (!Number.isNaN(top)) el.scrollTop = top;
    }
    const onScroll = () => {
      sessionStorage.setItem("hebrih-sidebar-scrollTop", String(el.scrollTop));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  function navigate(path: string) {
    setSidebarOpen(false);
    router.push(path, { scroll: false });
  }

  // Sidebar partition: dashboard + office stay top-level, grouped pages
  // render only inside their group, remaining items (settings) stay last.
  // Icons/paths/keys come from canonical navigation — unchanged.
  const topNavItems = navigation.filter(
    (item) => item.key === "dashboard" || item.key === "office",
  );
  // Settings lives only in the footer utility row — never as a nav item.
  const bottomNavItems = navigation.filter(
    (item) =>
      item.key !== "dashboard" &&
      item.key !== "office" &&
      item.key !== "settings" &&
      navGroupForKey(item.key) === null,
  );

  function orderedGroupItems(keys: readonly string[]): NavItem[] {
    return keys
      .map((key) => navigation.find((item) => item.key === key))
      .filter((item): item is NavItem => item !== undefined);
  }

  const managementItems = orderedGroupItems(MANAGEMENT_KEYS);
  const operationsItems = orderedGroupItems(OPERATIONS_KEYS);

  function handleSwitchToRvb() {
    try { sessionStorage.setItem("hebrih-transition-target", "rvb"); } catch {}
    setTransitionTarget("rvb");
    setTransitionVisible(true);
    setTimeout(() => {
      setSidebarOpen(false);
      router.push("/rvb");
    }, 420);
    setTimeout(() => setTransitionVisible(false), 2200);
  }

  function toggleTheme() {
    const next = getSavedTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    setDark(next === "dark");
  }

  const t = translations[settings.language];

  const heroTitle: Record<ActivePage, string> = {
    dashboard: t.dashboard.title,
    products: t.product.title,
    customers: t.customer.title,
    suppliers: t.supplier.title,
    purchases: t.purchase.title,
    sales: t.sale.title,
    payments: t.payment.title,
    workers: t.worker.title,
    vehicles: t.vehicle.title,
    tasks: t.task.title,
    accounts: t.account.title,
    reports: t.report.title,
    invoice: t.invoice.title,
    office: (t as any).office.title,
    settings: t.settings.title,
    online: (t as any).online?.title ?? "RVB",
  };

  const heroDescription: Record<ActivePage, string> = {
    dashboard: t.dashboard.description,
    products: t.product.description,
    customers: t.customer.description,
    suppliers: t.supplier.description,
    purchases: t.purchase.description,
    sales: t.sale.description,
    payments: t.payment.description,
    workers: t.worker.description,
    vehicles: t.vehicle.description,
    tasks: t.task.description,
    accounts: t.account.description,
    reports: t.report.description,
    invoice: t.invoice.description,
    office: (t as any).office.description,
    settings: t.settings.description,
    online: (t as any).online?.description ?? "The Kingdom of White Meat",
  };

  const navLabels: Record<ActivePage, string> = {
    dashboard: t.nav.dashboard,
    products: t.nav.products,
    customers: t.nav.customers,
    suppliers: t.nav.suppliers,
    purchases: t.nav.purchases,
    sales: t.nav.sales,
    payments: t.nav.payments,
    workers: t.nav.workers,
    vehicles: t.nav.vehicles,
    tasks: t.nav.tasks,
    accounts: t.nav.accounts,
    reports: t.nav.reports,
    invoice: t.nav.invoice,
    office: (t as any).nav.office,
    settings: t.nav.settings,
    online: t.onlineAccess,
  };

  return (
    <div
      className={`${dashboardStyles.dashboard} ${
        dark ? dashboardStyles.themeDark : dashboardStyles.themeLight
      }`}
    >
      <WorkspaceTransition visible={transitionVisible} target={transitionTarget} language={settings.language} />

      {sidebarOpen && (
        <button
          className={dashboardStyles.overlay}
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`${dashboardStyles.sidebar} ${dashboardStyles.sidebarCompact} ${
          sidebarOpen ? dashboardStyles.sidebarOpen : ""
        } ${isDesktopCollapsed ? dashboardStyles.sidebarCollapsed : ""}`}
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
        onPointerDown={() => {
          lastInputRef.current = "pointer";
          setSidebarFocused(false);
        }}
        onFocus={() => {
          if (lastInputRef.current === "keyboard") {
            setSidebarFocused(true);
          }
        }}
        onBlur={(event) => {
          if (
            !event.currentTarget.contains(
              event.relatedTarget as Node | null
            )
          ) {
            setSidebarFocused(false);
          }
        }}
      >
        <div className={dashboardStyles.sidebarBrand}>
          <div className={dashboardStyles.brandLogo}>
            <img src="/chicken.jpg" alt="Hebrih logo" />
          </div>
          <div className={dashboardStyles.sidebarBrandContent}>
            <div className={dashboardStyles.sidebarBrandTitleRow}>
              <span className={dashboardStyles.sidebarBrandTitle}>{t.brand}</span>
            </div>
            <span className={dashboardStyles.sidebarBrandSubtitle}>{t.system}</span>
          </div>
        </div>

        <div className={dashboardStyles.sidebarDivider} />

        <nav ref={sidebarNavRef} className={dashboardStyles.sidebarNav}>
          {topNavItems.map(({ icon: Icon, key, path }) => (
            <div key={key} className={dashboardStyles.navItemWrap}>
              <button
                type="button"
                className={`${dashboardStyles.sidebarItem} ${
                  activePage === key ? dashboardStyles.active : ""
                }`}
                onClick={() => navigate(path)}
                aria-label={navLabels[key]}
                title={isDesktopCollapsed ? navLabels[key] : undefined}
              >
                <span className={dashboardStyles.sidebarIcon} aria-hidden="true">
                  <Icon size={18} strokeWidth={2} />
                </span>
                <span className={dashboardStyles.sidebarLabel}>{navLabels[key]}</span>
              </button>
              {isDesktopCollapsed && (
                <span className={dashboardStyles.tooltip} role="tooltip">
                  {navLabels[key]}
                </span>
              )}
            </div>
          ))}

          {/* Management group */}
          <div className={dashboardStyles.navItemWrap}>
            <button
              type="button"
              className={`${dashboardStyles.sidebarItem} ${
                isManagementActive ? dashboardStyles.navGroupButtonActive : ""
              }`}
              onClick={() => toggleGroup("management")}
              aria-expanded={openGroup === "management"}
              aria-controls="management-sidebar-group"
              aria-label={t.management}
              title={isDesktopCollapsed ? t.management : undefined}
            >
              <span className={dashboardStyles.sidebarIcon} aria-hidden="true">
                <Boxes size={18} strokeWidth={2} />
              </span>
              <span className={dashboardStyles.sidebarLabel}>{t.management}</span>
              <span
                className={`${dashboardStyles.navGroupChevron} ${
                  openGroup === "management" ? dashboardStyles.navGroupChevronOpen : ""
                }`}
                aria-hidden="true"
              >
                <ChevronDown size={16} strokeWidth={2} />
              </span>
            </button>
            {isDesktopCollapsed && (
              <span className={dashboardStyles.tooltip} role="tooltip">
                {t.management}
              </span>
            )}
          </div>
          {openGroup === "management" && (
            <div
              id="management-sidebar-group"
              className={dashboardStyles.navGroupChildren}
            >
              {managementItems.map(({ icon: Icon, key, path }) => (
                <div key={key} className={dashboardStyles.navItemWrap}>
                  <button
                    type="button"
                    className={`${dashboardStyles.sidebarItem} ${dashboardStyles.navGroupChild} ${
                      activePage === key ? dashboardStyles.active : ""
                    }`}
                    onClick={() => navigate(path)}
                    aria-label={navLabels[key]}
                    title={isDesktopCollapsed ? navLabels[key] : undefined}
                  >
                    <span className={dashboardStyles.sidebarIcon} aria-hidden="true">
                      <Icon size={18} strokeWidth={2} />
                    </span>
                    <span className={dashboardStyles.sidebarLabel}>{navLabels[key]}</span>
                  </button>
                  {isDesktopCollapsed && (
                    <span className={dashboardStyles.tooltip} role="tooltip">
                      {navLabels[key]}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Operations group */}
          <div className={dashboardStyles.navItemWrap}>
            <button
              type="button"
              className={`${dashboardStyles.sidebarItem} ${
                isOperationsActive ? dashboardStyles.navGroupButtonActive : ""
              }`}
              onClick={() => toggleGroup("operations")}
              aria-expanded={openGroup === "operations"}
              aria-controls="operations-sidebar-group"
              aria-label={t.operations}
              title={isDesktopCollapsed ? t.operations : undefined}
            >
              <span className={dashboardStyles.sidebarIcon} aria-hidden="true">
                <ClipboardList size={18} strokeWidth={2} />
              </span>
              <span className={dashboardStyles.sidebarLabel}>{t.operations}</span>
              <span
                className={`${dashboardStyles.navGroupChevron} ${
                  openGroup === "operations" ? dashboardStyles.navGroupChevronOpen : ""
                }`}
                aria-hidden="true"
              >
                <ChevronDown size={16} strokeWidth={2} />
              </span>
            </button>
            {isDesktopCollapsed && (
              <span className={dashboardStyles.tooltip} role="tooltip">
                {t.operations}
              </span>
            )}
          </div>
          {openGroup === "operations" && (
            <div
              id="operations-sidebar-group"
              className={dashboardStyles.navGroupChildren}
            >
              {operationsItems.map(({ icon: Icon, key, path }) => (
                <div key={key} className={dashboardStyles.navItemWrap}>
                  <button
                    type="button"
                    className={`${dashboardStyles.sidebarItem} ${dashboardStyles.navGroupChild} ${
                      activePage === key ? dashboardStyles.active : ""
                    }`}
                    onClick={() => navigate(path)}
                    aria-label={navLabels[key]}
                    title={isDesktopCollapsed ? navLabels[key] : undefined}
                  >
                    <span className={dashboardStyles.sidebarIcon} aria-hidden="true">
                      <Icon size={18} strokeWidth={2} />
                    </span>
                    <span className={dashboardStyles.sidebarLabel}>{navLabels[key]}</span>
                  </button>
                  {isDesktopCollapsed && (
                    <span className={dashboardStyles.tooltip} role="tooltip">
                      {navLabels[key]}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {bottomNavItems.map(({ icon: Icon, key, path }) => (
            <div key={key} className={dashboardStyles.navItemWrap}>
              <button
                type="button"
                className={`${dashboardStyles.sidebarItem} ${
                  activePage === key ? dashboardStyles.active : ""
                }`}
                onClick={() => navigate(path)}
                aria-label={navLabels[key]}
                title={isDesktopCollapsed ? navLabels[key] : undefined}
              >
                <span className={dashboardStyles.sidebarIcon} aria-hidden="true">
                  <Icon size={18} strokeWidth={2} />
                </span>
                <span className={dashboardStyles.sidebarLabel}>{navLabels[key]}</span>
              </button>
              {isDesktopCollapsed && (
                <span className={dashboardStyles.tooltip} role="tooltip">
                  {navLabels[key]}
                </span>
              )}
            </div>
          ))}
        </nav>

        <div className={dashboardStyles.sidebarFooter}>
          <div className={dashboardStyles.sidebarUtilityRow}>
            <span className={dashboardStyles.sidebarUtilityBell}>
              <HshNotificationBell language={settings.language} dark={dark} />
            </span>
            <button
              type="button"
              className={dashboardStyles.sidebarUtilityButton}
              onClick={toggleTheme}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {dark ? (
                <Sun size={18} strokeWidth={2} aria-hidden="true" />
              ) : (
                <Moon size={18} strokeWidth={2} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className={dashboardStyles.sidebarUtilityButton}
              onClick={() => navigate("/settings")}
              aria-label="Settings"
              title="Settings"
            >
              <SettingsIcon size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
          <div className={dashboardStyles.navItemWrap}>
            <button
              type="button"
              className={`${dashboardStyles.onlineButton} ${activePage === "online" ? dashboardStyles.activeOnline : ""}`}
              onClick={handleSwitchToRvb}
              aria-label={t.onlineAccess}
              title={isDesktopCollapsed ? t.onlineAccess : undefined}
            >
              <span className={dashboardStyles.onlineButtonIcon} aria-hidden="true">
                <Store size={18} strokeWidth={2} />
              </span>
              <span className={dashboardStyles.onlineButtonLabel}>{t.onlineAccess}</span>
            </button>
            {isDesktopCollapsed && (
              <span className={dashboardStyles.tooltip} role="tooltip">
                {t.onlineAccess}
              </span>
            )}
          </div>
        </div>
      </aside>

      <section className={dashboardStyles.mainContent}>
        <header className={dashboardStyles.mobileHeader}>
          <button
            type="button"
            className={dashboardStyles.menuButton}
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} strokeWidth={2} aria-hidden="true" />
          </button>

          <div className={dashboardStyles.mobileBrand}>
            <img src="/chicken.jpg" alt="" />
            <span>{t.brand}</span>
          </div>

          <button
            type="button"
            className={dashboardStyles.mobileTheme}
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {dark ? (
              <Sun size={18} strokeWidth={2} aria-hidden="true" />
            ) : (
              <Moon size={18} strokeWidth={2} aria-hidden="true" />
            )}
          </button>
        </header>

        <div className={dashboardStyles.content}>
          {showHeader && (
            <CompactHeader
              title={heroTitle[activePage]}
              description={heroDescription[activePage]}
              dark={dark}
              onToggleTheme={toggleTheme}
              language={settings.language}
              settingsHref="/settings"
              showUtilities={false}
              notificationBell={<HshNotificationBell language={settings.language} dark={dark} />}
            />
          )}

          {children}
        </div>
      </section>
    </div>
  );
}
