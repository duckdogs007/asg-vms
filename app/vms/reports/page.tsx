"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import CommunitySelector from "@/components/CommunitySelector";

// ---------- TIME HELPERS ----------
function toLocal(ts: string) {
  const d = new Date(ts);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000);
}

function formatTime(ts: string) {
  return toLocal(ts).toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function timeAgo(ts: string) {
  const now = new Date();
  const created = toLocal(ts);

  const diff = now.getTime() - created.getTime();
  if (diff < 0) return "Just now";

  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

export default function ReportsPage() {
  const [community, setCommunity] = useState("");
  const [visits, setVisits] = useState<any[]>([]);

  const [stats, setStats] = useState({
    visitors: 0,
    deliveries: 0,
    contractors: 0,
    residents: 0,
    peak: "",
    topUnit: "",
    repeat: 0,
    missingUnit: 0
  });

  useEffect(() => {
    if (community) loadData();
  }, [community]);

  async function loadData() {
    const { data } = await supabase
      .from("visitor_logs")
      .select("*")
      .eq("community_id", community)
      .order("created_at", { ascending: false });

    if (!data) return;

    setVisits(data);

    // -------- STATS --------
    const today = new Date().toISOString().split("T")[0];

    const todayVisits = data.filter(v =>
      v.created_at?.startsWith(today)
    );

    const visitors = todayVisits.filter(v => v.person_type === "Visitor").length;
    const deliveries = todayVisits.filter(v => v.person_type === "Delivery").length;
    const contractors = todayVisits.filter(v => v.person_type === "Contractor").length;
    const residents = todayVisits.filter(v => v.person_type === "Resident").length;

    // Peak hour
    const hours: any = {};
    todayVisits.forEach(v => {
      const h = new Date(v.created_at).getHours();
      hours[h] = (hours[h] || 0) + 1;
    });

    const peak = Object.keys(hours).length
      ? `${Object.keys(hours).reduce((a, b) => (hours[a] > hours[b] ? a : b))}:00`
      : "-";

    // Top unit
    const units: any = {};
    todayVisits.forEach(v => {
      if (!v.unit_number) return;
      units[v.unit_number] = (units[v.unit_number] || 0) + 1;
    });

    const topUnit = Object.keys(units).length
      ? Object.keys(units).reduce((a, b) => (units[a] > units[b] ? a : b))
      : "-";

    // Repeat visitors
    const nameCount: any = {};
    data.forEach(v => {
      const key = `${v.first_name}-${v.last_name}`;
      nameCount[key] = (nameCount[key] || 0) + 1;
    });

    const repeat = Object.values(nameCount).filter((c: any) => c > 1).length;

    const missingUnit = data.filter(v => !v.unit_number).length;

    setStats({
      visitors,
      deliveries,
      contractors,
      residents,
      peak,
      topUnit,
      repeat,
      missingUnit
    });
  }

  return (
    <main style={{ padding: 20 }}>
      <h1>VMS Reports and Analytics</h1>

      <div style={{ marginBottom: 20 }}>
        <CommunitySelector
          selected={community}
          setSelected={setCommunity}
        />
      </div>

      {/* -------- KPI CARDS -------- */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 220px)",
        gap: 20,
        marginBottom: 30
      }}>
        <Card title="Visitors" value={stats.visitors} />
        <Card title="Delivery Drivers" value={stats.deliveries} />
        <Card title="Contractors" value={stats.contractors} />
        <Card title="Resident Entries" value={stats.residents} />
        <Card title="Peak Gate Hour" value={stats.peak} />
        <Card title="Most Visited Unit" value={stats.topUnit} />
      </div>

      {/* -------- INTEL -------- */}
      <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
        <Badge label={`Total Visits: ${visits.length}`} />
        <Badge label={`Repeat Visitors: ${stats.repeat}`} />
        <Badge label={`Missing Unit: ${stats.missingUnit}`} red />
      </div>

      {/* -------- VISITOR LIST -------- */}
      <div>
        {visits.map((v, i) => (
          <div
  key={i}
  style={{ ...row, cursor: "pointer" }}
  onClick={() =>
    window.location.href = `/vms/intel?search=${encodeURIComponent(
      `${v.first_name} ${v.last_name}`
    )}`
  }
  onMouseEnter={(e) => (e.currentTarget.style.background = "#1f2937")}
  onMouseLeave={(e) => (e.currentTarget.style.background = "#111")}
>
            <div>
              <div style={{ fontWeight: "bold" }}>
                {v.first_name} {v.last_name}
              </div>
              <div style={sub}>
                Unit: {v.unit_number || "-"}
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div>{formatTime(v.created_at)}</div>
              <div style={sub}>{timeAgo(v.created_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

// ---------- COMPONENTS ----------
function Card({ title, value }: any) {
  return (
    <div style={{
      background: "#f3f4f6",
      padding: 20,
      borderRadius: 10,
      width: 200
    }}>
      <div style={{ fontSize: 14 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: "bold" }}>{value}</div>
    </div>
  );
}

function Badge({ label, red }: any) {
  return (
    <div
      style={{
        background: red ? "#7f1d1d" : "#111",
        color: "#fff",
        padding: "10px 15px",
        borderRadius: 8
      }}
    >
      {label}
    </div>
  );
}

// ---------- STYLES ----------
const row: any = {
  background: "#111",
  color: "#fff",
  padding: 12,
  borderRadius: 6,
  marginBottom: 10,
  display: "flex",
  justifyContent: "space-between"
};

const sub: any = {
  fontSize: 12,
  color: "#aaa"
};