"use client";

import { Bell, Menu, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";

import { Button } from "@/components/ui/button";

type NavbarProps = {
  isSidebarCollapsed: boolean;
  onSidebarToggle: () => void;
  onMobileMenuOpen: () => void;
  userMenu?: React.ReactNode;
};

export function Navbar({
  isSidebarCollapsed,
  onSidebarToggle,
  onMobileMenuOpen,
  userMenu,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-header items-center gap-3 border-b border-border/60 bg-background/60 px-page backdrop-blur-2xl">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onMobileMenuOpen}
        aria-label="Open mobile navigation"
        className="lg:hidden"
      >
        <Menu className="size-4" aria-hidden="true" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onSidebarToggle}
        aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="hidden lg:inline-flex"
      >
        {isSidebarCollapsed ? (
          <PanelLeftOpen className="size-4" aria-hidden="true" />
        ) : (
          <PanelLeftClose className="size-4" aria-hidden="true" />
        )}
      </Button>

      <div className="min-w-0 flex-1">
        <div className="md:hidden">
          <p className="truncate text-sm font-semibold">ElevateIQ</p>
          <p className="truncate text-xs text-muted-foreground">
            AI Command Center
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Open notifications"
        >
          <Bell className="size-4" aria-hidden="true" />
        </Button>
        {userMenu}
      </div>

      {/* User profile dropdown is passed as userMenu prop */}
    </header>
  );
}

