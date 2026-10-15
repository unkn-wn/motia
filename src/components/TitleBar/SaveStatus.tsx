import React, { memo, useState } from 'react';
import { CheckIcon, ClockIcon } from '@assets/icons';
import { formatTimeAgo } from '@utils/timeUtils';
import { SIZE_WARN_BYTES } from '@/lib/notesPayload';

interface SaveStatusProps {
  saving: boolean;
  lastSavedAt: Date | null;
  onClick?: () => void;
  hasUnsavedChanges?: boolean;
  /** Size of the project's saved data (the store allows about 1 MB). */
  payloadBytes?: number | null;
  storyboardHeld?: boolean;
  /** The stored board could not be read; it is left untouched and edits to it are not saved. */
  storyboardUnreadable?: boolean;
}

const formatKB = (bytes: number) => `${Math.round(bytes / 1000)} KB`;

const SaveStatusComponent: React.FC<SaveStatusProps> = ({ saving, lastSavedAt, onClick, hasUnsavedChanges = false, payloadBytes = null, storyboardHeld = false, storyboardUnreadable = false }) => {
  const [hover, setHover] = useState(false);
  const timeAgo = lastSavedAt ? formatTimeAgo(lastSavedAt) : null;
  const sizeText = payloadBytes !== null ? `${formatKB(payloadBytes)} of 1 MB` : null;
  const nearLimit = payloadBytes !== null && payloadBytes >= SIZE_WARN_BYTES;

  // Determine status message
  const getStatusMessage = () => {
    if (saving) return 'Saving…';
    // if (hasUnsavedChanges) return 'Unsaved changes - last saved ' + (timeAgo ? timeAgo : 'a while ago');
    if (timeAgo) return sizeText ? `Saved ${timeAgo} · ${sizeText}` : `Saved ${timeAgo}`;
    return 'Not saved yet';
  };

  return (
    <div className="relative select-none flex items-center gap-2">
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
      {storyboardUnreadable ? (
        <span role="status" className="rounded-md bg-red-900/80 text-red-100 text-xs px-2 py-0.5 whitespace-nowrap">
          This board couldn't be read, so changes to it won't be saved. Notes still save.
        </span>
      ) : storyboardHeld ? (
        <span role="status" className="rounded-md bg-red-900/80 text-red-100 text-xs px-2 py-0.5 whitespace-nowrap">
          Board too big to save ({sizeText}). Notes still save; remove frames or pen strokes to save the board again.
        </span>
      ) : nearLimit ? (
        <span role="status" className="text-xs text-amber-400 whitespace-nowrap">{sizeText}</span>
      ) : null}
      {hover && (
        <div className="pointer-events-none absolute left-0 top-full mt-1 px-2 py-1 rounded-md text-xs bg-neutral-800/95 text-neutral-200 border border-neutral-700 whitespace-nowrap z-50">
          {getStatusMessage()}
        </div>
      )}
    </div>
  );
};

export const SaveStatus = memo(SaveStatusComponent);
