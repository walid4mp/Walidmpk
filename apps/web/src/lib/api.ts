const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const API_URL = configuredApiUrl ? configuredApiUrl.replace(/\/$/, '') : '';

export interface ApiOptions extends RequestInit {
  token?: string | null;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = await response.json().catch(() => null);
      const message = payload?.message || payload?.error || JSON.stringify(payload);
      throw new Error(message || 'Request failed');
    }

    const errorText = await response.text();
    throw new Error(errorText || 'Request failed');
  }

  return response.json();
}

export { API_URL };
