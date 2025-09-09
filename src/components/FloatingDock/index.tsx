import { memo } from 'react';
import AddNoteButton from './AddNoteButton';
import DrawingModeButton from './DrawingModeButton';
import ShortcutsButton from './ShortcutsButton';
import ProfileButton from './ProfileButton.tsx';
import HomeButton from './HomeButton';
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
  onOpenProfile?: () => void;
  onGoHome?: () => void;
  disableGoHome?: boolean;
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
  onOpenProfile,
  onGoHome,
  disableGoHome,
}) => {
  return (
    <div
      className="fixed top-1/12 left-6 z-30 flex flex-col space-y-3 bg-neutral-800 border-2 border-neutral-600/20 p-1 rounded-full shadow-lg"
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

      {/* Settings cluster */}
      {(onOpenProfile || onGoHome) && (
        <div className="flex flex-col space-y-3">
          {onOpenProfile && <ProfileButton onOpenProfile={onOpenProfile} />}
          {onGoHome && <HomeButton onGoHome={onGoHome} disabled={disableGoHome} />}
        </div>
      )}
    </div>
  );
});

FloatingDock.displayName = 'FloatingDock';

export default FloatingDock;
