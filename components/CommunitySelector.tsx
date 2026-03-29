"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"

type Community = {
  id: string
  name: string
}

type Props = {
  value?: string
  selected?: string
  onChange?: (value: string) => void
  setSelected?: (value: string) => void
}

export default function CommunitySelector({
  value,
  selected,
  onChange,
  setSelected
}: Props) {

  const [communities, setCommunities] = useState<Community[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCommunities()
  }, [])

  async function loadCommunities() {

    const { data, error } = await supabase
      .from("communities")
      .select("id, name")
      .order("name", { ascending: true })

    if (!error && data) {
      setCommunities(data)
    }

    setLoading(false)
  }

  return (
    <div>

      <label style={styles.label}>Community</label>

      <select
        value={value || selected || ""}
        onChange={(e) => {
          const val = e.target.value

          // supports BOTH usage styles
          if (onChange) onChange(val)
          if (setSelected) setSelected(val)
        }}
        style={styles.select}
        disabled={loading}
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

// ---------------- STYLES ----------------

const styles: any = {

  label: {
    display: "block",
    marginBottom: 6,
    fontWeight: "bold"
  },

  select: {
    width: "100%",
    padding: "10px",
    borderRadius: 6,
    border: "1px solid #ccc",
    fontSize: "14px"
  }

}