"use client";

import React, { useState, useEffect, useRef } from "react";
import { Bell, Menu, PanelLeftClose, PanelLeftOpen, Sparkles, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/store/ui-store";

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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const notifications = useUiStore((state) => state.notifications);
  const addNotification = useUiStore((state) => state.addNotification);
  const deleteNotification = useUiStore((state) => state.deleteNotification);
  const clearAllNotifications = useUiStore((state) => state.clearAllNotifications);

  // Send welcome notification on initial user session load
  useEffect(() => {
    const welcomeDone = localStorage.getItem("welcome_notified");
    if (!welcomeDone) {
      addNotification(
        "Welcome on board! 🚀",
        "We are happy to have you on board! Have a great time elevating your skills, and good luck!"
      );
      localStorage.setItem("welcome_notified", "true");
    }
  }, [addNotification]);

  // Click outside to close dropdown ref
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-3">
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

          {/* Logo Icon */}
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Sparkles className="h-4 w-4" />
          </div>
          {/* App Title */}
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              ElevateIQ
            </span>
            <span className="text-[10px] font-medium text-muted-foreground -mt-1">
              AI Command Center
            </span>
          </div>
        </div>

        {/* Right actions (User profile, notifications, etc.) */}
        <div className="flex items-center gap-4">
          {/* Interactive Notifications Bell Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Open notifications"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="relative cursor-pointer"
            >
              <Bell className="size-4" aria-hidden="true" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground shadow-sm">
                  {notifications.length}
                </span>
              )}
            </Button>

            <AnimatePresence>
              {isDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-80 rounded-xl border border-border bg-popover p-4 shadow-xl z-50 text-popover-foreground max-h-[400px] flex flex-col"
                >
                  <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-3 select-none">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Notifications
                    </span>
                    {notifications.length > 0 && (
                      <button
                        onClick={clearAllNotifications}
                        className="text-[10px] font-semibold text-primary hover:underline cursor-pointer"
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2">
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center space-y-2 select-none">
                        <span className="text-2xl">🎉</span>
                        <p className="text-xs font-semibold text-foreground">All caught up!</p>
                        <p className="text-[10px] text-muted-foreground max-w-[180px]">
                          No new notifications at this moment.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {notifications.map((n) => (
                          <div
                            key={n.id}
                            className="group/item flex items-start justify-between gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-colors border border-transparent hover:border-border/30"
                          >
                            <div className="space-y-0.5 min-w-0">
                              <h5 className="text-xs font-bold text-foreground leading-normal truncate">
                                {n.title}
                              </h5>
                              <p className="text-[10px] text-muted-foreground leading-relaxed break-words">
                                {n.message}
                              </p>
                              <span className="text-[9px] text-muted-foreground/60 block pt-0.5">
                                {n.timestamp}
                              </span>
                            </div>
                            
                            <button
                              onClick={() => deleteNotification(n.id)}
                              className="p-1 rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0 opacity-0 group-hover/item:opacity-100"
                              title="Delete notification"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {userMenu}
        </div>
      </div>
    </header>
  );
}
