// Audio files motia takes in (upload, drop, import), by extension: the type to give a file that arrives without one.
const AUDIO_TYPES: Record<string, string> = {
	mp3: 'audio/mpeg',
	wav: 'audio/wav',
	m4a: 'audio/mp4',
	aac: 'audio/aac',
	flac: 'audio/flac',
	ogg: 'audio/ogg',
	oga: 'audio/ogg',
	opus: 'audio/ogg',
};

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

/** The audio type for a file name, or '' when the extension isn't one we know. */
export const audioTypeOf = (name: string): string => AUDIO_TYPES[extensionOf(name)] ?? '';
