import { memo } from 'react';
import { UndoIcon } from '@assets/icons';

interface UndoButtonProps {
  onUndo: () => void;
  disabled?: boolean;
}

const UndoButton = memo<UndoButtonProps>(({ onUndo, disabled }) => (
  <button
    onClick={onUndo}
    disabled={disabled}
    className={`group cursor-pointer rounded-full p-3 shadow-md transition-all duration-300 text-white ${
      disabled ? 'bg-neutral-700 opacity-50 cursor-not-allowed' : 'bg-neutral-800 hover:bg-neutral-700'
    }`}
    title="Undo (Ctrl/Cmd+Z)"
  >
    <UndoIcon className="w-5 h-5 group-hover:-rotate-12 transition-transform duration-300" />
  </button>
));

UndoButton.displayName = 'UndoButton';

export default UndoButton;
