"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  ClipboardList,
  Factory,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Moon,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  ShoppingCart,
  Sun,
  Truck,
  Users,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import dashboardStyles from "../../../app/page.module.css";
import CompactHeader from "../layout/CompactHeader";
import RvbNotificationBell from "../notifications/RvbNotificationBell";
import WorkspaceTransition from "./WorkspaceTransition";
import {
  DEFAULT_SETTINGS,
  SETTINGS_EVENT,
  getDirection,
  getCachedSettings,
  setCachedSettings,
  resolveNavigationStyle,
} from "../../lib/settings";
import type { Settings } from "../../types/settings/settings";
import { RVB_UI_PREFERENCES_EVENT } from "@/src/services/rvb-ui-preferences.service";
import { settingsService } from "../../services/settings.service";
import { getSavedTheme, applyTheme } from "../../lib/theme";
import { useRvbAuth } from "../../contexts/RvbAuthContext";
import FloatingNav from "../layout/FloatingNav";
import type { FloatingNavEntry } from "../layout/FloatingNav";

export type RvbActivePage =
  | "dashboard"
  | "accounts"
  | "workers"
  | "suppliers"
  | "customers"
  | "orders"
  | "requests"
  | "chats"
  | "notifications"
  | "directory"
  | "settings";

type NavItem = {
  icon: LucideIcon;
  key: RvbActivePage;
  label: string;
  path: string;
};

export const RVB_NAVIGATION: readonly NavItem[] = [
  { icon: LayoutDashboard, key: "dashboard", label: "RVB Dashboard", path: "/rvb" },
  { icon: ShieldCheck, key: "accounts", label: "Accounts & Access", path: "/rvb/accounts" },
  { icon: Users, key: "workers", label: "Workers", path: "/rvb/workers" },
  { icon: Truck, key: "suppliers", label: "Suppliers", path: "/rvb/suppliers" },
  { icon: UsersRound, key: "customers", label: "Customers", path: "/rvb/customers" },
  { icon: ShoppingCart, key: "orders", label: "Orders", path: "/rvb/orders" },
  { icon: Inbox, key: "requests", label: "Requests", path: "/rvb/requests" },
  { icon: MessagesSquare, key: "chats", label: "Chats", path: "/rvb/chats" },
  { icon: Bell, key: "notifications", label: "Notifications & Activity", path: "/rvb/notifications" },
  { icon: Search, key: "directory", label: "Directory", path: "/rvb/directory" },
  { icon: SettingsIcon, key: "settings", label: "Settings", path: "/rvb/settings" },
] as const;

const translations = {
  en: {
    nav: {
      dashboard: "RVB Dashboard",
      accounts: "Accounts & Access",
      workers: "Workers",
      suppliers: "Suppliers",
      customers: "Customers",
      orders: "Orders",
      requests: "Requests",
      chats: "Chats",
      mainChats: "Main Chats",
      secondaryChats: "Secondary Chats",
      profile: "Profile & Management",
      notifications: "Notifications & Activity",
      directory: "Directory",
      search: "Search",
      settings: "Settings",
      people: "People",
      operations: "Operations",
    },
    brand: "RVB",
    brandSub: "Le Royaume des Viandes Blanches",
    subtitle: "The Kingdom of White Meat",
    openMenu: "Open navigation",
    closeMenu: "Close navigation",
    rvbBrandName: "The Kingdom of White Meat",
    rvbAbbreviation: "RVB",
    switchToHsh: "Access HSH",
    hero: {
      dashboard: { title: "RVB Control Center", description: "Overview of the RVB portal, operations and activity" },
      accounts: { title: "Accounts & Access", description: "Manage RVB accounts, roles, @tags and access lifecycle." },
      workers: { title: "Workers", description: "Worker profiles, salaries, credit, requests and activity." },
      suppliers: { title: "Suppliers", description: "Supplier portal activity, supply submissions and history." },
      customers: { title: "Customers", description: "Customer portal profiles, shipments and account activity." },
      orders: { title: "Orders", description: "Review and manage customer orders." },
      requests: { title: "Requests", description: "Review and manage worker, supplier and customer requests." },
      chats: { title: "Chats", description: "Official chats, private conversations and custom groups." },
      notifications: { title: "Notifications & Activity", description: "RVB notifications, statuses and activity history." },
      directory: { title: "Directory", description: "Search people and accounts by name, @tag or role." },
      settings: { title: "Settings", description: "RVB personal preferences and company business configuration." },
    },
  },
  fr: {
    nav: {
      dashboard: "Tableau de bord RVB",
      accounts: "Comptes et accès",
      workers: "Travailleurs",
      suppliers: "Fournisseurs",
      customers: "Clients",
      orders: "Commandes",
      requests: "Demandes",
      chats: "Discussions",
      mainChats: "Discussions principales",
      secondaryChats: "Discussions secondaires",
      profile: "Profil & Gestion",
      notifications: "Notifications et activité",
      directory: "Annuaire",
      search: "Recherche",
      settings: "Paramètres",
      people: "Personnes",
      operations: "Opérations",
    },
    brand: "RVB",
    brandSub: "Le Royaume des Viandes Blanches",
    subtitle: "Le Royaume des Viandes Blanches",
    openMenu: "Ouvrir la navigation",
    closeMenu: "Fermer la navigation",
    rvbBrandName: "Le royaume des viandes blanches",
    rvbAbbreviation: "RVB",
    switchToHsh: "Accéder à HSH",
    hero: {
      dashboard: { title: "Centre de contrôle RVB", description: "Vue d’ensemble du portail RVB, des opérations et de l’activité" },
      accounts: { title: "Comptes et accès", description: "Gérez les comptes RVB, les rôles, les @tags et le cycle de vie des accès." },
      workers: { title: "Travailleurs", description: "Profils travailleurs, salaires, crédit, demandes et activité." },
      suppliers: { title: "Fournisseurs", description: "Activité portail fournisseurs, soumissions et historique." },
      customers: { title: "Clients", description: "Profils clients portail, expéditions et activité des comptes." },
      orders: { title: "Commandes", description: "Consulter et gérer les commandes clients." },
      requests: { title: "Demandes", description: "Examiner et gérer les demandes travailleurs, fournisseurs et clients." },
      chats: { title: "Discussions", description: "Chats officiels, conversations privées et groupes personnalisés." },
      notifications: { title: "Notifications et activité", description: "Notifications RVB, statuts et historique d'activité." },
      directory: { title: "Annuaire", description: "Rechercher personnes et comptes par nom, @tag ou rôle." },
      settings: { title: "Paramètres", description: "Préférences personnelles R.V.B. et configuration d'entreprise." },
    },
  },
  ar: {
    nav: {
      dashboard: "لوحة تحكم RVB",
      accounts: "الحسابات والصلاحيات",
      workers: "العمال",
      suppliers: "الموردون",
      customers: "الزبائن",
      orders: "الطلبيات",
      requests: "الطلبات",
      chats: "المحادثات",
      mainChats: "المحادثات الرئيسية",
      secondaryChats: "المحادثات الثانوية",
      profile: "الملف والإدارة",
      notifications: "الإشعارات والنشاط",
      directory: "الدليل",
      search: "البحث",
      settings: "الإعدادات",
      people: "الأشخاص",
      operations: "العمليات",
    },
    brand: "RVB",
    brandSub: "مملكة اللحوم البيضاء",
    subtitle: "مملكة اللحوم البيضاء",
    openMenu: "فتح قائمة التنقل",
    closeMenu: "إغلاق قائمة التنقل",
    rvbBrandName: "مملكة اللحوم البيضاء",
    rvbAbbreviation: "RVB",
    switchToHsh: "الدخول إلى HSH",
    hero: {
      dashboard: { title: "مركز تحكم RVB", description: "نظرة عامة على بوابة RVB والعمليات والنشاط" },
      accounts: { title: "الحسابات والصلاحيات", description: "إدارة حسابات RVB والأدوار والصلاحيات ودورة حياة الوصول." },
      workers: { title: "العمال", description: "ملفات العمال، الرواتب، الائتمان، الطلبات والنشاط." },
      suppliers: { title: "الموردون", description: "نشاط بوابة الموردين، التوريدات والسجل." },
      customers: { title: "الزبائن", description: "ملفات الزبائن، الشحنات ونشاط الحسابات." },
      orders: { title: "الطلبيات", description: "مراجعة وإدارة طلبيات الزبائن." },
      requests: { title: "الطلبات", description: "مراجعة وإدارة طلبات العمال والموردين والزبائن." },
      chats: { title: "المحادثات", description: "المحادثات الرسمية والخاصة والمجموعات المخصصة." },
      notifications: { title: "الإشعارات والنشاط", description: "إشعارات RVB والحالات وسجل النشاط." },
      directory: { title: "الدليل", description: "البحث عن الأشخاص والحسابات بالاسم أو @tag أو الدور." },
      settings: { title: "الإعدادات", description: "تفضيلات شخصية R.V.B. وإعدادات الشركة." },
    },
  },
} as const;

export default function RvbShell({
  children,
  activePage,
  hideHeader = false,
}: {
  children: React.ReactNode;
  activePage: RvbActivePage;
  /**
   * Page-specific header composition: when true the shared CompactHeader is
   * omitted so the page can render its own command header (e.g. Directory).
   * Default false — every other RVB page is unaffected.
   */
  hideHeader?: boolean;
}) {
  const router = useRouter();

  const [dark, setDark] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Desktop hover/focus expand — ephemeral, never persisted. Matches AppShell.
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [sidebarFocused, setSidebarFocused] = useState(false);

  const desktopSidebarExpanded = sidebarHovered || sidebarFocused;
  const isDesktopCollapsed = !desktopSidebarExpanded;

  const [settings, setSettings] = useState<Settings>(() => getCachedSettings() ?? DEFAULT_SETTINGS);

  // Cold-load gate (see AppShell): no nav mounts until canonical settings
  // resolve. Warm transitions reuse the live cache and render immediately.
  const [settingsReady, setSettingsReady] = useState<boolean>(
    () => getCachedSettings() !== undefined,
  );

  const [transitionVisible, setTransitionVisible] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState<"rvb" | "hsh">("rvb");

  const sidebarNavRef = useRef<HTMLDivElement>(null);

  // Theme + settings shared (sidebar hover state is ephemeral, never persisted)
  useEffect(() => {
    try {
      const savedTheme = getSavedTheme();
      setDark(savedTheme === "dark");
      setThemeReady(true);
    } catch {}
  }, []);

  useEffect(() => {
    async function loadSettings() {
      // RVB consumes the SAME canonical value as HSH: Dexie-first canonical
      // loader (one-time legacy migration, canonical default otherwise).
      // The legacy RVB preference service is NEVER read here directly.
      const stored = await settingsService.loadCanonicalSettings().catch(() => undefined);
      if (stored) {
        setSettings(stored);
        setSettingsReady(true);
        document.documentElement.lang = stored.language;
        document.documentElement.dir = getDirection(stored.language);
      }
    }
    loadSettings();
  }, []);

  useEffect(() => {
    const applyCanonical = (next: Settings) => {
      setSettings(next);
      setCachedSettings(next);
      setSettingsReady(true);
      document.documentElement.lang = next.language;
      document.documentElement.dir = getDirection(next.language);
    };
    // Canonical channel: the detail IS canonical state.
    const readCanonicalEvent = (event: Event) => {
      const detail = (event as CustomEvent<Settings> | undefined)?.detail;
      if (detail) applyCanonical(detail);
    };
    // Legacy RVB channel: local state only, NEVER the shared cache.
    const readRvbEvent = (event: Event) => {
      const detail = (event as CustomEvent<Settings> | undefined)?.detail;
      if (!detail) {
        void settingsService.loadCanonicalSettings().then((stored) => {
          setSettings(stored);
          document.documentElement.lang = stored.language;
          document.documentElement.dir = getDirection(stored.language);
        });
        return;
      }
      setSettings(detail);
      document.documentElement.lang = detail.language;
      document.documentElement.dir = getDirection(detail.language);
    };
    // Cross-tab signal: re-read CANONICAL Dexie. Legacy storage is never
    // consulted here.
    const readCrossTab = () => {
      void settingsService.loadCanonicalSettings().then((stored) => {
        setSettings(stored);
        document.documentElement.lang = stored.language;
        document.documentElement.dir = getDirection(stored.language);
      });
    };
    window.addEventListener(RVB_UI_PREFERENCES_EVENT, readRvbEvent);
    window.addEventListener(SETTINGS_EVENT, readCanonicalEvent);
    window.addEventListener("storage", readCrossTab);
    return () => {
      window.removeEventListener(RVB_UI_PREFERENCES_EVENT, readRvbEvent);
      window.removeEventListener(SETTINGS_EVENT, readCanonicalEvent);
      window.removeEventListener("storage", readCrossTab);
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

  // Preserve scroll with independent key
  useEffect(() => {
    const el = sidebarNavRef.current;
    if (!el) return;
    const saved = sessionStorage.getItem("hebrih-rvb-sidebar-scrollTop");
    if (saved) {
      const top = parseInt(saved, 10);
      if (!Number.isNaN(top)) el.scrollTop = top;
    }
    const onScroll = () => {
      sessionStorage.setItem("hebrih-rvb-sidebar-scrollTop", String(el.scrollTop));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Entry transition: if coming from HSH, show RVB welcome then fade out
  useEffect(() => {
    try {
      const target = sessionStorage.getItem("hebrih-transition-target");
      if (target === "rvb") {
        setTransitionTarget("rvb");
        setTransitionVisible(true);
        const hide = setTimeout(() => setTransitionVisible(false), 900);
        const clear = setTimeout(() => {
          try { sessionStorage.removeItem("hebrih-transition-target"); } catch {}
        }, 1400);
        return () => { clearTimeout(hide); clearTimeout(clear); };
      }
    } catch {}
  }, []);

  function navigate(path: string) {
    setSidebarOpen(false);
    router.push(path, { scroll: false });
  }

  function handleSwitchToHsh() {
    try { sessionStorage.setItem("hebrih-transition-target", "hsh"); } catch {}
    setTransitionTarget("hsh");
    setTransitionVisible(true);
    setTimeout(() => {
      setSidebarOpen(false);
      router.push("/");
    }, 420);
    setTimeout(() => setTransitionVisible(false), 2200);
  }

  function toggleTheme() {
    const next = getSavedTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    setDark(next === "dark");
    // Persist personal theme preference (lightweight localStorage + account if authenticated)
    try {
      void import("@/src/services/rvb-ui-preferences.service").then((m) =>
        m.rvbUiPreferencesService.setTheme(next as any),
      );
    } catch {}
  }

  const { user, logout } = useRvbAuth();

  const t = translations[settings.language];
  const hero = t.hero[activePage] ?? t.hero.dashboard;

  const navLabels: Record<string, string> = {
    dashboard: (t.nav as any).dashboard,
    accounts: (t.nav as any).accounts,
    workers: (t.nav as any).workers,
    suppliers: (t.nav as any).suppliers,
    customers: (t.nav as any).customers,
    orders: (t.nav as any).orders,
    requests: (t.nav as any).requests,
    chats: (t.nav as any).chats,
    mainChats: (t.nav as any).mainChats,
    secondaryChats: (t.nav as any).secondaryChats,
    profile: (t.nav as any).profile,
    notifications: (t.nav as any).notifications,
    directory: (t.nav as any).directory,
    search: (t.nav as any).search,
    settings: (t.nav as any).settings,
    people: (t.nav as any).people,
    operations: (t.nav as any).operations,
  };

  // Grouped classic sidebar partition (canonical paths only — portal
  // query-path items never match, so secondary portal navigation stays
  // flat exactly as today). Filters apply on top of the role-filtered
  // visibleNav, so no role can gain a route through grouping.
  const RVB_PEOPLE_PATHS = ["/rvb/accounts", "/rvb/workers", "/rvb/suppliers", "/rvb/customers"];
  const RVB_OPERATIONS_PATHS = ["/rvb/orders", "/rvb/requests", "/rvb/chats"];
  // Notifications + Settings live in the sidebar footer utility row (like
  // HSH), so they are not full main-navigation rows. Routes/pages stay
  // intact — only the redundant main rows are removed.
  const RVB_FOOTER_PATHS = ["/rvb/notifications", "/rvb/settings"];
  type RvbNavGroup = "people" | "operations";

  // Collapsible nav groups. Accordion: opening one closes the other.
  // The group holding the active page starts open. Deterministic from
  // props — hydration-safe.
  const [rvbOpenGroup, setRvbOpenGroup] = useState<RvbNavGroup | null>(() => {
    if (["accounts", "workers", "suppliers", "customers"].includes(activePage)) return "people";
    if (["orders", "requests", "chats"].includes(activePage)) return "operations";
    return null;
  });

  function toggleRvbGroup(group: RvbNavGroup) {
    setRvbOpenGroup((current) => (current === group ? null : group));
  }

  // Role-aware navigation per spec 35
  const isManager = user?.role === "manager" || user?.role === "admin";
  const isSupervisor = user?.role === "supervisor";
  const isSecondary = user && ["worker","supplier","customer","supervisor"].includes(user.role);
  const portalNav: NavItem[] = [
    { icon: MessagesSquare, key: "chats" as any, label: (t.nav as any).mainChats, path: "/rvb/chats?category=main" },
    { icon: Inbox, key: "chats" as any, label: (t.nav as any).secondaryChats, path: "/rvb/chats?category=secondary" },
    { icon: LayoutDashboard, key: "dashboard" as any, label: (t.nav as any).profile || (t.nav as any).dashboard, path: "/rvb" },
    { icon: Search, key: "directory" as any, label: (t.nav as any).search || (t.nav as any).directory, path: "/rvb/directory" },
    { icon: SettingsIcon, key: "settings" as any, label: (t.nav as any).settings, path: "/rvb/settings" },
  ];
  const supervisorNav: NavItem[] = [
    ...portalNav,
    RVB_NAVIGATION.find((item) => item.key === "customers")!,
  ];
  const visibleNav = (() => {
    if (!user) {
      return RVB_NAVIGATION.filter((item) => {
        if (item.key === "accounts") return false;
        return true;
      });
    }
    if (isManager) return RVB_NAVIGATION;
    if (isSupervisor) return supervisorNav;
    if (isSecondary) return portalNav;
    // fallback: hide accounts for non-manager
    return RVB_NAVIGATION.filter((item) => {
      if (item.key === "accounts" && !isManager) return false;
      if (item.key === "workers" && isSupervisor) return false;
      if (item.key === "suppliers" && isSupervisor) return false;
      return true;
    });
  })();

  // Single shared global navigation-mode decision (same canonical
  // settings.navigationStyle HSH consumes). Exactly one navigation UI is
  // ever mounted. Deterministic from settings state (default "floating")
  // — hydration-safe; the stored preference arrives via the RVB
  // preferences effect + event subscription above.
  const rvbNavigationStyle = resolveNavigationStyle(settings.navigationStyle);

  // Active-route logic shared by classic + floating (extracted unchanged
  // from the classic item renderer, including the portal query matching).
  function isRvbItemActive(item: NavItem): boolean {
    const { key, path } = item;
    if (isSecondary) {
      // portal mode: check path match
      if (typeof window !== "undefined") {
        const cur = window.location.pathname + window.location.search;
        if (cur === path) return true;
        // fallback to activePage mapping
        if (key === "dashboard" && activePage === "dashboard") return path === "/rvb";
        if (key === "directory" && activePage === "directory") return path === "/rvb/directory";
        if (key === "settings" && activePage === "settings") return path === "/rvb/settings";
        if (key === "chats" && activePage === "chats") {
          return cur.includes(path.split("?")[0]) && cur.includes(path.split("?")[1] || "");
        }
      }
      return activePage === key && (path === "/rvb" ? activePage === "dashboard" : true);
    }
    return activePage === key;
  }

  const rvbTopItems = visibleNav.filter(
    (item) =>
      !RVB_PEOPLE_PATHS.includes(item.path) &&
      !RVB_OPERATIONS_PATHS.includes(item.path) &&
      !RVB_FOOTER_PATHS.includes(item.path),
  );
  const rvbPeopleItems = visibleNav.filter((item) => RVB_PEOPLE_PATHS.includes(item.path));
  const rvbOperationsItems = visibleNav.filter((item) => RVB_OPERATIONS_PATHS.includes(item.path));

  function rvbDisplayLabel(item: NavItem): string {
    return (item.label as string) || (navLabels as any)[item.key] || String(item.key);
  }

  // Floating radial entries reuse canonical icons/routes/labels.
  function rvbFanEntry(item: NavItem, keyOverride?: string): FloatingNavEntry {
    return {
      key: keyOverride ?? String(item.key),
      label: rvbDisplayLabel(item),
      path: item.path,
      icon: item.icon,
    };
  }

  function rvbFanEntries(items: readonly NavItem[]): FloatingNavEntry[] {
    return items.map((item) => rvbFanEntry(item));
  }

  function findRvbItem(path: string): NavItem | undefined {
    return visibleNav.find((item) => item.path === path);
  }

  // Floating root composition adapts to the role-filtered inventory so no
  // role ever loses a destination: managers get Control Center + Directory
  // + People/Operations groups; portal roles get profile + search + a Chats
  // group and a single-item group (Settings, or People for supervisors —
  // settings stays one tap away via the settings orbit for everyone).
  const rvbFloatConfig = (() => {
    const canSeeHsh = user?.role === "manager" || user?.role === "admin";
    if (isSupervisor || isSecondary) {
      const profile = findRvbItem("/rvb");
      const search = findRvbItem("/rvb/directory");
      const mainChats = findRvbItem("/rvb/chats?category=main");
      const secondaryChats = findRvbItem("/rvb/chats?category=secondary");
      const settingsPortal = findRvbItem("/rvb/settings");
      const customersCanonical = findRvbItem("/rvb/customers");
      const chatsChildren = [mainChats, secondaryChats]
        .filter((item): item is NavItem => !!item)
        .map((item, index) => rvbFanEntry(item, index === 0 ? "chats-main" : "chats-secondary"));
      const opsChildren = isSupervisor && customersCanonical
        ? [rvbFanEntry(customersCanonical)]
        : settingsPortal
          ? [rvbFanEntry(settingsPortal)]
          : [];
      return {
        dashboardEntry: profile ? rvbFanEntry(profile) : rvbFanEntry(RVB_NAVIGATION[0]),
        officeEntry: search ? rvbFanEntry(search) : rvbFanEntry(RVB_NAVIGATION[9]),
        managementLabel: navLabels.chats,
        managementItems: chatsChildren,
        operationsLabel: isSupervisor ? navLabels.people : navLabels.settings,
        operationsItems: opsChildren,
        canSeeHsh,
      };
    }
    const dashboardCanonical = findRvbItem("/rvb") ?? RVB_NAVIGATION[0];
    const directoryCanonical = findRvbItem("/rvb/directory") ?? RVB_NAVIGATION[9];
    const notificationsCanonical = findRvbItem("/rvb/notifications");
    return {
      dashboardEntry: rvbFanEntry(dashboardCanonical),
      officeEntry: rvbFanEntry(directoryCanonical),
      managementLabel: navLabels.people,
      managementItems: rvbFanEntries(rvbPeopleItems),
      operationsLabel: navLabels.operations,
      operationsItems: [
        ...rvbFanEntries(rvbOperationsItems),
        ...(notificationsCanonical ? [rvbFanEntry(notificationsCanonical)] : []),
      ],
      canSeeHsh,
    };
  })();

  async function handleRvbSignOut() {
    try { await logout(); } catch {}
    router.replace("/rvb/login");
  }

  // Classic sidebar item renderer (markup identical to the previous flat
  // list, including the notifications badge + collapsed tooltips).
  function renderRvbNavItem(item: NavItem, extraClass = "") {
    const Icon = item.icon;
    const displayLabel = rvbDisplayLabel(item);
    const isActive = isRvbItemActive(item);
    const uniqueKey = `${item.key}-${item.path}`;
    return (
      <div key={uniqueKey} className={dashboardStyles.navItemWrap}>
        <button
          type="button"
          className={`${dashboardStyles.sidebarItem} ${extraClass} ${
            isActive ? dashboardStyles.active : ""
          }`}
          onClick={() => navigate(item.path)}
          aria-label={displayLabel}
          title={isDesktopCollapsed ? displayLabel : undefined}
        >
          <span className={dashboardStyles.sidebarIcon} aria-hidden="true">
            <Icon size={18} strokeWidth={2} />
          </span>
          <span className={dashboardStyles.sidebarLabel}>{displayLabel}</span>
        </button>
        {isDesktopCollapsed && (
          <span className={dashboardStyles.tooltip} role="tooltip">
            {displayLabel}
          </span>
        )}
      </div>
    );
  }

  // Collapsible group renderer. Groups with zero visible children render
  // nothing — role filtering can never be widened by grouping.
  function renderRvbGroup(
    group: RvbNavGroup,
    label: string,
    GroupIcon: LucideIcon,
    items: NavItem[],
    groupId: string,
  ) {
    if (items.length === 0) return null;
    const isOpen = rvbOpenGroup === group;
    const isActive = items.some((item) => isRvbItemActive(item));
    return (
      <>
        <div className={dashboardStyles.navItemWrap}>
          <button
            type="button"
            className={`${dashboardStyles.sidebarItem} ${
              isActive ? dashboardStyles.navGroupButtonActive : ""
            }`}
            onClick={() => toggleRvbGroup(group)}
            aria-expanded={isOpen}
            aria-controls={groupId}
            aria-label={label}
            title={isDesktopCollapsed ? label : undefined}
          >
            <span className={dashboardStyles.sidebarIcon} aria-hidden="true">
              <GroupIcon size={18} strokeWidth={2} />
            </span>
            <span className={dashboardStyles.sidebarLabel}>{label}</span>
            <span
              className={`${dashboardStyles.navGroupChevron} ${
                isOpen ? dashboardStyles.navGroupChevronOpen : ""
              }`}
              aria-hidden="true"
            >
              <ChevronDown size={16} strokeWidth={2} />
            </span>
          </button>
          {isDesktopCollapsed && (
            <span className={dashboardStyles.tooltip} role="tooltip">
              {label}
            </span>
          )}
        </div>
        {isOpen && (
          <div id={groupId} className={dashboardStyles.navGroupChildren}>
            {items.map((item) => renderRvbNavItem(item, dashboardStyles.navGroupChild))}
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className={`${dashboardStyles.dashboard} ${
        dark ? dashboardStyles.themeDark : dashboardStyles.themeLight
      }`}
    >
      <WorkspaceTransition visible={transitionVisible} target={transitionTarget} language={settings.language} />

      {!settingsReady ? null : rvbNavigationStyle === "classic" ? (
      <>
      {sidebarOpen && (
        <button
          className={dashboardStyles.overlay}
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        data-nav-root="classic"
        className={`${dashboardStyles.sidebar} ${
          sidebarOpen ? dashboardStyles.sidebarOpen : ""
        } ${isDesktopCollapsed ? dashboardStyles.sidebarCollapsed : ""}`}
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
        onFocus={() => setSidebarFocused(true)}
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
        <div
          className={dashboardStyles.sidebarBrand}
          title={isDesktopCollapsed ? (t as any).rvbBrandName ?? t.brand : undefined}
        >
          <div className={dashboardStyles.brandLogo} title={isDesktopCollapsed ? (t as any).rvbBrandName ?? t.brand : undefined}>
            <img src="/chicken.jpg" alt="RVB logo" />
          </div>
          <div className={dashboardStyles.sidebarBrandContent}>
            <div className={dashboardStyles.sidebarBrandTitleRow}>
              <span className={dashboardStyles.sidebarBrandTitle}>{(t as any).rvbBrandName ?? t.brand}</span>
            </div>
            <span className={dashboardStyles.sidebarBrandSubtitle}>{(t as any).rvbAbbreviation ?? "RVB"}</span>
          </div>
        </div>

        <div className={dashboardStyles.sidebarDivider} />

        <nav ref={sidebarNavRef} className={dashboardStyles.sidebarNav}>
          {rvbTopItems.map((item) => renderRvbNavItem(item))}
          {renderRvbGroup("people", navLabels.people, Users, rvbPeopleItems, "people-rvb-group")}
          {renderRvbGroup("operations", navLabels.operations, ClipboardList, rvbOperationsItems, "operations-rvb-group")}
        </nav>

        {/* Current user area — details always rendered; CSS hides them on desktop-collapsed and restores on mobile */}
        {user && (
          <div
            className={dashboardStyles.rvbUserArea}
            style={{
              borderTop: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "var(--sidebar)",
              minWidth: 0,
            }}
          >
            <span
              style={{
                width: 36, height: 36, flex: "0 0 36px", display: "grid", placeItems: "center",
                borderRadius: 8, background: "var(--panel-hover)", border: "1px solid var(--border)",
                color: "var(--muted)", fontWeight: 800, fontSize: 12, overflow: "hidden",
              }}
              aria-hidden="true"
            >
              {user.profilePicture ? <img src={user.profilePicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (user.displayName?.slice(0,2).toUpperCase() || "?")}
            </span>
            <span className={dashboardStyles.rvbUserDetails} style={{ minWidth: 0, flex: 1, flexDirection: "column", gap: 1 }}>
              <strong style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.displayName}</strong>
              <small style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{user.tag} · {user.role}</small>
            </span>
            <button
              type="button"
              className={dashboardStyles.rvbSignOut}
              onClick={async () => { await logout(); router.replace("/rvb/login"); }}
              title="Sign Out"
              aria-label="Sign Out"
              style={{ width: 32, height: 32, placeItems: "center", border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel)", color: "var(--muted)", cursor: "pointer", flex: "0 0 32px" }}
            >
              <LogOut size={14} strokeWidth={2} />
            </button>
          </div>
        )}

        <div className={dashboardStyles.sidebarFooter}>
          <div className={dashboardStyles.sidebarUtilityRow}>
            <span className={dashboardStyles.sidebarUtilityBell}>
              <RvbNotificationBell language={settings.language} dark={dark} />
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
              className={`${dashboardStyles.sidebarUtilityButton} ${
                activePage === "settings" ? dashboardStyles.navGroupButtonActive : ""
              }`}
              onClick={() => navigate("/rvb/settings")}
              aria-label={navLabels.settings}
              title={navLabels.settings}
              aria-current={activePage === "settings" ? "page" : undefined}
            >
              <SettingsIcon size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
          {(user?.role === "manager" || user?.role === "admin") && (
          <div className={dashboardStyles.navItemWrap}>
            <button
              type="button"
              className={dashboardStyles.onlineButton}
              onClick={handleSwitchToHsh}
              aria-label={t.switchToHsh}
              title={isDesktopCollapsed ? t.switchToHsh : undefined}
            >
              <span className={dashboardStyles.onlineButtonIcon} aria-hidden="true">
                <Factory size={18} strokeWidth={2} />
              </span>
              <span className={dashboardStyles.onlineButtonLabel}>{t.switchToHsh}</span>
            </button>
            {isDesktopCollapsed && (
              <span className={dashboardStyles.tooltip} role="tooltip">
                {t.switchToHsh}
              </span>
            )}
          </div>
          )}
        </div>
      </aside>
      </>
      ) : (
      <FloatingNav
        activeKey={activePage}
        dashboardEntry={rvbFloatConfig.dashboardEntry}
        officeEntry={rvbFloatConfig.officeEntry}
        managementLabel={rvbFloatConfig.managementLabel}
        operationsLabel={rvbFloatConfig.operationsLabel}
        managementItems={rvbFloatConfig.managementItems}
        operationsItems={rvbFloatConfig.operationsItems}
        openMenuLabel={t.openMenu}
        closeMenuLabel={t.closeMenu}
        onNavigate={navigate}
        dark={dark}
        onToggleTheme={toggleTheme}
        themeLabel={dark ? "Switch to light mode" : "Switch to dark mode"}
        onOpenSettings={() => navigate("/rvb/settings")}
        settingsLabel={navLabels.settings}
        onAccessRvb={rvbFloatConfig.canSeeHsh ? handleSwitchToHsh : handleRvbSignOut}
        rvbLabel={rvbFloatConfig.canSeeHsh ? t.switchToHsh : "Sign Out"}
        utilityActionIcon={rvbFloatConfig.canSeeHsh ? "hsh" : "signout"}
        bell={<RvbNotificationBell language={settings.language} dark={dark} />}
      />
      )}

      <section className={dashboardStyles.mainContent}>
        <header className={dashboardStyles.mobileHeader}>
          {rvbNavigationStyle === "classic" && (
            <button
              type="button"
              className={dashboardStyles.menuButton}
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          )}

          <div className={dashboardStyles.mobileBrand}>
            <img src="/chicken.jpg" alt="" />
            <span>{(t as any).rvbBrandName ?? t.brand}</span>
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
          {!hideHeader && (
            <CompactHeader
              title={hero.title}
              description={hero.description}
              dark={dark}
              onToggleTheme={toggleTheme}
              language={settings.language}
              settingsHref="/rvb/settings"
              showUtilities={false}
              notificationBell={<RvbNotificationBell language={settings.language} dark={dark} />}
            />
          )}
          {children}
        </div>
      </section>
    </div>
  );
}

