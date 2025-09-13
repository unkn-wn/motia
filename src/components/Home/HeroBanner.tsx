import React, { memo } from 'react';
import Logo from '@/components/Logo';

const HeroBanner: React.FC = memo(() => {
  return (
    <div className="text-center mb-4 select-none animate-fade-in-up">
      <Logo className="mx-auto" />
      <h1 className="text-5xl md:text-6xl font-semibold tracking-tight text-neutral-100">motia</h1>
      <p className="mt-3 text-neutral-400 text-lg font-mono">your freeform audio storyboard</p>
    </div>
  );
});

HeroBanner.displayName = 'HeroBanner';

export default HeroBanner;