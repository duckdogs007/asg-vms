"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"
import { splitUnit } from "@/lib/hohSnapshot"

// Structured location for a report record (item 26): a residential unit (chosen
// from the community's rent-roll units, so it lines up 1:1 with `residents`) OR a
// common area, replacing the old free-text "Location / Unit" field.
export type LocationValue = {
  location_type: "unit" | "common_area"
  unit_number: string | null   // canonical rent-roll key for the HOH lookup
  building: string | null
  apartment: string | null
  common_area: string | null
  location: string             // human label, kept for the back-compat `location` column
}

export const EMPTY_LOCATION: LocationValue = {
  location_type: "unit",
  unit_number: null,
  building: null,
  apartment: null,
  common_area: null,
  location: "",
}

const COMMON_AREAS = [
  "Parking Lot", "Main Gate", "Pool", "Clubhouse",
  "Playground", "Community Bldg", "Leasing Office",
  "Maintenance", "Security Shack", "Mail Area",
  "Stairwell/Breezeway", "Interior Apartment", "Other",
]

export default function LocationField({
  communityId,
  value,
  onChange,
  inputCls,
}: {
  communityId: string
  value: LocationValue
  onChange: (v: LocationValue) => void
  inputCls: string
}) {
  const [units, setUnits] = useState<string[]>([])

  useEffect(() => {
    let active = true
    if (!communityId) { setUnits([]); return }
    supabase
      .from("units")
      .select("unit_number")
      .eq("community_id", communityId)
      .then(({ data }) => {
        if (!active) return
        const list = Array.from(
          new Set((data || []).map((u: any) => (u.unit_number || "").trim()).filter(Boolean)),
        ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        setUnits(list)
      })
    return () => { active = false }
  }, [communityId])

  function setType(t: "unit" | "common_area") {
    if (t === value.location_type) return
    onChange({ ...EMPTY_LOCATION, location_type: t })
  }

  function pickUnit(unit: string) {
    if (!unit) { onChange({ ...EMPTY_LOCATION, location_type: "unit" }); return }
    const { building, apartment } = splitUnit(unit)
    onChange({ location_type: "unit", unit_number: unit, building, apartment, common_area: null, location: unit })
  }

  function pickArea(area: string) {
    onChange({
      location_type: "common_area",
      unit_number: null, building: null, apartment: null,
      common_area: area || null,
      location: area === "Other" ? "" : area,
    })
  }

  const tabCls = (active: boolean) =>
    `px-3 py-1.5 rounded-md text-sm border ${active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300"}`

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button type="button" onClick={() => setType("unit")} className={tabCls(value.location_type === "unit")}>
          Residential Unit
        </button>
        <button type="button" onClick={() => setType("common_area")} className={tabCls(value.location_type === "common_area")}>
          Common Area
        </button>
      </div>

      {value.location_type === "unit" ? (
        units.length > 0 ? (
          <select value={value.unit_number || ""} onChange={e => pickUnit(e.target.value)} className={inputCls}>
            <option value="">Select unit…</option>
            {units.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        ) : (
          // No rent-roll units loaded for this community — free text so the form still works.
          <input
            value={value.unit_number || ""}
            onChange={e => pickUnit(e.target.value)}
            placeholder="Building-Apartment (e.g. 100-1A)"
            className={inputCls}
          />
        )
      ) : (
        <div className="space-y-2">
          <select value={value.common_area || ""} onChange={e => pickArea(e.target.value)} className={inputCls}>
            <option value="">Select area…</option>
            {COMMON_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {value.common_area === "Other" && (
            <input
              value={value.location}
              onChange={e => onChange({ ...value, location: e.target.value })}
              placeholder="Describe the area"
              className={inputCls}
            />
          )}
        </div>
      )}

      {value.location_type === "unit" && value.building && (
        <p className="text-xs text-gray-500">
          Bldg <span className="font-medium">{value.building}</span> · Apt <span className="font-medium">{value.apartment}</span>
        </p>
      )}
    </div>
  )
}
