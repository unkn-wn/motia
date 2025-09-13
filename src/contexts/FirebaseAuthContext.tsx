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
import { DEFAULT_PREFERENCES, setPreferences, setShortcutsFromMap, subscribeShortcuts } from '@utils/shortcutsUtils';
import { shortcutsArrayToMap } from '@/lib/db';
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

    type Backup = { projectId: string; meta: import('@types').ProjectMetaDoc; notes: import('@types').Note[] | null };
    let pendingMigration: Backup | null = null;
    try {
      if (prevAnonUid) {
        setMigrationBusy(true);

        const ids = await listUserProjectIds(prevAnonUid);
        if (ids.length > 0) {
          const projectId = ids[0];
          const meta = await fetchProjectMeta(prevAnonUid, projectId);
          const notes = await fetchProjectNotes(prevAnonUid, projectId);
          if (meta) {
            pendingMigration = { projectId, meta, notes: notes ?? null };
            // Persist a backup across navigation just in case sign-in flow reloads
            sessionStorage.setItem('pendingMigrationV1', JSON.stringify({ projectId, meta, notes: notes ?? null } satisfies Backup));
            sessionStorage.setItem('pendingMigrationFromUid', prevAnonUid);

            await deleteUserData(prevAnonUid);
          }
        }
      }
    } catch (error) {
      console.error('Error migrating anonymous user data (backup)', error);
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
            if (raw) pendingMigration = JSON.parse(raw) as Backup;
          } catch (e) {
            console.warn('Failed to parse pendingMigrationV1 from storage', e);
          }
        }
        if (!pendingMigration) {
          lastAnonUidRef.current = null;
          return;
        }

        const { projectId, meta, notes } = pendingMigration;

        // Avoid accidental overwrite if destination already has this ID
        const existing = await fetchProjectMeta(current.uid, projectId);
        let destProjectId = projectId;
        if (existing) {
          const audio = meta.audio && meta.audio.name && meta.audio.size !== undefined && meta.audio.type
            ? { name: meta.audio.name, size: meta.audio.size, type: meta.audio.type, durationSec: meta.audio.durationSec }
            : { name: 'audio', size: 0, type: 'application/octet-stream' };
          destProjectId = await createProject(current.uid, {
            title: meta.title,
            audio,
          });
        } else {
          await updateProjectMeta(current.uid, projectId, meta);
        }
        if (notes && notes.length) {
          await saveProjectNotes(current.uid, destProjectId, notes);
        }

        // Clear backup
        try {
          sessionStorage.removeItem('pendingMigrationV1');
          sessionStorage.removeItem('pendingMigrationFromUid');
        } catch (e) {
          console.warn('Failed clearing migration storage keys', e);
        }
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
        // Load shortcuts into global store if present
        if (settings?.shortcuts) {
          setShortcutsFromMap(settings.shortcuts);
        }
      } catch {
        // non-fatal: ignore bootstrap errors to avoid noisy logs
      }
    })();
  }, [user]);

  // Centralized persistence of shortcut changes
  useEffect(() => {
    if (!user) return;
    let t: number | null = null;
    let lastPayload: ReturnType<typeof shortcutsArrayToMap> | null = null;
    const flush = () => {
      if (!user || !lastPayload) return;
      void saveUserSettings(user.uid, { shortcuts: lastPayload });
      lastPayload = null;
    };
    const unsub = subscribeShortcuts((list) => {
      lastPayload = shortcutsArrayToMap(list);
      if (t) window.clearTimeout(t);
      t = window.setTimeout(flush, 500);
    });
    return () => {
      if (t) window.clearTimeout(t);
      flush();
      unsub();
    };
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
