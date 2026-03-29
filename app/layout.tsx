"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {

  const [currentTime, setCurrentTime] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date()
      setCurrentTime(
        now.toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit"
        })
      )
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  function toggleMenu() {
    setMenuOpen(!menuOpen)
  }

  function handleLogout() {
    console.log("logout placeholder")
  }

  return (
    <html lang="en">
      <body style={styles.body}>

        {/* 🔝 TOP NAV BAR */}
        <div style={styles.topBar}>

          {/* LEFT NAV LINKS */}
          <div style={styles.navLinks}>
            <Link href="/">Home</Link>
            <Link href="/vms">VMS</Link>
            <Link href="/vms/intel">Intel Terminal</Link>

            {/* ✅ ADDED REPORTS */}
            <Link href="/vms/reports">Reports</Link>

            <Link href="/admin">Admin Dashboard</Link>
          </div>

          {/* RIGHT SIDE */}
          <div style={styles.topRight}>

            {/* USER BLOCK */}
            <div style={styles.userWrap} onClick={toggleMenu}>

              <span style={styles.onlineDot}></span>

              <span style={styles.userName}>
                John Hall
              </span>

              <span style={styles.caret}>▼</span>

              {menuOpen && (
                <div style={styles.dropdown}>

                  <div style={styles.dropdownItem}>
                    👤 Profile
                  </div>

                  <div
                    style={styles.dropdownItem}
                    onClick={handleLogout}
                  >
                    🚪 Logout
                  </div>

                </div>
              )}

            </div>

            <span style={{ margin: "0 8px" }}>|</span>

            <span>{currentTime}</span>

            <button style={styles.nightBtn}>
              Night Mode
            </button>

          </div>

        </div>

        {/* PAGE CONTENT */}
        <div style={styles.page}>
          {children}
        </div>

      </body>
    </html>
  )
}

const styles: any = {

  body: {
    margin: 0,
    fontFamily: "Arial"
  },

  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 20px",
    borderBottom: "1px solid #ddd",
    background: "#fff"
  },

  navLinks: {
    display: "flex",
    gap: 20
  },

  topRight: {
    display: "flex",
    alignItems: "center",
    gap: 10
  },

  userWrap: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
    position: "relative"
  },

  userName: {
    fontWeight: "bold"
  },

  caret: {
    fontSize: 10
  },

  onlineDot: {
    width: 8,
    height: 8,
    background: "#22c55e",
    borderRadius: "50%"
  },

  dropdown: {
    position: "absolute",
    top: 25,
    right: 0,
    background: "white",
    border: "1px solid #ddd",
    borderRadius: 6,
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    zIndex: 1000,
    minWidth: 140
  },

  dropdownItem: {
    padding: "10px 12px",
    cursor: "pointer",
    borderBottom: "1px solid #eee"
  },

  nightBtn: {
    marginLeft: 10,
    padding: "6px 10px",
    background: "#1e40af",
    color: "white",
    border: "none",
    borderRadius: 6,
    cursor: "pointer"
  },

  page: {
    padding: 20
  }

}