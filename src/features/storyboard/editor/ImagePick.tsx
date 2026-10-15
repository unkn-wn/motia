import { useRef } from 'react';

// Raster formats only; SVG is never offered (and the bytes are checked again after picking)
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

/** A button that opens the file picker for one image. */
export function ImagePickButton({
	onFile,
	className,
	title,
	children,
	ariaLabel,
}: {
	onFile: (file: File) => void;
	className: string;
	title: string;
	children: React.ReactNode;
	ariaLabel?: string;
}) {
	const input = useRef<HTMLInputElement>(null);
	return (
		<>
			<button type="button" className={className} title={title} aria-label={ariaLabel ?? title} onClick={() => input.current?.click()}>
				{children}
			</button>
			<input
				ref={input}
				type="file"
				accept={ACCEPT}
				className="hidden"
				data-testid={`file-${ariaLabel ?? title}`}
				onChange={(e) => {
					const file = e.target.files?.[0];
					e.target.value = '';
					if (file) onFile(file);
				}}
			/>
		</>
	);
}
