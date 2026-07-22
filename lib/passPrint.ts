// Printed visitor / temporary vehicle passes. Builds a self-contained print
// window (same approach as the report/ticket printing) and formats a card sized
// for a wallet/half-sheet (visitor) or a dashboard placard (vehicle).

export interface PassData {
  pass_number: string
  pass_type: "visitor" | "vehicle"
  community_name: string
  visitor_name: string
  person_type?: string | null
  unit_number?: string | null
  resident_name?: string | null
  plate?: string | null
  plate_state?: string | null
  vehicle?: string | null
  valid_from?: string | null
  valid_to?: string | null
  issued_by?: string | null
  issued_at: string // ISO
}

// Short human-friendly pass number, e.g. V-7F3QK / P-9ABX2.
export function generatePassNumber(type: "visitor" | "vehicle"): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase()
  return `${type === "vehicle" ? "P" : "V"}-${rand}`
}

const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T00:00:00") : new Date(iso)
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
}

function shell(title: string, inner: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>
      *{box-sizing:border-box;} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:18px;}
      .pass{border:2px solid #111;border-radius:10px;padding:16px 18px;max-width:520px;}
      .khead{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#374151;}
      .prop{font-size:15px;font-weight:bold;}
      .title{font-size:22px;font-weight:800;letter-spacing:.02em;margin:2px 0 10px;}
      .row{display:flex;justify-content:space-between;gap:12px;font-size:14px;padding:3px 0;border-top:1px dashed #d1d5db;}
      .row .k{color:#6b7280;} .row .v{font-weight:600;text-align:right;}
      .big{font-size:30px;font-weight:800;letter-spacing:.04em;margin:6px 0;}
      .valid{background:#111;color:#fff;font-weight:800;font-size:16px;text-align:center;padding:8px;border-radius:6px;margin-top:10px;letter-spacing:.03em;}
      .foot{font-size:11px;color:#6b7280;margin-top:10px;display:flex;justify-content:space-between;}
      @media print{@page{margin:10mm;} body{padding:0;}}
    </style></head><body>${inner}</body></html>`
}

function visitorCard(p: PassData): string {
  const dest = [p.unit_number && `Unit ${p.unit_number}`, p.resident_name && `visiting ${p.resident_name}`].filter(Boolean).join(" · ") || "—"
  const validLine = p.valid_from && p.valid_to
    ? (p.valid_from === p.valid_to ? `EXPIRES: ${fmtDate(p.valid_to)}` : `VALID: ${fmtDate(p.valid_from)} – ${fmtDate(p.valid_to)}`)
    : ""
  return `<div class="pass">
    <div class="khead">${esc(p.community_name)}</div>
    <div class="title">Visitor Pass</div>
    <div class="row"><span class="k">Visitor</span><span class="v">${esc(p.visitor_name || "—")}</span></div>
    <div class="row"><span class="k">Type</span><span class="v">${esc(p.person_type || "Visitor")}</span></div>
    <div class="row"><span class="k">Destination</span><span class="v">${esc(dest)}</span></div>
    <div class="row"><span class="k">Issued</span><span class="v">${esc(fmtDateTime(p.issued_at))}</span></div>
    ${validLine ? `<div class="valid">${esc(validLine)}</div>` : ""}
    <div class="foot"><span>Pass #${esc(p.pass_number)}</span><span>${p.issued_by ? "Issued by " + esc(p.issued_by) : ""}</span></div>
  </div>`
}

function vehicleCard(p: PassData): string {
  const validLine = p.valid_from && p.valid_to
    ? (p.valid_from === p.valid_to ? `VALID: ${fmtDate(p.valid_from)}` : `VALID: ${fmtDate(p.valid_from)} – ${fmtDate(p.valid_to)}`)
    : "TEMPORARY PASS"
  return `<div class="pass">
    <div class="khead">${esc(p.community_name)}</div>
    <div class="title">Temporary Parking Pass</div>
    <div class="big">${esc(p.plate || "—")}${p.plate_state ? ` <span style="font-size:16px;">(${esc(p.plate_state)})</span>` : ""}</div>
    ${p.vehicle ? `<div class="row"><span class="k">Vehicle</span><span class="v">${esc(p.vehicle)}</span></div>` : ""}
    <div class="row"><span class="k">Guest of</span><span class="v">${esc([p.visitor_name, p.unit_number && `Unit ${p.unit_number}`].filter(Boolean).join(" · ") || "—")}</span></div>
    <div class="valid">${esc(validLine)}</div>
    <div class="foot"><span>Pass #${esc(p.pass_number)}</span><span>${p.issued_by ? "Issued by " + esc(p.issued_by) : ""}</span></div>
  </div>`
}

export function printPass(p: PassData): void {
  const inner = p.pass_type === "vehicle" ? vehicleCard(p) : visitorCard(p)
  const w = window.open("", "_blank", "width=640,height=560")
  if (!w) { alert("Please allow pop-ups to print the pass."); return }
  w.document.write(shell(`${p.pass_type === "vehicle" ? "Parking" : "Visitor"} Pass ${p.pass_number}`, inner))
  w.document.close(); w.focus()
  setTimeout(() => w.print(), 250)
}
