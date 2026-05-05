"use client"

import { usePathname } from "next/navigation"
import VmsTabBar from "@/components/VmsTabBar"

// Tab bar appears only on the check-in workflow pages. /vms/intel,
// /vms/reports, /vms/post-orders are top-level concerns reached via
// TopNav and are intentionally excluded.
const TAB_PATHS = new Set(["/vms", "/vms/scan", "/vms/manual", "/vms/search"])

export default function VmsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const showTabs = TAB_PATHS.has(pathname)
  return (
    <>
      {showTabs && <VmsTabBar />}
      {children}
    </>
  )
}
