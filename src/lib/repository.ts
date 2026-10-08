import { db, schema, isNeonConfigured } from '../db/index.js';
import { eq, desc, asc, and, gte, lte, lt, like, or, sql, isNull } from 'drizzle-orm';
import { sendSpiffSubmissionEmail, sendSpiffDecisionResultEmail, sendRenderedEmail } from './resend';
import { formatDollars, validateSerialSuffix } from './formatters';
import { formatPhoenixDate, formatPhoenixDateTime, getPhoenixDateRangeUtcBounds } from './timezone';
import { hashPassword, verifyPassword, validatePasswordStrength } from './auth';
import { deleteBlobPhoto } from './blob';
import {
  EmailTemplate,
  EmailTemplateVersion,
  DEFAULT_EMAIL_TEMPLATES,
  SUPPORTED_PLACEHOLDERS,
  SAMPLE_TEMPLATE_DATA,
  validateTemplateContent,
  renderEmailTemplate,
} from './emailTemplates';

export type { EmailTemplate, EmailTemplateVersion };

const CANONICAL_APP_URL =
  process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://discountforkliftphoenix.com';

export interface AdminUser {
  id: string;
  email: string;
  name?: string | null;
  role?: 'Administrator' | 'Approving Manager' | string;
  passwordHash?: string | null;
  isAuthorized: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
  passwordChangedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalesRep {
  id: string;
  name: string;
  email?: string | null;
  branch?: string | null;
  assignedGmIds?: string | null; // Comma-separated contact IDs
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationContact {
  id: string;
  name: string;
  email: string;
  role: 'Accounting' | 'General Manager' | 'Approving Manager' | 'Other';
  branch?: string | null;
  isDefaultAccounting: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Branch {
  id: string;
  name: string;
  code?: string | null;
  address?: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Spiff {
  id: string;
  name: string;
  description: string;
  eligibilityRequirements: string;
  amountCents: number;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  submissionId?: string | null;
  storageKey: string;
  originalFilename: string;
  contentType: string;
  fileSizeBytes: number;
  uploadStatus: 'pending' | 'linked' | 'abandoned';
  uploadedAt: string;
}

export interface AuditEvent {
  id: string;
  submissionId: string;
  action: string;
  performedBy: string;
  fieldChanged?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  explanation: string;
  timestamp: string;
}

export interface SpiffSubmission {
  id: string;
  idempotencyKey?: string | null;
  repId: string;
  spiffId: string;
  liftName: string;
  serialSuffix: string;
  saleDate: string;
  notes?: string | null;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Paid'; // Rejected is displayed as 'Denied' in UI
  snapshotRepName: string;
  snapshotRepEmail?: string | null;
  snapshotSpiffName: string;
  snapshotEligibilityRequirements: string;
  snapshotAmountCents: number;
  isPotentialDuplicate: boolean;
  duplicateReason?: string | null;
  decisionMessage?: string | null;
  submittedAt: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
  rejectedAt?: string | null;
  rejectedBy?: string | null;
  rejectionReason?: string | null;
  paidAt?: string | null;
  paidBy?: string | null;
  attachment?: Attachment | null;
  auditEvents?: AuditEvent[];
}

export interface EmailJob {
  id: string;
  submissionId: string;
  jobType: 'submission_alert' | 'decision_result';
  recipientEmail: string;
  recipientName?: string | null;
  recipientRole?: string | null;
  status: 'queued' | 'processing' | 'accepted' | 'delivered' | 'failed' | 'bounced' | 'simulated';
  attemptCount: number;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
  lockedAt?: string | null;
  lockedBy?: string | null;
  leaseExpiresAt?: string | null;
  deliveredAt?: string | null;
  errorMessage?: string | null;
  providerMessageId?: string | null;
  idempotencyKey: string;
  templateId?: string | null;
  templateVersion?: number | null;
  renderedSubject?: string | null;
  renderedBodyHtml?: string | null;
  eventPayload?: string | null; // JSON snapshot of original decision, amount, explanation, and recipients
  createdAt: string;
  updatedAt?: string | null;
}

class InMemoryStore {
  contacts: NotificationContact[] = [
    {
      id: 'cnt_marcus',
      name: 'Marcus Vance',
      email: 'marcus.vance@discountforkliftphoenix.com',
      role: 'Approving Manager',
      branch: 'Phoenix - Main Yard',
      isDefaultAccounting: false,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'cnt_alex',
      name: 'Alex Rivera',
      email: 'dallas.manager@discountforkliftphoenix.com',
      role: 'Approving Manager',
      branch: 'Dallas Branch',
      isDefaultAccounting: false,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'cnt_sarah',
      name: 'Sarah Connor',
      email: 'sarah.connor@discountforkliftphoenix.com',
      role: 'General Manager',
      branch: 'Phoenix - Main Yard',
      isDefaultAccounting: false,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'cnt_carlos',
      name: 'Carlos Morales',
      email: 'carlos.morales@discountforkliftphoenix.com',
      role: 'General Manager',
      branch: 'Dallas Branch',
      isDefaultAccounting: false,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'cnt_robert',
      name: 'Robert Davis',
      email: 'robert.davis@discountforkliftphoenix.com',
      role: 'General Manager',
      branch: 'Tucson Branch',
      isDefaultAccounting: false,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'cnt_accounting',
      name: 'Accounting Payroll Office',
      email: 'accounting@discountforkliftphoenix.com',
      role: 'Accounting',
      branch: 'Corporate',
      isDefaultAccounting: true,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  reps: SalesRep[] = [
    {
      id: 'rep_jake_dallas',
      name: 'Jake Thompson',
      email: 'jake.thompson@discountforkliftphoenix.com',
      branch: 'Dallas Branch',
      assignedGmIds: 'cnt_carlos',
      isActive: true,
      displayOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'rep_caleb',
      name: 'Caleb Vance',
      email: 'caleb@discountforkliftphoenix.com',
      branch: 'Phoenix - Main Yard',
      assignedGmIds: 'cnt_sarah',
      isActive: true,
      displayOrder: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'rep_travis',
      name: 'Travis Miller',
      email: 'travis.miller@discountforkliftphoenix.com',
      branch: 'Phoenix - Main Yard',
      assignedGmIds: 'cnt_sarah',
      isActive: true,
      displayOrder: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'rep_marcus_tucson',
      name: 'Marcus Cole',
      email: 'marcus.cole@discountforkliftphoenix.com',
      branch: 'Tucson Branch',
      assignedGmIds: 'cnt_robert',
      isActive: true,
      displayOrder: 4,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  spiffs: Spiff[] = [
    {
      id: 'spiff_electric_cushion',
      name: 'Electric Cushion Quick Sale',
      description: 'Standard cash spiff for closed warehouse electric cushion forklift deals.',
      eligibilityRequirements: 'Requires completed delivery inspection and signed financing/lease agreement.',
      amountCents: 15000,
      isActive: true,
      displayOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'spiff_pneumatic_yard',
      name: 'Pneumatic Yard Truck Spiff',
      description: 'Outdoor heavy-duty diesel / LP pneumatic tire forklift bonus.',
      eligibilityRequirements: 'Eligible on sold units >= 5,000 lbs capacity closed within the calendar month.',
      amountCents: 25000,
      isActive: true,
      displayOrder: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  submissions: SpiffSubmission[] = [];
  attachments: Attachment[] = [];
  auditEvents: AuditEvent[] = [];
  settings: Record<string, string> = {
    notification_recipient_email: 'caleb@discountforkliftphoenix.com',
    initial_admin_email: 'caleb@discountforkliftphoenix.com',
  };
  branches: Branch[] = [
    {
      id: 'br_phoenix',
      name: 'Phoenix - Main Yard',
      code: 'PHX',
      address: '2625 W Baseline Rd, Phoenix, AZ 85041',
      isActive: true,
      displayOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'br_tucson',
      name: 'Tucson Branch',
      code: 'TUC',
      address: '3855 E 37th St, Tucson, AZ 85713',
      isActive: true,
      displayOrder: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'br_denver',
      name: 'Denver Branch',
      code: 'DEN',
      address: '4990 Monaco St, Commerce City, CO 80022',
      isActive: true,
      displayOrder: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'br_lasvegas',
      name: 'Las Vegas Branch',
      code: 'LAS',
      address: 'North Las Vegas, NV',
      isActive: true,
      displayOrder: 4,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'br_dallas',
      name: 'Dallas Branch',
      code: 'DFW',
      address: 'Dallas-Fort Worth, TX',
      isActive: true,
      displayOrder: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  adminUsers: AdminUser[] = [
    {
      id: 'admin_caleb',
      email: 'caleb@discountforkliftphoenix.com',
      name: 'Caleb Vance',
      passwordHash: null,
      isAuthorized: true,
      lastLoginAt: null,
      passwordChangedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'admin_office',
      email: 'admin@discountforkliftphoenix.com',
      name: 'Discount Forklift Admin',
      passwordHash: null,
      isAuthorized: true,
      lastLoginAt: null,
      passwordChangedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  adminAuthTokens: any[] = [];
  emailJobs: EmailJob[] = [];
  emailTemplates: EmailTemplate[] = [
    {
      ...DEFAULT_EMAIL_TEMPLATES.new_submission,
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedBy: 'System',
    },
    {
      ...DEFAULT_EMAIL_TEMPLATES.spiff_approved,
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedBy: 'System',
    },
    {
      ...DEFAULT_EMAIL_TEMPLATES.spiff_denied,
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedBy: 'System',
    },
  ];
  emailTemplateVersions: EmailTemplateVersion[] = [
    {
      id: 'ver_init_new_sub',
      templateId: 'new_submission',
      version: 1,
      subject: DEFAULT_EMAIL_TEMPLATES.new_submission.subject,
      bodyHtml: DEFAULT_EMAIL_TEMPLATES.new_submission.bodyHtml,
      changeSummary: 'Standard system default template',
      createdAt: new Date().toISOString(),
      createdBy: 'System',
    },
    {
      id: 'ver_init_approved',
      templateId: 'spiff_approved',
      version: 1,
      subject: DEFAULT_EMAIL_TEMPLATES.spiff_approved.subject,
      bodyHtml: DEFAULT_EMAIL_TEMPLATES.spiff_approved.bodyHtml,
      changeSummary: 'Standard system default template',
      createdAt: new Date().toISOString(),
      createdBy: 'System',
    },
    {
      id: 'ver_init_denied',
      templateId: 'spiff_denied',
      version: 1,
      subject: DEFAULT_EMAIL_TEMPLATES.spiff_denied.subject,
      bodyHtml: DEFAULT_EMAIL_TEMPLATES.spiff_denied.bodyHtml,
      changeSummary: 'Standard system default template',
      createdAt: new Date().toISOString(),
      createdBy: 'System',
    },
  ];
}

export const memoryStore = new InMemoryStore();

function generateId(prefix: string): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 6; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${new Date().getFullYear()}-${rand}`;
}

export function isMemoryModeAllowed(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  return !isNeonConfigured && (process.env.ALLOW_MEMORY_STORE === 'true' || process.env.NODE_ENV === 'test' || !process.env.NODE_ENV);
}

export const Repository = {
  isLiveDatabaseConnected(): boolean {
    return isNeonConfigured && db !== null;
  },

  assertDatabaseOrMemoryAllowed(): void {
    if (!this.isLiveDatabaseConnected() && !isMemoryModeAllowed()) {
      throw new Error(
        '[Database Error] Neon PostgreSQL (DATABASE_URL) is required in production or when memory store fallback is disabled.'
      );
    }
  },

  // ----------------------------------------------------
  // 1. Sales Reps Management
  // ----------------------------------------------------
  async getActiveReps(): Promise<SalesRep[]> {
    if (this.isLiveDatabaseConnected() && db) {
      try {
        const rows = await db
          .select()
          .from(schema.salesReps)
          .where(eq(schema.salesReps.isActive, true))
          .orderBy(asc(schema.salesReps.displayOrder), asc(schema.salesReps.name));
        return rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }));
      } catch (err) {
        console.warn('Neon query error, falling back to memory store:', err);
      }
    }
    return memoryStore.reps
      .filter((r) => r.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
  },

  async getAllReps(): Promise<SalesRep[]> {
    if (this.isLiveDatabaseConnected() && db) {
      try {
        const rows = await db
          .select()
          .from(schema.salesReps)
          .orderBy(asc(schema.salesReps.displayOrder), asc(schema.salesReps.name));
        return rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }));
      } catch (err) {
        console.warn('Neon query error, falling back to memory store:', err);
      }
    }
    return [...memoryStore.reps].sort(
      (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)
    );
  },

  async createRep(input: {
    name: string;
    email?: string;
    branch?: string;
    assignedGmIds?: string;
    displayOrder?: number;
  }): Promise<SalesRep> {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error('Sales rep name is required.');
    const now = new Date().toISOString();
    const newRep: SalesRep = {
      id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: trimmed,
      email: input.email ? input.email.trim().toLowerCase() : null,
      branch: input.branch ? input.branch.trim() : null,
      assignedGmIds: input.assignedGmIds || null,
      isActive: true,
      displayOrder: input.displayOrder || 0,
      createdAt: now,
      updatedAt: now,
    };

    if (this.isLiveDatabaseConnected() && db) {
      await db.insert(schema.salesReps).values({
        id: newRep.id,
        name: newRep.name,
        email: newRep.email,
        branch: newRep.branch,
        assignedGmIds: newRep.assignedGmIds,
        isActive: newRep.isActive,
        displayOrder: newRep.displayOrder,
      });
      return newRep;
    }

    memoryStore.reps.push(newRep);
    return newRep;
  },

  async updateRep(
    id: string,
    updates: Partial<{
      name: string;
      email: string | null;
      branch: string | null;
      assignedGmIds: string | null;
      isActive: boolean;
      displayOrder: number;
    }>
  ): Promise<SalesRep> {
    const now = new Date().toISOString();
    if (this.isLiveDatabaseConnected() && db) {
      await db
        .update(schema.salesReps)
        .set({
          ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
          ...(updates.email !== undefined ? { email: updates.email ? updates.email.trim().toLowerCase() : null } : {}),
          ...(updates.branch !== undefined ? { branch: updates.branch ? updates.branch.trim() : null } : {}),
          ...(updates.assignedGmIds !== undefined ? { assignedGmIds: updates.assignedGmIds } : {}),
          ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
          ...(updates.displayOrder !== undefined ? { displayOrder: updates.displayOrder } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.salesReps.id, id));
    }

    const idx = memoryStore.reps.findIndex((r) => r.id === id);
    if (idx !== -1) {
      memoryStore.reps[idx] = {
        ...memoryStore.reps[idx],
        ...updates,
        email: updates.email !== undefined ? (updates.email ? updates.email.trim().toLowerCase() : null) : memoryStore.reps[idx].email,
        updatedAt: now,
      };
      return memoryStore.reps[idx];
    }
    throw new Error('Sales rep not found');
  },

  async getRepById(id: string): Promise<SalesRep | null> {
    if (this.isLiveDatabaseConnected() && db) {
      try {
        const rows = await db
          .select()
          .from(schema.salesReps)
          .where(eq(schema.salesReps.id, id))
          .limit(1);
        if (rows.length > 0) {
          const r = rows[0];
          return {
            ...r,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          };
        }
        return null;
      } catch (err) {
        console.warn('Neon query error for getRepById:', err);
      }
    }
    return memoryStore.reps.find((r) => r.id === id) || null;
  },

  // ----------------------------------------------------
  // 2. Notification Contacts Management
  // ----------------------------------------------------
  async getAllContacts(): Promise<NotificationContact[]> {
    if (this.isLiveDatabaseConnected() && db) {
      try {
        const rows = await db
          .select()
          .from(schema.notificationContacts)
          .orderBy(asc(schema.notificationContacts.name));
        return rows.map((c) => ({
          ...c,
          role: c.role as any,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        }));
      } catch (err) {
        console.warn('Neon query error, falling back to memory store:', err);
      }
    }
    return [...memoryStore.contacts].sort((a, b) => a.name.localeCompare(b.name));
  },

  async getActiveContacts(): Promise<NotificationContact[]> {
    const all = await this.getAllContacts();
    return all.filter((c) => c.isActive);
  },

  async createContact(input: {
    name: string;
    email: string;
    role: 'Accounting' | 'General Manager' | 'Other';
    branch?: string;
    isDefaultAccounting?: boolean;
  }): Promise<NotificationContact> {
    if (!input.name.trim()) throw new Error('Contact name is required.');
    if (!input.email.trim()) throw new Error('Contact email is required.');

    const now = new Date().toISOString();
    const newContact: NotificationContact = {
      id: `cnt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      role: input.role,
      branch: input.branch ? input.branch.trim() : null,
      isDefaultAccounting: Boolean(input.isDefaultAccounting),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    if (this.isLiveDatabaseConnected() && db) {
      await db.insert(schema.notificationContacts).values({
        id: newContact.id,
        name: newContact.name,
        email: newContact.email,
        role: newContact.role,
        branch: newContact.branch,
        isDefaultAccounting: newContact.isDefaultAccounting,
        isActive: newContact.isActive,
      });
      return newContact;
    }

    memoryStore.contacts.push(newContact);
    return newContact;
  },

  async updateContact(
    id: string,
    updates: Partial<{
      name: string;
      email: string;
      role: 'Accounting' | 'General Manager' | 'Other';
      branch: string | null;
      isDefaultAccounting: boolean;
      isActive: boolean;
    }>
  ): Promise<NotificationContact> {
    const now = new Date().toISOString();
    if (this.isLiveDatabaseConnected() && db) {
      await db
        .update(schema.notificationContacts)
        .set({
          ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
          ...(updates.email !== undefined ? { email: updates.email.trim().toLowerCase() } : {}),
          ...(updates.role !== undefined ? { role: updates.role } : {}),
          ...(updates.branch !== undefined ? { branch: updates.branch ? updates.branch.trim() : null } : {}),
          ...(updates.isDefaultAccounting !== undefined ? { isDefaultAccounting: updates.isDefaultAccounting } : {}),
          ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.notificationContacts.id, id));
    }

    const idx = memoryStore.contacts.findIndex((c) => c.id === id);
    if (idx !== -1) {
      memoryStore.contacts[idx] = {
        ...memoryStore.contacts[idx],
        ...updates,
        email: updates.email !== undefined ? updates.email.trim().toLowerCase() : memoryStore.contacts[idx].email,
        updatedAt: now,
      };
      return memoryStore.contacts[idx];
    }
    throw new Error('Contact not found');
  },

  // ----------------------------------------------------
  // Branches Management
  // ----------------------------------------------------
  async getAllBranches(): Promise<Branch[]> {
    if (this.isLiveDatabaseConnected() && db) {
      try {
        const rows = await db
          .select()
          .from(schema.branches)
          .orderBy(asc(schema.branches.displayOrder), asc(schema.branches.name));
        return rows.map((b) => ({
          ...b,
          createdAt: b.createdAt.toISOString(),
          updatedAt: b.updatedAt.toISOString(),
        }));
      } catch (err) {
        console.warn('Neon query error for branches, falling back to memory store:', err);
      }
    }
    return [...memoryStore.branches].sort(
      (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)
    );
  },

  async getActiveBranches(): Promise<Branch[]> {
    const all = await this.getAllBranches();
    return all.filter((b) => b.isActive);
  },

  async createBranch(input: {
    name: string;
    code?: string;
    address?: string;
    displayOrder?: number;
  }): Promise<Branch> {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error('Branch name is required.');

    const existing = await this.getAllBranches();
    if (existing.some((b) => b.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error(`A branch with the name "${trimmed}" already exists.`);
    }

    const now = new Date().toISOString();
    const newBranch: Branch = {
      id: `br_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: trimmed,
      code: input.code ? input.code.trim().toUpperCase() : null,
      address: input.address ? input.address.trim() : null,
      isActive: true,
      displayOrder: input.displayOrder !== undefined ? input.displayOrder : existing.length + 1,
      createdAt: now,
      updatedAt: now,
    };

    if (this.isLiveDatabaseConnected() && db) {
      try {
        await db.insert(schema.branches).values({
          id: newBranch.id,
          name: newBranch.name,
          code: newBranch.code,
          address: newBranch.address,
          isActive: newBranch.isActive,
          displayOrder: newBranch.displayOrder,
        });
        return newBranch;
      } catch (err) {
        console.warn('Neon insert error for branch, saving in memory:', err);
      }
    }

    memoryStore.branches.push(newBranch);
    return newBranch;
  },

  async updateBranch(
    id: string,
    updates: Partial<{
      name: string;
      code: string | null;
      address: string | null;
      isActive: boolean;
      displayOrder: number;
    }>
  ): Promise<Branch> {
    const now = new Date().toISOString();
    if (updates.name) {
      const trimmed = updates.name.trim();
      const existing = await this.getAllBranches();
      if (existing.some((b) => b.id !== id && b.name.toLowerCase() === trimmed.toLowerCase())) {
        throw new Error(`A branch with the name "${trimmed}" already exists.`);
      }
    }

    if (this.isLiveDatabaseConnected() && db) {
      try {
        await db
          .update(schema.branches)
          .set({
            ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
            ...(updates.code !== undefined ? { code: updates.code ? updates.code.trim().toUpperCase() : null } : {}),
            ...(updates.address !== undefined ? { address: updates.address ? updates.address.trim() : null } : {}),
            ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
            ...(updates.displayOrder !== undefined ? { displayOrder: updates.displayOrder } : {}),
            updatedAt: new Date(),
          })
          .where(eq(schema.branches.id, id));
      } catch (err) {
        console.warn('Neon update error for branch, updating in memory:', err);
      }
    }

    const idx = memoryStore.branches.findIndex((b) => b.id === id);
    if (idx !== -1) {
      memoryStore.branches[idx] = {
        ...memoryStore.branches[idx],
        ...updates,
        name: updates.name ? updates.name.trim() : memoryStore.branches[idx].name,
        code: updates.code !== undefined ? (updates.code ? updates.code.trim().toUpperCase() : null) : memoryStore.branches[idx].code,
        address: updates.address !== undefined ? (updates.address ? updates.address.trim() : null) : memoryStore.branches[idx].address,
        updatedAt: now,
      };
      return memoryStore.branches[idx];
    }
    throw new Error('Branch not found');
  },

  async deleteBranch(id: string): Promise<boolean> {
    if (this.isLiveDatabaseConnected() && db) {
      try {
        await db.delete(schema.branches).where(eq(schema.branches.id, id));
      } catch (err) {
        console.warn('Neon delete error for branch:', err);
      }
    }
    const idx = memoryStore.branches.findIndex((b) => b.id === id);
    if (idx !== -1) {
      memoryStore.branches.splice(idx, 1);
      return true;
    }
    return false;
  },

  // ----------------------------------------------------
  // 3. Spiffs Management
  // ----------------------------------------------------
  async getActiveSpiffs(): Promise<Spiff[]> {
    if (this.isLiveDatabaseConnected() && db) {
      try {
        const rows = await db
          .select()
          .from(schema.spiffs)
          .where(eq(schema.spiffs.isActive, true))
          .orderBy(asc(schema.spiffs.displayOrder), asc(schema.spiffs.name));
        return rows.map((s) => ({
          ...s,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        }));
      } catch (err) {
        console.warn('Neon query error, falling back to memory store:', err);
      }
    }
    return memoryStore.spiffs
      .filter((s) => s.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
  },

  async getAllSpiffs(): Promise<Spiff[]> {
    if (this.isLiveDatabaseConnected() && db) {
      try {
        const rows = await db
          .select()
          .from(schema.spiffs)
          .orderBy(asc(schema.spiffs.displayOrder), asc(schema.spiffs.name));
        return rows.map((s) => ({
          ...s,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        }));
      } catch (err) {
        console.warn('Neon query error, falling back to memory store:', err);
      }
    }
    return [...memoryStore.spiffs].sort(
      (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)
    );
  },

  async createSpiff(input: {
    name: string;
    description: string;
    eligibilityRequirements: string;
    amountCents: number;
    displayOrder?: number;
  }): Promise<Spiff> {
    if (!input.name.trim()) throw new Error('Spiff program name is required.');
    if (input.amountCents <= 0) throw new Error('Spiff cash amount must be greater than $0.');
    const now = new Date().toISOString();
    const newSpiff: Spiff = {
      id: `spf_prog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: input.name.trim(),
      description: input.description.trim(),
      eligibilityRequirements: input.eligibilityRequirements.trim(),
      amountCents: input.amountCents,
      isActive: true,
      displayOrder: input.displayOrder || 0,
      createdAt: now,
      updatedAt: now,
    };

    if (this.isLiveDatabaseConnected() && db) {
      await db.insert(schema.spiffs).values({
        id: newSpiff.id,
        name: newSpiff.name,
        description: newSpiff.description,
        eligibilityRequirements: newSpiff.eligibilityRequirements,
        amountCents: newSpiff.amountCents,
        isActive: newSpiff.isActive,
        displayOrder: newSpiff.displayOrder,
      });
      return newSpiff;
    }

    memoryStore.spiffs.push(newSpiff);
    return newSpiff;
  },

  async updateSpiff(
    id: string,
    updates: Partial<{
      name: string;
      description: string;
      eligibilityRequirements: string;
      amountCents: number;
      isActive: boolean;
      displayOrder: number;
    }>
  ): Promise<Spiff> {
    const now = new Date().toISOString();
    if (this.isLiveDatabaseConnected() && db) {
      await db
        .update(schema.spiffs)
        .set({
          ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
          ...(updates.description !== undefined ? { description: updates.description.trim() } : {}),
          ...(updates.eligibilityRequirements !== undefined
            ? { eligibilityRequirements: updates.eligibilityRequirements.trim() }
            : {}),
          ...(updates.amountCents !== undefined ? { amountCents: updates.amountCents } : {}),
          ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
          ...(updates.displayOrder !== undefined ? { displayOrder: updates.displayOrder } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.spiffs.id, id));
    }

    const idx = memoryStore.spiffs.findIndex((s) => s.id === id);
    if (idx !== -1) {
      memoryStore.spiffs[idx] = {
        ...memoryStore.spiffs[idx],
        ...updates,
        updatedAt: now,
      };
      return memoryStore.spiffs[idx];
    }
    throw new Error('Spiff program not found');
  },

  // ----------------------------------------------------
  // 4. Attachments
  // ----------------------------------------------------
  async createAttachment(input: {
    id: string;
    originalFilename: string;
    contentType: string;
    fileSizeBytes: number;
    storageKey: string;
  }): Promise<Attachment> {
    const att: Attachment = {
      id: input.id,
      storageKey: input.storageKey,
      originalFilename: input.originalFilename,
      contentType: input.contentType,
      fileSizeBytes: input.fileSizeBytes,
      uploadStatus: 'pending',
      uploadedAt: new Date().toISOString(),
    };

    if (this.isLiveDatabaseConnected() && db) {
      await db.insert(schema.attachments).values({
        id: att.id,
        storageKey: att.storageKey,
        originalFilename: att.originalFilename,
        contentType: att.contentType,
        fileSizeBytes: att.fileSizeBytes,
        uploadStatus: att.uploadStatus,
      });
    }

    memoryStore.attachments.push(att);
    return att;
  },

  async getAttachment(id: string): Promise<Attachment | null> {
    if (this.isLiveDatabaseConnected() && db) {
      const rows = await db
        .select()
        .from(schema.attachments)
        .where(eq(schema.attachments.id, id))
        .limit(1);
      if (rows.length > 0) {
        const r = rows[0];
        return {
          ...r,
          uploadStatus: r.uploadStatus as any,
          uploadedAt: r.uploadedAt.toISOString(),
        };
      }
    }
    return memoryStore.attachments.find((a) => a.id === id) || null;
  },

  // ----------------------------------------------------
  // 5. Submissions
  // ----------------------------------------------------
  async createSubmission(input: {
    repId: string;
    spiffId: string;
    liftName: string;
    serialSuffix: string;
    saleDate: string;
    notes?: string;
    attachmentId?: string;
    idempotencyKey?: string;
    appUrl?: string;
  }): Promise<{ submission: SpiffSubmission; isDuplicateAttempt: boolean }> {
    // Check idempotency first to prevent double-click / retry duplicate requests
    if (input.idempotencyKey) {
      const existing = memoryStore.submissions.find(
        (s) => s.idempotencyKey === input.idempotencyKey
      );
      if (existing) {
        return { submission: existing, isDuplicateAttempt: true };
      }
    }

    // 1. Validate fields on server
    if (!input.repId) throw new Error('Sales rep is required.');
    if (!input.spiffId) throw new Error('Eligible spiff is required.');
    if (!input.liftName || !input.liftName.trim()) throw new Error('Lift name / model is required.');
    if (!input.saleDate) throw new Error('Sale date is required.');

    const serialValidation = validateSerialSuffix(input.serialSuffix);
    if (!serialValidation.isValid) {
      throw new Error(serialValidation.error || 'Invalid serial suffix.');
    }
    const cleanSerial = serialValidation.normalized;

    // 2. Fetch active rep & spiff and verify active status
    const allReps = await this.getAllReps();
    const rep = allReps.find((r) => r.id === input.repId);
    if (!rep) throw new Error('Selected sales rep does not exist.');
    if (!rep.isActive) throw new Error('Selected sales rep is not currently active.');

    // User Requirement: Require a valid rep email before a rep can submit a new request
    if (!rep.email || !rep.email.trim()) {
      throw new Error(
        `Sales representative "${rep.name}" does not have an email address configured. An office administrator must configure a notification email in Rep Management before submissions can be submitted.`
      );
    }

    const allSpiffs = await this.getAllSpiffs();
    const spiff = allSpiffs.find((s) => s.id === input.spiffId);
    if (!spiff) throw new Error('Selected spiff program does not exist.');
    if (!spiff.isActive) throw new Error('Selected spiff program is not currently active.');

    // 3. Spiff amount is strictly calculated on server from the database record snapshot
    const serverAmountCents = spiff.amountCents;

    // 4. Check for potential duplicate submissions (matching lift name & serial suffix or spiff)
    let isPotentialDuplicate = false;
    let duplicateReason: string | null = null;

    const previousMatching = memoryStore.submissions.find(
      (s) =>
        s.serialSuffix.toUpperCase() === cleanSerial &&
        (s.liftName.trim().toLowerCase() === input.liftName.trim().toLowerCase() ||
          s.spiffId === spiff.id)
    );

    if (previousMatching) {
      isPotentialDuplicate = true;
      duplicateReason = `Flagged for admin review: Same serial suffix (${cleanSerial}) was previously submitted on ${previousMatching.saleDate} for ${previousMatching.liftName} (${previousMatching.id}).`;
    }

    const submissionId = generateId('SPF');
    const now = new Date().toISOString();

    // 3. Server-side mandatory sale photo enforcement
    if (!input.attachmentId) {
      throw new Error('Please attach a sale photo before submitting your spiff request.');
    }

    const attachedObj = await this.getAttachment(input.attachmentId);
    if (!attachedObj) {
      throw new Error('Please attach a sale photo before submitting your spiff request.');
    }
    if (attachedObj.submissionId || attachedObj.uploadStatus === 'linked') {
      throw new Error('This sale photo has already been linked to another spiff request.');
    }
    attachedObj.submissionId = submissionId;
    attachedObj.uploadStatus = 'linked';

    const newSubmission: SpiffSubmission = {
      id: submissionId,
      idempotencyKey: input.idempotencyKey || null,
      repId: rep.id,
      spiffId: spiff.id,
      liftName: input.liftName.trim(),
      serialSuffix: cleanSerial,
      saleDate: input.saleDate,
      notes: input.notes ? input.notes.trim() : null,
      status: 'Pending',
      snapshotRepName: rep.name,
      snapshotRepEmail: rep.email.trim().toLowerCase(), // Saved as immutable snapshot
      snapshotSpiffName: spiff.name,
      snapshotEligibilityRequirements: spiff.eligibilityRequirements,
      snapshotAmountCents: serverAmountCents,
      isPotentialDuplicate,
      duplicateReason,
      submittedAt: now,
      attachment: attachedObj,
      auditEvents: [],
    };

    // 5. Persistent Email Notification Job creation
    // Route initial submission alert to the designated Approving Manager (e.g. Dallas Approving Manager for Dallas rep)
    let recipientEmail = await this.getSetting(
      'notification_recipient_email',
      'caleb@discountforkliftphoenix.com'
    );
    let recipientName = 'Approving Manager';
    let recipientRole = 'Approving Manager';

    // 1. Check if rep has a branch and route to that branch's Approving Manager
    const repBranch = (rep.branch || '').toLowerCase().trim();
    if (repBranch) {
      const allContacts = await this.getAllContacts();
      const branchApprover = allContacts.find(
        (c) =>
          c.isActive &&
          c.role === 'Approving Manager' &&
          c.branch &&
          (c.branch.toLowerCase().includes(repBranch) || repBranch.includes(c.branch.toLowerCase()))
      );
      if (branchApprover) {
        recipientEmail = branchApprover.email;
        recipientName = branchApprover.name;
        recipientRole = 'Approving Manager';
      }
    }

    // 2. If not found by branch, check for any active Approving Manager
    if (recipientName === 'Approving Manager') {
      const allContacts = await this.getAllContacts();
      const generalApprover = allContacts.find(
        (c) => c.isActive && c.role === 'Approving Manager'
      );
      if (generalApprover) {
        recipientEmail = generalApprover.email;
        recipientName = generalApprover.name;
      }
    }

    const jobKey = `job_notify_${submissionId}`;
    const baseUrl = input.appUrl || 'http://localhost:3000';

    // Render using latest saved New Submission template
    const template = await this.getEmailTemplate('new_submission');
    const templateData = {
      request_id: submissionId,
      rep_name: rep.name,
      lift_name: newSubmission.liftName,
      serial_suffix: cleanSerial,
      spiff_name: spiff.name,
      spiff_amount: formatDollars(serverAmountCents),
      saleDate: formatPhoenixDate(newSubmission.saleDate),
      submitted_at: formatPhoenixDateTime(newSubmission.submittedAt),
      admin_review_url: `${baseUrl}/admin?request=${submissionId}`,
      notes: newSubmission.notes || '',
    };
    const rendered = renderEmailTemplate(template, templateData, true);

    const eventPayloadJson = JSON.stringify({
      requestId: submissionId,
      repName: rep.name,
      liftName: newSubmission.liftName,
      serialSuffix: cleanSerial,
      spiffName: spiff.name,
      amountFormatted: formatDollars(serverAmountCents),
      saleDate: formatPhoenixDate(newSubmission.saleDate),
      submittedAtPhoenix: formatPhoenixDateTime(newSubmission.submittedAt),
      recipientEmail,
    });

    const emailJob: EmailJob = {
      id: `job_${Date.now()}`,
      submissionId,
      jobType: 'submission_alert',
      recipientEmail,
      recipientName: 'Office Administrator',
      recipientRole: 'Admin',
      status: 'queued',
      attemptCount: 0,
      lastAttemptAt: null,
      idempotencyKey: jobKey,
      templateId: template.id,
      templateVersion: template.version,
      renderedSubject: rendered.subject,
      renderedBodyHtml: rendered.bodyHtml,
      eventPayload: eventPayloadJson,
      createdAt: now,
    };

    // Save to Database within an atomic Transaction
    if (this.isLiveDatabaseConnected() && db) {
      await db.transaction(async (tx) => {
        // Enforce DB-level idempotency
        if (input.idempotencyKey) {
          const existing = await tx
            .select()
            .from(schema.spiffSubmissions)
            .where(eq(schema.spiffSubmissions.idempotencyKey, input.idempotencyKey))
            .limit(1);
          if (existing.length > 0) {
            throw new Error(`Duplicate submission detected (Idempotency Key: ${input.idempotencyKey})`);
          }
        }

        // Link photo attachment atomically and verify single claim
        const [linkedAtt] = await tx
          .update(schema.attachments)
          .set({
            submissionId: newSubmission.id,
            uploadStatus: 'linked',
          })
          .where(and(eq(schema.attachments.id, attachedObj.id), eq(schema.attachments.uploadStatus, 'pending')))
          .returning();

        if (!linkedAtt) {
          throw new Error('Please attach an authentic, unlinked sale photo before submitting your spiff request.');
        }

        await tx.insert(schema.spiffSubmissions).values({
          id: newSubmission.id,
          idempotencyKey: newSubmission.idempotencyKey,
          repId: newSubmission.repId,
          spiffId: newSubmission.spiffId,
          liftName: newSubmission.liftName,
          serialSuffix: newSubmission.serialSuffix,
          saleDate: newSubmission.saleDate,
          notes: newSubmission.notes,
          status: newSubmission.status,
          snapshotRepName: newSubmission.snapshotRepName,
          snapshotRepEmail: newSubmission.snapshotRepEmail,
          snapshotSpiffName: newSubmission.snapshotSpiffName,
          snapshotEligibilityRequirements: newSubmission.snapshotEligibilityRequirements,
          snapshotAmountCents: newSubmission.snapshotAmountCents,
          isPotentialDuplicate: newSubmission.isPotentialDuplicate,
          duplicateReason: newSubmission.duplicateReason,
        });

        // Insert notification job in the same transaction
        await tx.insert(schema.emailNotificationJobs).values({
          id: emailJob.id,
          submissionId: emailJob.submissionId,
          jobType: emailJob.jobType,
          recipientEmail: emailJob.recipientEmail,
          recipientName: emailJob.recipientName,
          recipientRole: emailJob.recipientRole,
          status: 'queued',
          attemptCount: 0,
          idempotencyKey: emailJob.idempotencyKey,
          templateId: emailJob.templateId,
          templateVersion: emailJob.templateVersion,
          renderedSubject: emailJob.renderedSubject,
          renderedBodyHtml: emailJob.renderedBodyHtml,
          eventPayload: emailJob.eventPayload,
        });
      });
    }

    memoryStore.submissions.unshift(newSubmission);
    memoryStore.emailJobs.push(emailJob);

    // Attempt delivery strictly AFTER transaction commit
    await this.dispatchJob(emailJob.id).catch((err) =>
      console.error('[NotificationWorker] Dispatch error:', err)
    );

    return { submission: newSubmission, isDuplicateAttempt: false };
  },

  // ----------------------------------------------------
  // 6. Query Submissions
  // ----------------------------------------------------
  async getSubmissions(params?: {
    repId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    dateFilterType?: 'submission' | 'approval' | 'sale';
    submissionStartDate?: string;
    submissionEndDate?: string;
    approvalStartDate?: string;
    approvalEndDate?: string;
    saleStartDate?: string;
    saleEndDate?: string;
    search?: string;
    sortBy?: 'submittedAt' | 'approvedAt' | 'rep' | 'amount';
    sortOrder?: 'asc' | 'desc';
  }): Promise<SpiffSubmission[]> {
    // Determine effective date filter ranges
    const filterType = params?.dateFilterType || (params?.startDate || params?.endDate ? 'submission' : undefined);

    let subStart = params?.submissionStartDate;
    let subEnd = params?.submissionEndDate;
    let apprStart = params?.approvalStartDate;
    let apprEnd = params?.approvalEndDate;
    let saleStart = params?.saleStartDate;
    let saleEnd = params?.saleEndDate;

    if (filterType === 'submission' && (params?.startDate || params?.endDate)) {
      subStart = subStart || params?.startDate;
      subEnd = subEnd || params?.endDate;
    } else if (filterType === 'approval' && (params?.startDate || params?.endDate)) {
      apprStart = apprStart || params?.startDate;
      apprEnd = apprEnd || params?.endDate;
    } else if (filterType === 'sale' && (params?.startDate || params?.endDate)) {
      saleStart = saleStart || params?.startDate;
      saleEnd = saleEnd || params?.endDate;
    }

    const subBounds = getPhoenixDateRangeUtcBounds(subStart, subEnd);
    const apprBounds = getPhoenixDateRangeUtcBounds(apprStart, apprEnd);

    if (this.isLiveDatabaseConnected() && db) {
      const conditions: any[] = [];
      if (params?.repId && params.repId !== 'all') {
        conditions.push(eq(schema.spiffSubmissions.repId, params.repId));
      }
      if (params?.status && params.status !== 'all') {
        conditions.push(eq(schema.spiffSubmissions.status, params.status));
      }

      // Submission date bounds (America/Phoenix inclusive boundaries)
      if (subBounds.startUtc) {
        conditions.push(gte(schema.spiffSubmissions.submittedAt, subBounds.startUtc));
      }
      if (subBounds.endExclusiveUtc) {
        conditions.push(lt(schema.spiffSubmissions.submittedAt, subBounds.endExclusiveUtc));
      }

      // Approval date bounds (America/Phoenix inclusive boundaries)
      if (apprBounds.startUtc) {
        conditions.push(gte(schema.spiffSubmissions.approvedAt, apprBounds.startUtc));
      }
      if (apprBounds.endExclusiveUtc) {
        conditions.push(lt(schema.spiffSubmissions.approvedAt, apprBounds.endExclusiveUtc));
      }

      // Sale date bounds
      if (saleStart) {
        conditions.push(gte(schema.spiffSubmissions.saleDate, saleStart));
      }
      if (saleEnd) {
        conditions.push(lte(schema.spiffSubmissions.saleDate, saleEnd));
      }

      let rows: any[];
      if (conditions.length > 0) {
        rows = await db.select().from(schema.spiffSubmissions).where(and(...conditions));
      } else {
        rows = await db.select().from(schema.spiffSubmissions);
      }

      const subIds = rows.map((r) => r.id);
      const attMap = new Map<string, Attachment>();
      if (subIds.length > 0) {
        const attRows = await db
          .select()
          .from(schema.attachments)
          .where(sql`${schema.attachments.submissionId} IN ${subIds}`);
        for (const att of attRows) {
          if (att.submissionId) {
            attMap.set(att.submissionId, {
              ...att,
              uploadStatus: att.uploadStatus as any,
              uploadedAt: att.uploadedAt.toISOString(),
            });
          }
        }
      }

      let list: SpiffSubmission[] = rows.map((r) => ({
        ...r,
        status: r.status as any,
        submittedAt: r.submittedAt.toISOString(),
        approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
        rejectedAt: r.rejectedAt ? r.rejectedAt.toISOString() : null,
        paidAt: r.paidAt ? r.paidAt.toISOString() : null,
        attachment: attMap.get(r.id) || null,
        auditEvents: [],
      }));

      if (params?.search) {
        const q = params.search.trim().toLowerCase();
        list = list.filter(
          (s) =>
            s.id.toLowerCase().includes(q) ||
            s.liftName.toLowerCase().includes(q) ||
            s.serialSuffix.toLowerCase().includes(q) ||
            s.snapshotRepName.toLowerCase().includes(q) ||
            s.snapshotSpiffName.toLowerCase().includes(q)
        );
      }

      const order = params?.sortOrder === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        if (params?.sortBy === 'rep') {
          return a.snapshotRepName.localeCompare(b.snapshotRepName) * order;
        }
        if (params?.sortBy === 'amount') {
          return (a.snapshotAmountCents - b.snapshotAmountCents) * order;
        }
        if (params?.sortBy === 'approvedAt') {
          const timeA = a.approvedAt ? new Date(a.approvedAt).getTime() : 0;
          const timeB = b.approvedAt ? new Date(b.approvedAt).getTime() : 0;
          return (timeA - timeB) * order;
        }
        return (new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()) * order;
      });

      return list;
    }

    let list = [...memoryStore.submissions];

    if (params?.repId && params.repId !== 'all') {
      list = list.filter((s) => s.repId === params.repId);
    }
    if (params?.status && params.status !== 'all') {
      list = list.filter((s) => s.status.toLowerCase() === params.status?.toLowerCase());
    }

    // Submission date filtering
    if (subBounds.startUtc) {
      list = list.filter((s) => new Date(s.submittedAt) >= subBounds.startUtc!);
    }
    if (subBounds.endExclusiveUtc) {
      list = list.filter((s) => new Date(s.submittedAt) < subBounds.endExclusiveUtc!);
    }

    // Approval date filtering
    if (apprBounds.startUtc) {
      list = list.filter((s) => Boolean(s.approvedAt && new Date(s.approvedAt) >= apprBounds.startUtc!));
    }
    if (apprBounds.endExclusiveUtc) {
      list = list.filter((s) => Boolean(s.approvedAt && new Date(s.approvedAt) < apprBounds.endExclusiveUtc!));
    }

    // Sale date filtering
    if (saleStart) {
      list = list.filter((s) => s.saleDate >= saleStart!);
    }
    if (saleEnd) {
      list = list.filter((s) => s.saleDate <= saleEnd!);
    }

    if (params?.search) {
      const q = params.search.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.id.toLowerCase().includes(q) ||
          s.liftName.toLowerCase().includes(q) ||
          s.serialSuffix.toLowerCase().includes(q) ||
          s.snapshotRepName.toLowerCase().includes(q) ||
          s.snapshotSpiffName.toLowerCase().includes(q)
      );
    }

    const order = params?.sortOrder === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (params?.sortBy === 'rep') {
        return a.snapshotRepName.localeCompare(b.snapshotRepName) * order;
      }
      if (params?.sortBy === 'amount') {
        return (a.snapshotAmountCents - b.snapshotAmountCents) * order;
      }
      if (params?.sortBy === 'approvedAt') {
        const timeA = a.approvedAt ? new Date(a.approvedAt).getTime() : 0;
        const timeB = b.approvedAt ? new Date(b.approvedAt).getTime() : 0;
        return (timeA - timeB) * order;
      }
      return (new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()) * order;
    });

    return list;
  },


  async getSubmissionById(id: string): Promise<SpiffSubmission | null> {
    if (this.isLiveDatabaseConnected() && db) {
      const rows = await db
        .select()
        .from(schema.spiffSubmissions)
        .where(eq(schema.spiffSubmissions.id, id))
        .limit(1);

      if (rows.length === 0) return null;
      const r = rows[0];

      const attRows = await db
        .select()
        .from(schema.attachments)
        .where(eq(schema.attachments.submissionId, id))
        .limit(1);

      const att: Attachment | null = attRows.length > 0 ? {
        ...attRows[0],
        uploadStatus: attRows[0].uploadStatus as any,
        uploadedAt: attRows[0].uploadedAt.toISOString(),
      } : null;

      const audits = await db
        .select()
        .from(schema.auditEvents)
        .where(eq(schema.auditEvents.submissionId, id))
        .orderBy(desc(schema.auditEvents.timestamp));

      return {
        ...r,
        status: r.status as any,
        submittedAt: r.submittedAt.toISOString(),
        approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
        rejectedAt: r.rejectedAt ? r.rejectedAt.toISOString() : null,
        paidAt: r.paidAt ? r.paidAt.toISOString() : null,
        attachment: att,
        auditEvents: audits.map((a) => ({
          ...a,
          timestamp: a.timestamp.toISOString(),
        })),
      };
    }

    const sub = memoryStore.submissions.find((s) => s.id === id);
    if (!sub) return null;
    return {
      ...sub,
      auditEvents: memoryStore.auditEvents.filter((a) => a.submissionId === id),
    };
  },

  // ----------------------------------------------------
  // 7. Decision Processing: Approve / Deny with Automatic Result Emails
  // ----------------------------------------------------
  async decideSubmission(
    id: string,
    adminUser: string,
    input: {
      decision: 'approve' | 'deny';
      reasonOrMessage?: string;
      recipients: Array<{ email: string; name: string; role: string }>;
      appUrl?: string;
    }
  ): Promise<SpiffSubmission> {
    const sub = await this.getSubmissionById(id);
    if (!sub) throw new Error('Submission not found.');
    if (sub.status !== 'Pending') {
      throw new Error(`This request has already been decided (current status: ${sub.status}).`);
    }

    if (input.decision === 'deny' && (!input.reasonOrMessage || !input.reasonOrMessage.trim())) {
      throw new Error('A denial reason is required when denying a request.');
    }

    const now = new Date().toISOString();
    const isApprove = input.decision === 'approve';
    const decisionText = isApprove ? 'Approved' : 'Denied';

    const newStatus = isApprove ? 'Approved' : 'Rejected';
    const approvedAt = isApprove ? now : null;
    const approvedBy = isApprove ? adminUser : null;
    const rejectedAt = !isApprove ? now : null;
    const rejectedBy = !isApprove ? adminUser : null;
    const rejectionReason = !isApprove && input.reasonOrMessage ? input.reasonOrMessage.trim() : null;
    const decisionMessage = input.reasonOrMessage ? input.reasonOrMessage.trim() : null;

    // Audit log record
    const audit: AuditEvent = {
      id: `aud_${Date.now()}`,
      submissionId: id,
      action: isApprove ? 'approved' : 'denied',
      performedBy: adminUser,
      fieldChanged: 'status',
      oldValue: 'Pending',
      newValue: isApprove ? 'Approved' : 'Denied (Rejected)',
      explanation: input.reasonOrMessage ? input.reasonOrMessage.trim() : `Decision: ${decisionText} by ${adminUser}`,
      timestamp: now,
    };

    // Determine actual authorized administrators from Neon to isolate admin review links
    let authorizedAdminEmails = new Set<string>();
    if (this.isLiveDatabaseConnected() && db) {
      const adminRows = await db
        .select({ email: schema.adminUsers.email })
        .from(schema.adminUsers)
        .where(eq(schema.adminUsers.isAuthorized, true));
      authorizedAdminEmails = new Set(adminRows.map((a) => a.email.toLowerCase()));
    } else {
      authorizedAdminEmails = new Set(
        memoryStore.adminUsers.filter((u) => u.isAuthorized).map((u) => u.email.toLowerCase())
      );
    }

    // Dispatch Automatic Decision Result Emails to all selected recipients
    const baseUrl = input.appUrl || 'http://localhost:3000';
    const uniqueRecipients = new Map<string, { email: string; name: string; role: string }>();

    // 1. Submitting Sales Rep ALWAYS receives decision notification (guaranteed by server)
    let repEmail = (sub.snapshotRepEmail || '').trim().toLowerCase();
    if (!repEmail && sub.repId) {
      const repRecord = await this.getRepById(sub.repId);
      if (repRecord?.email) {
        repEmail = repRecord.email.trim().toLowerCase();
      }
    }

    if (repEmail && repEmail.includes('@')) {
      uniqueRecipients.set(repEmail, {
        email: repEmail,
        name: sub.snapshotRepName || 'Sales Representative',
        role: 'Sales Rep',
      });
    }

    // 2. Selected additional recipients: Resolve from trusted database contacts,
    // verify active status, and respect the administrator's explicit selections.
    // Never silently inject unselected accounting contacts or override deselections.
    const allContacts = await this.getAllContacts();
    const activeContactsByEmail = new Map(
      allContacts.filter((c) => c.isActive).map((c) => [c.email.toLowerCase(), c])
    );
    const activeContactsById = new Map(
      allContacts.filter((c) => c.isActive).map((c) => [c.id, c])
    );

    for (const r of input.recipients) {
      const cleanEmail = (r.email || '').trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) continue;

      // Check if contact matches an active database contact
      const matchedContact = (r as any).contactId
        ? activeContactsById.get((r as any).contactId)
        : activeContactsByEmail.get(cleanEmail);

      // If matched against a known database contact that has been deactivated, skip
      if (matchedContact && !matchedContact.isActive) {
        continue;
      }

      if (!uniqueRecipients.has(cleanEmail)) {
        uniqueRecipients.set(cleanEmail, {
          email: cleanEmail,
          name: matchedContact?.name || r.name || 'Recipient',
          role: matchedContact?.role || r.role || 'Recipient',
        });
      }
    }

    const recipientList = Array.from(uniqueRecipients.values());

    // Fetch latest template for the decision
    const templateId = isApprove ? 'spiff_approved' : 'spiff_denied';
    const template = await this.getEmailTemplate(templateId);

    // Immutable event payload preserved across all subsequent job retries
    const eventPayloadObj = {
      originalDecision: decisionText,
      decisionBy: adminUser,
      decidedAtPhoenix: formatPhoenixDateTime(now),
      amountFormatted: formatDollars(sub.snapshotAmountCents),
      explanation: decisionMessage,
      repName: sub.snapshotRepName,
      repEmail: sub.snapshotRepEmail,
      liftName: sub.liftName,
      serialSuffix: sub.serialSuffix,
      spiffName: sub.snapshotSpiffName,
      saleDate: formatPhoenixDate(sub.saleDate),
      recipients: recipientList,
    };
    const eventPayloadJson = JSON.stringify(eventPayloadObj);

    const createdJobs: EmailJob[] = [];
    for (const rec of recipientList) {
      const jobKey = `job_decision_${id}_${rec.email}`;
      // STRICT ADMIN CHECK: Only recipients in Neon admin_users receive administrator links
      const isRecipientAdmin = authorizedAdminEmails.has(rec.email.toLowerCase());

      const data = {
        request_id: id,
        rep_name: sub.snapshotRepName,
        lift_name: sub.liftName,
        serial_suffix: sub.serialSuffix,
        spiff_name: sub.snapshotSpiffName,
        spiff_amount: formatDollars(sub.snapshotAmountCents),
        sale_date: formatPhoenixDate(sub.saleDate),
        submitted_at: formatPhoenixDateTime(sub.submittedAt),
        decision: decisionText,
        decision_at: formatPhoenixDateTime(now),
        decision_by: adminUser,
        denial_reason: decisionMessage || '',
        approval_message: decisionMessage || '',
        admin_review_url: `${baseUrl}/admin?request=${id}`,
      };

      const rendered = renderEmailTemplate(template, data, isRecipientAdmin);

      const emailJob: EmailJob = {
        id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        submissionId: id,
        jobType: 'decision_result',
        recipientEmail: rec.email,
        recipientName: rec.name,
        recipientRole: rec.role,
        status: 'queued',
        attemptCount: 0,
        lastAttemptAt: null,
        idempotencyKey: jobKey,
        templateId: template.id,
        templateVersion: template.version,
        renderedSubject: rendered.subject,
        renderedBodyHtml: rendered.bodyHtml,
        eventPayload: eventPayloadJson,
        createdAt: now,
      };

      createdJobs.push(emailJob);
    }

    // Save to Database in an atomic Transaction with conditional status update
    if (this.isLiveDatabaseConnected() && db) {
      await db.transaction(async (tx) => {
        // Enforce conditional update: MUST be currently 'Pending'
        const [updatedRow] = await tx
          .update(schema.spiffSubmissions)
          .set({
            status: newStatus,
            approvedAt: approvedAt ? new Date(approvedAt) : null,
            approvedBy,
            rejectedAt: rejectedAt ? new Date(rejectedAt) : null,
            rejectedBy,
            rejectionReason,
            decisionMessage,
          })
          .where(and(eq(schema.spiffSubmissions.id, id), eq(schema.spiffSubmissions.status, 'Pending')))
          .returning();

        if (!updatedRow) {
          throw new Error('This request has already been decided or does not exist.');
        }

        // Insert audit log
        await tx.insert(schema.auditEvents).values({
          id: audit.id,
          submissionId: audit.submissionId,
          action: audit.action,
          performedBy: audit.performedBy,
          fieldChanged: audit.fieldChanged,
          oldValue: audit.oldValue,
          newValue: audit.newValue,
          explanation: audit.explanation,
        });

        // Insert notification jobs in the same transaction
        for (const job of createdJobs) {
          await tx.insert(schema.emailNotificationJobs).values({
            id: job.id,
            submissionId: job.submissionId,
            jobType: job.jobType,
            recipientEmail: job.recipientEmail,
            recipientName: job.recipientName,
            recipientRole: job.recipientRole,
            status: 'queued',
            attemptCount: 0,
            idempotencyKey: job.idempotencyKey,
            templateId: job.templateId,
            templateVersion: job.templateVersion,
            renderedSubject: job.renderedSubject,
            renderedBodyHtml: job.renderedBodyHtml,
            eventPayload: job.eventPayload,
          });
        }
      });
    }

    // Update memory store copy
    const memSub = memoryStore.submissions.find((s) => s.id === id);
    if (memSub) {
      memSub.status = newStatus as any;
      memSub.approvedAt = approvedAt;
      memSub.approvedBy = approvedBy;
      memSub.rejectedAt = rejectedAt;
      memSub.rejectedBy = rejectedBy;
      memSub.rejectionReason = rejectionReason;
      memSub.decisionMessage = decisionMessage;
    }
    sub.status = newStatus as any;
    sub.approvedAt = approvedAt;
    sub.approvedBy = approvedBy;
    sub.rejectedAt = rejectedAt;
    sub.rejectedBy = rejectedBy;
    sub.rejectionReason = rejectionReason;
    sub.decisionMessage = decisionMessage;
    memoryStore.auditEvents.unshift(audit);

    for (const job of createdJobs) {
      memoryStore.emailJobs.push(job);
    }

    // Dispatch queued delivery attempts strictly AFTER transaction commit
    for (const job of createdJobs) {
      await this.dispatchJob(job.id).catch((err) =>
        console.error('[NotificationWorker] Result email dispatch error:', err)
      );
    }

    return sub;
  },

  async approveSubmission(id: string, adminUser: string, message?: string): Promise<SpiffSubmission> {
    const sub = await this.getSubmissionById(id);
    const repEmail = sub?.snapshotRepEmail || '';
    return this.decideSubmission(id, adminUser, {
      decision: 'approve',
      reasonOrMessage: message,
      recipients: repEmail ? [{ email: repEmail, name: sub?.snapshotRepName || 'Rep', role: 'Sales Rep' }] : [],
    });
  },

  async rejectSubmission(id: string, adminUser: string, reason: string): Promise<SpiffSubmission> {
    const sub = await this.getSubmissionById(id);
    const repEmail = sub?.snapshotRepEmail || '';
    return this.decideSubmission(id, adminUser, {
      decision: 'deny',
      reasonOrMessage: reason,
      recipients: repEmail ? [{ email: repEmail, name: sub?.snapshotRepName || 'Rep', role: 'Sales Rep' }] : [],
    });
  },

  // ----------------------------------------------------
  // 8. Other Admin Actions
  // ----------------------------------------------------
  async markPaidSubmission(id: string, adminUser: string): Promise<SpiffSubmission> {
    const sub = await this.getSubmissionById(id);
    if (!sub) throw new Error('Submission not found.');
    if (sub.status !== 'Approved') {
      throw new Error(`Only Approved requests can be marked as Paid (current status: ${sub.status}).`);
    }

    const now = new Date().toISOString();
    const oldStatus = sub.status;

    const audit: AuditEvent = {
      id: `aud_${Date.now()}`,
      submissionId: id,
      action: 'marked_paid',
      performedBy: adminUser,
      fieldChanged: 'status',
      oldValue: oldStatus,
      newValue: 'Paid',
      explanation: `Payment verified and marked paid by ${adminUser}.`,
      timestamp: now,
    };

    if (this.isLiveDatabaseConnected() && db) {
      await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(schema.spiffSubmissions)
          .set({
            status: 'Paid',
            paidAt: new Date(now),
            paidBy: adminUser,
          })
          .where(and(eq(schema.spiffSubmissions.id, id), eq(schema.spiffSubmissions.status, 'Approved')))
          .returning();

        if (!updated) {
          throw new Error('Only approved requests can be marked as Paid.');
        }

        await tx.insert(schema.auditEvents).values({
          id: audit.id,
          submissionId: audit.submissionId,
          action: audit.action,
          performedBy: audit.performedBy,
          fieldChanged: audit.fieldChanged,
          oldValue: audit.oldValue,
          newValue: audit.newValue,
          explanation: audit.explanation,
        });
      });
    }

    const memSub = memoryStore.submissions.find((s) => s.id === id);
    if (memSub) {
      memSub.status = 'Paid';
      memSub.paidAt = now;
      memSub.paidBy = adminUser;
    }
    sub.status = 'Paid';
    sub.paidAt = now;
    sub.paidBy = adminUser;
    memoryStore.auditEvents.unshift(audit);

    return sub;
  },



  async correctSubmission(
    id: string,
    adminUser: string,
    updates: Partial<{
      liftName: string;
      serialSuffix: string;
      saleDate: string;
      notes: string;
      amountCents: number;
    }>,
    explanation: string
  ): Promise<SpiffSubmission> {
    const sub = memoryStore.submissions.find((s) => s.id === id);
    if (!sub) throw new Error('Submission not found.');
    if (!explanation || !explanation.trim()) {
      throw new Error('A detailed explanation is required for any administrator correction.');
    }

    const now = new Date().toISOString();

    if (updates.liftName && updates.liftName !== sub.liftName) {
      memoryStore.auditEvents.unshift({
        id: `aud_${Date.now()}_1`,
        submissionId: id,
        action: 'correction',
        performedBy: adminUser,
        fieldChanged: 'lift_name',
        oldValue: sub.liftName,
        newValue: updates.liftName,
        explanation: explanation.trim(),
        timestamp: now,
      });
      sub.liftName = updates.liftName;
    }

    if (updates.serialSuffix && updates.serialSuffix !== sub.serialSuffix) {
      const v = validateSerialSuffix(updates.serialSuffix);
      if (!v.isValid) throw new Error(v.error);
      memoryStore.auditEvents.unshift({
        id: `aud_${Date.now()}_2`,
        submissionId: id,
        action: 'correction',
        performedBy: adminUser,
        fieldChanged: 'serial_suffix',
        oldValue: sub.serialSuffix,
        newValue: v.normalized,
        explanation: explanation.trim(),
        timestamp: now,
      });
      sub.serialSuffix = v.normalized;
    }

    if (updates.saleDate && updates.saleDate !== sub.saleDate) {
      memoryStore.auditEvents.unshift({
        id: `aud_${Date.now()}_3`,
        submissionId: id,
        action: 'correction',
        performedBy: adminUser,
        fieldChanged: 'sale_date',
        oldValue: sub.saleDate,
        newValue: updates.saleDate,
        explanation: explanation.trim(),
        timestamp: now,
      });
      sub.saleDate = updates.saleDate;
    }

    if (updates.amountCents !== undefined && updates.amountCents !== sub.snapshotAmountCents) {
      memoryStore.auditEvents.unshift({
        id: `aud_${Date.now()}_4`,
        submissionId: id,
        action: 'amount_corrected',
        performedBy: adminUser,
        fieldChanged: 'snapshot_amount_cents',
        oldValue: formatDollars(sub.snapshotAmountCents),
        newValue: formatDollars(updates.amountCents),
        explanation: explanation.trim(),
        timestamp: now,
      });
      sub.snapshotAmountCents = updates.amountCents;
    }

    if (updates.notes !== undefined && updates.notes !== sub.notes) {
      sub.notes = updates.notes;
    }

    if (this.isLiveDatabaseConnected() && db) {
      await db
        .update(schema.spiffSubmissions)
        .set({
          liftName: sub.liftName,
          serialSuffix: sub.serialSuffix,
          saleDate: sub.saleDate,
          snapshotAmountCents: sub.snapshotAmountCents,
          notes: sub.notes,
        })
        .where(eq(schema.spiffSubmissions.id, id));
    }

    return sub;
  },

  // ----------------------------------------------------
  // 9. App Settings
  // ----------------------------------------------------
  async getSetting(key: string, defaultValue = ''): Promise<string> {
    if (this.isLiveDatabaseConnected() && db) {
      const rows = await db
        .select()
        .from(schema.appSettings)
        .where(eq(schema.appSettings.key, key))
        .limit(1);
      if (rows.length > 0) return rows[0].value;
    }
    return memoryStore.settings[key] || defaultValue;
  },

  async setSetting(key: string, value: string, adminUser: string): Promise<void> {
    memoryStore.settings[key] = value;
    if (this.isLiveDatabaseConnected() && db) {
      await db
        .insert(schema.appSettings)
        .values({
          key,
          value,
          updatedBy: adminUser,
        })
        .onConflictDoUpdate({
          target: schema.appSettings.key,
          set: {
            value,
            updatedBy: adminUser,
            updatedAt: new Date(),
          },
        });
    }
  },

  // ----------------------------------------------------
  // 10. Email Notification Jobs
  // ----------------------------------------------------
  async getEmailJobs(): Promise<EmailJob[]> {
    if (this.isLiveDatabaseConnected() && db) {
      try {
        const rows = await db
          .select()
          .from(schema.emailNotificationJobs)
          .orderBy(desc(schema.emailNotificationJobs.createdAt));

        if (rows.length > 0) {
          return rows.map((r) => ({
            id: r.id,
            submissionId: r.submissionId,
            jobType: r.jobType as any,
            recipientEmail: r.recipientEmail,
            recipientName: r.recipientName,
            recipientRole: r.recipientRole,
            status: r.status as any,
            attemptCount: r.attemptCount,
            lastAttemptAt: r.lastAttemptAt ? r.lastAttemptAt.toISOString() : null,
            nextRetryAt: r.nextRetryAt ? r.nextRetryAt.toISOString() : null,
            lockedAt: r.lockedAt ? r.lockedAt.toISOString() : null,
            lockedBy: r.lockedBy,
            leaseExpiresAt: r.leaseExpiresAt ? r.leaseExpiresAt.toISOString() : null,
            deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
            errorMessage: r.errorMessage,
            providerMessageId: r.providerMessageId,
            idempotencyKey: r.idempotencyKey,
            templateId: r.templateId,
            templateVersion: r.templateVersion,
            renderedSubject: r.renderedSubject,
            renderedBodyHtml: r.renderedBodyHtml,
            eventPayload: r.eventPayload,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt ? r.updatedAt.toISOString() : undefined,
          }));
        }
      } catch (err) {
        if (!isMemoryModeAllowed()) throw err;
        console.warn('Neon query error reading email jobs, falling back to memoryStore:', err);
      }
    }
    return [...memoryStore.emailJobs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  async getJobById(jobId: string): Promise<EmailJob | null> {
    this.assertDatabaseOrMemoryAllowed();
    if (this.isLiveDatabaseConnected() && db) {
      try {
        const rows = await db
          .select()
          .from(schema.emailNotificationJobs)
          .where(eq(schema.emailNotificationJobs.id, jobId))
          .limit(1);

        if (rows.length > 0) {
          const r = rows[0];
          return {
            id: r.id,
            submissionId: r.submissionId,
            jobType: r.jobType as any,
            recipientEmail: r.recipientEmail,
            recipientName: r.recipientName,
            recipientRole: r.recipientRole,
            status: r.status as any,
            attemptCount: r.attemptCount,
            lastAttemptAt: r.lastAttemptAt ? r.lastAttemptAt.toISOString() : null,
            nextRetryAt: r.nextRetryAt ? r.nextRetryAt.toISOString() : null,
            lockedAt: r.lockedAt ? r.lockedAt.toISOString() : null,
            lockedBy: r.lockedBy,
            leaseExpiresAt: r.leaseExpiresAt ? r.leaseExpiresAt.toISOString() : null,
            deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
            errorMessage: r.errorMessage,
            providerMessageId: r.providerMessageId,
            idempotencyKey: r.idempotencyKey,
            templateId: r.templateId,
            templateVersion: r.templateVersion,
            renderedSubject: r.renderedSubject,
            renderedBodyHtml: r.renderedBodyHtml,
            eventPayload: r.eventPayload,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt ? r.updatedAt.toISOString() : undefined,
          };
        }
        return null;
      } catch (err) {
        if (!isMemoryModeAllowed()) throw err;
        console.warn('Neon query error fetching email job by id:', err);
      }
    }
    const mem = memoryStore.emailJobs.find((j) => j.id === jobId);
    return mem ? { ...mem } : null;
  },

  /**
   * Atomically claims an individual job for delivery with an expiring lease (5 minutes).
   * Prevents concurrent workers or manual retries from colliding.
   */
  async claimJobForDelivery(jobId: string, workerId: string): Promise<EmailJob | null> {
    this.assertDatabaseOrMemoryAllowed();
    const now = new Date();
    const leaseExpires = new Date(Date.now() + 5 * 60 * 1000); // 5-minute lease duration

    if (this.isLiveDatabaseConnected() && db) {
      try {
        const claimed = await db
          .update(schema.emailNotificationJobs)
          .set({
            status: 'processing',
            lockedBy: workerId,
            lockedAt: now,
            leaseExpiresAt: leaseExpires,
            attemptCount: sql`${schema.emailNotificationJobs.attemptCount} + 1`,
            lastAttemptAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.emailNotificationJobs.id, jobId),
              lt(schema.emailNotificationJobs.attemptCount, 5),
              or(
                eq(schema.emailNotificationJobs.status, 'queued'),
                eq(schema.emailNotificationJobs.status, 'failed'),
                and(
                  eq(schema.emailNotificationJobs.status, 'processing'),
                  or(
                    isNull(schema.emailNotificationJobs.leaseExpiresAt),
                    lt(schema.emailNotificationJobs.leaseExpiresAt, now)
                  )
                )
              )
            )
          )
          .returning();

        if (claimed.length > 0) {
          const r = claimed[0];
          const jobObj: EmailJob = {
            id: r.id,
            submissionId: r.submissionId,
            jobType: r.jobType as any,
            recipientEmail: r.recipientEmail,
            recipientName: r.recipientName,
            recipientRole: r.recipientRole,
            status: 'processing',
            attemptCount: r.attemptCount,
            lastAttemptAt: now.toISOString(),
            nextRetryAt: r.nextRetryAt ? r.nextRetryAt.toISOString() : null,
            lockedAt: now.toISOString(),
            lockedBy: workerId,
            leaseExpiresAt: leaseExpires.toISOString(),
            deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
            errorMessage: r.errorMessage,
            providerMessageId: r.providerMessageId,
            idempotencyKey: r.idempotencyKey,
            templateId: r.templateId,
            templateVersion: r.templateVersion,
            renderedSubject: r.renderedSubject,
            renderedBodyHtml: r.renderedBodyHtml,
            eventPayload: r.eventPayload,
            createdAt: r.createdAt.toISOString(),
            updatedAt: now.toISOString(),
          };

          const mem = memoryStore.emailJobs.find((j) => j.id === jobId);
          if (mem) {
            Object.assign(mem, jobObj);
          }
          return jobObj;
        }
        return null;
      } catch (err) {
        if (!isMemoryModeAllowed()) throw err;
        console.warn('Neon error claiming email job, falling back to memoryStore:', err);
      }
    }

    // In-memory atomic lease claiming
    const mem = memoryStore.emailJobs.find((j) => j.id === jobId);
    if (!mem) return null;
    if (mem.attemptCount >= 5) return null;

    const isLeaseExpired =
      mem.status === 'processing' &&
      (!mem.leaseExpiresAt || new Date(mem.leaseExpiresAt) < now);

    if (mem.status === 'queued' || mem.status === 'failed' || isLeaseExpired) {
      mem.status = 'processing';
      mem.lockedBy = workerId;
      mem.lockedAt = now.toISOString();
      mem.leaseExpiresAt = leaseExpires.toISOString();
      mem.attemptCount += 1;
      mem.lastAttemptAt = now.toISOString();
      mem.updatedAt = now.toISOString();
      return { ...mem };
    }

    return null;
  },

  /**
   * Atomically claims eligible batch jobs for scheduled cron runner with SKIP LOCKED semantics.
   */
  async claimEligibleJobs(limit: number = 25, workerId: string): Promise<EmailJob[]> {
    this.assertDatabaseOrMemoryAllowed();
    const now = new Date();
    const leaseExpires = new Date(Date.now() + 5 * 60 * 1000);

    if (this.isLiveDatabaseConnected() && db) {
      try {
        const rows = await db.execute(sql`
          WITH eligible AS (
            SELECT id FROM email_notification_jobs
            WHERE (
              status = 'queued'
              OR status = 'failed'
              OR (status = 'processing' AND (lease_expires_at IS NULL OR lease_expires_at < ${now}))
            )
            AND attempt_count < 5
            AND (next_retry_at IS NULL OR next_retry_at <= ${now})
            ORDER BY created_at ASC
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
          )
          UPDATE email_notification_jobs
          SET status = 'processing',
              locked_by = ${workerId},
              locked_at = ${now},
              lease_expires_at = ${leaseExpires},
              attempt_count = email_notification_jobs.attempt_count + 1,
              last_attempt_at = ${now},
              updated_at = ${now}
          FROM eligible
          WHERE email_notification_jobs.id = eligible.id
          RETURNING email_notification_jobs.*;
        `);

        if (rows && (rows as any).rows) {
          return (rows as any).rows.map((r: any) => ({
            id: r.id,
            submissionId: r.submission_id || r.submissionId,
            jobType: r.job_type || r.jobType,
            recipientEmail: r.recipient_email || r.recipientEmail,
            recipientName: r.recipient_name || r.recipientName,
            recipientRole: r.recipient_role || r.recipientRole,
            status: 'processing',
            attemptCount: r.attempt_count || r.attemptCount || 0,
            lastAttemptAt: now.toISOString(),
            nextRetryAt: r.next_retry_at ? new Date(r.next_retry_at).toISOString() : null,
            lockedAt: now.toISOString(),
            lockedBy: workerId,
            leaseExpiresAt: leaseExpires.toISOString(),
            deliveredAt: r.delivered_at ? new Date(r.delivered_at).toISOString() : null,
            errorMessage: r.error_message || r.errorMessage,
            providerMessageId: r.provider_message_id || r.providerMessageId,
            idempotencyKey: r.idempotency_key || r.idempotencyKey,
            templateId: r.template_id || r.templateId,
            templateVersion: r.template_version || r.templateVersion,
            renderedSubject: r.rendered_subject || r.renderedSubject,
            renderedBodyHtml: r.rendered_body_html || r.renderedBodyHtml,
            eventPayload: r.event_payload || r.eventPayload,
            createdAt: new Date(r.created_at || r.createdAt).toISOString(),
            updatedAt: now.toISOString(),
          }));
        }
      } catch (err) {
        if (!isMemoryModeAllowed()) throw err;
        console.warn('Neon query error claiming batch eligible jobs:', err);
      }
    }

    // In-memory atomic batch selection
    const claimed: EmailJob[] = [];
    for (const j of memoryStore.emailJobs) {
      if (claimed.length >= limit) break;
      if (j.attemptCount >= 5) continue;
      if (j.nextRetryAt && new Date(j.nextRetryAt) > now) continue;

      const isLeaseExpired =
        j.status === 'processing' &&
        (!j.leaseExpiresAt || new Date(j.leaseExpiresAt) < now);

      if (j.status === 'queued' || j.status === 'failed' || isLeaseExpired) {
        j.status = 'processing';
        j.lockedBy = workerId;
        j.lockedAt = now.toISOString();
        j.leaseExpiresAt = leaseExpires.toISOString();
        j.attemptCount += 1;
        j.lastAttemptAt = now.toISOString();
        j.updatedAt = now.toISOString();
        claimed.push({ ...j });
      }
    }
    return claimed;
  },

  /**
   * Unified delivery pipeline used by initial sends, scheduled retries, and manual retries.
   * - Preserves immutable pre-rendered subject & HTML body
   * - Uses stable Resend idempotency key reused across retries
   * - Enforces exponential backoff with max 5 attempts
   * - Distinguishes provider acceptance ('accepted') from verified inbox delivery ('delivered')
   */
  async executeJobDelivery(job: EmailJob, appUrl?: string): Promise<EmailJob> {
    const now = new Date();
    const currentAttempt = job.attemptCount;
    const baseUrl = appUrl || CANONICAL_APP_URL || 'http://localhost:3000';

    // 1. Preserve original recipients, rendered subject, and rendered email body.
    let subject = job.renderedSubject;
    let html = job.renderedBodyHtml;

    if (!subject || !html) {
      const sub = await this.getSubmissionById(job.submissionId);
      if (sub) {
        if (job.jobType === 'decision_result') {
          let originalDecision = 'Approved';
          let originalReasonOrMessage = sub.decisionMessage;
          let originalAmount = formatDollars(sub.snapshotAmountCents);

          if (job.eventPayload) {
            try {
              const parsed = JSON.parse(job.eventPayload);
              if (parsed.originalDecision) originalDecision = parsed.originalDecision;
              if (parsed.explanation !== undefined) originalReasonOrMessage = parsed.explanation;
              if (parsed.amountFormatted) originalAmount = parsed.amountFormatted;
            } catch {}
          } else if (sub.status === 'Approved' || sub.status === 'Paid' || Boolean(sub.approvedAt)) {
            originalDecision = 'Approved';
          } else {
            originalDecision = 'Denied';
          }

          const isRecipientAdmin =
            job.recipientRole === 'General Manager' ||
            job.recipientRole === 'Accounting' ||
            job.recipientRole === 'Administrator' ||
            job.recipientRole === 'Admin';

          const templateId = originalDecision === 'Approved' ? 'spiff_approved' : 'spiff_denied';
          const template = await this.getEmailTemplate(templateId);

          const data = {
            request_id: sub.id,
            rep_name: sub.snapshotRepName,
            lift_name: sub.liftName,
            serial_suffix: sub.serialSuffix,
            spiff_name: sub.snapshotSpiffName,
            spiff_amount: originalAmount,
            sale_date: formatPhoenixDate(sub.saleDate),
            submitted_at: formatPhoenixDateTime(sub.submittedAt),
            decision: originalDecision,
            decision_at: formatPhoenixDateTime(sub.approvedAt || sub.rejectedAt || job.createdAt),
            decision_by: sub.approvedBy || sub.rejectedBy || 'Administrator',
            denial_reason: originalReasonOrMessage || '',
            approval_message: originalReasonOrMessage || '',
            admin_review_url: `${baseUrl}/admin?request=${sub.id}`,
          };

          const rendered = renderEmailTemplate(template, data, isRecipientAdmin);
          subject = rendered.subject;
          html = rendered.bodyHtml;
        } else {
          const template = await this.getEmailTemplate('new_submission');
          const data = {
            request_id: sub.id,
            rep_name: sub.snapshotRepName,
            lift_name: sub.liftName,
            serial_suffix: sub.serialSuffix,
            spiff_name: sub.snapshotSpiffName,
            spiff_amount: formatDollars(sub.snapshotAmountCents),
            sale_date: formatPhoenixDate(sub.saleDate),
            submitted_at: formatPhoenixDateTime(sub.submittedAt),
            admin_review_url: `${baseUrl}/admin?request=${sub.id}`,
            notes: sub.notes || '',
          };
          const rendered = renderEmailTemplate(template, data, true);
          subject = rendered.subject;
          html = rendered.bodyHtml;
        }
      }
    }

    if (!subject || !html) {
      subject = `Discount Forklift Spiff Notification [${job.submissionId}]`;
      html = `<p>Spiff request notification for request ${job.submissionId}</p>`;
    }

    // 2. Requirement 5: Stable Resend idempotency key reused across retries
    const emailResult = await sendRenderedEmail({
      to: job.recipientEmail,
      subject,
      html,
      idempotencyKey: job.idempotencyKey,
    });

    // 3. Requirement 4 & 10: Persist attempt counts, next retry time, errors, and status
    let finalStatus: 'accepted' | 'failed' | 'simulated' = 'failed';
    let errorMessage: string | null = null;
    let providerMessageId: string | null = null;
    let nextRetryAt: Date | null = null;

    if (emailResult.success) {
      finalStatus = (emailResult.status as any) || 'accepted';
      providerMessageId = emailResult.providerMessageId || null;
      errorMessage = null;
      nextRetryAt = null;
    } else {
      finalStatus = 'failed';
      errorMessage = emailResult.error || 'Delivery failed';

      // Exponential backoff schedule (minutes): 1, 5, 15, 60
      if (currentAttempt < 5) {
        const delaysMinutes = [1, 5, 15, 60];
        const delayMin = delaysMinutes[Math.min(currentAttempt - 1, delaysMinutes.length - 1)] || 60;
        nextRetryAt = new Date(Date.now() + delayMin * 60 * 1000);
      } else {
        nextRetryAt = null; // Reached maximum 5 delivery attempts
      }
    }

    const claimToken = job.lockedBy;

    job.lastAttemptAt = now.toISOString();
    job.status = finalStatus;
    job.providerMessageId = providerMessageId;
    job.errorMessage = errorMessage;
    job.nextRetryAt = nextRetryAt ? nextRetryAt.toISOString() : null;
    job.renderedSubject = subject;
    job.renderedBodyHtml = html;
    job.lockedBy = null;
    job.lockedAt = null;
    job.leaseExpiresAt = null;
    job.updatedAt = now.toISOString();

    if (this.isLiveDatabaseConnected() && db) {
      const updatedRows = await db
        .update(schema.emailNotificationJobs)
        .set({
          status: job.status,
          providerMessageId: job.providerMessageId,
          errorMessage: job.errorMessage,
          nextRetryAt,
          lockedBy: null,
          lockedAt: null,
          leaseExpiresAt: null,
          renderedSubject: job.renderedSubject,
          renderedBodyHtml: job.renderedBodyHtml,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.emailNotificationJobs.id, job.id),
            eq(schema.emailNotificationJobs.lockedBy, claimToken!),
            eq(schema.emailNotificationJobs.status, 'processing')
          )
        )
        .returning();

      if (updatedRows.length === 0) {
        throw new Error(
          `Stale worker lease: Job ${job.id} lease expired or was claimed by another worker before completion.`
        );
      }
    } else if (!isMemoryModeAllowed()) {
      throw new Error('[Database Error] Database is not configured and memory store is disabled in production.');
    }

    const mem = memoryStore.emailJobs.find((j) => j.id === job.id);
    if (mem) {
      if (mem.lockedBy !== claimToken || mem.status !== 'processing') {
        throw new Error(
          `Stale worker lease: Job ${job.id} lease expired or was claimed by worker '${mem.lockedBy}' before completion.`
        );
      }
      Object.assign(mem, job);
    }

    return job;
  },

  /**
   * Dispatches initial notification send strictly using the atomic claim & delivery pipeline.
   */
  async dispatchJob(jobId: string, appUrl?: string): Promise<EmailJob> {
    const workerId = `worker_init_${process.pid}_${Math.random().toString(36).substring(2, 7)}`;
    const claimed = await this.claimJobForDelivery(jobId, workerId);
    if (!claimed) {
      const existing = await this.getJobById(jobId);
      if (!existing) throw new Error('Email job not found.');
      return existing;
    }
    return this.executeJobDelivery(claimed, appUrl);
  },

  /**
   * Manual retry from admin settings interface. Enforces atomic locking, lease checking,
   * and the shared delivery pipeline.
   */
  async retryNotification(jobId: string, appUrl?: string): Promise<EmailJob> {
    const workerId = `worker_manual_${process.pid}_${Math.random().toString(36).substring(2, 7)}`;
    const claimed = await this.claimJobForDelivery(jobId, workerId);
    if (!claimed) {
      const existing = await this.getJobById(jobId);
      if (!existing) throw new Error('Email notification job not found.');
      if (existing.status === 'processing') {
        throw new Error('Notification job is currently claimed by an active delivery worker lease. Please wait for the lease to expire before retrying.');
      }
      if (existing.attemptCount >= 5) {
        throw new Error('Notification job has reached the maximum of 5 delivery attempts.');
      }
      if (existing.status === 'accepted' || existing.status === 'delivered') {
        throw new Error(`Notification has already been ${existing.status}.`);
      }
      throw new Error('Notification job is not eligible for delivery retry.');
    }

    return this.executeJobDelivery(claimed, appUrl);
  },

  /**
   * Processes all due email notification jobs on schedule for cron endpoints.
   */
  async processDueEmailJobs(
    appUrl?: string,
    limit: number = 25
  ): Promise<{
    processedCount: number;
    results: Array<{ id: string; status: string; recipient: string; error?: string | null }>;
  }> {
    const workerId = `worker_cron_${process.pid}_${Math.random().toString(36).substring(2, 7)}`;
    const claimedJobs = await this.claimEligibleJobs(limit, workerId);
    const results = [];

    for (const job of claimedJobs) {
      try {
        const delivered = await this.executeJobDelivery(job, appUrl);
        results.push({
          id: delivered.id,
          status: delivered.status,
          recipient: delivered.recipientEmail,
          error: delivered.errorMessage,
        });
      } catch (err: any) {
        results.push({
          id: job.id,
          status: 'failed',
          recipient: job.recipientEmail,
          error: err.message,
        });
      }
    }

    return { processedCount: results.length, results };
  },

  /**
   * Webhook handler for Resend delivery, bounce, and failure events.
   */
  async recordWebhookEvent(
    providerMessageId: string,
    eventType: string,
    eventDetails?: any
  ): Promise<boolean> {
    const now = new Date();
    let newStatus: 'delivered' | 'bounced' | 'failed' | null = null;
    let errorDetail: string | null = null;

    if (eventType === 'email.delivered') {
      newStatus = 'delivered';
    } else if (eventType === 'email.bounced') {
      newStatus = 'bounced';
      errorDetail = eventDetails?.bounce_reason || 'Bounced by recipient mail server';
    } else if (eventType === 'email.failed') {
      newStatus = 'failed';
      errorDetail = eventDetails?.error || 'Provider delivery failure';
    }

    if (!newStatus) return false;

    if (this.isLiveDatabaseConnected() && db) {
      try {
        await db
          .update(schema.emailNotificationJobs)
          .set({
            status: newStatus,
            deliveredAt: newStatus === 'delivered' ? now : undefined,
            errorMessage: errorDetail || undefined,
            updatedAt: now,
          })
          .where(eq(schema.emailNotificationJobs.providerMessageId, providerMessageId));
      } catch (err) {
        if (!isMemoryModeAllowed()) throw err;
        console.warn('Neon query error recording email webhook event:', err);
      }
    }

    const mem = memoryStore.emailJobs.find((j) => j.providerMessageId === providerMessageId);
    if (mem) {
      mem.status = newStatus;
      if (newStatus === 'delivered') {
        mem.deliveredAt = now.toISOString();
      }
      if (errorDetail) {
        mem.errorMessage = errorDetail;
      }
      mem.updatedAt = now.toISOString();
    }

    return true;
  },

  // ----------------------------------------------------
  // 11. Editable Email Templates Management
  // ----------------------------------------------------
  async getAllEmailTemplates(): Promise<EmailTemplate[]> {
    if (this.isLiveDatabaseConnected() && db) {
      const rows = await db.select().from(schema.emailTemplates);
      if (rows.length > 0) {
        return rows.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description || '',
          subject: r.subject,
          bodyHtml: r.bodyHtml,
          version: r.version,
          updatedAt: r.updatedAt.toISOString(),
          updatedBy: r.updatedBy,
        }));
      }
    }
    return [...memoryStore.emailTemplates];
  },

  async getEmailTemplate(id: string): Promise<EmailTemplate> {
    if (this.isLiveDatabaseConnected() && db) {
      const rows = await db
        .select()
        .from(schema.emailTemplates)
        .where(eq(schema.emailTemplates.id, id))
        .limit(1);
      if (rows.length > 0) {
        const r = rows[0];
        return {
          id: r.id,
          name: r.name,
          description: r.description || '',
          subject: r.subject,
          bodyHtml: r.bodyHtml,
          version: r.version,
          updatedAt: r.updatedAt.toISOString(),
          updatedBy: r.updatedBy,
        };
      }
    }

    const found = memoryStore.emailTemplates.find((t) => t.id === id);
    if (found) return found;

    const def = DEFAULT_EMAIL_TEMPLATES[id];
    if (def) {
      return {
        ...def,
        version: 1,
        updatedAt: new Date().toISOString(),
        updatedBy: 'System Default',
      };
    }
    throw new Error(`Email template ${id} not found.`);
  },

  async getEmailTemplateVersions(templateId: string): Promise<EmailTemplateVersion[]> {
    if (this.isLiveDatabaseConnected() && db) {
      const rows = await db
        .select()
        .from(schema.emailTemplateVersions)
        .where(eq(schema.emailTemplateVersions.templateId, templateId))
        .orderBy(desc(schema.emailTemplateVersions.version));
      if (rows.length > 0) {
        return rows.map((r) => ({
          id: r.id,
          templateId: r.templateId,
          version: r.version,
          subject: r.subject,
          bodyHtml: r.bodyHtml,
          changeSummary: r.changeSummary || 'Updated template',
          createdAt: r.createdAt.toISOString(),
          createdBy: r.createdBy,
        }));
      }
    }
    return memoryStore.emailTemplateVersions
      .filter((v) => v.templateId === templateId)
      .sort((a, b) => b.version - a.version);
  },

  async updateEmailTemplate(
    id: string,
    updates: { subject: string; bodyHtml: string; changeSummary?: string },
    adminUser: string
  ): Promise<EmailTemplate> {
    const val = validateTemplateContent(id, updates.subject, updates.bodyHtml);
    if (!val.isValid) {
      throw new Error(val.error);
    }

    const current = await this.getEmailTemplate(id);
    const newVersion = current.version + 1;
    const now = new Date().toISOString();

    const updatedTemplate: EmailTemplate = {
      ...current,
      subject: updates.subject.trim(),
      bodyHtml: updates.bodyHtml.trim(),
      version: newVersion,
      updatedAt: now,
      updatedBy: adminUser,
    };

    const newVersionRecord: EmailTemplateVersion = {
      id: `ver_${id}_v${newVersion}_${Date.now()}`,
      templateId: id,
      version: newVersion,
      subject: updatedTemplate.subject,
      bodyHtml: updatedTemplate.bodyHtml,
      changeSummary: updates.changeSummary?.trim() || `Saved revision v${newVersion} by ${adminUser}`,
      createdAt: now,
      createdBy: adminUser,
    };

    const idx = memoryStore.emailTemplates.findIndex((t) => t.id === id);
    if (idx >= 0) {
      memoryStore.emailTemplates[idx] = updatedTemplate;
    } else {
      memoryStore.emailTemplates.push(updatedTemplate);
    }
    memoryStore.emailTemplateVersions.unshift(newVersionRecord);

    if (this.isLiveDatabaseConnected() && db) {
      await db
        .insert(schema.emailTemplates)
        .values({
          id: updatedTemplate.id,
          name: updatedTemplate.name,
          description: updatedTemplate.description,
          subject: updatedTemplate.subject,
          bodyHtml: updatedTemplate.bodyHtml,
          version: updatedTemplate.version,
          updatedAt: new Date(),
          updatedBy: updatedTemplate.updatedBy,
        })
        .onConflictDoUpdate({
          target: schema.emailTemplates.id,
          set: {
            subject: updatedTemplate.subject,
            bodyHtml: updatedTemplate.bodyHtml,
            version: updatedTemplate.version,
            updatedAt: new Date(),
            updatedBy: updatedTemplate.updatedBy,
          },
        });

      await db.insert(schema.emailTemplateVersions).values({
        id: newVersionRecord.id,
        templateId: newVersionRecord.templateId,
        version: newVersionRecord.version,
        subject: newVersionRecord.subject,
        bodyHtml: newVersionRecord.bodyHtml,
        changeSummary: newVersionRecord.changeSummary,
        createdBy: newVersionRecord.createdBy,
        createdAt: new Date(),
      });
    }

    return updatedTemplate;
  },

  async restoreDefaultEmailTemplate(id: string, adminUser: string): Promise<EmailTemplate> {
    const def = DEFAULT_EMAIL_TEMPLATES[id];
    if (!def) throw new Error(`Default template for ${id} not found.`);

    return this.updateEmailTemplate(
      id,
      {
        subject: def.subject,
        bodyHtml: def.bodyHtml,
        changeSummary: 'Restored to standard system default wording',
      },
      adminUser
    );
  },

  async sendTestEmailTemplate(params: {
    templateId: string;
    testEmail: string;
    customSubject?: string;
    customBodyHtml?: string;
    adminUser: string;
  }): Promise<{
    success: boolean;
    status: 'delivered' | 'accepted' | 'failed' | 'simulated';
    providerMessageId?: string;
    error?: string;
  }> {
    const { templateId, testEmail, customSubject, customBodyHtml } = params;
    const cleanEmail = testEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      throw new Error('Please enter a valid recipient email address for the test send.');
    }

    let tplSubject = customSubject;
    let tplBody = customBodyHtml;

    if (!tplSubject || !tplBody) {
      const template = await this.getEmailTemplate(templateId);
      tplSubject = tplSubject || template.subject;
      tplBody = tplBody || template.bodyHtml;
    }

    const val = validateTemplateContent(templateId, tplSubject, tplBody);
    if (!val.isValid) {
      throw new Error(val.error);
    }

    const sampleData = {
      ...SAMPLE_TEMPLATE_DATA,
      decision: templateId === 'spiff_denied' ? 'Denied' : 'Approved',
    };

    const rendered = renderEmailTemplate(
      { subject: tplSubject, bodyHtml: tplBody },
      sampleData,
      true
    );

    const testSubject = `[TEST] ${rendered.subject}`;
    return sendRenderedEmail({
      to: cleanEmail,
      subject: testSubject,
      html: rendered.bodyHtml,
    });
  },

  async cleanupAbandonedUploads(): Promise<{ cleanedCount: number }> {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    let cleaned = 0;

    if (this.isLiveDatabaseConnected() && db) {
      try {
        const abandoned = await db
          .select()
          .from(schema.attachments)
          .where(
            and(
              eq(schema.attachments.uploadStatus, 'pending'),
              lt(schema.attachments.uploadedAt, twoHoursAgo)
            )
          );

        for (const att of abandoned) {
          await deleteBlobPhoto(att.storageKey);
          await db
            .update(schema.attachments)
            .set({ uploadStatus: 'abandoned' })
            .where(eq(schema.attachments.id, att.id));
          cleaned++;
        }
        return { cleanedCount: cleaned };
      } catch (err) {
        console.error('Error during cleanupAbandonedUploads in DB:', err);
      }
    }

    const abandoned = memoryStore.attachments.filter(
      (a) =>
        a.uploadStatus === 'pending' &&
        !a.submissionId &&
        new Date(a.uploadedAt).getTime() < twoHoursAgo.getTime()
    );

    for (const att of abandoned) {
      await deleteBlobPhoto(att.storageKey);
      att.uploadStatus = 'abandoned';
      cleaned++;
    }

    return { cleanedCount: cleaned };
  },

  // ----------------------------------------------------
  // 11. Presets Loader (includes GMs, Accounting, Branches)
  // ----------------------------------------------------
  loadQuickStartPresets(): { repsAdded: number; spiffsAdded: number; contactsAdded: number } {
    let repsAdded = 0;
    let spiffsAdded = 0;
    let contactsAdded = 0;

    // 1. Notification Contacts (GM and Accounting)
    const sampleContacts: Array<{
      name: string;
      email: string;
      role: 'Accounting' | 'General Manager' | 'Approving Manager' | 'Other';
      branch?: string;
      isDefaultAccounting: boolean;
    }> = [
      {
        name: 'Sarah Connor',
        email: 'sarah.connor@discountforkliftphoenix.com',
        role: 'General Manager',
        branch: 'Phoenix - Main Yard',
        isDefaultAccounting: false,
      },
      {
        name: 'Marcus Vance',
        email: 'marcus.vance@discountforkliftphoenix.com',
        role: 'Approving Manager',
        branch: 'Phoenix - Main Yard',
        isDefaultAccounting: false,
      },
      {
        name: 'Carlos Morales',
        email: 'carlos.morales@discountforkliftphoenix.com',
        role: 'General Manager',
        branch: 'Dallas Branch',
        isDefaultAccounting: false,
      },
      {
        name: 'Alex Rivera',
        email: 'dallas.manager@discountforkliftphoenix.com',
        role: 'Approving Manager',
        branch: 'Dallas Branch',
        isDefaultAccounting: false,
      },
      {
        name: 'Robert Davis',
        email: 'robert.davis@discountforkliftphoenix.com',
        role: 'General Manager',
        branch: 'Tucson Branch',
        isDefaultAccounting: false,
      },
      {
        name: 'Accounting Payroll Office',
        email: 'accounting@discountforkliftphoenix.com',
        role: 'Accounting',
        branch: 'Corporate',
        isDefaultAccounting: true,
      },
    ];

    const createdContactIds: Record<string, string> = {};

    for (const c of sampleContacts) {
      let existing = memoryStore.contacts.find((x) => x.email.toLowerCase() === c.email.toLowerCase());
      if (!existing) {
        const newC: NotificationContact = {
          id: `cnt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: c.name,
          email: c.email,
          role: c.role,
          branch: c.branch || null,
          isDefaultAccounting: c.isDefaultAccounting,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        memoryStore.contacts.push(newC);
        createdContactIds[c.name] = newC.id;
        contactsAdded++;
      } else {
        createdContactIds[c.name] = existing.id;
      }
    }

    // 2. Sales Reps with valid email addresses and assigned GMs
    const gmIdPhoenix = createdContactIds['Sarah Connor'] || '';
    const gmIdDallas = createdContactIds['Carlos Morales'] || '';
    const gmIdTucson = createdContactIds['Robert Davis'] || '';

    const sampleReps = [
      {
        name: 'Jake Thompson',
        email: 'jake.thompson@discountforkliftphoenix.com',
        branch: 'Dallas Branch',
        assignedGmIds: gmIdDallas,
      },
      {
        name: 'Caleb Vance',
        email: 'caleb@discountforkliftphoenix.com',
        branch: 'Phoenix - Main Yard',
        assignedGmIds: gmIdPhoenix,
      },
      {
        name: 'Travis Miller',
        email: 'travis.miller@discountforkliftphoenix.com',
        branch: 'Phoenix - Main Yard',
        assignedGmIds: gmIdPhoenix,
      },
      {
        name: 'Marcus Cole',
        email: 'marcus.cole@discountforkliftphoenix.com',
        branch: 'Tucson Branch',
        assignedGmIds: gmIdTucson,
      },
      {
        name: 'David Ortiz',
        email: 'david.ortiz@discountforkliftphoenix.com',
        branch: 'Phoenix - Main Yard',
        assignedGmIds: gmIdPhoenix,
      },
    ];

    for (const r of sampleReps) {
      if (!memoryStore.reps.some((existing) => existing.name.toLowerCase() === r.name.toLowerCase())) {
        memoryStore.reps.push({
          id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: r.name,
          email: r.email,
          branch: r.branch,
          assignedGmIds: r.assignedGmIds,
          isActive: true,
          displayOrder: memoryStore.reps.length + 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        repsAdded++;
      }
    }

    // 3. Spiffs
    const sampleSpiffs = [
      {
        name: 'Electric Cushion Quick Sale',
        description: 'Standard cash spiff for closed warehouse electric cushion forklift deals.',
        eligibilityRequirements: 'Requires completed delivery inspection and signed financing/lease agreement.',
        amountCents: 15000,
      },
      {
        name: 'Pneumatic Yard Truck Spiff',
        description: 'Outdoor heavy-duty diesel / LP pneumatic tire forklift bonus.',
        eligibilityRequirements: 'Eligible on sold units >= 5,000 lbs capacity closed within the calendar month.',
        amountCents: 25000,
      },
      {
        name: 'Overstock Aged Inventory Move',
        description: 'Special spiff program for warehouse units in inventory over 90 days.',
        eligibilityRequirements: 'Stock tag must be flagged as aged inventory on sales sheet.',
        amountCents: 50000,
      },
      {
        name: 'Lithium Battery Upgrade Package',
        description: 'Sold forklift equipped with OEM fast-charge Lithium-Ion power pack.',
        eligibilityRequirements: 'Battery charger and warranty package bundled in sale invoice.',
        amountCents: 10000,
      },
    ];

    for (const s of sampleSpiffs) {
      if (!memoryStore.spiffs.some((existing) => existing.name.toLowerCase() === s.name.toLowerCase())) {
        memoryStore.spiffs.push({
          id: `spf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: s.name,
          description: s.description,
          eligibilityRequirements: s.eligibilityRequirements,
          amountCents: s.amountCents,
          isActive: true,
          displayOrder: memoryStore.spiffs.length + 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        spiffsAdded++;
      }
    }

    return { repsAdded, spiffsAdded, contactsAdded };
  },

  // ----------------------------------------------------
  // 12. Admin Users & Password Management
  // ----------------------------------------------------
  async getAllAdminUsers(): Promise<Omit<AdminUser, 'passwordHash'>[]> {
    if (this.isLiveDatabaseConnected() && db) {
      try {
        const rows = await db
          .select()
          .from(schema.adminUsers)
          .orderBy(asc(schema.adminUsers.email));
        if (rows.length > 0) {
          return rows.map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            role: (u as any).role || 'Administrator',
            isAuthorized: u.isAuthorized,
            hasPassword: Boolean(u.passwordHash),
            mustChangePassword: Boolean((u as any).mustChangePassword),
            passwordChangedAt: u.passwordChangedAt ? u.passwordChangedAt.toISOString() : null,
            lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
            createdAt: u.createdAt.toISOString(),
            updatedAt: u.updatedAt ? u.updatedAt.toISOString() : u.createdAt.toISOString(),
          }));
        }
      } catch (err) {
        console.warn('Neon query error for admin users, falling back to memory store:', err);
      }
    }
    return memoryStore.adminUsers.map(({ passwordHash, ...rest }) => ({
      ...rest,
      hasPassword: Boolean(passwordHash),
      mustChangePassword: Boolean(rest.mustChangePassword),
      role: rest.role || 'Administrator',
    }));

  },

  async getAdminUserByEmail(email: string): Promise<AdminUser | null> {
    const cleanEmail = email.trim().toLowerCase();
    if (this.isLiveDatabaseConnected() && db) {
      try {
        const rows = await db
          .select()
          .from(schema.adminUsers)
          .where(eq(schema.adminUsers.email, cleanEmail))
          .limit(1);
        if (rows.length > 0) {
          const r = rows[0];
          return {
            id: r.id,
            email: r.email,
            name: r.name,
            role: (r as any).role || 'Administrator',
            passwordHash: r.passwordHash,
            isAuthorized: r.isAuthorized,
            mustChangePassword: Boolean((r as any).mustChangePassword),
            lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
            passwordChangedAt: r.passwordChangedAt ? r.passwordChangedAt.toISOString() : null,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          };
        }
      } catch (err) {
        console.warn('Neon query error for admin user by email:', err);
      }
    }
    const mem = memoryStore.adminUsers.find((u) => u.email.toLowerCase() === cleanEmail);
    return mem || null;
  },

  async getAdminUserById(id: string): Promise<AdminUser | null> {
    if (this.isLiveDatabaseConnected() && db) {
      try {
        const rows = await db
          .select()
          .from(schema.adminUsers)
          .where(eq(schema.adminUsers.id, id))
          .limit(1);
        if (rows.length > 0) {
          const r = rows[0];
          return {
            id: r.id,
            email: r.email,
            name: r.name,
            role: (r as any).role || 'Administrator',
            passwordHash: r.passwordHash,
            isAuthorized: r.isAuthorized,
            mustChangePassword: Boolean((r as any).mustChangePassword),
            lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
            passwordChangedAt: r.passwordChangedAt ? r.passwordChangedAt.toISOString() : null,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          };
        }
      } catch (err) {
        console.warn('Neon query error for admin user by id:', err);
      }
    }
    const mem = memoryStore.adminUsers.find((u) => u.id === id);
    return mem || null;
  },

  async hasAnyAdminWithPassword(): Promise<boolean> {
    if (this.isLiveDatabaseConnected() && db) {
      try {
        const rows = await db
          .select()
          .from(schema.adminUsers)
          .where(sql`${schema.adminUsers.passwordHash} IS NOT NULL AND ${schema.adminUsers.isAuthorized} = true`)
          .limit(1);
        return rows.length > 0;
      } catch (err) {
        console.warn('Neon query error checking configured admins:', err);
      }
    }
    return memoryStore.adminUsers.some((u) => Boolean(u.passwordHash && u.isAuthorized));
  },


  async authenticateAdmin(
    email: string,
    password: string
  ): Promise<{ success: boolean; user?: Omit<AdminUser, 'passwordHash'>; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, error: 'Administrator email is required.' };
    }
    if (!password) {
      return { success: false, error: 'Password is required.' };
    }

    let foundUser: AdminUser | undefined;

    if (this.isLiveDatabaseConnected() && db) {
      try {
        const rows = await db
          .select()
          .from(schema.adminUsers)
          .where(eq(schema.adminUsers.email, cleanEmail))
          .limit(1);
        if (rows.length > 0) {
          const row = rows[0];
          foundUser = {
            id: row.id,
            email: row.email,
            name: row.name,
            role: (row as any).role || 'Administrator',
            passwordHash: row.passwordHash,
            isAuthorized: row.isAuthorized,
            mustChangePassword: Boolean((row as any).mustChangePassword),
            lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt ? row.updatedAt.toISOString() : row.createdAt.toISOString(),
          };
        }
      } catch (err) {
        console.warn('Neon query error for admin auth, checking memory store:', err);
      }
    }

    if (!foundUser) {
      foundUser = memoryStore.adminUsers.find((u) => u.email.toLowerCase() === cleanEmail);
    }

    if (!foundUser) {
      return { success: false, error: 'No administrator account found with this email address.' };
    }

    if (!foundUser.isAuthorized) {
      return { success: false, error: 'This administrator account has been deactivated. Please contact an office administrator.' };
    }

    if (!foundUser.passwordHash) {
      return {
        success: false,
        error: 'Password setup is required for this administrator account. Please use your password setup link or request a password reset.',
      };
    }

    const isValid = verifyPassword(password, foundUser.passwordHash);
    if (!isValid) {
      return { success: false, error: 'Incorrect email or password. Please verify and try again.' };
    }

    // Update lastLoginAt
    const nowIso = new Date().toISOString();
    foundUser.lastLoginAt = nowIso;
    if (this.isLiveDatabaseConnected() && db) {
      try {
        await db
          .update(schema.adminUsers)
          .set({ lastLoginAt: new Date() })
          .where(eq(schema.adminUsers.id, foundUser.id));
      } catch (err) {
        console.warn('Neon update error for lastLoginAt:', err);
      }
    }

    const { passwordHash, ...safeUser } = foundUser;
    return { success: true, user: safeUser };
  },

  async createAdminUser(input: {
    email: string;
    name?: string;
    role?: 'Administrator' | 'Approving Manager' | string;
    password?: string;
  }): Promise<Omit<AdminUser, 'passwordHash'>> {
    const cleanEmail = input.email.trim().toLowerCase();
    if (!cleanEmail) throw new Error('Administrator email is required.');

    let passwordHash: string | null = null;
    const now = new Date().toISOString();

    if (input.password && input.password.trim()) {
      const strength = validatePasswordStrength(input.password);
      if (!strength.isValid) {
        throw new Error(strength.error || 'Password does not meet security requirements.');
      }
      passwordHash = hashPassword(input.password);
    }

    const existing = memoryStore.adminUsers.find((u) => u.email.toLowerCase() === cleanEmail);
    if (existing) {
      throw new Error(`An administrator account with email "${cleanEmail}" already exists.`);
    }

    const newUser: AdminUser = {
      id: `admin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      email: cleanEmail,
      name: input.name ? input.name.trim() : null,
      role: input.role || 'Administrator',
      passwordHash,
      isAuthorized: true,
      mustChangePassword: false,
      lastLoginAt: null,
      passwordChangedAt: passwordHash ? now : null,
      createdAt: now,
      updatedAt: now,
    };

    if (this.isLiveDatabaseConnected() && db) {
      try {
        await db.insert(schema.adminUsers).values({
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role || 'Administrator',
          passwordHash: newUser.passwordHash,
          isAuthorized: newUser.isAuthorized,
          mustChangePassword: false,
          passwordChangedAt: newUser.passwordChangedAt ? new Date(newUser.passwordChangedAt) : null,
        });
      } catch (err) {
        console.warn('Neon insert error for admin user:', err);
      }
    }

    memoryStore.adminUsers.push(newUser);
    const { passwordHash: _, ...safeUser } = newUser;
    return safeUser;
  },

  async updateAdminPassword(id: string, newPassword: string): Promise<boolean> {
    const strength = validatePasswordStrength(newPassword);
    if (!strength.isValid) {
      throw new Error(strength.error || 'Password does not meet security requirements.');
    }
    const newHash = hashPassword(newPassword);
    const now = new Date().toISOString();

    if (this.isLiveDatabaseConnected() && db) {
      try {
        await db
          .update(schema.adminUsers)
          .set({
            passwordHash: newHash,
            mustChangePassword: false,
            passwordChangedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.adminUsers.id, id));
      } catch (err) {
        console.warn('Neon update error for admin password:', err);
      }
    }

    const user = memoryStore.adminUsers.find((u) => u.id === id);
    if (user) {
      user.passwordHash = newHash;
      user.mustChangePassword = false;
      user.passwordChangedAt = now;
      user.updatedAt = now;
      return true;
    }
    throw new Error('Administrator user not found.');
  },

  async seedOrUpdateInitialAdmin(input: {
    email: string;
    name?: string;
    initialPassword?: string;
    role?: 'Administrator' | 'Approving Manager';
  }): Promise<{ user: Omit<AdminUser, 'passwordHash'>; action: 'created' | 'granted_role' | 'password_set' | 'noop' }> {
    const cleanEmail = input.email.trim().toLowerCase();
    const existing = await this.getAdminUserByEmail(cleanEmail);

    if (existing) {
      // If this email already exists:
      // If it already has a password, grant it admin role without changing its password
      if (existing.passwordHash) {
        let updated = false;
        if (existing.role !== 'Administrator' || !existing.isAuthorized) {
          existing.role = 'Administrator';
          existing.isAuthorized = true;
          updated = true;
          if (this.isLiveDatabaseConnected() && db) {
            try {
              await db
                .update(schema.adminUsers)
                .set({ role: 'Administrator', isAuthorized: true, updatedAt: new Date() })
                .where(eq(schema.adminUsers.id, existing.id));
            } catch (err) {
              console.warn('Neon update error granting admin role to existing user:', err);
            }
          }
          const mem = memoryStore.adminUsers.find((u) => u.id === existing.id);
          if (mem) {
            mem.role = 'Administrator';
            mem.isAuthorized = true;
          }
        }
        const { passwordHash: _, ...safeUser } = existing;
        return { user: safeUser, action: updated ? 'granted_role' : 'noop' };
      } else {
        // Existing account without password set (placeholder):
        // Hash initial password from server environment, require password change on first login
        if (input.initialPassword) {
          const strength = validatePasswordStrength(input.initialPassword);
          if (!strength.isValid) {
            throw new Error(strength.error || 'Initial password does not meet security requirements.');
          }
          const newHash = hashPassword(input.initialPassword);
          existing.passwordHash = newHash;
          existing.role = 'Administrator';
          existing.isAuthorized = true;
          existing.mustChangePassword = true;
          if (input.name) existing.name = input.name;

          if (this.isLiveDatabaseConnected() && db) {
            try {
              await db
                .update(schema.adminUsers)
                .set({
                  passwordHash: newHash,
                  role: 'Administrator',
                  isAuthorized: true,
                  mustChangePassword: true,
                  name: existing.name,
                  updatedAt: new Date(),
                })
                .where(eq(schema.adminUsers.id, existing.id));
            } catch (err) {
              console.warn('Neon update error setting initial password on placeholder admin:', err);
            }
          }
          const mem = memoryStore.adminUsers.find((u) => u.id === existing.id);
          if (mem) {
            mem.passwordHash = newHash;
            mem.role = 'Administrator';
            mem.isAuthorized = true;
            mem.mustChangePassword = true;
            if (input.name) mem.name = input.name;
          }
          const { passwordHash: _, ...safeUser } = existing;
          return { user: safeUser, action: 'password_set' };
        }
        const { passwordHash: _, ...safeUser } = existing;
        return { user: safeUser, action: 'noop' };
      }
    }

    // Account does not exist: create fresh administrator with hashed password from server env
    const newAdminId = `admin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let pHash: string | null = null;
    let mustChangePassword = false;
    if (input.initialPassword) {
      const strength = validatePasswordStrength(input.initialPassword);
      if (!strength.isValid) {
        throw new Error(strength.error || 'Initial password does not meet security requirements.');
      }
      pHash = hashPassword(input.initialPassword);
      mustChangePassword = true;
    }

    const now = new Date().toISOString();
    const newUser: AdminUser = {
      id: newAdminId,
      email: cleanEmail,
      name: input.name || cleanEmail.split('@')[0],
      role: input.role || 'Administrator',
      passwordHash: pHash,
      isAuthorized: true,
      mustChangePassword,
      lastLoginAt: null,
      passwordChangedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    if (this.isLiveDatabaseConnected() && db) {
      try {
        await db.insert(schema.adminUsers).values({
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role || 'Administrator',
          passwordHash: newUser.passwordHash,
          isAuthorized: true,
          mustChangePassword,
        });
      } catch (err) {
        console.warn('Neon insert error for initial admin:', err);
      }
    }

    memoryStore.adminUsers.push(newUser);
    const { passwordHash: _, ...safeUser } = newUser;
    return { user: safeUser, action: 'created' };
  },

  async toggleAdminStatus(id: string, isAuthorized: boolean): Promise<boolean> {
    const now = new Date().toISOString();
    if (this.isLiveDatabaseConnected() && db) {
      try {
        await db
          .update(schema.adminUsers)
          .set({
            isAuthorized,
            updatedAt: new Date(),
          })
          .where(eq(schema.adminUsers.id, id));
      } catch (err) {
        console.warn('Neon update error for admin status:', err);
      }
    }

    const user = memoryStore.adminUsers.find((u) => u.id === id);
    if (user) {
      user.isAuthorized = isAuthorized;
      user.updatedAt = now;
      return true;
    }
    throw new Error('Administrator user not found.');
  },

  async updateAdminRole(id: string, role: string): Promise<boolean> {
    const validRoles = ['Administrator', 'Approving Manager'];
    if (!validRoles.includes(role)) {
      throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }
    const now = new Date().toISOString();
    if (this.isLiveDatabaseConnected() && db) {
      try {
        await db
          .update(schema.adminUsers)
          .set({
            role,
            updatedAt: new Date(),
          })
          .where(eq(schema.adminUsers.id, id));
      } catch (err) {
        console.warn('Neon update error for admin role:', err);
      }
    }

    const user = memoryStore.adminUsers.find((u) => u.id === id);
    if (user) {
      user.role = role;
      user.updatedAt = now;
      return true;
    }
    throw new Error('Administrator user not found.');
  },


  async deleteAdminUser(id: string, requesterEmail: string): Promise<boolean> {
    const user = memoryStore.adminUsers.find((u) => u.id === id);
    if (user && user.email.toLowerCase() === requesterEmail.toLowerCase()) {
      throw new Error('You cannot delete your own logged-in administrator account.');
    }

    if (this.isLiveDatabaseConnected() && db) {
      try {
        await db.delete(schema.adminUsers).where(eq(schema.adminUsers.id, id));
      } catch (err) {
        console.warn('Neon delete error for admin user:', err);
      }
    }

    const idx = memoryStore.adminUsers.findIndex((u) => u.id === id);
    if (idx !== -1) {
      memoryStore.adminUsers.splice(idx, 1);
      return true;
    }
    return false;
  },
};
