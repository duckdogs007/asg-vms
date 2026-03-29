export function cleanWatchlistRow(row:any){

  return {
    property: row.property?.trim() || null,
    last_name: row.last_name?.trim() || null,
    first_name: row.first_name?.trim() || null,
    middle_name: row.middle_name?.trim() || null,
    race: row.race?.trim() || null,
    sex: row.sex?.trim() || null,

    dob: row.dob && row.dob.trim() !== "" ? row.dob : null,

    ssn: row.ssn?.toString().trim() || null,
    oln: row.oln?.trim() || null,

    banned_by: row.banned_by?.trim() || null,

    ban_date: row.ban_date && row.ban_date.trim() !== "" ? row.ban_date : null,

    status: row.status?.trim() || "ACTIVE",
    reason: row.reason?.trim() || null,
    comments: row.comments?.trim() || null
  }

}