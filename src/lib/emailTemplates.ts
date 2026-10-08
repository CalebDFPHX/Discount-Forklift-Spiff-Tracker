/**
 * Discount Forklift Spiff Tracker - Email Templates Engine
 * Handles editable templates, supported placeholders, safe escaping,
 * versioning, and conditional rendering (admin review vs sales rep view).
 */

import { sanitizeEmailHtml, isSafeUrl } from './sanitizer.js';

export interface EmailTemplate {
  id: string; // 'new_submission' | 'spiff_approved' | 'spiff_denied'
  name: string;
  description: string;
  subject: string;
  bodyHtml: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export interface EmailTemplateVersion {
  id: string;
  templateId: string;
  version: number;
  subject: string;
  bodyHtml: string;
  changeSummary: string;
  createdAt: string;
  createdBy: string;
}

export interface PlaceholderDef {
  key: string;
  label: string;
  description: string;
  sample: string;
  applicableTemplates: string[]; // ['new_submission', 'spiff_approved', 'spiff_denied']
}

export const SUPPORTED_PLACEHOLDERS: PlaceholderDef[] = [
  {
    key: 'request_id',
    label: 'Request ID',
    description: 'Unique identifier for the spiff submission (e.g. SPF-2026-4821)',
    sample: 'SPF-2026-4821',
    applicableTemplates: ['new_submission', 'spiff_approved', 'spiff_denied'],
  },
  {
    key: 'rep_name',
    label: 'Sales Rep Name',
    description: 'Full name of the submitting sales representative',
    sample: 'Jake Miller',
    applicableTemplates: ['new_submission', 'spiff_approved', 'spiff_denied'],
  },
  {
    key: 'lift_name',
    label: 'Forklift / Model',
    description: 'Equipment model or forklift description',
    sample: 'Toyota 8FGU25 Pneumatic',
    applicableTemplates: ['new_submission', 'spiff_approved', 'spiff_denied'],
  },
  {
    key: 'serial_suffix',
    label: 'Serial Suffix',
    description: 'Last 4 digits or characters of the serial number',
    sample: '4821',
    applicableTemplates: ['new_submission', 'spiff_approved', 'spiff_denied'],
  },
  {
    key: 'spiff_name',
    label: 'Spiff Program',
    description: 'Title of the spiff program claimed',
    sample: 'Standard Forklift Sale Spiff',
    applicableTemplates: ['new_submission', 'spiff_approved', 'spiff_denied'],
  },
  {
    key: 'spiff_amount',
    label: 'Spiff Amount',
    description: 'Formatted payout dollar amount with $ symbol',
    sample: '$150.00',
    applicableTemplates: ['new_submission', 'spiff_approved', 'spiff_denied'],
  },
  {
    key: 'sale_date',
    label: 'Sale Date',
    description: 'Date the sale occurred formatted for Phoenix MST',
    sample: '10/08/2026',
    applicableTemplates: ['new_submission', 'spiff_approved', 'spiff_denied'],
  },
  {
    key: 'submitted_at',
    label: 'Submission Timestamp',
    description: 'Date and time the rep submitted the request',
    sample: '10/08/2026 09:30 AM MST',
    applicableTemplates: ['new_submission', 'spiff_approved', 'spiff_denied'],
  },
  {
    key: 'decision',
    label: 'Decision Status',
    description: 'Current decision outcome (Approved or Denied)',
    sample: 'Approved',
    applicableTemplates: ['spiff_approved', 'spiff_denied'],
  },
  {
    key: 'decision_at',
    label: 'Decision Timestamp',
    description: 'Date and time the administrator decided the request',
    sample: '10/08/2026 10:15 AM MST',
    applicableTemplates: ['spiff_approved', 'spiff_denied'],
  },
  {
    key: 'decision_by',
    label: 'Decision By',
    description: 'Name or email of the reviewing administrator',
    sample: 'Caleb Vance',
    applicableTemplates: ['spiff_approved', 'spiff_denied'],
  },
  {
    key: 'approval_message',
    label: 'Approval Message',
    description: 'Optional manager note or instructions on approval',
    sample: 'Approved for standard accounting payroll spiff disbursement.',
    applicableTemplates: ['spiff_approved'],
  },
  {
    key: 'denial_reason',
    label: 'Denial Reason',
    description: 'Mandatory explanation recorded when a spiff is denied',
    sample: 'Serial tag in submitted photo does not match invoice documentation.',
    applicableTemplates: ['spiff_denied'],
  },
  {
    key: 'admin_review_url',
    label: 'Admin Review Link',
    description: 'Protected direct URL to review and decide in admin portal',
    sample: 'https://ais-dev-cxp4g2dragrwml6itk2qg6-123396949222.us-east1.run.app/admin?request=SPF-2026-4821',
    applicableTemplates: ['new_submission', 'spiff_approved', 'spiff_denied'],
  },
];

export const DEFAULT_EMAIL_TEMPLATES: Record<string, Omit<EmailTemplate, 'updatedAt' | 'version' | 'updatedBy'>> = {
  new_submission: {
    id: 'new_submission',
    name: 'New Spiff Submission Alert',
    description: 'Sent immediately to the configured office manager email address when a sales rep submits a spiff claim.',
    subject: 'New Spiff Request [{{request_id}}] - {{rep_name}} ({{spiff_amount}})',
    bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
  <div style="background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; max-width: 600px; margin: 0 auto; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    <div style="background-color: #242424; padding: 22px 24px; color: #ffffff; border-bottom: 3px solid #95EA00;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">Discount Forklift Spiff Alert</h1>
      <p style="margin: 4px 0 0 0; color: #95EA00; font-size: 13px; font-weight: 600;">Request ID: {{request_id}}</p>
    </div>
    <div style="padding: 24px;">
      <p style="margin: 0 0 16px 0; font-size: 14px; color: #475569; line-height: 1.5;">
        A new sales spiff claim has been submitted by <strong>{{rep_name}}</strong> and is awaiting manager verification:
      </p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Sales Representative</td>
          <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">{{rep_name}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Forklift / Equipment</td>
          <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">{{lift_name}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Serial Suffix (Last 4)</td>
          <td style="padding: 10px 0; font-family: monospace; font-size: 15px; letter-spacing: 0.05em; color: #0f172a; font-weight: 700; text-align: right;">{{serial_suffix}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Spiff Program</td>
          <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">{{spiff_name}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Spiff Amount</td>
          <td style="padding: 10px 0; color: #95EA00; font-size: 18px; font-weight: 700; text-align: right; text-shadow: 0 0 1px #242424;">{{spiff_amount}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Sale Date</td>
          <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">{{sale_date}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Submitted At (Phoenix)</td>
          <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">{{submitted_at}}</td>
        </tr>
      </table>
      {{#if_admin}}
      <div style="text-align: center; margin-top: 26px;">
        <a href="{{admin_review_url}}" style="display: inline-block; background-color: #A559BD; color: #ffffff !important; padding: 12px 26px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 14px; letter-spacing: -0.01em;">Log In to Review & Decide Request</a>
      </div>
      {{/if_admin}}
    </div>
    <div style="padding: 14px 24px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center;">
      Discount Forklift Phoenix · Sales Office Spiff Tracking System
    </div>
  </div>
</div>`,
  },

  spiff_approved: {
    id: 'spiff_approved',
    name: 'Spiff Approved Result',
    description: 'Sent to the submitting sales rep and selected general manager/accounting contacts upon approval. States clearly that payment is pending.',
    subject: 'Spiff Request [{{request_id}}] Approved - {{rep_name}} ({{spiff_amount}})',
    bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
  <div style="background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; max-width: 600px; margin: 0 auto; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    <div style="background-color: #242424; padding: 22px 24px; color: #ffffff; border-bottom: 3px solid #95EA00;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 700;">Discount Forklift Spiff Notification</h1>
      <p style="margin: 4px 0 0 0; color: #95EA00; font-size: 13px; font-weight: 600;">Request ID: {{request_id}}</p>
    </div>
    <div style="padding: 14px 24px; background-color: #dcfce7; color: #15803d; font-weight: 700; font-size: 15px; border-bottom: 1px solid #bbf7d0;">
      ✓ Status: Approved — Payment Pending Distribution
    </div>
    <div style="padding: 24px;">
      <p style="margin: 0 0 16px 0; font-size: 14px; color: #334155; line-height: 1.5;">
        Great news! Your spiff claim has been reviewed and <strong>Approved</strong>. Please note that <em>payment is still pending</em> and will be disbursed in the upcoming payroll spiff batch.
      </p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Sales Representative</td>
          <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">{{rep_name}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Forklift / Model</td>
          <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">{{lift_name}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Serial Suffix (Last 4)</td>
          <td style="padding: 10px 0; font-family: monospace; font-size: 15px; letter-spacing: 0.05em; color: #0f172a; font-weight: 700; text-align: right;">{{serial_suffix}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Spiff Program</td>
          <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">{{spiff_name}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Spiff Amount</td>
          <td style="padding: 10px 0; color: #15803d; font-size: 18px; font-weight: 700; text-align: right;">{{spiff_amount}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Decision</td>
          <td style="padding: 10px 0; color: #15803d; font-weight: 700; text-align: right;">{{decision}} (Payment Pending)</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Approved By</td>
          <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">{{decision_by}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Approved Date (Phoenix)</td>
          <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">{{decision_at}}</td>
        </tr>
      </table>
      <div style="margin-top: 18px; padding: 14px; background-color: #f8fafc; border-left: 4px solid #15803d; border-radius: 4px; font-size: 13px;">
        <strong style="color: #15803d;">Manager Note:</strong>
        <p style="margin: 6px 0 0 0; color: #0f172a;">{{approval_message}}</p>
      </div>
      {{#if_admin}}
      <div style="text-align: center; margin-top: 24px;">
        <a href="{{admin_review_url}}" style="color: #A559BD; font-size: 13px; text-decoration: underline; font-weight: 600;">View Request in Discount Forklift Ledger</a>
      </div>
      {{/if_admin}}
    </div>
    <div style="padding: 14px 24px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center;">
      Discount Forklift Phoenix · Sales Office Spiff Tracking System
    </div>
  </div>
</div>`,
  },

  spiff_denied: {
    id: 'spiff_denied',
    name: 'Spiff Denied Result',
    description: 'Sent to the submitting sales rep and selected managers when a spiff is denied. Must include the explicit denial reason.',
    subject: 'Spiff Request [{{request_id}}] Denied - {{rep_name}} ({{spiff_amount}})',
    bodyHtml: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
  <div style="background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; max-width: 600px; margin: 0 auto; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    <div style="background-color: #242424; padding: 22px 24px; color: #ffffff; border-bottom: 3px solid #dc2626;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 700;">Discount Forklift Spiff Notification</h1>
      <p style="margin: 4px 0 0 0; color: #f87171; font-size: 13px; font-weight: 600;">Request ID: {{request_id}}</p>
    </div>
    <div style="padding: 14px 24px; background-color: #fee2e2; color: #b91c1c; font-weight: 700; font-size: 15px; border-bottom: 1px solid #fecaca;">
      ✕ Status: Denied
    </div>
    <div style="padding: 24px;">
      <p style="margin: 0 0 16px 0; font-size: 14px; color: #334155; line-height: 1.5;">
        Your spiff claim has been reviewed and <strong>Denied</strong> by management. Please check the explanation below:
      </p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Sales Representative</td>
          <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">{{rep_name}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Forklift / Model</td>
          <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">{{lift_name}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Serial Suffix (Last 4)</td>
          <td style="padding: 10px 0; font-family: monospace; font-size: 15px; letter-spacing: 0.05em; color: #0f172a; font-weight: 700; text-align: right;">{{serial_suffix}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Spiff Program</td>
          <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">{{spiff_name}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Spiff Amount</td>
          <td style="padding: 10px 0; color: #64748b; font-size: 18px; font-weight: 700; text-align: right;">{{spiff_amount}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Decision</td>
          <td style="padding: 10px 0; color: #b91c1c; font-weight: 700; text-align: right;">{{decision}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Decided By</td>
          <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">{{decision_by}}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Decision Date (Phoenix)</td>
          <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">{{decision_at}}</td>
        </tr>
      </table>
      <div style="margin-top: 18px; padding: 14px; background-color: #fee2e2; border-left: 4px solid #b91c1c; border-radius: 4px; font-size: 13px;">
        <strong style="color: #991b1b;">Reason for Denial:</strong>
        <p style="margin: 6px 0 0 0; color: #7f1d1d; font-weight: 500;">{{denial_reason}}</p>
      </div>
      {{#if_admin}}
      <div style="text-align: center; margin-top: 24px;">
        <a href="{{admin_review_url}}" style="color: #A559BD; font-size: 13px; text-decoration: underline; font-weight: 600;">View Request in Discount Forklift Ledger</a>
      </div>
      {{/if_admin}}
    </div>
    <div style="padding: 14px 24px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center;">
      Discount Forklift Phoenix · Sales Office Spiff Tracking System
    </div>
  </div>
</div>`,
  },
};

export const SAMPLE_TEMPLATE_DATA: Record<string, string> = {
  request_id: 'SPF-2026-4821',
  rep_name: 'Jake Miller',
  lift_name: 'Toyota 8FGU25 Pneumatic Forklift',
  serial_suffix: '4821',
  spiff_name: 'Heavy Duty Lift Spiff',
  spiff_amount: '$150.00',
  sale_date: '10/08/2026',
  submitted_at: '10/08/2026 09:30 AM MST',
  decision: 'Approved',
  decision_at: '10/08/2026 10:15 AM MST',
  decision_by: 'Caleb Vance',
  denial_reason: 'Sale invoice photo serial tag did not match equipment suffix.',
  approval_message: 'Approved for regular payroll spiff batch distribution.',
  admin_review_url: 'https://ais-dev-cxp4g2dragrwml6itk2qg6-123396949222.us-east1.run.app/admin?request=SPF-2026-4821',
};

/**
 * HTML Escape user strings to prevent script injection
 */
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Validate that template placeholders are supported and necessary requirements are met
 */

export function validateTemplateContent(
  templateId: string,
  subject: string,
  bodyHtml: string
): { isValid: boolean; error?: string } {
  if (!subject || !subject.trim()) {
    return { isValid: false, error: 'Email subject cannot be empty.' };
  }
  if (!bodyHtml || !bodyHtml.trim()) {
    return { isValid: false, error: 'Email message body cannot be empty.' };
  }

  // 1. Check for executable or unsafe HTML content
  const hasEventHandlers = /[\s/"']on[a-z]+\s*=/i.test(bodyHtml);
  const hasScripts = /<script\b/i.test(bodyHtml);
  const hasJavascriptUrl = /javascript\s*:/i.test(bodyHtml);
  if (hasEventHandlers || hasScripts || hasJavascriptUrl) {
    return {
      isValid: false,
      error: 'Unsafe HTML detected: script tags, inline event handlers (e.g. onerror), and javascript: links are not permitted.',
    };
  }

  // 2. Validate conditional block nesting and balance
  const adminOpenCount = (bodyHtml.match(/\{\{#if_admin\}\}/g) || []).length;
  const adminCloseCount = (bodyHtml.match(/\{\{\/if_admin\}\}/g) || []).length;
  if (adminOpenCount !== adminCloseCount) {
    return { isValid: false, error: 'Malformed conditional block: {{#if_admin}} and {{/if_admin}} tags are unmatched.' };
  }

  const notesOpenCount = (bodyHtml.match(/\{\{#if_notes\}\}/g) || []).length;
  const notesCloseCount = (bodyHtml.match(/\{\{\/if_notes\}\}/g) || []).length;
  if (notesOpenCount !== notesCloseCount) {
    return { isValid: false, error: 'Malformed conditional block: {{#if_notes}} and {{/if_notes}} tags are unmatched.' };
  }

  // 3. Find all {{...}} tokens
  const combined = `${subject} ${bodyHtml}`;
  const matches = combined.match(/\{\{([^{}]+)\}\}/g) || [];

  const allowedBaseKeys = new Set([
    ...SUPPORTED_PLACEHOLDERS.map((p) => p.key),
    '#if_admin',
    '/if_admin',
    '#if_notes',
    '/if_notes',
  ]);

  for (const match of matches) {
    const key = match.replace(/[{}]/g, '').trim();
    if (!allowedBaseKeys.has(key)) {
      return {
        isValid: false,
        error: `Unknown or unsupported placeholder "${match}". Supported placeholders: ${SUPPORTED_PLACEHOLDERS.map((p) => `{{${p.key}}}`).join(', ')}`,
      };
    }

    // Placeholder applicability check by template type
    const def = SUPPORTED_PLACEHOLDERS.find((p) => p.key === key);
    if (def && !def.applicableTemplates.includes(templateId)) {
      if (key === 'denial_reason') {
        return {
          isValid: false,
          error: `The {{denial_reason}} placeholder is only applicable to the Denial template and cannot be used in ${templateId}.`,
        };
      }
      if (key === 'approval_message') {
        return {
          isValid: false,
          error: `The {{approval_message}} placeholder is only applicable to the Approval template and cannot be used in ${templateId}.`,
        };
      }
      return {
        isValid: false,
        error: `Placeholder {{${key}}} is not permitted in the ${templateId} template.`,
      };
    }
  }

  // 4. Ensure administrator review links are contained inside an admin conditional block
  const adminUrlIndex = bodyHtml.indexOf('{{admin_review_url}}');
  if (adminUrlIndex !== -1) {
    // Check if within {{#if_admin}} ... {{/if_admin}}
    const textBefore = bodyHtml.substring(0, adminUrlIndex);
    const lastAdminOpen = textBefore.lastIndexOf('{{#if_admin}}');
    const lastAdminClose = textBefore.lastIndexOf('{{/if_admin}}');
    if (lastAdminOpen === -1 || lastAdminOpen < lastAdminClose) {
      return {
        isValid: false,
        error: 'Administrator review link {{admin_review_url}} must be enclosed within an {{#if_admin}}...{{/if_admin}} conditional block so non-admins never receive manager links.',
      };
    }
  }

  // 5. Template specific checks
  if (templateId === 'spiff_denied' && !combined.includes('{{denial_reason}}')) {
    return {
      isValid: false,
      error: 'Spiff Denied template must include the {{denial_reason}} placeholder to explain the outcome.',
    };
  }

  return { isValid: true };
}

/**
 * Render email subject and body with data and conditional admin section.
 * Renders fixed status and payment wording outside the editable body:
 * - Approval: "Approved — awaiting payment."
 * - Denial: "Denied," followed by recorded denial reason.
 */
export function renderEmailTemplate(
  template: { id?: string; subject: string; bodyHtml: string },
  data: Record<string, any>,
  recipientIsAdmin: boolean
): { subject: string; bodyHtml: string } {
  let renderedSubject = template.subject;
  let rawBody = template.bodyHtml;

  // 1. Process conditional admin blocks: {{#if_admin}} ... {{/if_admin}}
  if (recipientIsAdmin) {
    rawBody = rawBody.replace(/\{\{#if_admin\}\}/g, '').replace(/\{\{\/if_admin\}\}/g, '');
  } else {
    rawBody = rawBody.replace(/\{\{#if_admin\}\}[\s\S]*?\{\{\/if_admin\}\}/g, '');
    // Belt-and-suspenders: ensure no admin_review_url leaks if placed outside
    rawBody = rawBody.replace(/\{\{admin_review_url\}\}/g, '');
  }

  // 2. Process conditional notes block if applicable
  const hasNotes = Boolean(data.notes && String(data.notes).trim());
  if (hasNotes) {
    rawBody = rawBody.replace(/\{\{#if_notes\}\}/g, '').replace(/\{\{\/if_notes\}\}/g, '');
  } else {
    rawBody = rawBody.replace(/\{\{#if_notes\}\}[\s\S]*?\{\{\/if_notes\}\}/g, '');
  }

  // 3. Substitute placeholders safely
  for (const placeholder of SUPPORTED_PLACEHOLDERS) {
    const token = new RegExp(`\\{\\{${placeholder.key}\\}\\}`, 'g');
    const rawVal = data[placeholder.key];
    const safeVal = rawVal !== undefined && rawVal !== null ? escapeHtml(String(rawVal)) : '';

    renderedSubject = renderedSubject.replace(token, rawVal !== undefined && rawVal !== null ? String(rawVal) : '');
    rawBody = rawBody.replace(token, safeVal);
  }

  // 4. Fixed Status & Payment Wording Section (Rendered outside the editable body)
  let fixedStatusBanner = '';
  const templateId = template.id || (renderedSubject.toLowerCase().includes('approved') ? 'spiff_approved' : renderedSubject.toLowerCase().includes('denied') ? 'spiff_denied' : '');

  if (templateId === 'spiff_approved') {
    fixedStatusBanner = `
      <div style="background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 12px 16px; margin: 16px 0; color: #166534; font-family: sans-serif; font-size: 14px; line-height: 1.5;">
        <strong style="color: #14532d;">Official Status:</strong> Approved — awaiting payment.
        <div style="font-size: 12px; color: #15803d; margin-top: 3px;">
          Note: This request has been approved and is queued for corporate payroll spiff disbursement. Payment has not yet been finalized.
        </div>
      </div>
    `;
  } else if (templateId === 'spiff_denied') {
    const reasonText = data.denial_reason ? escapeHtml(String(data.denial_reason)) : 'Decision recorded by reviewer.';
    fixedStatusBanner = `
      <div style="background-color: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; padding: 12px 16px; margin: 16px 0; color: #991b1b; font-family: sans-serif; font-size: 14px; line-height: 1.5;">
        <strong style="color: #7f1d1d;">Official Status:</strong> Denied
        <div style="font-size: 13px; color: #b91c1c; margin-top: 4px;">
          <strong>Recorded Denial Reason:</strong> ${reasonText}
        </div>
      </div>
    `;
  }

  // Insert fixed status banner right after the main content box or at the top of the body
  let finalBodyHtml = rawBody;
  if (fixedStatusBanner) {
    if (finalBodyHtml.includes('<!-- STATUS_BANNER_SLOT -->')) {
      finalBodyHtml = finalBodyHtml.replace('<!-- STATUS_BANNER_SLOT -->', fixedStatusBanner);
    } else {
      // Prepend right after opening body or table
      finalBodyHtml = fixedStatusBanner + finalBodyHtml;
    }
  }

  // 5. Sanitize final HTML to ensure strict safety
  finalBodyHtml = sanitizeEmailHtml(finalBodyHtml);

  return {
    subject: renderedSubject,
    bodyHtml: finalBodyHtml,
  };
}
