import React from 'react';
import type { ReactNode } from 'react';
import { WaveformContext, type WaveformContextValue } from './objects/WaveformContextObject';

interface WaveformProviderProps {
  children: ReactNode;
  value: WaveformContextValue;
}

export const WaveformProvider: React.FC<WaveformProviderProps> = ({ children, value }) => {
  return (
  <WaveformContext.Provider value={value}>
      {children}
    </WaveformContext.Provider>
  );
};
