import React, { useState, useCallback, useEffect } from 'react';
import type { KeyboardShortcut } from '@utils/shortcutsUtils';
import {
	getPreferences,
	setPreferences,
	type EditorEnterBehavior,
	type PanMouseButton,
	type Preferences,
	setShortcuts,
} from '@utils/shortcutsUtils';
import { NOTE_COLORS, getColorPickerStyle, type NoteColor } from '@utils/colorUtils';
import { history } from '@utils/history';
import { formatKeyDisplay, isValidShortcut } from '@utils/shortcutsUtils';
import { XIcon } from '@assets/icons';
import { useAuth } from '@contexts/objects/FirebaseAuthContextObject';
import { fetchUserSettings, saveUserSettings } from '@/lib/db';

interface KeyboardShortcutsContentProps {
	shortcuts: KeyboardShortcut[];
	onUpdateShortcut: (id: string, newKey: string) => void;
	// onResetAll removed - was never used in this component (reset button was in modal header)
}

/**
 * Keyboard shortcuts content component - extracted from KeyboardShortcuts modal
 * Used within the Settings modal's Global Settings tab
 */
export const KeyboardShortcutsContent: React.FC<KeyboardShortcutsContentProps> = ({ shortcuts, onUpdateShortcut }) => {
	const { user } = useAuth();

	const [editingId, setEditingId] = useState<string | null>(null);
	const [keyError, setKeyError] = useState<string>('');
	const [enterBehavior, setEnterBehaviorState] = useState<EditorEnterBehavior>(getPreferences().editorEnterBehavior);
	const [panButton, setPanButtonState] = useState<PanMouseButton>(getPreferences().panMouseButton);
	const [historyMax, setHistoryMaxState] = useState<number>(getPreferences().historyMax);
	const [defaultNoteColor, setDefaultNoteColor] = useState<NoteColor>(getPreferences().defaultNoteColor);

	// Set to default helper
	const setPrefsToDefault = useCallback(() => {
		const prefs = getPreferences();
		setEnterBehaviorState(prefs.editorEnterBehavior);
		setPanButtonState(prefs.panMouseButton);
		setHistoryMaxState(prefs.historyMax);
		setDefaultNoteColor(prefs.defaultNoteColor);
	}, []);

	// Load preferences from Firestore on mount
	useEffect(() => {
		(async () => {
			try {
				if (user) {
					const settings = await fetchUserSettings(user.uid);
					const prefs = settings?.preferences ?? getPreferences();
					setEnterBehaviorState(prefs.editorEnterBehavior ?? getPreferences().editorEnterBehavior);
					setPanButtonState(prefs.panMouseButton ?? getPreferences().panMouseButton);
					setHistoryMaxState(prefs.historyMax ?? getPreferences().historyMax);
					setDefaultNoteColor(prefs.defaultNoteColor ?? getPreferences().defaultNoteColor);
				} else {
					setPrefsToDefault();
				}
			} catch {
				setPrefsToDefault();
			}
		})();
	}, [user, setPrefsToDefault]);

	// Persist preferences helper
	const setPref = useCallback(
		async (patch: Partial<Preferences>) => {
			setPreferences(patch);
			if (typeof patch.historyMax === 'number') {
				history.setMax(patch.historyMax);
			}
			if (user) {
				try {
					await saveUserSettings(user.uid, { preferences: patch });
				} catch {
					/* ignore */
				}
			}
		},
		[user]
	);

	const handleCancel = useCallback(() => {
		setEditingId(null);
		setKeyError('');
	}, []);

	const handleEditStart = useCallback((shortcut: KeyboardShortcut) => {
		setEditingId(shortcut.id);
		setKeyError('');
	}, []);

	const handleKeyCapture = useCallback(
		(e: KeyboardEvent) => {
			if (!editingId) return;

			e.preventDefault();
			e.stopPropagation();

			const key = e.key;

			// Don't capture escape
			if (key === 'Escape') {
				return;
			}

			// Validate and auto-save
			if (!isValidShortcut(key, shortcuts, editingId)) {
				setKeyError(`"${key === ' ' ? 'Space' : key}" is already in use`);
				setTimeout(() => setKeyError(''), 2000);
			} else {
				onUpdateShortcut(editingId, key);
				const next = shortcuts.map((s) => (s.id === editingId ? { ...s, currentKey: key } : s));
				setShortcuts(next);
				setEditingId(null);
				setKeyError('');
			}
		},
		[shortcuts, editingId, onUpdateShortcut]
	);

	// Global key capture when editing
	useEffect(() => {
		if (editingId) {
			window.addEventListener('keydown', handleKeyCapture, { capture: true });
			return () => window.removeEventListener('keydown', handleKeyCapture, { capture: true });
		}
	}, [editingId, handleKeyCapture]);

	// Handle ESC to cancel editing
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && editingId) {
				e.preventDefault();
				e.stopPropagation();
				handleCancel();
			}
		};

		window.addEventListener('keydown', handleEscape, { capture: true });
		return () => window.removeEventListener('keydown', handleEscape, { capture: true });
	}, [editingId, handleCancel]);

	const categories = [
		{ id: 'notes', label: 'Notes', shortcuts: shortcuts.filter((s) => s.category === 'notes') },
		{ id: 'playback', label: 'Playback', shortcuts: shortcuts.filter((s) => s.category === 'playback') },
		{ id: 'navigation', label: 'Navigation', shortcuts: shortcuts.filter((s) => s.category === 'navigation') },
	].filter((cat) => cat.shortcuts.length > 0);

	return (
		<div className="space-y-4" data-shortcuts-editing={!!editingId}>
			{/* Preferences */}
			<div className="space-y-1.5">
				<div className="flex items-center justify-between py-2 px-3 bg-neutral-800/50 rounded-lg">
					<div className="text-sm font-medium text-neutral-200">Enter button saves note</div>
					<button
						role="switch"
						aria-checked={enterBehavior === 'save'}
						onClick={() => {
							const next: EditorEnterBehavior = enterBehavior === 'save' ? 'newline' : 'save';
							setEnterBehaviorState(next);
							void setPref({ editorEnterBehavior: next });
						}}
						className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${
							enterBehavior === 'save' ? 'bg-green-600' : 'bg-neutral-700'
						}`}
						title={
							enterBehavior === 'save' ? 'Enter saves the note (Shift+Enter newline)' : 'Enter creates newline (Shift/Ctrl/Cmd+Enter saves)'
						}
					>
						<span
							className={`block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
								enterBehavior === 'save' ? 'translate-x-5' : 'translate-x-1'
							}`}
						/>
					</button>
				</div>

				<div className="flex items-center justify-between py-2 px-3 bg-neutral-800/50 rounded-lg">
					<div className="text-sm font-medium text-neutral-200">Pan button</div>
					<div className="inline-flex bg-neutral-900 border border-neutral-700 rounded overflow-hidden">
						{(['Left', 'Middle', 'Right'] as PanMouseButton[]).map((opt) => (
							<button
								key={opt}
								onClick={() => {
									setPanButtonState(opt);
									void setPref({ panMouseButton: opt });
								}}
								className={`px-2 py-1 text-xs ${
									panButton === opt ? 'bg-neutral-700 text-white' : 'text-neutral-300 hover:bg-neutral-800'
								} cursor-pointer transition-colors`}
								title={`Pan with ${opt.toLowerCase()} mouse button`}
							>
								{opt}
							</button>
						))}
					</div>
				</div>

				<div className="flex items-center justify-between py-2 px-3 bg-neutral-800/50 rounded-lg">
					<div className="text-sm font-medium text-neutral-200">Undo history size</div>
					<input
						type="number"
						value={Number.isFinite(historyMax) ? historyMax : 30}
						onChange={(e) => {
							const num = Math.floor(Number(e.target.value));
							const val = Number.isNaN(num) ? 30 : Math.max(1, Math.min(200, num));
							setHistoryMaxState(val);
							void setPref({ historyMax: val });
						}}
						min={1}
						max={200}
						step={1}
						placeholder="30"
						className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-200 w-20"
						title="Maximum number of undo steps to keep (1-200)"
					/>
				</div>

				<div className="flex items-center justify-between py-2 px-3 bg-neutral-800/50 rounded-lg">
					<div className="text-sm font-medium text-neutral-200">Default note color</div>
					<div className="flex items-center space-x-2">
						{NOTE_COLORS.map((color) => (
							<button
								key={color}
								onClick={() => {
									setDefaultNoteColor(color);
									void setPref({ defaultNoteColor: color });
								}}
								className={`w-6 h-6 rounded-full border-2 cursor-pointer ${
									defaultNoteColor === color ? 'border-neutral-200' : 'border-neutral-500'
								}`}
								style={{ backgroundColor: getColorPickerStyle(color) }}
								title={color}
							/>
						))}
					</div>
				</div>
			</div>

			{/* Divider */}
			<div className="h-px my-4 bg-neutral-800" />

			{/* Keyboard Shortcuts */}
			{categories.map((category) => (
				<div key={category.id}>
					<div className="space-y-1.5">
						{category.shortcuts.map((shortcut) => (
							<div key={shortcut.id} className="flex items-center justify-between py-2 px-3 bg-neutral-800/50 rounded-lg group">
								<div className="flex-1 min-w-0">
									<div className="text-sm font-medium text-white truncate">{shortcut.label}</div>
								</div>

								<div className="flex items-center space-x-2 ml-3">
									{editingId === shortcut.id ? (
										<div className="flex items-center space-x-2">
											<div className="px-2 py-1 bg-blue-600 border border-blue-500 rounded text-xs text-center min-w-[60px] animate-pulse">
												<span className="text-blue-100">Press key...</span>
											</div>
											<button
												onClick={handleCancel}
												className="p-1 bg-neutral-600 hover:bg-neutral-700 text-white cursor-pointer rounded transition-colors"
												title="Cancel (ESC)"
											>
												<XIcon className="w-3 h-3" />
											</button>
										</div>
									) : (
										<kbd
											className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs text-neutral-300 min-w-[60px] text-center cursor-pointer hover:bg-neutral-600 transition-colors"
											onClick={() => handleEditStart(shortcut)}
											title={`Click to edit ${shortcut.label} shortcut`}
										>
											{formatKeyDisplay(shortcut.currentKey)}
										</kbd>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			))}

			{keyError && (
				<div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
					<div className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded px-2 py-1">{keyError}</div>
				</div>
			)}
		</div>
	);
};
