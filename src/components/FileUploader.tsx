import { useCallback } from 'react';
import { Upload } from 'lucide-react';

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFileSelect, isLoading }) => {
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  }, [onFileSelect]);

  return (
    <div className="flex items-center justify-center">
      <label className="cursor-pointer">
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileInput}
          className="hidden"
          disabled={isLoading}
        />
        <div className="flex items-center space-x-3 bg-neutral-800 hover:bg-neutral-700 text-white px-8 py-4 rounded-lg transition-colors duration-200 disabled:opacity-50">
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Upload className="w-5 h-5" />
          )}
          <span className="text-lg">
            {isLoading ? 'Processing...' : 'Upload Audio'}
          </span>
        </div>
      </label>
    </div>
  );
};

export default FileUploader;
