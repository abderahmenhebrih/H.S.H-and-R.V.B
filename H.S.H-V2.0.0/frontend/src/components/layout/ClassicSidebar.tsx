"use client";

import { useEffect, useRef, useState } from "react";
import {
  Boxes,
  ChevronDown,
  ClipboardList,
  Moon,
  Settings as SettingsIcon,
  Store,
  Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import dashboardStyles from "../../../app/page.module.css";
import { navGroupForKey } from "../../lib/navigation";
import type { NavGroupKey } from "../../lib/navigation";

export type ClassicSidebarItem = {
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
};

type ClassicSidebarProps = {
  activeKey: string;
  topItems: readonly ClassicSidebarItem[];
  managementLabel: string;
  managementItems: readonly ClassicSidebarItem[];
  operationsLabel: string;
  operationsItems: readonly ClassicSidebarItem[];
  bottomItems: readonly ClassicSidebarItem[];
  brand: string;
  systemLabel: string;
  onlineAccessLabel: string;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  onNavigate: (path: string) => void;
  onOpenRvb: () => void;
  dark: boolean;
  onToggleTheme: () => void;
  themeLabel: string;
  settingsLabel: string;
  onOpenSettings: () => void;
  bell: React.ReactNode;
};

// Classic HSH sidebar restored from the last good pre-FloatingNav design:
// desktop collapsed (~76px) unless hovered or keyboard-focused (~210px),
// mobile drawer controlled by `drawerOpen`, grouped Management/Operations
// navigation, footer utilities (notifications/theme/settings) + Access RVB.
// All initial state is deterministic (props only) — hydration-safe.
export default function ClassicSidebar({
  activeKey,
  topItems,
  managementLabel,
  managementItems,
  operationsLabel,
  operationsItems,
  bottomItems,
  brand,
  systemLabel,
  onlineAccessLabel,
  drawerOpen,
  onCloseDrawer,
  onNavigate,
  onOpenRvb,
  dark,
  onToggleTheme,
  themeLabel,
  settingsLabel,
  onOpenSettings,
  bell,
}: ClassicSidebarProps) {
  // Desktop hover/focus expand — ephemeral, never persisted.
  // Desktop sidebar is collapsed unless hovered or keyboard-focused.
  // Mobile drawer remains controlled solely by `drawerOpen` via CSS.
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [sidebarFocused, setSidebarFocused] = useState(false);

  const desktopSidebarExpanded = sidebarHovered || sidebarFocused;
  const isDesktopCollapsed = !desktopSidebarExpanded;

  // Collapsible nav groups (Management / Operations). Accordion:
  // opening one closes the other. The group holding the active page
  // starts open; hover/focus never changes group state.
  const [openGroup, setOpenGroup] = useState<NavGroupKey | null>(() =>
    navGroupForKey(activeKey),
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

  const sidebarNavRef = useRef<HTMLElement>(null);

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

  function go(path: string) {
    onCloseDrawer();
    onNavigate(path);
  }

  function renderItem(item: ClassicSidebarItem, extraClass = "") {
    const Icon = item.icon;
    const isActive = activeKey === item.key;
    return (
      <div key={item.key} className={dashboardStyles.navItemWrap}>
        <button
          type="button"
          className={`${dashboardStyles.sidebarItem} ${extraClass} ${
            isActive ? dashboardStyles.active : ""
          }`}
          onClick={() => go(item.path)}
          aria-label={item.label}
          title={isDesktopCollapsed ? item.label : undefined}
        >
          <span className={dashboardStyles.sidebarIcon} aria-hidden="true">
            <Icon size={18} strokeWidth={2} />
          </span>
          <span className={dashboardStyles.sidebarLabel}>{item.label}</span>
        </button>
        {isDesktopCollapsed && (
          <span className={dashboardStyles.tooltip} role="tooltip">
            {item.label}
          </span>
        )}
      </div>
    );
  }

  function renderGroup(
    group: NavGroupKey,
    label: string,
    GroupIcon: LucideIcon,
    items: readonly ClassicSidebarItem[],
    groupId: string,
    isActive: boolean,
  ) {
    const isOpen = openGroup === group;
    return (
      <>
        <div className={dashboardStyles.navItemWrap}>
          <button
            type="button"
            className={`${dashboardStyles.sidebarItem} ${
              isActive ? dashboardStyles.navGroupButtonActive : ""
            }`}
            onClick={() => toggleGroup(group)}
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
            {items.map((item) =>
              renderItem(item, dashboardStyles.navGroupChild),
            )}
          </div>
        )}
      </>
    );
  }

  const isManagementActive = managementItems.some(
    (item) => item.key === activeKey,
  );
  const isOperationsActive = operationsItems.some(
    (item) => item.key === activeKey,
  );

  return (
    <>
      {drawerOpen && (
        <button
          className={dashboardStyles.overlay}
          aria-label="Close menu"
          onClick={onCloseDrawer}
        />
      )}

      <aside
        data-nav-root="classic"
        className={`${dashboardStyles.sidebar} ${dashboardStyles.sidebarCompact} ${
          drawerOpen ? dashboardStyles.sidebarOpen : ""
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
              event.relatedTarget as Node | null,
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
              <span className={dashboardStyles.sidebarBrandTitle}>{brand}</span>
            </div>
            <span className={dashboardStyles.sidebarBrandSubtitle}>
              {systemLabel}
            </span>
          </div>
        </div>

        <div className={dashboardStyles.sidebarDivider} />

        <nav ref={sidebarNavRef} className={dashboardStyles.sidebarNav}>
          {topItems.map((item) => renderItem(item))}

          {renderGroup(
            "management",
            managementLabel,
            Boxes,
            managementItems,
            "management-sidebar-group",
            isManagementActive,
          )}

          {renderGroup(
            "operations",
            operationsLabel,
            ClipboardList,
            operationsItems,
            "operations-sidebar-group",
            isOperationsActive,
          )}

          {bottomItems.map((item) => renderItem(item))}
        </nav>

        <div className={dashboardStyles.sidebarFooter}>
          <div className={dashboardStyles.sidebarUtilityRow}>
            <span className={dashboardStyles.sidebarUtilityBell}>{bell}</span>
            <button
              type="button"
              className={dashboardStyles.sidebarUtilityButton}
              onClick={onToggleTheme}
              aria-label={themeLabel}
              title={themeLabel}
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
              onClick={() => {
                onCloseDrawer();
                onOpenSettings();
              }}
              aria-label={settingsLabel}
              title={settingsLabel}
            >
              <SettingsIcon size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
          <div className={dashboardStyles.navItemWrap}>
            <button
              type="button"
              className={`${dashboardStyles.onlineButton} ${
                activeKey === "online" ? dashboardStyles.activeOnline : ""
              }`}
              onClick={onOpenRvb}
              aria-label={onlineAccessLabel}
              title={isDesktopCollapsed ? onlineAccessLabel : undefined}
            >
              <span
                className={dashboardStyles.onlineButtonIcon}
                aria-hidden="true"
              >
                <Store size={18} strokeWidth={2} aria-hidden="true" />
              </span>
              <span className={dashboardStyles.onlineButtonLabel}>
                {onlineAccessLabel}
              </span>
            </button>
            {isDesktopCollapsed && (
              <span className={dashboardStyles.tooltip} role="tooltip">
                {onlineAccessLabel}
              </span>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
