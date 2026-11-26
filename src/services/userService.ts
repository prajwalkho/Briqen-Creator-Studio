import {
  NotificationPreferences,
  UserPreferences,
  UserProfile,
  UserSecurityInfo,
  UserSessionInfo,
} from '../types/studio';
import { apiRequest } from './api';
import { setAccessToken } from './authService';

export interface UserMeResponse {
  user: UserProfile;
  preferences: UserPreferences;
  notifications: NotificationPreferences;
}

export async function getMyProfileBundle(): Promise<UserMeResponse> {
  const res = await apiRequest<{ data: UserMeResponse }>('/users/me');
  return res.data;
}

export interface UpdatePersonalInfoPayload {
  fullName?: string;
  username?: string | null;
  email?: string;
  phoneNumber?: string | null;
  bio?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
}

export async function updatePersonalInfo(payload: UpdatePersonalInfoPayload): Promise<{
  user: UserProfile;
  message: string;
  requiresEmailVerification: boolean;
  pendingEmail: string | null;
}> {
  const res = await apiRequest<{
    message: string;
    data: {
      user: UserProfile;
      requiresEmailVerification: boolean;
      pendingEmail: string | null;
    };
  }>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return {
    user: res.data.user,
    message: res.message,
    requiresEmailVerification: res.data.requiresEmailVerification,
    pendingEmail: res.data.pendingEmail,
  };
}

export async function resendEmailVerification(): Promise<string> {
  const res = await apiRequest<{ message: string }>('/users/me/resend-verification', {
    method: 'POST',
  });
  return res.message;
}

export async function uploadProfileAvatar(file: File): Promise<{
  user: UserProfile;
  message: string;
}> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiRequest<{
    message: string;
    data: { user: UserProfile };
  }>('/users/me/avatar', {
    method: 'POST',
    body: form,
  });
  return { user: res.data.user, message: res.message };
}

export async function removeProfileAvatar(): Promise<{
  user: UserProfile;
  message: string;
}> {
  const res = await apiRequest<{
    message: string;
    data: { user: UserProfile };
  }>('/users/me/avatar', {
    method: 'DELETE',
  });
  return { user: res.data.user, message: res.message };
}

export async function changeAccountPassword(payload: {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}): Promise<{ user: UserProfile; message: string }> {
  const res = await apiRequest<{
    message: string;
    data: { accessToken: string; expiresIn: number; user: UserProfile };
  }>('/users/me/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res.data.accessToken) {
    setAccessToken(res.data.accessToken);
  }
  return { user: res.data.user, message: res.message };
}

export async function getSecurityOverview(): Promise<UserSecurityInfo> {
  const res = await apiRequest<{ data: UserSecurityInfo }>('/users/me/security');
  return res.data;
}

export async function getActiveSessions(): Promise<UserSessionInfo[]> {
  const res = await apiRequest<{ data: UserSessionInfo[] }>('/users/me/sessions');
  return res.data;
}

export async function revokeSessionById(sessionId: string): Promise<{
  message: string;
  revokedCurrentSession: boolean;
}> {
  const res = await apiRequest<{
    message: string;
    data: { revokedCurrentSession: boolean };
  }>(`/users/me/sessions/${sessionId}`, {
    method: 'DELETE',
  });
  return {
    message: res.message,
    revokedCurrentSession: res.data.revokedCurrentSession,
  };
}

export async function logoutAllDevices(): Promise<string> {
  const res = await apiRequest<{ message: string }>('/users/me/logout-all', {
    method: 'POST',
  });
  setAccessToken(null);
  return res.message;
}

export async function getPreferences(): Promise<UserPreferences> {
  const res = await apiRequest<{ data: UserPreferences }>('/users/me/preferences');
  return res.data;
}

export async function updatePreferences(
  patch: Partial<
    Pick<
      UserPreferences,
      'theme' | 'language' | 'timezone' | 'defaultAspectRatio' | 'defaultExportQuality'
    >
  >
): Promise<{ preferences: UserPreferences; message: string }> {
  const res = await apiRequest<{ message: string; data: UserPreferences }>('/users/me/preferences', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return { preferences: res.data, message: res.message };
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const res = await apiRequest<{ data: NotificationPreferences }>('/users/me/notifications');
  return res.data;
}

export async function updateNotificationPreferences(
  patch: Partial<
    Pick<
      NotificationPreferences,
      | 'emailNotifications'
      | 'projectUpdates'
      | 'generationCompleted'
      | 'generationFailed'
      | 'productAnnouncements'
      | 'marketingEmails'
    >
  >
): Promise<{ notifications: NotificationPreferences; message: string }> {
  const res = await apiRequest<{ message: string; data: NotificationPreferences }>(
    '/users/me/notifications',
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }
  );
  return { notifications: res.data, message: res.message };
}

export async function exportPersonalAccountData(): Promise<Record<string, unknown>> {
  const res = await apiRequest<{ data: Record<string, unknown> }>('/users/me/export');
  return res.data;
}

export async function submitAccountDeletionRequest(payload: {
  password?: string;
  confirmEmail?: string;
  confirmPhrase?: string;
  confirmDeletion: true;
  reason?: string;
  finalizeDeletion?: boolean;
}): Promise<{
  user: UserProfile;
  deactivated: boolean;
  deletionScheduledFor: string | null;
  message: string;
}> {
  const res = await apiRequest<{
    message: string;
    data: {
      user: UserProfile;
      deactivated: boolean;
      deletionScheduledFor: string | null;
    };
  }>('/users/me/deletion-request', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return {
    user: res.data.user,
    deactivated: res.data.deactivated,
    deletionScheduledFor: res.data.deletionScheduledFor,
    message: res.message,
  };
}

export async function cancelAccountDeletionRequest(): Promise<{
  user: UserProfile;
  message: string;
}> {
  const res = await apiRequest<{
    message: string;
    data: { user: UserProfile };
  }>('/users/me/cancel-deletion', {
    method: 'POST',
  });
  return { user: res.data.user, message: res.message };
}

export interface MyAssetsBundle {
  assets: Array<{
    id: string;
    projectId: string;
    projectTitle: string | null;
    sceneId: string | null;
    assetType: string;
    mimeType: string;
    fileName: string;
    fileSizeBytes: number;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    provider: string;
    model: string;
    promptUsed: string | null;
    isAccepted: boolean;
    createdAt: string;
    signedUrl: string;
    downloadUrl: string;
  }>;
  exports: Array<{
    id: string;
    projectId: string;
    projectTitle: string | null;
    title: string;
    format: string;
    resolution: string;
    totalDurationSec: number;
    fileSizeBytes: number | null;
    status: string;
    createdAt: string;
    previewUrl: string | null;
    downloadUrl: string | null;
  }>;
  summary: {
    assetCount: number;
    exportCount: number;
    totalStorageBytes: number;
  };
}

export interface MyUsageSummary {
  creditsBalance: number;
  creditsSettled: number;
  creditsReserved: number;
  creditsRefunded: number;
  counts: {
    projects: number;
    scripts: number;
    scenes: number;
    assets: number;
    exports: number;
    generations: number;
  };
  mediaBreakdown: Array<{ mediaType: string; count: number }>;
  history: Array<{
    id: string;
    projectId: string;
    projectTitle: string | null;
    sceneId: string | null;
    actionType: string;
    mediaType: string;
    provider: string;
    model: string;
    prompt: string;
    status: string;
    createdAt: string;
    job: {
      id: string;
      status: string;
      progress: number;
      errorMessage: string | null;
      attemptCount: number;
      completedAt: string | null;
    } | null;
    billing: {
      id: string;
      estimatedCredits: number;
      actualCredits: number | null;
      status: 'reserved' | 'settled' | 'refunded';
      createdAt: string;
    } | null;
  }>;
  transactions: Array<{
    id: string;
    actionId: string;
    provider: string;
    model: string;
    mediaType: string;
    usageUnits: number;
    estimatedCredits: number;
    actualCredits: number | null;
    status: 'reserved' | 'settled' | 'refunded';
    createdAt: string;
  }>;
}

export async function getMyAssetsBundle(assetType = 'all'): Promise<MyAssetsBundle> {
  const qs = assetType && assetType !== 'all' ? `?assetType=${encodeURIComponent(assetType)}` : '';
  const res = await apiRequest<{ data: MyAssetsBundle }>(`/users/me/assets${qs}`);
  return res.data;
}

export async function getMyUsageSummary(): Promise<MyUsageSummary> {
  const res = await apiRequest<{ data: MyUsageSummary }>('/users/me/usage');
  return res.data;
}

export async function getMyActivityLog(limit = 30): Promise<
  Array<{
    id: string;
    activityType: string;
    description: string;
    relatedProjectId: string | null;
    createdAt: string;
  }>
> {
  const res = await apiRequest<{ data: any[] }>(`/users/me/activity?limit=${limit}`);
  return res.data;
}

