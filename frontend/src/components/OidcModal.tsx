import React, { useState, useEffect } from 'react';
import { X, Key, Plus, Trash2, Copy, Check, ExternalLink, AlertTriangle } from 'lucide-react';
import { api, OidcClient } from '../api/client';

interface OidcModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const OidcModal: React.FC<OidcModalProps> = ({ isOpen, onClose, onShowToast }) => {
  const [clients, setClients] = useState<OidcClient[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const [clientName, setClientName] = useState('');
  const [redirectUris, setRedirectUris] = useState('');

  const [newSecretData, setNewSecretData] = useState<{
    client_name: string;
    client_id: string;
    client_secret: string;
  } | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadClients = async () => {
    try {
      setIsLoading(true);
      const res = await api.getOidcClients();
      setClients(res.clients);
    } catch (err: any) {
      onShowToast(err.message || 'Failed to load OIDC clients', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadClients();
      setIsAdding(false);
      setNewSecretData(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    onShowToast(`Copied ${label}`, 'success');
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const uris = redirectUris
      .split(/[\n,]/)
      .map((u) => u.trim())
      .filter(Boolean);

    if (!clientName.trim() || uris.length === 0) {
      onShowToast('Client name and at least one redirect URI are required', 'error');
      return;
    }

    try {
      const res = await api.createOidcClient({
        client_name: clientName.trim(),
        redirect_uris: uris,
      });

      setNewSecretData({
        client_name: res.client.client_name,
        client_id: res.client.client_id,
        client_secret: res.client_secret,
      });

      setClientName('');
      setRedirectUris('');
      setIsAdding(false);
      loadClients();
      onShowToast('OIDC client created', 'success');
    } catch (err: any) {
      onShowToast(err.message || 'Failed to create client', 'error');
    }
  };

  const handleDeleteClient = async (id: string, name: string) => {
    if (!confirm(`Delete OIDC client '${name}'? Connected apps will lose SSO access.`)) {
      return;
    }

    try {
      await api.deleteOidcClient(id);
      onShowToast(`Deleted client '${name}'`, 'info');
      loadClients();
    } catch (err: any) {
      onShowToast(err.message || 'Failed to delete client', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl bg-[#111113] shadow-2xl border border-zinc-800 overflow-hidden font-mono">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-zinc-300" />
              OIDC Client Registry
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Single-Sign-On integrations (Komga, Nextcloud, etc.)
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Secret Display Banner */}
          {newSecretData && (
            <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 space-y-2">
              <div className="flex items-center gap-2 font-medium text-zinc-100">
                <AlertTriangle className="w-4 h-4 text-zinc-300 shrink-0" />
                <span>Save Client Secret Now (Displayed Once)</span>
              </div>
              <div className="space-y-1.5 pt-1">
                <div>
                  <span className="text-zinc-500 text-[10px] block">client_id:</span>
                  <div className="flex items-center justify-between bg-zinc-950 px-2.5 py-1.5 rounded border border-zinc-800 text-zinc-200">
                    <span>{newSecretData.client_id}</span>
                    <button
                      onClick={() => handleCopy(newSecretData.client_id, 'new-cid', 'Client ID')}
                      className="text-zinc-400 hover:text-white"
                    >
                      {copiedKey === 'new-cid' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <span className="text-zinc-500 text-[10px] block">client_secret:</span>
                  <div className="flex items-center justify-between bg-zinc-950 px-2.5 py-1.5 rounded border border-zinc-800 text-zinc-200">
                    <span className="truncate">{newSecretData.client_secret}</span>
                    <button
                      onClick={() => handleCopy(newSecretData.client_secret, 'new-sec', 'Client Secret')}
                      className="text-zinc-400 hover:text-white ml-2"
                    >
                      {copiedKey === 'new-sec' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setNewSecretData(null)}
                className="text-[11px] text-zinc-400 hover:text-white underline pt-1 block"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* New Client Form Toggle */}
          {!isAdding ? (
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">
                {clients.length} Registered Client{clients.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setIsAdding(true)}
                className="px-2.5 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 font-medium flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Register Client
              </button>
            </div>
          ) : (
            <form onSubmit={handleCreateClient} className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-200">New Client</span>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Application Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Komga, Nextcloud"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">
                  Allowed Redirect URIs (newline or comma separated) *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="https://komga.homelab.internal/login/oauth2/code/homelab-idp"
                  value={redirectUris}
                  onChange={(e) => setRedirectUris(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-zinc-100 hover:bg-white text-zinc-950 font-medium transition-colors"
                >
                  Generate Credentials
                </button>
              </div>
            </form>
          )}

          {/* Clients List */}
          {isLoading ? (
            <div className="text-center py-6 text-zinc-500">Loading clients...</div>
          ) : clients.length === 0 ? (
            <div className="text-center py-6 text-zinc-500">No OIDC clients configured.</div>
          ) : (
            <div className="space-y-2.5">
              {clients.map((client) => (
                <div
                  key={client.id}
                  className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800/80 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-white font-sans">{client.client_name}</h4>
                      <span className="text-[11px] text-zinc-400">
                        client_id: {client.client_id}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleCopy(client.client_id, `cid-${client.id}`, 'Client ID')}
                        className="p-1 rounded bg-zinc-900 text-zinc-400 hover:text-white transition-colors"
                        title="Copy Client ID"
                      >
                        {copiedKey === `cid-${client.id}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleDeleteClient(client.id, client.client_name)}
                        className="p-1 rounded bg-zinc-900 text-zinc-500 hover:text-zinc-200 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-[11px] text-zinc-500 space-y-1">
                    {client.redirect_uris.map((uri, i) => (
                      <div key={i} className="flex items-center gap-1 text-zinc-300 bg-zinc-900/60 px-2 py-0.5 rounded border border-zinc-800">
                        <ExternalLink className="w-3 h-3 text-zinc-500 shrink-0" />
                        <span className="truncate">{uri}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-3.5 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
