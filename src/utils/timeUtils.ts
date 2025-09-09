/**
 * Time formatting and manipulation utilities
 */

/**
 * Formats time in seconds to MM:SS format
 */
export const formatTime = (time: number): string => {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Converts time to progress ratio (0-1)
 */
export const timeToProgress = (time: number, duration: number): number => {
  return duration > 0 ? time / duration : 0;
};

/**
 * Converts progress ratio (0-1) to time
 */
export const progressToTime = (progress: number, duration: number): number => {
  return progress * duration;
};

/**
 * Clamps time value between 0 and duration
 */
export const clampTime = (time: number, duration: number): number => {
  return Math.max(0, Math.min(duration, time));
};

/**
 * Calculate how long ago
 */
export const formatTimeAgo = (date: Date): string => {
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
};
