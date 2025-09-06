import { memo } from 'react';
import { RedoIcon } from '@assets/icons';

interface RedoButtonProps {
  onRedo: () => void;
  disabled?: boolean;
}

const RedoButton = memo<RedoButtonProps>(({ onRedo, disabled }) => (
  <button
    onClick={onRedo}
    disabled={disabled}
    className={`group cursor-pointer rounded-full p-3 shadow-md transition-all duration-300 text-white ${
      disabled ? 'bg-neutral-700 opacity-50 cursor-not-allowed' : 'bg-neutral-800 hover:bg-neutral-700'
    }`}
    title="Redo (Ctrl/Cmd+Shift+Z)"
  >
    <RedoIcon className="w-5 h-5 group-hover:rotate-12 transition-transform duration-300" />
  </button>
));

RedoButton.displayName = 'RedoButton';

export default RedoButton;
