"use client"

export default function SecurityAlert({ person, onClose }: any) {

  if (!person) return null

  const bannedDate =
    person.ban_date ||
    person.banned_date ||
    person.date_banned

  return (

    <div style={overlay}>

      <div style={panel}>

        <div style={header}>
          🚨 Security Alert
        </div>


        {/* Scrollable body */}
        <div style={body}>

          <div style={row}>
            <strong>Name:</strong> {person.first_name} {person.last_name}
          </div>

          {person.dob && (
            <div style={row}>
              <strong>DOB:</strong> {person.dob}
            </div>
          )}

          {person.race && (
            <div style={row}>
              <strong>Race:</strong> {person.race}
            </div>
          )}

          {person.sex && (
            <div style={row}>
              <strong>Sex:</strong> {person.sex}
            </div>
          )}

          {person.oln && (
            <div style={row}>
              <strong>Driver License:</strong> {person.oln}
            </div>
          )}

          {person.status && (
            <div style={row}>
              <strong>Status:</strong> {person.status}
            </div>
          )}

          {person.reason && (
            <div style={row}>
              <strong>Reason:</strong> {person.reason}
            </div>
          )}

          {bannedDate && (
            <div style={row}>
              <strong>Banned Date:</strong>{" "}
              {new Date(bannedDate).toLocaleDateString()}
            </div>
          )}

          {person.property && (
            <div style={row}>
              <strong>Property:</strong> {person.property}
            </div>
          )}

          {person.comments && (
            <div style={row}>
              <strong>Comments:</strong> {person.comments}
            </div>
          )}

          {person.notes && (
            <div style={row}>
              <strong>Notes:</strong> {person.notes}
            </div>
          )}

          {person.firearm_flag && (
            <div style={firearm}>
              🚨 FIREARM RELATED INCIDENT
            </div>
          )}

        </div>


        {/* Fixed bottom button */}
        <div style={footer}>
          <button onClick={onClose} style={button}>
            Acknowledge
          </button>
        </div>

      </div>

    </div>

  )
}



const overlay: React.CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  width: "100%",
  height: "100%",
  display: "flex",
  justifyContent: "flex-end",
  background: "rgba(0,0,0,0.25)",
  zIndex: 9999
}



const panel: React.CSSProperties = {
  width: "420px",
  height: "100vh",
  background: "white",
  boxShadow: "-4px 0 12px rgba(0,0,0,0.35)",
  padding: "20px",
  display: "flex",
  flexDirection: "column"
}



const header: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: "bold",
  color: "#b91c1c",
  marginBottom: "15px"
}



const body: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "10px"
}



const footer: React.CSSProperties = {
  paddingTop: "15px",
  borderTop: "1px solid #e5e7eb"
}



const row: React.CSSProperties = {
  fontSize: "15px"
}



const firearm: React.CSSProperties = {
  marginTop: "15px",
  background: "#fee2e2",
  padding: "10px",
  borderRadius: "6px",
  color: "#b91c1c",
  fontWeight: "bold"
}



const button: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  background: "#1e3a8a",
  color: "white",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: "bold"
}