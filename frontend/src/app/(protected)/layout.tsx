import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your ElevateIQ dashboard",
};

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
