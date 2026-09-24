import type { Permission } from "@rentbrown/types";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  GitCompareArrows,
  Gift,
  LayoutDashboard,
  Layers,
  ReceiptText,
  Scale,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Permission required to see the item. Undefined → always visible. */
  permission?: Permission;
  /** Match nested routes for active state. */
  match?: RegExp;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "People",
    items: [
      { href: "/users", label: "Users", icon: Users, permission: "users.read" },
      { href: "/kyc", label: "KYC review", icon: ShieldCheck, permission: "kyc.read" },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { href: "/properties", label: "Properties", icon: Building2, permission: "catalogue.read" },
      { href: "/plans", label: "Plans", icon: Layers, permission: "catalogue.read" },
      { href: "/rounds", label: "Rounds", icon: Timer, permission: "catalogue.read" },
    ],
  },
  {
    label: "Investments",
    items: [{ href: "/investments", label: "Investments", icon: TrendingUp, permission: "investments.read" }],
  },
  {
    label: "Financial Ops",
    items: [
      { href: "/finance", label: "Ledger overview", icon: BookOpen, permission: "finance.read", match: /^\/finance\/?$/ },
      { href: "/finance/deposits", label: "Deposits", icon: ArrowDownToLine, permission: "finance.read" },
      { href: "/finance/withdrawals", label: "Withdrawals", icon: ArrowUpFromLine, permission: "finance.read" },
      { href: "/finance/transactions", label: "Transactions", icon: ReceiptText, permission: "finance.read" },
      { href: "/finance/reconciliation", label: "Reconciliation", icon: GitCompareArrows, permission: "finance.read" },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/referrals", label: "Referrals & rewards", icon: Gift, permission: "referrals.read" },
      { href: "/notifications", label: "Notifications", icon: Bell, permission: "notifications.read" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/policies", label: "Policies", icon: SlidersHorizontal, permission: "policies.read" },
      { href: "/audit", label: "Audit log", icon: ScrollText, permission: "audit.read" },
      { href: "/legal", label: "Legal documents", icon: Scale },
      { href: "/reports", label: "Reports", icon: BarChart3, permission: "reports.read" },
    ],
  },
];
