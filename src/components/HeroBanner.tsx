import React, { memo } from 'react';

const HeroBanner: React.FC = memo(() => {
  return (
    <div className="text-center mb-12 select-none animate-fade-in-up">
      <div className="mx-auto w-24 h-1 rounded-full bg-gradient-to-r from-neutral-600 via-neutral-300 to-neutral-600 animate-shine animate-width-grow" />
      <h1 className="mt-4 text-5xl md:text-6xl font-semibold tracking-tight text-neutral-100">
        motia
      </h1>
      <p className="mt-3 text-neutral-400 text-lg font-mono">your freeform audio storyboard</p>
    </div>
  );
});

HeroBanner.displayName = 'HeroBanner';

export default HeroBanner;