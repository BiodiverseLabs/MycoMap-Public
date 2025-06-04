import { ReactNode } from 'react';
import { X, Maximize2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface FullscreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

export function FullscreenModal({ isOpen, onClose, children, title }: FullscreenModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-none w-screen h-screen p-0 m-0 rounded-none border-none">
        <div className="relative w-full h-full bg-white">
          {/* Header with title and close button */}
          <div className="absolute top-0 left-0 right-0 z-[1000] bg-white border-b border-slate-200 p-4 flex items-center justify-between">
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
          <div className="pt-16 w-full h-full">
            {children}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
      className={`absolute top-2 right-2 z-10 p-2 bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:bg-slate-50 ${className}`}
      aria-label="Open fullscreen"
      title="Open fullscreen"
    >
      <Maximize2 className="w-4 h-4 text-slate-600" />
    </button>
  );
}