import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// 1. Users (supports both password auth and Firebase Google OAuth)
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    uid: text('uid').notNull().unique(),
    fullName: text('full_name'),
    username: text('username'),
    email: text('email').notNull(),
    pendingEmail: text('pending_email'),
    passwordHash: text('password_hash'),
    phoneNumber: text('phone_number'),
    bio: text('bio'),
    profileImageKey: text('profile_image_key'),
    country: text('country'),
    state: text('state'),
    city: text('city'),
    website: text('website'),
    linkedinUrl: text('linkedin_url'),
    githubUrl: text('github_url'),
    isActive: boolean('is_active').default(true).notNull(),
    isVerified: boolean('is_verified').default(false).notNull(),
    isDemoAccount: boolean('is_demo_account').default(false).notNull(),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    creditsBalance: integer('credits_balance').default(1000).notNull(),
    role: text('role').default('creator').notNull(), // user | creator | moderator | admin | super_admin
    accountStatus: text('account_status').default('active').notNull(), // active | banned | suspended | deleted | deactivated
    banReason: text('ban_reason'),
    banExpiresAt: timestamp('ban_expires_at'),
    bannedAt: timestamp('banned_at'),
    bannedBy: uuid('banned_by'),
    createdByAdminId: uuid('created_by_admin_id'),
    tokenVersion: integer('token_version').default(1).notNull(),
    passwordChangedAt: timestamp('password_changed_at'),
    lastLoginAt: timestamp('last_login_at'),
    deletionRequestedAt: timestamp('deletion_requested_at'),
    deletionScheduledFor: timestamp('deletion_scheduled_for'),
    deletionReason: text('deletion_reason'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('users_email_idx').on(table.email),
    uniqueIndex('users_username_uidx').on(table.username),
    index('users_role_status_idx').on(table.role, table.accountStatus),
    index('users_demo_idx').on(table.isDemoAccount),
  ]
);

// 1b. Refresh Tokens (hashed opaque tokens with rotation & reuse detection)
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    familyId: uuid('family_id').notNull(),
    replacedByTokenId: uuid('replaced_by_token_id'),
    rememberMe: boolean('remember_me').default(false).notNull(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('refresh_tokens_user_idx').on(table.userId),
    index('refresh_tokens_family_idx').on(table.familyId),
  ]
);

// 1c. Password Reset Tokens (single-use hashed tokens with short expiration)
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('password_reset_tokens_user_idx').on(table.userId)]
);

// 1d. Email Verification Tokens (supports both initial verification and email change confirmation)
export const emailVerificationTokens = pgTable(
  'email_verification_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    pendingEmail: text('pending_email'),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('email_verification_tokens_user_idx').on(table.userId)]
);

// 1e. User Preferences
export const userPreferences = pgTable(
  'user_preferences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    theme: text('theme').default('dark').notNull(), // light | dark | system
    language: text('language').default('en').notNull(),
    timezone: text('timezone').default('UTC').notNull(),
    defaultAspectRatio: text('default_aspect_ratio').default('16:9').notNull(), // 16:9 | 9:16 | 1:1 | 4:3
    defaultExportQuality: text('default_export_quality').default('standard').notNull(), // standard | low
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('user_preferences_user_idx').on(table.userId)]
);

// 1f. Notification Preferences
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    emailNotifications: boolean('email_notifications').default(true).notNull(),
    projectUpdates: boolean('project_updates').default(true).notNull(),
    generationCompleted: boolean('generation_completed').default(true).notNull(),
    generationFailed: boolean('generation_failed').default(true).notNull(),
    productAnnouncements: boolean('product_announcements').default(true).notNull(),
    marketingEmails: boolean('marketing_emails').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('notification_preferences_user_idx').on(table.userId)]
);

// 2. Projects
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    description: text('description').default('').notNull(),
    brandName: text('brand_name').default('').notNull(),
    targetAudience: text('target_audience').default('').notNull(),
    platform: text('platform').default('YouTube').notNull(),
    aspectRatio: text('aspect_ratio').default('16:9').notNull(),
    status: text('status').default('draft').notNull(), // draft | processing | completed | failed
    thumbnailUrl: text('thumbnail_url'),
    activeScriptRevisionId: uuid('active_script_revision_id'),
    selectedMusicAssetId: uuid('selected_music_asset_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('projects_user_id_idx').on(table.userId)]
);

// 3. Immutable Script Revisions
export const scriptRevisions = pgTable(
  'script_revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    versionNumber: integer('version_number').notNull(),
    title: text('title').notNull(),
    brandName: text('brand_name').default('').notNull(),
    targetAudience: text('target_audience').default('').notNull(),
    platform: text('platform').default('YouTube').notNull(),
    targetDurationSec: integer('target_duration_sec').default(30).notNull(),
    language: text('language').default('English').notNull(),
    toneOfVoice: text('tone_of_voice').default('Energetic').notNull(),
    marketingObjective: text('marketing_objective').default('Brand Awareness').notNull(),
    topic: text('topic').default('').notNull(),
    contentType: text('content_type').default('YouTube').notNull(),
    content: text('content').notNull(),
    aiModelUsed: text('ai_model_used').default('manual').notNull(),
    aiNotes: text('ai_notes'),
    groundingSources: jsonb('grounding_sources').$type<Array<{ title: string; uri: string }>>(),
    usageJson: jsonb('usage_json').$type<{
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      estimatedCostUsd?: number;
      provider?: string;
      isMock?: boolean;
    }>(),
    createdByUid: text('created_by_uid').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('script_revisions_project_idx').on(table.projectId),
    uniqueIndex('script_revisions_project_version_uidx').on(table.projectId, table.versionNumber),
  ]
);

// 4. Scenes
export const scenes = pgTable(
  'scenes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    scriptRevisionId: uuid('script_revision_id').references(() => scriptRevisions.id, {
      onDelete: 'set null',
    }),
    sceneOrder: integer('scene_order').notNull(),
    title: text('title').notNull(),
    narration: text('narration').default('').notNull(),
    visualDescription: text('visual_description').default('').notNull(),
    imagePrompt: text('image_prompt').default('').notNull(),
    videoPrompt: text('video_prompt').default('').notNull(),
    durationSec: integer('duration_sec').default(5).notNull(),
    transition: text('transition').default('fade').notNull(), // none | fade | dissolve | wipeleft
    mediaPreference: text('media_preference').default('image').notNull(), // image | video
    selectedAssetId: uuid('selected_asset_id'),
    voiceoverAssetId: uuid('voiceover_asset_id'),
    generationStatus: text('generation_status').default('idle').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('scenes_project_order_idx').on(table.projectId, table.sceneOrder)]
);

// 5. Assets (Metadata only; media stored in object storage)
export const assets = pgTable(
  'assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    sceneId: uuid('scene_id').references(() => scenes.id, { onDelete: 'set null' }),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    assetType: text('asset_type').notNull(), // image | video | audio_tts | audio_music | upload
    mimeType: text('mime_type').notNull(),
    storageKey: text('storage_key').notNull(),
    fileName: text('file_name').notNull(),
    fileSizeBytes: integer('file_size_bytes').default(0).notNull(),
    width: integer('width'),
    height: integer('height'),
    durationSec: integer('duration_sec'),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    promptUsed: text('prompt_used'),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>(),
    generationActionId: uuid('generation_action_id'),
    isAccepted: boolean('is_accepted').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('assets_project_idx').on(table.projectId),
    index('assets_scene_idx').on(table.sceneId),
  ]
);

// 6. Generation Actions (Idempotent unit of work & billing)
export const generationActions = pgTable(
  'generation_actions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    sceneId: uuid('scene_id').references(() => scenes.id, { onDelete: 'set null' }),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    actionType: text('action_type').default('media_generation').notNull(), // image_generation | video_generation | tts_generation | music_generation
    mediaType: text('media_type').notNull(), // image | video | audio_tts | audio_music
    provider: text('provider').notNull(), // gemini | openai | mock
    model: text('model').notNull(),
    prompt: text('prompt').notNull(),
    configJson: jsonb('config_json').$type<Record<string, unknown>>(),
    status: text('status').default('queued').notNull(), // queued | processing | completed | failed | cancelled
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('gen_actions_project_idx').on(table.projectId)]
);

// 7. Generation Jobs
export const generationJobs = pgTable(
  'generation_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actionId: uuid('action_id')
      .references(() => generationActions.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    sceneId: uuid('scene_id').references(() => scenes.id, { onDelete: 'set null' }),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    provider: text('provider').default('mock').notNull(),
    providerJobId: text('provider_job_id'),
    status: text('status').default('queued').notNull(), // queued | processing | succeeded | failed | retrying | cancelled | timed_out
    progress: integer('progress').default(0).notNull(),
    acceptedAttemptId: uuid('accepted_attempt_id'),
    resultAssetId: uuid('result_asset_id'),
    errorMessage: text('error_message'),
    attemptCount: integer('attempt_count').default(0).notNull(),
    startedAt: timestamp('started_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    index('gen_jobs_project_idx').on(table.projectId),
    index('gen_jobs_status_idx').on(table.status),
  ]
);

// 8. Generation Attempts (supports retries & guards against late-arriving stale results)
export const generationAttempts = pgTable(
  'generation_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .references(() => generationJobs.id, { onDelete: 'cascade' })
      .notNull(),
    actionId: uuid('action_id')
      .references(() => generationActions.id, { onDelete: 'cascade' })
      .notNull(),
    attemptNumber: integer('attempt_number').notNull(),
    status: text('status').default('queued').notNull(), // queued | processing | succeeded | failed | timed_out | stale_ignored
    providerRequestId: text('provider_request_id'),
    errorMessage: text('error_message'),
    usageJson: jsonb('usage_json').$type<Record<string, unknown>>(),
    durationMs: integer('duration_ms'),
    startedAt: timestamp('started_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    finishedAt: timestamp('finished_at'),
  },
  (table) => [index('gen_attempts_job_idx').on(table.jobId)]
);

// 9. Exports (Draft video renders)
export const exportsTable = pgTable(
  'exports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    format: text('format').default('mp4').notNull(),
    resolution: text('resolution').default('1280x720').notNull(),
    totalDurationSec: integer('total_duration_sec').notNull(),
    snapshotJson: jsonb('snapshot_json')
      .$type<{
        aspectRatio: string;
        musicAssetId?: string | null;
        scenes: Array<{
          sceneId: string;
          title: string;
          order: number;
          durationSec: number;
          transition: string;
          assetId: string;
          voiceoverAssetId?: string | null;
        }>;
      }>()
      .notNull(),
    musicAssetId: uuid('music_asset_id'),
    storageKey: text('storage_key'),
    fileSizeBytes: integer('file_size_bytes'),
    status: text('status').default('queued').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('exports_project_idx').on(table.projectId)]
);

// 10. Export Jobs
export const exportJobs = pgTable(
  'export_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    exportId: uuid('export_id')
      .references(() => exportsTable.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    status: text('status').default('queued').notNull(), // queued | processing | succeeded | failed
    progressPct: integer('progress_pct').default(0).notNull(),
    currentStep: text('current_step').default('Queued for FFmpeg').notNull(),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => [index('export_jobs_project_idx').on(table.projectId)]
);

// 11. Billing Transactions (1-to-1 with GenerationAction to prevent double-charging)
export const billingTransactions = pgTable(
  'billing_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actionId: uuid('action_id')
      .references(() => generationActions.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    mediaType: text('media_type').notNull(),
    usageUnits: integer('usage_units').notNull(),
    estimatedCredits: integer('estimated_credits').notNull(),
    actualCredits: integer('actual_credits'),
    status: text('status').default('reserved').notNull(), // reserved | settled | refunded
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('billing_user_idx').on(table.userId)]
);

// 12. User Ban & Unban History
export const userBanHistory = pgTable(
  'user_ban_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    action: text('action').notNull(), // ban | unban | suspend | restore
    banType: text('ban_type'), // temporary | permanent
    reason: text('reason').notNull(),
    internalNote: text('internal_note'),
    performedBy: uuid('performed_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('user_ban_history_user_idx').on(table.userId),
    index('user_ban_history_created_idx').on(table.createdAt),
  ]
);

// 13. Immutable Admin Audit Logs
export const adminAuditLogs = pgTable(
  'admin_audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    adminId: uuid('admin_id').references(() => users.id, { onDelete: 'set null' }),
    targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    outcome: text('outcome').default('success').notNull(), // success | denied | failed
    previousValues: jsonb('previous_values').$type<Record<string, unknown> | null>(),
    newValues: jsonb('new_values').$type<Record<string, unknown> | null>(),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('admin_audit_admin_idx').on(table.adminId),
    index('admin_audit_target_idx').on(table.targetUserId),
    index('admin_audit_created_idx').on(table.createdAt),
  ]
);

// 14. User Activity Timeline
export const userActivities = pgTable(
  'user_activities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    activityType: text('activity_type').notNull(),
    description: text('description').notNull(),
    relatedProjectId: uuid('related_project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    relatedAssetId: uuid('related_asset_id').references(() => assets.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('user_activities_user_idx').on(table.userId),
    index('user_activities_type_idx').on(table.activityType),
    index('user_activities_created_idx').on(table.createdAt),
  ]
);

// 15. Granular RBAC Permissions Catalog
export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(),
    category: text('category').notNull(),
    description: text('description').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('permissions_category_idx').on(table.category)]
);

// 16. Admin Permission Assignments (Super Admin grants/revokes per Admin)
export const adminPermissions = pgTable(
  'admin_permissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    adminUserId: uuid('admin_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    permissionId: uuid('permission_id')
      .references(() => permissions.id, { onDelete: 'cascade' })
      .notNull(),
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
    scopeJson: jsonb('scope_json').$type<Record<string, unknown> | null>(),
    grantedAt: timestamp('granted_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('admin_permissions_user_perm_uidx').on(table.adminUserId, table.permissionId),
    index('admin_permissions_user_idx').on(table.adminUserId),
    index('admin_permissions_perm_idx').on(table.permissionId),
  ]
);

// 17. Platform Configuration Settings (Super Admin managed)
export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey(),
  valueJson: jsonb('value_json').$type<Record<string, unknown>>().notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  projects: many(projects),
  assets: many(assets),
  billingTransactions: many(billingTransactions),
  refreshTokens: many(refreshTokens),
  passwordResetTokens: many(passwordResetTokens),
  emailVerificationTokens: many(emailVerificationTokens),
  banHistory: many(userBanHistory),
  activities: many(userActivities),
  adminPermissions: many(adminPermissions, { relationName: 'adminUserPermissions' }),
  preferences: one(userPreferences, {
    fields: [users.id],
    references: [userPreferences.userId],
  }),
  notificationPreferences: one(notificationPreferences, {
    fields: [users.id],
    references: [notificationPreferences.userId],
  }),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  assignments: many(adminPermissions),
}));

export const adminPermissionsRelations = relations(adminPermissions, ({ one }) => ({
  adminUser: one(users, {
    fields: [adminPermissions.adminUserId],
    references: [users.id],
    relationName: 'adminUserPermissions',
  }),
  permission: one(permissions, {
    fields: [adminPermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const userBanHistoryRelations = relations(userBanHistory, ({ one }) => ({
  user: one(users, { fields: [userBanHistory.userId], references: [users.id] }),
}));

export const userActivitiesRelations = relations(userActivities, ({ one }) => ({
  user: one(users, { fields: [userActivities.userId], references: [users.id] }),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, { fields: [userPreferences.userId], references: [users.id] }),
}));

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  user: one(users, { fields: [notificationPreferences.userId], references: [users.id] }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, { fields: [passwordResetTokens.userId], references: [users.id] }),
}));

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, { fields: [emailVerificationTokens.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, { fields: [projects.userId], references: [users.id] }),
  scriptRevisions: many(scriptRevisions),
  scenes: many(scenes),
  assets: many(assets),
  exports: many(exportsTable),
}));

export const scriptRevisionsRelations = relations(scriptRevisions, ({ one }) => ({
  project: one(projects, { fields: [scriptRevisions.projectId], references: [projects.id] }),
}));

export const scenesRelations = relations(scenes, ({ one, many }) => ({
  project: one(projects, { fields: [scenes.projectId], references: [projects.id] }),
  assets: many(assets),
}));

export const assetsRelations = relations(assets, ({ one }) => ({
  project: one(projects, { fields: [assets.projectId], references: [projects.id] }),
  scene: one(scenes, { fields: [assets.sceneId], references: [scenes.id] }),
  owner: one(users, { fields: [assets.userId], references: [users.id] }),
}));

export const generationActionsRelations = relations(generationActions, ({ one, many }) => ({
  job: one(generationJobs, {
    fields: [generationActions.id],
    references: [generationJobs.actionId],
  }),
  attempts: many(generationAttempts),
  billingTransaction: one(billingTransactions, {
    fields: [generationActions.id],
    references: [billingTransactions.actionId],
  }),
}));

export const generationJobsRelations = relations(generationJobs, ({ one, many }) => ({
  action: one(generationActions, {
    fields: [generationJobs.actionId],
    references: [generationActions.id],
  }),
  attempts: many(generationAttempts),
}));

export const generationAttemptsRelations = relations(generationAttempts, ({ one }) => ({
  job: one(generationJobs, {
    fields: [generationAttempts.jobId],
    references: [generationJobs.id],
  }),
}));
