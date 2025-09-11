import React, { useMemo, useState, useCallback } from 'react';
import AuthModal from '@components/Home/AuthModal';

// Base banner UI (presentational)
type BannerVariant = 'blue' | 'amber' | 'neutral';

const stylesByVariant: Record<BannerVariant, { container: string; button: string; altButton: string }> = {
  blue: {
    container: 'bg-blue-500/10 border-blue-400/40 text-blue-200',
    button: 'bg-blue-500/20 hover:bg-blue-500/30 border-blue-400/40 text-blue-100',
    altButton: 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-100',
  },
  amber: {
    container: 'bg-amber-500/10 border-amber-400/40 text-amber-200',
    button: 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-400/40 text-amber-100',
    altButton: 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-100',
  },
  neutral: {
    container: 'bg-neutral-800/60 border-neutral-700 text-neutral-200',
    button: 'bg-neutral-700 hover:bg-neutral-600 border-neutral-600 text-neutral-100',
    altButton: 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-100',
  },
};

type BannerProps = { variant?: BannerVariant; className?: string; children: React.ReactNode };
type BannerButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BannerVariant; alt?: boolean };
type BannerComponent = React.FC<BannerProps> & { Button: React.FC<BannerButtonProps> };

const BannerBase: React.FC<BannerProps> = ({ variant = 'neutral', className, children }) => {
  const styles = stylesByVariant[variant];
  return (
    <div className={`fixed top-2 left-1/2 -translate-x-1/2 z-50 px-3 py-2 rounded-md border text-sm flex items-center gap-3 shadow backdrop-blur-md ${styles.container} ${className ?? ''}`}>
      {children}
    </div>
  );
};

const BannerButton: React.FC<BannerButtonProps> = ({ variant = 'neutral', alt, className, ...props }) => {
  const styles = stylesByVariant[variant];
  const base = alt ? styles.altButton : styles.button;
  return (
    <button className={`px-2 py-1 rounded border cursor-pointer transition-colors ${base} ${className ?? ''}`} {...props} />
  );
};

export const Banner = Object.assign(BannerBase, { Button: BannerButton }) as BannerComponent;

// Option API and orchestrator
export type BannerOption = {
  id: string;
  show: boolean;
  priority: number; // higher wins
  render: () => React.ReactNode;
};

export const TopBanner: React.FC<{ options: BannerOption[] }> = ({ options }) => {
  const active = useMemo(() => {
    const candidates = options.filter(o => o.show);
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0];
  }, [options]);

  if (!active) return null;
  return <>{active.render()}</>;
};

// Prebuilt options
type RelinkProps = {
  show: boolean;
  isLoading?: boolean;
  onRelinkClick: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export function RelinkBannerOption({ show, isLoading, onRelinkClick, fileInputRef, onFileSelected }: RelinkProps): BannerOption {
  return {
    id: 'relink',
    show,
    priority: 100, // highest priority
    render: () => (
      <Banner variant="amber">
        <span>Audio not found on this device. Relink to enable playback.</span>
        <div className="flex items-center gap-2">
          <Banner.Button variant="amber" onClick={onRelinkClick} disabled={isLoading}>
            {isLoading ? 'Linking…' : 'Relink audio'}
          </Banner.Button>
        </div>
        <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={onFileSelected} />
      </Banner>
    ),
  };
}

export function SignInBannerOption({ show }: { show: boolean }): BannerOption {
  const SignInContent: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<'signin' | 'signup'>('signin');
    const openSignin = useCallback(() => { setMode('signin'); setOpen(true); }, []);
    const openSignup = useCallback(() => { setMode('signup'); setOpen(true); }, []);

    return (
      <>
        <Banner variant="blue" className="flex-col md:flex-row">
          <span>Sign in to save your progress across devices.</span>
          <div className="flex items-center gap-2">
            <Banner.Button variant="blue" onClick={openSignin}>Sign in</Banner.Button>
            <Banner.Button variant="neutral" alt onClick={openSignup}>Create account</Banner.Button>
          </div>
        </Banner>
        <AuthModal open={open} mode={mode} onClose={() => setOpen(false)} />
      </>
    );
  };

  return {
    id: 'signin',
    show,
    priority: 10,
    render: () => <SignInContent />,
  };
}

export default TopBanner;
