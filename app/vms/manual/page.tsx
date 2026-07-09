import { redirect } from "next/navigation"

// Manual Entry is now part of the main Check-In page (/vms).
// Pass through any pre-fill params so existing links keep working.
export default function ManualEntryRedirect({
  searchParams,
}: {
  searchParams: Record<string, string>
}) {
  const p = new URLSearchParams()
  if (searchParams.first) p.set("first", searchParams.first)
  if (searchParams.last)  p.set("last",  searchParams.last)
  if (searchParams.dob)   p.set("dob",   searchParams.dob)
  if (searchParams.oln)   p.set("oln",   searchParams.oln)
  const qs = p.toString()
  redirect(qs ? `/vms?${qs}` : "/vms")
}
