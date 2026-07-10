// Strip PostgREST filter metacharacters from user input before it is interpolated
// into a .or()/.ilike() filter string. Commas, parentheses and backslashes let a
// crafted term break out of an ilike value and inject extra filter conditions
// (PostgREST filter injection, CWE-943). RLS still bounds the rows, but this stops
// the query itself from being manipulated. Wildcards (% _) are left intact.
export function sanitizeFilterTerm(q: string | null | undefined): string {
  return (q || "").replace(/[,()\\]/g, "").trim()
}
