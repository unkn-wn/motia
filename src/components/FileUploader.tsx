import { useCallback, useEffect, useRef, useState } from 'react';
import { UploadIcon, CheckIcon } from '@assets/icons';

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFileSelect, isLoading }) => {
  const [justFinished, setJustFinished] = useState(false);
  const ringRef = useRef<HTMLDivElement>(null);
  const prevLoadingRef = useRef<boolean>(isLoading);

  // Trigger a success pulse only when transitioning from loading -> idle
  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    let cleanup: (() => void) | undefined;
    if (isLoading) {
      // ensure pulse is cleared when new load starts
      setJustFinished(false);
    } else if (wasLoading && !isLoading) {
      // short delay to ensure spinner fully stops before pulse
      const t = setTimeout(() => setJustFinished(true), 120);
      const t2 = setTimeout(() => setJustFinished(false), 800);
      cleanup = () => { clearTimeout(t); clearTimeout(t2); };
    }
    prevLoadingRef.current = isLoading;
    return cleanup;
  }, [isLoading]);
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  }, [onFileSelect]);

  return (
    <div className="flex flex-col items-center justify-center animate-fade-in-up">
      <label className="cursor-pointer group">
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileInput}
          className="hidden"
          disabled={isLoading}
        />
        <div
          className={`relative flex items-center justify-center rounded-full transition-all duration-300 shadow-xl animate-float-soft ${isLoading ? 'w-20 h-20 bg-neutral-800/60' : 'w-24 h-24 bg-neutral-800 hover:bg-neutral-700/50'
            }`}
        >
          {/* Animated ring */}
          <div
            ref={ringRef}
            className={`absolute inset-0 rounded-full border-2 ${isLoading
                ? 'border-neutral-600 border-t-transparent animate-spin'
                : justFinished
                  ? 'border-green-400/70 animate-ring-out'
                  : 'border-neutral-700/60 group-hover:border-neutral-500/70'
              }`}
          />
          {/* Inner icon / loader */}
          {isLoading ? (
            <div className="w-8 h-8 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
          ) : justFinished ? (
            <CheckIcon className="w-8 h-8 text-green-400 animate-pop-in" />
          ) : (
            <UploadIcon className="w-8 h-8 text-white transition-transform duration-300" />
          )}
        </div>
      </label>
      {/* filetype hint */}
      <div className="mt-1 text-xs text-neutral-500 tracking-wide min-h-[1rem] font-mono">
        {isLoading ? 'Processing…' : 'mp3, wav, m4a, aac'}
      </div>
    </div>
  );
};

export default FileUploader;
