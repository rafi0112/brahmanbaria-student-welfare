// The batch numbers people can choose, newest first. The list grows by itself each year (a new batch joins every year),
// so a fresh student can always find their batch: never fewer than 30, never more than the server accepts (60).
export function batchNumbers(now = new Date()) {
  const top = Math.min(60, Math.max(30, now.getFullYear() - 1996))
  return Array.from({ length: top }, (_, i) => top - i)
}

// This academic year's session and term, for example hints: "2026-27" (and "2026–27" for a committee term).
export function currentSession(now = new Date(), dash = '-') {
  const y = now.getFullYear()
  return `${y}${dash}${String((y + 1) % 100).padStart(2, '0')}`
}
