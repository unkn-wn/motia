import { memo } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Target,
  Volume2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Pen,
  Settings,
  Clock,
  Trash2,
  Edit3,
  Palette,
  X,
  Check,
  Keyboard,
  RotateCcw,
  Upload,
  Undo2,
  Redo2
} from 'lucide-react';

/**
 * Memoized Lucide icon components to prevent unnecessary rerenders
 * These icons are optimized for performance across the application
 */

// Audio Control Icons
export const PlayIcon = memo(({ className = "w-4 h-4" }: { className?: string }) => (
  <Play className={className} />
));
PlayIcon.displayName = 'PlayIcon';

export const PauseIcon = memo(({ className = "w-4 h-4" }: { className?: string }) => (
  <Pause className={className} />
));
PauseIcon.displayName = 'PauseIcon';

export const SkipBackIcon = memo(({ className = "w-4 h-4" }: { className?: string }) => (
  <SkipBack className={className} />
));
SkipBackIcon.displayName = 'SkipBackIcon';

export const SkipForwardIcon = memo(({ className = "w-4 h-4" }: { className?: string }) => (
  <SkipForward className={className} />
));
SkipForwardIcon.displayName = 'SkipForwardIcon';

export const TargetIcon = memo(({ className = "w-4 h-4" }: { className?: string }) => (
  <Target className={className} />
));
TargetIcon.displayName = 'TargetIcon';

export const Volume2Icon = memo(({ className = "w-4 h-4" }: { className?: string }) => (
  <Volume2 className={className} />
));
Volume2Icon.displayName = 'Volume2Icon';

// Navigation Icons
export const ChevronLeftIcon = memo(({ className = "w-5 h-5" }: { className?: string }) => (
  <ChevronLeft className={className} />
));
ChevronLeftIcon.displayName = 'ChevronLeftIcon';

export const ChevronRightIcon = memo(({ className = "w-5 h-5" }: { className?: string }) => (
  <ChevronRight className={className} />
));
ChevronRightIcon.displayName = 'ChevronRightIcon';

// Action Icons
export const PlusIcon = memo(({ className = "w-5 h-5" }: { className?: string }) => (
  <Plus className={className} />
));
PlusIcon.displayName = 'PlusIcon';

export const PenIcon = memo(({ className = "w-5 h-5" }: { className?: string }) => (
  <Pen className={className} />
));
PenIcon.displayName = 'PenIcon';

export const SettingsIcon = memo(({ className = "w-5 h-5" }: { className?: string }) => (
  <Settings className={className} />
));
SettingsIcon.displayName = 'SettingsIcon';

export const UploadIcon = memo(({ className = "w-8 h-8" }: { className?: string }) => (
  <Upload className={className} />
));
UploadIcon.displayName = 'UploadIcon';

// Note Management Icons
export const ClockIcon = memo(({ className = "w-4 h-4" }: { className?: string }) => (
  <Clock className={className} />
));
ClockIcon.displayName = 'ClockIcon';

export const Trash2Icon = memo(({ className = "w-4 h-4" }: { className?: string }) => (
  <Trash2 className={className} />
));
Trash2Icon.displayName = 'Trash2Icon';

export const Edit3Icon = memo(({ className = "w-4 h-4" }: { className?: string }) => (
  <Edit3 className={className} />
));
Edit3Icon.displayName = 'Edit3Icon';

export const PaletteIcon = memo(({ className = "w-4 h-4" }: { className?: string }) => (
  <Palette className={className} />
));
PaletteIcon.displayName = 'PaletteIcon';

export const XIcon = memo(({ className = "w-4 h-4" }: { className?: string }) => (
  <X className={className} />
));
XIcon.displayName = 'XIcon';

export const CheckIcon = memo(({ className = "w-4 h-4" }: { className?: string }) => (
  <Check className={className} />
));
CheckIcon.displayName = 'CheckIcon';

// UI Icons
export const KeyboardIcon = memo(({ className = "w-5 h-5" }: { className?: string }) => (
  <Keyboard className={className} />
));
KeyboardIcon.displayName = 'KeyboardIcon';

export const RotateCcwIcon = memo(({ className = "w-4 h-4" }: { className?: string }) => (
  <RotateCcw className={className} />
));
RotateCcwIcon.displayName = 'RotateCcwIcon';

// Undo / Redo Icons
export const UndoIcon = memo(({ className = "w-4 h-4" }: { className?: string }) => (
  <Undo2 className={className} />
));
UndoIcon.displayName = 'UndoIcon';

export const RedoIcon = memo(({ className = "w-4 h-4" }: { className?: string }) => (
  <Redo2 className={className} />
));
RedoIcon.displayName = 'RedoIcon';
