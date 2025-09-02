import { useCallback } from 'react';
import { useWaveformContext } from '../contexts/WaveformContext';
import { useAudio } from '@contexts/AudioContext';
import { decompressSession } from '@utils/advancedCompression';
import { getColorCode } from '@utils/colorUtils';
import type { Note } from '@types';

export const useCanvasRenderer = () => {
  const {
    transform,
    notes,
    isDrawingMode,
    drawingSession,
    currentStroke,
    isDrawing,
    NOTE_LABEL_HIDE_THRESHOLD,
    canvasRef
  } = useWaveformContext();

  const {
    currentTime,
    duration,
    waveformData
  } = useAudio();

  // Function to render a single drawing note on canvas
  const renderDrawingOnCanvas = useCallback((ctx: CanvasRenderingContext2D, note: Note) => {
    if (!note.drawing || !note.drawing.compressed) return;

    try {
      const decompressed = decompressSession(note.drawing.compressed);

      ctx.strokeStyle = '#9ca3af'; // gray-400 instead of white
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      decompressed.forEach((stroke) => {
        if (stroke.points.length < 2) return;

        ctx.beginPath();
        ctx.moveTo(note.canvasX + stroke.points[0].x, note.canvasY + stroke.points[0].y);

        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(note.canvasX + stroke.points[i].x, note.canvasY + stroke.points[i].y);
        }

        ctx.stroke();
      });
    } catch (error) {
      console.warn('Failed to render drawing:', error);
    }
  }, []);

  // Function to render current drawing session and stroke
  const renderCurrentDrawing = useCallback((ctx: CanvasRenderingContext2D) => {
    // Debug logging
    // if (drawingSession) {
    //   console.log('Rendering drawing session:', {
    //     strokeCount: drawingSession.strokes.length,
    //     isDrawing,
    //     currentStrokeLength: currentStroke.length
    //   });
    // }

    // Render all completed strokes in the current drawing session
    if (drawingSession && drawingSession.strokes.length > 0) {
      drawingSession.strokes.forEach((stroke) => {
        if (stroke.points.length < 2) return;

        ctx.strokeStyle = stroke.color || '#9ca3af'; // gray-400 instead of white
        ctx.lineWidth = stroke.strokeWidth || 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }

        ctx.stroke();
      });
    }

    // Render current stroke being drawn
    if (isDrawing && currentStroke.length > 0) {
      ctx.strokeStyle = '#6b7079'; // gray-400 instead of white
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(currentStroke[0].x, currentStroke[0].y);

      for (let i = 1; i < currentStroke.length; i++) {
        ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
      }

      ctx.stroke();
    }
  }, [drawingSession, isDrawing, currentStroke]);

  // Function to render all drawing notes on canvas
  const renderDrawingsOnCanvas = useCallback((ctx: CanvasRenderingContext2D, notes: Note[]) => {
    notes.forEach((note) => {
      if (note.type === 'drawing' && note.drawing) {
        renderDrawingOnCanvas(ctx, note);
      }
    });
  }, [renderDrawingOnCanvas]);

  // Function to render notes directly on canvas (text notes only)
  const renderNotesOnCanvas = useCallback((
    ctx: CanvasRenderingContext2D,
    notes: Note[],
    waveformX: number,
    waveformWidth: number,
    waveformHeight: number,
    duration: number
  ) => {
    const showNoteLabels = transform.scale > NOTE_LABEL_HIDE_THRESHOLD;

    notes.forEach((note) => {
      if (note.type === 'drawing') return; // Skip drawing notes

      // Calculate time position on waveform
      const timeProgress = duration > 0 ? note.time / duration : 0;
      const waveformCanvasY = timeProgress * waveformHeight;

      // Draw connecting line from waveform time position to center of note
      ctx.strokeStyle = '#6b7280';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(waveformX + waveformWidth / 2, waveformCanvasY);

      if (showNoteLabels) {
        // Calculate actual note dimensions for center positioning
        const noteWidth = 240;
        const padding = 8;
        const headerHeight = 40;
        const contentLineHeight = 24;
        const contentLines = note.content ? note.content.split('\n') : ['Empty note'];
        const contentHeight = Math.max(24, contentLines.length * contentLineHeight);
        const noteHeight = headerHeight + contentHeight + padding;

        // Draw line to note center
        ctx.lineTo(note.canvasX + noteWidth / 2, note.canvasY + noteHeight / 2);
      } else {
        // Draw line to note dot center
        ctx.lineTo(note.canvasX, note.canvasY);
      }

      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Draw dot at waveform endpoint
      ctx.fillStyle = getColorCode(note.color);
      ctx.strokeStyle = '#2d2d2d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(waveformX + waveformWidth / 2, waveformCanvasY, 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      if (!showNoteLabels) {
        // When zoomed out, just show a colored dot
        ctx.fillStyle = getColorCode(note.color);
        ctx.strokeStyle = '#2d2d2d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(waveformX + waveformWidth / 2, waveformCanvasY, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        return;
      }

      // Match original NotesOverlay dimensions exactly: w-60 = 240px
      const noteWidth = 240;
      const padding = 8; // p-2 = 8px
      const headerHeight = 40; // Enough for header with icons
      const contentLineHeight = 24; // text-lg = 1.125rem * 16 = 18px + leading-relaxed
      const contentLines = note.content ? note.content.split('\n') : ['Empty note'];
      const contentHeight = Math.max(24, contentLines.length * contentLineHeight);
      const noteHeight = headerHeight + contentHeight + padding;

      // Draw shadow (matching original shadow-lg)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.roundRect(note.canvasX + 4, note.canvasY + 4, noteWidth, noteHeight, 4);
      ctx.fill();

      // Draw main background (bg-neutral-800)
      ctx.beginPath();
      ctx.fillStyle = 'rgba(38, 38, 38, 1)';
      ctx.roundRect(note.canvasX, note.canvasY, noteWidth, noteHeight, 4);
      ctx.fill();

      // Draw main border (border-neutral-600)
      ctx.strokeStyle = 'rgba(82, 82, 82, 1)';
      ctx.lineWidth = 1;
      ctx.roundRect(note.canvasX, note.canvasY, noteWidth, noteHeight, 4);
      ctx.stroke();

      // Draw colored left border (3px wide, matching borderLeftWidth: '3px')
      ctx.beginPath();
      ctx.fillStyle = getColorCode(note.color);
      ctx.roundRect(note.canvasX, note.canvasY, 4, noteHeight, [4, 0, 0, 4]);
      ctx.fill();

      // Draw header section
      ctx.fillStyle = '#a3a3a3'; // text-neutral-400
      ctx.font = '16px system-ui, -apple-system, sans-serif'; // text-lg
      ctx.textAlign = 'left';

      // Time with clock icon (matching original)
      const minutes = Math.floor(note.time / 60);
      const seconds = Math.floor(note.time % 60);
      const timeLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      // Draw clock icon area (simplified)
      ctx.fillStyle = '#a3a3a3';
      ctx.font = '14px system-ui';
      ctx.fillText('🕐', note.canvasX + padding, note.canvasY + 24);

      // Draw time text
      ctx.fillText(timeLabel, note.canvasX + padding + 20, note.canvasY + 24);

      // Draw content section (matching text-lg text-neutral-200 leading-relaxed)
      ctx.fillStyle = '#e5e5e5'; // text-neutral-200
      ctx.font = '18px system-ui, -apple-system, sans-serif'; // text-lg
      ctx.textAlign = 'left';

      const startY = note.canvasY + headerHeight + padding;
      contentLines.forEach((line) => {
        // Match original whitespace-pre-wrap break-words behavior
        const words = line.split(' ');
        let currentLine = '';
        let lineCount = 0;

        for (const word of words) {
          const testLine = currentLine + (currentLine ? ' ' : '') + word;
          const metrics = ctx.measureText(testLine);

          if (metrics.width > noteWidth - (padding * 2) - 6) { // Account for left border
            if (currentLine) {
              ctx.fillText(currentLine, note.canvasX + padding + 6, startY + (lineCount * contentLineHeight));
              lineCount++;
            }
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }

        // Draw the last line
        if (currentLine) {
          ctx.fillText(currentLine, note.canvasX + padding + 6, startY + (lineCount * contentLineHeight));
        }
      });
    });
  }, [transform.scale, NOTE_LABEL_HIDE_THRESHOLD]);

  const renderCanvas = useCallback(() => {
    if (!canvasRef.current || !waveformData || waveformData.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas to full container size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = rect.height;

    // Apply transform
    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);
    ctx.scale(transform.scale, transform.scale);

    ctx.clearRect(-transform.offsetX / transform.scale, -transform.offsetY / transform.scale,
      width / transform.scale, height / transform.scale);


    // Calculate waveform dimensions - make it much taller for vertical scrolling
    const waveformHeight = Math.max(height * 3, duration * 100); // Scale based on duration
    const barHeight = waveformHeight / waveformData.length;
    const waveformWidth = 120;
    const waveformX = (width - waveformWidth) / 2;

    // Draw background for waveform area
    ctx.fillStyle = 'rgb(23, 23, 23, 0.8)';
    ctx.fillRect(waveformX - 10, 0, waveformWidth + 20, waveformHeight);

    // Draw waveform bars
    waveformData.forEach((amplitude, index) => {
      const y = index * barHeight;
      const barWidth = amplitude * waveformWidth * 0.8;
      const progress = duration > 0 ? currentTime / duration : 0;

      // Color based on progress
      const isPlayed = index / waveformData.length < progress;
      ctx.fillStyle = isPlayed ? '#a3a3a3' : '#404040';

      // Draw centered bar
      const x = waveformX + (waveformWidth - barWidth) / 2;
      ctx.fillRect(x, y, barWidth, barHeight - 1);
    });

    // Draw current position indicator
    if (duration > 0) {
      const progress = currentTime / duration;
      const indicatorY = progress * waveformHeight;
      ctx.strokeStyle = '#f3f4f6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(waveformX - 20, indicatorY);
      ctx.lineTo(waveformX + waveformWidth + 20, indicatorY);
      ctx.stroke();

      // Draw time indicator circle
      ctx.fillStyle = '#f3f4f6';
      ctx.beginPath();
      ctx.arc(waveformX + waveformWidth / 2, indicatorY, 6, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Draw time markers every 5 seconds
    if (duration > 0) {
      ctx.fillStyle = '#737373';
      ctx.font = '24px monospace';
      ctx.textAlign = 'center';

      for (let time = 0; time <= duration; time += 5) {
        const y = (time / duration) * waveformHeight;
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        const timeLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        // Draw marker line
        ctx.strokeStyle = '#737373';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(waveformX - 10, y);
        ctx.lineTo(waveformX + 10, y);
        ctx.stroke();

        // Draw time text
        ctx.fillText(timeLabel, waveformX - 50, y + 4);
      }
    }

    // Render drawings first (under notes, over waveform)
    renderDrawingsOnCanvas(ctx, notes);

    // Render current drawing session and stroke
    if (isDrawingMode) {
      renderCurrentDrawing(ctx);
    }

    // Render notes on top
    renderNotesOnCanvas(ctx, notes, waveformX, waveformWidth, waveformHeight, duration);

    ctx.restore();
  }, [waveformData, currentTime, duration, transform, notes, isDrawingMode, drawingSession, currentStroke, isDrawing, canvasRef, renderDrawingsOnCanvas, renderCurrentDrawing, renderNotesOnCanvas]);

  return {
    renderDrawingOnCanvas,
    renderCurrentDrawing,
    renderDrawingsOnCanvas,
    renderNotesOnCanvas,
    renderCanvas
  };
};
