import React from 'react';
import type { CanvasOrientation } from '@types';

interface OrientationBannerProps {
  onSelect: (orientation: CanvasOrientation) => void;
}

export const OrientationBanner: React.FC<OrientationBannerProps> = ({ onSelect }) => {
  return (
    <div className="absolute top-5 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
      <div className="bg-neutral-900/95 border border-neutral-700/80 rounded-xl p-3 shadow-xl flex flex-col items-center">
        <p className="text-xs text-neutral-400 mb-2 font-medium">Select waveform layout</p>

        <div className="flex gap-2">
          {/* Vertical Option */}
          <button
            type="button"
            onClick={() => onSelect('vertical')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white transition-colors cursor-pointer text-xs font-medium"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="2 2" />
              <line x1="8" y1="8" x2="16" y2="8" />
              <line x1="6" y1="12" x2="18" y2="12" />
              <line x1="9" y1="16" x2="15" y2="16" />
            </svg>
            <span>Vertical</span>
          </button>

          {/* Horizontal Option */}
          <button
            type="button"
            onClick={() => onSelect('horizontal')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white transition-colors cursor-pointer text-xs font-medium"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" strokeDasharray="2 2" />
              <line x1="8" y1="8" x2="8" y2="16" />
              <line x1="12" y1="6" x2="12" y2="18" />
              <line x1="16" y1="9" x2="16" y2="15" />
            </svg>
            <span>Horizontal</span>
          </button>
        </div>
      </div>
    </div>
  );
};
