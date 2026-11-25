export interface UserProfile {
  id: string;
  uid: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  creditsBalance: number;
  role: string;
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
  content: string;
  aiModelUsed: string;
  aiNotes: string | null;
  groundingSources: Array<{ title: string; uri: string }> | null;
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
  attemptCount: number;
  errorMessage: string | null;
  resultAssetId: string | null;
  createdAt: string;
  completedAt: string | null;
  mediaType: string;
  provider: string;
  model: string;
  asset?: Asset | null;
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
