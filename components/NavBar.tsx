"use client"

import Link from "next/link"

export default function NavBar() {

  return (
    <div style={styles.nav}>

      <Link href="/">Home</Link>
      <Link href="/vms">VMS</Link>
      <Link href="/vms/intel">Intel Terminal</Link>
      <Link href="/vms/reports">Reports</Link>
      <Link href="/admin">User Dashboard</Link>

    </div>
  )
}

const styles: any = {
  nav: {
    display: "flex",
    gap: 20,
    padding: 15,
    borderBottom: "1px solid #ddd",
    marginBottom: 20
  }
}