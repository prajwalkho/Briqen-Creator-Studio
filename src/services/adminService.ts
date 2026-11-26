import { authHttp } from './authService';
import type { UserProfile } from '../types/studio';
import type {
  AdminActivityLogItem,
  AdminAssetItem,
  AdminAuditLogItem,
  AdminBanHistoryItem,
  AdminCanonicalRole,
  AdminDashboardStats,
  AdminProjectItem,
  AdminSceneItem,
  AdminScriptItem,
  AdminSessionItem,
  AdminUserDetailResponse,
  AdminUserGenerationsResponse,
  AdminUserListItem,
  PaginationInfo,
} from '../types/admin';

export async function getAdminBootstrapStatus(): Promise<{
  needsBootstrap: boolean;
  superAdminCount: number;
  callerRole: AdminCanonicalRole;
}> {
  const res = await authHttp.get<{
    data: {
      needsBootstrap: boolean;
      superAdminCount: number;
      callerRole: AdminCanonicalRole;
    };
  }>('/admin/bootstrap-status');
  return res.data.data;
}

export async function bootstrapSuperAdmin(): Promise<{ user: UserProfile; message: string }> {
  const res = await authHttp.post<{ message: string; data: { user: UserProfile } }>(
    '/admin/bootstrap-super-admin'
  );
  return { user: res.data.data.user, message: res.data.message };
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const res = await authHttp.get<{ data: AdminDashboardStats }>('/admin/dashboard/stats');
  return res.data.data;
}

export async function getAdminRegistrationTrends(
  days = 30
): Promise<Array<{ day: string; count: number }>> {
  const res = await authHttp.get<{ data: Array<{ day: string; count: number }> }>(
    `/admin/dashboard/registrations?days=${days}`
  );
  return res.data.data;
}

export async function listAdminUsers(params: {
  search?: string;
  status?: string;
  role?: string;
  sort?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: AdminUserListItem[]; pagination: PaginationInfo }> {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.status) qs.set('status', params.status);
  if (params.role) qs.set('role', params.role);
  if (params.sort) qs.set('sort', params.sort);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));

  const res = await authHttp.get<{
    data: { items: AdminUserListItem[]; pagination: PaginationInfo };
  }>(`/admin/users?${qs.toString()}`);
  return res.data.data;
}

export async function createAdminUser(payload: {
  fullName: string;
  username?: string;
  email: string;
  password: string;
  role?: AdminCanonicalRole;
  accountStatus?: 'active' | 'suspended';
  isVerified?: boolean;
  creditsBalance?: number;
  phoneNumber?: string;
  bio?: string;
  country?: string;
  state?: string;
  city?: string;
  website?: string;
  linkedinUrl?: string;
  githubUrl?: string;
}): Promise<{ user: UserProfile; message: string }> {
  const res = await authHttp.post<{ message: string; data: UserProfile }>('/admin/users', payload);
  return { user: res.data.data, message: res.data.message };
}

export async function getAdminUserDetail(userId: string): Promise<AdminUserDetailResponse> {
  const res = await authHttp.get<{ data: AdminUserDetailResponse }>(`/admin/users/${userId}`);
  return res.data.data;
}

export async function updateAdminUser(
  userId: string,
  payload: Record<string, unknown>
): Promise<{ user: UserProfile; message: string }> {
  const res = await authHttp.patch<{ message: string; data: UserProfile }>(
    `/admin/users/${userId}`,
    payload
  );
  return { user: res.data.data, message: res.data.message };
}

export async function uploadAdminUserAvatar(
  userId: string,
  file: File
): Promise<{ user: UserProfile; message: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await authHttp.post<{ message: string; data: UserProfile }>(
    `/admin/users/${userId}/avatar`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return { user: res.data.data, message: res.data.message };
}

export async function softDeleteAdminUser(
  userId: string,
  reason?: string
): Promise<{ user: UserProfile; message: string }> {
  const res = await authHttp.delete<{ message: string; data: UserProfile }>(
    `/admin/users/${userId}`,
    { data: { permanent: false, reason } }
  );
  return { user: res.data.data, message: res.data.message };
}

export async function permanentDeleteAdminUser(
  userId: string,
  confirmPhrase: string,
  reason?: string
): Promise<string> {
  const res = await authHttp.delete<{ message: string }>(
    `/admin/users/${userId}?permanent=true`,
    { data: { permanent: true, confirmPhrase, reason } }
  );
  return res.data.message;
}

export async function restoreAdminUser(
  userId: string
): Promise<{ user: UserProfile; message: string }> {
  const res = await authHttp.post<{ message: string; data: UserProfile }>(
    `/admin/users/${userId}/restore`
  );
  return { user: res.data.data, message: res.data.message };
}

export async function triggerAdminVerification(userId: string): Promise<string> {
  const res = await authHttp.post<{ message: string }>(
    `/admin/users/${userId}/send-verification`
  );
  return res.data.message;
}

export async function triggerAdminPasswordReset(userId: string): Promise<string> {
  const res = await authHttp.post<{ message: string }>(
    `/admin/users/${userId}/send-password-reset`
  );
  return res.data.message;
}

export async function getAdminUserProjects(userId: string): Promise<AdminProjectItem[]> {
  const res = await authHttp.get<{ data: AdminProjectItem[] }>(`/admin/users/${userId}/projects`);
  return res.data.data;
}

export async function getAdminUserScripts(userId: string): Promise<AdminScriptItem[]> {
  const res = await authHttp.get<{ data: AdminScriptItem[] }>(`/admin/users/${userId}/scripts`);
  return res.data.data;
}

export async function getAdminUserScenes(userId: string): Promise<AdminSceneItem[]> {
  const res = await authHttp.get<{ data: AdminSceneItem[] }>(`/admin/users/${userId}/scenes`);
  return res.data.data;
}

export async function getAdminUserGenerations(
  userId: string
): Promise<AdminUserGenerationsResponse> {
  const res = await authHttp.get<{ data: AdminUserGenerationsResponse }>(
    `/admin/users/${userId}/generations`
  );
  return res.data.data;
}

export async function getAdminUserAssets(userId: string): Promise<AdminAssetItem[]> {
  const res = await authHttp.get<{ data: AdminAssetItem[] }>(`/admin/users/${userId}/assets`);
  return res.data.data;
}

export async function getAdminUserSessions(userId: string): Promise<AdminSessionItem[]> {
  const res = await authHttp.get<{ data: AdminSessionItem[] }>(`/admin/users/${userId}/sessions`);
  return res.data.data;
}

export async function revokeAdminUserSession(userId: string, sessionId: string): Promise<string> {
  const res = await authHttp.delete<{ message: string }>(
    `/admin/users/${userId}/sessions/${sessionId}`
  );
  return res.data.message;
}

export async function getAdminUserActivity(userId: string): Promise<AdminActivityLogItem[]> {
  const res = await authHttp.get<{ data: AdminActivityLogItem[] }>(
    `/admin/users/${userId}/activity`
  );
  return res.data.data;
}

export async function getAdminUserBanHistory(userId: string): Promise<AdminBanHistoryItem[]> {
  const res = await authHttp.get<{ data: AdminBanHistoryItem[] }>(
    `/admin/users/${userId}/ban-history`
  );
  return res.data.data;
}

export async function exportAdminUserData(userId: string): Promise<Record<string, unknown>> {
  const res = await authHttp.get<{ data: Record<string, unknown> }>(
    `/admin/users/${userId}/export`
  );
  return res.data.data;
}

export async function getAdminBansOverview(): Promise<{
  restrictedUsers: UserProfile[];
  history: AdminBanHistoryItem[];
}> {
  const res = await authHttp.get<{
    data: { restrictedUsers: UserProfile[]; history: AdminBanHistoryItem[] };
  }>('/admin/bans');
  return res.data.data;
}

export async function banAdminUser(
  userId: string,
  payload: {
    banType: 'temporary' | 'permanent';
    durationHours?: number;
    expiresAt?: string;
    reason: string;
    internalNote?: string;
  }
): Promise<{ user: UserProfile; message: string }> {
  const res = await authHttp.post<{ message: string; data: UserProfile }>(
    `/admin/users/${userId}/ban`,
    payload
  );
  return { user: res.data.data, message: res.data.message };
}

export async function unbanAdminUser(
  userId: string,
  payload?: { reason?: string; internalNote?: string }
): Promise<{ user: UserProfile; message: string }> {
  const res = await authHttp.post<{ message: string; data: UserProfile }>(
    `/admin/users/${userId}/unban`,
    payload || {}
  );
  return { user: res.data.data, message: res.data.message };
}

export async function updateAdminUserRole(
  userId: string,
  role: AdminCanonicalRole
): Promise<{ user: UserProfile; message: string }> {
  const res = await authHttp.patch<{ message: string; data: UserProfile }>(
    `/admin/users/${userId}/role`,
    { role }
  );
  return { user: res.data.data, message: res.data.message };
}

export async function listAdminActivities(params: {
  userId?: string;
  activityType?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: AdminActivityLogItem[]; pagination: PaginationInfo }> {
  const qs = new URLSearchParams();
  if (params.userId) qs.set('userId', params.userId);
  if (params.activityType) qs.set('activityType', params.activityType);
  if (params.search) qs.set('search', params.search);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const res = await authHttp.get<{
    data: { items: AdminActivityLogItem[]; pagination: PaginationInfo };
  }>(`/admin/activities?${qs.toString()}`);
  return res.data.data;
}

export async function listAdminAuditLogs(params: {
  action?: string;
  outcome?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: AdminAuditLogItem[]; pagination: PaginationInfo }> {
  const qs = new URLSearchParams();
  if (params.action) qs.set('action', params.action);
  if (params.outcome) qs.set('outcome', params.outcome);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const res = await authHttp.get<{
    data: { items: AdminAuditLogItem[]; pagination: PaginationInfo };
  }>(`/admin/audit-logs?${qs.toString()}`);
  return res.data.data;
}

export async function retryAdminGenerationJob(jobId: string): Promise<string> {
  const res = await authHttp.post<{ message: string }>(`/admin/generation-jobs/${jobId}/retry`);
  return res.data.message;
}

export async function listAdminProjects(params: {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{
  items: Array<{
    id: string;
    userId: string;
    userEmail: string;
    userFullName: string | null;
    title: string;
    platform: string;
    aspectRatio: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  pagination: PaginationInfo;
}> {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.status) qs.set('status', params.status);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const res = await authHttp.get<{ data: any }>(`/admin/projects?${qs.toString()}`);
  return res.data.data;
}

export async function updateAdminProject(
  projectId: string,
  payload: { status?: 'draft' | 'processing' | 'completed' | 'failed'; title?: string }
): Promise<string> {
  const res = await authHttp.patch<{ message: string }>(`/admin/projects/${projectId}`, payload);
  return res.data.message;
}

export async function downloadAdminOperationalReportCsv(): Promise<void> {
  const res = await authHttp.get<Blob>('/admin/reports/export', { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'briqen-operational-users-report.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

