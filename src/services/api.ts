import { auth } from '../lib/firebase';

const API_BASE = '/api/v1';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to perform this action.');
  }
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...authHeaders,
    ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({
    success: false,
    message: `Request failed with status ${response.status}`,
  }));

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || `HTTP ${response.status} error`);
  }

  return payload as T;
}
