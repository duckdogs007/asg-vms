"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/supabaseClient"

export default function LoginPage() {

  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        setError(error.message)
      } else if (data.session) {
        // Sign-on flow: officer must confirm their post for this shift.
        // The confirm page saves the assignment + localStorage and then
        // routes admin → /admin, everyone else → /vms.
        window.location.href = "/confirm-location"
      } else {
        setError("Login failed — no session returned")
      }
    } catch (err: any) {
      setError(err.message || "Unexpected error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="bg-white p-10 rounded-xl shadow-lg w-full max-w-[420px] text-center">

        <div className="text-2xl font-bold text-blue-800 leading-tight">American Security Group</div>
        <div className="text-[11px] text-gray-500 uppercase tracking-widest mt-1 mb-3">Integrated Property Solutions</div>
        <h2 className="text-base font-semibold text-gray-900 mb-1">Visitor Management System</h2>
        <p className="text-sm text-gray-500 mb-6">Sign in to continue</p>

        <form onSubmit={handleLogin} className="flex flex-col gap-3">

          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            autoFocus
            className="px-3 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
          />

          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="px-3 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
          />

          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-3 py-2.5 rounded-md text-left">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="py-3 bg-blue-800 hover:bg-blue-900 text-white font-bold rounded-md text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>

        </form>
      </div>
    </div>
  )
}
