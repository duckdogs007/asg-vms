import { NextResponse } from "next/server"

const FEED_URL = "https://ppd.henrico.gov/rss/cad.aspx?sra=312"

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`))
  return (match?.[1] ?? match?.[2] ?? "").trim()
}

export async function GET() {
  try {
    const res = await fetch(FEED_URL, {
      headers: { "User-Agent": "ASG-VMS/1.0" },
      next: { revalidate: 90 },
    })

    if (!res.ok) {
      return NextResponse.json({ items: [], error: `Feed returned ${res.status}` })
    }

    const xml = await res.text()

    const items: { title: string; description: string; pubDate: string }[] = []
    const matches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]

    for (const match of matches) {
      const block = match[1]
      items.push({
        title:       extractTag(block, "title"),
        description: extractTag(block, "description"),
        pubDate:     extractTag(block, "pubDate"),
      })
    }

    return NextResponse.json({ items, updated: new Date().toISOString() })
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e.message })
  }
}
