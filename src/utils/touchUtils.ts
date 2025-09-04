export interface Point {
  x: number;
  y: number;
}

export const distanceBetween = (a: Point, b: Point): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
};

export const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

// Compute new scale clamped to [min,max] and return scaleChange
export const computePinchScale = (
  initialDistance: number,
  currentDistance: number,
  prevScale: number,
  min = 0.1,
  max = 3
) => {
  if (initialDistance <= 0) return { newScale: prevScale, scaleChange: 1 };
  const rawScale = prevScale * (currentDistance / initialDistance);
  const newScale = Math.max(min, Math.min(max, rawScale));
  return { newScale, scaleChange: newScale / prevScale };
};
