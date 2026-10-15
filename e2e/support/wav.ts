/** A mono 16-bit PCM WAV: a quiet 220 Hz sine with a short click every 0.5 s. Built at test time. */
export function makeWav(seconds = 30, sampleRate = 22050): Buffer {
	const samples = Math.round(seconds * sampleRate);
	const buf = Buffer.alloc(44 + samples * 2);
	buf.write('RIFF', 0);
	buf.writeUInt32LE(36 + samples * 2, 4);
	buf.write('WAVE', 8);
	buf.write('fmt ', 12);
	buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(1, 20); // PCM
	buf.writeUInt16LE(1, 22); // mono
	buf.writeUInt32LE(sampleRate, 24);
	buf.writeUInt32LE(sampleRate * 2, 28);
	buf.writeUInt16LE(2, 32);
	buf.writeUInt16LE(16, 34);
	buf.write('data', 36);
	buf.writeUInt32LE(samples * 2, 40);
	const clickLen = Math.round(0.01 * sampleRate);
	const period = Math.round(0.5 * sampleRate);
	for (let i = 0; i < samples; i++) {
		let v = 0.2 * Math.sin((2 * Math.PI * 220 * i) / sampleRate);
		const inPeriod = i % period;
		if (inPeriod < clickLen) v += 0.7 * (1 - inPeriod / clickLen);
		buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2);
	}
	return buf;
}
