"use client"

import Link from "next/link"

export default function Home() {
  return (
    <main style={styles.container}>
      {/* HEADER */}
      <h1 style={styles.title}>American Security Group</h1>
      <p style={styles.subtitle}>Integrated Property Solutions</p>

      {/* MENU GRID */}
      <div style={styles.grid}>

        <Link href="/vms">
          <div style={styles.menuBox}>VMS</div>
        </Link>

        <Link href="/vms/intel">
          <div style={styles.menuBox}>Intel Terminal</div>
        </Link>

        <Link href="/admin">
          <div style={styles.menuBox}>Admin Dashboard</div>
        </Link>

        {/* 🔥 NEW REPORTS TILE */}
        <Link href="/vms/reports">
          <div style={styles.reportsBox}>Reports / Analytics</div>
        </Link>

        <div style={styles.menuBox}>Linked Camera Systems</div>
        <div style={styles.menuBox}>Future Add-Ons</div>

      </div>

    </main>
  )
}

// ---------------- STYLES ----------------

const styles: any = {

  container: {
    padding: 40,
    fontFamily: "Arial"
  },

  topNav: {
    display: "flex",
    gap: 20,
    marginBottom: 30
  },

  title: {
    fontSize: 32,
    marginBottom: 10
  },

  subtitle: {
    color: "#555",
    marginBottom: 30
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 220px)",
    gap: 20
  },

  menuBox: {
    background: "#1e40af",
    color: "white",
    padding: 22,
    borderRadius: 10,
    textAlign: "center",
    fontWeight: "bold",
    cursor: "pointer"
  },

  // 🔥 Reports gets a different color
  reportsBox: {
    background: "#0f766e",
    color: "white",
    padding: 22,
    borderRadius: 10,
    textAlign: "center",
    fontWeight: "bold",
    cursor: "pointer"
  }

}