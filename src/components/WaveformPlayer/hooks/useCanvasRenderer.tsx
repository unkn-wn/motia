import { useCallback, useRef } from 'react';
import { useWaveformContext } from '@contexts/objects/WaveformContextObject';
import { useAudio } from '@contexts/objects/AudioContextObject';
import { decompressSession } from '@utils/advancedCompression';
import { getColorCode } from '@utils/colorUtils';
import type { Note } from '@types';

export const useCanvasRenderer = () => {
  const {
    transform,
    notes,
    isDrawingMode,
    currentStroke,
    isDrawing,
    NOTE_LABEL_HIDE_THRESHOLD,
    canvasRef
  } = useWaveformContext();

  const { currentTime, duration, waveformData } = useAudio();

  // Caches
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decompressedCacheRef = useRef<Map<string, { key: string; strokes: any[] }>>(new Map());
  const noteLayoutCacheRef = useRef<Map<string, { key: string; lines: string[]; noteHeight: number }>>(new Map());

  // Layout helpers
  const getWaveformDims = useCallback(
    (width: number, height: number) => {
      const waveformHeight = Math.max(height * 3, duration * 100);
      const waveformWidth = 120;
      const waveformX = (width - waveformWidth) / 2;
      return { waveformHeight, waveformWidth, waveformX };
    },
    [duration]
  );

  // Draw a drawing note from compressed data (with cache)
  const renderDrawingOnCanvas = useCallback(
    (ctx: CanvasRenderingContext2D, note: Note) => {
      if (!note.drawing || !note.drawing.compressed) return;
      try {
        // Build a stable cache key that changes whenever the compressed payload changes.
        // Using just length fails when session compression keeps array length at 1.
        let rev = note.drawing.compressedSize;
        if (rev == null) {
          // Fallback: compute a lightweight revision from JSON length
          try {
            rev = JSON.stringify(note.drawing.compressed).length;
          } catch {
            rev = Date.now();
          }
        }
        const cacheKey = `${note.id}:${rev}`;
        const cached = decompressedCacheRef.current.get(note.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let decompressed: any[];
        if (cached && cached.key === cacheKey) {
          decompressed = cached.strokes;
        } else {
          decompressed = decompressSession(note.drawing.compressed as unknown as import('@types').CompressedStroke[]);
          decompressedCacheRef.current.set(note.id, { key: cacheKey, strokes: decompressed });
        }

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const stroke of decompressed) {
          const points = stroke.points as Array<{ x: number; y: number }>;
          if (!points || points.length < 2) continue;
          ctx.strokeStyle = stroke.color || '#9ca3af';
          ctx.lineWidth = stroke.strokeWidth || 2;
          ctx.beginPath();
          ctx.moveTo(note.canvasX + points[0].x, note.canvasY + points[0].y);
          for (let i = 1; i < points.length; i++) {
            ctx.lineTo(note.canvasX + points[i].x, note.canvasY + points[i].y);
          }
          ctx.stroke();
        }
      } catch {
        // keep rendering resilient
      }
    },
    []
  );

  // Draw only the live stroke; completed strokes are saved to note and rendered via renderDrawingsOnCanvas
  const renderCurrentDrawing = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      // Live stroke
      if (isDrawing && currentStroke.length > 0) {
        ctx.strokeStyle = '#6b7079';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
        for (let i = 1; i < currentStroke.length; i++) ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
        ctx.stroke();
      }
    },
  [isDrawing, currentStroke]
  );

  // Draw all drawing notes
  const renderDrawingsOnCanvas = useCallback(
    (ctx: CanvasRenderingContext2D, notesList: Note[]) => {
      for (const note of notesList) {
        if (note.type === 'drawing' && note.drawing) {
          renderDrawingOnCanvas(ctx, note);
        }
      }
    },
    [renderDrawingOnCanvas]
  );

  // Draw text notes and connectors
  const renderNotesOnCanvas = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      notesList: Note[],
      waveformX: number,
      waveformWidth: number,
      waveformHeight: number,
      dur: number
    ) => {
      const showNoteLabels = transform.scale > NOTE_LABEL_HIDE_THRESHOLD;

      for (const note of notesList) {
        if (note.type === 'drawing') continue;

        // Culling (convert world Y to screen Y)
        const screenTop = transform.offsetY + transform.scale * note.canvasY;
        const approxHeight = showNoteLabels ? 200 : 16;
        const screenBottom = screenTop + approxHeight;
        const { h } = sizeRef.current;
        if (screenBottom < -200 || screenTop > h + 200) continue;

        // Connector from waveform point to note center/dot
        const timeProgress = dur > 0 ? note.time / dur : 0;
        const waveformCanvasY = timeProgress * waveformHeight;
        ctx.strokeStyle = '#6b7280';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(waveformX + waveformWidth / 2, waveformCanvasY);

        if (showNoteLabels) {
          // Need center of note rect: compute dimensions below; use cached height for line endpoint
          const noteWidth = 240;
          const padding = 8;
          const headerHeight = 40;
          const contentLineHeight = 24;
          const layoutKey = `${note.id}:${note.content ?? ''}`;
          let layout = noteLayoutCacheRef.current.get(note.id);
          if (!layout || layout.key !== layoutKey) {
            // Support CRLF and preserve explicit blank lines
            const rawLines = note.content ? note.content.split(/\r?\n/) : ['Empty note'];
            const lines: string[] = [];
            ctx.save();
            ctx.font = '18px system-ui, -apple-system, sans-serif';
            for (const raw of rawLines) {
              const line = raw.replace(/\r/g, '');
              if (line.trim() === '') {
                // Preserve empty line
                lines.push('');
                continue;
              }
              const words = line.split(' ');
              let current = '';
              for (const w of words) {
                const test = current ? current + ' ' + w : w;
                const widthMeasure = ctx.measureText(test).width;
                if (widthMeasure > noteWidth - padding * 2 - 6) {
                  if (current) lines.push(current);
                  current = w;
                } else {
                  current = test;
                }
              }
              if (current) lines.push(current);
            }
            ctx.restore();
            const contentHeight = Math.max(24, lines.length * contentLineHeight);
            const noteHeight = headerHeight + contentHeight + padding;
            layout = { key: layoutKey, lines, noteHeight };
            noteLayoutCacheRef.current.set(note.id, layout);
          }
          const noteHeight = layout.noteHeight;
          ctx.lineTo(note.canvasX + noteWidth / 2, note.canvasY + noteHeight / 2);
        } else {
          ctx.lineTo(note.canvasX, note.canvasY);
        }

        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        // Dot at waveform endpoint (colored)
        ctx.fillStyle = getColorCode(note.color);
        ctx.strokeStyle = '#2d2d2d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(waveformX + waveformWidth / 2, waveformCanvasY, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        if (!showNoteLabels) continue;

        // Draw card
        const noteWidth = 240;
        const padding = 8;
        const headerHeight = 40;
        const contentLineHeight = 24;
        const layoutKey = `${note.id}:${note.content ?? ''}`;
        let layout = noteLayoutCacheRef.current.get(note.id)!;
        if (!layout || layout.key !== layoutKey) {
          // Support CRLF and preserve explicit blank lines
          const rawLines = note.content ? note.content.split(/\r?\n/) : ['Empty note'];
          const lines: string[] = [];
          ctx.save();
          ctx.font = '18px system-ui, -apple-system, sans-serif';
          for (const raw of rawLines) {
            const line = raw.replace(/\r/g, '');
            if (line.trim() === '') {
              lines.push('');
              continue;
            }
            const words = line.split(' ');
            let current = '';
            for (const w of words) {
              const test = current ? current + ' ' + w : w;
              const widthMeasure = ctx.measureText(test).width;
              if (widthMeasure > noteWidth - padding * 2 - 6) {
                if (current) lines.push(current);
                current = w;
              } else {
                current = test;
              }
            }
            if (current) lines.push(current);
          }
          ctx.restore();
          const contentHeight = Math.max(24, lines.length * contentLineHeight);
          const noteHeight = headerHeight + contentHeight + padding;
          layout = { key: layoutKey, lines, noteHeight };
          noteLayoutCacheRef.current.set(note.id, layout);
        }
        const contentLines = layout.lines;
        const noteHeight = layout.noteHeight;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.roundRect(note.canvasX + 4, note.canvasY + 4, noteWidth, noteHeight, 4);
        ctx.fill();

        // Background
        ctx.beginPath();
        ctx.fillStyle = 'rgba(38, 38, 38, 1)';
        ctx.roundRect(note.canvasX, note.canvasY, noteWidth, noteHeight, 4);
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(82, 82, 82, 1)';
        ctx.lineWidth = 1;
        ctx.roundRect(note.canvasX, note.canvasY, noteWidth, noteHeight, 4);
        ctx.stroke();

        // Colored left border
        ctx.beginPath();
        ctx.fillStyle = getColorCode(note.color);
        ctx.roundRect(note.canvasX, note.canvasY, 4, noteHeight, [4, 0, 0, 4]);
        ctx.fill();

        // Header
        ctx.fillStyle = '#a3a3a3';
        ctx.font = '16px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'left';
        const minutes = Math.floor(note.time / 60);
        const seconds = Math.floor(note.time % 60);
        const timeLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        ctx.fillStyle = '#a3a3a3';
        ctx.font = '14px system-ui';
        ctx.fillText('🕐', note.canvasX + padding, note.canvasY + 24);
        ctx.fillText(timeLabel, note.canvasX + padding + 20, note.canvasY + 24);

        // Content
        ctx.fillStyle = '#e5e5e5';
        ctx.font = '18px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'left';
        const startY = note.canvasY + headerHeight + padding;
        for (let i = 0; i < contentLines.length; i++) {
          ctx.fillText(contentLines[i], note.canvasX + padding + 6, startY + i * contentLineHeight);
        }
      }
    },
    [transform.scale, transform.offsetY, NOTE_LABEL_HIDE_THRESHOLD]
  );

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Prune caches for removed notes
  const idSet = new Set(notes.map((n: Note) => n.id));
    for (const key of decompressedCacheRef.current.keys()) {
      if (!idSet.has(key)) decompressedCacheRef.current.delete(key);
    }
    for (const key of noteLayoutCacheRef.current.keys()) {
      if (!idSet.has(key)) noteLayoutCacheRef.current.delete(key);
    }

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    sizeRef.current = { w: width, h: height };
    const dpr = window.devicePixelRatio || 1;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const targetW = Math.max(1, Math.floor(width * dpr));
    const targetH = Math.max(1, Math.floor(height * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Apply world transform to all scene elements so panning/zoom affects everything
    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);
    ctx.scale(transform.scale, transform.scale);

    const { waveformHeight, waveformWidth, waveformX } = getWaveformDims(width, height);

    // Waveform background
    ctx.fillStyle = 'rgb(23, 23, 23, 0.8)';
    ctx.fillRect(waveformX - 10, 0, waveformWidth + 20, waveformHeight);

    // Waveform bars and playhead
    if (duration > 0 && waveformData && waveformData.length > 0) {
      const barHeight = waveformHeight / waveformData.length;
      const progress = currentTime / duration;
      for (let i = 0; i < waveformData.length; i++) {
        const amplitude = waveformData[i];
        const y = i * barHeight;
        // Make peaks larger with a mild gain and clamp
        const amplitudeScaled = Math.min(1, amplitude * 1.8);
        const barWidth = amplitudeScaled * waveformWidth;
        const x = waveformX + (waveformWidth - barWidth) / 2;
        const isPlayed = i / waveformData.length < progress;
        ctx.fillStyle = isPlayed ? '#a3a3a3' : '#404040';
        ctx.fillRect(x, y, barWidth, barHeight - 1);
      }
      const indicatorY = progress * waveformHeight;
      ctx.strokeStyle = '#f3f4f6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(waveformX - 20, indicatorY);
      ctx.lineTo(waveformX + waveformWidth + 20, indicatorY);
      ctx.stroke();
      ctx.fillStyle = '#f3f4f6';
      ctx.beginPath();
      ctx.arc(waveformX + waveformWidth / 2, indicatorY, 6, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Time markers every 5 seconds
    if (duration > 0) {
      ctx.fillStyle = '#737373';
      ctx.font = '24px monospace';
      ctx.textAlign = 'center';
      for (let t = 0; t <= duration; t += 5) {
        const y = (t / duration) * waveformHeight;
        const minutes = Math.floor(t / 60);
        const seconds = Math.floor(t % 60);
        const timeLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        ctx.strokeStyle = '#737373';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(waveformX - 10, y);
        ctx.lineTo(waveformX + 10, y);
        ctx.stroke();
        ctx.fillText(timeLabel, waveformX - 50, y + 4);
      }
    }

    // Drawings under notes
    renderDrawingsOnCanvas(ctx, notes);

    // Current drawing session overlay in drawing mode
    if (isDrawingMode) {
      renderCurrentDrawing(ctx);
    }

    // Notes on top
    renderNotesOnCanvas(ctx, notes, waveformX, waveformWidth, waveformHeight, duration);

    ctx.restore();
  }, [canvasRef, notes, transform, currentTime, duration, waveformData, isDrawingMode, getWaveformDims, renderDrawingsOnCanvas, renderCurrentDrawing, renderNotesOnCanvas]);

  return {
    renderDrawingOnCanvas,
    renderCurrentDrawing,
    renderDrawingsOnCanvas,
    renderNotesOnCanvas,
    renderCanvas,
  };
};
