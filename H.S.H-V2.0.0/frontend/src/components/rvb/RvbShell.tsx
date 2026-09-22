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
      mainChats: "Main Chats",
      secondaryChats: "Secondary Chats",
      profile: "Profile & Management",
      notifications: "Notifications & Activity",
      directory: "Directory",
      search: "Search",
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
      requests: { title: "Requests", description: "Review and manage worker, supplier and customer requests." },
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
      mainChats: "Discussions principales",
      secondaryChats: "Discussions secondaires",
      profile: "Profil & Gestion",
      notifications: "Notifications et activité",
      directory: "Annuaire",
      search: "Recherche",
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
      requests: { title: "Demandes", description: "Examiner et gérer les demandes travailleurs, fournisseurs et clients." },
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
      orders: { title: "الطلبيات", description: "مراجعة وإدارة طلبيات الزبائن." },
      requests: { title: "الطلبات", description: "مراجعة وإدارة طلبات العمال والموردين والزبائن." },
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
  const [notifUnread, setNotifUnread] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function loadNotifCount() {
      try {
        const { rvbNotificationService } = await import("../../services/rvb-notification.service");
        const data = await rvbNotificationService.count().catch(() => ({ unreadCount: 0 } as any));
        if (!cancelled) setNotifUnread(data.unreadCount ?? 0);
      } catch {}
    }
    void loadNotifCount();
    const h = () => void loadNotifCount();
    window.addEventListener("hebrih-rvb-notifications-changed", h);
    // socket realtime
    let sock: any = null;
    (async () => {
      try {
        const mod = await import("../../services/chat-socket.service");
        sock = mod.connectChatSocket?.();
        if (sock) sock.on("rvb:notification", h);
      } catch {}
    })();
    return () => {
      cancelled = true;
      window.removeEventListener("hebrih-rvb-notifications-changed", h);
      if (sock) try { sock.off("rvb:notification", h); } catch {}
    };
  }, []);

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
  };

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
  const visibleNav = (() => {
    if (!user) {
      return RVB_NAVIGATION.filter((item) => {
        if (item.key === "accounts") return false;
        return true;
      });
    }
    if (isManager) return RVB_NAVIGATION;
    if (isSecondary) return portalNav;
    // fallback: hide accounts for non-manager
    return RVB_NAVIGATION.filter((item) => {
      if (item.key === "accounts" && !isManager) return false;
      if (item.key === "workers" && isSupervisor) return false;
      if (item.key === "suppliers" && isSupervisor) return false;
      return true;
    });
  })();

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
          {visibleNav.map(({ icon: Icon, key, path, label }) => {
            const displayLabel = (label as string) || (navLabels as any)[key] || key;
            // Determine active: for portal chats differentiate by query
            const isActive = (() => {
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
            })();
            const uniqueKey = `${key}-${path}`;
            return (
            <div key={uniqueKey} className={dashboardStyles.navItemWrap}>
              <button
                type="button"
                className={`${dashboardStyles.sidebarItem} ${
                  isActive ? dashboardStyles.active : ""
                }`}
                onClick={() => navigate(path)}
                aria-label={displayLabel}
                title={sidebarCollapsed ? displayLabel : undefined}
              >
                <span className={dashboardStyles.sidebarIcon} aria-hidden="true">
                  <Icon size={18} strokeWidth={2} />
                </span>
                {!sidebarCollapsed && <span style={{ flex: 1 }}>{displayLabel}</span>}
                {!sidebarCollapsed && key === "notifications" && notifUnread > 0 && (
                  <span style={{ minWidth: 20, height: 20, padding: "0 6px", borderRadius: 999, background: "var(--accent)", color: "#fff", fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center" }}>{notifUnread > 99 ? "99+" : String(notifUnread)}</span>
                )}
                {sidebarCollapsed && key === "notifications" && notifUnread > 0 && (
                  <span style={{ position: "absolute", top: 4, insetInlineEnd: 6, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999, background: "#B93A42", color: "#fff", fontSize: 10, fontWeight: 800, display: "grid", placeItems: "center", lineHeight: 1 }}>{notifUnread > 99 ? "99+" : String(notifUnread)}</span>
                )}
              </button>
              {sidebarCollapsed && (
                <span className={dashboardStyles.tooltip} role="tooltip">
                  {displayLabel}
                </span>
              )}
            </div>
            );
          })}
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
