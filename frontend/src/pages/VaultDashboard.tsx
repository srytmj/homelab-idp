import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  LayoutGrid,
  Table as TableIcon,
  Copy,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  Edit2,
  Trash2,
  Lock,
  Plus,
  Server,
  FileText,
  KeyRound,
  Pencil,
} from 'lucide-react';
import { api, VaultItem, User } from '../api/client';
import { VaultModal } from '../components/VaultModal';
import { EditVaultModal } from '../components/EditVaultModal';
import { OidcModal } from '../components/OidcModal';
import { ForwardAuthGuideModal } from '../components/ForwardAuthGuideModal';

interface VaultDashboardProps {
  user: User;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  isNewModalOpen: boolean;
  setIsNewModalOpen: (open: boolean) => void;
  isOidcModalOpen: boolean;
  setIsOidcModalOpen: (open: boolean) => void;
  isGuideModalOpen: boolean;
  setIsGuideModalOpen: (open: boolean) => void;
}

const CATEGORIES = ['All', 'Media', 'Storage', 'System', 'Network', 'Infrastructure', 'General'];

export const VaultDashboard: React.FC<VaultDashboardProps> = ({
  user,
  onShowToast,
  isNewModalOpen,
  setIsNewModalOpen,
  isOidcModalOpen,
  setIsOidcModalOpen,
  isGuideModalOpen,
  setIsGuideModalOpen,
}) => {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Edit modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);
  const [editFocusField, setEditFocusField] = useState<'password' | 'url' | 'notes' | 'all'>('all');

  const fetchCredentials = async () => {
    try {
      setIsLoading(true);
      const res = await api.getVaultItems();
      setItems(res.credentials);
    } catch (err: any) {
      onShowToast(err.message || 'Failed to load credentials', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCredentials();
  }, []);

  const handleCopy = (text: string, key: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    onShowToast(`Copied ${label}`, 'success');
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const togglePasswordReveal = (id: string) => {
    setRevealedPasswords((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const openEditModal = (item: VaultItem, field: 'password' | 'url' | 'notes' | 'all' = 'all') => {
    setEditingItem(item);
    setEditFocusField(field);
    setIsEditModalOpen(true);
  };

  const handleSaveCredential = async (data: {
    service_name: string;
    category: string;
    service_url: string;
    username: string;
    password: string;
    notes: string;
  }) => {
    if (editingItem) {
      await api.updateVaultItem(editingItem.id, data);
      onShowToast(`Updated ${data.service_name}`, 'success');
    } else {
      await api.createVaultItem(data);
      onShowToast(`Saved ${data.service_name}`, 'success');
    }
    setEditingItem(null);
    setIsEditModalOpen(false);
    fetchCredentials();
  };

  const handleDelete = async (item: VaultItem) => {
    if (!confirm(`Hapus kredensial '${item.service_name}' dari vault?`)) {
      return;
    }

    try {
      await api.deleteVaultItem(item.id);
      onShowToast(`Deleted ${item.service_name}`, 'info');
      fetchCredentials();
    } catch (err: any) {
      onShowToast(err.message || 'Failed to delete credential', 'error');
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchCategory =
        selectedCategory === 'All' ||
        item.category.toLowerCase() === selectedCategory.toLowerCase();

      const query = searchQuery.toLowerCase().trim();
      const matchSearch =
        !query ||
        item.service_name.toLowerCase().includes(query) ||
        item.username.toLowerCase().includes(query) ||
        item.service_url.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        (item.notes && item.notes.toLowerCase().includes(query));

      return matchCategory && matchSearch;
    });
  }, [items, selectedCategory, searchQuery]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: items.length };
    for (const item of items) {
      const cat = item.category || 'General';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [items]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* HUD Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h1 className="text-base font-semibold text-white tracking-tight font-mono">
            Vault Credentials
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Terenkripsi AES-256-GCM. Edit Password, URL, & Catatan langsung dari UI.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
            <span>ENTRIES: </span>
            <span className="text-white font-semibold">{items.length}</span>
          </div>
          <div className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
            <span>SSO: </span>
            <span className="text-white font-semibold">ACTIVE</span>
          </div>
        </div>
      </div>

      {/* Search & Actions Bar */}
      <div className="flex flex-col md:flex-row gap-3 justify-between items-stretch md:items-center">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Cari kredensial (service, username, url, notes)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-4 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-md text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        {/* View Switcher & Action */}
        <div className="flex items-center gap-2 self-end md:self-auto">
          <div className="flex items-center p-0.5 rounded-md bg-zinc-900 border border-zinc-800">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded text-xs transition-colors ${
                viewMode === 'grid'
                  ? 'bg-zinc-100 text-zinc-950 font-medium'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded text-xs transition-colors ${
                viewMode === 'table'
                  ? 'bg-zinc-100 text-zinc-950 font-medium'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Table View"
            >
              <TableIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => {
              setEditingItem(null);
              setIsNewModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-xs transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Add Entry</span>
          </button>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono">
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase();
          const count = categoryCounts[cat] || (cat === 'All' ? items.length : 0);
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-zinc-100 text-zinc-950 font-medium'
                  : 'bg-zinc-900/60 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>{cat}</span>
              <span className={`text-[10px] ${isSelected ? 'text-zinc-600 font-bold' : 'text-zinc-500'}`}>\
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content Display */}
      {isLoading ? (
        <div className="text-center py-16 text-xs text-zinc-500 font-mono">
          Decrypting credentials...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-12 rounded-xl bg-[#111113] border border-zinc-800 text-center space-y-2">
          <p className="text-xs text-zinc-400 font-mono">
            {searchQuery ? `No credentials match "${searchQuery}"` : 'No credentials saved in vault.'}
          </p>
          <button
            onClick={() => {
              setEditingItem(null);
              setIsNewModalOpen(true);
            }}
            className="px-3 py-1.5 rounded bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            Add Entry
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredItems.map((item) => {
            const isRevealed = !!revealedPasswords[item.id];
            return (
              <div
                key={item.id}
                className="rounded-lg bg-[#111113] border border-zinc-800 hover:border-zinc-700 transition-colors p-4 flex flex-col justify-between space-y-3 font-mono group"
              >
                {/* Header */}
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                        <Server className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white text-xs font-sans">
                          {item.service_name}
                        </h3>
                        <span className="text-[10px] text-zinc-400">
                          {item.category || 'General'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {item.service_url && (
                        <a
                          href={item.service_url.startsWith('http') ? item.service_url : `http://${item.service_url}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                          title="Open URL"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <button
                        onClick={() => openEditModal(item, 'url')}
                        className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors opacity-80 group-hover:opacity-100"
                        title="Edit URL"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {item.service_url && (
                    <p className="text-[11px] text-zinc-400 truncate select-all">
                      {item.service_url}
                    </p>
                  )}
                </div>

                {/* Fields */}
                <div className="space-y-2 pt-2 border-t border-zinc-800/80 text-xs">
                  {/* Account */}
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-0.5">
                      Account
                    </span>
                    <div className="flex items-center justify-between bg-zinc-950 px-2.5 py-1 rounded border border-zinc-800">
                      <span className="text-zinc-200 truncate select-all text-xs">
                        {item.username}
                      </span>
                      <button
                        onClick={() => handleCopy(item.username, `user-${item.id}`, 'Username')}
                        className="text-zinc-400 hover:text-white ml-2 p-0.5 transition-colors"
                        title="Copy Username"
                      >
                        {copiedKey === `user-${item.id}` ? (
                          <Check className="w-3 h-3 text-zinc-200" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Password with Quick Edit */}
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider">
                        Password
                      </span>
                      <button
                        onClick={() => openEditModal(item, 'password')}
                        className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
                        title="Ubah Password"
                      >
                        <Pencil className="w-2.5 h-2.5" />
                        <span>Ubah</span>
                      </button>
                    </div>
                    <div className="flex items-center justify-between bg-zinc-950 px-2.5 py-1 rounded border border-zinc-800">
                      <span className="text-zinc-200 truncate select-all text-xs">
                        {isRevealed ? item.password : '••••••••••••'}
                      </span>
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          onClick={() => togglePasswordReveal(item.id)}
                          className="text-zinc-400 hover:text-white p-0.5 transition-colors"
                          title={isRevealed ? 'Hide' : 'Show'}
                        >
                          {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                        <button
                          onClick={() => handleCopy(item.password, `pass-${item.id}`, 'Password')}
                          className="text-zinc-400 hover:text-white p-0.5 transition-colors"
                          title="Copy Password"
                        >
                          {copiedKey === `pass-${item.id}` ? (
                            <Check className="w-3 h-3 text-zinc-200" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  {item.notes ? (
                    <div className="pt-0.5">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-zinc-500 uppercase">Notes</span>
                        <button
                          onClick={() => openEditModal(item, 'notes')}
                          className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                          title="Edit Catatan"
                        >
                          Edit
                        </button>
                      </div>
                      <div className="bg-zinc-950 p-1.5 rounded border border-zinc-800/80 text-[11px] text-zinc-400 line-clamp-2 select-all">
                        {item.notes}
                      </div>
                    </div>
                  ) : (
                    <div className="pt-0.5 flex justify-end">
                      <button
                        onClick={() => openEditModal(item, 'notes')}
                        className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors inline-flex items-center gap-1"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        <span>Tambah Catatan</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between pt-2.5 border-t border-zinc-800/80 text-xs">
                  <span className="text-[10px] text-zinc-400 font-mono">
                    ID: {item.id.slice(0, 8)}...
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openEditModal(item, 'all')}
                      className="px-2.5 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 hover:border-zinc-600 transition-colors flex items-center gap-1.5 text-xs font-medium shadow-sm"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      className="px-2 py-1 rounded text-zinc-400 hover:text-red-300 hover:bg-red-950/30 transition-colors flex items-center gap-1 text-xs"
                      title="Hapus Kredensial"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="rounded-lg bg-[#111113] border border-zinc-800 overflow-hidden font-mono text-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 font-semibold">Service</th>
                  <th className="px-3 py-2 font-semibold">Category</th>
                  <th className="px-3 py-2 font-semibold">Username</th>
                  <th className="px-3 py-2 font-semibold">Password</th>
                  <th className="px-3 py-2 font-semibold">Notes</th>
                  <th className="px-3 py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {filteredItems.map((item) => {
                  const isRevealed = !!revealedPasswords[item.id];
                  return (
                    <tr key={item.id} className="hover:bg-zinc-900/50 transition-colors group">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white block font-sans">
                            {item.service_name}
                          </span>
                          <button
                            onClick={() => openEditModal(item, 'all')}
                            className="text-zinc-400 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Edit"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                        </div>
                        {item.service_url && (
                          <a
                            href={item.service_url.startsWith('http') ? item.service_url : `http://${item.service_url}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-zinc-400 hover:text-white inline-flex items-center gap-1"
                          >
                            <span>{item.service_url}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </td>

                      <td className="px-3 py-2 text-zinc-400">
                        {item.category}
                      </td>

                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-200 select-all">{item.username}</span>
                          <button
                            onClick={() => handleCopy(item.username, `user-t-${item.id}`, 'Username')}
                            className="text-zinc-400 hover:text-white"
                          >
                            {copiedKey === `user-t-${item.id}` ? (
                              <Check className="w-3 h-3 text-zinc-200" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-200 select-all">
                            {isRevealed ? item.password : '••••••••••••'}
                          </span>
                          <button
                            onClick={() => togglePasswordReveal(item.id)}
                            className="text-zinc-400 hover:text-white"
                            title={isRevealed ? 'Hide' : 'Show'}
                          >
                            {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                          <button
                            onClick={() => handleCopy(item.password, `pass-t-${item.id}`, 'Password')}
                            className="text-zinc-400 hover:text-white"
                            title="Copy Password"
                          >
                            {copiedKey === `pass-t-${item.id}` ? (
                              <Check className="w-3 h-3 text-zinc-200" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                          <button
                            onClick={() => openEditModal(item, 'password')}
                            className="text-zinc-400 hover:text-white ml-1 p-0.5"
                            title="Ubah Password"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      </td>

                      <td className="px-3 py-2 text-zinc-400 max-w-xs truncate text-[11px]">
                        {item.notes ? (
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{item.notes}</span>
                            <button
                              onClick={() => openEditModal(item, 'notes')}
                              className="text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100"
                              title="Edit Catatan"
                            >
                              <Pencil className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => openEditModal(item, 'notes')}
                            className="text-[11px] text-zinc-500 hover:text-zinc-400 italic"
                          >
                            + catatan
                          </button>
                        )}
                      </td>

                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditModal(item, 'all')}
                            className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors flex items-center gap-1 text-[11px]"
                            title="Edit Kredensial"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            className="p-1 rounded text-zinc-400 hover:text-red-300 hover:bg-red-950/30 transition-colors"
                            title="Hapus"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Vault Entry Modal */}
      <VaultModal
        isOpen={isNewModalOpen}
        onClose={() => {
          setIsNewModalOpen(false);
          setEditingItem(null);
        }}
        onSave={handleSaveCredential}
        initialData={null}
      />

      {/* Dedicated Edit Vault Modal (Password, URL, Notes) */}
      <EditVaultModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingItem(null);
        }}
        item={editingItem}
        initialFocusField={editFocusField}
        onSave={handleSaveCredential}
      />

      <OidcModal
        isOpen={isOidcModalOpen}
        onClose={() => setIsOidcModalOpen(false)}
        onShowToast={onShowToast}
      />

      <ForwardAuthGuideModal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
        onShowToast={onShowToast}
      />
    </div>
  );
};
