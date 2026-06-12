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

export function VehicleFields({
  value,
  onChange,
  inputCls,
  labelCls,
  requireMake = false,
  requirePlate = false,
  onPlateBlur,
}: {
  value:    VehicleInfo
  onChange: (patch: Partial<VehicleInfo>) => void
  inputCls: string
  labelCls: string
  requireMake?:  boolean
  requirePlate?: boolean
  /** Fires when the plate field loses focus — used for the BOLO cross-check. */
  onPlateBlur?:  (plate: string) => void
}) {
  const req = <span className="text-red-500">*</span>

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
        <input value={value.plate} onChange={e => onChange({ plate: e.target.value.toUpperCase() })}
          onBlur={onPlateBlur ? e => onPlateBlur(e.target.value) : undefined}
          placeholder="ABC1234" className={inputCls} /></div>
      <div><label className={labelCls}>State</label>
        <input value={value.state} onChange={e => onChange({ state: e.target.value.toUpperCase() })}
          placeholder="VA" maxLength={2} className={inputCls} /></div>
    </>
  )
}
