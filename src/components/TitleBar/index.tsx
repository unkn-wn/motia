import React, { memo } from 'react';
import { ProjectTitle } from './ProjectTitle';
import { SaveStatus } from './SaveStatus';
import { MonitorPlay } from 'lucide-react';
import { ExportButton } from './ExportButton';

interface TitleBarProps {
	projectTitle: string;
	onTitleChange: (newTitle: string) => Promise<void>;
	saving: boolean;
	lastSavedAt: Date | null;
	onSaveClick?: () => void;
	disabled?: boolean;
	hasUnsavedChanges?: boolean;
	payloadBytes?: number | null;
	storyboardHeld?: boolean;
	storyboardUnreadable?: boolean;
	/** The floating preview of the frame at the playhead */
	previewOpen?: boolean;
	onTogglePreview?: () => void;
	/** Builds and downloads the project's `.motia.zip` */
	onExport?: (includeAudio: boolean, onProgress: (fraction: number) => void) => Promise<string[]>;
}

const TitleBarComponent: React.FC<TitleBarProps> = ({
	projectTitle,
	onTitleChange,
	saving,
	lastSavedAt,
	onSaveClick,
	disabled = false,
	hasUnsavedChanges = false,
	payloadBytes = null,
	storyboardHeld = false,
	storyboardUnreadable = false,
	previewOpen = false,
	onTogglePreview,
	onExport,
}) => {
	return (
		<div className="fixed top-3 left-3 z-40 flex items-center gap-2 select-none">
			<SaveStatus
				saving={saving}
				lastSavedAt={lastSavedAt}
				onClick={onSaveClick}
				hasUnsavedChanges={hasUnsavedChanges}
				payloadBytes={payloadBytes}
				storyboardHeld={storyboardHeld}
				storyboardUnreadable={storyboardUnreadable}
			/>
			<ProjectTitle title={projectTitle} onTitleChange={onTitleChange} disabled={disabled} />
			{onTogglePreview ? (
				<button
					type="button"
					onClick={onTogglePreview}
					aria-pressed={previewOpen}
					title={previewOpen ? 'Hide preview' : 'Show preview'}
					className={`h-6 w-6 grid place-items-center rounded-md cursor-pointer transition-colors ${previewOpen ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200'}`}
				>
					<MonitorPlay className="w-4 h-4" />
				</button>
			) : null}
			{onExport ? <ExportButton onExport={onExport} /> : null}
		</div>
	);
};

export const TitleBar = memo(TitleBarComponent);
