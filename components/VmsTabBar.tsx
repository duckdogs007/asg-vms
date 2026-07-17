"use client"

import { usePathname } from "next/navigation"
import TabNavigation from "./TabNavigation"
import { VMS_TABS, VMS_TAB_PATHS } from "@/lib/routes"

/**
 * VMS workflow tab bar — appears only on check-in pages.
 * /vms/intel, /vms/reports, /vms/post-orders are top-level sections
 * and are intentionally excluded (reached via TopNav instead).
 */
export default function VmsTabBar() {
  const pathname = usePathname()

  if (!VMS_TAB_PATHS.has(pathname as any)) return null

  return <TabNavigation tabs={VMS_TABS} activeTab="" useUrls={true} />
}
