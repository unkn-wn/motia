import React, { memo } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@assets/icons';

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  textNotesCount: number;
}

const SidebarToggleComponent: React.FC<Props> = ({ open, setOpen, textNotesCount }) => {
  return (
    <button
      onClick={() => setOpen(!open)}
      className={`fixed top-20 -translate-y-1/2 z-30 bg-neutral-900 hover:bg-neutral-950 text-white p-2 cursor-pointer rounded-l-lg shadow-lg transition-all duration-300 ease-in-out ${open ? 'right-80' : 'right-0'}`}
      title={open ? 'Hide notes' : 'Show notes'}
    >
      <div className="flex items-center space-x-2">
        {open ? (
          <ChevronRightIcon className="w-4 h-4" />
        ) : (
          <ChevronLeftIcon className="w-4 h-4" />
        )}
        <span className="text-sm font-medium">{textNotesCount}</span>
      </div>
    </button>
  );
};

const SidebarToggle = memo(SidebarToggleComponent);
export default SidebarToggle;
