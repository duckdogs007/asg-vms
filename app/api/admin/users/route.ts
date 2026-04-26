import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const ADMIN_EMAILS = ["jhall@teamasg.com"]

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }
  if (!ADMIN_EMAILS.includes(user.email || "")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Pull all users (paginate if you ever exceed 1000)
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const users = (data.users || []).map(u => ({
    id:                  u.id,
    email:               u.email,
    created_at:          u.created_at,
    last_sign_in_at:     u.last_sign_in_at,
    email_confirmed_at:  u.email_confirmed_at,
    banned_until:        (u as any).banned_until || null,
    user_metadata:       u.user_metadata || {},
  }))

  return NextResponse.json({ users })
}
