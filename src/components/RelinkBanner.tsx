import React from 'react';

type Props = {
  isLoading?: boolean;
  onRelinkClick: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

const RelinkBanner: React.FC<Props> = ({ isLoading, onRelinkClick, fileInputRef, onFileSelected }) => (
  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-400/40 text-amber-200 text-sm flex items-center gap-3">
    <span>Audio not found on this device. Relink to enable playback.</span>
    <button
      className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 cursor-pointer"
      onClick={onRelinkClick}
      disabled={isLoading}
    >
      {isLoading ? 'Linking…' : 'Relink audio'}
    </button>
    <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={onFileSelected} />
  </div>
);

export default RelinkBanner;
