import { memo } from 'react';
import { PlusIcon } from '@assets/icons';

interface AddNoteButtonProps {
  onAddNote: () => void;
}

// Completely isolated Add Note Button - never rerenders unless function changes
const AddNoteButton = memo<AddNoteButtonProps>(({ onAddNote }) => (
  <button
    onClick={onAddNote}
    className="group cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-white rounded-full p-3 shadow-md transition-all duration-300"
    title="Add note at current time - Press 'N' key"
  >
    <PlusIcon className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
  </button>
));

AddNoteButton.displayName = 'AddNoteButton';

export default AddNoteButton;
