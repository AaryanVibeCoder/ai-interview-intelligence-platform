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
      className="hidden min-h-screen shrink-0 border-r border-sidebar-border bg-sidebar/60 backdrop-blur-2xl text-sidebar-foreground lg:block"
      initial={false}
      animate={{ width: isCollapsed ? 80 : 272 }}
      transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div className="flex h-full min-h-screen flex-col">
        <div className="flex h-header items-center justify-between gap-3 border-b border-sidebar-border px-4">
          <Link
            href="/"
            className={cn(
              "flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isCollapsed && "justify-center"
            )}
            aria-label="ElevateIQ home"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles className="size-3.5" aria-hidden="true" />
            </span>
            {!isCollapsed && (
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold tracking-tight">
                  ElevateIQ
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
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
              <ChevronLeft className="size-3.5" aria-hidden="true" />
            </Button>
          )}
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
          {navigationSections.map((section) => (
            <div key={section.title} className="space-y-1">
              {!isCollapsed && (
                <p className="px-3 pb-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70">
                  {section.title}
                </p>
              )}

              <div className="space-y-0.5">
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
                      title={isCollapsed ? item.title : undefined}
                      className={cn(
                        "group flex h-9 items-center gap-3 rounded-xl px-3 text-[13px] font-medium text-muted-foreground transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isActive &&
                          "bg-sidebar-accent/80 ring-1 ring-white/5 text-sidebar-accent-foreground",
                        isCollapsed && "justify-center px-0"
                      )}
                    >
                      <Icon className="size-4 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
                      {!isCollapsed && (
                        <>
                          <span className="min-w-0 flex-1 truncate">
                            {item.title}
                          </span>
                          {item.badge && (
                            <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold text-primary">
                              {item.badge}
                            </span>
                          )}
                          {item.isComingSoon && (
                            <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground/60">
                              Soon
                            </span>
                          )}
                        </>
                      )}
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
              className="w-full opacity-60 hover:opacity-100"
            >
              <ChevronLeft
                className="size-3.5 rotate-180"
                aria-hidden="true"
              />
            </Button>
          </div>
        ) : (
          <div className="border-t border-sidebar-border p-4">
            <div className="rounded-2xl border border-border/40 bg-surface-raised/50 p-3 backdrop-blur-sm">
              <p className="text-[13px] font-medium text-foreground">
                AI readiness
              </p>
              <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                Shell foundation ready for scalable product modules.
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
