"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

import { navigationSections } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type SidebarProps = {
  isCollapsed: boolean;
  onToggle: () => void;
};

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <motion.aside
      aria-label="Primary navigation"
      className="hidden min-h-screen shrink-0 border-r border-sidebar-border bg-sidebar/95 text-sidebar-foreground shadow-elevate-sm backdrop-blur-xl lg:block"
      initial={false}
      animate={{ width: isCollapsed ? 88 : 280 }}
      transition={{ duration: 0.24, ease: "easeInOut" }}
    >
      <div className="flex h-full min-h-screen flex-col">
        <div className="flex h-header items-center justify-between gap-3 border-b border-sidebar-border px-4">
          <Link
            href="/"
            className={cn(
              "flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isCollapsed && "justify-center"
            )}
            aria-label="ElevateIQ home"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-glow-primary">
              <Sparkles className="size-4" aria-hidden="true" />
            </span>
            {!isCollapsed && (
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold tracking-tight">
                  ElevateIQ
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  AI Command Center
                </span>
              </span>
            )}
          </Link>

          {!isCollapsed && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onToggle}
              aria-label="Collapse sidebar"
              className="opacity-60 hover:opacity-100 transition-opacity"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {navigationSections.map((section) => (
            <div key={section.title} className="space-y-2">
              {!isCollapsed && (
                <p className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {section.title}
                </p>
              )}

              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/" && pathname.startsWith(`${item.href}/`));

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "group/tooltip relative flex h-10 items-center rounded-xl px-3 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isActive && "text-sidebar-accent-foreground",
                        isCollapsed && "justify-center px-0"
                      )}
                    >
                      {/* Active Indicator Sliding Animation */}
                      {isActive && (
                        <motion.span
                          layoutId="sidebar-active-pill"
                          className="absolute inset-0 rounded-xl bg-sidebar-accent text-sidebar-accent-foreground shadow-elevate-xs"
                          transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        />
                      )}

                      {/* Tooltip for Collapsed Sidebar */}
                      {isCollapsed && (
                        <span className="absolute left-full ml-3 scale-95 opacity-0 pointer-events-none group-hover/tooltip:scale-100 group-hover/tooltip:opacity-100 transition-all duration-150 z-55 rounded-lg bg-popover px-2.5 py-1.5 text-xs font-semibold text-popover-foreground shadow-elevate-md border border-border/65 whitespace-nowrap">
                          {item.title}
                        </span>
                      )}

                      <span className="relative z-10 flex items-center gap-3 w-full justify-start pl-0.5">
                        <Icon className="size-4 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
                        {!isCollapsed && (
                          <>
                            <span className="min-w-0 flex-1 truncate">
                              {item.title}
                            </span>
                            {item.badge && (
                              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[0.7rem] font-semibold text-primary">
                                {item.badge}
                              </span>
                            )}
                            {item.isComingSoon && (
                              <span className="rounded-full border border-border px-2 py-0.5 text-[0.7rem] text-muted-foreground">
                                Soon
                              </span>
                            )}
                          </>
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {isCollapsed ? (
          <div className="border-t border-sidebar-border p-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onToggle}
              aria-label="Expand sidebar"
              className="w-full"
            >
              <ChevronLeft
                className="size-4 rotate-180"
                aria-hidden="true"
              />
            </Button>
          </div>
        ) : (
          <div className="border-t border-sidebar-border p-4">
            <div className="rounded-2xl border border-border bg-surface-raised p-3 shadow-elevate-sm">
              <p className="text-sm font-medium text-foreground">
                AI readiness
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Shell foundation ready for scalable product modules.
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
