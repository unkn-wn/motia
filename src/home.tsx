import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import WaveformPlayer, { type WaveformPlayerRef } from '@components/WaveformPlayer';
import AudioControls from '@components/AudioControlsContainer';
import NotesSidebarConnected from '@components/NotesSidebar/NotesSidebarConnected';
import FloatingDock from '@components/FloatingDock';
import ProfileModal from '@/components/ProfileModal';
import { AudioProvider } from '@contexts/AudioContext';
import FullscreenOverlay from '@/components/FullscreenOverlay';
import ProjectLoadingWrapper from '@/components/ProjectLoadingWrapper';
import { SettingsModal } from '@/components/FloatingDock/Settings/SettingsModal';
// Relink handled by TopBanner
import TopBanner, { RelinkBannerOption, SignInBannerOption } from '@/components/TopBanner';
import HomeLanding from '@components/Home/HomeLanding';
// Sign-in handled by TopBanner
import {
	type KeyboardShortcut,
	createKeyboardHandler,
	// resetAllShortcutsAndPreferences, // Deprecated - no longer using reset button
	isUserTyping,
	getShortcuts,
	setShortcuts as setGlobalShortcuts,
} from '@utils/shortcutsUtils';
import './style.css';
import { Navigate, useNavigate } from '@tanstack/react-router';
import { useFirestoreAutosave } from '@/hooks/useFirestoreAutosave';
import { useNotesState } from '@/hooks/useNotesState';
import { useProjectLifecycle } from '@/hooks/useProjectLifecycle';
import { fetchProjectMeta, updateProjectThumbnail, renameProject, fetchUserSettings } from '@/lib/db';
import { TitleBar } from '@/components/TitleBar';
import SidebarToggle from '@/components/SidebarToggle';

function Home() {
	const navigate = useNavigate();
	const [showSettings, setShowSettings] = useState(false);
	const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>(() => getShortcuts());
	const [isDrawingMode, setIsDrawingMode] = useState(false); // legacy
	const [toolMode, setToolMode] = useState<'draw' | 'select' | 'erase' | null>(null);
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [projectTitle, setProjectTitle] = useState<string>('Untitled Project');
	const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
	const [notesVersion, setNotesVersion] = useState<number | undefined>(undefined);

	const [profileOpen, setProfileOpen] = useState(false);
	const handleOpenProfile = useCallback(() => setProfileOpen(true), []);
	const waveformPlayerRef = useRef<WaveformPlayerRef>(null);
	const relinkInputRef = useRef<HTMLInputElement>(null!);

	// Centralized notes state & actions
	const {
		notes,
		setNotes,
		handleAddNote,
		handleUpdateNote,
		handleDeleteNote,
		handleMoveNote,
		handleAddDrawing,
		handleUpdateDrawing,
		handleChangeNoteColor,
		canUndo,
		canRedo,
		handleUndo,
		handleRedo,
	} = useNotesState();

	// Project lifecycle
	const {
		user,
		authLoading,
		shouldRedirectToProjects,
		redirectTo,
		params,
		audioFile,
		projectId,
		loadingProject,
		loadingWaveform,
		setLoadingWaveform,
		isLoading,
		handleFileSelect,
		handleRelinkSelected,
		handleSignOut,
	} = useProjectLifecycle({ setNotes, onCurrentTimeChange: () => {}, setNotesVersion });

	// Mark as unsaved whenever notes change (user interaction)
	useEffect(() => {
		if (projectId && notes.length > 0) {
			setHasUnsavedChanges(true);
		}
	}, [notes, projectId]);

	// Fetch project metadata (title + thumbnail + trim data) + User Settings (volume) when project loads
	const projectMetaRef = useRef<{ title: string; thumbnail: string | null } | null>(null);
	const [trimStart, setTrimStart] = useState<number | undefined>(undefined);
	const [trimEnd, setTrimEnd] = useState<number | undefined>(undefined);
	const [initialVolume, setInitialVolume] = useState<number | undefined>(undefined);
	const [metadataLoaded, setMetadataLoaded] = useState(false);

	useEffect(() => {
		let cancelled = false;
		setMetadataLoaded(false); // Start loading
		(async () => {
			if (!user) {
				setProjectTitle('Untitled Project');
				projectMetaRef.current = null;
				setTrimStart(0);
				setTrimEnd(0);
				setInitialVolume(0.5);
				setMetadataLoaded(true);
				return;
			}

			// Always fetch user settings (volume) if user exists
			try {
				const settings = await fetchUserSettings(user.uid);
				if (!cancelled && settings?.preferences?.volume !== undefined) {
					setInitialVolume(settings.preferences.volume);
				} else if (!cancelled) {
					setInitialVolume(0.5);
				}
			} catch {
				if (!cancelled) setInitialVolume(0.5);
			}

			if (!projectId) {
				setProjectTitle('Untitled Project');
				projectMetaRef.current = null;
				setTrimStart(0);
				setTrimEnd(0);
				setMetadataLoaded(true);
				return;
			}
			try {
				const meta = await fetchProjectMeta(user.uid, projectId);
				if (cancelled) return;
				const title = meta?.title || audioFile?.name || 'Untitled Project';
				setProjectTitle(title);
				projectMetaRef.current = { title, thumbnail: meta?.thumbnail ?? null };

				// Load trim data from Firebase
				const audioDuration = meta?.audio?.durationSec ?? 0;
				setTrimStart(meta?.audio?.trimStart ?? 0);
				setTrimEnd(meta?.audio?.trimEnd ?? audioDuration);
				setMetadataLoaded(true); // Metadata fully loaded
			} catch {
				setProjectTitle('Untitled Project');
				projectMetaRef.current = null;
				setTrimStart(0);
				setTrimEnd(0);
				setMetadataLoaded(true); // Error, but mark as loaded to not block forever
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [user, projectId, audioFile?.name]);

	// Handle project title change
	const handleTitleChange = useCallback(
		async (newTitle: string) => {
			if (!user || !projectId) return;
			await renameProject(user.uid, projectId, newTitle);
			setProjectTitle(newTitle);
		},
		[user, projectId]
	);

	// Add note via player button

	const handleAddNoteAtCurrentTime = useCallback(() => {
		if (waveformPlayerRef.current) {
			waveformPlayerRef.current.addNoteAtCurrentTime();
		}
	}, []);

	const handleDrawMode = useCallback(() => {
		setToolMode((m) => (m === 'draw' ? null : 'draw'));
		setIsDrawingMode((prev) => !prev);
	}, []);
	const handleSelectMode = useCallback(() => {
		setIsDrawingMode(false);
		setToolMode((m) => (m === 'select' ? null : 'select'));
	}, []);
	const handleEraseMode = useCallback(() => {
		setIsDrawingMode(false);
		setToolMode((m) => (m === 'erase' ? null : 'erase'));
	}, []);
	const handleToggleSidebar = useCallback(() => {
		setSidebarOpen((prev) => !prev);
	}, []);

	const handleShowSettings = useCallback(() => {
		setShowSettings(true);
	}, []);

	// Stable Projects navigation for FloatingDock
	const handleGoProjects = useCallback(() => {
		if (user?.isAnonymous) return; // respect disabled state
		try {
			waveformPlayerRef.current?.pause();
		} catch {
			/* ignore */
		}
		navigate({ to: '/projects' });
	}, [navigate, user?.isAnonymous]);

	// drawing handlers come from notes state

	// Keyboard shortcuts handlers
	const handleUpdateShortcut = useCallback((id: string, newKey: string) => {
		setShortcuts((prev) => {
			const next = prev.map((shortcut) => (shortcut.id === id ? { ...shortcut, currentKey: newKey } : shortcut));
			setGlobalShortcuts(next);
			return next;
		});
	}, []);

	// Reset shortcuts function deprecated (reset button removed from UI)
	// const handleResetShortcuts = useCallback(() => {
	// 	const defaults = resetAllShortcutsAndPreferences();
	// 	setShortcuts(defaults);
	// }, []);

	// Sync local view with global store after sign-in/settings load
	useEffect(() => {
		setShortcuts(getShortcuts());
	}, [user]);

	// Global keyboard event handler
	useEffect(() => {
		// Create action handlers
		const actionHandlers = {
			ADD_NOTE: handleAddNoteAtCurrentTime,
			TOOL_DRAW: handleDrawMode,
			TOOL_SELECT: handleSelectMode,
			TOOL_ERASE: handleEraseMode,
			TOGGLE_SIDEBAR: handleToggleSidebar,
			TOGGLE_PLAYBACK: () => {
				if (waveformPlayerRef.current) {
					waveformPlayerRef.current.playPause();
				}
			},
			REWIND: () => {
				if (waveformPlayerRef.current) {
					waveformPlayerRef.current.skipBack();
				}
			},
			FORWARD: () => {
				if (waveformPlayerRef.current) {
					waveformPlayerRef.current.skipForward();
				}
			},
			VOLUME_UP: () => {
				if (waveformPlayerRef.current) {
					waveformPlayerRef.current.volumeUp();
				}
			},
			VOLUME_DOWN: () => {
				if (waveformPlayerRef.current) {
					waveformPlayerRef.current.volumeDown();
				}
			},
		};

		// Create the centralized keyboard handler
		const keyboardHandler = createKeyboardHandler(shortcuts, actionHandlers);

		window.addEventListener('keydown', keyboardHandler);
		return () => window.removeEventListener('keydown', keyboardHandler);
	}, [shortcuts, handleAddNoteAtCurrentTime, handleDrawMode, handleSelectMode, handleEraseMode, handleToggleSidebar]);

	// note handlers provided by notes state

	const handleJumpToTime = useCallback((time: number) => {
		if (waveformPlayerRef.current) {
			waveformPlayerRef.current.seekToTime(time);
		}
	}, []);

	// color + undo/redo + sign out provided by hooks

	// Global Undo/Redo (Ctrl/Cmd+Z, Ctrl+Shift+Z only)
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (isUserTyping()) return;
			const isMeta = e.ctrlKey || e.metaKey;
			const key = e.key.toLowerCase();
			if (!isMeta) return;
			// Redo: Ctrl+Shift+Z only
			if (key === 'z' && e.shiftKey) {
				e.preventDefault();
				handleRedo();
				return;
			}
			// Undo: Ctrl+Z
			if (key === 'z') {
				e.preventDefault();
				handleUndo();
			}
		};
		const opts = { capture: true } as AddEventListenerOptions;
		window.addEventListener('keydown', onKeyDown, opts);
		return () => window.removeEventListener('keydown', onKeyDown as EventListener, opts);
	}, [handleUndo, handleRedo]);

	// Autosave notes to Firestore when possible
	const {
		saving,
		lastSavedAt,
		saveError,
		flush: flushAutosave,
	} = useFirestoreAutosave({
		uid: user?.uid,
		projectId,
		notes,
		notesVersion,
		setNotesVersion,
	});

	// Reset unsaved changes flag when save completes
	// Triggers whenever lastSavedAt updates (new save) regardless of saving state
	useEffect(() => {
		if (lastSavedAt) {
			setHasUnsavedChanges(false);
		}
	}, [lastSavedAt]);

	// Manual save via Ctrl/Cmd+S
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const isMeta = e.ctrlKey || e.metaKey;
			if (!isMeta) return;
			if (e.key.toLowerCase() === 's') {
				e.preventDefault();
				try {
					flushAutosave();
				} catch {
					/* ignore */
				}
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [flushAutosave]);

	// Relink audio handlers for project routes when audio is missing locally
	const handleRelinkClick = useCallback(() => {
		relinkInputRef.current?.click();
	}, []);
	const handleRelinkInputChange = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0] ?? null;
			await handleRelinkSelected(file);
			if (relinkInputRef.current) relinkInputRef.current.value = '';
		},
		[handleRelinkSelected]
	);

	const showGlobalProjectOverlay = useMemo(() => {
		// Only show global overlay for relink scenario (project exists but no audio file)
		// The normal case (with audio file) uses ProjectLoadingWrapper instead
		return params.projectId && !audioFile && (authLoading || loadingProject || loadingWaveform);
	}, [params.projectId, audioFile, authLoading, loadingProject, loadingWaveform]);

	// Generate and persist a small thumbnail once when waveform is ready - uses cached metadata to avoid duplicate fetch
	useEffect(() => {
		let cancelled = false;
		(async () => {
			if (!user || !projectId) return;
			if (loadingWaveform) return; // wait for waveform ready
			const ref = waveformPlayerRef.current;
			if (!ref || !ref.exportThumbnail) return;
			try {
				// Use cached metadata if available, otherwise fetch
				const existing = projectMetaRef.current?.thumbnail ?? null;
				const dataUrl = ref.exportThumbnail(480, 120);
				if (!dataUrl) return;
				if (cancelled) return;
				// Skip update if thumbnail appears unchanged (cheap heuristic)
				if (existing && existing.startsWith('data:') && existing.length === dataUrl.length) return;
				await updateProjectThumbnail(user.uid, projectId, dataUrl);
				// Update cache
				if (projectMetaRef.current) {
					projectMetaRef.current.thumbnail = dataUrl;
				}
			} catch {
				// ignore thumbnail errors
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [user, projectId, loadingWaveform]);

	// Memoize text notes count to avoid unnecessary rerenders in toggle
	const textNotesCount = useMemo(() => notes.filter((n) => n.type !== 'drawing').length, [notes]);

	return (
		<div className="min-h-dvh" style={{ backgroundColor: 'var(--bg-primary)' }}>
			{shouldRedirectToProjects ? <Navigate to="/projects" /> : null}
			{redirectTo && redirectTo !== 'PROJECTS' ? <Navigate to="/project/$projectId" params={{ projectId: redirectTo }} /> : null}
			{/* Top banner orchestrator: ensures only one banner shows (Relink > Sign-in) */}
			<TopBanner
				options={[
					RelinkBannerOption({
						show: !audioFile && !!params.projectId,
						isLoading,
						onRelinkClick: handleRelinkClick,
						fileInputRef: relinkInputRef,
						onFileSelected: handleRelinkInputChange,
					}),
					SignInBannerOption({ show: !!user?.isAnonymous }),
				]}
			/>
			{showGlobalProjectOverlay && <FullscreenOverlay message="Loading project…" />}

			{!audioFile ? (
				params.projectId ? (
					<AudioProvider initialTrimStart={trimStart} initialTrimEnd={trimEnd} initialVolume={initialVolume}>
						{/* Settings Modal - unified settings with tabs */}
						<SettingsModal
							isOpen={showSettings}
							onClose={() => setShowSettings(false)}
							projectId={projectId}
							shortcuts={shortcuts}
							onUpdateShortcut={handleUpdateShortcut}
						/>
						<div className="relative h-dvh overflow-hidden">
							{/* Relink banner handled by TopBanner to avoid overlap */}

							{/* Notes and UI still render against a default waveform */}
							<WaveformPlayer
								ref={waveformPlayerRef}
								audioFile={null}
								onLoadingChange={setLoadingWaveform}
								onAddNote={handleAddNote}
								notes={notes}
								onUpdateNote={handleUpdateNote}
								onDeleteNote={handleDeleteNote}
								onMoveNote={handleMoveNote}
								isDrawingMode={isDrawingMode}
								onAddDrawing={handleAddDrawing}
								onUpdateDrawing={handleUpdateDrawing}
								toolMode={toolMode}
							/>
							<AudioControls />
							<FloatingDock
								onAddNote={handleAddNoteAtCurrentTime}
								onShowShortcuts={handleShowSettings}
								canAddNote={true}
								isDrawingMode={isDrawingMode}
								onToggleDrawingMode={handleDrawMode}
								onSelectMode={handleSelectMode}
								onEraseMode={handleEraseMode}
								toolMode={toolMode}
								onUndo={handleUndo}
								onRedo={handleRedo}
								canUndo={canUndo}
								canRedo={canRedo}
								onOpenProfile={handleOpenProfile}
								onGoHome={handleGoProjects}
								disableGoHome={!!user?.isAnonymous}
							/>
							{/* Sidebar toggle + Notes sidebar remain available */}
							<SidebarToggle open={sidebarOpen} setOpen={setSidebarOpen} textNotesCount={textNotesCount} />
							<div
								data-prevent-erase
								className={`fixed right-0 top-8 h-full z-40 transform transition-transform duration-300 ease-in-out ${
									sidebarOpen ? 'translate-x-0' : 'translate-x-full'
								}`}
							>
								<NotesSidebarConnected
									notes={notes}
									onDeleteNote={handleDeleteNote}
									onJumpToTime={handleJumpToTime}
									onChangeNoteColor={handleChangeNoteColor}
									onUpdateNote={handleUpdateNote}
									onClose={() => setSidebarOpen(false)}
								/>
							</div>
						</div>
					</AudioProvider>
				) : (
					<HomeLanding onUpload={handleFileSelect} uploading={isLoading} onSignOut={handleSignOut} />
				)
			) : (
				<AudioProvider initialTrimStart={trimStart} initialTrimEnd={trimEnd} initialVolume={initialVolume}>
					{/* Settings Modal - unified settings with tabs */}
					<SettingsModal
						isOpen={showSettings}
						onClose={() => setShowSettings(false)}
						projectId={projectId}
						shortcuts={shortcuts}
						onUpdateShortcut={handleUpdateShortcut}
					/>
					<ProjectLoadingWrapper loadingProject={loadingProject} metadataLoaded={metadataLoaded}>
						<div className="relative h-screen overflow-hidden">
							{saveError && (
								<div className="absolute top-1/2 left-0 right-0 z-50 flex justify-center pointer-events-none">
									<div className="bg-red-900 text-white px-4 py-2 rounded shadow-lg font-bold pointer-events-auto">
										{saveError.message === 'Conflict: Remote version is newer'
											? 'Sync Conflict: This project was updated on another device. Please refresh to avoid overwriting data.'
											: 'Error saving changes. Please check your connection.'}
									</div>
								</div>
							)}
							<TitleBar
								projectTitle={projectTitle}
								onTitleChange={handleTitleChange}
								saving={saving}
								lastSavedAt={lastSavedAt}
								onSaveClick={flushAutosave}
								disabled={!user || !projectId}
								hasUnsavedChanges={hasUnsavedChanges}
							/>
							<WaveformPlayer
								ref={waveformPlayerRef}
								audioFile={audioFile}
								onLoadingChange={setLoadingWaveform}
								onAddNote={handleAddNote}
								notes={notes}
								onUpdateNote={handleUpdateNote}
								onDeleteNote={handleDeleteNote}
								onMoveNote={handleMoveNote}
								isDrawingMode={isDrawingMode}
								onAddDrawing={handleAddDrawing}
								onUpdateDrawing={handleUpdateDrawing}
								toolMode={toolMode}
							/>

							{/* Audio Controls - now outside WaveformPlayer */}
							<AudioControls />

							{/* Floating Dock with Add Note and Settings */}
							<FloatingDock
								onAddNote={handleAddNoteAtCurrentTime}
								onShowShortcuts={handleShowSettings}
								canAddNote={!!audioFile}
								isDrawingMode={isDrawingMode}
								onToggleDrawingMode={handleDrawMode}
								onSelectMode={handleSelectMode}
								onEraseMode={handleEraseMode}
								toolMode={toolMode}
								onUndo={handleUndo}
								onRedo={handleRedo}
								canUndo={canUndo}
								canRedo={canRedo}
								onOpenProfile={handleOpenProfile}
								onGoHome={handleGoProjects}
								disableGoHome={!!user?.isAnonymous}
							/>
							{/* Sidebar Toggle Button - positioned on the side and moves with panel */}
							<SidebarToggle open={sidebarOpen} setOpen={setSidebarOpen} textNotesCount={textNotesCount} />

							{/* Collapsible Sidebar */}
							<div
								data-prevent-erase
								className={`fixed right-0 top-8 h-full z-20 transform transition-transform duration-300 ease-in-out ${
									sidebarOpen ? 'translate-x-0' : 'translate-x-full'
								}`}
							>
								<NotesSidebarConnected
									notes={notes}
									onDeleteNote={handleDeleteNote}
									onJumpToTime={handleJumpToTime}
									onChangeNoteColor={handleChangeNoteColor}
									onUpdateNote={handleUpdateNote}
									onClose={() => setSidebarOpen(false)}
								/>
							</div>
						</div>
					</ProjectLoadingWrapper>
				</AudioProvider>
			)}
			{/* Profile Modal lives at root to overlay */}
			<ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
		</div>
	);
}

export default Home;
