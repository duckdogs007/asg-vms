import { supabase } from "@/lib/supabase/supabaseClient"

// Single source of truth for the hardcoded admin allowlist used by:
// - proxy.ts middleware (gates /admin/* routes)
// - /api/admin/* server routes (gates the API)
// - TopNav.tsx (conditionally renders User/Admin Dashboard nav links)
// - /vms/reports/page.tsx (conditionally renders the per-row delete button)
//
// Long-term: replace consumers with checkIsAdmin() once the hydration
// regression that bit commit c861662 is diagnosed. The DB-side authority
// is public.admin_users + the is_admin() function used in RLS policies.
export const ADMIN_EMAILS: readonly string[] = ["jhall@teamasg.com"]

// Returns true if the current authenticated user is in the admin_users table.
// Server-side authority for "admin" is the admin_users table + RLS policies that
// call public.is_admin(); this client check is for UX only (gate UI before the
// user attempts an action that RLS would reject anyway).
export async function checkIsAdmin(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data, error } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle()
  return !error && !!data
}

// Returns true if the current user has role='guest' in user_assignments.
// Guests can view all data but cannot create, edit, or delete anything.
export async function checkIsGuest(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data, error } = await supabase
    .from("user_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "guest")
    .maybeSingle()
  return !error && !!data
}
