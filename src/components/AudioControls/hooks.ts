import { useMemo, useSyncExternalStore } from 'react';
import { useAudioActions } from '@contexts/objects/AudioContextObject';
import { currentTimeStore, durationStore } from './state';

// Specialized hooks that only trigger rerenders for specific state changes

// For components that need time updates (these will rerender frequently)
export const useTimeState = () => {
  const currentTime = useSyncExternalStore(currentTimeStore.subscribe, currentTimeStore.getSnapshot);
  const duration = useSyncExternalStore(durationStore.subscribe, durationStore.getSnapshot);
  const { seekToTime } = useAudioActions();

  return useMemo(() => ({
    currentTime,
    duration,
    seekToTime,
  }), [currentTime, duration, seekToTime]);
};
