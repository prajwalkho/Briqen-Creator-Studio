import { authHttp } from './authService';
import type { AdminAuditLogItem, PaginationInfo } from '../types/admin';
import type { UserProfile } from '../types/studio';

export interface OwnerPermissionDefinition {
  id: string;
  name: string;
  category: string;
  description: string;
  assignedAdminCount: number;
}

export interface OwnerAdminSummary extends UserProfile {
  permissionCount: number;
  totalActionsPerformed: number;
  deniedAttempts: number;
  lastAdminActionAt: string | null;
  banOperationsCount: number;
  activeSessionCount: number;
}

export interface OwnerAdminDetail {
  admin: UserProfile;
  permissions: string[];
  stats: {
    totalActions: number;
    managedUsersCount: number;
    createdUsersCount: number;
    banOperations: number;
    unbanOperations: number;
    profileEdits: number;
    deniedAttempts: number;
    activeSessions: number;
  };
  sessions: Array<{
    id: string;
    userAgent: string | null;
    ipAddress: string | null;
    rememberMe: boolean;
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
    status: 'active' | 'revoked' | 'expired';
  }>;
  createdUsers: Array<{
    id: string;
    email: string;
    fullName: string | null;
    createdAt: string;
  }>;
  banOperations: Array<{
    id: string;
    userId: string;
    action: string;
    banType: string | null;
    reason: string;
    createdAt: string;
    targetEmail: string | null;
  }>;
  auditLogs: AdminAuditLogItem[];
  activities: Array<{
    id: string;
    activityType: string;
    description: string;
    createdAt: string;
  }>;
}

export interface OwnerOverviewStats {
  totalUsers: number;
  activeUsers: number;
  bannedUsers: number;
  suspendedUsers: number;
  deletedUsers: number;
  verifiedUsers: number;
  unverifiedUsers: number;
  totalSuperAdmins: number;
  totalAdmins: number;
  totalRegularUsers: number;
  demoUsers: number;
  realUsers: number;
  demoModeEnabled: boolean;
  totalProjects: number;
  projectsByStatus: Record<string, number>;
  totalScripts: number;
  totalScenes: number;
  totalGenerations: number;
  imageGenerations: number;
  videoGenerations: number;
  audioGenerations: number;
  failedJobs: number;
  succeededJobs: number;
  activeJobs: number;
  totalAssets: number;
  totalStorageBytes: number;
  totalExports: number;
  completedExports: number;
  totalCreditsBalance: number;
  totalCreditsSettled: number;
  totalCreditsReserved: number;
  totalCreditsRefunded: number;
  estimatedAiCostUsd: number;
  billingImplemented: boolean;
  confirmedRevenueUsd: number | null;
  recentUsers: UserProfile[];
  recentActivities: Array<{
    id: string;
    userId: string;
    activityType: string;
    description: string;
    createdAt: string;
    userEmail: string | null;
    userFullName: string | null;
  }>;
  recentAuditLogs: AdminAuditLogItem[];
}

export type AnalyticsRange = '7d' | '30d' | '90d' | '365d' | 'all';
export type AnalyticsGranularity = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface OwnerAnalyticsResponse {
  meta: {
    range: string;
    granularity: AnalyticsGranularity;
    from: string | null;
    to: string;
    generatedAt: string;
  };
  users: {
    registrationTrend: Array<{ period: string; count: number; demoCount: number; realCount: number }>;
    activityTrend: Array<{ period: string; count: number }>;
    statusDistribution: Array<{ label: string; value: number }>;
    roleDistribution: Array<{ label: string; value: number }>;
    verificationDistribution: Array<{ label: string; value: number }>;
    retention: {
      activeLast7d: number;
      activeLast30d: number;
      totalActiveAccounts: number;
      retention7dPct: number;
      retention30dPct: number;
    };
  };
  projects: {
    createdTrend: Array<{ period: string; count: number }>;
    statusDistribution: Array<{ label: string; value: number }>;
    platformDistribution: Array<{ label: string; value: number }>;
    aspectRatioDistribution: Array<{ label: string; value: number }>;
    completionRatePct: number;
    topUsersByProjects: Array<{
      userId: string;
      email: string;
      fullName: string | null;
      isDemoAccount: boolean;
      projectCount: number;
      completedCount: number;
    }>;
  };
  ai: {
    generationTrend: Array<{
      period: string;
      image: number;
      video: number;
      audio: number;
      script: number;
    }>;
    providerComparison: Array<{
      provider: string;
      total: number;
      succeeded: number;
      failed: number;
      avgDurationMs: number;
      estimatedCostUsd: number;
    }>;
    modelComparison: Array<{ model: string; provider: string; count: number }>;
    jobStatusDistribution: Array<{ label: string; value: number }>;
    retryStats: {
      totalAttempts: number;
      retriedJobs: number;
      avgDurationMs: number;
    };
    estimatedCostByProvider: Array<{
      provider: string;
      estimatedCostUsd: number;
      settledCredits: number;
      refundedCredits: number;
    }>;
  };
  media: {
    assetTypeDistribution: Array<{ assetType: string; count: number; totalBytes: number }>;
    exportTrend: Array<{ period: string; total: number; succeeded: number; failed: number }>;
    totalStorageBytes: number;
  };
  financial: {
    billingImplemented: boolean;
    confirmedRevenueUsd: number | null;
    note: string;
    creditTrend: Array<{
      period: string;
      settledCredits: number;
      reservedCredits: number;
      refundedCredits: number;
    }>;
    creditsSummary: {
      totalBalance: number;
      totalSettled: number;
      totalReserved: number;
      totalRefunded: number;
      estimatedAiCostUsd: number;
    };
  };
}

export interface OwnerSystemData {
  settings: {
    general: {
      platformName: string;
      supportEmail: string;
      maintenanceMode: boolean;
      registrationEnabled: boolean;
      requireEmailVerification: boolean;
      defaultStartingCredits: number;
    };
    aiDefaults: {
      scriptModelTier: 'fast' | 'balanced' | 'quality';
      maxScenesPerStoryboard: number;
      defaultAspectRatio: '16:9' | '9:16' | '1:1' | '4:3';
      allowMockFallback: boolean;
    };
    security: {
      sessionTimeoutMinutes: number;
      maxActiveSessionsPerUser: number;
      enforceStrongPasswords: boolean;
      auditRetentionDays: number;
    };
    featureFlags: {
      quickDraftExport: boolean;
      projectTemplates: boolean;
      aiImageGeneration: boolean;
      aiVideoGeneration: boolean;
      aiAudioGeneration: boolean;
    };
    billing: {
      billingImplemented: boolean;
      currency: string;
      plansSummary: Array<{ id: string; name: string; monthlyCredits: number; priceUsd: number }>;
    };
    updatedAtMap: Record<string, string>;
  };
  aiProviders: {
    llmProvider: string;
    imageProvider: string;
    videoProvider: string;
    requestTimeoutSec: number;
    maxRetries: number;
    geminiConfigured: boolean;
    openaiConfigured: boolean;
    openaiVideoConfigured: boolean;
    warnings: string[];
  };
  storage: {
    assetsCount: number;
    assetsBytes: number;
    exportsCount: number;
    exportsBytes: number;
    totalBytes: number;
  };
  health: {
    databaseConnected: boolean;
    ownerRecoveryConfigured: boolean;
    jobsByStatus: Record<string, number>;
  };
}

export async function getOwnerOverview(): Promise<OwnerOverviewStats> {
  const res = await authHttp.get<{ data: OwnerOverviewStats }>('/owner/overview');
  return res.data.data;
}

export async function getOwnerAnalytics(params: {
  range?: AnalyticsRange;
  granularity?: AnalyticsGranularity;
  from?: string;
  to?: string;
}): Promise<OwnerAnalyticsResponse> {
  const qs = new URLSearchParams();
  if (params.range) qs.set('range', params.range);
  if (params.granularity) qs.set('granularity', params.granularity);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  const res = await authHttp.get<{ data: OwnerAnalyticsResponse }>(`/owner/analytics?${qs.toString()}`);
  return res.data.data;
}

export async function downloadOwnerAnalyticsCsv(params: {
  type: 'overview' | 'users' | 'projects' | 'ai' | 'financial';
  range?: AnalyticsRange;
  granularity?: AnalyticsGranularity;
}): Promise<void> {
  const qs = new URLSearchParams();
  qs.set('type', params.type);
  if (params.range) qs.set('range', params.range);
  if (params.granularity) qs.set('granularity', params.granularity);

  const res = await authHttp.get<Blob>(`/owner/analytics/export?${qs.toString()}`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `briqen-owner-${params.type}-analytics.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function listOwnerPermissions(): Promise<OwnerPermissionDefinition[]> {
  const res = await authHttp.get<{ data: OwnerPermissionDefinition[] }>('/owner/permissions');
  return res.data.data;
}

export async function listOwnerAdmins(): Promise<OwnerAdminSummary[]> {
  const res = await authHttp.get<{ data: OwnerAdminSummary[] }>('/owner/admins');
  return res.data.data;
}

export async function createOwnerAdmin(payload: {
  fullName: string;
  email: string;
  password: string;
  username?: string;
  permissions?: string[];
}): Promise<{ user: UserProfile; message: string }> {
  const res = await authHttp.post<{ message: string; data: UserProfile }>('/owner/admins', payload);
  return { user: res.data.data, message: res.data.message };
}

export async function getOwnerAdminDetail(adminId: string): Promise<OwnerAdminDetail> {
  const res = await authHttp.get<{ data: OwnerAdminDetail }>(`/owner/admins/${adminId}`);
  return res.data.data;
}

export async function updateOwnerAdmin(
  adminId: string,
  payload: {
    fullName?: string;
    accountStatus?: 'active' | 'suspended' | 'banned';
    role?: 'user' | 'admin' | 'super_admin';
    banReason?: string;
  }
): Promise<{ user: UserProfile; message: string }> {
  const res = await authHttp.patch<{ message: string; data: UserProfile }>(
    `/owner/admins/${adminId}`,
    payload
  );
  return { user: res.data.data, message: res.data.message };
}

export async function updateOwnerAdminPermissions(
  adminId: string,
  permissions: string[]
): Promise<{ permissions: string[]; message: string }> {
  const res = await authHttp.put<{ message: string; data: { permissions: string[] } }>(
    `/owner/admins/${adminId}/permissions`,
    { permissions }
  );
  return { permissions: res.data.data.permissions, message: res.data.message };
}

export async function listOwnerProjects(params: {
  search?: string;
  status?: string;
  platform?: string;
  page?: number;
  limit?: number;
}): Promise<{
  items: Array<{
    id: string;
    userId: string;
    userEmail: string;
    userFullName: string | null;
    isDemoAccount: boolean;
    title: string;
    brandName: string;
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
  if (params.platform) qs.set('platform', params.platform);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const res = await authHttp.get<{ data: any }>(`/owner/projects?${qs.toString()}`);
  return res.data.data;
}

export async function deleteOwnerProject(projectId: string): Promise<string> {
  const res = await authHttp.delete<{ message: string }>(`/owner/projects/${projectId}`);
  return res.data.message;
}

export async function getOwnerSystemData(): Promise<OwnerSystemData> {
  const res = await authHttp.get<{ data: OwnerSystemData }>('/owner/system');
  return res.data.data;
}

export async function updateOwnerSystemSettings(payload: {
  general?: Partial<OwnerSystemData['settings']['general']>;
  aiDefaults?: Partial<OwnerSystemData['settings']['aiDefaults']>;
  security?: Partial<OwnerSystemData['settings']['security']>;
  featureFlags?: Partial<OwnerSystemData['settings']['featureFlags']>;
}): Promise<{ settings: OwnerSystemData['settings']; message: string }> {
  const res = await authHttp.patch<{ message: string; data: OwnerSystemData['settings'] }>(
    '/owner/system',
    payload
  );
  return { settings: res.data.data, message: res.data.message };
}

export async function listOwnerAuditLogs(params: {
  action?: string;
  outcome?: string;
  adminId?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: AdminAuditLogItem[]; pagination: PaginationInfo }> {
  const qs = new URLSearchParams();
  if (params.action) qs.set('action', params.action);
  if (params.outcome) qs.set('outcome', params.outcome);
  if (params.adminId) qs.set('adminId', params.adminId);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const res = await authHttp.get<{ data: { items: AdminAuditLogItem[]; pagination: PaginationInfo } }>(
    `/owner/audit-logs?${qs.toString()}`
  );
  return res.data.data;
}

export async function downloadOwnerAuditLogsCsv(): Promise<void> {
  const res = await authHttp.get<Blob>('/owner/audit-logs/export', { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'briqen-owner-audit-logs.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
