import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '@contexts/objects/FirebaseAuthContextObject';
import { auth } from '@/lib/firebase';

/**
 * Import a `.motia.zip` or `motia.json` as a new project, then open it. A visitor without an account gets a guest
 * session first, as uploading audio does. Problems are returned for the errors dialog; nothing is written then.
 */
export function useStoryboardImport() {
	const { user, signInGuest } = useAuth();
	const navigate = useNavigate();
	const [busy, setBusy] = useState(false);
	const [errors, setErrors] = useState<string[] | null>(null);
	// Left the page meanwhile: the project is still made, but the user isn't pulled into it
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const importFile = useCallback(
		async (file: File) => {
			setBusy(true);
			setErrors(null);
			try {
				// Loaded only when importing
				const { readImport, writeImport } = await import('./importZip');
				const checked = await readImport(file);
				if (!checked.ok) {
					if (mounted.current) setErrors(checked.errors);
					return;
				}
				if (!user) await signInGuest();
				const uid = user?.uid ?? auth.currentUser?.uid;
				if (!uid) {
					setErrors(['Could not start a session to import into. Try again.']);
					return;
				}
				const projectId = await writeImport(uid, checked.value);
				if (mounted.current) navigate({ to: '/project/$projectId', params: { projectId } });
			} catch (err) {
				console.error('Import failed', err);
				if (mounted.current) setErrors(['The storyboard could not be imported. Try again.']);
			} finally {
				if (mounted.current) setBusy(false);
			}
		},
		[user, signInGuest, navigate]
	);

	const clearErrors = useCallback(() => setErrors(null), []);
	return { importFile, busy, errors, clearErrors };
}
