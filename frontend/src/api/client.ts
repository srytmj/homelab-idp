export interface User {
  userId: string;
  username: string;
  email: string;
  displayName: string;
  role: string;
  avatarUrl?: string;
}

export interface VaultItem {
  id: string;
  service_name: string;
  category: string;
  service_url: string;
  username: string;
  password: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

const API_BASE = '';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // sends cookies
  });

  const contentType = res.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const errorMsg = isJson && data.message ? data.message : (isJson && data.error ? data.error : res.statusText);
    throw new Error(errorMsg || `Request failed with status ${res.status}`);
  }

  return data as T;
}

export const api = {
  // Auth & SSO Profile
  async getMe(): Promise<{ user: User }> {
    return request<{ user: User }>('/api/auth/me');
  },

  async login(username: string, password: string): Promise<{ success: boolean; user: User; token: string }> {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  async logout(): Promise<{ success: boolean }> {
    return request('/api/auth/logout', {
      method: 'POST',
    });
  },

  async updateProfile(data: {
    username?: string;
    email?: string;
    displayName?: string;
    currentPassword?: string;
    newPassword?: string;
  }): Promise<{ success: boolean; user: User; message: string }> {
    return request('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Credential Vault (Password Bank)
  async getVaultItems(q?: string, category?: string): Promise<{ credentials: VaultItem[] }> {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category && category !== 'All') params.set('category', category);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return request<{ credentials: VaultItem[] }>(`/api/vault${queryStr}`);
  },

  async createVaultItem(item: {
    service_name: string;
    category: string;
    service_url?: string;
    username: string;
    password: string;
    notes?: string;
  }): Promise<VaultItem> {
    return request<VaultItem>('/api/vault', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  },

  async updateVaultItem(
    id: string,
    item: {
      service_name: string;
      category: string;
      service_url?: string;
      username: string;
      password: string;
      notes?: string;
    }
  ): Promise<VaultItem> {
    return request<VaultItem>(`/api/vault/${id}`, {
      method: 'PUT',
      body: JSON.stringify(item),
    });
  },

  async deleteVaultItem(id: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/api/vault/${id}`, {
      method: 'DELETE',
    });
  },
};
