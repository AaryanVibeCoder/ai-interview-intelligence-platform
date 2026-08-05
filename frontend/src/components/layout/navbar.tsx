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
    <header className="sticky top-0 z-30 flex h-header items-center gap-3 border-b border-border bg-background/80 px-page backdrop-blur-xl">
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
        <div className="hidden h-9 max-w-md items-center gap-2 rounded-xl border border-input bg-surface px-3 text-muted-foreground shadow-elevate-xs md:flex">
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate text-sm">Search workspace, agents, or insights</span>
          <kbd className="ml-auto rounded-md border border-border bg-surface-raised px-1.5 py-0.5 text-[0.7rem] text-muted-foreground">
            /
          </kbd>
        </div>
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
        <div
          aria-label="Current workspace"
          className="grid size-9 place-items-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-glow-primary"
        >
          EI
        </div>
        {userMenu}
      </div>

      {/* User profile dropdown is passed as userMenu prop */}
    </header>
  );
}

