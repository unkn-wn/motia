import { memo } from 'react';
import { PenIcon } from '@assets/icons';

interface DrawingModeButtonProps {
  isDrawingMode: boolean;
  onToggleDrawingMode: () => void;
}

// Only rerenders when isDrawingMode changes
const DrawingModeButton = memo<DrawingModeButtonProps>(
  ({ isDrawingMode, onToggleDrawingMode }) => (
    <button
      onClick={onToggleDrawingMode}
      className={`group ${isDrawingMode
          ? 'bg-blue-600 hover:bg-blue-700'
          : 'bg-neutral-800 hover:bg-neutral-700'
        } text-white rounded-full p-3 shadow-md transition-all duration-300 cursor-pointer`}
      title={isDrawingMode ? 'Exit drawing mode' : 'Enter drawing mode - Click and drag to draw'}
    >
      <PenIcon className={`w-5 h-5 transition-transform duration-300 ${isDrawingMode ? 'rotate-45' : 'group-hover:rotate-12'
        }`} />
    </button>
  )
);

DrawingModeButton.displayName = 'DrawingModeButton';

export default DrawingModeButton;
