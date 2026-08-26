import type { Note } from './notes';
import type { Preferences } from '@utils/shortcutsUtils';
import type { Timestamp } from 'firebase/firestore';

// Constants
export const MAX_PROJECT_TITLE_LENGTH = 64;

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
	version?: number; // Version counter for conflict detection (increments on each write)
	audio?: {
		name?: string;
		size?: number;
		type?: string;
		durationSec?: number;
		storagePath?: string; // gs:// or path like users/{uid}/projects/{projectId}/audio
		trimStart?: number; // Trim start time in seconds (default: 0)
		trimEnd?: number; // Trim end time in seconds (default: durationSec)
	};
	waveform?: {
		samples?: number[]; // decimated peaks for quick paint
		sampleRate?: number; // optional context of samples array density
	};
	thumbnail?: string; // small data URL preview (webp/png)
	orientation?: 'vertical' | 'horizontal';
};

export type ProjectNotesDoc = {
	notes: Note[];
	// All drawing strokes compressed together (JSON string of CompressedStroke[])
	compressed?: string | unknown[];
	updatedAt: Timestamp;
	version?: number; // Version counter for conflict detection (increments on each write)
};
