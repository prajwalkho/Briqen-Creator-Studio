import type { NotificationPreferences, UserPreferences, UserProfile } from './studio';

export type AdminCanonicalRole = 'super_admin' | 'admin' | 'user';

export interface AdminUserListItem extends UserProfile {
  projectCount: number;
  scriptCount: number;
  generationCount: number;
}

export interface AdminDashboardStats {
  totalUsers: number;
  activeUsers: number;
  bannedUsers: number;
  suspendedUsers: number;
  deletedUsers: number;
  verifiedUsers: number;
  unverifiedUsers: number;
  demoAccountsTotal: number;
  demoSuperAdmins: number;
  demoAdmins: number;
  demoRegularUsers: number;
  realUsersTotal: number;
  demoModeEnabled: boolean;
  financialScopeGranted?: boolean;
  roleBreakdown: {
    super_admin: number;
    admin: number;
    user: number;
  };
  totalProjects: number;
  totalScripts: number;
  totalScenes: number;
  totalImageGenerations: number;
  totalVideoGenerations: number;
  totalAudioGenerations: number;
  totalAssets: number;
  totalExports: number;
  failedJobs: number;
  recentRegistrations: UserProfile[];
  recentActivities: AdminActivityLogItem[];
  recentBans: Array<{
    id: string;
    userId: string;
    action: string;
    banType: string | null;
    reason: string;
    expiresAt: string | null;
    createdAt: string;
    targetEmail: string | null;
    targetName: string | null;
  }>;
  recentFailedJobs: Array<{
    id: string;
    projectId: string;
    userId: string;
    provider: string;
    status: string;
    errorMessage: string | null;
    attemptCount: number;
    createdAt: string;
    mediaType: string | null;
    userEmail: string | null;
  }>;
}

export interface AdminUserDetailResponse {
  user: UserProfile;
  preferences: UserPreferences;
  notifications: NotificationPreferences;
  counts: {
    projects: number;
    scripts: number;
    scenes: number;
    generationActions: number;
    generationJobs: number;
    assets: number;
    exports: number;
    activeSessions: number;
    banHistoryCount: number;
  };
}

export interface AdminProjectItem {
  id: string;
  userId: string;
  title: string;
  description: string;
  brandName: string;
  targetAudience: string;
  platform: string;
  aspectRatio: string;
  status: string;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminScriptItem {
  id: string;
  projectId: string;
  projectTitle: string;
  versionNumber: number;
  title: string;
  platform: string;
  toneOfVoice: string;
  language: string;
  targetDurationSec: number;
  content: string;
  aiModelUsed: string;
  aiNotes: string | null;
  createdAt: string;
}

export interface AdminSceneItem {
  id: string;
  projectId: string;
  projectTitle: string;
  sceneOrder: number;
  title: string;
  narration: string;
  visualDescription: string;
  imagePrompt: string;
  videoPrompt: string;
  durationSec: number;
  transition: string;
  mediaPreference: string;
  selectedAssetId: string | null;
  generationStatus: string;
  createdAt: string;
}

export interface AdminGenerationAttemptItem {
  id: string;
  jobId: string;
  actionId: string;
  attemptNumber: number;
  status: string;
  providerRequestId: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface AdminGenerationActionItem {
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
  retryCount: number;
  job: {
    id: string;
    status: string;
    progress: number;
    attemptCount: number;
    errorMessage: string | null;
    resultAssetId: string | null;
    createdAt: string;
    completedAt: string | null;
  } | null;
  attempts: AdminGenerationAttemptItem[];
}

export interface AdminUserGenerationsResponse {
  actions: AdminGenerationActionItem[];
  exports: Array<{
    id: string;
    projectId: string;
    title: string;
    format: string;
    resolution: string;
    totalDurationSec: number;
    status: string;
    fileSizeBytes: number | null;
    createdAt: string;
    previewUrl: string | null;
    downloadUrl: string | null;
  }>;
}

export interface AdminAssetItem {
  id: string;
  projectId: string;
  projectTitle: string | null;
  sceneId: string | null;
  assetType: string;
  mimeType: string;
  storageKey: string;
  fileName: string;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  provider: string;
  model: string;
  metadataJson: Record<string, unknown> | null;
  isAccepted: boolean;
  createdAt: string;
  signedUrl: string;
  downloadUrl: string;
}

export interface AdminSessionItem {
  id: string;
  familyId: string;
  rememberMe: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  status: 'active' | 'revoked' | 'expired';
}

export interface AdminBanHistoryItem {
  id: string;
  userId: string;
  action: string;
  banType: string | null;
  reason: string;
  internalNote: string | null;
  performedBy: string | null;
  performedByEmail?: string | null;
  userEmail?: string | null;
  userFullName?: string | null;
  isDemoAccount?: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export interface AdminActivityLogItem {
  id: string;
  userId: string;
  activityType: string;
  description: string;
  relatedProjectId: string | null;
  relatedAssetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  userEmail?: string | null;
  userFullName?: string | null;
  userRole?: string | null;
  isDemoAccount?: boolean | null;
}

export interface AdminAuditLogItem {
  id: string;
  adminId: string | null;
  targetUserId: string | null;
  adminEmail: string | null;
  targetEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  outcome: 'success' | 'denied' | 'failed';
  previousValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
