import React, { memo } from 'react';
import PlaybackControls from './AudioControls/PlaybackControls';
import ProgressSection from './AudioControls/ProgressSection';
import VolumeControl from './AudioControls/VolumeControl';
import { PlaybackProvider, VolumeProvider } from '@contexts/AudioControlsContext';
import { ChevronUpIcon, ChevronDownIcon } from '@assets/icons';

interface AudioControlsProps {
  onToggleNotes?: () => void;
  notesOpen?: boolean;
  textNotesCount?: number;
}

const AudioControls: React.FC<AudioControlsProps> = memo(({ onToggleNotes, notesOpen, textNotesCount = 0 }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-neutral-800 bg-neutral-900/70 backdrop-blur-sm">
      {/* Mobile Notes Toggle Tab - docked cleanly on the top border of the playback bar */}
      {onToggleNotes && (
        <button
          type="button"
          onClick={onToggleNotes}
          className="md:hidden absolute -top-8 right-4 bg-neutral-900 hover:bg-neutral-950 text-white px-3 py-1.5 cursor-pointer rounded-t-lg shadow-lg flex items-center space-x-2 text-sm font-medium border-t border-x border-neutral-700/50"
          title={notesOpen ? 'Hide notes' : 'Show notes'}
        >
          {notesOpen ? (
            <ChevronDownIcon className="w-4 h-4" />
          ) : (
            <ChevronUpIcon className="w-4 h-4" />
          )}
          <span>{textNotesCount}</span>
        </button>
      )}
      <div className="max-w-6xl mx-auto px-3 md:px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        {/* Responsive layout: Progress on top for mobile, then controls, then (optional) volume */}
        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4">
          <div className="order-2 md:flex-1 min-w-0 w-full">
            {/* Progress Section - updates frequently */}
            <ProgressSection />
          </div>

          <div className="order-1">
            <PlaybackProvider>
              {/* Playback Controls - rarely changes */}
              <PlaybackControls />
            </PlaybackProvider>
          </div>

          <div className="order-3">
            <VolumeProvider>
              {/* Volume Control - rarely changes (hidden on small screens) */}
              <VolumeControl />
            </VolumeProvider>
          </div>
        </div>
      </div>
    </div>
  );
});

AudioControls.displayName = 'AudioControls';

export default AudioControls;
