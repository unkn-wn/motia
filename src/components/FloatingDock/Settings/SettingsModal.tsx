import React, { useState } from 'react';
import type { KeyboardShortcut } from '@utils/shortcutsUtils';
import { XIcon } from '@assets/icons'; // RotateCcwIcon commented out with reset button
import Modal from '@/components/Modal';
import { AudioTrimSettings } from './AudioTrimSettings';
import { KeyboardShortcutsContent } from './KeyboardShortcutsContent';

interface SettingsModalProps {
	isOpen: boolean;
	onClose: () => void;
	projectId: string | null;
	shortcuts: KeyboardShortcut[];
	onUpdateShortcut: (id: string, newKey: string) => void;
	// onResetShortcuts removed - reset button deprecated (commented out in UI)
}

type SettingsTab = 'project' | 'global';

/**
 * Unified Settings modal with two tabs:
 * - Project Settings: Audio trimming
 * - Global Settings: Keyboard shortcuts and preferences
 */
export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, projectId, shortcuts, onUpdateShortcut }) => {
	const [activeTab, setActiveTab] = useState<SettingsTab>('project');

	if (!isOpen) return null;

	return (
		<Modal open={isOpen} onClose={onClose}>
			<div className="bg-neutral-900/95 rounded-xl w-full max-w-md -mt-4">
				{/* Header with tabs and controls */}
				<div className="flex items-center border-b border-neutral-700/50">
					{/* Tabs */}
					<div className="flex flex-1">
						<button
							onClick={() => setActiveTab('project')}
							className={`flex-1 px-4 py-3 text-sm font-medium transition-colors cursor-pointer ${
								activeTab === 'project' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-neutral-400 hover:text-neutral-200'
							}`}
						>
							Project Settings
						</button>
						<button
							onClick={() => setActiveTab('global')}
							className={`flex-1 px-4 py-3 text-sm font-medium transition-colors cursor-pointer ${
								activeTab === 'global' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-neutral-400 hover:text-neutral-200'
							}`}
						>
							Global Settings
						</button>
					</div>

					{/* Controls */}
					<div className="flex items-center space-x-1 ">
						{/* Reset button temporarily disabled - users rarely need it */}
						{/* {activeTab === 'global' && (
							<button
								onClick={onResetShortcuts}
								className="p-1.5 hover:bg-neutral-800 rounded cursor-pointer text-neutral-400 hover:text-white transition-colors"
								title="Reset to defaults"
							>
								<RotateCcwIcon className="w-3.5 h-3.5" />
							</button>
						)} */}
						<button
							onClick={onClose}
							className="p-1.5 hover:bg-neutral-800 rounded cursor-pointer text-neutral-400 hover:text-white transition-colors"
						>
							<XIcon className="w-3.5 h-3.5" />
						</button>
					</div>
				</div>

				{/* Content */}
				<div className="max-h-96 overflow-y-auto">
					{activeTab === 'project' && projectId ? (
						<AudioTrimSettings projectId={projectId} />
					) : activeTab === 'project' ? (
						<div className="text-center py-8 text-neutral-500">
							<p>No project loaded</p>
						</div>
					) : (
						<div className="p-3">
							<KeyboardShortcutsContent shortcuts={shortcuts} onUpdateShortcut={onUpdateShortcut} />
						</div>
					)}
				</div>
			</div>
		</Modal>
	);
};
