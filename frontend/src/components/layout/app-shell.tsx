"use client";

import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar } from "@/components/layout/sidebar";
import { useUiStore } from "@/store";
import { usePathname } from "next/navigation";

type AppShellProps = {
  children: React.ReactNode;
  userMenu?: React.ReactNode;
};

export function AppShell({ children, userMenu }: AppShellProps) {
  const pathname = usePathname();
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

  const isAuthOrLanding = pathname === "/" || pathname?.startsWith("/sign-in") || pathname?.startsWith("/sign-up");

  if (isAuthOrLanding) {
    return <div className="min-h-screen bg-background text-foreground flex flex-col">{children}</div>;
  }

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
