"use client"

// 24-hour (military) time picker. Two dropdowns — hour 00–23 and minute 00–59 —
// that combine into an "HH:MM" string, exactly the format the native
// <input type="time"> produced, so stored values and every downstream display
// stay unchanged. Native time inputs render 12-hour AM/PM under a US locale and
// can't be forced to 24-hour, which is why security ops need this explicit picker.
export default function MilitaryTimeField({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [h, m] = value && value.includes(":") ? value.split(":") : ["", ""]

  const commit = (hh: string, mm: string) => {
    if (!hh && !mm) { onChange(""); return }
    onChange(`${(hh || "00").padStart(2, "0")}:${(mm || "00").padStart(2, "0")}`)
  }

  const selCls =
    "px-2 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"

  return (
    <div className="flex items-center gap-1">
      <select aria-label="Hour (24-hour)" value={h} onChange={e => commit(e.target.value, m)} className={selCls}>
        <option value="">HH</option>
        {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map(hh => (
          <option key={hh} value={hh}>{hh}</option>
        ))}
      </select>
      <span className="text-gray-400 font-bold">:</span>
      <select aria-label="Minute" value={m} onChange={e => commit(h, e.target.value)} className={selCls}>
        <option value="">MM</option>
        {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(mm => (
          <option key={mm} value={mm}>{mm}</option>
        ))}
      </select>
      <span className="text-[10px] text-gray-400 ml-1 whitespace-nowrap">24-hr</span>
    </div>
  )
}
