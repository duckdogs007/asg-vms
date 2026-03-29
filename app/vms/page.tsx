"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";

type MatchStatus = "none" | "verify" | "confirmed" | "cleared";

export default function VMSPage() {

  // ---------------- STATE ----------------
  const [communities, setCommunities] = useState<any[]>([]);
  const [communityId, setCommunityId] = useState("");

  const [units, setUnits] = useState<any[]>([]);
  const [unitId, setUnitId] = useState("");

  const [residents, setResidents] = useState<any[]>([]);
  const [residentId, setResidentId] = useState("");

  const [visitorName, setVisitorName] = useState("");
  const [personType, setPersonType] = useState("Visitor");

  const [matchStatus, setMatchStatus] = useState<MatchStatus>("none");
  const [possibleMatches, setPossibleMatches] = useState<any[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const [enteredDOB, setEnteredDOB] = useState("");

  const [resolvedName, setResolvedName] = useState("");
  const [alertMode, setAlertMode] = useState(false);

  const [statusMessage, setStatusMessage] = useState("");
  const [isReady, setIsReady] = useState(false);

  // ---------------- LOAD ----------------
  useEffect(() => {
    loadCommunities();

    const params = new URLSearchParams(window.location.search);
    const returned = params.get("return");

    if (returned) {
      handleNameInput(returned);
    }

  }, []);

  async function loadCommunities() {
    const { data } = await supabase.from("communities").select("*");
    setCommunities(data || []);

    if (data?.length) {
      setCommunityId(data[0].id);
      loadUnits(data[0].id);
    }
  }

  async function loadUnits(commId: string) {
    setCommunityId(commId);

    const { data } = await supabase
      .from("units")
      .select("*")
      .eq("community_id", commId);

    setUnits(data || []);
  }

  async function loadResidents(unitId: string) {
    setUnitId(unitId);

    const { data } = await supabase
      .from("residents")
      .select("*")
      .eq("unit_id", unitId);

    setResidents(data || []);
  }

  // ---------------- HELPERS ----------------

  function parseName(input: string) {
    input = input.toLowerCase().trim();

    if (input.includes(",")) {
      const [last, first] = input.split(",").map(s => s.trim());
      return { first, last };
    }

    const parts = input.split(" ");
    return { first: parts[0] || "", last: parts[1] || "" };
  }

  async function checkWatchlist(first: string, last: string) {
    if (!last) return [];

    const { data } = await supabase
      .from("watchlist")
      .select("*")
      .ilike("last_name", last);

    if (!data) return [];

    return data.filter(p =>
      p.last_name.toLowerCase() === last &&
      (!first || p.first_name.toLowerCase().startsWith(first))
    );
  }

  function validateDOB(inputDOB?: string) {
    if (!selectedPerson?.dob) return;

    const dbDOB = String(selectedPerson.dob).slice(0, 10);
    const entered = inputDOB || enteredDOB;

    if (entered === dbDOB) {
      setMatchStatus("confirmed");
      setAlertMode(true);
      setStatusMessage("🚨 BARRED PERSON");
    } else {
      setStatusMessage("⚠️ DOB Mismatch - Investigate");
      setMatchStatus("verify");
    }
  }

  async function handleNameInput(input: string) {
    setVisitorName(input);

    const { first, last } = parseName(input);
    if (!last) return;

    const matches = await checkWatchlist(first, last);

    if (matches.length === 0) {
      setResolvedName(`${first} ${last}`);
      setMatchStatus("cleared");
      setAlertMode(false);
      setIsReady(true);
      setStatusMessage("🟢 Visitor Ready");
      return;
    }

    setPossibleMatches(matches);
    setMatchStatus("verify");
    setAlertMode(true);
    setIsReady(false);
  }

  // ---------------- CHECK-IN (ADDED ONLY) ----------------
  async function handleProceedCheckIn() {

    if (!visitorName) {
      alert("Enter visitor name");
      return;
    }

    const { first, last } = parseName(visitorName);

    const selectedUnit = units.find(u => u.id === unitId);
    const unitNumber = selectedUnit?.unit_number || null;

    const { error } = await supabase
      .from("visitor_logs")
      .insert({
        first_name: first,
        last_name: last,
        person_type: personType,
        community_id: communityId,
        unit_number: unitNumber,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error("INSERT ERROR:", error);
      alert("Check-in failed");
      return;
    }

    console.log("CHECK-IN SUCCESS");
    alert("Visitor Logged ✅");
  }

  // ---------------- UI ----------------

  return (
    <div style={styles.container}>
      <h2>ASG Visitor Management System</h2>

      <div style={styles.layout}>

        {/* LEFT */}
        <div style={styles.left}>
          <label>Community</label>
          <select
            value={communityId}
            onChange={(e) => loadUnits(e.target.value)}
            style={styles.input}
          >
            {communities.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <button style={styles.scanBtn}>
            Scan Driver License
          </button>

          <label>Manual Entry</label>
          <input
            value={visitorName}
            onChange={(e) => handleNameInput(e.target.value)}
            style={styles.input}
          />

          <label>Person Type</label>
          <select
            value={personType}
            onChange={(e) => setPersonType(e.target.value)}
            style={styles.input}
          >
            <option>Visitor</option>
            <option>Delivery</option>
            <option>Contractor</option>
          </select>

          <label>Unit</label>
          <select
            value={unitId}
            onChange={(e) => loadResidents(e.target.value)}
            style={styles.input}
          >
            <option value="">Select Unit</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>{u.unit_number}</option>
            ))}
          </select>

          <label>Resident</label>
          <select
            value={residentId}
            onChange={(e) => setResidentId(e.target.value)}
            style={styles.input}
          >
            <option value="">Select Resident</option>
            {residents.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>

          {/* ✅ ONLY ADDITION */}
          <button
            onClick={handleProceedCheckIn}
            style={{
              padding: 12,
              background: "#16a34a",
              color: "#fff",
              borderRadius: 6,
              border: "none",
              marginTop: 10
            }}
          >
            ✅ Proceed Check-In
          </button>

        </div>

        {/* RIGHT */}
        <div style={styles.right}>

          <div style={{ ...styles.card, ...(alertMode ? styles.alertCard : {}) }}>
            {resolvedName || visitorName || "—"}
            <div>{statusMessage}</div>
          </div>

          {matchStatus === "verify" && (
            <div style={styles.card}>
              {possibleMatches.map(p => (
                <div key={p.id} style={styles.matchRow}>
                  <div>
                    {p.first_name} {p.last_name}
                    <span style={styles.flag}> 🚨 BARRED PERSON</span>
                  </div>

                  <button onClick={() => setSelectedPerson(p)}>Select</button>

                  {selectedPerson?.id === p.id && (
                    <>
                      <input
                        type="date"
                        value={enteredDOB}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEnteredDOB(v);

                          if (v.length === 10) {
                            setTimeout(() => validateDOB(v), 50);
                          }
                        }}
                      />

                      {statusMessage.includes("Mismatch") && (
                        <button
                          onClick={() => {
                            const name = `${p.first_name} ${p.last_name}`;
                            window.location.href = `/vms/intel?search=${encodeURIComponent(name)}`;
                          }}
                        >
                          🔎 Investigate
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ---------------- STYLES ----------------

const styles: any = {
  container: { padding: 20 },
  layout: { display: "flex", gap: 30 },
  left: { flex: 1.2, display: "flex", flexDirection: "column", gap: 12 },
  right: { flex: 1 },
  input: { padding: 8, borderRadius: 4, border: "1px solid #ccc" },
  scanBtn: { padding: 12, background: "#1f2937", color: "#fff", borderRadius: 6, border: "none" },
  card: { background: "#111", color: "#fff", padding: 12, borderRadius: 6, marginBottom: 10 },
  alertCard: { background: "#7f1d1d", border: "2px solid red" },
  matchRow: { padding: 10, background: "#1a1a1a", marginBottom: 6, borderRadius: 6 },
  flag: { color: "#ef4444", marginLeft: 8 }
};
