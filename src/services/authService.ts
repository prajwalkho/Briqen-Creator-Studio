import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { auth } from '../lib/firebase';
import { UserProfile } from '../types/studio';

// Access token is kept strictly in JS memory — never stored in localStorage or sessionStorage.
let inMemoryAccessToken: string | null = null;
let refreshPromise: Promise<AuthSessionResponse | null> | null = null;
let onUnauthorizedCallback: (() => void) | null = null;

export interface AuthSessionResponse {
  accessToken: string;
  expiresIn: number;
  user: UserProfile;
}

export interface DemoQuickLoginOption {
  label: string;
  role: 'super_admin' | 'admin' | 'user';
  email: string;
  password: string;
  description: string;
}

export interface AuthConfigResponse {
  googleOAuthEnabled: boolean;
  demoLoginEnabled: boolean;
  demoAccounts: DemoQuickLoginOption[];
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export function setOnUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorizedCallback = handler;
}

export const authHttp = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

authHttp.interceptors.request.use(async (config) => {
  if (inMemoryAccessToken) {
    config.headers.Authorization = `Bearer ${inMemoryAccessToken}`;
  } else if (auth.currentUser) {
    const firebaseToken = await auth.currentUser.getIdToken();
    config.headers.Authorization = `Bearer ${firebaseToken}`;
  }
  return config;
});

const PUBLIC_AUTH_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
  '/auth/config',
];

authHttp.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string }>) => {
    const originalRequest = error.config as RetryableConfig | undefined;
    const status = error.response?.status;
    const requestUrl = originalRequest?.url || '';

    const isPublicAuthEndpoint = PUBLIC_AUTH_PATHS.some((path) => requestUrl.startsWith(path));

    if (status === 401 && originalRequest && !originalRequest._retry && !isPublicAuthEndpoint) {
      originalRequest._retry = true;

      if (auth.currentUser) {
        try {
          const freshFirebaseToken = await auth.currentUser.getIdToken(true);
          originalRequest.headers.Authorization = `Bearer ${freshFirebaseToken}`;
          return authHttp(originalRequest);
        } catch {
          // fall through
        }
      } else {
        const refreshed = await refreshSession();
        if (refreshed?.accessToken) {
          originalRequest.headers.Authorization = `Bearer ${refreshed.accessToken}`;
          return authHttp(originalRequest);
        }
      }

      inMemoryAccessToken = null;
      onUnauthorizedCallback?.();
    }

    const serverMsg = error.response?.data?.message;
    return Promise.reject(new Error(serverMsg || error.message || 'Authentication request failed.'));
  }
);

export async function getAuthConfig(): Promise<AuthConfigResponse> {
  const res = await authHttp.get<{ data: AuthConfigResponse }>('/auth/config');
  return res.data.data;
}

export async function registerUser(payload: {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}): Promise<{ user: UserProfile; message: string; requiresVerification: boolean }> {
  const res = await authHttp.post<{
    message: string;
    data: { user: UserProfile; requiresVerification: boolean };
  }>('/auth/register', payload);
  return {
    user: res.data.data.user,
    message: res.data.message,
    requiresVerification: res.data.data.requiresVerification,
  };
}

export async function loginUser(payload: {
  email: string;
  password: string;
  rememberMe: boolean;
}): Promise<AuthSessionResponse> {
  const res = await authHttp.post<{ data: AuthSessionResponse }>('/auth/login', payload);
  inMemoryAccessToken = res.data.data.accessToken;
  return res.data.data;
}

export async function refreshSession(): Promise<AuthSessionResponse | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const res = await authHttp.post<{ data: AuthSessionResponse }>('/auth/refresh');
      inMemoryAccessToken = res.data.data.accessToken;
      return res.data.data;
    } catch {
      inMemoryAccessToken = null;
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function logoutSession(): Promise<void> {
  try {
    await authHttp.post('/auth/logout');
  } finally {
    inMemoryAccessToken = null;
  }
}

export async function fetchCurrentUser(): Promise<UserProfile> {
  const res = await authHttp.get<{ data: UserProfile }>('/auth/me');
  return res.data.data;
}

export async function requestPasswordReset(email: string): Promise<string> {
  const res = await authHttp.post<{ message: string }>('/auth/forgot-password', { email });
  return res.data.message;
}

export async function resetPassword(payload: {
  token: string;
  password: string;
  confirmPassword: string;
}): Promise<string> {
  const res = await authHttp.post<{ message: string }>('/auth/reset-password', payload);
  return res.data.message;
}

export async function verifyEmailToken(token: string): Promise<string> {
  const res = await authHttp.post<{ message: string }>('/auth/verify-email', { token });
  return res.data.message;
}
