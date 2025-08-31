/**
 * Color utilities for notes and UI components
 */

export const NOTE_COLORS = ['yellow', 'blue', 'green', 'pink', 'purple'] as const;

export type NoteColor = typeof NOTE_COLORS[number];

/**
 * Maps color names to hex color codes
 */
export const getColorCode = (color: string): string => {
  const colorMap: Record<string, string> = {
    yellow: '#eab308',
    blue: '#3b82f6',
    green: '#22c55e',
    pink: '#ec4899',
    purple: '#a855f7'
  };
  return colorMap[color] || colorMap.blue;
};

/**
 * Maps color names to Tailwind CSS border classes
 */
export const getColorClasses = (color: string): string => {
  const colorMap: Record<string, string> = {
    yellow: 'border-yellow-500',
    blue: 'border-blue-500',
    green: 'border-green-500',
    pink: 'border-pink-500',
    purple: 'border-purple-500',
  };
  return colorMap[color] || colorMap.blue;
};

/**
 * Gets the background color style for color picker buttons
 */
export const getColorPickerStyle = (color: string): string => {
  const colorMap: Record<string, string> = {
    yellow: '#fbbf24',
    blue: '#3b82f6',
    green: '#10b981',
    pink: '#ec4899',
    purple: '#8b5cf6'
  };
  return colorMap[color] || colorMap.blue;
};
