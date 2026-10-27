import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildWeeklySpiffReportCsv,
  getPreviousPhoenixWeek,
  runWeeklySpiffReport,
  runWeeklySpiffReportTest,
  type WeeklySpiffReportDependencies,
} from '../src/lib/weeklySpiffReport.js';
import type { WeeklySpiffReportSubmission } from '../src/lib/repository.js';
import { BLOCKED_NOTIFICATION_RECIPIENT_EMAILS } from '../src/lib/recipientPolicy.js';

const fixture: WeeklySpiffReportSubmission = {
  id: 'SPF-2026-TEST01',
  submittedAt: '2026-10-19T07:00:00.000Z',
  branchName: 'Phoenix, Main',
  repName: 'Test Rep',
  liftName: 'Forklift "Model X"',
  serialSuffix: '0042',
  spiffName: 'Quick Sale',
  amountCents: 5000,
  isHalfSpiffAmount: true,
  notes: 'Paid, after review',
  status: 'Rejected',
  approvedAt: '2026-10-20T15:00:00.000Z',
  approvedBy: 'Accounting Manager',
  approvalDetails: 'Approved detail',
  rejectedAt: '2026-10-21T15:00:00.000Z',
  rejectedBy: 'Sales Manager',
  rejectionReason: 'Missing documentation',
  paidAt: '2026-10-22T15:00:00.000Z',
  photoCount: 2,
};

function createDependencies(
  overrides: Partial<WeeklySpiffReportDependencies> = {}
): WeeklySpiffReportDependencies {
  return {
    getAccountingRecipients: async () => ['accounting@example.test'],
    getSubmissions: async () => [fixture],
    claimWeek: async () => true,
    finishWeek: async () => {},
    sendEmail: async () => ({ success: true, acceptedByProvider: true, providerMessageId: 'msg-1' }),
    logError: () => {},
    logInfo: () => {},
    ...overrides,
  };
}

describe('weekly Spiff report', () => {
  it('uses Monday midnight Phoenix boundaries and the previous calendar week', () => {
    const beforeMondayMidnight = getPreviousPhoenixWeek(new Date('2026-10-26T06:59:59.000Z'));
    assert.equal(beforeMondayMidnight.weekStart, '2026-10-12');
    assert.equal(beforeMondayMidnight.startUtc.toISOString(), '2026-10-12T07:00:00.000Z');
    assert.equal(beforeMondayMidnight.endExclusiveUtc.toISOString(), '2026-10-19T07:00:00.000Z');

    const atMondayMidnight = getPreviousPhoenixWeek(new Date('2026-10-26T07:00:00.000Z'));
    assert.equal(atMondayMidnight.weekStart, '2026-10-19');
    assert.equal(atMondayMidnight.startUtc.toISOString(), '2026-10-19T07:00:00.000Z');
    assert.equal(atMondayMidnight.endExclusiveUtc.toISOString(), '2026-10-26T07:00:00.000Z');
    assert.equal(getPreviousPhoenixWeek(new Date('2026-10-26T15:00:00.000Z')).weekStart, '2026-10-19');
  });

  it('formats report dates in Phoenix time and includes submission fields and current statuses in CSV', () => {
    const csv = buildWeeklySpiffReportCsv([fixture]);
    assert.match(csv, /Request ID/);
    assert.match(csv, /SPF-2026-TEST01/);
    assert.match(csv, /Oct 19, 2026, 12:00 AM/);
    assert.match(csv, /"Phoenix, Main"/);
    assert.match(csv, /"Forklift ""Model X"""/);
    assert.match(csv, /"Denied"/);
    assert.match(csv, /"Spiff Amount"/);
    assert.match(csv, /"\$50\.00"/);
    assert.match(csv, /"Half Spiff Amount"/);
    assert.match(csv, /"Yes"/);
    assert.match(csv, /Accounting Manager/);
    assert.match(csv, /Missing documentation/);
    assert.match(csv, /"2"/);
    assert.match(csv, /"Paid, after review"/);
  });

  it('does not send or claim a report without active non-placeholder Accounting recipients', async () => {
    let claimed = false;
    let sent = false;
    const loggedErrors: string[] = [];
    const result = await runWeeklySpiffReport(
      new Date('2026-10-26T15:00:00.000Z'),
      createDependencies({
        getAccountingRecipients: async () => [BLOCKED_NOTIFICATION_RECIPIENT_EMAILS[0]],
        claimWeek: async () => {
          claimed = true;
          return true;
        },
        sendEmail: async () => {
          sent = true;
          return { success: true };
        },
        logError: (message) => loggedErrors.push(message),
      })
    );

    assert.equal(result.status, 'skipped');
    assert.equal(claimed, false);
    assert.equal(sent, false);
    assert.match(loggedErrors[0], /No active Accounting recipients/);
  });

  it('records failed delivery without reporting success', async () => {
    let recorded: Parameters<WeeklySpiffReportDependencies['finishWeek']>[1] | undefined;
    const result = await runWeeklySpiffReport(
      new Date('2026-10-26T15:00:00.000Z'),
      createDependencies({
        sendEmail: async () => ({ success: false, error: 'Provider rejected the message.' }),
        finishWeek: async (_week, reportResult) => {
          recorded = reportResult;
        },
      })
    );

    assert.equal(result.status, 'failed');
    assert.deepEqual(recorded, {
      status: 'failed',
      errorMessage: 'Provider rejected the message.',
    });
  });

  it('sends all returned statuses with the report CSV and provider idempotency key', async () => {
    const pending = { ...fixture, id: 'SPF-2026-TEST02', status: 'Pending' };
    let email: Parameters<WeeklySpiffReportDependencies['sendEmail']>[0] | undefined;
    let queryBounds: { start: Date; end: Date } | undefined;
    const result = await runWeeklySpiffReport(
      new Date('2026-10-26T15:00:00.000Z'),
      createDependencies({
        getSubmissions: async (start, end) => {
          queryBounds = { start, end };
          return [fixture, pending];
        },
        sendEmail: async (report) => {
          email = report;
          return { success: true, acceptedByProvider: true };
        },
      })
    );

    assert.equal(result.status, 'sent');
    assert.equal(result.submissionCount, 2);
    assert.equal(queryBounds?.start.toISOString(), '2026-10-19T07:00:00.000Z');
    assert.equal(queryBounds?.end.toISOString(), '2026-10-26T07:00:00.000Z');
    assert.deepEqual(email?.to, ['accounting@example.test']);
    assert.equal(email?.filename, 'weekly-spiff-submissions-2026-10-19.csv');
    assert.equal(email?.idempotencyKey, 'weekly-spiff-report-2026-10-19');
    assert.match(email?.csv || '', /SPF-2026-TEST01/);
    assert.match(email?.csv || '', /SPF-2026-TEST02/);
    assert.match(email?.csv || '', /"Pending"/);
    assert.match(email?.html || '', /<strong>2<\/strong> total submissions/);
  });

  it('does not send again when the week is already claimed or sent', async () => {
    let deliveryCount = 0;
    const state = new Map<string, string>();
    const dependencies = createDependencies({
      claimWeek: async (weekStart) => {
        if (state.has(weekStart)) return false;
        state.set(weekStart, 'processing');
        return true;
      },
      finishWeek: async (weekStart, reportResult) => {
        state.set(weekStart, reportResult.status);
      },
      sendEmail: async () => {
        deliveryCount += 1;
        return { success: true, acceptedByProvider: true };
      },
    });

    const now = new Date('2026-10-26T15:00:00.000Z');
    assert.equal((await runWeeklySpiffReport(now, dependencies)).status, 'sent');
    assert.equal((await runWeeklySpiffReport(now, dependencies)).status, 'duplicate');
    assert.equal(deliveryCount, 1);
  });

  it('records a provider-accepted report as sent even if another recipient was rejected', async () => {
    let recorded: Parameters<WeeklySpiffReportDependencies['finishWeek']>[1] | undefined;
    const result = await runWeeklySpiffReport(
      new Date('2026-10-26T15:00:00.000Z'),
      createDependencies({
        sendEmail: async () => ({
          success: false,
          acceptedByProvider: true,
          providerMessageId: 'smtp-message-id',
          error: 'One recipient was rejected.',
        }),
        finishWeek: async (_week, reportResult) => {
          recorded = reportResult;
        },
      })
    );

    assert.equal(result.status, 'sent');
    assert.equal(recorded?.status, 'sent');
    assert.equal(recorded?.providerMessageId, 'smtp-message-id');
  });

  it('sends a test only to the entered address and records it without touching scheduled reports', async () => {
    const scheduledReport = { weekStart: '2026-10-19', status: 'sent' };
    const testSends: Array<{ id: string; status: string }> = [];
    let deliveredTo: string[] = [];
    let subject = '';
    const result = await runWeeklySpiffReportTest(
      new Date('2026-10-26T15:00:00.000Z'),
      'admin@example.test',
      'Test-Recipient@example.test',
      {
        getAccountingAddresses: async () => ['accounting@example.test'],
        getSubmissions: async () => [fixture],
        createTestSend: async (input) => {
          testSends.push({ id: input.id, status: 'processing' });
        },
        finishTestSend: async (id, outcome) => {
          const record = testSends.find((entry) => entry.id === id);
          assert.ok(record);
          record.status = outcome.status;
        },
        sendEmail: async (email) => {
          deliveredTo = email.to;
          subject = email.subject;
          assert.match(email.idempotencyKey, /^weekly-test-/);
          assert.match(email.csv, /SPF-2026-TEST01/);
          return { success: true, acceptedByProvider: true, providerMessageId: 'test-message' };
        },
      }
    );

    assert.equal(result.status, 'sent');
    assert.deepEqual(deliveredTo, ['test-recipient@example.test']);
    assert.match(subject, /^TEST:/);
    assert.equal(testSends.length, 1);
    assert.equal(testSends[0].status, 'sent');
    assert.deepEqual(scheduledReport, { weekStart: '2026-10-19', status: 'sent' });
  });

  it('rejects a test recipient that is an Accounting contact before recording or sending', async () => {
    let recorded = false;
    let sent = false;
    await assert.rejects(
      runWeeklySpiffReportTest(
        new Date('2026-10-26T15:00:00.000Z'),
        'admin@example.test',
        'accounting@example.test',
        {
          getAccountingAddresses: async () => ['ACCOUNTING@example.test'],
          getSubmissions: async () => [fixture],
          createTestSend: async () => {
            recorded = true;
          },
          finishTestSend: async () => {},
          sendEmail: async () => {
            sent = true;
            return { success: true };
          },
        }
      ),
      /cannot be an Accounting contact/
    );
    assert.equal(recorded, false);
    assert.equal(sent, false);
  });
});
