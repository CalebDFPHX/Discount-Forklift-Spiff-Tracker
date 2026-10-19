import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.AUTH_SECRET = 'unit-test-only-email-action-secret';

const { Repository, memoryStore } = await import('../src/lib/repository.js');
const { createEmailDecisionToken, verifyEmailDecisionToken } = await import('../src/lib/emailDecisionTokens.js');
const { sanitizeEmailProviderError } = await import('../src/lib/resend.js');
const { default: app } = await import('../src/server/app.js');

const APP_URL = 'https://spiff-test.example';
const submissionId = 'SPF-2026-TEST01';

function addFixture(assignedGmIds = 'gm_1,gm_2', status: 'Pending' | 'Approved' | 'Paid' = 'Pending') {
  const now = '2026-10-19T12:00:00.000Z';
  memoryStore.reps = memoryStore.reps.filter((rep) => rep.id !== 'rep_test');
  memoryStore.reps.push({
    id: 'rep_test',
    name: 'Test Sales Rep',
    email: 'sales.rep@example.test',
    branch: 'Test Branch',
    assignedGmIds,
    isActive: true,
    displayOrder: 999,
    createdAt: now,
    updatedAt: now,
  });
  memoryStore.contacts = memoryStore.contacts.filter(
    (contact) => contact.id !== 'gm_1' && contact.id !== 'gm_2'
  );
  memoryStore.contacts.push(
    {
      id: 'gm_1',
      name: 'Active GM One',
      email: 'gm.one@example.test',
      role: 'General Manager',
      branch: 'Test Branch',
      isDefaultAccounting: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'gm_2',
      name: 'Active GM Two',
      email: 'gm.two@example.test',
      role: 'General Manager',
      branch: 'Test Branch',
      isDefaultAccounting: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }
  );
  memoryStore.submissions = memoryStore.submissions.filter((item) => item.id !== submissionId);
  memoryStore.submissions.push({
    id: submissionId,
    repId: 'rep_test',
    spiffId: 'spiff_test',
    liftName: 'Test Forklift',
    serialSuffix: '1234',
    saleDate: '2026-10-18',
    notes: null,
    status,
    snapshotRepName: 'Test Sales Rep',
    snapshotRepEmail: 'sales.rep@example.test',
    snapshotSpiffName: 'Test Spiff',
    snapshotEligibilityRequirements: '',
    snapshotAmountCents: 12500,
    isPotentialDuplicate: false,
    submittedAt: now,
    approvedAt: status === 'Pending' ? null : now,
    approvedBy: status === 'Pending' ? null : 'admin@example.test',
    paidAt: status === 'Paid' ? now : null,
    paidBy: status === 'Paid' ? 'admin@example.test' : null,
    auditEvents: [],
  });
  memoryStore.emailJobs = memoryStore.emailJobs.filter((job) => job.submissionId !== submissionId);
}

const successfulMock = async () => ({
  success: true,
  status: 'accepted' as const,
  providerMessageId: 'mock-provider-id',
});

beforeEach(() => {
  addFixture();
});

describe('approved paid receipt notifications', () => {
  it('redacts credentials and signed action tokens from delivery errors', () => {
    const token = createEmailDecisionToken(submissionId, 'paid', 'gm.one@example.test');
    const sanitized = sanitizeEmailProviderError(
      new Error(`Provider failure token=${token} secret=${process.env.AUTH_SECRET}`)
    );
    assert.equal(sanitized.includes(token), false);
    assert.equal(sanitized.includes(process.env.AUTH_SECRET!), false);
  });

  it('sends the rep result and separate paid receipts to every assigned active GM', async () => {
    const sentTo: string[] = [];
    const deliver = async (message: { to: string; html: string }) => {
      sentTo.push(message.to);
      if (message.to !== 'sales.rep@example.test') {
        const actionToken = message.html.match(/\/api\/email-actions\/([^"]+)/)?.[1];
        assert.ok(actionToken, 'GM receipt contains a signed Mark as Paid link');
        assert.equal(verifyEmailDecisionToken(actionToken)?.decision, 'paid');
      }
      return successfulMock();
    };

    const submission = await Repository.decideSubmission(
      submissionId,
      'admin@example.test',
      { decision: 'approve', recipients: [], appUrl: APP_URL },
      deliver
    );

    assert.equal(submission.status, 'Approved');
    assert.equal(submission.paidAt, null);
    assert.deepEqual(sentTo.sort(), [
      'gm.one@example.test',
      'gm.two@example.test',
      'sales.rep@example.test',
    ]);
    const receipts = await Repository.getPaidReceiptNotificationResults(submissionId);
    assert.equal(receipts.length, 2);
    assert.ok(receipts.every((receipt) => receipt.status === 'accepted'));

    const jobs = await Repository.getEmailJobs();
    const approvalJob = jobs.find(
      (job) => job.recipientEmail === 'sales.rep@example.test'
    );
    const paidReceiptJob = jobs.find(
      (job) => job.recipientEmail === 'gm.one@example.test'
    );
    assert.equal(approvalJob?.templateId, 'spiff_approved');
    assert.equal(approvalJob?.templateVersion, 1);
    assert.equal(paidReceiptJob?.templateId, 'spiff_approved_paid_receipt');
    assert.equal(paidReceiptJob?.templateVersion, 1);

    const currentTemplate = memoryStore.emailTemplates.find(
      (template) => template.id === 'spiff_approved_paid_receipt'
    );
    assert.ok(currentTemplate);
    const currentVersion = currentTemplate.version;
    currentTemplate.version++;
    try {
      const refreshedJobs = await Repository.getEmailJobs();
      assert.equal(
        refreshedJobs.find((job) => job.id === paidReceiptJob.id)?.templateVersion,
        paidReceiptJob.templateVersion
      );
    } finally {
      currentTemplate.version = currentVersion;
    }
  });

  it('returns saved template identity and does not mutate statuses when reading the log', async () => {
    await Repository.decideSubmission(
      submissionId,
      'admin@example.test',
      { decision: 'approve', recipients: [], appUrl: APP_URL },
      successfulMock
    );
    const existingReceipt = memoryStore.emailJobs.find(
      (job) => job.templateId === 'spiff_approved_paid_receipt'
    );
    assert.ok(existingReceipt);

    const legacyJob = {
      ...existingReceipt,
      id: 'job_legacy_without_template',
      recipientEmail: 'dallas.manager@discountforkliftphoenix.com',
      status: 'queued' as const,
      templateId: null,
      templateVersion: null,
    };
    memoryStore.emailJobs.push(legacyJob);

    const jobs = await Repository.getEmailJobs();
    const loadedLegacyJob = jobs.find((job) => job.id === legacyJob.id);
    const loadedReceipt = jobs.find((job) => job.id === existingReceipt.id);
    assert.equal(loadedLegacyJob?.templateId, null);
    assert.equal(loadedLegacyJob?.templateVersion, null);
    assert.equal(loadedLegacyJob?.status, 'queued');
    assert.equal(loadedReceipt?.templateId, 'spiff_approved_paid_receipt');
    assert.equal(loadedReceipt?.templateVersion, existingReceipt.templateVersion);
  });

  it('keeps the approval when Gmail-style delivery fails and prevents resend after acceptance', async () => {
    let managerAttempts = 0;
    const deliver = async (message: { to: string }) => {
      if (message.to === 'gm.one@example.test') {
        managerAttempts++;
        if (managerAttempts === 1) {
          return {
            success: false,
            status: 'failed' as const,
            error: 'Gmail SMTP authentication failed.',
          };
        }
      }
      return successfulMock();
    };

    const submission = await Repository.decideSubmission(
      submissionId,
      'admin@example.test',
      { decision: 'approve', recipients: [], appUrl: APP_URL },
      deliver
    );
    assert.equal(submission.status, 'Approved');

    const failedReceipt = (await Repository.getPaidReceiptNotificationResults(submissionId))
      .find((receipt) => receipt.recipientEmail === 'gm.one@example.test');
    assert.equal(failedReceipt?.status, 'failed');
    assert.equal(failedReceipt?.canRetry, true);
    assert.equal(failedReceipt?.errorMessage, 'Gmail SMTP authentication failed.');

    const retried = await Repository.retryNotification(
      failedReceipt!.notificationJobId,
      APP_URL,
      deliver
    );
    assert.equal(retried.status, 'accepted');
    await assert.rejects(
      Repository.retryNotification(failedReceipt!.notificationJobId, APP_URL, deliver),
      /already been accepted/
    );
    assert.equal(managerAttempts, 2);
    assert.equal((await Repository.getSubmissionById(submissionId))?.status, 'Approved');
  });

  it('recovers a missing receipt from the recorded approval without changing approval or payment', async () => {
    addFixture('gm_1', 'Approved');
    const approvedAt = (await Repository.getSubmissionById(submissionId))!.approvedAt;
    let sent = 0;
    const deliver = async () => {
      sent++;
      return successfulMock();
    };

    const [recovered] = await Promise.all([
      Repository.recoverPaidReceiptNotifications(submissionId, APP_URL, deliver),
      Repository.recoverPaidReceiptNotifications(submissionId, APP_URL, deliver),
    ]);
    assert.equal(recovered.length, 1);
    assert.equal(sent, 1);
    assert.equal((await Repository.getSubmissionById(submissionId))?.approvedAt, approvedAt);
    assert.equal((await Repository.getSubmissionById(submissionId))?.status, 'Approved');

    const subsequent = await Repository.recoverPaidReceiptNotifications(
      submissionId,
      APP_URL,
      deliver
    );
    assert.equal(subsequent[0].status, 'accepted');
    assert.equal(sent, 1);
    assert.equal(memoryStore.emailJobs.filter((job) => job.templateId === 'spiff_approved_paid_receipt').length, 1);
  });

  it('retries an existing failed job instead of creating a replacement', async () => {
    addFixture('gm_1', 'Approved');
    const submission = (await Repository.getSubmissionById(submissionId))!;
    const manager = memoryStore.contacts.find((contact) => contact.id === 'gm_1')!;
    const failedJob = await Repository.buildPaidReceiptJob(
      submission,
      manager,
      'admin@example.test',
      submission.approvedAt!,
      APP_URL
    );
    failedJob.status = 'failed';
    failedJob.attemptCount = 1;
    failedJob.errorMessage = 'Previous provider failure';
    memoryStore.emailJobs.push(failedJob);

    let sent = 0;
    const recovered = await Repository.recoverPaidReceiptNotifications(
      submissionId,
      APP_URL,
      async () => {
        sent++;
        return successfulMock();
      }
    );
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].notificationJobId, failedJob.id);
    assert.equal(recovered[0].status, 'accepted');
    assert.equal(sent, 1);
    assert.equal(
      memoryStore.emailJobs.filter((job) => job.templateId === 'spiff_approved_paid_receipt').length,
      1
    );
  });

  it('requires an active assigned contact with the exact General Manager role', async () => {
    memoryStore.contacts.find((contact) => contact.id === 'gm_1')!.isActive = false;
    memoryStore.contacts.find((contact) => contact.id === 'gm_2')!.role = 'Approving Manager';

    await assert.rejects(
      Repository.decideSubmission(submissionId, 'admin@example.test', {
        decision: 'approve',
        recipients: [],
        appUrl: APP_URL,
      }),
      /assigned to Test Sales Rep|inactive, invalid/
    );
    assert.equal((await Repository.getSubmissionById(submissionId))?.status, 'Pending');
    assert.equal(memoryStore.emailJobs.some((job) => job.submissionId === submissionId), false);
  });

  it('does not create a receipt for a request already marked Paid', async () => {
    addFixture('gm_1', 'Paid');
    const recovered = await Repository.recoverPaidReceiptNotifications(
      submissionId,
      APP_URL,
      async () => {
        assert.fail('Paid requests must not dispatch new receipt email');
      }
    );
    assert.deepEqual(recovered, []);
    assert.equal(memoryStore.emailJobs.some((job) => job.submissionId === submissionId), false);
  });

  it('records payment only on the separate Mark as Paid operation and only once', async () => {
    await Repository.decideSubmission(submissionId, 'admin@example.test', {
      decision: 'approve',
      recipients: [],
      appUrl: APP_URL,
    }, successfulMock);

    const token = memoryStore.emailJobs
      .find((job) => job.templateId === 'spiff_approved_paid_receipt')!
      .renderedBodyHtml!.match(/\/api\/email-actions\/([^"]+)/)?.[1];
    assert.ok(token);
    assert.equal(verifyEmailDecisionToken(token)?.decision, 'paid');
    assert.equal((await Repository.getSubmissionById(submissionId))?.status, 'Approved');

    const paid = await Repository.markPaidSubmission(submissionId, 'gm.one@example.test');
    assert.equal(paid.status, 'Paid');
    await assert.rejects(
      Repository.markPaidSubmission(submissionId, 'gm.one@example.test'),
      /Only Approved requests/
    );
  });

  it('uses the receipt flow for email-link approvals and records payment only on the paid link', async () => {
    const server = app.listen(0);
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const approvalToken = createEmailDecisionToken(
        submissionId,
        'approve',
        'approver@example.test'
      );
      const approvalResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/email-actions/${approvalToken}`
      );
      const approvalBody = await approvalResponse.text();
      assert.equal(approvalResponse.status, 200);
      assert.match(approvalBody, /Request .* approved/);
      assert.match(approvalBody, /gm\.one@example\.test.*failed/);
      assert.equal((await Repository.getSubmissionById(submissionId))?.status, 'Approved');

      const receiptHtml = memoryStore.emailJobs.find(
        (job) =>
          job.templateId === 'spiff_approved_paid_receipt' &&
          job.recipientEmail === 'gm.one@example.test'
      )?.renderedBodyHtml;
      const paidToken = receiptHtml?.match(/\/api\/email-actions\/([^"]+)/)?.[1];
      assert.ok(paidToken);
      assert.equal(verifyEmailDecisionToken(paidToken)?.decision, 'paid');

      const paymentResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/email-actions/${paidToken}`
      );
      assert.equal(paymentResponse.status, 200);
      assert.equal((await Repository.getSubmissionById(submissionId))?.status, 'Paid');

      const repeatedPaymentResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/email-actions/${paidToken}`
      );
      assert.equal(repeatedPaymentResponse.status, 400);
      assert.equal((await Repository.getSubmissionById(submissionId))?.status, 'Paid');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
