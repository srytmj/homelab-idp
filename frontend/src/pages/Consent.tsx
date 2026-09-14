import React, { useState } from 'react';
import { Check, X, Key, ExternalLink } from 'lucide-react';
import { api, User } from '../api/client';

interface ConsentProps {
  user: User;
}

export const Consent: React.FC<ConsentProps> = ({ user }) => {
  const query = new URLSearchParams(window.location.search);
  const clientId = query.get('client_id') || '';
  const clientName = query.get('client_name') || clientId || 'Client Application';
  const redirectUri = query.get('redirect_uri') || '';
  const scope = query.get('scope') || 'openid profile email';
  const state = query.get('state') || '';

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const scopesList = scope.split(' ').filter(Boolean);

  const handleDecision = async (action: 'allow' | 'deny') => {
    try {
      setIsSubmitting(true);
      setError('');
      const res = await api.submitConsent({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope,
        state,
        action,
      });

      if (res.redirect_url) {
        window.location.href = res.redirect_url;
      }
    } catch (err: any) {
      setError(err.message || 'Failed to submit authorization decision');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#09090b]">
      <div className="w-full max-w-sm rounded-xl bg-[#111113] p-7 border border-zinc-800 shadow-xl font-mono">
        {/* Header */}
        <div className="space-y-1 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-zinc-900 border border-zinc-800 text-white">
              <Key className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs text-zinc-400">OAuth2 / OIDC</span>
          </div>
          <h2 className="text-base font-semibold text-white font-sans">
            Authorize Application
          </h2>
          <p className="text-xs text-zinc-400">
            <span className="text-zinc-200 font-semibold">{clientName}</span> requests identity access.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-2 rounded bg-zinc-900 border border-zinc-700 text-xs text-zinc-200">
            {error}
          </div>
        )}

        {/* User Account Info */}
        <div className="p-3 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between mb-4 text-xs">
          <span className="text-zinc-400">User:</span>
          <span className="text-zinc-200 font-medium">{user.username} ({user.email})</span>
        </div>

        {/* Permissions Requested */}
        <div className="space-y-2 mb-5">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
            Requested Scopes:
          </span>
          <div className="space-y-1.5 text-xs text-zinc-300">
            {scopesList.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span>{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Redirect URI Info */}
        <div className="p-2 rounded bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-500 mb-5 truncate flex items-center gap-1.5">
          <ExternalLink className="w-3 h-3 shrink-0" />
          <span className="truncate">{redirectUri}</span>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleDecision('deny')}
            className="py-2 px-3 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-medium transition-colors"
          >
            Deny
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleDecision('allow')}
            className="py-2 px-3 rounded bg-zinc-100 hover:bg-white text-zinc-950 font-medium transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Authorizing...' : 'Authorize'}
          </button>
        </div>
      </div>
    </div>
  );
};
