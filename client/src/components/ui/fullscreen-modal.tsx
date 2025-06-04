import { ReactNode } from 'react';
import { X, Maximize2 } from 'lucide-react';

interface FullscreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

export function FullscreenModal({ isOpen, onClose, children, title }: FullscreenModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-white">
      <div className="relative w-full h-full">
        {/* Header with title and close button */}
        <div className="absolute top-0 left-0 right-0 z-[10000] bg-white border-b border-slate-200 p-4 flex items-center justify-between">
          {title && (
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          )}
          <button
            onClick={onClose}
            className="ml-auto p-2 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Exit fullscreen"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>
        
        {/* Content area */}
        <div className="pt-16 w-full" style={{ height: 'calc(100vh - 4rem)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

interface FullscreenButtonProps {
  onClick: () => void;
  className?: string;
}

export function FullscreenButton({ onClick, className = "" }: FullscreenButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`absolute top-2 right-2 z-[1000] p-2 bg-white rounded-lg shadow-lg border border-slate-200 hover:shadow-xl transition-all duration-200 hover:bg-slate-50 hover:scale-105 ${className}`}
      aria-label="Open fullscreen"
      title="Open fullscreen"
    >
      <Maximize2 className="w-4 h-4 text-slate-700" />
    </button>
  );
}