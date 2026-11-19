import assert from 'node:assert/strict';
import { it } from 'node:test';

interface SentMessage {
  toRecipients: Array<{ emailAddress: { address: string } }>;
  body: { content: string };
  from: { emailAddress: { address: string; name: string } };
  attachments?: Array<{ name: string; contentBytes: string }>;
}

it('routes notification, decision, receipt, test, and weekly report emails through mocked Microsoft Graph', async () => {
  const originalEnvironment = {
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    GRAPH_TENANT_ID: process.env.GRAPH_TENANT_ID,
    GRAPH_CLIENT_ID: process.env.GRAPH_CLIENT_ID,
    GRAPH_AUTH_MODE: process.env.GRAPH_AUTH_MODE,
    GRAPH_CLIENT_SECRET: process.env.GRAPH_CLIENT_SECRET,
  };
  const originalFetch = globalThis.fetch;
  const sentMessages: SentMessage[] = [];
  let tokenRequests = 0;
  process.env.EMAIL_PROVIDER = 'microsoft_graph';
  process.env.GRAPH_TENANT_ID = '11111111-2222-3333-4444-555555555555';
  process.env.GRAPH_CLIENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  process.env.GRAPH_AUTH_MODE = 'client_secret';
  process.env.GRAPH_CLIENT_SECRET = 'mock-only-client-secret';
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('login.microsoftonline.com')) {
      tokenRequests += 1;
      return new Response(JSON.stringify({ access_token: 'mock-only-access-token', expires_in: 3600 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    assert.match(url, /\/users\/admin%40discountforkliftphoenix\.com\/sendMail$/);
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer mock-only-access-token');
    sentMessages.push((JSON.parse(String(init?.body)) as { message: SentMessage }).message);
    return new Response(null, { status: 202 });
  };

  try {
    const email = await import('../src/lib/resend.js');
    assert.equal(email.emailProvider, 'microsoft_graph');
    assert.equal(email.isEmailConfigured, true);

    const submission = await email.sendSpiffSubmissionEmail({
      requestId: 'SPF-TEST-100',
      repName: 'Test Rep',
      liftName: 'Test Forklift',
      serialSuffix: '1234',
      spiffName: 'Test Spiff',
      amountFormatted: '$100.00',
      isHalfSpiffAmount: false,
      saleDate: 'Nov 17, 2026',
      submittedAtPhoenix: 'Nov 17, 2026 9:00 AM',
      hasPhoto: true,
      adminReviewUrl: 'https://tracker.example.test/admin?request=SPF-TEST-100',
      recipientEmail: 'approver@example.test',
    });
    const approved = await email.sendSpiffDecisionResultEmail(
      {
        requestId: 'SPF-TEST-100',
        repName: 'Test Rep',
        repEmail: 'rep@example.test',
        liftName: 'Test Forklift',
        serialSuffix: '1234',
        spiffName: 'Test Spiff',
        amountFormatted: '$100.00',
        isHalfSpiffAmount: false,
        saleDate: 'Nov 17, 2026',
        decision: 'Approved',
        decisionBy: 'Approver',
        decidedAtPhoenix: 'Nov 17, 2026 9:30 AM',
        recipients: [{ email: 'rep@example.test', name: 'Test Rep', role: 'Sales Representative' }],
        adminReviewUrl: 'https://tracker.example.test/admin?request=SPF-TEST-100',
      },
      { email: 'rep@example.test', name: 'Test Rep', role: 'Sales Representative' }
    );
    const denied = await email.sendSpiffDecisionResultEmail(
      {
        requestId: 'SPF-TEST-101',
        repName: 'Test Rep',
        liftName: 'Test Forklift',
        serialSuffix: '5678',
        spiffName: 'Test Spiff',
        amountFormatted: '$50.00',
        isHalfSpiffAmount: true,
        saleDate: 'Nov 16, 2026',
        decision: 'Denied',
        decisionBy: 'Approver',
        decidedAtPhoenix: 'Nov 17, 2026 9:30 AM',
        messageOrReason: 'Missing documentation',
        recipients: [{ email: 'rep@example.test', name: 'Test Rep', role: 'Sales Representative' }],
        adminReviewUrl: 'https://tracker.example.test/admin?request=SPF-TEST-101',
      },
      { email: 'rep@example.test', name: 'Test Rep', role: 'Sales Representative' }
    );
    const receipt = await email.sendRenderedEmail({
      to: 'gm@example.test',
      subject: 'Approved Spiff Paid Receipt',
      html: '<a href="https://tracker.example.test/api/email-actions/test-paid-token">Mark as Paid</a>',
    });
    const testEmail = await email.sendRenderedEmail({
      to: 'admin-test@example.test',
      subject: 'TEST: Spiff template',
      html: '<p>Administrator test email content</p>',
    });
    const report = await email.sendWeeklySpiffReportEmail({
      to: ['accounting@example.test'],
      subject: 'Weekly Spiff Report',
      html: '<p>Weekly report summary</p>',
      csv: 'Request ID,Status\nSPF-TEST-100,Approved',
      filename: 'weekly-spiff-submissions.csv',
      idempotencyKey: 'weekly-spiff-report-test',
    });

    assert.ok([submission, approved, denied, receipt, testEmail, report].every((result) => result.success));
    assert.equal(tokenRequests, 1);
    assert.equal(sentMessages.length, 6);
    assert.deepEqual(
      sentMessages.map((message) => message.toRecipients[0].emailAddress.address),
      [
        'approver@example.test',
        'rep@example.test',
        'rep@example.test',
        'gm@example.test',
        'admin-test@example.test',
        'accounting@example.test',
      ]
    );
    assert.match(sentMessages[0].body.content, /SPF-TEST-100/);
    assert.match(sentMessages[0].body.content, /admin\?request=SPF-TEST-100/);
    assert.match(sentMessages[1].body.content, /Status: APPROVED/);
    assert.match(sentMessages[2].body.content, /Status: DENIED/);
    assert.match(sentMessages[3].body.content, /Mark as Paid/);
    assert.match(sentMessages[4].body.content, /Administrator test email content/);
    const reportAttachment = sentMessages[5].attachments?.[0];
    assert.ok(reportAttachment);
    assert.equal(reportAttachment.name, 'weekly-spiff-submissions.csv');
    assert.equal(
      Buffer.from(reportAttachment.contentBytes, 'base64').toString('utf8'),
      'Request ID,Status\nSPF-TEST-100,Approved'
    );
    assert.ok(sentMessages.every((message) =>
      message.from.emailAddress.address === 'admin@discountforkliftphoenix.com' &&
      message.from.emailAddress.name === 'Discount Forklift Spiff Tracker'
    ));
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
