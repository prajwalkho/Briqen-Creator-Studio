import { auth } from '../lib/firebase';
import { getAccessToken, refreshSession } from './authService';

const API_BASE = '/api/v1';

async function getAuthHeaders(forceFirebaseRefresh = false): Promise<Record<string, string>> {
  const jwt = getAccessToken();
  if (jwt) {
    return {
      Authorization: `Bearer ${jwt}`,
    };
  }

  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken(forceFirebaseRefresh);
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  throw new Error('You must be signed in to perform this action.');
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const isFormData = options.body instanceof FormData;

  const sendWithToken = async (authHeaders: Record<string, string>) => {
    const headers: Record<string, string> = {
      ...authHeaders,
      ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
      'X-Requested-With': 'XMLHttpRequest',
      ...(options.headers as Record<string, string> | undefined),
    };

    return fetch(`${API_BASE}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers,
    });
  };

  let authHeaders = await getAuthHeaders(false);
  let response = await sendWithToken(authHeaders);

  // Transparently refresh expired access token and retry once
  if (response.status === 401) {
    if (auth.currentUser) {
      authHeaders = await getAuthHeaders(true);
      response = await sendWithToken(authHeaders);
    } else {
      const refreshed = await refreshSession();
      if (refreshed?.accessToken) {
        response = await sendWithToken({ Authorization: `Bearer ${refreshed.accessToken}` });
      }
    }
  }

  const payload = await response.json().catch(() => ({
    success: false,
    message: `Request failed with status ${response.status}`,
  }));

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || `HTTP ${response.status} error`);
  }

  return payload as T;
}
