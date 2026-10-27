import { randomUUID } from 'node:crypto';
import { isBlockedNotificationRecipient } from './recipientPolicy.js';
import { formatDollars } from './formatters.js';
import { formatPhoenixDateTime, TIMEZONE } from './timezone.js';
import type { WeeklySpiffReportSubmission } from './repository.js';

export interface PhoenixWeek {
  weekStart: string;
  startUtc: Date;
  endExclusiveUtc: Date;
  weekEnd: string;
}

export interface WeeklySpiffReportEmail {
  to: string[];
  subject: string;
  html: string;
  csv: string;
  filename: string;
  idempotencyKey: string;
}

export interface WeeklySpiffReportContent {
  week: PhoenixWeek;
  subject: string;
  html: string;
  csv: string;
  filename: string;
  submissionCount: number;
}

export interface WeeklySpiffReportDependencies {
  getAccountingRecipients(): Promise<string[]>;
  getSubmissions(startUtc: Date, endExclusiveUtc: Date): Promise<WeeklySpiffReportSubmission[]>;
  claimWeek(weekStart: string): Promise<boolean>;
  finishWeek(
    weekStart: string,
    result: { status: 'sent' | 'failed'; providerMessageId?: string; errorMessage?: string }
  ): Promise<void>;
  sendEmail(
    email: WeeklySpiffReportEmail
  ): Promise<{
    success: boolean;
    acceptedByProvider?: boolean;
    providerMessageId?: string;
    error?: string;
  }>;
  logError(message: string): void;
  logInfo(message: string): void;
}

function getPhoenixDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getPreviousPhoenixWeek(now: Date): PhoenixWeek {
  if (!Number.isFinite(now.getTime())) {
    throw new Error('A valid current date is required to calculate the weekly report period.');
  }

  const { year, month, day } = getPhoenixDateParts(now);
  const localMidnightUtc = Date.UTC(year, month - 1, day);
  const weekday = new Date(localMidnightUtc).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const currentWeekStartUtc = new Date(
    localMidnightUtc - daysSinceMonday * 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000
  );
  const startUtc = new Date(currentWeekStartUtc.getTime() - 7 * 24 * 60 * 60 * 1000);
  const endExclusiveUtc = currentWeekStartUtc;

  return {
    weekStart: formatDateKey(new Date(startUtc.getTime() + 7 * 60 * 60 * 1000)),
    startUtc,
    endExclusiveUtc,
    weekEnd: formatDateKey(new Date(endExclusiveUtc.getTime() - 17 * 60 * 60 * 1000)),
  };
}

const CSV_HEADERS = [
  'Request ID',
  'Submission Date (Phoenix)',
  'Branch',
  'Rep',
  'Lift Name',
  'Serial Suffix',
  'Spiff Type',
  'Spiff Amount',
  'Half Spiff Amount',
  'Notes',
  'Status',
  'Approval Date',
  'Approved By',
  'Approval Details',
  'Denial Date',
  'Denied By',
  'Denial Details',
  'Paid Date',
  'Photo Count',
];

function reportStatus(status: string): string {
  return status === 'Rejected' ? 'Denied' : status;
}

function protectSpreadsheetFormula(value: string): string {
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string | number | null | undefined): string {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${protectSpreadsheetFormula(normalized).replace(/"/g, '""')}"`;
}

function phoenixDate(value: string | null): string {
  return value ? formatPhoenixDateTime(value) : '';
}

export function buildWeeklySpiffReportCsv(submissions: WeeklySpiffReportSubmission[]): string {
  const rows = submissions.map((submission) => [
    submission.id,
    formatPhoenixDateTime(submission.submittedAt),
    submission.branchName,
    submission.repName,
    submission.liftName,
    submission.serialSuffix,
    submission.spiffName,
    formatDollars(submission.amountCents),
    submission.isHalfSpiffAmount ? 'Yes' : 'No',
    submission.notes,
    reportStatus(submission.status),
    phoenixDate(submission.approvedAt),
    submission.approvedBy,
    submission.approvalDetails,
    phoenixDate(submission.rejectedAt),
    submission.rejectedBy,
    submission.rejectionReason,
    phoenixDate(submission.paidAt),
    submission.photoCount,
  ]);

  return [CSV_HEADERS, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

function buildSummaryHtml(week: PhoenixWeek, submissions: WeeklySpiffReportSubmission[]): string {
  const counts = new Map<string, number>();
  for (const submission of submissions) {
    const status = reportStatus(submission.status);
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  const statusSummary =
    [...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([status, count]) => `${escapeHtml(status)}: ${count}`)
      .join(' &middot; ') || 'No submissions';

  return `<p>Weekly Spiff submission report for ${escapeHtml(week.weekStart)} through ${escapeHtml(week.weekEnd)} (America/Phoenix).</p><p><strong>${submissions.length}</strong> total submission${submissions.length === 1 ? '' : 's'}: ${statusSummary}.</p><p>The attached CSV includes each request’s current status and available approval, denial, payment, and photo details.</p>`;
}

export function buildWeeklySpiffReportContent(
  now: Date,
  submissions: WeeklySpiffReportSubmission[],
  subjectPrefix = ''
): WeeklySpiffReportContent {
  const week = getPreviousPhoenixWeek(now);
  return {
    week,
    subject: `${subjectPrefix}Weekly Spiff Submission Report - ${week.weekStart} to ${week.weekEnd}`,
    html: buildSummaryHtml(week, submissions),
    csv: buildWeeklySpiffReportCsv(submissions),
    filename: `weekly-spiff-submissions-${week.weekStart}.csv`,
    submissionCount: submissions.length,
  };
}

export interface WeeklySpiffReportTestDependencies {
  getAccountingAddresses(): Promise<string[]>;
  getSubmissions(startUtc: Date, endExclusiveUtc: Date): Promise<WeeklySpiffReportSubmission[]>;
  createTestSend(input: {
    id: string;
    weekStart: string;
    adminEmail: string;
    recipientEmail: string;
  }): Promise<void>;
  finishTestSend(
    id: string,
    result: { status: 'sent' | 'failed'; providerMessageId?: string; errorMessage?: string }
  ): Promise<void>;
  sendEmail(
    email: WeeklySpiffReportEmail
  ): Promise<{
    success: boolean;
    acceptedByProvider?: boolean;
    providerMessageId?: string;
    error?: string;
  }>;
}

export class WeeklySpiffReportTestInputError extends Error {}

export async function runWeeklySpiffReportTest(
  now: Date,
  adminEmail: string,
  testEmail: string,
  dependencies: WeeklySpiffReportTestDependencies
): Promise<{
  status: 'sent' | 'failed';
  week: PhoenixWeek;
  submissionCount: number;
  providerMessageId?: string;
  error?: string;
}> {
  const recipient = testEmail.trim().toLowerCase();
  if (recipient.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new WeeklySpiffReportTestInputError('Enter a valid test recipient email address.');
  }
  if (isBlockedNotificationRecipient(recipient)) {
    throw new WeeklySpiffReportTestInputError('This address is not eligible for email delivery.');
  }

  const accountingAddresses = (await dependencies.getAccountingAddresses())
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (accountingAddresses.includes(recipient)) {
    throw new WeeklySpiffReportTestInputError('The test recipient cannot be an Accounting contact.');
  }

  const week = getPreviousPhoenixWeek(now);
  const submissions = await dependencies.getSubmissions(week.startUtc, week.endExclusiveUtc);
  const content = buildWeeklySpiffReportContent(now, submissions, 'TEST: ');
  const id = `weekly-test-${randomUUID()}`;
  await dependencies.createTestSend({
    id,
    weekStart: week.weekStart,
    adminEmail: adminEmail.trim().toLowerCase(),
    recipientEmail: recipient,
  });

  let result: Awaited<ReturnType<WeeklySpiffReportTestDependencies['sendEmail']>>;
  try {
    result = await dependencies.sendEmail({
      to: [recipient],
      subject: content.subject,
      html: content.html,
      csv: content.csv,
      filename: content.filename,
      idempotencyKey: id,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await dependencies.finishTestSend(id, { status: 'failed', errorMessage });
    throw error;
  }

  const acceptedByProvider = result.acceptedByProvider ?? result.success;
  if (acceptedByProvider) {
    await dependencies.finishTestSend(id, {
      status: 'sent',
      providerMessageId: result.providerMessageId,
      ...(result.error ? { errorMessage: result.error } : {}),
    });
    return {
      status: 'sent',
      week,
      submissionCount: submissions.length,
      providerMessageId: result.providerMessageId,
      ...(result.error ? { error: result.error } : {}),
    };
  }

  const error = result.error || 'Email provider did not accept the test report.';
  await dependencies.finishTestSend(id, { status: 'failed', errorMessage: error });
  return { status: 'failed', week, submissionCount: submissions.length, error };
}

export async function runWeeklySpiffReport(
  now: Date,
  dependencies: WeeklySpiffReportDependencies
): Promise<{ status: 'sent' | 'failed' | 'duplicate' | 'skipped'; week: PhoenixWeek; submissionCount?: number }> {
  const week = getPreviousPhoenixWeek(now);
  const recipients = [...new Set(
    (await dependencies.getAccountingRecipients())
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email && !isBlockedNotificationRecipient(email))
  )];

  if (recipients.length === 0) {
    dependencies.logError(
      `[WeeklySpiffReport] No active Accounting recipients are configured for week ${week.weekStart}; report was not sent.`
    );
    return { status: 'skipped', week };
  }

  if (!(await dependencies.claimWeek(week.weekStart))) {
    dependencies.logInfo(
      `[WeeklySpiffReport] Report for week ${week.weekStart} is already processing or was sent; skipping duplicate.`
    );
    return { status: 'duplicate', week };
  }

  let submissions: WeeklySpiffReportSubmission[];
  let email: WeeklySpiffReportEmail;
  try {
    submissions = await dependencies.getSubmissions(week.startUtc, week.endExclusiveUtc);
    const content = buildWeeklySpiffReportContent(now, submissions);
    email = {
      to: recipients,
      subject: content.subject,
      html: content.html,
      csv: content.csv,
      filename: content.filename,
      idempotencyKey: `weekly-spiff-report-${week.weekStart}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await dependencies.finishWeek(week.weekStart, { status: 'failed', errorMessage });
    throw error;
  }

  const result = await dependencies.sendEmail(email);
  const acceptedByProvider = result.acceptedByProvider ?? result.success;

  if (acceptedByProvider) {
    await dependencies.finishWeek(week.weekStart, {
      status: 'sent',
      providerMessageId: result.providerMessageId,
      ...(result.error ? { errorMessage: result.error } : {}),
    });
    if (!result.success) {
      dependencies.logError(
        `[WeeklySpiffReport] Provider accepted the report for ${week.weekStart} for at least one recipient but reported an incomplete recipient result; it will not be resent. ${result.error || ''}`
      );
    } else {
      dependencies.logInfo(
        `[WeeklySpiffReport] Provider accepted the report for ${week.weekStart} (${submissions.length} submissions).`
      );
    }
    return { status: 'sent', week, submissionCount: submissions.length };
  }

  const errorMessage = result.error || 'Email provider did not accept the weekly report.';
  await dependencies.finishWeek(week.weekStart, { status: 'failed', errorMessage });
  dependencies.logError(
    `[WeeklySpiffReport] Delivery failed for week ${week.weekStart}: ${errorMessage}`
  );
  return { status: 'failed', week, submissionCount: submissions.length };
}
