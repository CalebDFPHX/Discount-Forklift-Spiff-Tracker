import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

process.env.NODE_ENV = 'test';
process.env.AUTH_SECRET = 'unit-test-only-general-manager-secret';
process.env.DATABASE_URL = '';

const { Repository, memoryStore } = await import('../src/lib/repository.js');
const { hashPassword } = await import('../src/lib/auth.js');
const { createEmailDecisionToken } = await import('../src/lib/emailDecisionTokens.js');
const { getAdminTabsForRole } = await import('../src/lib/generalManagerAccess.js');
const { default: app } = await import('../src/server/app.js');
const { Header } = await import('../src/components/Header.js');
const { AdminRequestDetailModal } = await import('../src/components/AdminRequestDetailModal.js');

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
});

const GM_EMAIL = 'gm.access@example.test';
const GM_PASSWORD = 'BranchOnly123';
const OWN_BRANCH_ID = 'br_gm_access_test';
const OUTSIDE_BRANCH_ID = 'br_gm_outside_test';
const PENDING_ID = 'SPF-GM-PENDING';
const APPROVED_ID = 'SPF-GM-APPROVED';
const OUTSIDE_ID = 'SPF-GM-OUTSIDE';
const APP_URL = 'http://127.0.0.1';
let server: ReturnType<typeof app.listen>;
let baseUrl = '';

function fixtureSubmission(
  id: string,
  branchId: string,
  status: 'Pending' | 'Approved' = 'Pending'
) {
  const now = '2026-10-19T12:00:00.000Z';
  return {
    id,
    repId: `rep_${id}`,
    branchId,
    spiffId: 'spiff_test',
    liftName: 'Test Forklift',
    serialSuffix: '1234',
    saleDate: '2026-10-18',
    notes: 'Authorized submission details',
    status,
    snapshotRepName: `Rep ${id}`,
    snapshotRepEmail: null,
    snapshotBranchName: branchId === OWN_BRANCH_ID ? 'GM Assigned Branch' : 'Other Branch',
    snapshotSpiffName: 'Test Spiff',
    snapshotEligibilityRequirements: '',
    snapshotAmountCents: 12500,
    isHalfSpiffAmount: false,
    isPotentialDuplicate: false,
    submittedAt: now,
    approvedAt: status === 'Approved' ? now : null,
    approvedBy: status === 'Approved' ? 'approver@example.test' : null,
    paidAt: null,
    paidBy: null,
    attachments: [],
    auditEvents: [],
  };
}

function setupFixtures() {
  const now = new Date().toISOString();
  for (const id of [OWN_BRANCH_ID, OUTSIDE_BRANCH_ID]) {
    memoryStore.branches = memoryStore.branches.filter((branch) => branch.id !== id);
  }
  memoryStore.branches.push(
    {
      id: OWN_BRANCH_ID,
      name: 'GM Assigned Branch',
      isActive: true,
      displayOrder: 900,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: OUTSIDE_BRANCH_ID,
      name: 'Other Branch',
      isActive: true,
      displayOrder: 901,
      createdAt: now,
      updatedAt: now,
    }
  );
  memoryStore.contacts = memoryStore.contacts.filter((contact) => contact.id !== 'contact_gm_access_test');
  memoryStore.contacts.push({
    id: 'contact_gm_access_test',
    name: 'Test General Manager',
    email: GM_EMAIL,
    role: 'General Manager',
    branch: 'GM Assigned Branch',
    isDefaultAccounting: false,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  memoryStore.adminUsers = memoryStore.adminUsers.filter((user) => user.id !== 'admin_gm_access_test');
  memoryStore.adminUsers.push({
    id: 'admin_gm_access_test',
    email: GM_EMAIL,
    name: 'Test General Manager',
    role: 'General Manager',
    passwordHash: hashPassword(GM_PASSWORD),
    isAuthorized: true,
    mustChangePassword: false,
    lastLoginAt: null,
    passwordChangedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  memoryStore.reps = memoryStore.reps.filter((rep) => rep.id !== 'rep_gm_only_assignment_test');
  memoryStore.reps.push({
    id: 'rep_gm_only_assignment_test',
    name: 'Rep Assignment Must Not Grant Branch Access',
    email: null,
    branch: 'Other Branch',
    assignedGmIds: 'contact_gm_access_test',
    isActive: true,
    displayOrder: 900,
    createdAt: now,
    updatedAt: now,
  });
  memoryStore.submissions = memoryStore.submissions.filter(
    (submission) => ![PENDING_ID, APPROVED_ID, OUTSIDE_ID].includes(submission.id)
  );
  memoryStore.submissions.push(
    fixtureSubmission(PENDING_ID, OWN_BRANCH_ID),
    fixtureSubmission(APPROVED_ID, OWN_BRANCH_ID, 'Approved'),
    fixtureSubmission(OUTSIDE_ID, OUTSIDE_BRANCH_ID)
  );
  memoryStore.auditEvents = memoryStore.auditEvents.filter(
    (event) => ![PENDING_ID, APPROVED_ID, OUTSIDE_ID].includes(event.submissionId)
  );
}

function cleanupFixtures() {
  memoryStore.branches = memoryStore.branches.filter(
    (branch) => ![OWN_BRANCH_ID, OUTSIDE_BRANCH_ID].includes(branch.id)
  );
  memoryStore.contacts = memoryStore.contacts.filter((contact) => contact.id !== 'contact_gm_access_test');
  memoryStore.adminUsers = memoryStore.adminUsers.filter((user) => user.id !== 'admin_gm_access_test');
  memoryStore.reps = memoryStore.reps.filter((rep) => rep.id !== 'rep_gm_only_assignment_test');
  memoryStore.submissions = memoryStore.submissions.filter(
    (submission) => ![PENDING_ID, APPROVED_ID, OUTSIDE_ID].includes(submission.id)
  );
  memoryStore.auditEvents = memoryStore.auditEvents.filter(
    (event) => ![PENDING_ID, APPROVED_ID, OUTSIDE_ID].includes(event.submissionId)
  );
}

async function login() {
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: GM_EMAIL, password: GM_PASSWORD }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.role, 'General Manager');
  assert.equal(typeof body.csrfToken, 'string');
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie);
  return {
    cookie: setCookie.split(';')[0],
    csrfToken: body.csrfToken,
  };
}

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `${APP_URL}:${address.port}`;
});

beforeEach(() => {
  setupFixtures();
});

afterEach(() => cleanupFixtures());

after(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe('General Manager access', () => {
  it('allows active GM accounts to sign in and requires direct branch assignment', async () => {
    const session = await login();
    const sessionResponse = await fetch(`${baseUrl}/api/admin/session`, {
      headers: { cookie: session.cookie },
    });
    const body = await sessionResponse.json();
    assert.equal(body.authenticated, true);
    assert.equal(body.user.role, 'General Manager');

    memoryStore.contacts = memoryStore.contacts.map((contact) =>
      contact.id === 'contact_gm_access_test' ? { ...contact, branch: null } : contact
    );
    const unassignedLogin = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: GM_EMAIL, password: GM_PASSWORD }),
    });
    assert.equal(unassignedLogin.status, 403);
  });

  it('renders only ledger navigation and read-only submission details for GMs', () => {
    assert.deepEqual(getAdminTabsForRole('General Manager'), ['ledger']);
    assert.deepEqual(getAdminTabsForRole('Administrator'), [
      'ledger',
      'spiffs',
      'reps',
      'contacts',
      'branches',
      'settings',
    ]);

    const header = renderToStaticMarkup(
      React.createElement(Header, {
        currentView: 'admin',
        onNavigate: () => undefined,
        adminUser: GM_EMAIL,
        adminRole: 'General Manager',
        onAdminLoginClick: () => undefined,
        onAdminLogout: () => undefined,
        isNeonConnected: true,
      })
    );
    assert.match(header, />Ledger</);
    assert.doesNotMatch(header, /Rep Form|Admin Login|Neon Connected/);

    const details = renderToStaticMarkup(
      React.createElement(AdminRequestDetailModal, {
        submission: fixtureSubmission(APPROVED_ID, OWN_BRANCH_ID, 'Approved'),
        isOpen: true,
        onClose: () => undefined,
        adminUser: GM_EMAIL,
        onOpenDecisionModal: () => undefined,
        onMarkPaid: async () => undefined,
        onCorrect: async () => undefined,
        canReopenDenied: false,
        onReopenDenied: async () => undefined,
        onViewPhoto: () => undefined,
        canRecoverPaidReceipt: false,
        readOnly: true,
        onRecoverPaidReceipt: async () => [],
        onRetryPaidReceipt: async () => {
          throw new Error('Not available in read-only view');
        },
      })
    );
    assert.doesNotMatch(details, /Correct Details|Approve Request|Deny Request|Mark as Paid|Reopen as Pending|Recover receipt/);
    assert.match(details, /Authorized submission details/);
  });

  it('scopes ledger filters and details to assigned branch IDs on the server', async () => {
    const session = await login();
    const headers = { cookie: session.cookie };
    const allResponse = await fetch(`${baseUrl}/api/admin/submissions`, { headers });
    const allBody = await allResponse.json();
    assert.deepEqual(allBody.submissions.map((submission: { id: string }) => submission.id), [
      PENDING_ID,
      APPROVED_ID,
    ]);
    assert.deepEqual(allBody.availableReps.map((rep: { id: string }) => rep.id), [
      `rep_${APPROVED_ID}`,
      `rep_${PENDING_ID}`,
    ]);

    const outsideFilter = await fetch(
      `${baseUrl}/api/admin/submissions?repId=rep_${OUTSIDE_ID}`,
      { headers }
    );
    assert.deepEqual((await outsideFilter.json()).submissions, []);

    const ownDetail = await fetch(`${baseUrl}/api/admin/submissions/${PENDING_ID}`, { headers });
    assert.equal(ownDetail.status, 200);
    const outsideDetail = await fetch(`${baseUrl}/api/admin/submissions/${OUTSIDE_ID}`, { headers });
    assert.equal(outsideDetail.status, 404);
  });

  it('blocks GM access to non-ledger APIs and all in-app mutations', async () => {
    const session = await login();
    const headers = {
      cookie: session.cookie,
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    };

    for (const path of [
      '/api/admin/status',
      '/api/admin/users',
      '/api/admin/contacts',
      '/api/admin/spiffs',
      '/api/admin/export/csv',
    ]) {
      const response = await fetch(`${baseUrl}${path}`, { headers });
      assert.equal(response.status, 403, `${path} should be inaccessible to GMs`);
    }

    for (const [path, method, body] of [
      [`/api/admin/submissions/${PENDING_ID}/decide`, 'POST', { decision: 'approve' }],
      [`/api/admin/submissions/${APPROVED_ID}/pay`, 'POST', {}],
      [`/api/admin/submissions/${PENDING_ID}/correct`, 'POST', { liftName: 'Changed' }],
      [`/api/admin/submissions/${PENDING_ID}`, 'DELETE', {}],
    ] as const) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 403, `${method} ${path} should be denied to GMs`);
    }
    assert.equal(memoryStore.submissions.find((submission) => submission.id === APPROVED_ID)?.status, 'Approved');
    assert.equal(memoryStore.submissions.find((submission) => submission.id === PENDING_ID)?.liftName, 'Test Forklift');
  });

  it('keeps the signed GM Mark as Paid email action available after app login', async () => {
    const session = await login();
    const token = createEmailDecisionToken(APPROVED_ID, 'paid', GM_EMAIL);
    const actionPage = await fetch(`${baseUrl}/api/email-actions/${token}`, {
      headers: { cookie: session.cookie },
    });
    assert.equal(actionPage.status, 200);

    const actionResponse = await fetch(`${baseUrl}/api/email-actions/${token}`, {
      method: 'POST',
      headers: {
        cookie: session.cookie,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'confirmation=paid',
    });
    assert.equal(actionResponse.status, 200);
    assert.match(await actionResponse.text(), /has been marked as paid/);
    assert.equal(memoryStore.submissions.find((submission) => submission.id === APPROVED_ID)?.status, 'Paid');
  });
});
