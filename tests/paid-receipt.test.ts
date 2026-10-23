import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { beforeEach, describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.AUTH_SECRET = 'unit-test-only-email-action-secret';
process.env.DATABASE_URL = '';

const { Repository, memoryStore } = await import('../src/lib/repository.js');
const { resolveCanonicalAppUrl } = await import('../src/lib/appUrl.js');
const { createEmailDecisionToken, verifyEmailDecisionToken } = await import('../src/lib/emailDecisionTokens.js');
const {
  inspectSmtpRecipientAcceptance,
  sanitizeEmailProviderError,
} = await import('../src/lib/resend.js');
const { createSessionToken, createCsrfToken } = await import('../src/lib/sessionAuth.js');
const { default: app } = await import('../src/server/app.js');

const APP_URL = 'https://spiff-test.example';
const STABLE_PRODUCTION_URL = 'https://discount-forklift-spiff-tracker.vercel.app';
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
  memoryStore.branches = memoryStore.branches.filter((branch) => branch.id !== 'br_test');
  memoryStore.branches.push({
    id: 'br_test',
    name: 'Test Branch',
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
  memoryStore.auditEvents = memoryStore.auditEvents.filter((event) => event.submissionId !== submissionId);
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

function mockDecisionDelivery(sentTo: string[]) {
  const originalDecideSubmission = Repository.decideSubmission;
  Repository.decideSubmission = (id, adminUser, input) =>
    originalDecideSubmission.call(Repository, id, adminUser, input, async (message) => {
      sentTo.push(message.to);
      return successfulMock();
    });
  return () => {
    Repository.decideSubmission = originalDecideSubmission;
  };
}

beforeEach(() => {
  addFixture();
});

describe('canonical notification action URLs', () => {
  it('prefers the stable project Production URL when APP_URL is deployment-specific', () => {
    assert.equal(
      resolveCanonicalAppUrl({
        NODE_ENV: 'production',
        APP_URL: 'https://discount-forklift-spiff-tracker-basxhlwz6-calebdfphxs-projects.vercel.app',
        VERCEL_PROJECT_PRODUCTION_URL: 'spiff-production.example.com',
        VERCEL_URL: 'discount-forklift-spiff-tracker-ikilmhbhu-calebdfphxs-projects.vercel.app',
      }),
      'https://spiff-production.example.com'
    );
  });

  it('uses an explicitly configured stable Production domain', () => {
    assert.equal(
      resolveCanonicalAppUrl({
        NODE_ENV: 'production',
        APP_URL: STABLE_PRODUCTION_URL,
        VERCEL_PROJECT_PRODUCTION_URL: 'spiff-project.vercel.app',
        NEXTAUTH_URL: 'https://deployment-hash-projects.vercel.app',
      }),
      STABLE_PRODUCTION_URL
    );
  });

  it('initializes the production backend and serves the session endpoint with the stable URL', () => {
    const script = `
      const { default: app } = await import('./src/server/app.ts');
      const server = app.listen(0, '127.0.0.1', async () => {
        try {
          const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/admin/session');
          const body = await response.json();
          if (response.status !== 200 || body.authenticated !== false) {
            throw new Error('Session endpoint did not initialize correctly.');
          }
          const loginResponse = await fetch('http://127.0.0.1:' + server.address().port + '/api/admin/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
          });
          if (loginResponse.status !== 400 && loginResponse.status !== 503) {
            throw new Error('Login endpoint returned HTTP ' + loginResponse.status + '.');
          }
          console.log('backend and authentication endpoints initialized');
        } catch (error) {
          console.error(error.message);
          process.exitCode = 1;
        } finally {
          server.close();
        }
      });
    `;
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 15_000,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          APP_URL: STABLE_PRODUCTION_URL,
          VERCEL_PROJECT_PRODUCTION_URL: '',
          NEXTAUTH_URL: 'https://deployment-hash-projects.vercel.app',
          VERCEL_URL: 'deployment-hash-projects.vercel.app',
          DATABASE_URL: '',
          AUTH_SECRET: 'unit-test-only-email-action-secret',
        },
      }
    );
    assert.equal(result.status, 0, `Production backend failed to initialize: ${result.stderr.slice(-1000)}`);
    assert.match(result.stdout, /backend and authentication endpoints initialized/);
  });

  it('generates submission action links on the configured stable Production origin', async () => {
    const approverId = 'approver_url_test';
    const attachmentId = 'attachment_url_test';
    const originalDispatchJob = Repository.dispatchJob;
    let createdSubmissionId: string | undefined;
    let createdJobId: string | undefined;
    const stableOrigin = resolveCanonicalAppUrl({
      NODE_ENV: 'production',
      APP_URL: STABLE_PRODUCTION_URL,
    });
    memoryStore.spiffs = memoryStore.spiffs.filter((spiff) => spiff.id !== 'spiff_url_test');
    memoryStore.spiffs.push({
      id: 'spiff_url_test',
      name: 'URL Test Spiff',
      description: '',
      eligibilityRequirements: '',
      amountCents: 10000,
      isActive: true,
      displayOrder: 999,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    memoryStore.contacts = memoryStore.contacts.filter((contact) => contact.id !== approverId);
    memoryStore.contacts.push({
      id: approverId,
      name: 'URL Test Approver',
      email: 'approver@example.test',
      role: 'Approving Manager',
      branch: 'Test Branch',
      isDefaultAccounting: false,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    memoryStore.attachments = memoryStore.attachments.filter((attachment) => attachment.id !== attachmentId);
    memoryStore.attachments.push({
      id: attachmentId,
      storageKey: 'url-test-photo',
      originalFilename: 'test.jpg',
      contentType: 'image/jpeg',
      fileSizeBytes: 1,
      uploadStatus: 'pending',
      uploadedAt: new Date().toISOString(),
    });
    Repository.dispatchJob = async (jobId) => {
      createdJobId = jobId;
      return memoryStore.emailJobs.find((job) => job.id === jobId)!;
    };

    try {
      const { submission } = await Repository.createSubmission({
        repId: 'rep_test',
        branchId: 'br_test',
        spiffId: 'spiff_url_test',
        liftName: 'URL Test Forklift',
        serialSuffix: '4321',
        saleDate: '2026-10-18',
        attachmentId,
        appUrl: stableOrigin,
      });
      createdSubmissionId = submission.id;
      const job = memoryStore.emailJobs.find(
        (emailJob) => emailJob.id === createdJobId
      );
      assert.ok(job);
      const actionLinks = [...(job.renderedBodyHtml || '').matchAll(/href="([^"]*\/api\/email-actions\/[^"]+)"/g)]
        .map((match) => match[1]);
      assert.equal(actionLinks.length, 2);
      assert.ok(actionLinks.every((link) => new URL(link).origin === STABLE_PRODUCTION_URL));
      assert.deepEqual(
        actionLinks.map((link) => verifyEmailDecisionToken(new URL(link).pathname.split('/').pop()!)?.decision),
        ['approve', 'deny']
      );

      const receiptJob = await Repository.buildPaidReceiptJob(
        (await Repository.getSubmissionById(submissionId))!,
        memoryStore.contacts.find((contact) => contact.id === 'gm_1')!,
        'admin@example.test',
        '2026-10-19T12:00:00.000Z',
        stableOrigin
      );
      const paidActionLink = [...receiptJob.renderedBodyHtml!.matchAll(/href="([^"]*\/api\/email-actions\/[^"]+)"/g)]
        .map((match) => match[1]);
      assert.equal(paidActionLink.length, 1);
      assert.equal(new URL(paidActionLink[0]).origin, STABLE_PRODUCTION_URL);
    } finally {
      Repository.dispatchJob = originalDispatchJob;
      memoryStore.emailJobs = memoryStore.emailJobs.filter((job) => job.id !== createdJobId);
      memoryStore.submissions = memoryStore.submissions.filter((item) => item.id !== createdSubmissionId);
      memoryStore.spiffs = memoryStore.spiffs.filter((spiff) => spiff.id !== 'spiff_url_test');
      memoryStore.contacts = memoryStore.contacts.filter((contact) => contact.id !== approverId);
      memoryStore.attachments = memoryStore.attachments.filter((attachment) => attachment.id !== attachmentId);
    }
  });

  it('does not fall back to a deployment URL when Production URL configuration is missing', () => {
    assert.throws(
      () =>
        resolveCanonicalAppUrl({
          NODE_ENV: 'production',
          APP_URL: 'https://discount-forklift-spiff-tracker-basxhlwz6-calebdfphxs-projects.vercel.app',
          NEXTAUTH_URL: 'https://discount-forklift-spiff-tracker-ikilmhbhu-calebdfphxs-projects.vercel.app',
          VERCEL_URL: 'discount-forklift-spiff-tracker-ikilmhbhu-calebdfphxs-projects.vercel.app',
        }),
      /stable Production domain/
    );
  });
});

describe('approved paid receipt notifications', () => {
  it('requires the exact GM address in Gmail accepted recipients and records rejection evidence', () => {
    const accepted = inspectSmtpRecipientAcceptance(
      'gm.one@example.test',
      [{ address: 'GM.One@example.test' }],
      []
    );
    assert.equal(accepted.error, undefined);
    assert.deepEqual(JSON.parse(accepted.providerResponse), {
      provider: 'gmail_smtp',
      accepted: ['gm.one@example.test'],
      rejected: [],
    });

    const rejected = inspectSmtpRecipientAcceptance(
      'gm.one@example.test',
      [],
      ['gm.one@example.test']
    );
    assert.match(rejected.error || '', /did not accept gm\.one@example\.test/);
    assert.deepEqual(JSON.parse(rejected.providerResponse), {
      provider: 'gmail_smtp',
      accepted: [],
      rejected: ['gm.one@example.test'],
    });

    const messageIdOnly = inspectSmtpRecipientAcceptance(
      'gm.one@example.test',
      [],
      []
    );
    assert.match(messageIdOnly.error || '', /Accepted recipients: none/);
  });

  it('keeps a Gmail job failed when its message ID exists but the GM was rejected', async () => {
    const recipientResult = inspectSmtpRecipientAcceptance(
      'gm.one@example.test',
      [],
      ['gm.one@example.test']
    );
    const submission = await Repository.decideSubmission(
      submissionId,
      'admin@example.test',
      { decision: 'approve', recipients: [], appUrl: APP_URL },
      async (message) => {
        if (message.to === 'gm.one@example.test') {
          return {
            success: false,
            status: 'failed',
            providerMessageId: 'smtp-message-id-does-not-prove-acceptance',
            providerResponse: recipientResult.providerResponse,
            error: recipientResult.error,
          };
        }
        return successfulMock();
      }
    );
    assert.equal(submission.status, 'Approved');
    const receipt = memoryStore.emailJobs.find(
      (job) =>
        job.templateId === 'spiff_approved_paid_receipt' &&
        job.recipientEmail === 'gm.one@example.test'
    );
    assert.equal(receipt?.status, 'failed');
    assert.equal(receipt?.providerMessageId, 'smtp-message-id-does-not-prove-acceptance');
    assert.match(receipt?.errorMessage || '', /did not accept gm\.one@example\.test/);
    assert.deepEqual(JSON.parse(receipt?.providerResponse || '{}').rejected, [
      'gm.one@example.test',
    ]);
  });

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
      return {
        ...(await successfulMock()),
        providerResponse: JSON.stringify({
          provider: 'gmail_smtp',
          accepted: [message.to],
          rejected: [],
        }),
      };
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
    assert.equal(
      JSON.parse(paidReceiptJob?.providerResponse || '{}').accepted[0],
      'gm.one@example.test'
    );
    assert.equal(receipts[0].templateId, 'spiff_approved_paid_receipt');
    assert.equal(receipts[0].templateVersion, 1);
    assert.equal(
      JSON.parse(receipts[0].providerResponse || '{}').rejected.length,
      0
    );

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

  it('automatically creates and dispatches the receipt through dashboard approval for an Approving Manager', async () => {
    const approverEmail = 'approving.manager@example.test';
    memoryStore.adminUsers = memoryStore.adminUsers.filter(
      (user) => user.email.toLowerCase() !== approverEmail
    );
    memoryStore.adminUsers.push({
      id: 'approving_manager_test',
      email: approverEmail,
      name: 'Test Approving Manager',
      role: 'Approving Manager',
      isAuthorized: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const sentTo: string[] = [];
    const restoreDelivery = mockDecisionDelivery(sentTo);
    const originalInfo = console.info;
    const pipelineLogs: string[] = [];
    console.info = (...args: unknown[]) => {
      if (args[0] === '[PaidReceiptPipeline]' || args[0] === '[ApprovalHandler]') {
        pipelineLogs.push(JSON.stringify({ prefix: args[0], ...JSON.parse(String(args[1])) }));
      }
    };
    const server = app.listen(0);
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/admin/submissions/${submissionId}/decide`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${createSessionToken(
              approverEmail,
              'Test Approving Manager',
              'Approving Manager'
            )}`,
            'x-csrf-token': createCsrfToken(approverEmail),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ decision: 'approve', recipients: [] }),
        }
      );
      const body = await response.json();

      assert.equal(response.status, 200, JSON.stringify(body));
      assert.equal(body.submission.status, 'Approved');
      assert.deepEqual(sentTo.sort(), [
        'gm.one@example.test',
        'gm.two@example.test',
        'sales.rep@example.test',
      ]);
      assert.equal(body.receiptNotifications.length, 2);
      assert.ok(
        body.receiptNotifications.every(
          (receipt: { status: string; templateId: string }) =>
            receipt.status === 'accepted' &&
            receipt.templateId === 'spiff_approved_paid_receipt'
        )
      );
      const stages = pipelineLogs.map((log) => JSON.parse(log));
      assert.ok(
        stages.some(
          (log) =>
            log.prefix === '[ApprovalHandler]' &&
            log.requestId === submissionId &&
            log.entryPoint === 'dashboard_decide' &&
            log.stage === 'approval_handler_entry'
        )
      );
      assert.ok(stages.some((log) => log.stage === 'gm_recipients_resolved'));
      assert.ok(stages.some((log) => log.stage === 'approval_transaction_committed'));
      assert.ok(stages.some((log) => log.stage === 'dispatch_finished'));
      assert.ok(
        stages
          .filter((log) => log.stage === 'dispatch_finished')
          .every(
            (log) =>
              log.requestId === submissionId &&
              log.deploymentId &&
              log.receiptJobId &&
              log.status === 'accepted'
          )
      );
    } finally {
      console.info = originalInfo;
      restoreDelivery();
      memoryStore.adminUsers = memoryStore.adminUsers.filter(
        (user) => user.email.toLowerCase() !== approverEmail
      );
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
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
    const sentTo: string[] = [];
    const restoreDelivery = mockDecisionDelivery(sentTo);
    memoryStore.contacts.push({
      id: 'approver_email_test',
      name: 'Email Approver',
      email: 'approving.manager@example.test',
      role: 'Approving Manager',
      branch: 'Test Branch',
      isDefaultAccounting: false,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const originalInfo = console.info;
    const approvalHandlerLogs: string[] = [];
    console.info = (...args: unknown[]) => {
      if (args[0] === '[ApprovalHandler]') {
        approvalHandlerLogs.push(JSON.stringify({ prefix: args[0], ...JSON.parse(String(args[1])) }));
      }
    };
    const server = app.listen(0);
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const approvalToken = createEmailDecisionToken(
        submissionId,
        'approve',
        'approving.manager@example.test'
      );
      const approvalResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/email-actions/${approvalToken}`
      );
      const approvalBody = await approvalResponse.text();
      assert.equal(approvalResponse.status, 200, approvalBody);
      assert.match(approvalBody, /Simply opening this page does not change the request/);
      assert.equal((await Repository.getSubmissionById(submissionId))?.status, 'Pending');
      assert.equal(memoryStore.emailJobs.length, 0);
      assert.equal(sentTo.length, 0);

      const approvalPostResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/email-actions/${approvalToken}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ confirmation: 'approve' }),
        }
      );
      const approvalPostBody = await approvalPostResponse.text();
      assert.equal(approvalPostResponse.status, 200, approvalPostBody);
      assert.match(approvalPostBody, /Request .* approved/);
      assert.match(approvalPostBody, /gm\.one@example\.test.*accepted/);
      assert.match(approvalPostBody, /Spiff Approved Paid Receipt — v1 to gm\.one@example\.test, job job_/);
      assert.equal((await Repository.getSubmissionById(submissionId))?.status, 'Approved');
      assert.deepEqual(sentTo.sort(), [
        'gm.one@example.test',
        'gm.two@example.test',
        'sales.rep@example.test',
      ]);
      assert.ok(
        approvalHandlerLogs.some((log) => {
          const entry = JSON.parse(log);
          return (
            entry.requestId === submissionId &&
            entry.entryPoint === 'email_action' &&
            entry.stage === 'approval_handler_entry' &&
            !log.includes(approvalToken)
          );
        })
      );

      const receiptHtml = memoryStore.emailJobs.find(
        (job) =>
          job.templateId === 'spiff_approved_paid_receipt' &&
          job.recipientEmail === 'gm.one@example.test'
      )?.renderedBodyHtml;
      const paidToken = receiptHtml?.match(/\/api\/email-actions\/([^"]+)/)?.[1];
      assert.ok(paidToken);
      assert.equal(verifyEmailDecisionToken(paidToken)?.decision, 'paid');

      const paidGetResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/email-actions/${paidToken}`
      );
      assert.equal(paidGetResponse.status, 200);
      assert.match(await paidGetResponse.text(), /Confirm Mark as Paid/);
      assert.equal((await Repository.getSubmissionById(submissionId))?.status, 'Approved');

      const paymentResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/email-actions/${paidToken}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ confirmation: 'paid' }),
        }
      );
      assert.equal(paymentResponse.status, 200);
      assert.equal((await Repository.getSubmissionById(submissionId))?.status, 'Paid');

      const repeatedPaymentResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/email-actions/${paidToken}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ confirmation: 'paid' }),
        }
      );
      assert.equal(repeatedPaymentResponse.status, 400);
      assert.equal((await Repository.getSubmissionById(submissionId))?.status, 'Paid');
    } finally {
      console.info = originalInfo;
      restoreDelivery();
      memoryStore.contacts = memoryStore.contacts.filter((contact) => contact.id !== 'approver_email_test');
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('keeps approval and denial-link GETs side-effect free and requires a reason for denial POST', async () => {
    const sentTo: string[] = [];
    const restoreDelivery = mockDecisionDelivery(sentTo);
    memoryStore.contacts.push({
      id: 'approver_scanner_test',
      name: 'Scanner Test Approver',
      email: 'scanner.approver@example.test',
      role: 'Approving Manager',
      branch: 'Test Branch',
      isDefaultAccounting: false,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const server = app.listen(0);
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const approveToken = createEmailDecisionToken(
        submissionId,
        'approve',
        'scanner.approver@example.test'
      );
      const denyToken = createEmailDecisionToken(
        submissionId,
        'deny',
        'scanner.approver@example.test'
      );

      const scannerVisits = await Promise.all([
        fetch(`http://127.0.0.1:${address.port}/api/email-actions/${approveToken}`),
        fetch(`http://127.0.0.1:${address.port}/api/email-actions/${denyToken}`),
      ]);
      assert.deepEqual(scannerVisits.map((response) => response.status), [200, 200]);
      assert.match(await scannerVisits[0].text(), /Confirm approve/);
      assert.match(await scannerVisits[1].text(), /name="reason" required/);
      assert.equal((await Repository.getSubmissionById(submissionId))?.status, 'Pending');
      assert.equal(memoryStore.auditEvents.length, 0);
      assert.equal(memoryStore.emailJobs.length, 0);
      assert.deepEqual(sentTo, []);

      const missingReason = await fetch(
        `http://127.0.0.1:${address.port}/api/email-actions/${denyToken}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ confirmation: 'deny' }),
        }
      );
      assert.equal(missingReason.status, 400);
      assert.match(await missingReason.text(), /denial reason is required/i);
      assert.equal((await Repository.getSubmissionById(submissionId))?.status, 'Pending');
      assert.deepEqual(sentTo, []);

      const denial = await fetch(
        `http://127.0.0.1:${address.port}/api/email-actions/${denyToken}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ confirmation: 'deny', reason: 'Request details need correction.' }),
        }
      );
      assert.equal(denial.status, 200, await denial.text());
      assert.equal((await Repository.getSubmissionById(submissionId))?.status, 'Rejected');
      assert.equal(memoryStore.auditEvents[0]?.explanation, 'Request details need correction.');
      assert.deepEqual(sentTo, ['sales.rep@example.test']);

      const repeatedApproval = await fetch(
        `http://127.0.0.1:${address.port}/api/email-actions/${approveToken}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ confirmation: 'approve' }),
        }
      );
      assert.equal(repeatedApproval.status, 409);
      assert.deepEqual(sentTo, ['sales.rep@example.test']);
    } finally {
      restoreDelivery();
      memoryStore.contacts = memoryStore.contacts.filter((contact) => contact.id !== 'approver_scanner_test');
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('allows only Administrators to reopen a denial with an audit trail and no resend', async () => {
    const sentTo: string[] = [];
    const restoreDelivery = mockDecisionDelivery(sentTo);
    const denied = await Repository.decideSubmission(
      submissionId,
      'manager@example.test',
      {
        decision: 'deny',
        reasonOrMessage: 'Incorrectly denied by test.',
        recipients: [],
        appUrl: APP_URL,
      },
      async (message) => {
        sentTo.push(message.to);
        return successfulMock();
      }
    );
    assert.equal(denied.status, 'Rejected');
    const originalDenialAudit = memoryStore.auditEvents.find(
      (event) => event.submissionId === submissionId && event.action === 'denied'
    );
    assert.ok(originalDenialAudit);
    const emailsAfterDenial = memoryStore.emailJobs.length;
    const deliveriesAfterDenial = sentTo.length;

    const approverEmail = 'reopen.approver@example.test';
    memoryStore.adminUsers.push({
      id: 'reopen_approver_user',
      email: approverEmail,
      name: 'Approving Manager',
      role: 'Approving Manager',
      passwordHash: null,
      isAuthorized: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const server = app.listen(0);
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const body = JSON.stringify({ explanation: 'Verified the denial resulted from an incorrect email-link action.' });

      const managerToken = createSessionToken(approverEmail, 'Approving Manager', 'Approving Manager');
      const forbidden = await fetch(
        `http://127.0.0.1:${address.port}/api/admin/submissions/${submissionId}/reopen-denied`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: `spiff_admin_session=${managerToken}`,
            'x-csrf-token': createCsrfToken(approverEmail),
          },
          body,
        }
      );
      assert.equal(forbidden.status, 403);
      assert.equal((await Repository.getSubmissionById(submissionId))?.status, 'Rejected');

      const adminEmail = 'caleb@discountforkliftphoenix.com';
      const adminToken = createSessionToken(adminEmail, 'Test Admin', 'Administrator');
      const reopenedResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/admin/submissions/${submissionId}/reopen-denied`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: `spiff_admin_session=${adminToken}`,
            'x-csrf-token': createCsrfToken(adminEmail),
          },
          body,
        }
      );
      assert.equal(reopenedResponse.status, 200, await reopenedResponse.text());
      const reopened = (await Repository.getSubmissionById(submissionId))!;
      assert.equal(reopened.status, 'Pending');
      assert.equal(reopened.rejectedAt, null);
      assert.equal(reopened.rejectedBy, null);
      assert.equal(reopened.rejectionReason, null);
      assert.ok(reopened.auditEvents?.some((event) => event.id === originalDenialAudit.id));
      assert.ok(
        reopened.auditEvents?.some(
          (event) =>
            event.action === 'correction' &&
            event.fieldChanged === 'status' &&
            event.oldValue === 'Rejected (Denied)' &&
            event.newValue === 'Pending' &&
            event.performedBy === adminEmail
        )
      );
      assert.equal(memoryStore.emailJobs.length, emailsAfterDenial);
      assert.equal(sentTo.length, deliveriesAfterDenial);

      await Repository.decideSubmission(
        submissionId,
        adminEmail,
        { decision: 'approve', recipients: [], appUrl: APP_URL },
        async (message) => {
          sentTo.push(message.to);
          return successfulMock();
        }
      );
      const decisionJobs = memoryStore.emailJobs.filter(
        (job) =>
          job.submissionId === submissionId &&
          (job.templateId === 'spiff_denied' || job.templateId === 'spiff_approved')
      );
      assert.equal(new Set(decisionJobs.map((job) => job.idempotencyKey)).size, decisionJobs.length);
    } finally {
      restoreDelivery();
      memoryStore.adminUsers = memoryStore.adminUsers.filter(
        (user) => user.id !== 'reopen_approver_user'
      );
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
