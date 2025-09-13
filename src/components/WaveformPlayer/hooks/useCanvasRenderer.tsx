import { useCallback, useRef } from 'react';
import { useWaveformContext } from '@contexts/objects/WaveformContextObject';
import { useAudio } from '@contexts/objects/AudioContextObject';
import { decompressSession } from '@utils/advancedCompression';
import { getColorCode } from '@utils/colorUtils';
import type { Note } from '@types';

// Centralized canvas renderer: draws waveform, notes, drawings, selection, previews.
// Pure rendering; all interaction state comes from context.
export const useCanvasRenderer = () => {
  const {
    transform,
    notes,
    isDrawingMode,
    currentStroke,
    isDrawing,
    NOTE_LABEL_HIDE_THRESHOLD,
    selectionBox,
    selectedDrawingIds,
    selectedStrokeGroups,
    movingStrokePreview,
    erasingStrokeIds,
    eraserCursor,
    canvasRef
  } = useWaveformContext();

  const { currentTime, duration, waveformData } = useAudio();

  // Small caches to avoid repeated layout/decompression work between frames
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const decompressedCacheRef = useRef<Map<string, { key: string; strokes: import('@types').DrawingStroke[] }>>(new Map());
  const noteLayoutCacheRef = useRef<Map<string, { key: string; lines: string[]; noteHeight: number }>>(new Map());

  // Waveform dimensions in world space
  const getWaveformDims = useCallback(
    (_width: number, height: number) => {
      const waveformHeight = Math.max(height * 3, duration * 100);
      const waveformWidth = 120;
      // World-space center at X=0; left edge is -width/2
      const waveformX = -waveformWidth / 2;
      return { waveformHeight, waveformWidth, waveformX };
    },
    [duration]
  );

  // Draw a single drawing note (uses compression cache), optionally skipping some strokes
  const renderDrawingOnCanvas = useCallback(
    (ctx: CanvasRenderingContext2D, note: Note, excludeIndexes?: Set<number>) => {
      if (!note.drawing || !note.drawing.compressed) return;
      try {
        // Cache key must change when compressed payload changes (content hash > size-only)
        let cacheKey: string;
        try {
          const json = JSON.stringify(note.drawing.compressed);
          // Simple fast hash (FNV-1a like) for short strings
          let hash = 2166136261;
          for (let i = 0; i < json.length; i++) {
            hash ^= json.charCodeAt(i);
            hash = (hash * 16777619) >>> 0;
          }
          cacheKey = `${note.id}:${json.length}:${hash.toString(36)}`;
        } catch {
          // Fallback to timestamp to force refresh
          cacheKey = `${note.id}:err:${Date.now()}`;
        }
        const cached = decompressedCacheRef.current.get(note.id);
        let decompressed: import('@types').DrawingStroke[];
        if (cached && cached.key === cacheKey) {
          decompressed = cached.strokes;
        } else {
          decompressed = decompressSession(note.drawing.compressed as unknown as import('@types').CompressedStroke[]);
          decompressedCacheRef.current.set(note.id, { key: cacheKey, strokes: decompressed });
        }

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let i = 0; i < decompressed.length; i++) {
          if (excludeIndexes && excludeIndexes.has(i)) continue;
          const stroke = decompressed[i];
          const points = stroke.points as Array<{ x: number; y: number }>;
          if (!points || points.length < 2) continue;
          ctx.strokeStyle = stroke.color || '#9ca3af';
          ctx.lineWidth = stroke.strokeWidth || 2;
          ctx.beginPath();
          ctx.moveTo(note.canvasX + points[0].x, note.canvasY + points[0].y);
          for (let j = 1; j < points.length; j++) {
            ctx.lineTo(note.canvasX + points[j].x, note.canvasY + points[j].y);
          }
          ctx.stroke();
        }
      } catch {
        // Never fail the whole frame on drawing issues
      }
    },
    []
  );

  // Draw only the live in-progress stroke
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

  // Draw the single global drawing note (new model uses exactly one)
  const renderDrawingsOnCanvas = useCallback(
    (ctx: CanvasRenderingContext2D, notesList: Note[]) => {
      // With the new model, there should be exactly one drawing note synthesized from the global compressed payload
      const drawingNote = notesList.find(n => n.type === 'drawing' && n.drawing);
      if (!drawingNote) return;
      const exclude = (movingStrokePreview && movingStrokePreview.noteId === drawingNote.id)
        ? new Set<number>(movingStrokePreview.strokeIndexes)
        : undefined;
      renderDrawingOnCanvas(ctx, drawingNote, exclude);
    },
    [renderDrawingOnCanvas, movingStrokePreview]
  );

  // Draw text notes and their connectors from the waveform
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

        // Quick vertical culling using approximate height
        const screenTop = transform.offsetY + transform.scale * note.canvasY;
        const approxHeight = showNoteLabels ? 200 : 16;
        const screenBottom = screenTop + approxHeight;
        const { h } = sizeRef.current;
        if (screenBottom < -200 || screenTop > h + 200) continue;

        // Connector from waveform to note body/anchor
        const timeProgress = dur > 0 ? note.time / dur : 0;
        const waveformCanvasY = timeProgress * waveformHeight;
        ctx.strokeStyle = '#6b7280';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(waveformX + waveformWidth / 2, waveformCanvasY);

        if (showNoteLabels) {
          // Use cached layout for a stable center target
          const noteWidth = 240;
          const padding = 8;
          const headerHeight = 40;
          const contentLineHeight = 24;
          const layoutKey = `${note.id}:${note.content ?? ''}`;
          let layout = noteLayoutCacheRef.current.get(note.id);
          if (!layout || layout.key !== layoutKey) {
            // Basic word wrap, preserving blank lines
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

        // Dot at waveform endpoint (colored by note)
        ctx.fillStyle = getColorCode(note.color);
        ctx.strokeStyle = '#2d2d2d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(waveformX + waveformWidth / 2, waveformCanvasY, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        if (!showNoteLabels) continue;

        // Note card
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

        // Header (🕐 time)
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

        // Content lines
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

  // Main frame render
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Drop cache entries for removed notes
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

    // Screen-centering, then world transform (pan/zoom)
    ctx.save();
    ctx.translate(width / 2, 0);
    ctx.translate(transform.offsetX, transform.offsetY);
    ctx.scale(transform.scale, transform.scale);

    const { waveformHeight, waveformWidth, waveformX } = getWaveformDims(width, height);

    // Waveform background
    ctx.fillStyle = 'rgb(29, 29, 29)';
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

    // Full-note selection outline (hidden while box is visible to avoid double visuals)
    if (!selectionBox && selectedDrawingIds && selectedDrawingIds.size > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(59,130,246,0.8)';
      ctx.lineWidth = 2 / transform.scale;
      ctx.setLineDash([6 / transform.scale, 4 / transform.scale]);
      for (const n of notes) {
        if (n.type === 'drawing' && selectedDrawingIds.has(n.id) && n.drawing?.bounds) {
          if (movingStrokePreview && movingStrokePreview.noteId === n.id) continue;
          const b = n.drawing.bounds;
          ctx.strokeRect(n.canvasX, n.canvasY, b.width, b.height);
        }
      }
      ctx.restore();
    }

    // Per-stroke selection highlight (skip ones currently in moving preview)
    if (selectedStrokeGroups && selectedStrokeGroups.length > 0) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const group of selectedStrokeGroups) {
        const note = notes.find(n => n.id === group.noteId);
        if (!note?.drawing?.compressed) continue;
        try {
          const cached = decompressedCacheRef.current.get(note.id)?.strokes;
          const decompressed = cached ?? decompressSession(note.drawing.compressed as unknown as import('@types').CompressedStroke[]);
          for (const si of group.strokeIndexes) {
            if (movingStrokePreview && movingStrokePreview.noteId === group.noteId && movingStrokePreview.strokeIndexes.includes(si)) {
              continue;
            }
            const stroke = decompressed[si];
            if (!stroke) continue;
            const pts = stroke.points as Array<{ x: number; y: number }>;
            if (!pts || pts.length < 2) continue;
            // Underlay
            ctx.strokeStyle = 'rgba(96,165,250,0.25)';
            ctx.lineWidth = (stroke.strokeWidth || 2) + 1 / transform.scale;
            ctx.beginPath();
            ctx.moveTo(note.canvasX + pts[0].x, note.canvasY + pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(note.canvasX + pts[i].x, note.canvasY + pts[i].y);
            ctx.stroke();
            // Main highlight (thin)
            ctx.strokeStyle = 'rgba(147,197,253,1)';
            ctx.lineWidth = (stroke.strokeWidth || 2) / transform.scale;
            ctx.beginPath();
            ctx.moveTo(note.canvasX + pts[0].x, note.canvasY + pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(note.canvasX + pts[i].x, note.canvasY + pts[i].y);
            ctx.stroke();
          }
        } catch { /* ignore */ }
      }
      ctx.restore();
    }

    // Live move preview for selected strokes
    if (movingStrokePreview) {
      const { noteId, strokeIndexes, dx, dy } = movingStrokePreview;
      const note = notes.find(n => n.id === noteId);
      if (note?.drawing?.compressed && (dx !== 0 || dy !== 0)) {
        try {
          const cached = decompressedCacheRef.current.get(note.id)?.strokes;
          const decompressed = cached ?? decompressSession(note.drawing.compressed as unknown as import('@types').CompressedStroke[]);
          ctx.save();
          ctx.globalAlpha = 1;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          for (const si of strokeIndexes) {
            const stroke = decompressed[si];
            if (!stroke) continue;
            const pts = stroke.points as Array<{ x: number; y: number }>;
            if (!pts || pts.length < 2) continue;
            // Underlay (match selection)
            ctx.strokeStyle = 'rgba(96,165,250,0.5)';
            ctx.lineWidth = (stroke.strokeWidth || 2) + 1 / transform.scale;
            ctx.beginPath();
            ctx.moveTo(note.canvasX + pts[0].x + dx, note.canvasY + pts[0].y + dy);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(note.canvasX + pts[i].x + dx, note.canvasY + pts[i].y + dy);
            ctx.stroke();
            // Main (match selection)
            ctx.strokeStyle = 'rgba(147,197,253,1)';
            ctx.lineWidth = (stroke.strokeWidth || 2) / transform.scale;
            ctx.beginPath();
            ctx.moveTo(note.canvasX + pts[0].x + dx, note.canvasY + pts[0].y + dy);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(note.canvasX + pts[i].x + dx, note.canvasY + pts[i].y + dy);
            ctx.stroke();
          }
          ctx.restore();
        } catch { /* ignore */ }
      }
    }

    // Erasing preview on hit strokes
    if (erasingStrokeIds && erasingStrokeIds.length > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      for (const item of erasingStrokeIds) {
        const note = notes.find(n => n.id === item.noteId);
        if (!note?.drawing?.compressed) continue;
        try {
          // Decompress once (cache already used inside renderDrawingOnCanvas earlier) but we need strokes array
          const decompressed = decompressedCacheRef.current.get(note.id)?.strokes;
          if (!decompressed) continue;
          for (const si of item.strokeIndexes) {
            const stroke = decompressed[si];
            if (!stroke) continue;
            const pts = stroke.points as Array<{ x: number; y: number }>;
            if (!pts || pts.length < 2) continue;
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = (stroke.strokeWidth || 2) + 2 / transform.scale;
            ctx.beginPath();
            ctx.moveTo(note.canvasX + pts[0].x, note.canvasY + pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(note.canvasX + pts[i].x, note.canvasY + pts[i].y);
            ctx.stroke();
            // Inner original width for dual ring effect
            ctx.strokeStyle = '#fca5a5';
            ctx.lineWidth = (stroke.strokeWidth || 2);
            ctx.beginPath();
            ctx.moveTo(note.canvasX + pts[0].x, note.canvasY + pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(note.canvasX + pts[i].x, note.canvasY + pts[i].y);
            ctx.stroke();
          }
        } catch {/* ignore */ }
      }
      ctx.restore();
    }

    // Eraser cursor ring (world radius = screenRadius/scale)
    if (eraserCursor && isDrawingMode === false) {
      ctx.save();
      // Match erase radius used in logic
      const screenRadius = 10;
      const r = screenRadius / (transform.scale || 1);
      ctx.strokeStyle = 'rgba(239,68,68,0.85)';
      ctx.lineWidth = 2 / transform.scale;
      ctx.setLineDash([4 / transform.scale, 4 / transform.scale]);
      ctx.beginPath();
      ctx.arc(eraserCursor.x, eraserCursor.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Current live-stroke overlay
    if (isDrawingMode) {
      renderCurrentDrawing(ctx);
    }

    // Notes on top
    renderNotesOnCanvas(ctx, notes, waveformX, waveformWidth, waveformHeight, duration);

    // Selection box overlay (drawn in world space)
    if (selectionBox) {
      ctx.save();
      ctx.strokeStyle = 'rgba(96,165,250,1)';
      ctx.lineWidth = 2 / transform.scale;
      ctx.setLineDash([4 / transform.scale, 4 / transform.scale]);
      ctx.fillStyle = 'rgba(96,165,250,0.15)';
      ctx.beginPath();
      ctx.rect(selectionBox.x, selectionBox.y, selectionBox.w, selectionBox.h);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }, [canvasRef, notes, transform, currentTime, duration, waveformData, isDrawingMode, getWaveformDims, renderDrawingsOnCanvas, renderCurrentDrawing, renderNotesOnCanvas, erasingStrokeIds, eraserCursor, selectedDrawingIds, selectedStrokeGroups, movingStrokePreview, selectionBox]);

  return {
    renderDrawingOnCanvas,
    renderCurrentDrawing,
    renderDrawingsOnCanvas,
    renderNotesOnCanvas,
    renderCanvas,
  };
};
