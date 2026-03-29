"use client"

export default function InputField({
  value,
  placeholder,
  onChange
}: {
  value?: string
  placeholder?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      style={{
        padding: "10px",
        fontSize: "16px",
        border: "1px solid #ccc",
        borderRadius: "6px",
        width: "100%"
      }}
    />
  )
}