export const SWIPE_THRESHOLD_PX = 72

const VERTICAL_DOMINANCE_RATIO = 1.15

export type SwipeDecision = 'correct' | 'pass'

export function getKeyboardDecision(key: string, isRepeat: boolean): SwipeDecision | null {
  if (isRepeat) return null
  if (key === 'ArrowDown') return 'correct'
  if (key === 'ArrowUp') return 'pass'
  return null
}

export function getSwipeDecision(
  deltaX: number,
  deltaY: number,
  threshold = SWIPE_THRESHOLD_PX,
): SwipeDecision | null {
  const horizontalDistance = Math.abs(deltaX)
  const verticalDistance = Math.abs(deltaY)
  if (
    !Number.isFinite(deltaX) ||
    !Number.isFinite(deltaY) ||
    !Number.isFinite(threshold) ||
    threshold <= 0 ||
    verticalDistance < threshold ||
    verticalDistance <= horizontalDistance * VERTICAL_DOMINANCE_RATIO
  ) {
    return null
  }
  return deltaY > 0 ? 'correct' : 'pass'
}
