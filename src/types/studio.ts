export interface UserProfile {
  id: string;
  uid: string;
  email: string;
  pendingEmail?: string | null;
  fullName?: string | null;
  username?: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  profileImageKey?: string | null;
  phoneNumber?: string | null;
  bio?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  creditsBalance: number;
  role: string;
  permissions?: string[];
  accountStatus?: string;
  banReason?: string | null;
  banExpiresAt?: string | null;
  bannedAt?: string | null;
  isActive?: boolean;
  isVerified?: boolean;
  isDemoAccount?: boolean;
  hasLocalPassword?: boolean;
  passwordChangedAt?: string | null;
  lastLoginAt?: string | null;
  deletionRequestedAt?: string | null;
  deletionScheduledFor?: string | null;
  deletionReason?: string | null;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserPreferences {
  id: string;
  userId: string;
  theme: 'light' | 'dark' | 'system';
  language: string;
  timezone: string;
  defaultAspectRatio: '16:9' | '9:16' | '1:1' | '4:3';
  defaultExportQuality: 'standard' | 'low';
  createdAt: string;
  updatedAt: string;
}

export interface NotificationPreferences {
  id: string;
  userId: string;
  emailNotifications: boolean;
  projectUpdates: boolean;
  generationCompleted: boolean;
  generationFailed: boolean;
  productAnnouncements: boolean;
  marketingEmails: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserSecurityInfo {
  currentLoginStatus: 'active';
  authMethod: 'password' | 'google_oauth' | 'google_and_password';
  emailVerified: boolean;
  pendingEmail: string | null;
  hasLocalPassword: boolean;
  passwordLastChangedAt: string | null;
  lastLoginAt: string | null;
  activeSessionCount: number;
  googleOAuthConfigured: boolean;
  googleConnected: boolean;
  recommendations: Array<{
    id: string;
    title: string;
    detail: string;
    status: 'done' | 'action';
  }>;
}

export interface UserSessionInfo {
  id: string;
  familyId: string;
  rememberMe: boolean;
  userAgent: string;
  ipAddress: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  description: string;
  brandName: string;
  targetAudience: string;
  platform: string;
  aspectRatio: string;
  status: 'draft' | 'processing' | 'completed' | 'failed';
  thumbnailUrl: string | null;
  activeScriptRevisionId: string | null;
  selectedMusicAssetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalProjects: number;
  completedProjects: number;
  processingProjects: number;
  failedJobs: number;
}

export interface AIUsageStats {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  provider?: string;
  isMock?: boolean;
  providerRequestId?: string;
}

export interface ScriptRevision {
  id: string;
  projectId: string;
  versionNumber: number;
  title: string;
  brandName: string;
  targetAudience: string;
  platform: string;
  targetDurationSec: number;
  language: string;
  toneOfVoice: string;
  marketingObjective: string;
  topic?: string;
  contentType?: string;
  content: string;
  aiModelUsed: string;
  aiNotes: string | null;
  groundingSources: Array<{ title: string; uri: string }> | null;
  usageJson?: AIUsageStats | null;
  createdByUid: string;
  createdAt: string;
}

export interface Scene {
  id: string;
  projectId: string;
  scriptRevisionId: string | null;
  sceneOrder: number;
  title: string;
  narration: string;
  visualDescription: string;
  imagePrompt: string;
  videoPrompt: string;
  durationSec: number;
  transition: 'fade' | 'dissolve' | 'wipeleft' | 'none';
  mediaPreference: 'image' | 'video';
  selectedAssetId: string | null;
  voiceoverAssetId: string | null;
  generationStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  projectId: string;
  sceneId: string | null;
  userId: string;
  assetType: 'image' | 'video' | 'audio_tts' | 'audio_music' | 'upload';
  mimeType: string;
  storageKey: string;
  fileName: string;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  provider: string;
  model: string;
  promptUsed: string | null;
  metadataJson: Record<string, unknown> | null;
  generationActionId: string | null;
  isAccepted: boolean;
  createdAt: string;
  signedUrl: string;
  downloadUrl: string;
}

export interface GenerationJob {
  id: string;
  actionId: string;
  sceneId: string | null;
  status: 'queued' | 'processing' | 'succeeded' | 'failed' | 'retrying' | 'cancelled' | 'timed_out';
  progress?: number;
  providerJobId?: string | null;
  attemptCount: number;
  errorMessage: string | null;
  resultAssetId: string | null;
  startedAt?: string | null;
  createdAt: string;
  completedAt: string | null;
  mediaType: string;
  provider: string;
  model: string;
  actionStatus?: string;
  asset?: Asset | null;
}

export interface ProviderOverview {
  defaults: {
    llmProvider: 'gemini' | 'openai' | 'mock';
    imageProvider: 'gemini' | 'openai' | 'mock';
    videoProvider: 'gemini' | 'openai' | 'mock';
    requestTimeoutSec: number;
    maxRetries: number;
  };
  configuredKeys: {
    gemini: boolean;
    openai: boolean;
    openaiVideoEndpoint: boolean;
  };
  warnings: string[];
  providers: {
    llm: Array<{
      name: string;
      isMock: boolean;
      supportsSearchGrounding: boolean;
      supportsStructuredJson: boolean;
      limitations: string[];
    }>;
    image: Array<{
      name: string;
      isMock: boolean;
      supportedAspectRatios: string[];
      supportsImageEditing: boolean;
      supportsSearchGrounding: boolean;
      supportsResolutions: string[];
      limitations: string[];
    }>;
    video: Array<{
      name: string;
      isMock: boolean;
      supportedAspectRatios: string[];
      supportsImageToVideo: boolean;
      minDurationSec: number;
      maxDurationSec: number;
      supportedResolutions: string[];
      limitations: string[];
    }>;
  };
}

export interface ExportRecord {
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
  job: {
    id: string;
    status: string;
    progressPct: number;
    currentStep: string;
    errorMessage: string | null;
  } | null;
}

export interface BillingTransaction {
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
}
