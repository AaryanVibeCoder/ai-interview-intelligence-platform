"use client";

import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar } from "@/components/layout/sidebar";
import { useUiStore } from "@/store";

type AppShellProps = {
  children: React.ReactNode;
  userMenu?: React.ReactNode;
};

export function AppShell({ children, userMenu }: AppShellProps) {
  const isMobileNavigationOpen = useUiStore(
    (state) => state.isMobileNavigationOpen,
  );
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const closeMobileNavigation = useUiStore(
    (state) => state.closeMobileNavigation,
  );
  const setMobileNavigationOpen = useUiStore(
    (state) => state.setMobileNavigationOpen,
  );
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          onToggle={toggleSidebar}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <Navbar
            isSidebarCollapsed={isSidebarCollapsed}
            onSidebarToggle={toggleSidebar}
            onMobileMenuOpen={() => setMobileNavigationOpen(true)}
            userMenu={userMenu}
          />

          <main className="min-w-0 flex-1 px-page py-8">{children}</main>
        </div>
      </div>

      <MobileNavigation
        isOpen={isMobileNavigationOpen}
        onClose={closeMobileNavigation}
      />
    </div>
  );
}
