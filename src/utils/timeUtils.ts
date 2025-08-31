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
