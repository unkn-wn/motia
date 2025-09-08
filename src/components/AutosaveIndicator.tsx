import React, { memo } from 'react';
import { CheckIcon } from '@assets/icons';

const AutosaveIndicatorComponent: React.FC<{ saving: boolean; lastSavedAt: Date | null }> = ({ saving, lastSavedAt }) => {
  return (
    <div className="fixed top-3 left-3 z-40 group select-none">
      <div
        className={`h-6 w-6 rounded-full grid place-items-center shadow-md ${saving ? 'bg-neutral-700 animate-pulse' : 'bg-neutral-800'} border border-neutral-600`}
        aria-live="polite"
        title={lastSavedAt ? `Last saved ${lastSavedAt.toLocaleTimeString()}` : 'Not saved yet'}
      >
        {saving ? (
          <div className="h-3 w-3 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
        ) : (
          <CheckIcon className="w-3.5 h-3.5 text-neutral-300" />
        )}
      </div>
      <div className="pointer-events-none absolute left-0 mt-1 px-2 py-1 rounded-md text-xs bg-neutral-800/95 text-neutral-200 border border-neutral-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
        {saving ? 'Saving…' : (lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString()}` : 'Not saved yet')}
      </div>
    </div>
  );
};

const AutosaveIndicator = memo(AutosaveIndicatorComponent);
export default AutosaveIndicator;
