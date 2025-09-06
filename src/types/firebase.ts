import type { Note } from './notes';
import type { Preferences } from '@utils/shortcutsUtils';
import type { Timestamp } from 'firebase/firestore';

export type UserProfileDoc = {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  email?: string | null;
  displayName?: string | null;
  upgradedFromAnonymous?: boolean;
};

export type UserSettingsDoc = {
  preferences?: Partial<Preferences>;
  shortcuts?: Record<string, string>;
  updatedAt: Timestamp;
};

export type ProjectMetaDoc = {
  title?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  audio?: {
    name?: string;
    size?: number;
    type?: string;
    durationSec?: number;
  };
};

export type ProjectNotesDoc = {
  notes: Note[];
  updatedAt: Timestamp;
};