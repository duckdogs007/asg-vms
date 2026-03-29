"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";

export default function AdminDashboard() {

  const [stats, setStats] = useState({
    total: 0,
    visitor: 0,
    delivery: 0,
    contractor: 0
  });

  const [communities, setCommunities] = useState<any[]>([]);
  const [communityId, setCommunityId] = useState("");

  const [message, setMessage] = useState("");

  // LOAD DATA
  useEffect(() => {

    async function load() {

      const { data } = await supabase.from("visitor_logs").select("*");

      const total = data?.length || 0;

      setStats({
        total,
        visitor: data?.filter(v => v.person_type === "VISITOR").length || 0,
        delivery: data?.filter(v => v.person_type === "DELIVERY").length || 0,
        contractor: data?.filter(v => v.person_type === "CONTRACTOR").length || 0
      });

      const { data: c } = await supabase.from("communities").select("*");

      setCommunities(c || []);
      if (c?.length) setCommunityId(c[0].id);
    }

    load();

  }, []);

  // 📥 RENT ROLL UPLOAD
  async function handleRentRollUpload(file: File) {

    const text = await file.text();
    const rows = text.split("\n").slice(1);

    for (let row of rows) {
      const [unit_number, resident_name] = row.split(",");

      if (!unit_number) continue;

      await supabase.from("units").upsert([{
        unit_number,
        community_id: communityId
      }]);

      await supabase.from("residents").upsert([{
        name: resident_name,
        unit_number,
        community_id: communityId
      }]);
    }

    setMessage("✅ Rent Roll Uploaded");
  }

  // 🚨 WATCHLIST UPLOAD
  async function handleWatchlistUpload(file: File) {

    const text = await file.text();
    const rows = text.split("\n").slice(1);

    for (let row of rows) {
      const [first_name, last_name, dob, reason, severity] = row.split(",");

      if (!last_name) continue;

      await supabase.from("watchlist").upsert([{
        first_name,
        last_name,
        dob,
        reason,
        severity,
        community_id: communityId
      }]);
    }

    setMessage("🚨 Watchlist Uploaded");
  }

  return (
    <div style={{ padding: 20 }}>

      <h2>VMS Analytics Dashboard</h2>

      {/* STATS */}
      <div style={{ display: "flex", gap: 20, marginTop: 20 }}>

        <div style={card}><h3>Total</h3>{stats.total}</div>
        <div style={card}><h3>Visitors</h3>{stats.visitor}</div>
        <div style={card}><h3>Delivery</h3>{stats.delivery}</div>
        <div style={card}><h3>Contractors</h3>{stats.contractor}</div>

      </div>

      {/* COMMUNITY SELECTOR */}
      <div style={{ marginTop: 30 }}>
        <h3>Select Community</h3>

        <select
          value={communityId}
          onChange={(e)=>setCommunityId(e.target.value)}
          style={input}
        >
          {communities.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* RENT ROLL UPLOAD */}
      <div style={box}>
        <h3>📥 Upload Rent Roll</h3>

        <input
          type="file"
          accept=".csv"
          onChange={(e)=>{
            if (e.target.files?.[0]) {
              handleRentRollUpload(e.target.files[0]);
            }
          }}
        />
      </div>

      {/* WATCHLIST UPLOAD */}
      <div style={box}>
        <h3>🚨 Upload Watchlist</h3>

        <input
          type="file"
          accept=".csv"
          onChange={(e)=>{
            if (e.target.files?.[0]) {
              handleWatchlistUpload(e.target.files[0]);
            }
          }}
        />
      </div>

      {/* STATUS */}
      {message && (
        <div style={{ marginTop: 20, color: "green" }}>
          {message}
        </div>
      )}

    </div>
  );
}

const card = {
  padding: 20,
  border: "1px solid #ddd",
  borderRadius: 8,
  minWidth: 120
};

const box = {
  marginTop: 20,
  padding: 15,
  border: "1px solid #ddd",
  borderRadius: 8
};

const input = {
  padding: 8,
  width: "300px"
};