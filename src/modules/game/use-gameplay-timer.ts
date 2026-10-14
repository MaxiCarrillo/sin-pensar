import { useEffect, useLayoutEffect, useState } from 'react'

interface GameplayTimerInput {
  startedAt: number
  deadline: number
  frozenAt: number | null
  onExpire: (now: number) => void
}

interface GameplayTimerClock {
  now: number
  startedAt: number
  deadline: number
  frozenAt: number | null
}

type GameplayTimerFacts = Omit<GameplayTimerClock, 'now'>

export function rebaseGameplayTimerClock(
  clock: GameplayTimerClock,
  facts: GameplayTimerFacts,
): GameplayTimerClock {
  if (
    clock.startedAt === facts.startedAt &&
    clock.deadline === facts.deadline &&
    clock.frozenAt === facts.frozenAt
  ) {
    return clock
  }

  const previousDisplayedNow = clock.frozenAt ?? clock.now
  const startedAtShift = facts.startedAt - clock.startedAt
  const deadlineShift = facts.deadline - clock.deadline
  const now =
    facts.frozenAt !== null
      ? facts.frozenAt
      : startedAtShift === deadlineShift
        ? previousDisplayedNow + deadlineShift
        : facts.startedAt

  return { ...facts, now }
}

export function getGameplayTimerPresentation(startedAt: number, deadline: number, now: number) {
  const duration = Math.max(1, deadline - startedAt)
  const remainingMilliseconds = Math.max(0, deadline - now)
  return {
    progress: Math.min(1, Math.max(0, (now - startedAt) / duration)),
    remainingSeconds: Math.ceil(remainingMilliseconds / 1_000),
  }
}

export function useGameplayTimer({
  startedAt,
  deadline,
  frozenAt,
  onExpire,
}: GameplayTimerInput) {
  const facts = { startedAt, deadline, frozenAt }
  const [clock, setClock] = useState<GameplayTimerClock>(() => ({
    ...facts,
    now: Date.now(),
  }))
  const synchronizedClock = rebaseGameplayTimerClock(clock, facts)

  useLayoutEffect(() => {
    // Persist shifted timer facts before paint so the next transition rebases from this frame.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClock((currentClock) =>
      rebaseGameplayTimerClock(currentClock, { startedAt, deadline, frozenAt }),
    )
  }, [deadline, frozenAt, startedAt])

  useEffect(() => {
    if (frozenAt !== null) return

    const reconcile = () => {
      const currentTime = Date.now()
      setClock({ startedAt, deadline, frozenAt, now: currentTime })
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
  }, [deadline, frozenAt, onExpire, startedAt])

  const displayedNow = frozenAt ?? synchronizedClock.now
  const { progress, remainingSeconds } = getGameplayTimerPresentation(
    startedAt,
    deadline,
    displayedNow,
  )
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
