import { useCallback, useEffect, useRef } from 'react';
import { useStoryboard } from '../StoryboardContext';
import { addAsset, newId } from '../model';
import { ImageRejected, prepareImage } from '../assets/images';
import { putAsset } from '../assets/localAssets';
import { primeAsset } from '../assets/assetStore';
import type { AssetMeta, StoryboardDoc } from '../types';

/**
 * Takes an image file in: checks it's a raster image, downscales it, stores it on this device (never in the
 * cloud) and returns its metadata plus a way to record it in the board. Refusals go to `notify`. Returns null
 * when the project changed while the image was being read (nothing is recorded in the other project).
 */
export function useImageIntake(notify: (message: string) => void) {
	const { projectId } = useStoryboard();
	const currentProject = useRef(projectId);
	useEffect(() => {
		currentProject.current = projectId;
	}, [projectId]);
	return useCallback(
		async (file: File | Blob): Promise<{ asset: AssetMeta; record: (doc: StoryboardDoc) => StoryboardDoc } | null> => {
			if (!projectId) {
				notify('Images can be added once the project is saved.');
				return null;
			}
			try {
				const image = await prepareImage(file);
				const asset: AssetMeta = { id: newId('a_'), mime: image.mime, width: image.width, height: image.height };
				await putAsset({ ...asset, projectId, blob: image.blob });
				if (currentProject.current !== projectId) return null;
				await primeAsset(asset.id, image.blob);
				return { asset, record: (doc) => addAsset(doc, asset) };
			} catch (err) {
				const full = err instanceof DOMException && err.name === 'QuotaExceededError';
				notify(err instanceof ImageRejected ? err.message : full ? 'This device is out of storage space for images.' : 'This image could not be added.');
				return null;
			}
		},
		[projectId, notify]
	);
}
