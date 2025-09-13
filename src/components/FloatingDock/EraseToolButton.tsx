import { memo } from 'react';
import { EraserIcon } from '@assets/icons';

interface EraseToolButtonProps {
  active: boolean;
  onClick: () => void;
}

// Standalone Eraser Tool button
const EraseToolButton = memo<EraseToolButtonProps>(({ active, onClick }) => (
  <button
    onClick={onClick}
    className={`text-white rounded-full p-3 shadow-md transition-all duration-300 cursor-pointer ${active ? 'bg-blue-600 hover:bg-blue-700' : 'bg-neutral-800 hover:bg-neutral-700'}`}
    title={active ? 'Eraser tool active' : 'Eraser tool - drag over strokes to erase'}
  >
    <EraserIcon className="w-5 h-5" />
  </button>
));

EraseToolButton.displayName = 'EraseToolButton';

export default EraseToolButton;
