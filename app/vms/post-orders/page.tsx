"use client"

import PostOrdersTab from "@/components/PostOrdersTab"

export default function PostOrdersPage() {
  return (
    <div className="p-4 sm:p-5 pb-16">
      <h2 className="text-2xl font-bold mb-5">Post Orders</h2>
      <PostOrdersTab />
    </div>
  )
}
