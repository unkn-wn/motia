import { useAudio } from '@contexts/objects/AudioContextObject';
import FullscreenOverlay from './FullscreenOverlay';

interface ProjectLoadingWrapperProps {
	loadingProject: boolean;
	metadataLoaded: boolean;
	children: React.ReactNode;
}

/**
 * Wrapper component that shows loading overlay until all initialization is complete:
 * 1. Project data is loaded (loadingProject = false)
 * 2. Metadata is loaded (title, trim values, etc.)
 * 3. Audio is ready (positioned at trimStart with auto-tracking)
 *
 * Must be used inside AudioProvider to access isReady flag.
 */
export default function ProjectLoadingWrapper({ loadingProject, metadataLoaded, children }: ProjectLoadingWrapperProps) {
	const { isReady } = useAudio();

	// Show loading until ALL conditions are met
	const isLoading = loadingProject || !metadataLoaded || !isReady;

	return (
		<>
			{isLoading && <FullscreenOverlay message="Loading project…" />}
			{children}
		</>
	);
}
