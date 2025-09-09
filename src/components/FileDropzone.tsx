import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FileUploader from '@/components/FileUploader';
import { UploadIcon } from '@/assets/icons';

type Props = {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  // Optional: render children instead of default uploader (kept for flexibility)
  children?: React.ReactNode;
};

function pickFirstAudioFile(dt: DataTransfer): File | null {
  const files = dt.files;
  if (!files || files.length === 0) return null;
  const file = files[0];
  if (!file) return null;
  if (file.type && file.type.startsWith('audio/')) return file;
  // Some browsers might not set type; fallback by extension
  const name = file.name.toLowerCase();
  if (/\.(mp3|wav|m4a|aac|flac|ogg|oga|opus)$/i.test(name)) return file;
  return null;
}

const FileDropzone: React.FC<Props> = ({ onFileSelect, isLoading, children }) => {
  const [dragActive, setDragActive] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const dragCounter = useRef(0);

  const onDropWindow = useCallback((e: DragEvent) => {
    // Always prevent default on drop to allow handling anywhere on the page
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragActive(false);
    if (isLoading) return;
    const file = e.dataTransfer ? pickFirstAudioFile(e.dataTransfer) : null;
    if (file) {
      onFileSelect(file);
      setInvalid(false);
    } else {
      setInvalid(true);
      // hide invalid state after a brief moment
      setTimeout(() => setInvalid(false), 1200);
    }
  }, [isLoading, onFileSelect]);

  const onDragEnterWindow = useCallback((e: DragEvent) => {
    // Prevent default so the browser allows dropping
    e.preventDefault();
    dragCounter.current += 1;
    // Be permissive: show overlay; validity checked on drop
    setDragActive(true);
  }, []);

  const onDragOverWindow = useCallback((e: DragEvent) => {
    // Prevent default continuously to indicate a valid drop target
    e.preventDefault();
  }, []);

  const onDragLeaveWindow = useCallback((e: DragEvent) => {
    // Prevent default and update counters
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragActive(false);
  }, []);

  useEffect(() => {
    // Attach listeners to window for a forgiving drop experience
    window.addEventListener('dragenter', onDragEnterWindow);
    window.addEventListener('dragover', onDragOverWindow);
    window.addEventListener('dragleave', onDragLeaveWindow);
    window.addEventListener('drop', onDropWindow);
    return () => {
      window.removeEventListener('dragenter', onDragEnterWindow);
      window.removeEventListener('dragover', onDragOverWindow);
      window.removeEventListener('dragleave', onDragLeaveWindow);
      window.removeEventListener('drop', onDropWindow);
    };
  }, [onDragEnterWindow, onDragOverWindow, onDragLeaveWindow, onDropWindow]);

  const overlayVisible = dragActive || invalid;
  const overlay = useMemo(() => (
    <div className={`fixed inset-0 z-50 transition-opacity duration-200 ${overlayVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} aria-hidden={!overlayVisible}>
      <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-[2px]" />
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className={`relative w-full max-w-2xl border-2 ${invalid ? 'border-red-400/70' : 'border-blue-400/60'} border-dashed rounded-2xl bg-neutral-900/70 shadow-2xl animate-fade-in-up`}>
          <div className="absolute -inset-[2px] rounded-2xl bg-gradient-to-br from-blue-400/10 via-transparent to-blue-400/10 pointer-events-none" />
          <div className="relative px-10 py-12 flex items-center gap-6">
            <div className={`flex-shrink-0 w-16 h-16 rounded-full bg-neutral-800/90 flex items-center justify-center shadow-lg ${invalid ? 'ring-2 ring-red-400/70' : 'ring-2 ring-blue-400/60'} animate-pop-in`}>
              <UploadIcon className={`w-8 h-8 ${invalid ? 'text-red-300' : 'text-blue-300'}`} />
            </div>
            <div className="flex flex-col">
              <div className={`text-xl font-semibold tracking-wide ${invalid ? 'text-red-200' : 'text-blue-200'}`}>
                {invalid ? 'Unsupported file type' : 'Drop audio to upload'}
              </div>
              <div className="text-xs text-neutral-400 mt-1">mp3, wav, m4a, aac, flac, ogg, opus</div>
              <div className="text-[11px] text-neutral-500 mt-2">You can also click the button to choose a file</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ), [overlayVisible, invalid]);

  return (
    <div className="relative">
      {children ?? <FileUploader onFileSelect={onFileSelect} isLoading={isLoading} />}
      {overlay}
    </div>
  );
};

export default FileDropzone;
