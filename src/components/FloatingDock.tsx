import React from 'react';
import { Plus, Settings, Pen } from 'lucide-react';

interface FloatingDockProps {
  onAddNote: () => void;
  onShowShortcuts: () => void;
  canAddNote?: boolean;
  currentTime?: number;
  isDrawingMode?: boolean;
  onToggleDrawingMode?: () => void;
}

const FloatingDock: React.FC<FloatingDockProps> = ({
  onAddNote,
  onShowShortcuts,
  canAddNote = false,
  currentTime = 0,
  isDrawingMode = false,
  onToggleDrawingMode
}) => {
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="fixed bottom-1/2 left-6 z-30 flex flex-col space-y-3 bg-neutral-800 border-2 border-neutral-600/20 p-1 rounded-full shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Add Note Button - only show when audio is loaded */}
      {canAddNote && (
        <button
          onClick={onAddNote}
          className="group bg-neutral-800 hover:bg-neutral-700 text-white rounded-full p-3 shadow-md transition-all duration-300"
          title={`Add note at current time (${formatTime(currentTime)}) - Press 'N' key`}
        >
          <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
        </button>
      )}

      {/* Drawing Mode Button - only show when audio is loaded */}
      {canAddNote && onToggleDrawingMode && (
        <button
          onClick={onToggleDrawingMode}
          className={`group ${
            isDrawingMode
              ? 'bg-blue-600 hover:bg-blue-700'
              : 'bg-neutral-800 hover:bg-neutral-700'
          } text-white rounded-full p-3 shadow-md transition-all duration-300`}
          title={isDrawingMode ? 'Exit drawing mode' : 'Enter drawing mode - Click and drag to draw'}
        >
          <Pen className={`w-5 h-5 transition-transform duration-300 ${
            isDrawingMode ? 'rotate-45' : 'group-hover:rotate-12'
          }`} />
        </button>
      )}

      {/* Keyboard Shortcuts Button */}
      <button
        onClick={onShowShortcuts}
        className="group bg-neutral-800 hover:bg-neutral-700 text-white rounded-full p-3 shadow-md transition-all duration-300"
        title="Keyboard Shortcuts"
      >
        <Settings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
      </button>
    </div>
  );
};

export default FloatingDock;
