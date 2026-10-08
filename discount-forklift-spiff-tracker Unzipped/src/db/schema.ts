import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  date,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 1. Sales Representatives
export const salesReps = pgTable('sales_reps', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }), // Valid rep email address required for new submissions
  branch: varchar('branch', { length: 128 }), // Rep's office or branch (e.g. "Phoenix - Main", "Tucson", "Denver")
  assignedGmIds: text('assigned_gm_ids'), // Comma-separated or JSON list of assigned General Manager contact IDs
  isActive: boolean('is_active').default(true).notNull(),
  displayOrder: integer('display_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 2. Notification Contacts (Accounting, General Managers, Other)
export const notificationContacts = pgTable('notification_contacts', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 64 }).notNull(), // 'Accounting' | 'General Manager' | 'Other'
  branch: varchar('branch', { length: 128 }), // Office or branch if applicable
  isDefaultAccounting: boolean('is_default_accounting').default(false).notNull(), // Preselected for accounting notifications
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 3. Available Spiffs
export const spiffs = pgTable('spiffs', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').notNull(),
  eligibilityRequirements: text('eligibility_requirements').notNull(),
  amountCents: integer('amount_cents').notNull(), // stored as integer cents ($100.00 = 10000)
  isActive: boolean('is_active').default(true).notNull(),
  displayOrder: integer('display_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 4. Spiff Submissions
export const spiffSubmissions = pgTable(
  'spiff_submissions',
  {
    id: varchar('id', { length: 64 }).primaryKey(), // e.g. SPF-2026-ABCD
    idempotencyKey: varchar('idempotency_key', { length: 128 }).unique(),
    repId: varchar('rep_id', { length: 64 }).notNull().references(() => salesReps.id),
    spiffId: varchar('spiff_id', { length: 64 }).notNull().references(() => spiffs.id),
    liftName: varchar('lift_name', { length: 255 }).notNull(),
    serialSuffix: varchar('serial_suffix', { length: 4 }).notNull(), // Exactly 4 chars, preserves leading zeros like '0042'
    saleDate: date('sale_date').notNull(),
    notes: text('notes'),
    status: varchar('status', { length: 32 }).default('Pending').notNull(), // 'Pending', 'Approved', 'Rejected' (displayed as Denied), 'Paid'

    // Snapshots: frozen at submission time so future changes do not rewrite history
    snapshotRepName: varchar('snapshot_rep_name', { length: 255 }).notNull(),
    snapshotRepEmail: varchar('snapshot_rep_email', { length: 255 }), // Snapshot of submitting rep email
    snapshotSpiffName: varchar('snapshot_spiff_name', { length: 255 }).notNull(),
    snapshotEligibilityRequirements: text('snapshot_eligibility_requirements').notNull(),
    snapshotAmountCents: integer('snapshot_amount_cents').notNull(),

    // Potential duplicate flag
    isPotentialDuplicate: boolean('is_potential_duplicate').default(false).notNull(),
    duplicateReason: text('duplicate_reason'),

    // Decision messages & audit
    decisionMessage: text('decision_message'), // Optional approval note or required denial reason

    // Timestamps and actors
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: varchar('approved_by', { length: 255 }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectedBy: varchar('rejected_by', { length: 255 }),
    rejectionReason: text('rejection_reason'), // Denial reason
    paidAt: timestamp('paid_at', { withTimezone: true }),
    paidBy: varchar('paid_by', { length: 255 }),
  },
  (table) => [
    index('idx_submissions_rep').on(table.repId),
    index('idx_submissions_status').on(table.status),
    index('idx_submissions_submitted_at').on(table.submittedAt),
    index('idx_submissions_approved_at').on(table.approvedAt),
    index('idx_submissions_sale_date').on(table.saleDate),
    index('idx_submissions_serial').on(table.serialSuffix),
  ]
);

// 5. Attachments (Photos)
export const attachments = pgTable(
  'attachments',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    submissionId: varchar('submission_id', { length: 64 }).references(() => spiffSubmissions.id),
    storageKey: text('storage_key').notNull(), // Private Vercel Blob URL / Key
    originalFilename: text('original_filename').notNull(),
    contentType: varchar('content_type', { length: 128 }).notNull(), // 'image/jpeg', 'image/png', 'image/webp'
    fileSizeBytes: integer('file_size_bytes').notNull(), // <= 10485760 (10 MB)
    uploadStatus: varchar('upload_status', { length: 32 }).default('pending').notNull(), // 'pending', 'linked', 'abandoned'
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_attachments_submission').on(table.submissionId),
    index('idx_attachments_status').on(table.uploadStatus),
    index('idx_attachments_uploaded_at').on(table.uploadedAt),
  ]
);

// 6. Admin Users & Permissions
export const adminUsers = pgTable('admin_users', {
  id: varchar('id', { length: 64 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  role: varchar('role', { length: 64 }).default('Administrator').notNull(), // 'Administrator' | 'Approving Manager'
  passwordHash: text('password_hash'),
  isAuthorized: boolean('is_authorized').default(true).notNull(),
  mustChangePassword: boolean('must_change_password').default(false).notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 6b. Admin Authentication Tokens (Single-use invite & password reset tokens)
export const adminAuthTokens = pgTable(
  'admin_auth_tokens',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    adminId: varchar('admin_id', { length: 64 }).notNull().references(() => adminUsers.id),
    tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
    tokenType: varchar('token_type', { length: 32 }).notNull(), // 'invite' | 'password_reset' | 'initial_setup'
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by', { length: 255 }),
  },
  (table) => [
    index('idx_auth_tokens_admin').on(table.adminId),
    uniqueIndex('idx_auth_tokens_hash').on(table.tokenHash),
  ]
);

// 7. Audit History
export const auditEvents = pgTable(
  'audit_events',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    submissionId: varchar('submission_id', { length: 64 }).notNull().references(() => spiffSubmissions.id),
    action: varchar('action', { length: 64 }).notNull(), // 'approved', 'rejected' (denied), 'marked_paid', 'correction', 'amount_corrected'
    performedBy: varchar('performed_by', { length: 255 }).notNull(),
    fieldChanged: varchar('field_changed', { length: 128 }),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    explanation: text('explanation').notNull(), // Required reason/explanation for all corrections/actions
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_audit_submission').on(table.submissionId),
    index('idx_audit_timestamp').on(table.timestamp),
  ]
);

// 8. App Settings
export const appSettings = pgTable('app_settings', {
  key: varchar('key', { length: 64 }).primaryKey(), // e.g. 'notification_recipient_email', 'initial_admin_email'
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: varchar('updated_by', { length: 255 }),
});

// 9. Email Notification Jobs (Submissions & Approval/Denial Results)
export const emailNotificationJobs = pgTable(
  'email_notification_jobs',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    submissionId: varchar('submission_id', { length: 64 }).notNull().references(() => spiffSubmissions.id),
    jobType: varchar('job_type', { length: 32 }).default('submission_alert').notNull(), // 'submission_alert' | 'decision_result'
    recipientEmail: varchar('recipient_email', { length: 255 }).notNull(),
    recipientName: varchar('recipient_name', { length: 255 }),
    recipientRole: varchar('recipient_role', { length: 64 }),
    status: varchar('status', { length: 32 }).default('queued').notNull(), // 'queued', 'processing', 'accepted', 'delivered', 'failed', 'bounced', 'simulated'
    attemptCount: integer('attempt_count').default(0).notNull(),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: varchar('locked_by', { length: 128 }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    providerMessageId: varchar('provider_message_id', { length: 255 }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull().unique(),
    templateId: varchar('template_id', { length: 64 }),
    templateVersion: integer('template_version'),
    renderedSubject: text('rendered_subject'),
    renderedBodyHtml: text('rendered_body_html'),
    eventPayload: text('event_payload'), // JSON snapshot of original decision, amount, explanation, and recipients
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_email_jobs_submission').on(table.submissionId),
    index('idx_email_jobs_status').on(table.status),
    index('idx_email_jobs_eligibility').on(table.status, table.nextRetryAt, table.leaseExpiresAt),
    uniqueIndex('idx_email_jobs_idempotency').on(table.idempotencyKey),
  ]
);

// 10. Branches / Locations
export const branches = pgTable('branches', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull().unique(),
  code: varchar('code', { length: 32 }), // e.g. "PHX", "TUC", "DEN"
  address: text('address'),
  isActive: boolean('is_active').default(true).notNull(),
  displayOrder: integer('display_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 11. Editable Email Templates
export const emailTemplates = pgTable('email_templates', {
  id: varchar('id', { length: 64 }).primaryKey(), // 'new_submission', 'spiff_approved', 'spiff_denied'
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  subject: varchar('subject', { length: 255 }).notNull(),
  bodyHtml: text('body_html').notNull(),
  version: integer('version').default(1).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: varchar('updated_by', { length: 255 }).default('Administrator').notNull(),
});

// 12. Email Template Version History & Audit Log
export const emailTemplateVersions = pgTable(
  'email_template_versions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    templateId: varchar('template_id', { length: 64 })
      .notNull()
      .references(() => emailTemplates.id),
    version: integer('version').notNull(),
    subject: varchar('subject', { length: 255 }).notNull(),
    bodyHtml: text('body_html').notNull(),
    changeSummary: text('change_summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('createdBy', { length: 255 }).notNull(),
  },
  (table) => [
    index('idx_template_versions_template').on(table.templateId),
    index('idx_template_versions_created_at').on(table.createdAt),
  ]
);

// Relations
export const submissionsRelations = relations(spiffSubmissions, ({ one, many }) => ({
  rep: one(salesReps, {
    fields: [spiffSubmissions.repId],
    references: [salesReps.id],
  }),
  spiff: one(spiffs, {
    fields: [spiffSubmissions.spiffId],
    references: [spiffs.id],
  }),
  attachment: one(attachments, {
    fields: [spiffSubmissions.id],
    references: [attachments.submissionId],
  }),
  auditEvents: many(auditEvents),
  emailJobs: many(emailNotificationJobs),
}));

export const emailTemplatesRelations = relations(emailTemplates, ({ many }) => ({
  versions: many(emailTemplateVersions),
}));

export const emailTemplateVersionsRelations = relations(emailTemplateVersions, ({ one }) => ({
  template: one(emailTemplates, {
    fields: [emailTemplateVersions.templateId],
    references: [emailTemplates.id],
  }),
}));

export const adminUsersRelations = relations(adminUsers, ({ many }) => ({
  tokens: many(adminAuthTokens),
}));

export const adminAuthTokensRelations = relations(adminAuthTokens, ({ one }) => ({
  admin: one(adminUsers, {
    fields: [adminAuthTokens.adminId],
    references: [adminUsers.id],
  }),
}));

// 13. Persistent Shared Rate Limiting
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: varchar('key', { length: 255 }).primaryKey(),
    count: integer('count').default(1).notNull(),
    resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_rate_limits_reset_at').on(table.resetAt),
  ]
);

