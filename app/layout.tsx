import "./globals.css"
import type { Metadata } from "next"
import TopNav from "@/components/TopNav"
import Breadcrumbs from "@/components/Breadcrumbs"

export const metadata: Metadata = {
  title: {
    template: "%s — ASG-PSP",
    default:  "ASG-PSP — Property Solutions Platform",
  },
  description: "American Security Group — Property Solutions Platform",
}

export const dynamic = "force-dynamic"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TopNav />
        <Breadcrumbs />
        <div className="p-5">
          {children}
        </div>
      </body>
    </html>
  )
}
