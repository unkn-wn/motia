import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '@/lib/firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  signInAnonymously,
  linkWithCredential,
  EmailAuthProvider,
  type User,
} from 'firebase/auth';
import { ensureUser, fetchUserSettings, saveUserSettings, markUserUpgraded } from '@/lib/db';
import { DEFAULT_PREFERENCES, setPreferences } from '@utils/shortcutsUtils';
import { AuthContext, type AuthContextValue } from './objects/FirebaseAuthContextObject';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password);
  }, []);

  // Upgrade an anonymous account by linking email/password without losing data
  const upgradeAnonymous = useCallback(async (email: string, password: string) => {
    const u = auth.currentUser;
    if (!u) throw new Error('No current user');
    if (!u.isAnonymous) throw new Error('User is not anonymous');
    const cred = EmailAuthProvider.credential(email, password);
    const linked = await linkWithCredential(u, cred);
    await markUserUpgraded(linked.user.uid, { email, displayName: linked.user.displayName ?? null });
  }, []);

  const signInGuest = useCallback(async () => {
    await signInAnonymously(auth);
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
  }, []);

  // After sign-in, ensure user doc exists and load settings/preference defaults once
  useEffect(() => {
    (async () => {
      if (!user) return;
      try {
        await ensureUser(user.uid, {
          email: user.email ?? null,
          displayName: user.displayName ?? null,
        });
        const settings = await fetchUserSettings(user.uid);
        if (settings?.preferences) {
          setPreferences(settings.preferences);
        } else {
          // ensure defaults exist in Firestore (first login)
          await saveUserSettings(user.uid, { preferences: DEFAULT_PREFERENCES });
        }
      } catch {
        // non-fatal: ignore bootstrap errors to avoid noisy logs
      }
    })();
  }, [user]);

  const value = useMemo<AuthContextValue>(() => ({ user, loading, signIn, signUp, upgradeAnonymous, signInGuest, signOut }), [user, loading, signIn, signUp, upgradeAnonymous, signInGuest, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// hook moved to FirebaseAuthContextObject.ts
