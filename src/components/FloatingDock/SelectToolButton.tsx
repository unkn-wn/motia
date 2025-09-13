import { memo } from 'react';
import { SelectionIcon } from '@assets/icons';

interface SelectToolButtonProps {
  active: boolean;
  onClick: () => void;
}

// Standalone Select Tool button
const SelectToolButton = memo<SelectToolButtonProps>(({ active, onClick }) => (
  <button
    onClick={onClick}
    className={`text-white rounded-full p-3 shadow-md transition-all duration-300 cursor-pointer ${active ? 'bg-blue-600 hover:bg-blue-700' : 'bg-neutral-800 hover:bg-neutral-700'}`}
    title={active ? 'Selection tool active' : 'Selection tool - drag to box select drawings'}
  >
    <SelectionIcon className="w-5 h-5" />
  </button>
));

SelectToolButton.displayName = 'SelectToolButton';

export default SelectToolButton;
