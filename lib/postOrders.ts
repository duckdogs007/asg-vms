import { supabase } from "@/lib/supabase/supabaseClient"

export interface PostOrderContact {
  role: string
  name: string
  contact: string
}

export interface PostOrderProcedure {
  title: string
  icon: string
  items: string[]
}

export interface PostOrderReportExample {
  title: string
  body: string
}

export interface PostOrders {
  // ISO date "YYYY-MM-DD" from Supabase. Use formatLastUpdated() for display.
  lastUpdated: string
  contacts: PostOrderContact[]
  procedures: PostOrderProcedure[]
  reportExamples: PostOrderReportExample[]
}

export const EMPTY_POST_ORDERS: PostOrders = {
  lastUpdated: new Date().toISOString().slice(0, 10),
  contacts: [],
  procedures: [],
  reportExamples: [],
}

export function formatLastUpdated(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[2]}/${m[3]}/${m[1]}`
}

export async function loadPostOrders(communityId: string): Promise<PostOrders | null> {
  if (!communityId) return null
  const { data, error } = await supabase
    .from("post_orders")
    .select("data, last_updated")
    .eq("community_id", communityId)
    .maybeSingle()
  if (error || !data) return null
  const doc = (data.data || {}) as Partial<PostOrders>
  return {
    lastUpdated:    String(data.last_updated),
    contacts:       doc.contacts       || [],
    procedures:     doc.procedures     || [],
    reportExamples: doc.reportExamples || [],
  }
}

export async function savePostOrders(communityId: string, orders: PostOrders): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("post_orders")
    .upsert({
      community_id: communityId,
      last_updated: orders.lastUpdated,
      data: {
        contacts:       orders.contacts,
        procedures:     orders.procedures.map(p => ({
          ...p,
          items: p.items.map((s: string) => s.trim()).filter(Boolean),
        })),
        reportExamples: orders.reportExamples,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "community_id" })
  return { error: error ? error.message : null }
}
