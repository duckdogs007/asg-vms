// Natural/numeric ordering for unit numbers so dropdowns read in the order an
// officer expects: 100-1A, 100-2A, 101-1A … and 2 before 10 (plain string sort
// puts "10" before "2"). Units come back from the DB in arbitrary order, which
// made long lists feel like units were "missing" because they weren't where
// they were expected.
export function compareUnitNumbers(a: string | null | undefined, b: string | null | undefined): number {
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" })
}

export function sortUnits<T extends { unit_number: string | null }>(units: T[]): T[] {
  return [...units].sort((x, y) => compareUnitNumbers(x.unit_number, y.unit_number))
}
