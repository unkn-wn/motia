import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import WaveformPlayer, { type WaveformPlayerRef } from '@components/WaveformPlayer';
import AudioControls from '@components/AudioControlsContainer';
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
	isUserTyping,
	getShortcuts,
	setShortcuts as setGlobalShortcuts,
} from '@utils/shortcutsUtils';
import './style.css';
import { Navigate, useNavigate, useParams } from '@tanstack/react-router';
import { useFirestoreAutosave } from '@/hooks/useFirestoreAutosave';
import { useNotesState } from '@/hooks/useNotesState';
import { useProjectLifecycle } from '@/hooks/useProjectLifecycle';
import { fetchProjectMeta, updateProjectThumbnail, renameProject, fetchUserSettings, updateProjectOrientation } from '@/lib/db';
import { TitleBar } from '@/components/TitleBar';
import { OrientationBanner } from '@/components/WaveformPlayer/components/OrientationBanner';
import type { CanvasOrientation } from '@/types';
import { useTestHooks } from '@/lib/testHooks';
import { useStoryboardState } from '@/features/storyboard/useStoryboardState';
import { StoryboardContext, StoryboardDocContext, type StoryboardContextValue } from '@/features/storyboard/StoryboardContext';
import { FrameEditor } from '@/features/storyboard/editor/FrameEditor';
import { PreviewMonitor } from '@/features/storyboard/PreviewMonitor';
import { clearAssetCache } from '@/features/storyboard/assets/assetStore';
import { durationStore, trimStore } from '@components/AudioControls/state';
import { history } from '@utils/history';
import { PROJECT_TOO_BIG_ERROR } from '@/lib/notesPayload';

function Home() {
	const navigate = useNavigate();
	const routeParams = useParams({ strict: false }) as { projectId?: string };
	const [showSettings, setShowSettings] = useState(false);
	const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>(() => getShortcuts());
	const [isDrawingMode, setIsDrawingMode] = useState(false); // legacy
	const [toolMode, setToolMode] = useState<'draw' | 'select' | 'erase' | null>(null);
	// Index rail along the canvas edge (key B); shown by default
	const [railOpen, setRailOpen] = useState(true);
	const [projectTitle, setProjectTitle] = useState<string>('Untitled Project');
	const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
	const [notesVersion, setNotesVersion] = useState<number | undefined>(undefined);
	const [orientation, setOrientation] = useState<CanvasOrientation>(() => {
		const targetId = routeParams.projectId;
		if (targetId) {
			try {
				const cached = localStorage.getItem(`motia_orientation_${targetId}`);
				if (cached === 'horizontal' || cached === 'vertical') return cached;
			} catch { /* ignore */ }
		}
		return 'vertical';
	});
	const [showOrientationBanner, setShowOrientationBanner] = useState(false);

	const [profileOpen, setProfileOpen] = useState(false);
	const handleOpenProfile = useCallback(() => setProfileOpen(true), []);
	const waveformPlayerRef = useRef<WaveformPlayerRef>(null);
	const relinkInputRef = useRef<HTMLInputElement>(null!);

	// Centralized notes state & actions
	const {
		notes,
		notesRef,
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

	// Storyboard frames, symbols and board format
	const storyboardState = useStoryboardState();
	// Floating preview of the frame at the playhead (off by default)
	const [previewOpen, setPreviewOpen] = useState(false);
	const togglePreview = useCallback(() => setPreviewOpen((v) => !v), []);
	// Frame open in the frame editor (full overlay)
	const [editingFrameId, setEditingFrameId] = useState<string | null>(null);
	const { storyboard, storyboardToSave, storyboardStatus, changedSinceLoad: storyboardChanged, actions: storyboardActions } = storyboardState;
	const { loadStoryboard, resetStoryboard } = storyboardActions;

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
	} = useProjectLifecycle({
		setNotes,
		loadStoryboard,
		resetStoryboard,
		onCurrentTimeChange: () => {},
		setNotesVersion,
	});

	// Undo/redo never crosses projects; image URLs are per project
	useEffect(() => {
		history.setProject(projectId);
		clearAssetCache();
	}, [projectId]);

	// Mark as unsaved whenever notes change (user interaction)
	useEffect(() => {
		if (projectId && notes.length > 0) {
			setHasUnsavedChanges(true);
		}
	}, [notes, projectId]);
	useEffect(() => {
		if (projectId && storyboardChanged) setHasUnsavedChanges(true);
	}, [storyboard, storyboardChanged, projectId]);

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
				setTrimEnd(undefined);
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
				setTrimEnd(undefined);
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
				setTrimEnd(meta?.audio?.trimEnd !== undefined ? meta.audio.trimEnd : (audioDuration > 0 ? audioDuration : undefined));

				// Load orientation or prompt if unset
				if (meta?.orientation) {
					setOrientation(meta.orientation);
					try { localStorage.setItem(`motia_orientation_${projectId}`, meta.orientation); } catch { /* ignore */ }
					setShowOrientationBanner(false);
				} else {
					// Check local cache first before defaulting to vertical
					let cachedOrientation: CanvasOrientation | null = null;
					try {
						const c = localStorage.getItem(`motia_orientation_${projectId}`);
						if (c === 'horizontal' || c === 'vertical') cachedOrientation = c;
					} catch { /* ignore */ }

					if (cachedOrientation) {
						setOrientation(cachedOrientation);
						setShowOrientationBanner(false);
					} else {
						setOrientation('vertical');
						setShowOrientationBanner(true);
					}
				}

				setMetadataLoaded(true); // Metadata fully loaded
			} catch {
				setProjectTitle('Untitled Project');
				projectMetaRef.current = null;
				setTrimStart(0);
				setTrimEnd(undefined);
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

	// Export: everything is read when the button is pressed (no re-render while notes, board or playhead change)
	const storyboardRef = storyboardActions.storyboardRef;
	const handleExport = useCallback(
		async (includeAudio: boolean, onProgress: (fraction: number) => void) => {
			const { exportProject } = await import('@/features/storyboard/io/exportZip');
			const duration = durationStore.getSnapshot();
			const [trimStart, trimEnd] = trimStore.getSnapshot();
			return exportProject({
				title: projectTitle,
				orientation,
				notes: notesRef.current,
				storyboard: storyboardRef.current,
				audio: audioFile ? { file: audioFile, durationSec: duration, trimStart, trimEnd: trimEnd > 0 ? trimEnd : duration } : undefined,
				includeAudio,
				onProgress,
			});
		},
		[projectTitle, orientation, notesRef, storyboardRef, audioFile]
	);

	// Handle orientation change
	const handleSelectOrientation = useCallback(
		async (newOrientation: CanvasOrientation) => {
			setOrientation(newOrientation);
			setShowOrientationBanner(false);
			if (projectId) {
				try { localStorage.setItem(`motia_orientation_${projectId}`, newOrientation); } catch { /* ignore */ }
			}
			if (user && projectId) {
				await updateProjectOrientation(user.uid, projectId, newOrientation);
			}
		},
		[user, projectId]
	);

	// Add note via player button

	const handleAddFrameAtCurrentTime = useCallback(() => {
		waveformPlayerRef.current?.addFrameAtCurrentTime();
	}, []);

	// Opening the frame editor deselects the canvas tool
	const openFrameEditor = useCallback((id: string) => {
		setToolMode(null);
		setIsDrawingMode(false);
		setEditingFrameId(id);
	}, []);
	// Closing the editor saves right away (the autosave hook is created further down)
	const flushAutosaveRef = useRef<() => void>(() => {});
	const closeFrameEditor = useCallback(() => {
		setEditingFrameId(null);
		flushAutosaveRef.current();
	}, []);
	useEffect(() => {
		setEditingFrameId(null);
	}, [projectId]);
	const placeCard = useCallback(
		(time: number) => waveformPlayerRef.current?.cardPositionAt(time) ?? { canvasX: -410, canvasY: 0 },
		[]
	);

	// The canvas is covered while the editor is open: it keeps the frames it had, so editor drags don't re-render it
	const canvasFramesRef = useRef(storyboard.frames);
	const canvasBoardRef = useRef(storyboard.board);
	const canvasSymbolsRef = useRef(storyboard.symbols);
	if (editingFrameId === null) {
		canvasFramesRef.current = storyboard.frames;
		canvasBoardRef.current = storyboard.board;
		canvasSymbolsRef.current = storyboard.symbols;
	}
	const canvasFrames = editingFrameId === null ? storyboard.frames : canvasFramesRef.current;
	const canvasBoard = editingFrameId === null ? storyboard.board : canvasBoardRef.current;
	const canvasSymbols = editingFrameId === null ? storyboard.symbols : canvasSymbolsRef.current;

	const storyboardContextValue = useMemo<StoryboardContextValue>(
		() => ({ ...storyboardActions, projectId, editingFrameId, openFrameEditor, closeFrameEditor, placeCard }),
		[storyboardActions, projectId, editingFrameId, openFrameEditor, closeFrameEditor, placeCard]
	);

	// Test-mode state access (no-op outside emulator test mode)
	useTestHooks(waveformPlayerRef, notes, storyboardState, { editingFrameId, openFrameEditor, closeFrameEditor });

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
	const handleToggleRail = useCallback(() => {
		setRailOpen((prev) => !prev);
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

	// Sync local view with global store after sign-in/settings load
	useEffect(() => {
		setShortcuts(getShortcuts());
	}, [user]);

	// Global keyboard event handler
	useEffect(() => {
		// Create action handlers
		const actionHandlers = {
			ADD_NOTE: handleAddNoteAtCurrentTime,
			ADD_FRAME: handleAddFrameAtCurrentTime,
			TOOL_DRAW: handleDrawMode,
			TOOL_SELECT: handleSelectMode,
			TOOL_ERASE: handleEraseMode,
			TOGGLE_SIDEBAR: handleToggleRail,
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
	}, [shortcuts, handleAddNoteAtCurrentTime, handleAddFrameAtCurrentTime, handleDrawMode, handleSelectMode, handleEraseMode, handleToggleRail]);

	// note handlers provided by notes state


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
		payloadBytes,
		storyboardHeld,
		flush: flushAutosave,
	} = useFirestoreAutosave({
		uid: user?.uid,
		projectId,
		notes,
		storyboard: storyboardToSave,
		notesVersion,
		setNotesVersion,
	});

	useLayoutEffect(() => {
		flushAutosaveRef.current = flushAutosave;
	}, [flushAutosave]);

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

	return (
		<StoryboardContext.Provider value={storyboardContextValue}>
		<StoryboardDocContext.Provider value={storyboard}>
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
								frames={canvasFrames}
								board={canvasBoard}
								symbols={canvasSymbols}
								showRail={railOpen}
								onChangeNoteColor={handleChangeNoteColor}
							/>
							<AudioControls />
							<FloatingDock
								onAddNote={handleAddNoteAtCurrentTime}
								onAddFrame={handleAddFrameAtCurrentTime}
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
							<FrameEditor />
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
							{showOrientationBanner && notes.length === 0 && storyboard.frames.length === 0 && (
								<OrientationBanner onSelect={handleSelectOrientation} />
							)}
							{saveError && (
								<div className="absolute top-1/2 left-0 right-0 z-50 flex justify-center pointer-events-none">
									<div className="bg-red-900 text-white px-4 py-2 rounded shadow-lg font-bold pointer-events-auto">
										{saveError.message === 'Conflict: Remote version is newer'
											? 'Sync Conflict: This project was updated on another device. Please refresh to avoid overwriting data.'
											: saveError.message === PROJECT_TOO_BIG_ERROR
												? 'This project is too big to save. Remove some frames, pen strokes or notes.'
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
								payloadBytes={payloadBytes}
								storyboardHeld={storyboardHeld}
								storyboardUnreadable={storyboardStatus === 'unreadable'}
								previewOpen={previewOpen}
								onTogglePreview={togglePreview}
								// A board that couldn't be read isn't exported (the file would look like an empty board)
								onExport={storyboardStatus === 'loaded' ? handleExport : undefined}
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
								frames={canvasFrames}
								board={canvasBoard}
								symbols={canvasSymbols}
								orientation={orientation}
								showRail={railOpen}
								onChangeNoteColor={handleChangeNoteColor}
							/>

							{/* Audio Controls - now outside WaveformPlayer */}
							<AudioControls />

							{/* Floating Dock with Add Note and Settings */}
							<FloatingDock
								onAddNote={handleAddNoteAtCurrentTime}
								onAddFrame={handleAddFrameAtCurrentTime}
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
							<FrameEditor />
							{/* Covered by the frame editor while it is open */}
							{previewOpen && editingFrameId === null ? <PreviewMonitor onClose={togglePreview} /> : null}
						</div>
					</ProjectLoadingWrapper>
				</AudioProvider>
			)}
			{/* Profile Modal lives at root to overlay */}
			<ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
		</div>
		</StoryboardDocContext.Provider>
		</StoryboardContext.Provider>
	);
}

export default Home;
