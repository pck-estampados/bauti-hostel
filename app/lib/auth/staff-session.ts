import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

export type StaffSession = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
};

export async function getStaffSession(): Promise<StaffSession | null> {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return null;

  const [{ data: profile, error: profileError }, { data: userRoles, error: rolesError }] =
    await Promise.all([
      supabase.from("profiles").select("display_name,status").eq("id", auth.user.id).maybeSingle(),
      supabase.from("user_roles").select("role_id,roles(code)").eq("user_id", auth.user.id),
    ]);

  if (profileError || rolesError || !profile || profile.status !== "active") return null;

  const roleRows = (userRoles ?? []) as Array<{
    role_id: string;
    roles: { code: string } | Array<{ code: string }> | null;
  }>;
  const roles = roleRows
    .flatMap((row) => Array.isArray(row.roles) ? row.roles : row.roles ? [row.roles] : [])
    .map((role) => role.code);
  if (!roles.length) return null;

  const { data: rolePermissions, error: permissionsError } = await supabase
    .from("role_permissions")
    .select("permissions(code)")
    .in("role_id", roleRows.map((row) => row.role_id));
  if (permissionsError) return null;

  const permissions = ((rolePermissions ?? []) as Array<{
    permissions: { code: string } | Array<{ code: string }> | null;
  }>)
    .flatMap((row) => Array.isArray(row.permissions) ? row.permissions : row.permissions ? [row.permissions] : [])
    .map((permission) => permission.code);

  return {
    id: auth.user.id,
    email: auth.user.email ?? "",
    displayName: String(profile.display_name),
    roles: [...new Set(roles)],
    permissions: [...new Set(permissions)],
  };
}

export async function requireStaffSession(returnTo: string): Promise<StaffSession> {
  const session = await getStaffSession();
  if (session) return session;

  redirect(`/acceso-interno?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`);
}

export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/admin";
  try {
    const url = new URL(value, "https://hostel-bauti.local");
    if (url.origin !== "https://hostel-bauti.local") return "/admin";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/admin";
  }
}
