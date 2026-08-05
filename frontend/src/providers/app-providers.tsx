"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { QueryProvider } from "@/providers/query-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { composeProviders } from "@/providers/compose-providers";

const SyncProviderTree = composeProviders([QueryProvider, ThemeProvider]);

export function AppProviders({ children }: React.PropsWithChildren) {
  return (
    <ClerkProvider>
      <SyncProviderTree>{children}</SyncProviderTree>
    </ClerkProvider>
  );
}
