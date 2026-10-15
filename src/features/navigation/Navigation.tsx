import { memo, useCallback, useEffect, useState } from 'react';
import { isFrameEditorOpen, isUserTyping } from '@utils/shortcutsUtils';
import { IndexRail } from './IndexRail';
import { FindPalette } from './FindPalette';

/**
 * Navigation on the canvas page (SPEC §6): the index rail and Find. `/` or Ctrl+F opens Find while the canvas
 * page is in use (not while typing or with the frame editor open); otherwise the browser's own find works.
 */
export const Navigation = memo(function Navigation({ showRail }: { showRail: boolean }) {
	const [findOpen, setFindOpen] = useState(false);
	const openFind = useCallback(() => setFindOpen(true), []);
	const closeFind = useCallback(() => setFindOpen(false), []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const ctrlF = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f';
			const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey;
			if (!ctrlF && !slash) return;
			if (isUserTyping() || isFrameEditorOpen() || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
			e.preventDefault();
			setFindOpen(true);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	return (
		<>
			{showRail ? <IndexRail onOpenFind={openFind} /> : null}
			{findOpen ? <FindPalette onClose={closeFind} /> : null}
		</>
	);
});
