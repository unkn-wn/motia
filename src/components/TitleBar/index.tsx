import React, { memo } from 'react';
import { ProjectTitle } from './ProjectTitle';
import { SaveStatus } from './SaveStatus';

interface TitleBarProps {
	projectTitle: string;
	onTitleChange: (newTitle: string) => Promise<void>;
	saving: boolean;
	lastSavedAt: Date | null;
	onSaveClick?: () => void;
	disabled?: boolean;
	hasUnsavedChanges?: boolean;
}

const TitleBarComponent: React.FC<TitleBarProps> = ({
	projectTitle,
	onTitleChange,
	saving,
	lastSavedAt,
	onSaveClick,
	disabled = false,
	hasUnsavedChanges = false,
}) => {
	return (
		<div className="fixed top-3 left-3 z-40 flex items-center gap-2 select-none">
			<SaveStatus saving={saving} lastSavedAt={lastSavedAt} onClick={onSaveClick} hasUnsavedChanges={hasUnsavedChanges} />
			<ProjectTitle title={projectTitle} onTitleChange={onTitleChange} disabled={disabled} />
		</div>
	);
};

export const TitleBar = memo(TitleBarComponent);
