import { memo } from 'react';
import { SettingsIcon } from '@assets/icons';

interface ShortcutsButtonProps {
  onShowShortcuts: () => void;
}

// Completely stable shortcuts button
const ShortcutsButton = memo<ShortcutsButtonProps>(({ onShowShortcuts }) => (
  <button
    onClick={onShowShortcuts}
    className="group bg-neutral-800 hover:bg-neutral-700 text-white rounded-full p-3 shadow-md transition-all duration-300"
    title="Keyboard Shortcuts"
  >
    <SettingsIcon className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
  </button>
));

ShortcutsButton.displayName = 'ShortcutsButton';

export default ShortcutsButton;
