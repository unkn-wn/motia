import React, { useState, useCallback } from 'react';
import AuthModal from '@components/Home/AuthModal';

const SignInSaveBanner: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const openSignin = useCallback(() => { setMode('signin'); setOpen(true); }, []);
  const openSignup = useCallback(() => { setMode('signup'); setOpen(true); }, []);

  return (
    <>
      <div className="fixed top-2 left-1/2 -translate-x-1/2 z-40 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-400/40 text-blue-200 text-sm flex flex-col md:flex-row items-center gap-3 shadow">
        <span>Sign in to save your progress across devices.</span>
        <div className="flex items-center gap-2">
          <button
            className="px-2 py-1 rounded bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/40 cursor-pointer"
            onClick={openSignin}
          >
            Sign in
          </button>
          <button
            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-100 cursor-pointer"
            onClick={openSignup}
          >
            Create account
          </button>
        </div>
      </div>
      <AuthModal open={open} mode={mode} onClose={() => setOpen(false)} />
    </>
  );
};

export default SignInSaveBanner;
