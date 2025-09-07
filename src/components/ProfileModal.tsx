import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/objects/FirebaseAuthContextObject';
import { XIcon, CheckIcon, LogInIcon, UserPlusIcon } from '@/assets/icons';
import AuthModal from '@/components/Home/AuthModal';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ open, onClose }) => {
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const opts: AddEventListenerOptions = { capture: true };
    window.addEventListener('keydown', onKey, opts);
    return () => window.removeEventListener('keydown', onKey, opts);
  }, [open, onClose]);

  if (!open) return null;

  const isAnon = !!user?.isAnonymous;
  const isSignedIn = !!user && !user.isAnonymous;

  const handleSignOut = async () => {
    setBusy(true);
    try { await signOut(); onClose(); } finally { setBusy(false); window.location.reload(); }
  };

  const displayName = user?.displayName || (user?.email ? user.email.split('@')[0] : 'Guest');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 " onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-neutral-900 border border-neutral-800 shadow-[0_10px_40px_rgba(0,0,0,0.45)] p-5 animate-fade-in-up">
        <button onClick={onClose} className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-200 cursor-pointer" aria-label="Close profile dialog">
          <XIcon className="w-5 h-5" />
        </button>
        <div className="text-center mb-3">
          <div className="mx-auto w-14 h-[3px] rounded-full bg-gradient-to-r from-neutral-600 via-neutral-300 to-neutral-600 animate-shine" />
          <h2 className="mt-3 text-xl font-semibold text-neutral-100">Account</h2>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
            <div className="text-sm text-neutral-400">Signed in as</div>
            <div className="mt-0.5 text-neutral-100 font-medium">{displayName}</div>
            <div className="text-neutral-400 text-sm">{user?.email || (isAnon ? 'Anonymous session' : '')}</div>
            {isAnon && (
              <div className="mt-2 text-xs text-neutral-400">Create an account to keep your projects across devices.</div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2">
            {!isSignedIn ? (
              <>
                <button
                  onClick={() => { setAuthMode('signup'); setAuthOpen(true); }}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white py-2 cursor-pointer"
                >
                  <UserPlusIcon className="w-5 h-5" />
                  <span>Create account</span>
                </button>
                <button
                  onClick={() => { setAuthMode('signin'); setAuthOpen(true); }}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white py-2 cursor-pointer"
                >
                  <LogInIcon className="w-5 h-5" />
                  <span>Sign in</span>
                </button>
              </>
            ) : (
              <button
                onClick={handleSignOut}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white py-2 disabled:opacity-60 cursor-pointer"
              >
                {busy ? <CheckIcon className="w-5 h-5 text-green-400" /> : null}
                <span>Sign out</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 text-center text-xs text-neutral-500">More profile options coming soon.</div>
      </div>

      {/* Auth modal for upgrade/signin */}
      <AuthModal open={authOpen} mode={authMode} onClose={() => setAuthOpen(false)} />
    </div>
  );
};

export default ProfileModal;
