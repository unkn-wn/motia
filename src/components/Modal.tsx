import React from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  titleRight?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ open, onClose, title, titleRight, children, footer }) => {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center" role="dialog" aria-modal="true" aria-label={title ?? 'Dialog'}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-[92vw] max-w-md rounded-xl border border-neutral-800 bg-neutral-900/90 backdrop-blur p-4 shadow-xl">
        {title && (
          titleRight ? (
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-neutral-100 text-lg font-medium">{title}</h3>
              <div className="flex items-center gap-2">{titleRight}</div>
            </div>
          ) : (
            <h3 className="text-neutral-100 text-lg font-medium mb-3">{title}</h3>
          )
        )}
        <div className="text-neutral-200">
          {children}
        </div>
        {footer && (
          <div className="mt-4 flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
