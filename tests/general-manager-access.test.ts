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
const { createCsrfToken, createSessionToken } = await import('../src/lib/sessionAuth.js');
const { getAdminTabsForRole } = await import('../src/lib/generalManagerAccess.js');
const { default: app } = await import('../src/server/app.js');
const { Header } = await import('../src/components/Header.js');
const { AdminRequestDetailModal } = await import('../src/components/AdminRequestDetailModal.js');
const { AdminLedger, LedgerMarkPaidAction } = await import('../src/components/AdminLedger.js');

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
const OUTSIDE_APPROVED_ID = 'SPF-GM-OUTSIDE-APPROVED';
const REJECTED_ID = 'SPF-GM-REJECTED';
const PAID_ID = 'SPF-GM-PAID';
const ADMIN_APPROVED_ID = 'SPF-ADMIN-PAY-APPROVED';
const APPROVER_APPROVED_ID = 'SPF-APPROVER-PAY-APPROVED';
const PAYMENT_PERMISSION_ACCOUNT_IDS = [
  'admin_payment_permission_test',
  'approver_payment_permission_test',
];
const APP_URL = 'http://127.0.0.1';
let server: ReturnType<typeof app.listen>;
let baseUrl = '';

function fixtureSubmission(
  id: string,
  branchId: string,
  status: 'Pending' | 'Approved' | 'Rejected' | 'Paid' = 'Pending'
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
    approvedAt: status === 'Approved' || status === 'Paid' ? now : null,
    approvedBy: status === 'Approved' || status === 'Paid' ? 'approver@example.test' : null,
    rejectedAt: status === 'Rejected' ? now : null,
    rejectedBy: status === 'Rejected' ? 'approver@example.test' : null,
    rejectionReason: status === 'Rejected' ? 'Test rejection' : null,
    paidAt: status === 'Paid' ? now : null,
    paidBy: status === 'Paid' ? 'approver@example.test' : null,
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
  memoryStore.adminUsers = memoryStore.adminUsers.filter(
    (user) => !PAYMENT_PERMISSION_ACCOUNT_IDS.includes(user.id)
  );
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
    (submission) =>
      ![PENDING_ID, APPROVED_ID, OUTSIDE_ID, OUTSIDE_APPROVED_ID, REJECTED_ID, PAID_ID].includes(
        submission.id
      ) && ![ADMIN_APPROVED_ID, APPROVER_APPROVED_ID].includes(submission.id)
  );
  memoryStore.submissions.push(
    fixtureSubmission(PENDING_ID, OWN_BRANCH_ID),
    fixtureSubmission(APPROVED_ID, OWN_BRANCH_ID, 'Approved'),
    fixtureSubmission(OUTSIDE_ID, OUTSIDE_BRANCH_ID)
  );
  memoryStore.auditEvents = memoryStore.auditEvents.filter(
    (event) =>
      ![PENDING_ID, APPROVED_ID, OUTSIDE_ID, OUTSIDE_APPROVED_ID, REJECTED_ID, PAID_ID].includes(
        event.submissionId
      ) && ![ADMIN_APPROVED_ID, APPROVER_APPROVED_ID].includes(event.submissionId)
  );
}

function cleanupFixtures() {
  memoryStore.branches = memoryStore.branches.filter(
    (branch) => ![OWN_BRANCH_ID, OUTSIDE_BRANCH_ID].includes(branch.id)
  );
  memoryStore.contacts = memoryStore.contacts.filter((contact) => contact.id !== 'contact_gm_access_test');
  memoryStore.adminUsers = memoryStore.adminUsers.filter((user) => user.id !== 'admin_gm_access_test');
  memoryStore.adminUsers = memoryStore.adminUsers.filter(
    (user) => !PAYMENT_PERMISSION_ACCOUNT_IDS.includes(user.id)
  );
  memoryStore.reps = memoryStore.reps.filter((rep) => rep.id !== 'rep_gm_only_assignment_test');
  memoryStore.submissions = memoryStore.submissions.filter(
    (submission) =>
      ![PENDING_ID, APPROVED_ID, OUTSIDE_ID, OUTSIDE_APPROVED_ID, REJECTED_ID, PAID_ID].includes(
        submission.id
      ) && ![ADMIN_APPROVED_ID, APPROVER_APPROVED_ID].includes(submission.id) &&
      !submission.id.startsWith('SPF-GM-PAGE-')
  );
  memoryStore.auditEvents = memoryStore.auditEvents.filter(
    (event) =>
      ![PENDING_ID, APPROVED_ID, OUTSIDE_ID, OUTSIDE_APPROVED_ID, REJECTED_ID, PAID_ID].includes(
        event.submissionId
      ) && ![ADMIN_APPROVED_ID, APPROVER_APPROVED_ID].includes(event.submissionId) &&
      !event.submissionId.startsWith('SPF-GM-PAGE-')
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
        canMarkPaid: true,
        onRecoverPaidReceipt: async () => [],
        onRetryPaidReceipt: async () => {
          throw new Error('Not available in read-only view');
        },
      })
    );
    assert.match(details, /Mark as Paid \(Preserves Approval Date\)/);
    assert.doesNotMatch(details, /Correct Details|Approve Request|Deny Request|Reopen as Pending|Recover receipt/);
    assert.match(details, /Authorized submission details/);

    const pendingDetails = renderToStaticMarkup(
      React.createElement(AdminRequestDetailModal, {
        submission: fixtureSubmission(PENDING_ID, OWN_BRANCH_ID),
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
        canMarkPaid: true,
        readOnly: true,
        onRecoverPaidReceipt: async () => [],
        onRetryPaidReceipt: async () => {
          throw new Error('Not available in read-only view');
        },
      })
    );
    assert.doesNotMatch(pendingDetails, /Mark as Paid/);

    const paidAction = renderToStaticMarkup(
      React.createElement(LedgerMarkPaidAction, {
        submission: fixtureSubmission(APPROVED_ID, OWN_BRANCH_ID, 'Approved'),
        adminRole: 'General Manager',
        onMarkPaid: async () => undefined,
      })
    );
    assert.match(paidAction, /Mark as Paid/);

    const pendingPaidAction = renderToStaticMarkup(
      React.createElement(LedgerMarkPaidAction, {
        submission: fixtureSubmission(PENDING_ID, OWN_BRANCH_ID, 'Pending'),
        adminRole: 'General Manager',
        onMarkPaid: async () => undefined,
      })
    );
    assert.doesNotMatch(pendingPaidAction, /Mark as Paid/);

    const administratorPaidAction = renderToStaticMarkup(
      React.createElement(LedgerMarkPaidAction, {
        submission: fixtureSubmission(APPROVED_ID, OWN_BRANCH_ID, 'Approved'),
        adminRole: 'Administrator',
        onMarkPaid: async () => undefined,
      })
    );
    assert.doesNotMatch(administratorPaidAction, /Mark as Paid/);

    const ledger = renderToStaticMarkup(
      React.createElement(AdminLedger, {
        adminUser: GM_EMAIL,
        adminRole: 'General Manager',
        onOpenDetail: () => undefined,
        onViewPhoto: () => undefined,
        onApproveClick: () => undefined,
        onDenyClick: () => undefined,
        onMarkPaid: async () => undefined,
        reps: [],
        refreshTrigger: 0,
      })
    );
    assert.ok(ledger.indexOf('>Actions</th>') < ledger.indexOf('>Request ID</th>'));
    assert.match(ledger, /colSpan="16"/);
  });

  it('scopes ledger filters and details to assigned branch IDs on the server', async () => {
    const session = await login();
    const headers = { cookie: session.cookie };
    const allResponse = await fetch(`${baseUrl}/api/admin/submissions`, { headers });
    const allBody = await allResponse.json();
    assert.equal(allBody.pagination.pageSize, 10);
    assert.equal(allBody.pagination.page, 1);
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

  it('paginates filtered, sorted results and keeps General Manager totals branch-scoped', async () => {
    const session = await login();
    const headers = { cookie: session.cookie };
    const assigned = Array.from({ length: 10 }, (_, index) =>
      fixtureSubmission(`SPF-GM-PAGE-${String(index + 1).padStart(2, '0')}`, OWN_BRANCH_ID)
    );
    const outside = fixtureSubmission('SPF-GM-PAGE-OUTSIDE', OUTSIDE_BRANCH_ID);
    memoryStore.submissions.push(...assigned, outside);

    const firstPageResponse = await fetch(
      `${baseUrl}/api/admin/submissions?sortBy=rep&sortOrder=asc&page=1&pageSize=10`,
      { headers }
    );
    const firstPage = await firstPageResponse.json();
    assert.equal(firstPageResponse.status, 200);
    assert.equal(firstPage.pagination.totalCount, 12);
    assert.equal(firstPage.pagination.totalPages, 2);
    assert.equal(firstPage.pagination.page, 1);
    assert.equal(firstPage.pagination.pageSize, 10);
    assert.equal(firstPage.submissions.length, 10);
    assert.ok(firstPage.submissions.every((submission: { branchId: string }) => submission.branchId === OWN_BRANCH_ID));
    const firstPageRepNames = firstPage.submissions.map(
      (submission: { snapshotRepName: string }) => submission.snapshotRepName
    );
    assert.deepEqual(firstPageRepNames, [...firstPageRepNames].sort((a, b) => a.localeCompare(b)));

    const lastPageResponse = await fetch(
      `${baseUrl}/api/admin/submissions?sortBy=rep&sortOrder=asc&page=2&pageSize=10`,
      { headers }
    );
    const lastPage = await lastPageResponse.json();
    assert.equal(lastPage.pagination.page, 2);
    assert.equal(lastPage.submissions.length, 2);
    assert.deepEqual(
      [...firstPage.submissions, ...lastPage.submissions].map((submission: { id: string }) => submission.id).sort(),
      [PENDING_ID, APPROVED_ID, ...assigned.map((submission) => submission.id)].sort()
    );

    for (const size of [50, 100]) {
      const response = await fetch(
        `${baseUrl}/api/admin/submissions?page=1&pageSize=${size}`,
        { headers }
      );
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.pagination.pageSize, size);
      assert.equal(body.pagination.totalCount, 12);
      assert.equal(body.submissions.length, 12);
    }

    const filteredResponse = await fetch(
      `${baseUrl}/api/admin/submissions?status=Pending&search=PAGE&page=2&pageSize=10`,
      { headers }
    );
    const filtered = await filteredResponse.json();
    assert.equal(filtered.pagination.totalCount, 10);
    assert.equal(filtered.pagination.page, 1);
    assert.equal(filtered.submissions.length, 10);
    assert.ok(filtered.submissions.every((submission: { branchId: string; status: string }) =>
      submission.branchId === OWN_BRANCH_ID && submission.status === 'Pending'
    ));

    for (const query of ['page=0', 'page=1.5', 'pageSize=25', 'pageSize=10&pageSize=50']) {
      const response = await fetch(`${baseUrl}/api/admin/submissions?${query}`, { headers });
      assert.equal(response.status, 400, `Expected ${query} to be rejected`);
    }
  });

  it('blocks GM access to non-ledger APIs and other in-app mutations', async () => {
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

  it('allows an assigned GM to mark an approved submission paid once without duplicate notifications', async () => {
    const session = await login();
    const approvedAtBeforePayment = memoryStore.submissions.find(
      (submission) => submission.id === APPROVED_ID
    )?.approvedAt;
    const headers = {
      cookie: session.cookie,
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    };
    const emailJobCount = memoryStore.emailJobs.length;

    const responses = await Promise.all(
      [0, 1].map(() =>
        fetch(`${baseUrl}/api/admin/submissions/${APPROVED_ID}/pay`, {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        })
      )
    );
    assert.deepEqual(
      responses.map((response) => response.status).sort(),
      [200, 400]
    );
    const successBody = await responses[responses.findIndex((response) => response.status === 200)].json();
    assert.equal(successBody.submission.status, 'Paid');
    assert.equal(successBody.submission.paidBy, GM_EMAIL);
    assert.equal(successBody.submission.approvedAt, approvedAtBeforePayment);
    assert.equal(
      memoryStore.submissions.find((submission) => submission.id === APPROVED_ID)?.approvedAt,
      approvedAtBeforePayment
    );
    assert.equal(
      memoryStore.auditEvents.filter(
        (event) => event.submissionId === APPROVED_ID && event.action === 'marked_paid'
      ).length,
      1
    );

    assert.equal(
      memoryStore.auditEvents.filter(
        (event) => event.submissionId === APPROVED_ID && event.action === 'marked_paid'
      ).length,
      1
    );
    assert.equal(memoryStore.emailJobs.length, emailJobCount);
  });

  it('preserves Administrator and Approving Manager payment access', async () => {
    const now = new Date().toISOString();
    const actors = [
      {
        id: 'admin_payment_permission_test',
        email: 'admin.payment.permission@example.test',
        role: 'Administrator',
        submissionId: ADMIN_APPROVED_ID,
      },
      {
        id: 'approver_payment_permission_test',
        email: 'approver.payment.permission@example.test',
        role: 'Approving Manager',
        submissionId: APPROVER_APPROVED_ID,
      },
    ] as const;

    memoryStore.adminUsers.push(
      ...actors.map(({ id, email, role }) => ({
        id,
        email,
        name: email,
        role,
        passwordHash: null,
        isAuthorized: true,
        mustChangePassword: false,
        lastLoginAt: null,
        passwordChangedAt: null,
        createdAt: now,
        updatedAt: now,
      }))
    );
    memoryStore.submissions.push(
      ...actors.map(({ submissionId }) => fixtureSubmission(submissionId, OWN_BRANCH_ID, 'Approved'))
    );

    for (const actor of actors) {
      const response = await fetch(`${baseUrl}/api/admin/submissions/${actor.submissionId}/pay`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${createSessionToken(actor.email, actor.email, actor.role)}`,
          'x-csrf-token': createCsrfToken(actor.email),
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      assert.equal(response.status, 200, `${actor.role} payment should remain authorized`);
      assert.equal(
        memoryStore.submissions.find((submission) => submission.id === actor.submissionId)?.status,
        'Paid'
      );
    }
  });

  it('rejects GMs without an active branch assignment', async () => {
    const session = await login();
    memoryStore.contacts = memoryStore.contacts.map((contact) =>
      contact.id === 'contact_gm_access_test' ? { ...contact, branch: null } : contact
    );

    const response = await fetch(`${baseUrl}/api/admin/submissions/${APPROVED_ID}/pay`, {
      method: 'POST',
      headers: {
        cookie: session.cookie,
        'content-type': 'application/json',
        'x-csrf-token': session.csrfToken,
      },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 403);
    assert.equal(memoryStore.submissions.find((submission) => submission.id === APPROVED_ID)?.status, 'Approved');
  });

  it('rejects wrong-branch submissions and statuses other than Approved', async () => {
    memoryStore.submissions.push(
      fixtureSubmission(OUTSIDE_APPROVED_ID, OUTSIDE_BRANCH_ID, 'Approved'),
      fixtureSubmission(REJECTED_ID, OWN_BRANCH_ID, 'Rejected'),
      fixtureSubmission(PAID_ID, OWN_BRANCH_ID, 'Paid')
    );
    const session = await login();
    const headers = {
      cookie: session.cookie,
      'content-type': 'application/json',
      'x-csrf-token': session.csrfToken,
    };

    const wrongBranch = await fetch(
      `${baseUrl}/api/admin/submissions/${OUTSIDE_APPROVED_ID}/pay`,
      { method: 'POST', headers, body: JSON.stringify({}) }
    );
    assert.equal(wrongBranch.status, 404);
    assert.equal(
      memoryStore.submissions.find((submission) => submission.id === OUTSIDE_APPROVED_ID)?.status,
      'Approved'
    );

    for (const id of [PENDING_ID, REJECTED_ID, PAID_ID]) {
      const response = await fetch(`${baseUrl}/api/admin/submissions/${id}/pay`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      assert.equal(response.status, 400, `${id} must not be markable as paid`);
      assert.equal(
        memoryStore.auditEvents.filter(
          (event) => event.submissionId === id && event.action === 'marked_paid'
        ).length,
        0
      );
    }
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

    const duplicateActionResponse = await fetch(`${baseUrl}/api/email-actions/${token}`, {
      method: 'POST',
      headers: {
        cookie: session.cookie,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'confirmation=paid',
    });
    assert.equal(duplicateActionResponse.status, 400);
    assert.equal(
      memoryStore.auditEvents.filter(
        (event) => event.submissionId === APPROVED_ID && event.action === 'marked_paid'
      ).length,
      1
    );
  });
});
