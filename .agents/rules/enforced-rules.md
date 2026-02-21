---
trigger: always_on
description: Critical implementation notes and constraints for the motia codebase
---

# WaveformPlayer Architecture Notes

## Context Value Memoization (CRITICAL)

PROJECT IS DEPLOYED. FIREBASE CHANGES WILL AFFECT USERS

The `WaveformPlayer/index.tsx` context value is wrapped in `useMemo` with an explicit dependency array. **When adding ANY new state variable to the context:**

1. Add it to the `useMemo` dependency array (around line 520+)
2. The `eslint-disable react-hooks/exhaustive-deps` comment suppresses the lint that would normally catch missing deps
3. Forgetting a dep causes **silent stale state** in all context consumers — extremely hard to debug

## Immutability Invariant

Several performance optimizations rely on React/Firebase immutability patterns:

- `useCanvasRenderer.tsx` decompression cache uses `===` reference identity on `note.drawing.compressed` instead of deep comparison
- Cache cleanup in `renderCanvas()` is guarded by `notes !== lastNotesRef.current` (reference check)
- **NEVER mutate `compressed` arrays, `notes` arrays, or drawing payloads in-place.** Always produce new objects/arrays via spread, `map()`, `filter()`, etc.
- If you violate this, strokes will render stale data and cache cleanup won't run

## Canvas Sizing via ResizeObserver

- `useCanvasRenderer.tsx` uses a `ResizeObserver` on the canvas element to track size without per-frame `getBoundingClientRect()` (which causes forced reflows)
- The observer is set up in a `useEffect` with `[canvasRef]` as deps — since `canvasRef` is a stable ref object, the effect only runs once
- If the canvas is conditionally rendered (mounted later), the observer may not attach. A first-frame fallback checks for `{w: 0, h: 0}` and falls back to `getBoundingClientRect()` once

## Touch vs Mouse Event Handling

The WaveformPlayer has **separate event paths** for mouse and touch:

- **Mouse:** `WaveformCanvas.tsx` (`onMouseDown/Move/Up`) → `useGlobalMouseHandlers.tsx` (global `mouseup` finalization)
- **Touch:** `usePointerInteractions.tsx` (`onPointerDown/Move/Up`) — self-contained, does NOT rely on global mouse handlers
- The global `mouseup` handler in `useGlobalMouseHandlers.tsx` has a guard: `if (e.pointerType === 'mouse') return;` — this means it processes touch-originated synthetic mouseup events but skips real mouse events to avoid double-processing
- **Selection finalization for touch** (setting `dragging: false`, calling `finalizeSelectionMove`) is handled entirely in `handlePointerUp` in `usePointerInteractions.tsx`
- Touch selection creation is **deferred** via `pendingSelectionCreateRef` to allow the second finger of a pinch gesture to arrive before committing to a new selection

## Selection Tool Touch Gestures

| Gesture | Handler Location | Behavior |
|---|---|---|
| Tap outside selection | `handlePointerUp` in `usePointerInteractions.tsx` | Clears selection box + groups via deferred pending check |
| Tap inside selection | `handlePointerUp` in `usePointerInteractions.tsx` | Toggles `showSelectionActions` (delete popup) |
| Drag outside (1 finger) | `handlePointerMove` promotes `pendingSelectionCreateRef` | Creates new selection |
| 2-finger pinch/pan | `handlePointerDown` (2-pointer block) | Clears pending, sets `dragging: false`, preserves selection |
| Drag inside selection | Normal `handleSelectionMove` | Moves selection box |

## Delete Popup (Mobile Only)

- Visibility controlled by `showSelectionActions` state in WaveformContext
- Toggled on tap-inside-selection (pointer up with < 6px displacement in move mode)
- Cleared on: delete action, new selection start, tool mode change, tap outside
- Positioned with `position: absolute` relative to the canvas parent (`absolute inset-0` div)
- The X offset includes a manual `-40` correction for centering (user-adjusted)

## Firebase / Data Flow

- Drawing strokes are stored as compressed payloads in `note.drawing.compressed`
- `decompressSession()` converts compressed strokes to renderable `DrawingStroke[]`
- Updates go through `onUpdateDrawing(id, drawing)` which handles Firebase persistence
- History (undo/redo) is managed by `@utils/history.ts` `HistoryManager` — `onUpdateDrawing` calls are automatically tracked
- FIREBASE SHOULD RARELY BE TOUCHED. PROJECT IS DEPLOYED. USER DATA WILL BE AFFECTED IF FIREBASE CALLS ARE MODIFIED.

## Testing Credentials

- Test account: `newuser@test.com` / `passwordpassword`
- Test project: `test.wav` (accessible after sign-in at `/projects`)
- The app requires authentication — direct navigation to a project URL redirects to login