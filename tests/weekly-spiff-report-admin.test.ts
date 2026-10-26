import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.AUTH_SECRET = 'weekly-report-admin-test-secret';
process.env.DATABASE_URL = '';

const [{ default: app }, { createSessionToken, createCsrfToken }, { memoryStore }] =
  await Promise.all([
    import('../src/server/app.js'),
    import('../src/lib/sessionAuth.js'),
    import('../src/lib/repository.js'),
  ]);

const managerEmail = 'weekly-report-manager@example.test';
memoryStore.adminUsers = memoryStore.adminUsers.filter((user) => user.email !== managerEmail);
memoryStore.adminUsers.push({
  id: 'weekly-report-manager',
  email: managerEmail,
  name: 'Weekly Report Manager',
  role: 'Approving Manager',
  passwordHash: null,
  isAuthorized: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

let server: ReturnType<typeof app.listen>;
let baseUrl: string;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe('weekly Spiff report Administrator access', () => {
  it('blocks unauthenticated and Approving Manager preview and test-send requests', async () => {
    const initialTestRecords = memoryStore.weeklySpiffReportTestSends.length;
    const initialScheduledRecords = memoryStore.weeklySpiffReports.map((record) => ({ ...record }));

    const unauthenticatedPreview = await fetch(
      `${baseUrl}/api/admin/weekly-spiff-report/preview`
    );
    assert.equal(unauthenticatedPreview.status, 401);

    const unauthenticatedSend = await fetch(
      `${baseUrl}/api/admin/weekly-spiff-report/test-send`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ testEmail: 'test@example.test' }),
      }
    );
    assert.equal(unauthenticatedSend.status, 401);

    const managerToken = createSessionToken(
      managerEmail,
      'Weekly Report Manager',
      'Approving Manager'
    );
    const managerHeaders = {
      cookie: `spiff_admin_session=${managerToken}`,
      'x-csrf-token': createCsrfToken(managerEmail),
      'content-type': 'application/json',
    };
    const managerPreview = await fetch(
      `${baseUrl}/api/admin/weekly-spiff-report/preview`,
      { headers: managerHeaders }
    );
    assert.equal(managerPreview.status, 403);

    const managerSend = await fetch(
      `${baseUrl}/api/admin/weekly-spiff-report/test-send`,
      {
        method: 'POST',
        headers: managerHeaders,
        body: JSON.stringify({ testEmail: 'test@example.test' }),
      }
    );
    assert.equal(managerSend.status, 403);
    assert.equal(memoryStore.weeklySpiffReportTestSends.length, initialTestRecords);
    assert.deepEqual(memoryStore.weeklySpiffReports, initialScheduledRecords);
  });

  it('allows an Administrator to preview without recording or sending a report', async () => {
    const initialTestRecords = memoryStore.weeklySpiffReportTestSends.length;
    const initialScheduledRecords = memoryStore.weeklySpiffReports.map((record) => ({ ...record }));
    const adminEmail = 'caleb@discountforkliftphoenix.com';
    const token = createSessionToken(adminEmail, 'Test Administrator', 'Administrator');
    const response = await fetch(`${baseUrl}/api/admin/weekly-spiff-report/preview`, {
      headers: { cookie: `spiff_admin_session=${token}` },
    });
    const preview = await response.json();

    assert.equal(response.status, 200);
    assert.equal(preview.weekStart.length, 10);
    assert.equal(preview.weekEnd.length, 10);
    assert.equal(typeof preview.html, 'string');
    assert.match(preview.csv, /Request ID/);
    assert.equal(memoryStore.weeklySpiffReportTestSends.length, initialTestRecords);
    assert.deepEqual(memoryStore.weeklySpiffReports, initialScheduledRecords);
  });
});
