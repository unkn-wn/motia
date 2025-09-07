import React from 'react';

export const FullscreenOverlay: React.FC<{ message?: string }> = ({ message = 'Loading…' }) => (
  <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/80 text-neutral-200">
    <div className="flex items-center gap-3">
      <div className="h-5 w-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
      <span>{message}</span>
    </div>
  </div>
);

export default FullscreenOverlay;
