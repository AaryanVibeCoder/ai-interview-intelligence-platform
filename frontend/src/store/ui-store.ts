"use client";

import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  timestamp: string;
};

type UiState = {
  isMobileNavigationOpen: boolean;
  isSidebarCollapsed: boolean;
  notifications: AppNotification[];
};

type UiActions = {
  closeMobileNavigation: () => void;
  resetUiState: () => void;
  setMobileNavigationOpen: (isOpen: boolean) => void;
  setSidebarCollapsed: (isCollapsed: boolean) => void;
  toggleSidebar: () => void;
  addNotification: (title: string, message: string) => void;
  deleteNotification: (id: string) => void;
  clearAllNotifications: () => void;
};

export type UiStore = UiState & UiActions;

const initialState: UiState = {
  isMobileNavigationOpen: false,
  isSidebarCollapsed: false,
  notifications: [],
};

export const useUiStore = create<UiStore>()(
  devtools(
    persist(
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
        addNotification: (title, message) =>
          set(
            (state) => {
              const isDuplicate = state.notifications.some(
                (n) => n.title === title && n.message === message
              );
              if (isDuplicate) return {};

              const newNotification: AppNotification = {
                id: Math.random().toString(36).substring(2, 9),
                title,
                message,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              };
              return {
                notifications: [newNotification, ...state.notifications],
              };
            },
            false,
            "ui/addNotification"
          ),
        deleteNotification: (id) =>
          set(
            (state) => ({
              notifications: state.notifications.filter((n) => n.id !== id),
            }),
            false,
            "ui/deleteNotification"
          ),
        clearAllNotifications: () =>
          set({ notifications: [] }, false, "ui/clearAllNotifications"),
      }),
      {
        name: "elevateiq-ui-store",
      }
    ),
    {
      enabled: process.env.NODE_ENV === "development",
      name: "elevateiq-ui-store",
    }
  )
);
