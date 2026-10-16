import { memo, useCallback, useRef, useState } from 'react';
import { Menu } from 'lucide-react';
import { useDismiss, useDockFit } from '@/hooks/useDockFit';
import AddNoteButton from './AddNoteButton';
import AddFrameButton from './AddFrameButton';
import DrawingModeButton from './DrawingModeButton';
// (selection / eraser buttons will reuse simple unicode placeholders for now)
import ShortcutsButton from './ShortcutsButton';
import ProfileButton from './ProfileButton.tsx';
import HomeButton from './HomeButton';
import UndoButton from './UndoButton';
import RedoButton from './RedoButton';
import SelectToolButton from './SelectToolButton';
import EraseToolButton from './EraseToolButton';

interface FloatingDockProps {
  onAddNote: () => void;
  onAddFrame: () => void;
  onShowShortcuts: () => void;
  canAddNote: boolean;
  isDrawingMode: boolean; // legacy
  onToggleDrawingMode: () => void; // toggles draw tool
  onSelectMode?: () => void;
  onEraseMode?: () => void;
  toolMode?: 'draw' | 'select' | 'erase' | null;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onOpenProfile?: () => void;
  onGoHome?: () => void;
  disableGoHome?: boolean;
}

// 1/12 of the viewport from the top (the frame editor's dock sits at the same place), under the title bar
const DOCK_TOP = 'max(calc(100dvh / 12), 3rem)';
const DOCK_SIZES = [44];
/** A dock button (p-3 around a 20 px icon) and the space between buttons (space-y-3). */
const BUTTON_PX = 44;
const GAP_PX = 12;

// Main FloatingDock - isolated from currentTime updates
// Only rerenders when canAddNote or isDrawingMode change
const FloatingDock = memo<FloatingDockProps>(({
  onAddNote,
  onAddFrame,
  onShowShortcuts,
  canAddNote,
  // isDrawingMode retained for backward compatibility but unused when toolMode provided
  onToggleDrawingMode,
  onSelectMode,
  onEraseMode,
  toolMode,
  onUndo,
  onRedo,
  canUndo = true,
  canRedo = true,
  onOpenProfile,
  onGoHome,
  disableGoHome,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  // Everything when it fits above the audio controls. Otherwise (and always on phones) collapsed: adding, the tools
  // and undo/redo with the rest in a menu — or, when even that doesn't fit (landscape phones), adding, the active
  // tool and a menu with everything else.
  const hasTools = canAddNote && !!onToggleDrawingMode;
  const phoneButtons = (canAddNote ? 2 : 0) + (hasTools ? 3 : 0) + (onUndo ? 1 : 0) + (onRedo ? 1 : 0) + 1;
  // Buttons, the gaps between them and one divider, padding and border (p-1, border-2)
  const phoneHeight = phoneButtons * BUTTON_PX + phoneButtons * GAP_PX + 2 + 12;
  const level = useDockFit(
    ref,
    DOCK_SIZES,
    () => document.querySelector('[data-audio-controls]')?.getBoundingClientRect().top ?? window.innerHeight,
    [phoneHeight]
  );
  const collapsed = level >= DOCK_SIZES.length;
  // Collapsed with the tools and undo/redo out (phone), or only the active tool (minimal)
  const minimal = level > DOCK_SIZES.length;
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useDismiss(ref, menuOpen, closeMenu);
  // An item picked from the menu closes it
  const fromMenu = (fn?: () => void) => (fn ? () => { closeMenu(); fn(); } : undefined);

  const tools = (inMenu: boolean) =>
    canAddNote && onToggleDrawingMode ? (
      <>
        {onSelectMode && (!minimal || inMenu || toolMode === 'select') && (
          <SelectToolButton active={toolMode === 'select'} onClick={inMenu ? fromMenu(onSelectMode)! : onSelectMode} />
        )}
        {(!minimal || inMenu || toolMode === 'draw') && (
          <DrawingModeButton isDrawingMode={toolMode === 'draw'} onToggleDrawingMode={inMenu ? fromMenu(onToggleDrawingMode)! : onToggleDrawingMode} />
        )}
        {onEraseMode && (!minimal || inMenu || toolMode === 'erase') && (
          <EraseToolButton active={toolMode === 'erase'} onClick={inMenu ? fromMenu(onEraseMode)! : onEraseMode} />
        )}
      </>
    ) : null;

  return (
    <div
      ref={ref}
      className="fixed left-6 z-20 flex flex-col space-y-3 bg-neutral-800 border-2 border-neutral-600/20 p-1 rounded-full shadow-lg"
      style={{ top: DOCK_TOP }}
      data-level={collapsed ? 'collapsed' : 'full'}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Add Note Button - only show when audio is loaded */}
      {canAddNote && <AddNoteButton onAddNote={onAddNote} />}
      {canAddNote && <AddFrameButton onAddFrame={onAddFrame} />}

      {/* Tools: all of them, or (minimal) only the active one */}
      {tools(false)}

      {collapsed ? (
        <>
        {minimal ? null : (
          <>
            <div className='border-t-2 border-neutral-600/20 rounded-full' />
            {onUndo && <UndoButton onUndo={onUndo} disabled={!canUndo} />}
            {onRedo && <RedoButton onRedo={onRedo} disabled={!canRedo} />}
          </>
        )}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className={`text-white rounded-full p-3 shadow-md cursor-pointer ${menuOpen ? 'bg-neutral-600' : 'bg-neutral-800 hover:bg-neutral-700'}`}
            title="More"
            aria-label="More"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <Menu className="w-5 h-5" />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              aria-label="More"
              className={`absolute left-full top-0 ml-4 grid w-max ${minimal ? 'grid-cols-4' : 'grid-cols-3'} gap-2 rounded-3xl border-2 border-neutral-600/20 bg-neutral-800 p-2 shadow-lg`}
            >
              {minimal ? (
                <>
                  {tools(true)}
                  {onUndo && <UndoButton onUndo={fromMenu(onUndo)!} disabled={!canUndo} />}
                  {onRedo && <RedoButton onRedo={fromMenu(onRedo)!} disabled={!canRedo} />}
                </>
              ) : null}
              {onGoHome && <HomeButton onGoHome={fromMenu(onGoHome)!} disabled={disableGoHome} />}
              {onOpenProfile && <ProfileButton onOpenProfile={fromMenu(onOpenProfile)!} />}
              <ShortcutsButton onShowShortcuts={fromMenu(onShowShortcuts)!} />
            </div>
          ) : null}
        </div>
        </>
      ) : (
        <>
          <div className='border-t-2 border-neutral-600/20 rounded-full' />

          {/* Undo/Redo Buttons */}
          {(onUndo || onRedo) && (
            <div className="flex flex-col space-y-3">
              {onUndo && <UndoButton onUndo={onUndo} disabled={!canUndo} />}
              {onRedo && <RedoButton onRedo={onRedo} disabled={!canRedo} />}
              <div className='border-t-2 border-neutral-600/20 rounded-full' />
            </div>
          )}

          {/* Settings cluster */}
          {(onOpenProfile || onGoHome) && (
            <div className="flex flex-col space-y-3">
              {onGoHome && <HomeButton onGoHome={onGoHome} disabled={disableGoHome} />}
              {onOpenProfile && <ProfileButton onOpenProfile={onOpenProfile} />}
            </div>
          )}

          {/* Keyboard Shortcuts Button */}
          <ShortcutsButton onShowShortcuts={onShowShortcuts} />
        </>
      )}
    </div>
  );
});

FloatingDock.displayName = 'FloatingDock';

export default FloatingDock;
