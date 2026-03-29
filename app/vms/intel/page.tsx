"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";

export default function IntelPage() {

  const [searchInput, setSearchInput] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const [communities, setCommunities] = useState<any[]>([]);

  // ---------------- HELPERS ----------------

  function normalizeName(name: string) {
    return (name || "")
      .toLowerCase()
      .replace(",", "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function daysAgo(date: string) {
    const diff = Date.now() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Today";
    if (days === 1) return "1 day ago";
    return `${days} days ago`;
  }

  function getCommunityName(id?: string) {
    if (!id) return null;
    const match = communities.find(c => c.id === id);
    return match?.name || null;
  }

  // ---------------- INIT ----------------
  useEffect(() => {
    loadCommunities();
  }, []);

  async function loadCommunities() {
    const { data } = await supabase
      .from("communities")
      .select("id, name");

    setCommunities(data || []);
  }

  // ---------------- SEARCH ----------------
  async function runSearch(query: string) {
    if (!query) return;

    const q = query.toLowerCase().trim();
    const tokens = q.replace(",", " ").split(" ").filter(Boolean);

    const { data: visitors } = await supabase.from("visitors").select("*");
    const { data: watchlist } = await supabase.from("watchlist").select("*");
    const { data: logs } = await supabase.from("visitor_logs").select("*");

    function matchText(text: string) {
      const t = (text || "").toLowerCase();
      return tokens.every(token => t.includes(token));
    }

    const profiles: any[] = [];

    // ---------- VISITORS ----------
    (visitors || []).forEach(v => {
      const full = `${v.first_name} ${v.last_name}`;
      if (!matchText(full)) return;

      const watchMatch = (watchlist || []).find(w =>
        w.first_name.toLowerCase() === v.first_name.toLowerCase() &&
        w.last_name.toLowerCase() === v.last_name.toLowerCase()
      );

      const normalizedFull = normalizeName(full);

      const personLogs = (logs || []).filter(l => {
        const name1 = normalizeName(`${l.first_name} ${l.last_name}`);
        const name2 = normalizeName(`${l.dl_first_name} ${l.dl_last_name}`);
        return name1 === normalizedFull || name2 === normalizedFull;
      });

      const lastVisit = personLogs.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

      profiles.push({
        id: v.id,
        first_name: v.first_name,
        last_name: v.last_name,
        isBarred: !!watchMatch,
        watchData: watchMatch || null,
        history: personLogs,
        lastVisit,
        community_id: lastVisit?.community_id || null
      });
    });

    // ---------- WATCHLIST ONLY ----------
    (watchlist || []).forEach(w => {
      const full = `${w.first_name} ${w.last_name}`;
      if (!matchText(full)) return;

      const exists = profiles.some(p =>
        p.first_name.toLowerCase() === w.first_name.toLowerCase() &&
        p.last_name.toLowerCase() === w.last_name.toLowerCase()
      );

      if (!exists) {
        profiles.push({
          id: w.id,
          first_name: w.first_name,
          last_name: w.last_name,
          isBarred: true,
          watchData: w,
          history: [],
          lastVisit: null,
          community_id: w.community_id || null
        });
      }
    });

    profiles.sort((a, b) => {
      if (a.isBarred && !b.isBarred) return -1;
      if (!a.isBarred && b.isBarred) return 1;
      return a.last_name.localeCompare(b.last_name);
    });

    setResults(profiles);
  }

  // ---------------- SELECT ----------------
  function loadProfile(person: any) {
    setSelectedPerson(person);
    setResults([]);
  }

  // ---------------- LOG ENCOUNTER ----------------
  async function logEncounter() {
    if (!selectedPerson) return;

    const fullName = `${selectedPerson.first_name} ${selectedPerson.last_name}`;

    await supabase.from("visitor_logs").insert({
      person_name: fullName,
      person_type: "barred",
      status: "barred_encounter",
      created_at: new Date()
    });

    runSearch(fullName);
  }

  // ---------------- UI ----------------

  const visitCount = selectedPerson?.history?.length || 0;

  const lastSeen = selectedPerson?.lastVisit?.created_at
    ? daysAgo(selectedPerson.lastVisit.created_at)
    : null;

  return (
    <div style={styles.container}>
      <h2>Intel Terminal</h2>

      {/* SEARCH */}
      <div style={styles.searchRow}>
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runSearch(searchInput);
          }}
          style={styles.input}
          placeholder="Search name..."
        />

        <button style={styles.button} onClick={() => runSearch(searchInput)}>
          Search
        </button>
      </div>

      {/* RESULTS */}
      <div style={styles.results}>
        {results.map(r => (
          <div
            key={r.id}
            style={styles.resultCard}
            onClick={() => loadProfile(r)}
          >
            {r.last_name}, {r.first_name}
            {r.isBarred && <span style={styles.flag}> 🚨 BARRED</span>}
          </div>
        ))}
      </div>

      {/* PROFILE */}
      {selectedPerson && (
        <div style={styles.profileWrap}>

          {/* LEFT */}
          <div style={styles.leftPanel}>
            <div style={styles.photoBox}></div>
            <input type="file" />

            <h3>
              {selectedPerson.last_name}, {selectedPerson.first_name}
            </h3>

            <div>
              {selectedPerson.isBarred ? "🚨 BARRED PERSON" : "🟢 Clear"}
            </div>

            {/* 🔥 NEW METRICS */}
            <div><strong>Visits:</strong> {visitCount}</div>

            <div><strong>Last Seen:</strong> {lastSeen || "-"}</div>

            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {selectedPerson.lastVisit
                ? new Date(selectedPerson.lastVisit.created_at).toLocaleString()
                : ""}
            </div>

            <div>
              <strong>Community:</strong>{" "}
              {selectedPerson.watchData?.property ||
                getCommunityName(selectedPerson.community_id) ||
                "-"}
            </div>

            <button style={styles.button} onClick={logEncounter}>
              🚨 Log Encounter
            </button>
          </div>

          {/* RIGHT */}
          <div style={styles.rightPanel}>

            <h3>🚨 Ban History</h3>

            {selectedPerson.watchData ? (
              <div style={styles.historyCard}>

                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  <div>
                    <strong>Ban Date:</strong>{" "}
                    {selectedPerson.watchData.ban_date
                      ? new Date(selectedPerson.watchData.ban_date).toLocaleDateString()
                      : "-"}
                  </div>

                  <div>
                    <strong>Community:</strong>{" "}
                    {selectedPerson.watchData.property ||
                      getCommunityName(selectedPerson.community_id) ||
                      "-"}
                  </div>
                </div>

                <div><strong>DOB:</strong> {selectedPerson.watchData.dob || "-"}</div>
                <div><strong>OLN:</strong> {selectedPerson.watchData.oln || "-"}</div>
                <div><strong>SSN:</strong> {selectedPerson.watchData.ssn || "-"}</div>
                <div><strong>Banned By:</strong> {selectedPerson.watchData.banned_by || "-"}</div>
                <div><strong>Comments:</strong> {selectedPerson.watchData.comments || "-"}</div>

              </div>
            ) : (
              <div>No ban history</div>
            )}

            <h3 style={{ marginTop: 20 }}>📊 Visitor History</h3>

            {(selectedPerson.history || []).map(v: any) => {

              const isDL = v.dl_first_name && v.dl_last_name;

              return (
                <div key={v.id} style={styles.historyRow}>

                  <div style={{ display: "flex", gap: 12 }}>
                    <strong>{new Date(v.created_at).toLocaleString()}</strong>

                    <span style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: isDL ? "#065f46" : "#78350f",
                      color: "#fff"
                    }}>
                      {isDL ? "DL SCAN" : "MANUAL ENTRY"}
                    </span>
                  </div>

                  <div>Community: {getCommunityName(v.community_id) || "-"}</div>

                  <div>
                    Name: {v.first_name} {v.last_name}
                    {isDL && ` (DL: ${v.dl_first_name} ${v.dl_last_name})`}
                  </div>

                </div>
              );
            })}

          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- STYLES ----------------
const styles: any = {
  container: { padding: 20 },
  searchRow: { display: "flex", gap: 10 },
  input: { padding: 8, border: "1px solid #ccc", borderRadius: 4 },
  button: { padding: "8px 12px", background: "#2563eb", color: "#fff", borderRadius: 6, border: "none" },
  results: { marginTop: 20 },
  resultCard: { padding: 10, background: "#111", color: "#e5e7eb", marginBottom: 6, borderRadius: 6, cursor: "pointer" },
  flag: { color: "red", marginLeft: 8 },
  profileWrap: { display: "flex", gap: 30, marginTop: 30 },
  leftPanel: { width: 240 },
  rightPanel: { flex: 1 },
  photoBox: { width: 180, height: 180, background: "#333", marginBottom: 10 },
  historyRow: {
    marginBottom: 10,
    padding: 10,
    background: "#0f172a",
    borderRadius: 6,
    color: "#e5e7eb",
    border: "1px solid #1f2937"
  },
  historyCard: {
    padding: 12,
    background: "#111827",
    borderRadius: 8,
    color: "#e5e7eb",
    marginBottom: 10
  }
};