import { memo } from 'react';
import AddNoteButton from './AddNoteButton';
import DrawingModeButton from './DrawingModeButton';
import ShortcutsButton from './ShortcutsButton';
import UndoButton from './UndoButton';
import RedoButton from './RedoButton';

interface FloatingDockProps {
  onAddNote: () => void;
  onShowShortcuts: () => void;
  canAddNote: boolean;
  isDrawingMode: boolean;
  onToggleDrawingMode: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

// Main FloatingDock - isolated from currentTime updates
// Only rerenders when canAddNote or isDrawingMode change
const FloatingDock = memo<FloatingDockProps>(({
  onAddNote,
  onShowShortcuts,
  canAddNote,
  isDrawingMode,
  onToggleDrawingMode,
  onUndo,
  onRedo,
  canUndo = true,
  canRedo = true,
}) => {
  return (
    <div
      className="fixed bottom-1/2 left-6 z-30 flex flex-col space-y-3 bg-neutral-800 border-2 border-neutral-600/20 p-1 rounded-full shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Add Note Button - only show when audio is loaded */}
      {canAddNote && <AddNoteButton onAddNote={onAddNote} />}

      {/* Drawing Mode Button - only show when audio is loaded */}
      {canAddNote && onToggleDrawingMode && (
        <DrawingModeButton
          isDrawingMode={isDrawingMode}
          onToggleDrawingMode={onToggleDrawingMode}
        />
      )}

      <div className='border-t-2 border-neutral-600/20 rounded-full' />

      {/* Undo/Redo Buttons */}
      {(onUndo || onRedo) && (
        <div className="flex flex-col space-y-3">
          {onUndo && <UndoButton onUndo={onUndo} disabled={!canUndo} />}
          {onRedo && <RedoButton onRedo={onRedo} disabled={!canRedo} />}
          <div className='border-t-2 border-neutral-600/20 rounded-full' />
        </div>
      )}

      {/* Keyboard Shortcuts Button */}
      <ShortcutsButton onShowShortcuts={onShowShortcuts} />
    </div>
  );
});

FloatingDock.displayName = 'FloatingDock';

export default FloatingDock;
