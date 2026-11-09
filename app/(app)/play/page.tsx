"use client"

import { useRouter } from "next/navigation"
import { PlayMode } from "@/components/editor/play-mode"

export default function PlayPage() {
  const router = useRouter()
  return <PlayMode onExit={() => router.push("/")} />
}
