import React from 'react';
import { Check, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-700/80 text-zinc-100 shadow-2xl transition-all duration-200"
        >
          <div className="flex items-center gap-2.5">
            {toast.type === 'success' && <Check className="w-4 h-4 text-zinc-300 shrink-0 stroke-[2.2]" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-zinc-300 shrink-0 stroke-[2.2]" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-zinc-400 shrink-0 stroke-[2.2]" />}
            <span className="text-xs font-mono text-zinc-200">{toast.message}</span>
          </div>
          <button
            onClick={() => onDismiss(toast.id)}
            className="text-zinc-500 hover:text-zinc-200 transition-colors p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
