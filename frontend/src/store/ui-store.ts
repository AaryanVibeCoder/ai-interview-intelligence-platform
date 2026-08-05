"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

type UiState = {
  isMobileNavigationOpen: boolean;
  isSidebarCollapsed: boolean;
};

type UiActions = {
  closeMobileNavigation: () => void;
  resetUiState: () => void;
  setMobileNavigationOpen: (isOpen: boolean) => void;
  setSidebarCollapsed: (isCollapsed: boolean) => void;
  toggleSidebar: () => void;
};

export type UiStore = UiState & UiActions;

const initialState: UiState = {
  isMobileNavigationOpen: false,
  isSidebarCollapsed: false,
};

export const useUiStore = create<UiStore>()(
  devtools(
    (set) => ({
      ...initialState,
      closeMobileNavigation: () =>
        set({ isMobileNavigationOpen: false }, false, "ui/closeMobileNavigation"),
      resetUiState: () => set(initialState, false, "ui/resetUiState"),
      setMobileNavigationOpen: (isOpen) =>
        set({ isMobileNavigationOpen: isOpen }, false, "ui/setMobileNavigationOpen"),
      setSidebarCollapsed: (isCollapsed) =>
        set({ isSidebarCollapsed: isCollapsed }, false, "ui/setSidebarCollapsed"),
      toggleSidebar: () =>
        set(
          (state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed }),
          false,
          "ui/toggleSidebar",
        ),
    }),
    {
      enabled: process.env.NODE_ENV === "development",
      name: "elevateiq-ui-store",
    },
  ),
);
