import React, { useCallback } from 'react';
import { Upload, Music } from 'lucide-react';

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFileSelect, isLoading }) => {
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const audioFile = files.find(file => file.type.startsWith('audio/'));

    if (audioFile) {
      onFileSelect(audioFile);
    }
  }, [onFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-purple-400 transition-colors duration-200 bg-gradient-to-br from-gray-50 to-gray-100"
      >
        <div className="flex flex-col items-center space-y-4">
          <div className="p-4 bg-purple-100 rounded-full">
            {isLoading ? (
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Music className="w-8 h-8 text-purple-600" />
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-gray-800">
              {isLoading ? 'Processing your audio...' : 'Upload your music'}
            </h3>
            <p className="text-gray-600">
              Drag and drop an audio file here, or click to browse
            </p>
            <p className="text-sm text-gray-500">
              Supports MP3, WAV, M4A, and more
            </p>
          </div>

          {!isLoading && (
            <label className="cursor-pointer">
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileInput}
                className="hidden"
              />
              <div className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition-colors duration-200">
                <Upload className="w-5 h-5" />
                <span>Choose File</span>
              </div>
            </label>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileUploader;
