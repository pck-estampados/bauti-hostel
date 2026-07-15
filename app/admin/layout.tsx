import type { Metadata } from "next";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { AdminShell } from "./components/admin-shell";
import { OperationsProvider } from "./components/operations-provider";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Administración",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const localDemo = process.env.NODE_ENV === "development" || process.env.ADMIN_DEMO_MODE === "true";
  const user = localDemo
    ? { displayName: "Recepción de prueba", email: "demo@hostelbauti.local", fullName: "Recepción de prueba" }
    : await requireChatGPTUser("/admin");

  return (
    <OperationsProvider actor={user.displayName}>
      <AdminShell userName={user.displayName}>{children}</AdminShell>
    </OperationsProvider>
  );
}
