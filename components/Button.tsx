"use client"

type Variant = "primary" | "danger" | "success" | "dark" | "gray"

interface ButtonProps {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: Variant
  type?: "button" | "submit" | "reset"
  fullWidth?: boolean
}

const variantClass: Record<Variant, string> = {
  primary: "bg-blue-800 hover:bg-blue-900",
  danger:  "bg-red-700 hover:bg-red-800",
  success: "bg-green-600 hover:bg-green-700",
  dark:    "bg-gray-800 hover:bg-gray-900",
  gray:    "bg-gray-500 hover:bg-gray-600",
}

export default function Button({
  children,
  onClick,
  disabled = false,
  variant = "primary",
  type = "button",
  fullWidth = false,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`
        px-4 py-3 rounded-lg text-white font-medium text-sm cursor-pointer border-none
        transition-colors disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClass[variant]}
        ${fullWidth ? "w-full" : ""}
      `}
    >
      {children}
    </button>
  )
}
