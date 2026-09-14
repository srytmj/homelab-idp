import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  KeyRound,
  Check,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { api, User as UserType } from '../api/client';
import { PasswordGenerator } from './PasswordGenerator';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserType;
  onUpdateSuccess: (updatedUser: UserType) => void;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUpdateSuccess,
  onShowToast,
}) => {
  const [username, setUsername] = useState(currentUser.username);
  const [email, setEmail] = useState(currentUser.email);
  const [displayName, setDisplayName] = useState(currentUser.displayName || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [showPassGenerator, setShowPassGenerator] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      setUsername(currentUser.username);
      setEmail(currentUser.email);
      setDisplayName(currentUser.displayName || '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPass(false);
      setShowNewPass(false);
      setShowConfirmPass(false);
      setShowPassGenerator(false);
      setErrorMessage('');
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const calculateStrength = (pass: string): { label: string; score: number; color: string } => {
    if (!pass) return { label: 'Empty', score: 0, color: 'bg-zinc-800' };
    let score = 0;
    if (pass.length >= 8) score += 20;
    if (pass.length >= 12) score += 20;
    if (pass.length >= 16) score += 15;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 20;
    if (/[0-9]/.test(pass)) score += 15;
    if (/[^A-Za-z0-9]/.test(pass)) score += 10;

    if (score >= 80) return { label: 'High Entropy', score, color: 'bg-emerald-500' };
    if (score >= 60) return { label: 'Strong', score, color: 'bg-green-500' };
    if (score >= 40) return { label: 'Moderate', score, color: 'bg-amber-500' };
    return { label: 'Weak', score, color: 'bg-red-500' };
  };

  const strength = calculateStrength(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanUsername = username.trim();
    const cleanEmail = email.trim();

    if (!cleanUsername) {
      setErrorMessage('Username tidak boleh kosong');
      return;
    }
    if (cleanUsername.length < 3) {
      setErrorMessage('Username minimal 3 karakter');
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(cleanUsername)) {
      setErrorMessage('Username hanya boleh berisi huruf, angka, titik, underscore, dan strip');
      return;
    }

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMessage('Email SSO tidak valid');
      return;
    }

    if (newPassword) {
      if (newPassword.length < 8) {
        setErrorMessage('Kata sandi baru minimal 8 karakter');
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMessage('Konfirmasi kata sandi baru tidak cocok');
        return;
      }
      if (!currentPassword) {
        setErrorMessage('Masukkan kata sandi saat ini untuk memverifikasi perubahan kata sandi');
        return;
      }
    }

    try {
      setIsSaving(true);
      const res = await api.updateProfile({
        username: cleanUsername,
        email: cleanEmail,
        displayName: displayName.trim() || cleanUsername,
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
      });

      onUpdateSuccess(res.user);
      onShowToast('Pengaturan akun & SSO berhasil diperbarui', 'success');
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memperbarui profil');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl my-8 bg-[#0e0e11] border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-zinc-800/80 border border-zinc-700/60 text-zinc-100">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
                Pengaturan Akun & SSO
              </h2>
              <p className="text-[11px] text-zinc-400 font-mono">
                Kelola kredensial SSO Forward Auth & OIDC
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMessage && (
            <div className="p-3 text-xs bg-red-950/40 border border-red-800/60 text-red-300 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Account Meta Badges */}
          <div className="flex flex-wrap items-center gap-2 p-3 bg-zinc-950 border border-zinc-800/80 rounded-lg text-xs font-mono">
            <span className="text-zinc-400">Role:</span>
            <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 uppercase text-[10px] tracking-wider font-semibold">
              {currentUser.role}
            </span>
            <span className="text-zinc-600">|</span>
            <span className="text-zinc-400">User ID:</span>
            <span className="text-zinc-400 truncate max-w-[180px]" title={currentUser.userId}>
              {currentUser.userId}
            </span>
          </div>

          {/* SSO Identity Section */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 pb-1 border-b border-zinc-800/60">
              <ShieldCheck className="w-4 h-4 text-zinc-400" />
              <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono">
                Identitas Single Sign-On (SSO)
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  SSO Username
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. admin"
                    className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors"
                  />
                </div>
                <p className="mt-1 text-[10px] text-zinc-500">
                  Header <code className="font-mono text-zinc-400">Remote-User</code> & OIDC sub
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  SSO Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@homelab.local"
                    className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors"
                  />
                </div>
                <p className="mt-1 text-[10px] text-zinc-500">
                  Header <code className="font-mono text-zinc-400">Remote-Email</code> & OIDC email
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Display Name (Nama Lengkap)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Homelab Administrator"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors"
              />
              <p className="mt-1 text-[10px] text-zinc-500">
                Header <code className="font-mono text-zinc-400">Remote-Name</code> & OIDC name
              </p>
            </div>
          </div>

          {/* Password Section */}
          <div className="space-y-3.5 pt-2">
            <div className="flex items-center justify-between pb-1 border-b border-zinc-800/60">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-zinc-400" />
                <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono">
                  Ganti Kata Sandi
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPassGenerator(!showPassGenerator)}
                className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-white transition-colors"
              >
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>{showPassGenerator ? 'Tutup Generator' : 'Generate Sandi Kuat'}</span>
              </button>
            </div>

            {showPassGenerator && (
              <div className="p-3 bg-zinc-950 border border-zinc-800/80 rounded-lg">
                <PasswordGenerator
                  onSelectPassword={(gen) => {
                    setNewPassword(gen);
                    setConfirmPassword(gen);
                    setShowNewPass(true);
                    setShowConfirmPass(true);
                  }}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Kata Sandi Saat Ini
              </label>
              <div className="relative">
                <input
                  type={showCurrentPass ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Diperlukan jika ingin mengubah kata sandi"
                  className="w-full pl-3 pr-9 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPass(!showCurrentPass)}
                  className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showCurrentPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Kata Sandi Baru
                </label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimal 8 karakter"
                    className="w-full pl-3 pr-9 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showNewPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {newPassword && (
                  <div className="mt-1.5 space-y-1">
                    <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${strength.color}`}
                        style={{ width: `${Math.min(100, strength.score)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                      <span>Kekuatan: {strength.label}</span>
                      <span>{newPassword.length} chars</span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Konfirmasi Kata Sandi Baru
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi kata sandi baru"
                    className="w-full pl-3 pr-9 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showConfirmPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {confirmPassword && newPassword && (
                  <p
                    className={`mt-1 text-[10px] font-mono flex items-center gap-1 ${
                      confirmPassword === newPassword ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {confirmPassword === newPassword ? (
                      <>
                        <Check className="w-3 h-3" /> Cocok
                      </>
                    ) : (
                      'Kata sandi tidak cocok'
                    )}
                  </p>
                )}
              </div>
            </div>
            <p className="text-[10px] text-zinc-500 italic">
              * Biarkan kolom kata sandi kosong jika hanya ingin memperbarui username, email, atau display name.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-xs rounded-lg transition-colors disabled:opacity-50 shadow-sm"
            >
              {isSaving ? (
                <>
                  <div className="w-3 h-3 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Simpan Perubahan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
