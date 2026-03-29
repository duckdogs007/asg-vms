"use client"

export default function Button({
  children,
  onClick,
  color = "#1e40af"
}: {
  children: React.ReactNode
  onClick?: () => void
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "12px 20px",
        background: color,
        color: "white",
        border: "none",
        borderRadius: "8px",
        fontSize: "15px",
        cursor: "pointer"
      }}
    >
      {children}
    </button>
  )
}