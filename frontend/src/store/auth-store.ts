"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type AuthStatus = "unknown" | "unauthenticated" | "authenticated";

export type AuthUser = {
  email?: string;
  id: string;
  name?: string;
  roles?: readonly string[];
};

type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
};

type AuthSnapshot = {
  status: AuthStatus;
  user: AuthUser | null;
};

type AuthActions = {
  clearAuthSnapshot: () => void;
  setAuthSnapshot: (snapshot: AuthSnapshot) => void;
};

export type AuthStore = AuthState & AuthActions;

const initialState: AuthState = {
  status: "unknown",
  user: null,
};

export const useAuthStore = create<AuthStore>()(
  devtools(
    (set) => ({
      ...initialState,
      clearAuthSnapshot: () =>
        set(
          { status: "unauthenticated", user: null },
          false,
          "auth/clearAuthSnapshot",
        ),
      setAuthSnapshot: (snapshot) => set(snapshot, false, "auth/setAuthSnapshot"),
    }),
    {
      enabled: process.env.NODE_ENV === "development",
      name: "elevateiq-auth-store",
    },
  ),
);
