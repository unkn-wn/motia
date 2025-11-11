import React, { memo, useState, useRef, useEffect, useCallback } from 'react';
import { MAX_PROJECT_TITLE_LENGTH } from '@/types/firebase';

interface ProjectTitleProps {
  title: string;
  onTitleChange: (newTitle: string) => Promise<void>;
  disabled?: boolean;
}

const ProjectTitleComponent: React.FC<ProjectTitleProps> = ({ title, onTitleChange, disabled = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const [isHovered, setIsHovered] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update edit value when title prop changes
  useEffect(() => {
    if (!isEditing) {
      setEditValue(title);
    }
  }, [title, isEditing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = useCallback(() => {
    if (disabled) return;
    setIsEditing(true);
  }, [disabled]);

  const handleSave = useCallback(async () => {
    const trimmed = editValue.slice(0, MAX_PROJECT_TITLE_LENGTH).trim();
    if (!trimmed || trimmed === title) {
      setIsEditing(false);
      setEditValue(title);
      return;
    }

    setIsSaving(true);
    try {
      await onTitleChange(trimmed);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update title:', error);
      // Revert on error
      setEditValue(title);
    } finally {
      setIsSaving(false);
    }
  }, [editValue, title, onTitleChange]);

  const handleCancel = useCallback(() => {
    setEditValue(title);
    setIsEditing(false);
  }, [title]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  const handleBlur = useCallback(() => {
    // Small delay to allow click events on other elements
    setTimeout(() => {
      if (isEditing) {
        handleSave();
      }
    }, 100);
  }, [isEditing, handleSave]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        disabled={isSaving}
        size={editValue.length}
        className="bg-transparent text-neutral-100 text-sm font-medium outline-none border-b border-neutral-600 focus:border-neutral-400 transition-colors px-1 -ml-1"
        placeholder="Untitled Project"
        maxLength={MAX_PROJECT_TITLE_LENGTH}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={handleStartEdit}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      disabled={disabled}
      className={`text-neutral-100 text-sm font-medium transition-colors px-1 -ml-1 ${
        disabled ? 'cursor-default' : 'cursor-text hover:text-white'
      } ${isHovered && !disabled ? 'border-b border-dotted border-neutral-500' : 'border-b border-transparent'}`}
    >
      {title || 'Untitled Project'}
    </button>
  );
};

export const ProjectTitle = memo(ProjectTitleComponent);
