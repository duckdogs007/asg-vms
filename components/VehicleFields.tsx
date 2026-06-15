"use client"

// Shared vehicle-identification fields, used by the Officer Reports
// "Vehicle FI" and "Parking Violation" forms so the make/model/color/year/
// plate/state inputs stay identical and in one place.
//
// Renders six <div> field blocks meant to sit inside an existing
// `grid grid-cols-1 sm:grid-cols-2 gap-4` form grid. Styling is passed in
// (inputCls/labelCls) so the host form fully controls appearance.

export interface VehicleInfo {
  make:  string
  model: string
  color: string
  year:  string
  plate: string
  state: string
}

export const EMPTY_VEHICLE: VehicleInfo = {
  make: "", model: "", color: "", year: "", plate: "", state: "",
}

// Sentinel plate values for vehicles with no plate or a non-displayed plate.
// Stored verbatim in the `plate` column; lookups (BOLO/registry) should skip
// these. `isNoPlate` lets host forms gate validation/lookup/banners.
export const NO_PLATE_VALUES = ["NONE", "NOT_DISPLAYED"] as const
export function isNoPlate(plate: string): boolean {
  return (NO_PLATE_VALUES as readonly string[]).includes(plate)
}

// Human-readable plate for display (lists, detail views, CSV). Maps the no-plate
// sentinels to friendly labels; passes real plates through unchanged.
export function displayPlate(plate: string | null | undefined): string {
  if (plate === "NONE")          return "No plate"
  if (plate === "NOT_DISPLAYED") return "Not displayed"
  return plate || ""
}

export function VehicleFields({
  value,
  onChange,
  inputCls,
  labelCls,
  requireMake = false,
  requirePlate = false,
  allowNoPlate = false,
  onPlateBlur,
}: {
  value:    VehicleInfo
  onChange: (patch: Partial<VehicleInfo>) => void
  inputCls: string
  labelCls: string
  requireMake?:  boolean
  requirePlate?: boolean
  /** Adds a Displayed / None / Not Displayed selector for vehicles with no plate. */
  allowNoPlate?: boolean
  /** Fires when the plate field loses focus — used for the BOLO cross-check. */
  onPlateBlur?:  (plate: string) => void
}) {
  const req = <span className="text-red-500">*</span>

  // Plate "presence" — drives the optional None / Not Displayed selector. When a
  // sentinel is chosen the free-text input is hidden and the sentinel is stored.
  const presence = isNoPlate(value.plate) ? value.plate : "DISPLAYED"

  return (
    <>
      <div><label className={labelCls}>Make {requireMake && req}</label>
        <input value={value.make} onChange={e => onChange({ make: e.target.value })}
          placeholder="e.g. Ford, Toyota" className={inputCls} /></div>
      <div><label className={labelCls}>Model</label>
        <input value={value.model} onChange={e => onChange({ model: e.target.value })}
          placeholder="e.g. F-150, Camry" className={inputCls} /></div>
      <div><label className={labelCls}>Color</label>
        <input value={value.color} onChange={e => onChange({ color: e.target.value })}
          placeholder="e.g. Black, Silver" className={inputCls} /></div>
      <div><label className={labelCls}>Year</label>
        <input value={value.year} onChange={e => onChange({ year: e.target.value })}
          placeholder="e.g. 2019" maxLength={4} className={inputCls} /></div>
      <div><label className={labelCls}>Tag # (Plate) {requirePlate && req}</label>
        {allowNoPlate ? (
          <div className="flex gap-2">
            <select
              value={presence}
              onChange={e => onChange({ plate: e.target.value === "DISPLAYED" ? "" : e.target.value })}
              className={inputCls + " max-w-[9rem]"}>
              <option value="DISPLAYED">Displayed</option>
              <option value="NONE">None</option>
              <option value="NOT_DISPLAYED">Not Displayed</option>
            </select>
            {presence === "DISPLAYED" && (
              <input value={value.plate} onChange={e => onChange({ plate: e.target.value.toUpperCase() })}
                onBlur={onPlateBlur ? e => onPlateBlur(e.target.value) : undefined}
                placeholder="ABC1234" className={inputCls} />
            )}
          </div>
        ) : (
          <input value={value.plate} onChange={e => onChange({ plate: e.target.value.toUpperCase() })}
            onBlur={onPlateBlur ? e => onPlateBlur(e.target.value) : undefined}
            placeholder="ABC1234" className={inputCls} />
        )}</div>
      <div><label className={labelCls}>State</label>
        <input value={value.state} onChange={e => onChange({ state: e.target.value.toUpperCase() })}
          placeholder="VA" maxLength={2} className={inputCls} /></div>
    </>
  )
}
