"use client";

import {
  LayoutDashboard,
  BriefcaseBusiness,
  Package,
  Users,
  Truck,
  Wallet,
  ShoppingCart,
  ShoppingBag,
  Banknote,
  UsersRound,
  CarFront,
  ClipboardCheck,
  BarChart3,
  FileText,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavKey =
  | "dashboard"
  | "office"
  | "products"
  | "customers"
  | "suppliers"
  | "accounts"
  | "purchases"
  | "sales"
  | "payments"
  | "workers"
  | "vehicles"
  | "tasks"
  | "reports"
  | "invoice"
  | "settings";

export type CanonicalNavItem = {
  key: NavKey;
  icon: LucideIcon;
  path: string;
};

export const CANONICAL_NAVIGATION: readonly CanonicalNavItem[] = [
  { key: "dashboard", icon: LayoutDashboard, path: "/" },
  { key: "office", icon: BriefcaseBusiness, path: "/office" },
  { key: "products", icon: Package, path: "/products" },
  { key: "customers", icon: Users, path: "/customers" },
  { key: "suppliers", icon: Truck, path: "/suppliers" },
  { key: "accounts", icon: Wallet, path: "/accounts" },
  { key: "purchases", icon: ShoppingCart, path: "/purchases" },
  { key: "sales", icon: ShoppingBag, path: "/sales" },
  { key: "payments", icon: Banknote, path: "/payments" },
  { key: "workers", icon: UsersRound, path: "/workers" },
  { key: "vehicles", icon: CarFront, path: "/vehicles" },
  { key: "tasks", icon: ClipboardCheck, path: "/tasks" },
  { key: "reports", icon: BarChart3, path: "/reports" },
  { key: "invoice", icon: FileText, path: "/invoice" },
  { key: "settings", icon: Settings, path: "/settings" },
] as const;

export const NAV_PATHS: Record<NavKey, string> = Object.fromEntries(
  CANONICAL_NAVIGATION.map((item) => [item.key, item.path])
) as Record<NavKey, string>;
