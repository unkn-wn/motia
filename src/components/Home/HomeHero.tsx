import React, { useRef, useCallback } from 'react';
import HeroBanner from './HeroBanner';
import FileUploader from './FileUploader';
import { LogInIcon, UserPlusIcon } from '@/assets/icons';
import HeroBackdrop, { type HeroBackdropHandle } from './HeroBackdrop';
import { useAuth } from '@/contexts/objects/FirebaseAuthContextObject';

interface HomeHeroProps {
  onUpload: (file: File) => void;
  uploading: boolean;
  onOpenSignin: () => void;
  onOpenSignup: () => void;
}

const HomeHero: React.FC<HomeHeroProps> = ({ onUpload, uploading, onOpenSignin, onOpenSignup }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const uploaderRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HeroBackdropHandle | null>(null);
  const { user, signInGuest } = useAuth();

  const handleUpload = useCallback(async (file: File) => {
    // If not logged in, silently sign in as guest before continuing
    if (!user) {
      try { await signInGuest(); } catch { /* no-op; allow upload anyway */ }
    }
    onUpload(file);
  }, [user, signInGuest, onUpload]);

  return (
    <div ref={containerRef} className="h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient canvas backdrop (static unless we shuffle on hover) */}
      <HeroBackdrop ref={backdropRef} />

      <HeroBanner />

      {/* Primary uploader */}
      <div
        ref={uploaderRef}
        className="animate-fade-in-up group relative"
        onMouseEnter={() => backdropRef.current?.shuffle()}
        onFocus={() => backdropRef.current?.shuffle()}
      >
        {/* Local hover/focus glow (replaces backdrop interaction) */}
        <div className="pointer-events-none absolute -inset-6 -z-10 opacity-0 scale-95 group-hover:opacity-100 group-focus-within:opacity-100 group-hover:scale-100 group-focus-within:scale-100 transition-all duration-500 ease-out blur-2xl bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.22),transparent_60%)]" />
        <FileUploader onFileSelect={handleUpload} isLoading={uploading} />
      </div>

      {/* Secondary actions */}
      <div className="relative mt-8 flex items-center gap-3 animate-fade-in-up">
        <button
          onClick={onOpenSignin}
          onMouseEnter={() => backdropRef.current?.shuffle()}
          onFocus={() => backdropRef.current?.shuffle()}
          className="group relative inline-flex items-center gap-2 rounded-lg bg-neutral-900/60 hover:bg-neutral-800 text-neutral-100 px-3 py-2 border border-neutral-800 overflow-hidden cursor-pointer"
        >
          <LogInIcon className="w-5 h-5" />
          <span className="text-sm">Sign in</span>
          <span className="pointer-events-none absolute bottom-0 left-0 h-[2px] w-0 bg-gradient-to-r from-neutral-400/80 to-transparent group-hover:w-full group-focus-visible:w-full transition-[width] duration-300" />
        </button>
        <button
          onClick={onOpenSignup}
          onMouseEnter={() => backdropRef.current?.shuffle()}
          onFocus={() => backdropRef.current?.shuffle()}
          className="group relative inline-flex items-center gap-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-2 border border-neutral-700 shadow overflow-hidden cursor-pointer"
        >
          <UserPlusIcon className="w-5 h-5" />
          <span className="text-sm">Create account</span>
          <span className="pointer-events-none absolute bottom-0 left-0 h-[2px] w-0 bg-gradient-to-r from-blue-400/80 to-transparent group-hover:w-full group-focus-visible:w-full transition-[width] duration-300" />
        </button>
      </div>
    </div>
  );
};

export default HomeHero;
