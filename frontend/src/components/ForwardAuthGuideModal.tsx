import React, { useState } from 'react';
import { X, Network, Copy, Check, Terminal } from 'lucide-react';

interface ForwardAuthGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const ForwardAuthGuideModal: React.FC<ForwardAuthGuideModalProps> = ({
  isOpen,
  onClose,
  onShowToast,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const npmSnippet = `# ============================================================
# Nginx Proxy Manager - Custom Nginx Configuration
# Proxy Host -> "Advanced" Tab
# ============================================================

# 1. Forward Auth Verification Request
location /npm-auth-verify {
    internal;
    proxy_pass http://homelab-idp:4000/api/auth/verify;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header X-Original-URI $request_uri;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header Host $http_host;
}

# 2. Protect All Root Routes with Forward Auth
location / {
    auth_request /npm-auth-verify;

    auth_request_set $remote_user $upstream_http_remote_user;
    auth_request_set $remote_email $upstream_http_remote_email;
    auth_request_set $remote_name $upstream_http_remote_name;

    proxy_set_header Remote-User $remote_user;
    proxy_set_header Remote-Email $remote_email;
    proxy_set_header Remote-Name $remote_name;

    error_page 401 = @error401;
    proxy_pass $forward_scheme://$server:$port;
}

# 3. Redirect Handler for Unauthenticated Users
location @error401 {
    return 302 https://idp.yourdomain.com/login?rd=$scheme://$http_host$request_uri;
}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(npmSnippet);
    setCopied(true);
    onShowToast('NPM configuration copied', 'success');
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl bg-[#111113] shadow-2xl border border-zinc-800 overflow-hidden font-mono">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Network className="w-4 h-4 text-zinc-300" />
              Forward Auth Setup (Nginx Proxy Manager)
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Inject Remote-User headers to protected homelab upstreams
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
          <div className="flex items-center justify-between">
            <span className="font-medium text-zinc-300 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-zinc-500" />
              NPM Advanced Tab Snippet
            </span>
            <button
              onClick={handleCopy}
              className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 font-medium flex items-center gap-1.5 transition-colors"
            >
              {copied ? <Check className="w-3 h-3 text-zinc-200" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <pre className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800/80 text-zinc-300 overflow-x-auto leading-relaxed select-all">
            {npmSnippet}
          </pre>

          <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800/80 space-y-1.5 text-zinc-400">
            <span className="font-semibold text-zinc-300 block">Setup Instructions:</span>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open your service Proxy Host in Nginx Proxy Manager.</li>
              <li>Go to the <strong className="text-zinc-200">Advanced</strong> tab.</li>
              <li>Paste the snippet above and adjust the IP or domain name.</li>
              <li>Save and test navigating to the service.</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
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
