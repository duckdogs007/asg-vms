import type { Metadata } from "next"

export const metadata: Metadata = { title: "Edit Post Orders" }

export default function AdminPostOrdersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
