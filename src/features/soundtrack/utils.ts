const SECONDS_PER_MINUTE = 60
const SECOND_DIGITS = 2
const TRACK_NUMBER_DIGITS = 2

export const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '0:00'

  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE)
  const remainder = Math.floor(seconds % SECONDS_PER_MINUTE)

  return `${minutes}:${String(remainder).padStart(SECOND_DIGITS, '0')}`
}

export const trackNumber = (index: number) => String(index + 1).padStart(TRACK_NUMBER_DIGITS, '0')

export const seekProgress = (currentTime: number, duration: number) => {
  const PERCENT = 100

  return `${duration ? (currentTime / duration) * PERCENT : 0}%`
}
