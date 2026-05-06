import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { ADMIN_EMAILS } from "@/lib/admin"

export async function POST() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }
  if (!ADMIN_EMAILS.includes(user.email || "")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const url = process.env.TEAMS_WEBHOOK_URL
  if (!url) {
    return NextResponse.json({ error: "TEAMS_WEBHOOK_URL not set in Vercel" }, { status: 500 })
  }

  const card = {
    "@type":   "MessageCard",
    "@context":"http://schema.org/extensions",
    themeColor:"0078D4",
    summary:   "ASG VMS — Webhook Test",
    title:     "🧪 ASG VMS — Webhook Test",
    text:      `Test triggered by **${user.email}** at ${new Date().toLocaleString("en-US")}.\n\nIf you can read this message in the channel, the Teams alerts integration is working.`,
  }

  try {
    const r = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(card),
    })
    if (!r.ok) {
      const text = await r.text()
      return NextResponse.json({ error: `Webhook returned ${r.status}: ${text.slice(0, 300)}` }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 502 })
  }
}
