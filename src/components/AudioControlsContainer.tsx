import React, { memo } from 'react';
import PlaybackControls from './AudioControls/PlaybackControls';
import ProgressSection from './AudioControls/ProgressSection';
import VolumeControl from './AudioControls/VolumeControl';
import { PlaybackProvider, VolumeProvider } from '@contexts/AudioControlsContext';

const AudioControls: React.FC = memo(() => {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-neutral-800 bg-neutral-900/70 backdrop-blur-sm">
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
