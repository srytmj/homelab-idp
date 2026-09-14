import React, { useState, useEffect } from 'react';
import { api, User } from './api/client';
import { Login } from './pages/Login';
import { Consent } from './pages/Consent';
import { VaultDashboard } from './pages/VaultDashboard';
import { Navbar } from './components/Navbar';
import { ToastContainer, ToastMessage } from './components/Toast';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isOidcModalOpen, setIsOidcModalOpen] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);

  const pathname = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const returnUrl = searchParams.get('rd') || undefined;

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2500);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const checkAuth = async () => {
    try {
      setIsLoading(true);
      const res = await api.getMe();
      setUser(res.user);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
      setUser(null);
      showToast('Session terminated', 'info');
      if (pathname !== '/login') {
        window.history.pushState({}, '', '/login');
      }
    } catch (err: any) {
      showToast(err.message || 'Logout failed', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#09090b]">
        <div className="text-xs font-mono text-zinc-500">
          Loading...
        </div>
      </div>
    );
  }

  const isConsentRoute = pathname === '/consent';
  const isLoginRoute = pathname === '/login';

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b] text-zinc-100 selection:bg-zinc-800 selection:text-white">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {isConsentRoute ? (
        user ? (
          <Consent user={user} />
        ) : (
          <Login
            onLoginSuccess={(loggedInUser) => setUser(loggedInUser)}
            returnUrl={window.location.href}
          />
        )
      ) : !user || isLoginRoute ? (
        <Login
          onLoginSuccess={(loggedInUser) => {
            setUser(loggedInUser);
            if (pathname === '/login') {
              window.history.pushState({}, '', '/');
            }
          }}
          returnUrl={returnUrl}
        />
      ) : (
        <>
          <Navbar
            user={user}
            onOpenNewModal={() => setIsNewModalOpen(true)}
            onOpenOidcModal={() => setIsOidcModalOpen(true)}
            onOpenGuideModal={() => setIsGuideModalOpen(true)}
            onLogout={handleLogout}
          />
          <main className="flex-1">
            <VaultDashboard
              user={user}
              onShowToast={showToast}
              isNewModalOpen={isNewModalOpen}
              setIsNewModalOpen={setIsNewModalOpen}
              isOidcModalOpen={isOidcModalOpen}
              setIsOidcModalOpen={setIsOidcModalOpen}
              isGuideModalOpen={isGuideModalOpen}
              setIsGuideModalOpen={setIsGuideModalOpen}
            />
          </main>
        </>
      )}
    </div>
  );
}

export default App;
