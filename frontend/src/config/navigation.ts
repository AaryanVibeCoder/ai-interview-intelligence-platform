import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Settings,
  FileText,
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
        title: "Resume Structure",
        href: "/resume-structure",
        icon: FileText,
      },
      {
        title: "Settings",
        href: "/settings",
        icon: Settings,
      },
    ],
  },
];

