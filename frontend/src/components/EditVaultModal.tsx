import React, { useState, useEffect, useRef } from 'react';
import { X, Lock, Globe, User, Tag, FileText, KeyRound, Eye, EyeOff, Check, Copy, Sparkles, ExternalLink } from 'lucide-react';
import { VaultItem } from '../api/client';
import { PasswordGenerator } from './PasswordGenerator';

interface EditVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: VaultItem | null;
  initialFocusField?: 'password' | 'url' | 'notes' | 'all';
  onSave: (data: {
    service_name: string;
    category: string;
    service_url: string;
    username: string;
    password: string;
    notes: string;
  }) => Promise<void>;
}

const CATEGORIES = ['Media', 'Storage', 'Infrastructure', 'Network', 'System', 'General', 'Other'];

export const EditVaultModal: React.FC<EditVaultModalProps> = ({
  isOpen,
  onClose,
  item,
  initialFocusField = 'all',
  onSave,
}) => {
  const [serviceName, setServiceName] = useState('');
  const [category, setCategory] = useState('General');
  const [serviceUrl, setServiceUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');

  const [showPass, setShowPass] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const passwordInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const notesInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (item) {
      setServiceName(item.service_name || '');
      setCategory(item.category || 'General');
      setServiceUrl(item.service_url || '');
      setUsername(item.username || '');
      setPassword(item.password || '');
      setNotes(item.notes || '');
    }
    setError('');
    setShowGenerator(false);
    setCopiedPass(false);

    // Auto-focus selected field after modal opens
    if (isOpen) {
      setTimeout(() => {
        if (initialFocusField === 'password') {
          passwordInputRef.current?.focus();
          passwordInputRef.current?.select();
        } else if (initialFocusField === 'url') {
          urlInputRef.current?.focus();
          urlInputRef.current?.select();
        } else if (initialFocusField === 'notes') {
          notesInputRef.current?.focus();
        }
      }, 50);
    }
  }, [item, isOpen, initialFocusField]);

  if (!isOpen || !item) return null;

  const handleCopyPassword = () => {
    if (!password) return;
    navigator.clipboard.writeText(password);
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceName.trim() || !username.trim() || !password.trim()) {
      setError('Nama Service, Username, dan Password wajib diisi.');
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
      setError(err.message || 'Gagal memperbarui kredensial');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-xl rounded-xl bg-[#111113] p-6 shadow-2xl border border-zinc-700 overflow-hidden font-mono text-xs">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-white">
              <KeyRound className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white font-sans">
                  Edit Kredensial: <span className="font-mono text-zinc-300">{item.service_name}</span>
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700">
                  {item.category}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Ubah Kata Sandi, URL, dan Catatan (Tersimpan aman dengan enkripsi AES-256-GCM)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded bg-red-950/40 border border-red-800/80 text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          
          {/* Section 1: PASSWORD EDIT (Utama) */}
          <div className="p-3.5 rounded-lg bg-zinc-950/80 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-zinc-200 font-semibold flex items-center gap-1.5 text-xs">
                <Lock className="w-3.5 h-3.5 text-white" />
                <span>Password / Kata Sandi *</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowGenerator(!showGenerator)}
                  className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors px-2 py-0.5 rounded hover:bg-zinc-800 border border-transparent hover:border-zinc-700"
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>{showGenerator ? 'Tutup Generator' : 'Generate Acak'}</span>
                </button>
              </div>
            </div>

            <div className="relative">
              <input
                ref={passwordInputRef}
                type={showPass ? 'text' : 'password'}
                required
                placeholder="Masukkan kata sandi baru"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-white transition-colors pr-24 text-xs font-mono"
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleCopyPassword}
                  className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  title="Salin Kata Sandi"
                >
                  {copiedPass ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  title={showPass ? 'Sembunyikan' : 'Tampilkan'}
                >
                  {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Collapsible Generator */}
            {showGenerator && (
              <div className="pt-2 border-t border-zinc-800 mt-2">
                <PasswordGenerator
                  onSelectPassword={(generatedPass) => {
                    setPassword(generatedPass);
                    setShowGenerator(false);
                  }}
                />
              </div>
            )}
          </div>

          {/* Section 2: URL & NOTES */}
          <div className="grid grid-cols-1 gap-3">
            {/* Service URL */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-zinc-300 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Service URL / Host Web</span>
                </label>
                {serviceUrl && (
                  <a
                    href={serviceUrl.startsWith('http') ? serviceUrl : `http://${serviceUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-zinc-400 hover:text-white inline-flex items-center gap-1"
                  >
                    <span>Buka Link</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
              <input
                ref={urlInputRef}
                type="text"
                placeholder="https://cloud.homelab.local atau http://192.168.1.50:8080"
                value={serviceUrl}
                onChange={(e) => setServiceUrl(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
              />
            </div>

            {/* Notes / Remarks */}
            <div>
              <label className="block text-zinc-300 mb-1 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-zinc-400" />
                <span>Catatan / API Token / Recovery Key (Terenkripsi)</span>
              </label>
              <textarea
                ref={notesInputRef}
                rows={3}
                placeholder="Contoh: Token API, Port SSH, Recovery seed, atau catatan konfigurasi khusus..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors resize-none"
              />
            </div>
          </div>

          {/* Section 3: METADATA (Service Name, Username, Category) */}
          <div className="pt-2 border-t border-zinc-800/80">
            <span className="text-[10px] uppercase tracking-wider text-zinc-400 block mb-2 font-semibold">
              Detail Akun & Kategori
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="block text-zinc-400 mb-1 text-[11px]">Nama Layanan *</label>
                <input
                  type="text"
                  required
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="block text-zinc-400 mb-1 text-[11px]">Username / Akun *</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="block text-zinc-400 mb-1 text-[11px]">Kategori</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-zinc-500"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-zinc-800 mt-4">
            <span className="text-[10px] text-zinc-400 font-mono">
              UUID: <span className="text-zinc-400 select-all">{item.id}</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-3.5 py-1.5 rounded text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors border border-zinc-700 font-medium"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-1.5 rounded bg-white hover:bg-zinc-200 text-black font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
              >
                {isSaving ? (
                  <>
                    <span className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <span>Simpan Perubahan</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
