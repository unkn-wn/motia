import type { Note } from '@types';

// Normalize createdAt comparisons (Date vs number compatibility)
export const isSameCreatedAt = (a: Date | number, b: Date | number): boolean => {
  const aIsDate = a instanceof Date;
  const bIsDate = b instanceof Date;
  if (aIsDate && bIsDate) return (a as Date).getTime() === (b as Date).getTime();
  return a === b;
};

// Compare content-relevant fields only (ignore canvas positions)
export const isSameNoteContent = (a: Note, b: Note): boolean => {
  return (
    a.id === b.id &&
    a.content === b.content &&
    a.color === b.color &&
    a.time === b.time &&
    isSameCreatedAt(a.createdAt, b.createdAt)
  );
};

// Check that two note lists have the same set of text notes by content (ignoring drawings and positions)
export const areTextNotesEqualByContent = (prevNotes: Note[], nextNotes: Note[]): boolean => {
  const prevText = prevNotes.filter(n => n.type !== 'drawing');
  const nextText = nextNotes.filter(n => n.type !== 'drawing');
  if (prevText.length !== nextText.length) return false;
  for (let i = 0; i < prevText.length; i++) {
    const a = prevText[i];
    const b = nextText.find(n => n.id === a.id);
    if (!b || !isSameNoteContent(a, b)) return false;
  }
  return true;
};
