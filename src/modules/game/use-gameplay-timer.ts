import { useEffect, useState } from 'react'

interface GameplayTimerInput {
  startedAt: number
  deadline: number
  onExpire: (now: number) => void
}

export function useGameplayTimer({ startedAt, deadline, onExpire }: GameplayTimerInput) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const reconcile = () => {
      const currentTime = Date.now()
      setNow(currentTime)
      if (currentTime > deadline) onExpire(currentTime)
    }
    const timeoutId = window.setTimeout(reconcile, Math.max(0, deadline - Date.now() + 1))
    const cadenceId = window.setInterval(reconcile, 100)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') reconcile()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', reconcile)
    return () => {
      window.clearTimeout(timeoutId)
      window.clearInterval(cadenceId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', reconcile)
    }
  }, [deadline, onExpire])

  const duration = Math.max(1, deadline - startedAt)
  const remainingMilliseconds = Math.max(0, deadline - now)
  const remainingSeconds = Math.ceil(remainingMilliseconds / 1_000)
  const progress = Math.min(1, Math.max(0, (now - startedAt) / duration))
  const shouldAnnounce =
    remainingSeconds === 0 ||
    remainingSeconds <= 5 ||
    (remainingSeconds > 0 && remainingSeconds % 10 === 0)

  return {
    progress,
    remainingSeconds,
    liveAnnouncement: shouldAnnounce ? `Quedan ${remainingSeconds} segundos.` : '',
  }
}
