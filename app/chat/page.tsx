"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"
import type { RealtimeChannel } from "@supabase/supabase-js"

type Message = {
  id: string
  user_email: string
  user_name: string
  community_id: string | null
  message: string
  created_at: string
}

type OnlineUser = {
  user_email: string
  user_name: string
  community_id: string | null
  community_name: string | null
}

export default function ChatPage() {
  const [userEmail,      setUserEmail]      = useState("")
  const [userName,       setUserName]       = useState("")
  const [userId,         setUserId]         = useState("")
  const [communityId,    setCommunityId]    = useState<string | null>(null)
  const [communityName,  setCommunityName]  = useState<string | null>(null)

  const [activeChannel,  setActiveChannel]  = useState<"global" | string>("global")
  const [messages,       setMessages]       = useState<Message[]>([])
  const [onlineUsers,    setOnlineUsers]    = useState<OnlineUser[]>([])
  const [draft,          setDraft]          = useState("")
  const [sending,        setSending]        = useState(false)
  const [loading,        setLoading]        = useState(true)

  const bottomRef     = useRef<HTMLDivElement>(null)
  const presenceRef   = useRef<RealtimeChannel | null>(null)
  const msgChannelRef = useRef<RealtimeChannel | null>(null)
  const textareaRef   = useRef<HTMLTextAreaElement>(null)

  // --- Init user + community ---
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const email = user.email || ""
      const name  = email.split("@")[0].replace(/\./g, " ").replace(/\b\w/g, c => c.toUpperCase())
      setUserEmail(email)
      setUserName(name)
      setUserId(user.id)

      const { data: assign } = await supabase
        .from("user_assignments")
        .select("community_id, communities(name)")
        .eq("user_id", user.id)
        .maybeSingle()

      if (assign?.community_id) {
        setCommunityId(assign.community_id)
        const communities = assign.communities as unknown as { name: string } | null
        setCommunityName(communities?.name ?? null)
      }
    })
  }, [])

  // Mark messages as read on page visit
  useEffect(() => {
    localStorage.setItem("asg-chat-last-read", new Date().toISOString())
    // Notify TopNav to clear badge
    window.dispatchEvent(new Event("chat-read"))
  }, [])

  // --- Load messages for active channel ---
  const loadMessages = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from("chat_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(200)

    if (activeChannel === "global") {
      q = q.is("community_id", null)
    } else {
      q = q.eq("community_id", activeChannel)
    }

    const { data } = await q
    setMessages(data || [])
    setLoading(false)
  }, [activeChannel])

  useEffect(() => { loadMessages() }, [loadMessages])

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // --- Realtime: new messages ---
  useEffect(() => {
    if (msgChannelRef.current) {
      supabase.removeChannel(msgChannelRef.current)
    }

    const ch = supabase
      .channel(`chat-messages-${activeChannel}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const msg = payload.new as Message
          const isGlobal    = activeChannel === "global" && msg.community_id === null
          const isCommunity = activeChannel !== "global" && msg.community_id === activeChannel
          if (isGlobal || isCommunity) {
            setMessages(prev => [...prev, msg])
          }
        }
      )
      .subscribe()

    msgChannelRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [activeChannel])

  // --- Presence ---
  useEffect(() => {
    if (!userEmail) return

    if (presenceRef.current) supabase.removeChannel(presenceRef.current)

    const ch = supabase.channel("asg-presence", {
      config: { presence: { key: userEmail } },
    })

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<OnlineUser>()
      const users: OnlineUser[] = Object.values(state).flatMap(p => p as OnlineUser[])
      setOnlineUsers(users)
    })

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({
          user_email:     userEmail,
          user_name:      userName,
          community_id:   communityId,
          community_name: communityName,
        })
      }
    })

    presenceRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [userEmail, userName, communityId, communityName])

  // --- Send message ---
  async function sendMessage() {
    const text = draft.trim()
    if (!text || !userEmail || sending) return
    setSending(true)
    await supabase.from("chat_messages").insert({
      user_email:   userEmail,
      user_name:    userName,
      community_id: activeChannel === "global" ? null : activeChannel,
      message:      text,
    })
    setDraft("")
    setSending(false)
    textareaRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // --- Helpers ---
  function formatTime(ts: string) {
    return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  }

  function formatDate(ts: string) {
    const d     = new Date(ts)
    const today = new Date()
    const yest  = new Date(today); yest.setDate(yest.getDate() - 1)
    if (d.toDateString() === today.toDateString()) return "Today"
    if (d.toDateString() === yest.toDateString())  return "Yesterday"
    return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
  }

  function initials(name: string) {
    return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
  }

  const channelLabel    = activeChannel === "global" ? "All ASG" : (communityName ?? "Community")
  const onlineMyCommunity = onlineUsers.filter(u => u.community_id === communityId)
  const onlineOther       = onlineUsers.filter(u => u.community_id !== communityId || !communityId)

  return (
    <div className="flex" style={{ height: "calc(100vh - 57px)" }}>

      {/* LEFT: Users Online — hidden on mobile */}
      <div className="hidden sm:flex w-48 flex-shrink-0 bg-white border-r border-gray-200 flex-col overflow-hidden">
        <div className="px-3 py-3 border-b border-gray-100">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Online Now</div>
          <div className="text-xs text-gray-500 mt-0.5 font-medium">{onlineUsers.length} active</div>
        </div>

        <div className="flex-1 overflow-y-auto py-2 space-y-0.5">
          {onlineUsers.length === 0 ? (
            <div className="px-3 py-4 text-xs text-gray-400 text-center">
              <div className="text-lg mb-1">👤</div>
              No one online
            </div>
          ) : (
            <>
              {communityId && onlineMyCommunity.length > 0 && (
                <>
                  <div className="px-3 pt-1 pb-0.5 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                    {communityName}
                  </div>
                  {onlineMyCommunity.map(u => (
                    <div key={u.user_email} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0"></span>
                      <span className={`text-xs truncate ${u.user_email === userEmail ? "font-semibold text-blue-700" : "text-gray-700"}`}>
                        {u.user_name}{u.user_email === userEmail ? " (you)" : ""}
                      </span>
                    </div>
                  ))}
                </>
              )}
              {onlineOther.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-0.5 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                    Other
                  </div>
                  {onlineOther.map(u => (
                    <div key={u.user_email} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0"></span>
                      <div className="min-w-0">
                        <div className={`text-xs truncate ${u.user_email === userEmail ? "font-semibold text-blue-700" : "text-gray-700"}`}>
                          {u.user_name}{u.user_email === userEmail ? " (you)" : ""}
                        </div>
                        {u.community_name && (
                          <div className="text-[9px] text-gray-400 truncate">{u.community_name}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* RIGHT: Chat area */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50">

        {/* Channel tabs */}
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2">
          <button
            onClick={() => setActiveChannel("global")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors border-none cursor-pointer ${
              activeChannel === "global"
                ? "bg-blue-800 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            🌐 All ASG
          </button>
          {communityId && (
            <button
              onClick={() => setActiveChannel(communityId)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors border-none cursor-pointer ${
                activeChannel === communityId
                  ? "bg-blue-800 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              🏢 {communityName}
            </button>
          )}
          <span className="ml-auto text-xs text-gray-400 font-mono hidden sm:inline"># {channelLabel}</span>
          {onlineUsers.length > 0 && (
            <span className="ml-auto sm:hidden text-xs text-green-700 font-semibold">{onlineUsers.length} online</span>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">
              Loading messages…
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <div className="text-3xl mb-2">💬</div>
              <div className="text-sm font-medium text-gray-500">No messages yet in # {channelLabel}</div>
              <div className="text-xs text-gray-400 mt-1">Be the first to say something.</div>
            </div>
          ) : (() => {
            let lastDate  = ""
            let lastEmail = ""
            return messages.map((msg) => {
              const msgDate   = formatDate(msg.created_at)
              const showDate  = msgDate !== lastDate
              const isSelf    = msg.user_email === userEmail
              const isGrouped = msg.user_email === lastEmail && !showDate
              lastDate  = msgDate
              lastEmail = msg.user_email

              return (
                <div key={msg.id}>
                  {showDate && (
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">{msgDate}</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                  )}
                  <div className={`flex gap-2.5 ${isGrouped ? "mt-0.5" : "mt-3"}`}>
                    {isGrouped ? (
                      <div className="w-8 flex-shrink-0" />
                    ) : (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 mt-0.5 ${
                        isSelf ? "bg-blue-700" : "bg-gray-500"
                      }`}>
                        {initials(msg.user_name)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      {!isGrouped && (
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className={`text-xs font-semibold ${isSelf ? "text-blue-700" : "text-gray-900"}`}>
                            {msg.user_name}{isSelf ? " (you)" : ""}
                          </span>
                          <span className="text-[10px] text-gray-400">{formatTime(msg.created_at)}</span>
                        </div>
                      )}
                      <div className="text-sm text-gray-800 leading-relaxed break-words whitespace-pre-wrap">
                        {msg.message}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          })()}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="bg-white border-t border-gray-200 px-4 py-3">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={e => {
                setDraft(e.target.value)
                const el = e.target
                el.style.height = "auto"
                el.style.height = Math.min(el.scrollHeight, 120) + "px"
              }}
              onKeyDown={handleKeyDown}
              placeholder={`Message # ${channelLabel}…`}
              rows={1}
              disabled={!userEmail}
              className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
              style={{ minHeight: 44, maxHeight: 120 }}
            />
            <button
              onClick={sendMessage}
              disabled={!draft.trim() || sending || !userEmail}
              className="px-4 bg-blue-800 text-white text-sm font-semibold rounded-lg border-none cursor-pointer hover:bg-blue-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0 self-end"
              style={{ height: 44 }}
            >
              {sending ? "…" : "Send"}
            </button>
          </div>
          <div className="text-[10px] text-gray-400 mt-1">Enter to send · Shift+Enter for new line</div>
        </div>

      </div>
    </div>
  )
}
