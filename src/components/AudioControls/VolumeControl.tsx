import React, { memo, useCallback, useSyncExternalStore } from 'react';
import { useVolumeContext } from '@contexts/objects/AudioControlsContextObject';
import { volumeStore } from './state';
import { Volume2Icon } from '@assets/icons';

// Optimized VolumeControl that uses a narrowed context to avoid time-driven re-renders
const VolumeControl: React.FC = memo(() => {
  const { setVolume } = useVolumeContext();
  const volume = useSyncExternalStore(volumeStore.subscribe, volumeStore.getSnapshot);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
  }, [setVolume]);

  const volumePercentage = volume * 100;

  return (
    <div className="flex items-center space-x-3">
      <Volume2Icon className="w-4 h-4 text-neutral-400" />
      <input
        id="volume-control"
        type="range"
        min="0"
        max="1"
        step="0.1"
        value={volume}
        onChange={handleVolumeChange}
        className="w-20 h-2 bg-neutral-700 rounded-full appearance-none cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer
                   [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-neutral-900
                   [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3
                   [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:cursor-pointer
                   [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-neutral-900 [&::-moz-range-thumb]:shadow-md
                   [&::-moz-range-track]:bg-neutral-700 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:h-2"
        title="Volume (↑/↓)"
        style={{
          background: `linear-gradient(to right, #737373 0%, #737373 ${volumePercentage}%, #27272a ${volumePercentage}%, #27272a 100%)`
        }}
      />
      <span className="text-neutral-400 text-sm font-mono w-10 text-left">
        {Math.round(volumePercentage)}%
      </span>
    </div>
  );
});

VolumeControl.displayName = 'VolumeControl';

export default VolumeControl;
