import type { Metadata } from "next"

export const metadata: Metadata = { title: "User Dashboard" }

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
