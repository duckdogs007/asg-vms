import { redirect } from "next/navigation"

// Manual Entry is now part of the main Check-In page (/vms).
// Pass through any pre-fill params so existing links keep working.
export default async function ManualEntryRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const s = await searchParams
  const p = new URLSearchParams()
  if (s.first) p.set("first", s.first)
  if (s.last)  p.set("last",  s.last)
  if (s.dob)   p.set("dob",   s.dob)
  if (s.oln)   p.set("oln",   s.oln)
  const qs = p.toString()
  redirect(qs ? `/vms?${qs}` : "/vms")
}
