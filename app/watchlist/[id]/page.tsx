"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useParams, useRouter } from "next/navigation";

export default function WatchlistProfilePage() {

  const { id } = useParams();
  const router = useRouter();

  const [person, setPerson] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {

    if (!id) return;

    async function load() {

      // WATCHLIST RECORD
      const { data: p } = await supabase
        .from("watchlist")
        .select("*")
        .eq("id", id)
        .single();

      setPerson(p);

      if (!p) return;

      // VISIT HISTORY (name-based for now)
      const { data: h } = await supabase
        .from("visitor_logs")
        .select("*")
        .ilike("last_name", p.last_name)
        .order("created_at", { ascending: false });

      setHistory(h || []);
    }

    load();

  }, [id]);

  if (!person) {
    return <div style={{ padding: 20 }}>Loading profile...</div>;
  }

  return (
    <div style={{ padding: 20 }}>

      {/* HEADER */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        marginBottom: 20
      }}>
        <h2>
          {person.first_name} {person.last_name}
        </h2>

        <button onClick={() => router.back()}>
          ← Back
        </button>
      </div>

      {/* ALERT CARD */}
      <div style={{
        border: "1px solid red",
        background: "#fff5f5",
        padding: 15,
        borderRadius: 8,
        marginBottom: 20
      }}>
        <div style={{ fontWeight: "bold", color: "red" }}>
          🚨 WATCHLIST ALERT
        </div>

        <div><b>Reason:</b> {person.reason || "N/A"}</div>
        <div><b>Severity:</b> {person.severity || "N/A"}</div>

        <div style={{ fontSize: 12, color: "#666" }}>
          Added: {person.created_at
            ? new Date(person.created_at).toLocaleDateString()
            : "N/A"}
        </div>
      </div>

      {/* VISIT HISTORY */}
      <div>
        <h3>Visit History</h3>

        {history.length === 0 && <div>No visits found</div>}

        {history.map((v, i) => (
          <div key={i} style={{
            borderBottom: "1px solid #eee",
            padding: "6px 0"
          }}>
            <div>{new Date(v.created_at).toLocaleString()}</div>
            <div>{v.unit_number} — {v.resident_name}</div>
            <div>Status: {v.status}</div>
          </div>
        ))}
      </div>

    </div>
  );
}