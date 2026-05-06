import type { Metadata } from "next"

export const metadata: Metadata = { title: "Admin Dashboard" }

export default function AdminSystemLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
