import { supabase } from "@/lib/supabase/supabaseClient"

// Frozen Head-of-Household + household roster snapshot for a report record (items 26/27).
// Snapshotting at creation guarantees a past record keeps the correct HOH even after
// the rent roll overwrites the unit's occupant on turnover.
export type HouseholdMember = { name: string | null; relationship: string | null }
export type HohSnapshot = {
  hoh_name: string | null
  hoh_resident_id: string | null
  household_snapshot: HouseholdMember[] | null
}

export const EMPTY_SNAPSHOT: HohSnapshot = {
  hoh_name: null,
  hoh_resident_id: null,
  household_snapshot: null,
}

/** Split a rent-roll unit identifier ("100-1A") into building + apartment on the first hyphen. */
export function splitUnit(unitNumber?: string | null): { building: string | null; apartment: string | null } {
  if (!unitNumber) return { building: null, apartment: null }
  const u = unitNumber.trim()
  const i = u.indexOf("-")
  if (i === -1) return { building: null, apartment: u || null }
  return { building: u.slice(0, i) || null, apartment: u.slice(i + 1) || null }
}

/**
 * Resolve and freeze the HOH + household for a unit as of the event date.
 * Uses the resolve_hoh_as_of() DB helper for the name and reads the current
 * unit roster from `residents`. Returns nulls when community/unit are missing
 * or the unit has no residents (e.g. common-area incidents).
 */
export async function buildHohSnapshot(
  communityId?: string | null,
  unitNumber?: string | null,
  eventDate?: string | null,
): Promise<HohSnapshot> {
  if (!communityId || !unitNumber) return EMPTY_SNAPSHOT
  const asOf = eventDate || new Date().toISOString().slice(0, 10)

  const [{ data: hohName }, { data: roster }] = await Promise.all([
    supabase.rpc("resolve_hoh_as_of", {
      p_community_id: communityId,
      p_unit_number: unitNumber,
      p_as_of: asOf,
    }),
    supabase
      .from("residents")
      .select("id,name,relationship")
      .eq("community_id", communityId)
      .eq("unit_number", unitNumber),
  ])

  const household: HouseholdMember[] = (roster || []).map((r: any) => ({
    name: r.name ?? null,
    relationship: r.relationship ?? null,
  }))
  const hohRow = (roster || []).find((r: any) => r.name === hohName)

  return {
    hoh_name: (hohName as string) || null,
    hoh_resident_id: hohRow?.id || null,
    household_snapshot: household.length ? household : null,
  }
}
