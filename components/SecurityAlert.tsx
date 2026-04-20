"use client"

import { WatchlistEntry } from "@/lib/types"

interface Props {
  person: (WatchlistEntry & { match_level?: string; confidence?: number }) | null
  onClose: () => void
}

export default function SecurityAlert({ person, onClose }: Props) {

  if (!person) return null

  const bannedDate = person.ban_date || person.banned_date || person.date_banned

  return (
    <div className="fixed inset-0 flex justify-end bg-black/25 z-[9999]">
      <div className="w-[420px] h-screen bg-white shadow-2xl flex flex-col">

        <div className="px-5 py-4 border-b border-gray-100">
          <div className="text-xl font-bold text-red-700">🚨 Security Alert</div>
          {person.match_level && (
            <div className="text-xs text-gray-500 mt-0.5">
              {person.match_level}
              {person.confidence !== undefined && ` — ${person.confidence}% confidence`}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">

          <Row label="Name" value={`${person.first_name} ${person.last_name}`} />
          {person.dob     && <Row label="DOB"            value={person.dob} />}
          {person.race    && <Row label="Race"           value={person.race} />}
          {person.sex     && <Row label="Sex"            value={person.sex} />}
          {person.oln     && <Row label="Driver License" value={person.oln} />}
          {person.status  && <Row label="Status"         value={person.status} />}
          {person.reason  && <Row label="Reason"         value={person.reason} />}
          {person.property && <Row label="Property"      value={person.property} />}

          {bannedDate && (
            <Row label="Banned Date" value={new Date(bannedDate).toLocaleDateString()} />
          )}

          {(person.notes || person.comments) && (
            <Row label="Notes" value={(person.notes || person.comments)!} />
          )}

          {person.firearm_flag && (
            <div className="mt-2 bg-red-100 text-red-700 font-bold px-3 py-2.5 rounded-md">
              🚨 FIREARM RELATED INCIDENT
            </div>
          )}

        </div>

        <div className="px-5 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full py-3 bg-blue-900 text-white font-bold rounded-md text-sm hover:bg-blue-800 transition-colors border-none cursor-pointer"
          >
            Acknowledge
          </button>
        </div>

      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <span className="font-semibold text-gray-700">{label}: </span>
      <span className="text-gray-900">{value}</span>
    </div>
  )
}
