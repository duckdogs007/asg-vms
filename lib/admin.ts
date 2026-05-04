import { supabase } from "@/lib/supabase/supabaseClient"

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
