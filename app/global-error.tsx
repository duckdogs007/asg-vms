"use client"

export const dynamic = "force-dynamic"

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ padding: 40, fontFamily: "Arial" }}>
        <h2>Something went wrong.</h2>
        <a href="/">Return to home</a>
      </body>
    </html>
  )
}
