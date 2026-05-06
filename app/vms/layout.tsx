import type { Metadata } from "next"
import VmsTabBar from "@/components/VmsTabBar"

export const metadata: Metadata = { title: "Visitor Check-In" }

export default function VmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <VmsTabBar />
      {children}
    </>
  )
}
