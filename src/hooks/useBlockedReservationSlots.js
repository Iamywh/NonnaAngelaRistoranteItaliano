import { useEffect, useState } from 'react'
import { fetchBlockedReservationTimes } from '../lib/reservationSlotBlocks.js'

export function useBlockedReservationSlots(dateValue) {
  const [blockedTimes, setBlockedTimes] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let shouldIgnore = false

    const loadBlockedSlots = async () => {
      setError(null)

      if (!dateValue) {
        setBlockedTimes([])
        return
      }

      setIsLoading(true)

      try {
        const nextBlockedTimes = await fetchBlockedReservationTimes(dateValue)
        if (!shouldIgnore) setBlockedTimes(nextBlockedTimes)
      } catch (loadError) {
        console.warn('Blocked reservation slots unavailable:', loadError?.message || loadError)
        if (!shouldIgnore) {
          setBlockedTimes([])
          setError(loadError)
        }
      } finally {
        if (!shouldIgnore) setIsLoading(false)
      }
    }

    loadBlockedSlots()

    return () => {
      shouldIgnore = true
    }
  }, [dateValue])

  return { blockedTimes, isLoading, error }
}
