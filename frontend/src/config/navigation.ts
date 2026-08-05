import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  BrainCircuit,
  Building2,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";

export type NavigationItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  isComingSoon?: boolean;
};

export type NavigationSection = {
  title: string;
  items: NavigationItem[];
};

export const navigationSections: NavigationSection[] = [
  {
    title: "Workspace",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "AI Agents",
        href: "/agents",
        icon: Bot,
        badge: "New",
      },
      {
        title: "Workflows",
        href: "/workflows",
        icon: Workflow,
      },
      {
        title: "Conversations",
        href: "/conversations",
        icon: MessageSquareText,
      },
    ],
  },
  {
    title: "Intelligence",
    items: [
      {
        title: "Insights",
        href: "/insights",
        icon: BrainCircuit,
      },
      {
        title: "Analytics",
        href: "/analytics",
        icon: BarChart3,
      },
      {
        title: "Automation Lab",
        href: "/automation",
        icon: Sparkles,
        isComingSoon: true,
      },
    ],
  },
  {
    title: "Organization",
    items: [
      {
        title: "Team",
        href: "/team",
        icon: Users,
      },
      {
        title: "Company",
        href: "/company",
        icon: Building2,
      },
      {
        title: "Settings",
        href: "/settings",
        icon: Settings,
      },
    ],
  },
];

