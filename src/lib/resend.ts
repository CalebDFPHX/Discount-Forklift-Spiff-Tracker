import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import { isBlockedNotificationRecipient } from './recipientPolicy.js';

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || 'notifications@discountforkliftphoenix.com';
const gmailUser = process.env.GMAIL_USER?.trim();
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '');
export const hasGmailConfiguration = Boolean(gmailUser || gmailAppPassword);

export const isResendConfigured = Boolean(resendApiKey && resendApiKey.startsWith('re_'));
export const isGmailConfigured = Boolean(gmailUser && gmailAppPassword);
export const isEmailConfigured =
  isGmailConfigured || (!hasGmailConfiguration && isResendConfigured);
export const emailProvider = isGmailConfigured
  ? 'gmail'
  : !hasGmailConfiguration && isResendConfigured
    ? 'resend'
    : null;

export const resend = isResendConfigured && resendApiKey ? new Resend(resendApiKey) : null;

export function inspectSmtpRecipientAcceptance(
  recipient: string,
  accepted: Array<string | { address: string }>,
  rejected: Array<string | { address: string }>
): {
  acceptedRecipients: string[];
  rejectedRecipients: string[];
  providerResponse: string;
  error?: string;
} {
  const normalizeAddresses = (addresses: Array<string | { address: string }>) =>
    addresses.map((address) =>
      (typeof address === 'string' ? address : address.address).trim().toLowerCase()
    );
  const acceptedRecipients = normalizeAddresses(accepted);
  const rejectedRecipients = normalizeAddresses(rejected);
  const target = recipient.trim().toLowerCase();
  const targetAccepted = acceptedRecipients.includes(target);
  const targetRejected = rejectedRecipients.includes(target);

  return {
    acceptedRecipients,
    rejectedRecipients,
    providerResponse: JSON.stringify({
      provider: 'gmail_smtp',
      accepted: acceptedRecipients,
      rejected: rejectedRecipients,
    }),
    ...(targetAccepted && !targetRejected
      ? {}
      : {
          error: `Gmail SMTP did not accept ${target}. Accepted recipients: ${
            acceptedRecipients.join(', ') || 'none'
          }. Rejected recipients: ${rejectedRecipients.join(', ') || 'none'}.`,
        }),
  };
}

function getSmtpErrorRecipientLists(
  error: unknown
): { accepted: Array<string | { address: string }>; rejected: Array<string | { address: string }> } | null {
  if (typeof error !== 'object' || error === null) return null;
  const details = error as { accepted?: unknown; rejected?: unknown };
  if (!Array.isArray(details.accepted) || !Array.isArray(details.rejected)) return null;
  return { accepted: details.accepted, rejected: details.rejected };
}

export function sanitizeEmailProviderError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [
    process.env.AUTH_SECRET,
    process.env.NEXTAUTH_SECRET,
    gmailAppPassword,
    resendApiKey,
  ]) {
    if (secret) message = message.split(secret).join('[redacted]');
  }
  message = message.replace(
    /([A-Za-z0-9_-]{20,}\.){1,2}[A-Za-z0-9_-]{20,}/g,
    '[redacted action token]'
  );
  if (/535|534|authentication|credentials|invalid login/i.test(message)) {
    return 'Gmail SMTP authentication failed. Check GMAIL_USER and GMAIL_APP_PASSWORD in the deployment environment.';
  }
  if (/ETIMEDOUT|ECONNECTION|ENOTFOUND|ESOCKET|timeout/i.test(message)) {
    return 'Could not connect to the email provider. Check the deployment network and email settings.';
  }
  return message.slice(0, 500);
}

async function deliverEmail(params: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
}): Promise<{
  success: boolean;
  status: 'delivered' | 'accepted' | 'failed';
  providerMessageId?: string;
  providerResponse?: string;
  error?: string;
}> {
  try {
    if (isGmailConfigured && gmailUser && gmailAppPassword) {
      const transport = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user: gmailUser,
          pass: gmailAppPassword,
        },
      });
      const result = await transport.sendMail({
        from: gmailUser,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
      const recipientResult = inspectSmtpRecipientAcceptance(
        params.to,
        result.accepted,
        result.rejected
      );

      return {
        success: !recipientResult.error,
        status: recipientResult.error ? 'failed' : 'accepted',
        providerMessageId: result.messageId,
        providerResponse: recipientResult.providerResponse,
        error: recipientResult.error,
      };
    }

    if (!resend || !isResendConfigured) {
      return {
        success: false,
        status: 'failed',
        error: hasGmailConfiguration
          ? 'GMAIL_USER and GMAIL_APP_PASSWORD must both be configured.'
          : 'Email delivery is not configured.',
      };
    }

    const headers: Record<string, string> = {};
    if (params.idempotencyKey) {
      headers['Idempotency-Key'] = params.idempotencyKey;
    }

    const response = await resend.emails.send(
      {
        from: fromEmail,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      },
      Object.keys(headers).length > 0 ? { headers } : undefined
    );

    if (response.error) {
      const message = sanitizeEmailProviderError(
        response.error.message || 'Resend provider error'
      );
      console.error(`[Email] Resend provider error: ${message}`);
      return {
        success: false,
        status: 'failed',
        error: message,
      };
    }

    return {
      success: true,
      status: 'accepted',
      providerMessageId: response.data?.id,
    };
  } catch (error: unknown) {
    const smtpRecipients = getSmtpErrorRecipientLists(error);
    if (smtpRecipients) {
      const recipientResult = inspectSmtpRecipientAcceptance(
        params.to,
        smtpRecipients.accepted,
        smtpRecipients.rejected
      );
      const message =
        recipientResult.error || sanitizeEmailProviderError(error);
      console.error(`[Email] ${emailProvider || 'Provider'} delivery failed: ${message}`);
      return {
        success: false,
        status: 'failed',
        providerResponse: recipientResult.providerResponse,
        error: message,
      };
    }
    const message = sanitizeEmailProviderError(error);
    console.error(`[Email] ${emailProvider || 'Provider'} delivery failed: ${message}`);
    return {
      success: false,
      status: 'failed',
      error: message,
    };
  }
}

export interface SpiffNotificationPayload {
  requestId: string;
  repName: string;
  liftName: string;
  serialSuffix: string;
  spiffName: string;
  amountFormatted: string;
  saleDate: string;
  submittedAtPhoenix: string;
  hasPhoto: boolean;
  notes?: string | null;
  photoViewUrl?: string;
  adminReviewUrl: string;
  recipientEmail: string;
}

export interface SpiffDecisionEmailPayload {
  requestId: string;
  repName: string;
  repEmail?: string;
  liftName: string;
  serialSuffix: string;
  spiffName: string;
  amountFormatted: string;
  saleDate: string;
  decision: 'Approved' | 'Denied';
  decisionBy: string;
  decidedAtPhoenix: string;
  messageOrReason?: string | null;
  recipients: Array<{ email: string; name: string; role: string }>;
  adminReviewUrl: string;
}

export async function sendSpiffSubmissionEmail(payload: SpiffNotificationPayload): Promise<{
  success: boolean;
  status: 'delivered' | 'accepted' | 'failed' | 'simulated';
  providerMessageId?: string;
  error?: string;
}> {
  if (isBlockedNotificationRecipient(payload.recipientEmail)) {
    return {
      success: false,
      status: 'failed',
      error: 'This recipient address is not eligible for notifications.',
    };
  }

  if (!isEmailConfigured) {
    if (hasGmailConfiguration) {
      return {
        success: false,
        status: 'failed',
        error: 'GMAIL_USER and GMAIL_APP_PASSWORD must both be configured.',
      };
    }
    console.warn('[Resend] RESEND_API_KEY not configured. Simulating submission notification delivery.');
    return {
      success: true,
      status: 'simulated',
      providerMessageId: `sim_${Date.now()}`,
    };
  }

  const subject = `New Spiff Request [${payload.requestId}] - ${payload.repName} (${payload.amountFormatted})`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .card { background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; max-width: 600px; margin: 0 auto; overflow: hidden; }
    .header { background-color: #0f172a; padding: 24px; color: #ffffff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .header p { margin: 4px 0 0 0; color: #94a3b8; font-size: 14px; }
    .body { padding: 24px; }
    .field-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
    .field-label { color: #64748b; font-weight: 500; }
    .field-value { color: #0f172a; font-weight: 600; text-align: right; }
    .amount-highlight { font-size: 18px; color: #ea580c; font-weight: 700; }
    .serial-mono { font-family: monospace; font-size: 15px; letter-spacing: 0.05em; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }
    .btn { display: inline-block; background-color: #ea580c; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; margin-top: 20px; }
    .footer { padding: 16px 24px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Discount Forklift Spiff Request</h1>
      <p>Request ID: ${payload.requestId}</p>
    </div>
    <div class="body">
      <div class="field-row">
        <span class="field-label">Sales Representative</span>
        <span class="field-value">${payload.repName}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Forklift / Model</span>
        <span class="field-value">${payload.liftName}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Serial Suffix (Last 4)</span>
        <span class="field-value serial-mono">${payload.serialSuffix}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Spiff Program</span>
        <span class="field-value">${payload.spiffName}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Spiff Cash Amount</span>
        <span class="field-value amount-highlight">${payload.amountFormatted}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Sale Date</span>
        <span class="field-value">${payload.saleDate}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Submitted At (Phoenix)</span>
        <span class="field-value">${payload.submittedAtPhoenix}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Sale Photo</span>
        <span class="field-value">${payload.hasPhoto ? 'Attached (Private)' : 'No Photo'}</span>
      </div>
      ${payload.notes ? `
      <div style="margin-top: 16px; padding: 12px; background-color: #f8fafc; border-radius: 6px; font-size: 13px;">
        <strong style="color: #475569;">Notes:</strong>
        <p style="margin: 4px 0 0 0; color: #1e293b;">${payload.notes}</p>
      </div>` : ''}

      <div style="text-align: center; margin-top: 24px;">
        <a href="${payload.adminReviewUrl}" class="btn">Log In to Review & Decide Request</a>
      </div>
    </div>
    <div class="footer">
      Discount Forklift Phoenix · Sales Office Spiff Tracking System
    </div>
  </div>
</body>
</html>
  `;

  return deliverEmail({
    to: payload.recipientEmail,
    subject,
    html,
  });
}

/**
 * Send automatic decision notification email (Approved or Denied) to all selected recipients
 */
export async function sendSpiffDecisionResultEmail(
  payload: SpiffDecisionEmailPayload,
  targetRecipient: { email: string; name: string; role: string }
): Promise<{
  success: boolean;
  status: 'delivered' | 'accepted' | 'failed' | 'simulated';
  providerMessageId?: string;
  error?: string;
}> {
  if (isBlockedNotificationRecipient(targetRecipient.email)) {
    return {
      success: false,
      status: 'failed',
      error: 'This recipient address is not eligible for notifications.',
    };
  }

  if (!isEmailConfigured) {
    if (hasGmailConfiguration) {
      return {
        success: false,
        status: 'failed',
        error: 'GMAIL_USER and GMAIL_APP_PASSWORD must both be configured.',
      };
    }
    console.warn(`[Resend] RESEND_API_KEY not configured. Simulating decision email delivery to ${targetRecipient.email}.`);
    return {
      success: true,
      status: 'simulated',
      providerMessageId: `sim_dec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    };
  }

  const isApproved = payload.decision === 'Approved';
  const decisionBadgeColor = isApproved ? '#15803d' : '#b91c1c';
  const decisionBadgeBg = isApproved ? '#dcfce7' : '#fee2e2';

  const subject = `Spiff Request [${payload.requestId}] ${payload.decision} - ${payload.repName} (${payload.amountFormatted})`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .card { background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; max-width: 600px; margin: 0 auto; overflow: hidden; }
    .header { background-color: #0f172a; padding: 24px; color: #ffffff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .header p { margin: 4px 0 0 0; color: #94a3b8; font-size: 14px; }
    .status-banner { padding: 14px 24px; background-color: ${decisionBadgeBg}; color: ${decisionBadgeColor}; font-weight: 700; font-size: 16px; border-bottom: 1px solid #e2e8f0; }
    .body { padding: 24px; }
    .field-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
    .field-label { color: #64748b; font-weight: 500; }
    .field-value { color: #0f172a; font-weight: 600; text-align: right; }
    .amount-highlight { font-size: 18px; color: #0f172a; font-weight: 700; }
    .serial-mono { font-family: monospace; font-size: 15px; letter-spacing: 0.05em; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }
    .message-box { margin-top: 18px; padding: 14px; background-color: #f8fafc; border-left: 4px solid ${decisionBadgeColor}; border-radius: 4px; font-size: 14px; }
    .recipients-box { margin-top: 18px; padding: 12px; background-color: #f1f5f9; border-radius: 6px; font-size: 12px; color: #475569; }
    .footer { padding: 16px 24px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Discount Forklift Spiff Notification</h1>
      <p>Request ID: ${payload.requestId}</p>
    </div>
    <div class="status-banner">
      Status: ${payload.decision.toUpperCase()}
    </div>
    <div class="body">
      <div class="field-row">
        <span class="field-label">Sales Representative</span>
        <span class="field-value">${payload.repName}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Forklift / Model</span>
        <span class="field-value">${payload.liftName}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Serial Suffix (Last 4)</span>
        <span class="field-value serial-mono">${payload.serialSuffix}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Spiff Program</span>
        <span class="field-value">${payload.spiffName}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Spiff Amount</span>
        <span class="field-value amount-highlight">${payload.amountFormatted}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Decision By</span>
        <span class="field-value">${payload.decisionBy}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Decision Date (Phoenix)</span>
        <span class="field-value">${payload.decidedAtPhoenix}</span>
      </div>

      ${payload.messageOrReason ? `
      <div class="message-box">
        <strong>${isApproved ? 'Manager Note:' : 'Reason for Denial:'}</strong>
        <p style="margin: 6px 0 0 0; color: #0f172a;">${payload.messageOrReason}</p>
      </div>` : ''}

      <div class="recipients-box">
        <strong>Notification delivered to:</strong>
        <ul style="margin: 4px 0 0 0; padding-left: 18px;">
          ${payload.recipients.map((r) => `<li>${r.name} (${r.role}) - ${r.email}</li>`).join('')}
        </ul>
      </div>

      <div style="text-align: center; margin-top: 24px;">
        <a href="${payload.adminReviewUrl}" style="color: #ea580c; font-size: 13px; text-decoration: underline;">
          View Request in Discount Forklift Ledger
        </a>
      </div>
    </div>
    <div class="footer">
      Discount Forklift Phoenix · Sales Office Spiff Tracking System
    </div>
  </div>
</body>
</html>
  `;

  return deliverEmail({
    to: targetRecipient.email,
    subject,
    html,
  });
}

/**
 * Send an email rendered from an editable template with provider-level idempotency key support.
 */
export async function sendRenderedEmail(params: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
}): Promise<{
  success: boolean;
  status: 'delivered' | 'accepted' | 'failed';
  providerMessageId?: string;
  providerResponse?: string;
  error?: string;
}> {
  if (isBlockedNotificationRecipient(params.to)) {
    return {
      success: false,
      status: 'failed',
      error: 'This recipient address is not eligible for notifications.',
    };
  }

  if (!isEmailConfigured) {
    const errorMsg = hasGmailConfiguration
      ? 'GMAIL_USER and GMAIL_APP_PASSWORD must both be configured.'
      : 'Email delivery unavailable: configure Gmail SMTP or Resend environment variables.';
    console.warn(`[Email] ${errorMsg}`);
    return {
      success: false,
      status: 'failed',
      error: errorMsg,
    };
  }

  return deliverEmail(params);
}
