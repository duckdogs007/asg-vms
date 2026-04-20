"use client"

interface InputFieldProps {
  value?: string
  placeholder?: string
  type?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  autoFocus?: boolean
  disabled?: boolean
  id?: string
  name?: string
}

export default function InputField({
  value,
  placeholder,
  type = "text",
  onChange,
  onKeyDown,
  autoFocus,
  disabled,
  id,
  name,
}: InputFieldProps) {
  return (
    <input
      id={id}
      name={name}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      onKeyDown={onKeyDown}
      autoFocus={autoFocus}
      disabled={disabled}
      className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
    />
  )
}
