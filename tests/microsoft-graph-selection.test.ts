import assert from 'node:assert/strict';
import { it } from 'node:test';

it('does not fall back to configured legacy providers when selected Graph configuration is invalid', async () => {
  const environmentNames = [
    'EMAIL_PROVIDER',
    'GRAPH_TENANT_ID',
    'GRAPH_CLIENT_ID',
    'GRAPH_AUTH_MODE',
    'GRAPH_CLIENT_SECRET',
    'GRAPH_CERTIFICATE_PRIVATE_KEY',
    'GRAPH_CERTIFICATE_THUMBPRINT',
    'RESEND_API_KEY',
    'GMAIL_USER',
    'GMAIL_APP_PASSWORD',
    'OUTLOOK_USER',
    'OUTLOOK_PASSWORD',
  ];
  const originalEnvironment = Object.fromEntries(
    environmentNames.map((name) => [name, process.env[name]])
  );
  const originalFetch = globalThis.fetch;
  process.env.EMAIL_PROVIDER = 'microsoft_graph';
  process.env.GRAPH_TENANT_ID = '11111111-2222-3333-4444-555555555555';
  process.env.GRAPH_CLIENT_ID = 'invalid-client-id';
  process.env.GRAPH_AUTH_MODE = 'client_secret';
  process.env.GRAPH_CLIENT_SECRET = 'mock-only-client-secret';
  process.env.RESEND_API_KEY = 're_test_not_a_live_key';
  process.env.GMAIL_USER = 'mock@example.test';
  process.env.GMAIL_APP_PASSWORD = 'mock-only-password';
  globalThis.fetch = async () => {
    throw new Error('No external network requests are permitted in this test.');
  };

  try {
    const email = await import('../src/lib/resend.js');
    assert.equal(email.emailProvider, 'microsoft_graph');
    assert.equal(email.isResendConfigured, true);
    assert.equal(email.isGmailConfigured, true);
    assert.equal(email.isEmailConfigured, false);
    assert.match(email.emailConfigurationError || '', /GRAPH_CLIENT_ID must be/);
    const result = await email.sendRenderedEmail({
      to: 'recipient@example.test',
      subject: 'Must not be sent',
      html: '<p>Mock only</p>',
    });
    assert.equal(result.success, false);
    assert.match(result.error || '', /GRAPH_CLIENT_ID must be/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
