import { useSyncExternalStore } from 'react';
import { Image as ImageIcon, Plus } from 'lucide-react';
import { useStoryboard, useStoryboardDoc } from '../StoryboardContext';
import { updateSymbol } from '../model';
import { assetObjectUrl, assetStore } from '../assets/assetStore';
import type { StoryboardSymbol } from '../types';
import { TextField } from './fields';
import { ImagePickButton } from './ImagePick';
import { useImageIntake } from './useImages';

const rowButton = 'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer';

/** The project's symbol library: boxes saved for reuse. Place an instance, rename, or change the shared image. */
export function SymbolsPopover({ onPlace, notify }: { onPlace: (symbol: StoryboardSymbol) => void; notify: (message: string) => void }) {
	const { commit, storyboardRef } = useStoryboard();
	const storyboard = useStoryboardDoc();
	const intake = useImageIntake(notify);
	useSyncExternalStore(assetStore.subscribe, assetStore.getVersion);

	return (
		<div
			role="dialog"
			aria-label="Symbols"
			className="absolute left-24 top-3 z-20 w-72 max-md:w-auto max-md:right-3 max-h-[60vh] overflow-y-auto rounded-2xl border-2 border-neutral-600/20 bg-neutral-900/95 p-3 shadow-lg space-y-3"
		>
			<div className="text-xs uppercase tracking-wide text-neutral-500">Symbols</div>
			{storyboard.symbols.length === 0 ? (
				<p className="text-xs text-neutral-400">Select an image and choose "Save as symbol" to reuse it in any frame.</p>
			) : null}
			{storyboard.symbols.map((s) => {
				const url = s.assetId ? assetObjectUrl(s.assetId) : undefined;
				return (
					<div key={s.id} className="flex gap-2 items-start" data-symbol-id={s.id}>
						<div className="h-12 w-12 shrink-0 rounded-md border border-dashed border-neutral-600 bg-neutral-800 overflow-hidden grid place-items-center text-[10px] text-neutral-400">
							{url ? <img src={url} alt="" className="h-full w-full object-cover" /> : s.label.slice(0, 8)}
						</div>
						<div className="flex-1 min-w-0 space-y-1">
							<TextField
								label="name"
								name="symbol-label"
								value={s.label}
								onCommit={(v) => (v.trim() ? commit(updateSymbol(storyboardRef.current, s.id, { label: v.trim() }), 'RenameSymbol') : false)}
							/>
							<div className="flex gap-1">
								<button type="button" className={rowButton} onClick={() => onPlace(s)} title="Place in this frame">
									<Plus className="w-3 h-3" /> place
								</button>
								<ImagePickButton
									className={rowButton}
									title="Change the image of every instance"
									ariaLabel={`Change image of ${s.label}`}
									onFile={async (file) => {
										const added = await intake(file);
										if (added && storyboardRef.current.symbols.some((x) => x.id === s.id)) commit(updateSymbol(added.record(storyboardRef.current), s.id, { assetId: added.asset.id }), 'SymbolImage');
									}}
								>
									<ImageIcon className="w-3 h-3" /> image
								</ImagePickButton>
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
