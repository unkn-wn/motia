import React, { memo } from 'react';
import PlaybackControls from './AudioControls/PlaybackControls';
import ProgressSection from './AudioControls/ProgressSection';
import VolumeControl from './AudioControls/VolumeControl';

const AudioControls: React.FC = memo(() => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-neutral-900/50 backdrop-blur-xs border-neutral-700 z-30">
      <div className="max-w-6xl mx-auto px-4 pb-3 pt-2">
        {/* Modern compact layout */}
        <div className="flex items-center space-x-4">
          {/* Playback Controls - rarely changes */}
          <PlaybackControls />

          {/* Progress Section - updates frequently */}
          <ProgressSection />

          {/* Volume Control - rarely changes */}
          <VolumeControl />
        </div>
      </div>
    </div>
  );
});

AudioControls.displayName = 'AudioControls';

export default AudioControls;
