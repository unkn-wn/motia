import React, { memo, useState } from 'react';
import { CheckIcon, ClockIcon } from '@assets/icons';
import { formatTimeAgo } from '@utils/timeUtils';

interface SaveStatusProps {
  saving: boolean;
  lastSavedAt: Date | null;
  onClick?: () => void;
  hasUnsavedChanges?: boolean;
}

const SaveStatusComponent: React.FC<SaveStatusProps> = ({ saving, lastSavedAt, onClick, hasUnsavedChanges = false }) => {
  const [hover, setHover] = useState(false);
  const timeAgo = lastSavedAt ? formatTimeAgo(lastSavedAt) : null;

  // Determine status message
  const getStatusMessage = () => {
    if (saving) return 'Saving…';
    // if (hasUnsavedChanges) return 'Unsaved changes - last saved ' + (timeAgo ? timeAgo : 'a while ago');
    if (timeAgo) return `Saved ${timeAgo}`;
    return 'Not saved yet';
  };

  return (
    <div className="relative select-none">
      <button
        type="button"
        className={`h-5 w-5 rounded-full grid place-items-center transition-colors ${
          saving ? 'bg-neutral-700/50 animate-pulse' : 'bg-transparent hover:bg-neutral-800/50'
        } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
        aria-live="polite"
        aria-label={getStatusMessage()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={onClick}
        disabled={!onClick}
      >
        {saving ? (
          <div className="h-2.5 w-2.5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
        ) : hasUnsavedChanges ? (
          <ClockIcon className="w-3 h-3 text-yellow-500" />
        ) : (
          <CheckIcon className="w-3 h-3 text-neutral-400" />
        )}
      </button>
      {hover && (
        <div className="pointer-events-none absolute left-0 top-full mt-1 px-2 py-1 rounded-md text-xs bg-neutral-800/95 text-neutral-200 border border-neutral-700 whitespace-nowrap z-50">
          {getStatusMessage()}
        </div>
      )}
    </div>
  );
};

export const SaveStatus = memo(SaveStatusComponent);
