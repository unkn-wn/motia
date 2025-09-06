import React, { useEffect, useRef, useState } from 'react';
import { LogInIcon, UserPlusIcon, XIcon, CheckIcon, EyeIcon, EyeOffIcon } from '@/assets/icons';
import { useAuth } from '@/contexts/FirebaseAuthContext';

type Mode = 'signin' | 'signup';

interface AuthModalProps {
  open: boolean;
  mode?: Mode;
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ open, mode: initialMode = 'signin', onClose }) => {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMode(initialMode), [initialMode]);
  useEffect(() => { if (!open) { setEmail(''); setPassword(''); setLoading(false); setDone(false); } }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) onClose(); };
    const opts: AddEventListenerOptions = { capture: true };
    window.addEventListener('keydown', onKey, opts);
    return () => window.removeEventListener('keydown', onKey, opts);
  }, [open, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'signin') await signIn(email, password);
      else await signUp(email, password);
      setDone(true);
      setTimeout(onClose, 650);
    } catch (err) {
      // TODO: surface specific errors
      console.error(err);
    } finally {
      setLoading(false);
    }
  };


  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" onClick={onClose} />
      <div ref={dialogRef} className="relative w-full max-w-sm rounded-2xl bg-neutral-900/95 border border-neutral-800 shadow-[0_10px_40px_rgba(0,0,0,0.45)] p-5 animate-fade-in-up backdrop-blur-sm">
        <button onClick={onClose} className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-200 cursor-pointer" aria-label="Close auth dialog">
          <XIcon className="w-5 h-5" />
        </button>
        <div className="text-center mb-3">
          <div className="mx-auto w-14 h-[3px] rounded-full bg-gradient-to-r from-neutral-600 via-neutral-300 to-neutral-600 animate-shine" />
          <h2 className="mt-3 text-xl font-semibold text-neutral-100">{mode === 'signin' ? 'Welcome back' : 'Create account'}</h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="block text-sm text-neutral-300">Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="mt-1 w-full rounded-lg bg-neutral-800/80 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:border-neutral-500 focus:bg-neutral-800" placeholder="you@domain.com" />
          </label>
          <label className="block">
            <span className="block text-sm text-neutral-300">Password</span>
            <div className="mt-1 relative">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? 'text' : 'password'}
                required
                className="w-full rounded-lg bg-neutral-800/80 border border-neutral-700 px-3 py-2 pr-9 text-neutral-100 outline-none focus:border-neutral-500 focus:bg-neutral-800"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200 cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeIcon className="w-5 h-5" /> : <EyeOffIcon className="w-5 h-5" />}
              </button>
            </div>
          </label>

          <button type="submit" disabled={loading} className="w-full mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white py-2 shadow-lg disabled:opacity-60 active:scale-[0.98] cursor-pointer">
            {done ? <CheckIcon className="w-5 h-5 text-green-400" /> : (mode === 'signin' ? <LogInIcon className="w-5 h-5" /> : <UserPlusIcon className="w-5 h-5" />)}
            <span>{done ? 'Success' : (mode === 'signin' ? 'Sign in' : 'Create account')}</span>
          </button>
        </form>

        <div className="mt-3 text-center text-sm text-neutral-400">
          {mode === 'signin' ? (
            <button onClick={() => setMode('signup')} className="underline decoration-dotted underline-offset-4 hover:text-neutral-200 cursor-pointer">No account? Create one</button>
          ) : (
            <button onClick={() => setMode('signin')} className="underline decoration-dotted underline-offset-4 hover:text-neutral-200 cursor-pointer">Have an account? Sign in</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
