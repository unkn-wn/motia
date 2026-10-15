import { memo } from 'react';
import { FrameIcon } from '@assets/icons';

interface AddFrameButtonProps {
  onAddFrame: () => void;
}

// Adds a storyboard frame at the playhead and opens it
const AddFrameButton = memo<AddFrameButtonProps>(({ onAddFrame }) => (
  <button
    onClick={onAddFrame}
    className="group cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-white rounded-full p-3 shadow-md transition-all duration-300"
    title="Add frame at current time"
  >
    <FrameIcon className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
  </button>
));

AddFrameButton.displayName = 'AddFrameButton';

export default AddFrameButton;
