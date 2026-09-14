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

export interface OidcClient {
  id: string;
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  scopes: string[];
  created_at: string;
}

const API_BASE = '';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
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
  // Auth
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

  // Vault
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

  // OIDC Clients
  async getOidcClients(): Promise<{ clients: OidcClient[] }> {
    return request<{ clients: OidcClient[] }>('/api/oidc/clients');
  },

  async createOidcClient(data: {
    client_name: string;
    client_id?: string;
    redirect_uris: string[];
    scopes?: string[];
  }): Promise<{ client: OidcClient; client_secret: string }> {
    return request('/api/oidc/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteOidcClient(id: string): Promise<{ success: boolean }> {
    return request(`/api/oidc/clients/${id}`, {
      method: 'DELETE',
    });
  },

  // OIDC Consent Decision
  async submitConsent(data: {
    client_id: string;
    redirect_uri: string;
    scope?: string;
    state?: string;
    action: 'allow' | 'deny';
  }): Promise<{ success?: boolean; redirect_url: string }> {
    return request('/api/oauth/authorize', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
