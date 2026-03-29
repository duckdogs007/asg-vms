"use client";

// force save

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";

export default function ProfilePage({ params }: any) {

  const { id } = params as { id: string };

  const [person, setPerson] = useState<any>(null);
  const [notes, setNotes] = useState("");
  const [officer, setOfficer] = useState("");
  const [severity, setSeverity] = useState("LOW");
  const [incident, setIncident] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const { data } = await supabase
      .from("watchlist")
      .select("*")
      .eq("id", id)
      .single();

    setPerson(data);
  }

  // 🚩 FLAG PERSON
  async function flagPerson() {
    const { error } = await supabase.from("person_flags").insert({
      person_id: id,
      flag_type: "MANUAL",
      created_at: new Date().toISOString()
    });

    if (error) alert(error.message);
    else alert("Person flagged");
  }

  // 📸 PHOTO UPLOAD
  async function handlePhotoUpload(e: any) {
    try {
      setUploading(true);

      const file = e.target.files[0];
      if (!file) return;

      const fileExt = file.name.split(".").pop();
      const filePath = `${id}/${Date.now()}.${fileExt}`;

      const { error } = await supabase.storage
        .from("person-photos")
        .upload(filePath, file, { upsert: true });

      if (error) throw error;

      const { data } = supabase.storage
        .from("person-photos")
        .getPublicUrl(filePath);

      const photoUrl = data.publicUrl;

      await supabase
        .from("watchlist")
        .update({ photo_url: photoUrl })
        .eq("id", id);

      setPerson({ ...person, photo_url: photoUrl });

    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  }

  // 📝 NOTES
  async function addNote() {
    if (!notes) return;

    await supabase.from("person_notes").insert({
      person_id: id,
      note: notes,
      officer_name: officer,
      severity,
      created_at: new Date().toISOString()
    });

    setNotes("");
  }

  // 📄 INCIDENT
  async function addIncident() {
    if (!incident) return;

    await supabase.from("incident_reports").insert({
      person_id: id,
      report: incident,
      created_at: new Date().toISOString()
    });

    setIncident("");
  }

  if (!person) return <div>Loading...</div>;

  return (
    <div style={styles.page}>

      {/* HEADER BLOCK */}
      <div style={styles.headerContainer}>

        {/* LEFT SIDE */}
        <div style={styles.left}>

          <h2 style={styles.name}>
            {person.first_name} {person.middle_name || ""} {person.last_name}
          </h2>

          <button style={styles.flagBtn} onClick={flagPerson}>
            🚩 Flag Person
          </button>

          <div>DOB: {person.dob}</div>
          <div>DL: {person.oln || "N/A"}</div>

        </div>

        {/* PHOTO */}
        <div style={styles.photoBox}>

          {person.photo_url ? (
            <img src={person.photo_url} style={styles.photo}/>
          ) : (
            <div>No Photo</div>
          )}

          <input
            type="file"
            onChange={handlePhotoUpload}
            style={{ marginTop: 8 }}
          />

          {uploading && <div style={{ fontSize: 12 }}>Uploading...</div>}

        </div>

      </div>

      {/* BAN DETAILS */}
      <div style={styles.section}>
        <h3>🚫 Ban Details</h3>

        <div>Community: {person.community || "N/A"}</div>
        <div>Ban Date: {person.ban_date}</div>
        <div>Banned By: {person.banned_by}</div>

        <div style={styles.reason}>
          {person.reason}
        </div>

        <div style={styles.comments}>
          {person.comments || "No additional comments"}
        </div>
      </div>

      {/* NOTES */}
      <div style={styles.section}>
        <h3>📝 Officer Notes</h3>

        <div style={styles.row}>
          <input
            placeholder="Officer Name"
            value={officer}
            onChange={(e)=>setOfficer(e.target.value)}
          />

          <select
            value={severity}
            onChange={(e)=>setSeverity(e.target.value)}
          >
            <option>LOW</option>
            <option>MEDIUM</option>
            <option>HIGH</option>
          </select>
        </div>

        <div style={styles.row}>
          <input
            placeholder="Enter note"
            value={notes}
            onChange={(e)=>setNotes(e.target.value)}
            style={{ flex: 1 }}
          />
          <button onClick={addNote}>Add</button>
        </div>
      </div>

      {/* INCIDENTS */}
      <div style={styles.section}>
        <h3>📄 Incident Reports</h3>

        <div style={styles.row}>
          <input
            placeholder="New incident report"
            value={incident}
            onChange={(e)=>setIncident(e.target.value)}
            style={{ flex: 1 }}
          />
          <button onClick={addIncident}>Add</button>
        </div>
      </div>

    </div>
  );
}

/* 🎨 STYLES */

const styles: any = {
  page: {
    maxWidth: 900,
    margin: "0 auto",
    padding: 20
  },
  headerContainer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 40
  },
  left: {
    flex: 1
  },
  name: {
    marginBottom: 8
  },
  photoBox: {
    width: 140,
    textAlign: "center"
  },
  photo: {
    width: 120,
    height: 120,
    objectFit: "cover",
    border: "1px solid #ccc"
  },
  section: {
    borderTop: "1px solid #ccc",
    marginTop: 25,
    paddingTop: 15
  },
  row: {
    display: "flex",
    gap: 10,
    marginTop: 10
  },
  flagBtn: {
    background: "red",
    color: "#fff",
    padding: "6px 10px",
    borderRadius: 4,
    marginBottom: 10
  },
  reason: {
    color: "red",
    marginTop: 10
  },
  comments: {
    marginTop: 8,
    fontStyle: "italic"
  }
};