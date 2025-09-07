import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ensureUser, fetchUserSettings, saveUserSettings, markUserUpgraded, listUserProjectIds, fetchProjectMeta, fetchProjectNotes, updateProjectMeta, saveProjectNotes, createProject, deleteUserData } from '@/lib/db';
import { DEFAULT_PREFERENCES, setPreferences } from '@utils/shortcutsUtils';
import { AuthContext, type AuthContextValue } from './objects/FirebaseAuthContextObject';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [lastMigratedProjectId, setLastMigratedProjectId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Track the last anonymous UID in case we need to migrate on sign-in
  const lastAnonUidRef = useRef<string | null>(null);
  useEffect(() => {
    if (user?.isAnonymous) {
      lastAnonUidRef.current = user.uid;
    }
  }, [user?.isAnonymous, user?.uid]);

  // SIGN IN FUNCTION - migrates data if signing in from anonymous
  const signIn = useCallback(async (email: string, password: string, fromAnon?: boolean) => {
    if (!fromAnon) {
      await signInWithEmailAndPassword(auth, email, password);
      return;
    }

    // If currently anonymous, backup anon project and clean up before switching auth
    const prevAnonUid = lastAnonUidRef.current;
    let pendingMigration: null | { projectId: string; meta: any; notes: any[] | null } = null;
    try {
      if (prevAnonUid) {
        const ids = await listUserProjectIds(prevAnonUid);
        if (ids.length > 0) {
          const projectId = ids[0];
          const meta = await fetchProjectMeta(prevAnonUid, projectId);
          const notes = await fetchProjectNotes(prevAnonUid, projectId);
          if (meta) {
            pendingMigration = { projectId, meta, notes: notes ?? null };
            // Persist a backup across navigation just in case sign-in flow reloads
            sessionStorage.setItem('pendingMigrationV1', JSON.stringify({ projectId, meta, notes: notes ?? null }));
            sessionStorage.setItem('pendingMigrationFromUid', prevAnonUid);

            await deleteUserData(prevAnonUid);
          }
        }
      }
    } catch (error) {
      console.error('Error migrating anonymous user data (restore)', error);
    }

    await signInWithEmailAndPassword(auth, email, password);

    // After sign-in, restore backup into the new account
    setTimeout(async () => {
      try {
        const current = auth.currentUser;
        if (!current) return;

        // Prefer in-memory backup; fallback to sessionStorage
        if (!pendingMigration) {
          try {
            const raw = sessionStorage.getItem('pendingMigrationV1');
            if (raw) pendingMigration = JSON.parse(raw);
          } catch { }
        }
        if (!pendingMigration) {
          lastAnonUidRef.current = null;
          return;
        }

        setMigrationBusy(true);
        const { projectId, meta, notes } = pendingMigration;

        // Avoid accidental overwrite if destination already has this ID
        const existing = await fetchProjectMeta(current.uid, projectId);
        let destProjectId = projectId;
        if (existing) {
          destProjectId = await createProject(current.uid, {
            title: meta.title,
            audio: meta.audio,
          });
        } else {
          await updateProjectMeta(current.uid, projectId, meta);
        }
        if (notes && notes.length) {
          await saveProjectNotes(current.uid, destProjectId, notes as any);
        }

        // Clear backup
        try {
          sessionStorage.removeItem('pendingMigrationV1');
          sessionStorage.removeItem('pendingMigrationFromUid');
        } catch { }
        lastAnonUidRef.current = null;
        setLastMigratedProjectId(destProjectId);
      } catch (error) {
        console.error('Error migrating anonymous user data (restore)', error);
      } finally {
        setMigrationBusy(false);
      }
    }, 0);
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

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    signIn,
    signUp,
    upgradeAnonymous,
    signInGuest,
    signOut,
    migrationBusy,
    lastMigratedProjectId,
    clearMigrationRedirect: () => setLastMigratedProjectId(null),
  }), [user, loading, signIn, signUp, upgradeAnonymous, signInGuest, signOut, migrationBusy, lastMigratedProjectId]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// hook moved to FirebaseAuthContextObject.ts
