import React, { useState } from 'react';
import { Lock, User, ArrowRight } from 'lucide-react';
import { api, User as UserType } from '../api/client';

interface LoginProps {
  onLoginSuccess: (user: UserType) => void;
  returnUrl?: string;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, returnUrl }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter both username and password.');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      const res = await api.login(username, password);
      
      if (returnUrl) {
        window.location.href = returnUrl;
        return;
      }
      
      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#09090b]">
      <div className="w-full max-w-sm rounded-xl bg-[#111113] p-7 border border-zinc-800 shadow-xl">
        {/* Brand Header */}
        <div className="space-y-1 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-zinc-900 border border-zinc-800 text-white">
              <Lock className="w-3.5 h-3.5" />
            </div>
            <span className="font-mono text-xs text-zinc-400">homelab/idp</span>
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-white">
            Single Sign-On
          </h1>
          <p className="text-xs text-zinc-400">
            Sign in to access your homelab identity and vault.
          </p>
        </div>

        {/* Error Notice */}
        {error && (
          <div className="mb-4 p-2.5 rounded bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 font-mono">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs font-mono">
          <div>
            <label className="block text-zinc-300 mb-1">
              Account / Email
            </label>
            <input
              type="text"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-zinc-300 mb-1">
              Master Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors pr-14"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400 hover:text-white px-1.5 py-0.5"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {returnUrl && (
            <div className="p-2 rounded bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400 truncate">
              Return: <span className="text-zinc-200">{returnUrl}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-2 px-4 rounded bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {isLoading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-zinc-800/80 text-center">
          <span className="text-[11px] text-zinc-500 font-mono">
            Default: admin / change_this_master_password
          </span>
        </div>
      </div>
    </div>
  );
};
