import React, { useState, useEffect } from 'react';
import { X, Lock, Globe, User, Tag, FileText, KeyRound } from 'lucide-react';
import { VaultItem } from '../api/client';
import { PasswordGenerator } from './PasswordGenerator';

interface VaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    service_name: string;
    category: string;
    service_url: string;
    username: string;
    password: string;
    notes: string;
  }) => Promise<void>;
  initialData?: VaultItem | null;
}

const CATEGORIES = ['Media', 'Storage', 'Infrastructure', 'Network', 'System', 'General', 'Other'];

export const VaultModal: React.FC<VaultModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}) => {
  const [serviceName, setServiceName] = useState('');
  const [category, setCategory] = useState('General');
  const [serviceUrl, setServiceUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialData) {
      setServiceName(initialData.service_name);
      setCategory(initialData.category || 'General');
      setServiceUrl(initialData.service_url || '');
      setUsername(initialData.username);
      setPassword(initialData.password);
      setNotes(initialData.notes || '');
    } else {
      setServiceName('');
      setCategory('General');
      setServiceUrl('');
      setUsername('');
      setPassword('');
      setNotes('');
    }
    setError('');
    setShowGenerator(false);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceName.trim() || !username.trim() || !password.trim()) {
      setError('Service name, username, and password are required.');
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      await onSave({
        service_name: serviceName.trim(),
        category,
        service_url: serviceUrl.trim(),
        username: username.trim(),
        password: password.trim(),
        notes: notes.trim(),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save credential');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-xl bg-[#111113] p-6 shadow-2xl border border-zinc-800 overflow-hidden">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div>
            <h3 className="text-sm font-semibold text-white font-mono flex items-center gap-2">
              <Lock className="w-4 h-4 text-zinc-300" />
              {initialData ? 'Edit Credential' : 'New Vault Entry'}
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Encrypted at rest using AES-256-GCM
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mt-3 p-2.5 rounded bg-zinc-900 border border-zinc-700 text-xs text-zinc-300 font-mono">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-4 text-xs font-mono">
          {/* Service Name & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-zinc-300 mb-1">
                Service Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Komga, Nextcloud, Proxmox"
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-zinc-300 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-100 focus:outline-none focus:border-zinc-500 transition-colors"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Service URL */}
          <div>
            <label className="block text-zinc-300 mb-1 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-zinc-500" />
              Service URL / Host
            </label>
            <input
              type="text"
              placeholder="https://komga.homelab.internal"
              value={serviceUrl}
              onChange={(e) => setServiceUrl(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
            />
          </div>

          {/* Username */}
          <div>
            <label className="block text-zinc-300 mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-zinc-500" />
              Username / Account *
            </label>
            <input
              type="text"
              required
              placeholder="admin or root"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
            />
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-zinc-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-zinc-500" />
                Password *
              </label>
              <button
                type="button"
                onClick={() => setShowGenerator(!showGenerator)}
                className="text-zinc-400 hover:text-zinc-200 underline transition-colors"
              >
                {showGenerator ? 'Close Generator' : 'Generate'}
              </button>
            </div>

            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                required
                placeholder="Secret key"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors pr-14"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400 hover:text-white px-1.5 py-0.5"
              >
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>

            {/* Collapsible Generator */}
            {showGenerator && (
              <div className="mt-2">
                <PasswordGenerator
                  onSelectPassword={(generatedPass) => {
                    setPassword(generatedPass);
                    setShowGenerator(false);
                  }}
                />
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-zinc-300 mb-1 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-zinc-500" />
              Notes / API Keys (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="API tokens, recovery codes, port bindings, or remarks..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-1.5 rounded bg-zinc-100 hover:bg-white text-zinc-950 font-medium transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : initialData ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
