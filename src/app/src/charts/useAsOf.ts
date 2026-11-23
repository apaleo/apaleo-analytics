import { useState } from 'react'

function readClock(): Date {
  return new Date()
}

/** The mounted clock, or an explicit as-of date from a test or caller. */
export function useAsOf(asOf?: Date): Date {
  const [clock] = useState(readClock)
  return asOf ?? clock
}
