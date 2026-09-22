"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
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
import WorkspaceTransition from "./WorkspaceTransition";
import {
  SETTINGS_EVENT,
  DEFAULT_SETTINGS,
  getDirection,
} from "../../lib/settings";
import type { Settings } from "../../types/settings/settings";
import { settingsService } from "../../services/settings.service";
import { getSavedTheme, applyTheme } from "../../lib/theme";
import { useRvbAuth } from "../../contexts/RvbAuthContext";

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
      notifications: "Notifications & Activity",
      directory: "Directory",
      settings: "Settings",
    },
    brand: "RVB",
    brandSub: "Le Royaume des Viandes Blanches",
    subtitle: "The Kingdom of White Meat",
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
      requests: { title: "Requests", description: "Review payment requests, loans, discrepancies and submitted operations." },
      chats: { title: "Chats", description: "Official chats, private conversations and custom groups." },
      notifications: { title: "Notifications & Activity", description: "RVB notifications, statuses and activity history." },
      directory: { title: "Directory", description: "Search people and accounts by name, @tag or role." },
      settings: { title: "Settings", description: "Shared HSH / RVB application settings." },
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
      notifications: "Notifications et activité",
      directory: "Annuaire",
      settings: "Paramètres",
    },
    brand: "RVB",
    brandSub: "Le Royaume des Viandes Blanches",
    subtitle: "Le Royaume des Viandes Blanches",
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
      requests: { title: "Demandes", description: "Vérifier les demandes de paiement, prêts, écarts et opérations soumises." },
      chats: { title: "Discussions", description: "Chats officiels, conversations privées et groupes personnalisés." },
      notifications: { title: "Notifications et activité", description: "Notifications RVB, statuts et historique d'activité." },
      directory: { title: "Annuaire", description: "Rechercher personnes et comptes par nom, @tag ou rôle." },
      settings: { title: "Paramètres", description: "Paramètres d'application partagés HSH / RVB." },
    },
  },
  ar: {
    nav: {
      dashboard: "لوحة تحكم RVB",
      accounts: "الحسابات والصلاحيات",
      workers: "العمال",
      suppliers: "الموردون",
      customers: "الزبائن",
      orders: "الطلبات",
      requests: "الطلبات والمراجعات",
      chats: "المحادثات",
      notifications: "الإشعارات والنشاط",
      directory: "الدليل",
      settings: "الإعدادات",
    },
    brand: "RVB",
    brandSub: "مملكة اللحوم البيضاء",
    subtitle: "مملكة اللحوم البيضاء",
    rvbBrandName: "مملكة اللحوم البيضاء",
    rvbAbbreviation: "RVB",
    switchToHsh: "الدخول إلى HSH",
    hero: {
      dashboard: { title: "مركز تحكم RVB", description: "نظرة عامة على بوابة RVB والعمليات والنشاط" },
      accounts: { title: "الحسابات والصلاحيات", description: "إدارة حسابات RVB والأدوار والصلاحيات ودورة حياة الوصول." },
      workers: { title: "العمال", description: "ملفات العمال، الرواتب، الائتمان، الطلبات والنشاط." },
      suppliers: { title: "الموردون", description: "نشاط بوابة الموردين، التوريدات والسجل." },
      customers: { title: "الزبائن", description: "ملفات الزبائن، الشحنات ونشاط الحسابات." },
      orders: { title: "الطلبات", description: "مراجعة وإدارة طلبات الزبائن." },
      requests: { title: "الطلبات والمراجعات", description: "مراجعة طلبات الدفع والقروض والاختلافات والعمليات المرسلة." },
      chats: { title: "المحادثات", description: "المحادثات الرسمية والخاصة والمجموعات المخصصة." },
      notifications: { title: "الإشعارات والنشاط", description: "إشعارات RVB والحالات وسجل النشاط." },
      directory: { title: "الدليل", description: "البحث عن الأشخاص والحسابات بالاسم أو @tag أو الدور." },
      settings: { title: "الإعدادات", description: "إعدادات التطبيق المشتركة بين HSH و RVB." },
    },
  },
} as const;

export default function RvbShell({
  children,
  activePage,
}: {
  children: React.ReactNode;
  activePage: RvbActivePage;
}) {
  const router = useRouter();

  const [dark, setDark] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const [transitionVisible, setTransitionVisible] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState<"rvb" | "hsh">("rvb");

  const sidebarNavRef = useRef<HTMLDivElement>(null);

  // Theme + collapsed + settings shared
  useEffect(() => {
    try {
      const savedTheme = getSavedTheme();
      setDark(savedTheme === "dark");
      setThemeReady(true);
    } catch {}
    try {
      const savedCollapsed = localStorage.getItem("hebrih-rvb-sidebar-collapsed") === "true";
      setSidebarCollapsed(savedCollapsed);
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
        document.documentElement.dir = getDirection(customEvent.detail.language);
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

  useEffect(() => {
    try {
      localStorage.setItem("hebrih-rvb-sidebar-collapsed", String(sidebarCollapsed));
    } catch {}
  }, [sidebarCollapsed]);

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((prev) => !prev);
  }

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
  }

  const { user, logout } = useRvbAuth();

  const t = translations[settings.language];
  const hero = t.hero[activePage] ?? t.hero.dashboard;

  const navLabels: Record<RvbActivePage, string> = {
    dashboard: t.nav.dashboard,
    accounts: t.nav.accounts,
    workers: t.nav.workers,
    suppliers: t.nav.suppliers,
    customers: t.nav.customers,
    orders: t.nav.orders,
    requests: t.nav.requests,
    chats: t.nav.chats,
    notifications: t.nav.notifications,
    directory: t.nav.directory,
    settings: t.nav.settings,
  };

  // Filter navigation: only manager/admin see Accounts & Access
  const isManager = user?.role === "manager" || user?.role === "admin";
  const visibleNav = RVB_NAVIGATION.filter((item) => {
    if (item.key === "accounts" && !isManager && user) return false;
    return true;
  });

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
        className={`${dashboardStyles.sidebar} ${
          sidebarOpen ? dashboardStyles.sidebarOpen : ""
        } ${sidebarCollapsed ? dashboardStyles.sidebarCollapsed : ""}`}
      >
        <div
          className={dashboardStyles.sidebarBrand}
          title={sidebarCollapsed ? (t as any).rvbBrandName ?? t.brand : undefined}
        >
          <div className={dashboardStyles.brandLogo} title={sidebarCollapsed ? (t as any).rvbBrandName ?? t.brand : undefined}>
            <img src="/chicken.jpg" alt="RVB logo" />
          </div>
          <div className={dashboardStyles.sidebarBrandContent}>
            <div className={dashboardStyles.sidebarBrandTitleRow}>
              <span className={dashboardStyles.sidebarBrandTitle}>{(t as any).rvbBrandName ?? t.brand}</span>
              <button
                type="button"
                className={dashboardStyles.sidebarCollapseButton}
                onClick={toggleSidebarCollapsed}
                aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
                aria-expanded={!sidebarCollapsed}
                title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
              >
                {(() => {
                  const isRtl = getDirection(settings.language) === "rtl";
                  if (sidebarCollapsed) {
                    return isRtl ? (
                      <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
                    ) : (
                      <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                    );
                  }
                  return isRtl ? (
                    <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
                  );
                })()}
              </button>
            </div>
            <span className={dashboardStyles.sidebarBrandSubtitle}>{(t as any).rvbAbbreviation ?? "RVB"}</span>
          </div>
        </div>

        <div className={dashboardStyles.sidebarDivider} />

        <nav ref={sidebarNavRef} className={dashboardStyles.sidebarNav}>
          {visibleNav.map(({ icon: Icon, key, path }) => (
            <div key={key} className={dashboardStyles.navItemWrap}>
              <button
                type="button"
                className={`${dashboardStyles.sidebarItem} ${
                  activePage === key ? dashboardStyles.active : ""
                }`}
                onClick={() => navigate(path)}
                aria-label={navLabels[key]}
                title={sidebarCollapsed ? navLabels[key] : undefined}
              >
                <span className={dashboardStyles.sidebarIcon} aria-hidden="true">
                  <Icon size={18} strokeWidth={2} />
                </span>
                {!sidebarCollapsed && <span>{navLabels[key]}</span>}
              </button>
              {sidebarCollapsed && (
                <span className={dashboardStyles.tooltip} role="tooltip">
                  {navLabels[key]}
                </span>
              )}
            </div>
          ))}
        </nav>

        {/* Current user area */}
        {user && (
          <div
            style={{
              padding: sidebarCollapsed ? "12px 8px" : "12px 14px",
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
            {!sidebarCollapsed && (
              <span style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
                <strong style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.displayName}</strong>
                <small style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{user.tag} · {user.role}</small>
              </span>
            )}
            {!sidebarCollapsed && (
              <button
                type="button"
                onClick={async () => { await logout(); router.replace("/rvb/login"); }}
                title="Sign Out"
                aria-label="Sign Out"
                style={{ width: 32, height: 32, display: "grid", placeItems: "center", border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel)", color: "var(--muted)", cursor: "pointer", flex: "0 0 32px" }}
              >
                <LogOut size={14} strokeWidth={2} />
              </button>
            )}
          </div>
        )}

        <div className={dashboardStyles.sidebarFooter}>
          {sidebarCollapsed ? (
            <div className={dashboardStyles.navItemWrap}>
              <button
                type="button"
                className={dashboardStyles.onlineButtonCollapsed}
                onClick={handleSwitchToHsh}
                aria-label={t.switchToHsh}
                title={t.switchToHsh}
              >
                <Factory size={18} strokeWidth={2} aria-hidden="true" />
              </button>
              <span className={dashboardStyles.tooltip} role="tooltip">
                {t.switchToHsh}
              </span>
            </div>
          ) : (
            <button
              type="button"
              className={dashboardStyles.onlineButton}
              onClick={handleSwitchToHsh}
              aria-label={t.switchToHsh}
            >
              <span className={dashboardStyles.onlineButtonIcon} aria-hidden="true">
                <Factory size={18} strokeWidth={2} />
              </span>
              <span>{t.switchToHsh}</span>
            </button>
          )}
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
          <CompactHeader
            title={hero.title}
            description={hero.description}
            dark={dark}
            onToggleTheme={toggleTheme}
            language={settings.language}
          />
          {children}
        </div>
      </section>
    </div>
  );
}
