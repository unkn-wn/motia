import { createContext, useContext } from 'react';
import type { User } from 'firebase/auth';

export type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string, fromAnon?: boolean) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  upgradeAnonymous: (email: string, password: string) => Promise<void>;
  signInGuest: () => Promise<void>;
  signOut: () => Promise<void>;
  // Migration (anon -> account) runtime state
  migrationBusy?: boolean;
  lastMigratedProjectId?: string | null;
  clearMigrationRedirect?: () => void;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
