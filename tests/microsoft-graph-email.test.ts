import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  createMicrosoftGraphEmailProvider,
  hasMicrosoftGraphConfiguration,
  MICROSOFT_GRAPH_SENDER_EMAIL,
  MICROSOFT_GRAPH_SENDER_NAME,
  resolveMicrosoftGraphConfiguration,
} from '../src/lib/microsoftGraph.js';

const TENANT_ID = '11111111-2222-3333-4444-555555555555';
const CLIENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function clientSecretEnvironment() {
  return {
    GRAPH_TENANT_ID: TENANT_ID,
    GRAPH_CLIENT_ID: CLIENT_ID,
    GRAPH_AUTH_MODE: 'client_secret',
    GRAPH_CLIENT_SECRET: 'test-client-secret',
  };
}

describe('Microsoft Graph email configuration', () => {
  it('requires complete server-side app-only configuration and rejects invalid authentication modes', () => {
    assert.equal(hasMicrosoftGraphConfiguration({}), false);
    assert.equal(
      resolveMicrosoftGraphConfiguration({
        ...clientSecretEnvironment(),
        GRAPH_CLIENT_SECRET: '',
      }).error,
      'Microsoft Graph configuration is incomplete. Set GRAPH_CLIENT_SECRET.'
    );
    assert.match(
      resolveMicrosoftGraphConfiguration({
        ...clientSecretEnvironment(),
        GRAPH_AUTH_MODE: 'password',
      }).error || '',
      /GRAPH_AUTH_MODE must be/
    );
    assert.match(
      resolveMicrosoftGraphConfiguration({
        ...clientSecretEnvironment(),
        GRAPH_TENANT_ID: 'not-a-guid',
      }).error || '',
      /GRAPH_TENANT_ID must be/
    );
    assert.equal(hasMicrosoftGraphConfiguration(clientSecretEnvironment()), true);
  });

  it('validates certificate mode without exposing private-key material in errors', () => {
    const invalid = resolveMicrosoftGraphConfiguration({
      GRAPH_TENANT_ID: TENANT_ID,
      GRAPH_CLIENT_ID: CLIENT_ID,
      GRAPH_AUTH_MODE: 'certificate',
      GRAPH_CERTIFICATE_PRIVATE_KEY: 'not a private key',
      GRAPH_CERTIFICATE_THUMBPRINT: '0123456789abcdef0123456789abcdef01234567',
    });
    assert.equal(invalid.configuration, undefined);
    assert.match(invalid.error || '', /valid, unencrypted RSA PEM private key/);
    assert.doesNotMatch(invalid.error || '', /not a private key/);
  });
});

describe('Microsoft Graph email delivery', () => {
  it('authenticates app-only and sends branded HTML, recipients, and file attachments through the configured mailbox', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const provider = createMicrosoftGraphEmailProvider({
      environment: clientSecretEnvironment(),
      fetcher: async (input, init) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes('login.microsoftonline.com')) {
          const form = new URLSearchParams(String(init?.body));
          assert.equal(form.get('grant_type'), 'client_credentials');
          assert.equal(form.get('client_id'), CLIENT_ID);
          assert.equal(form.get('scope'), 'https://graph.microsoft.com/.default');
          assert.equal(form.get('client_secret'), 'test-client-secret');
          return new Response(JSON.stringify({ access_token: 'mock-access-token', expires_in: 3600 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        assert.equal(url, `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MICROSOFT_GRAPH_SENDER_EMAIL)}/sendMail`);
        assert.equal(init?.method, 'POST');
        const headers = init?.headers as Record<string, string>;
        assert.equal(headers.authorization, 'Bearer mock-access-token');
        const request = JSON.parse(String(init?.body));
        assert.deepEqual(request.message.from.emailAddress, {
          name: MICROSOFT_GRAPH_SENDER_NAME,
          address: MICROSOFT_GRAPH_SENDER_EMAIL,
        });
        assert.deepEqual(request.message.toRecipients, [
          { emailAddress: { address: 'manager@example.test' } },
          { emailAddress: { address: 'accounting@example.test' } },
        ]);
        assert.equal(request.message.body.contentType, 'HTML');
        assert.match(request.message.body.content, /<a href="https:\/\/tracker\.example\.test\/approve">Approve<\/a>/);
        assert.deepEqual(request.message.attachments, [
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: 'weekly-report.csv',
            contentType: 'text/csv; charset=utf-8',
            contentBytes: Buffer.from('Request ID,Status\nSPF-123,Pending', 'utf8').toString('base64'),
          },
        ]);
        assert.equal(request.saveToSentItems, true);
        return new Response(null, {
          status: 202,
          headers: { 'request-id': 'graph-request-123' },
        });
      },
    });

    const result = await provider.sendEmail({
      to: ['manager@example.test', 'accounting@example.test'],
      subject: 'Weekly report',
      html: '<a href="https://tracker.example.test/approve">Approve</a>',
      idempotencyKey: 'weekly-report-2026-10-19',
      attachments: [{
        filename: 'weekly-report.csv',
        content: 'Request ID,Status\nSPF-123,Pending',
        contentType: 'text/csv; charset=utf-8',
      }],
    });

    assert.equal(provider.isConfigured, true);
    assert.equal(result.success, true);
    assert.equal(result.status, 'accepted');
    assert.equal(result.acceptedByProvider, true);
    assert.equal(calls.length, 2);
    assert.match(result.providerResponse || '', /"httpStatus":202/);
    assert.match(result.providerResponse || '', /graph-request-123/);
  });

  it('creates a signed client assertion for certificate app-only authentication', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const thumbprintHex = '0123456789abcdef0123456789abcdef01234567';
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const provider = createMicrosoftGraphEmailProvider({
      environment: {
        GRAPH_TENANT_ID: TENANT_ID,
        GRAPH_CLIENT_ID: CLIENT_ID,
        GRAPH_AUTH_MODE: 'certificate',
        GRAPH_CERTIFICATE_PRIVATE_KEY: privateKey,
        GRAPH_CERTIFICATE_THUMBPRINT: thumbprintHex,
      },
      now: () => Date.parse('2026-11-17T12:00:00.000Z'),
      fetcher: async (input, init) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes('login.microsoftonline.com')) {
          const form = new URLSearchParams(String(init?.body));
          assert.equal(form.get('grant_type'), 'client_credentials');
          assert.equal(form.get('client_assertion_type'), 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
          const assertion = form.get('client_assertion') || '';
          const [encodedHeader, encodedClaims, encodedSignature] = assertion.split('.');
          const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
          const claims = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8'));
          assert.equal(header.alg, 'RS256');
          assert.equal(header.x5t, Buffer.from(thumbprintHex, 'hex').toString('base64url'));
          assert.equal(claims.iss, CLIENT_ID);
          assert.equal(claims.sub, CLIENT_ID);
          assert.equal(claims.aud, url);
          assert.equal(
            verify(
              'RSA-SHA256',
              Buffer.from(`${encodedHeader}.${encodedClaims}`),
              publicKey,
              Buffer.from(encodedSignature, 'base64url')
            ),
            true
          );
          return new Response(JSON.stringify({ access_token: 'mock-certificate-token' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(null, { status: 202 });
      },
    });

    assert.equal(provider.isConfigured, true);
    const result = await provider.sendEmail({
      to: 'rep@example.test',
      subject: 'Decision',
      html: '<p>Approved</p>',
    });
    assert.equal(result.success, true);
    assert.equal(calls.length, 2);
  });

  it('reports authentication and sendMail errors safely and does not retry or fall back', async () => {
    const loggedErrors: string[] = [];
    let graphCalls = 0;
    const authFailure = createMicrosoftGraphEmailProvider({
      environment: clientSecretEnvironment(),
      logError: (message) => loggedErrors.push(message),
      fetcher: async () => new Response(
        JSON.stringify({ error: 'invalid_client', error_description: 'private-secret-value' }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      ),
    });
    const authResult = await authFailure.sendEmail({
      to: 'rep@example.test',
      subject: 'Test',
      html: '<p>Test</p>',
    });
    assert.equal(authResult.success, false);
    assert.match(authResult.error || '', /authentication failed \(HTTP 401; invalid_client\)/);
    assert.doesNotMatch(authResult.error || '', /private-secret-value|test-client-secret/);
    assert.equal(loggedErrors.length, 1);

    const sendFailure = createMicrosoftGraphEmailProvider({
      environment: clientSecretEnvironment(),
      logError: (message) => loggedErrors.push(message),
      fetcher: async (input) => {
        if (String(input).includes('login.microsoftonline.com')) {
          return new Response(JSON.stringify({ access_token: 'mock-access-token' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        graphCalls += 1;
        return new Response(
          JSON.stringify({ error: { code: 'ErrorAccessDenied', message: 'Not authorized' } }),
          { status: 403, headers: { 'content-type': 'application/json' } }
        );
      },
    });
    const sendResult = await sendFailure.sendEmail({
      to: 'rep@example.test',
      subject: 'Test',
      html: '<p>Test</p>',
    });
    assert.equal(sendResult.success, false);
    assert.match(sendResult.error || '', /sendMail failed \(HTTP 403; ErrorAccessDenied\)/);
    assert.equal(graphCalls, 1);
    assert.equal(loggedErrors.length, 2);
  });

  it('fails clearly when Graph is selected but its credentials are missing', async () => {
    const loggedErrors: string[] = [];
    const provider = createMicrosoftGraphEmailProvider({
      environment: {},
      logError: (message) => loggedErrors.push(message),
      fetcher: async () => {
        throw new Error('The mocked fetch must not be called.');
      },
    });
    const result = await provider.sendEmail({
      to: 'rep@example.test',
      subject: 'Test',
      html: '<p>Test</p>',
    });
    assert.equal(provider.isConfigured, false);
    assert.equal(result.success, false);
    assert.match(result.error || '', /GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_AUTH_MODE/);
    assert.equal(loggedErrors.length, 1);
  });
});
