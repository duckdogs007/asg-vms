"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"
import { Community } from "@/lib/types"

interface Props {
  value: string
  onChange: (value: string) => void
  label?: string
}

export default function CommunitySelector({ value, onChange, label = "Community" }: Props) {

  const [communities, setCommunities] = useState<Community[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    loadCommunities()
  }, [])

  async function loadCommunities() {
    const { data, error } = await supabase
      .from("communities")
      .select("id, name")
      .order("name", { ascending: true })

    if (error) {
      setError("Failed to load communities")
    } else if (data) {
      setCommunities(data)
    }

    setLoading(false)
  }

  return (
    <div className="mb-4">
      <label className="block text-sm font-semibold mb-1">{label}</label>

      {error && (
        <p className="text-red-600 text-sm mb-1">{error}</p>
      )}

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
      >
        <option value="">
          {loading ? "Loading..." : "Select Community"}
        </option>

        {communities.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  )
}
