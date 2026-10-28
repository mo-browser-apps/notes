import * as React from "react"

/** The current time, refreshed every minute, so date groups roll over at midnight. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
