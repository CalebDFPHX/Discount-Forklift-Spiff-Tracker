import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.AUTH_SECRET = 'unit-test-only-admin-invitation-secret';
process.env.DATABASE_URL = '';
process.env.APP_URL = 'https://spiff-invitation.test';

const { memoryStore } = await import('../src/lib/repository.js');
const {
  consumeAdminAuthToken,
  createAdminAuthToken,
  verifyAdminAuthToken,
} = await import('../src/lib/authTokens.js');
const { createCsrfToken, createSessionToken } = await import('../src/lib/sessionAuth.js');
const { getInviteableNotificationContacts } = await import('../src/lib/generalManagerAccess.js');
const { default: app } = await import('../src/server/app.js');

const ADMIN_EMAIL = 'admin.invitation.actor@example.test';
const APPROVER_EMAIL = 'approver.invitation.actor@example.test';
const NEW_ADMIN_EMAIL = 'new.invited.admin@example.test';
const CONTACT_APPROVER_EMAIL = 'existing.approver@example.test';
const GM_EMAIL = 'existing.gm@example.test';
const ACCOUNTING_EMAIL = 'ineligible.accounting@example.test';
const BRANCH_ID = 'br_invitation_test';
const INACTIVE_BRANCH_ID = 'br_invitation_inactive_test';
const SUBMISSION_ID = 'SPF-INVITATION-PRESERVE';
const FIXTURE_ACCOUNT_EMAILS = new Set([
  ADMIN_EMAIL,
  APPROVER_EMAIL,
  NEW_ADMIN_EMAIL,
  CONTACT_APPROVER_EMAIL,
  GM_EMAIL,
  ACCOUNTING_EMAIL,
]);

let server: ReturnType<typeof app.listen>;
let baseUrl = '';

function fixtureContact(input: {
  id: string;
  name: string;
  email: string;
  role: 'Accounting' | 'General Manager' | 'Approving Manager' | 'Other';
  branch?: string | null;
  isActive?: boolean;
}) {
  const now = new Date().toISOString();
  return {
    id: input.id,
    name: input.name,
    email: input.email,
    role: input.role,
    branch: input.branch ?? null,
    isDefaultAccounting: false,
    isActive: input.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  };
}

function cleanupFixtures() {
  const fixtureAccountIds = memoryStore.adminUsers
    .filter((user) => FIXTURE_ACCOUNT_EMAILS.has(user.email.toLowerCase()))
    .map((user) => user.id);
  memoryStore.adminAuthTokens = memoryStore.adminAuthTokens.filter(
    (token) => !fixtureAccountIds.includes(token.adminId)
  );
  memoryStore.adminUsers = memoryStore.adminUsers.filter(
    (user) => !FIXTURE_ACCOUNT_EMAILS.has(user.email.toLowerCase())
  );
  memoryStore.branches = memoryStore.branches.filter(
    (branch) => branch.id !== BRANCH_ID && branch.id !== INACTIVE_BRANCH_ID
  );
  memoryStore.contacts = memoryStore.contacts.filter(
    (contact) => !contact.id.startsWith('contact_invitation_test_')
  );
  memoryStore.submissions = memoryStore.submissions.filter((submission) => submission.id !== SUBMISSION_ID);
  memoryStore.auditEvents = memoryStore.auditEvents.filter((event) => event.submissionId !== SUBMISSION_ID);
}

function addFixtures() {
  cleanupFixtures();
  const now = new Date().toISOString();
  memoryStore.branches.push(
    {
      id: BRANCH_ID,
      name: 'Invitation Branch',
      isActive: true,
      displayOrder: 990,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: INACTIVE_BRANCH_ID,
      name: 'Inactive Invitation Branch',
      isActive: false,
      displayOrder: 991,
      createdAt: now,
      updatedAt: now,
    }
  );
  memoryStore.contacts.push(
    fixtureContact({
      id: 'contact_invitation_test_approver',
      name: 'Existing Approver',
      email: CONTACT_APPROVER_EMAIL,
      role: 'Approving Manager',
    }),
    fixtureContact({
      id: 'contact_invitation_test_gm',
      name: 'Existing General Manager',
      email: GM_EMAIL,
      role: 'General Manager',
      branch: 'Invitation Branch',
    }),
    fixtureContact({
      id: 'contact_invitation_test_unassigned_gm',
      name: 'Unassigned General Manager',
      email: 'unassigned.gm@example.test',
      role: 'General Manager',
    }),
    fixtureContact({
      id: 'contact_invitation_test_accounting',
      name: 'Accounting Contact',
      email: ACCOUNTING_EMAIL,
      role: 'Accounting',
    }),
    fixtureContact({
      id: 'contact_invitation_test_inactive',
      name: 'Inactive Approver',
      email: 'inactive.approver@example.test',
      role: 'Approving Manager',
      isActive: false,
    })
  );
  memoryStore.adminUsers.push(
    {
      id: 'admin_invitation_actor',
      email: ADMIN_EMAIL,
      name: 'Invitation Administrator',
      role: 'Administrator',
      passwordHash: null,
      isAuthorized: true,
      mustChangePassword: false,
      lastLoginAt: null,
      passwordChangedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'approver_invitation_actor',
      email: APPROVER_EMAIL,
      name: 'Invitation Approving Manager',
      role: 'Approving Manager',
      passwordHash: null,
      isAuthorized: true,
      mustChangePassword: false,
      lastLoginAt: null,
      passwordChangedAt: null,
      createdAt: now,
      updatedAt: now,
    }
  );
  memoryStore.submissions.push({
    id: SUBMISSION_ID,
    repId: 'rep_invitation_test',
    branchId: BRANCH_ID,
    spiffId: 'spiff_invitation_test',
    liftName: 'Preserved Forklift',
    serialSuffix: '4321',
    saleDate: '2026-10-19',
    notes: 'Keep this ledger record unchanged',
    status: 'Approved',
    snapshotRepName: 'Preserved Representative',
    snapshotRepEmail: null,
    snapshotBranchName: 'Invitation Branch',
    snapshotSpiffName: 'Preserved Spiff',
    snapshotEligibilityRequirements: '',
    snapshotAmountCents: 5000,
    isHalfSpiffAmount: false,
    isPotentialDuplicate: false,
    submittedAt: now,
    approvedAt: now,
    approvedBy: ADMIN_EMAIL,
    paidAt: null,
    paidBy: null,
    attachments: [],
    auditEvents: [],
  });
  memoryStore.auditEvents.push({
    id: 'audit_invitation_test_preserved',
    submissionId: SUBMISSION_ID,
    action: 'Approved',
    performedBy: ADMIN_EMAIL,
    explanation: 'Historical audit record must remain intact.',
    timestamp: now,
  });
}

function authHeaders(email = ADMIN_EMAIL, role = 'Administrator') {
  return {
    authorization: `Bearer ${createSessionToken(email, email, role)}`,
    'x-csrf-token': createCsrfToken(email),
    'content-type': 'application/json',
  };
}

async function postJson(
  path: string,
  body: Record<string, unknown>,
  email = ADMIN_EMAIL,
  role = 'Administrator'
) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: authHeaders(email, role),
    body: JSON.stringify(body),
  });
}

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(addFixtures);

after(async () => {
  cleanupFixtures();
  if (server?.listening) {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

describe('secure login invitations', () => {
  it('invites a new Administrator through the single-use password setup flow', async () => {
    const response = await postJson('/api/admin/invite', {
      email: NEW_ADMIN_EMAIL,
      name: 'New Administrator',
      role: 'Administrator',
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.match(body.inviteUrl, /setup_token=/);
    assert.equal(body.token, undefined);
    const user = memoryStore.adminUsers.find((candidate) => candidate.email === NEW_ADMIN_EMAIL);
    assert.equal(user?.role, 'Administrator');
    assert.equal(user?.passwordHash, null);

    const token = new URL(body.inviteUrl).searchParams.get('setup_token');
    assert.ok(token);
    const verification = await verifyAdminAuthToken(token);
    assert.equal(verification.isValid, true);
    assert.equal(verification.tokenRecord?.tokenType, 'invite');
    assert.notEqual(verification.tokenRecord?.tokenHash, token);
    const setup = await consumeAdminAuthToken(token, 'InviteeChosenPassword123');
    assert.equal(setup.success, true);
    assert.ok(memoryStore.adminUsers.find((candidate) => candidate.email === NEW_ADMIN_EMAIL)?.passwordHash);
    assert.equal((await verifyAdminAuthToken(token)).isValid, false);

    const duplicate = await postJson('/api/admin/invite', {
      email: NEW_ADMIN_EMAIL,
      role: 'Administrator',
    });
    assert.equal(duplicate.status, 409);
    assert.equal(
      memoryStore.adminUsers.filter((candidate) => candidate.email === NEW_ADMIN_EMAIL).length,
      1
    );
  });

  it('invites eligible existing contacts without changing their role or branch assignment', async () => {
    const originalApprover = structuredClone(
      memoryStore.contacts.find((contact) => contact.id === 'contact_invitation_test_approver')
    );
    const originalGm = structuredClone(
      memoryStore.contacts.find((contact) => contact.id === 'contact_invitation_test_gm')
    );
    const submissionBefore = structuredClone(
      memoryStore.submissions.find((submission) => submission.id === SUBMISSION_ID)
    );
    const auditBefore = structuredClone(
      memoryStore.auditEvents.find((event) => event.submissionId === SUBMISSION_ID)
    );

    const approverResponse = await postJson('/api/admin/invite-contact', {
      contactId: 'contact_invitation_test_approver',
    });
    const approverBody = await approverResponse.json();
    assert.equal(approverResponse.status, 200);
    assert.equal(approverBody.contact.role, 'Approving Manager');
    assert.equal(
      memoryStore.adminUsers.find((user) => user.email === CONTACT_APPROVER_EMAIL)?.role,
      'Approving Manager'
    );

    const gmResponse = await postJson('/api/admin/invite-contact', {
      contactId: 'contact_invitation_test_gm',
    });
    const gmBody = await gmResponse.json();
    assert.equal(gmResponse.status, 200);
    assert.equal(gmBody.contact.role, 'General Manager');
    assert.equal(
      memoryStore.adminUsers.find((user) => user.email === GM_EMAIL)?.role,
      'General Manager'
    );
    assert.match(gmBody.inviteUrl, /setup_token=/);
    assert.equal(
      (await verifyAdminAuthToken(new URL(gmBody.inviteUrl).searchParams.get('setup_token')!))
        .isValid,
      true
    );

    assert.deepEqual(
      memoryStore.contacts.find((contact) => contact.id === 'contact_invitation_test_approver'),
      originalApprover
    );
    assert.deepEqual(
      memoryStore.contacts.find((contact) => contact.id === 'contact_invitation_test_gm'),
      originalGm
    );
    assert.deepEqual(
      memoryStore.submissions.find((submission) => submission.id === SUBMISSION_ID),
      submissionBefore
    );
    assert.deepEqual(
      memoryStore.auditEvents.find((event) => event.submissionId === SUBMISSION_ID),
      auditBefore
    );
  });

  it('offers only active eligible contacts without an account or a valid GM branch assignment', () => {
    const inviteable = getInviteableNotificationContacts(
      memoryStore.contacts.filter((contact) =>
        contact.id.startsWith('contact_invitation_test_')
      ),
      memoryStore.branches,
      [CONTACT_APPROVER_EMAIL]
    );

    assert.deepEqual(
      inviteable.map((contact) => contact.id),
      ['contact_invitation_test_gm']
    );
  });

  it('lets an Approving Manager invite an eligible contact without changing its role', async () => {
    const response = await postJson(
      '/api/admin/invite-contact',
      { contactId: 'contact_invitation_test_approver' },
      APPROVER_EMAIL,
      'Approving Manager'
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.contact.role, 'Approving Manager');
    assert.equal(
      memoryStore.adminUsers.find((user) => user.email === CONTACT_APPROVER_EMAIL)?.role,
      'Approving Manager'
    );
  });

  it('prevents duplicate contact accounts and rejects role escalation attempts', async () => {
    const first = await postJson('/api/admin/invite-contact', {
      contactId: 'contact_invitation_test_approver',
    });
    assert.equal(first.status, 200);

    const duplicate = await postJson('/api/admin/invite-contact', {
      contactId: 'contact_invitation_test_approver',
    });
    assert.equal(duplicate.status, 409);
    assert.equal(
      memoryStore.adminUsers.filter((user) => user.email === CONTACT_APPROVER_EMAIL).length,
      1
    );

    const contactWithRoleOverride = await postJson('/api/admin/invite-contact', {
      contactId: 'contact_invitation_test_gm',
      role: 'Administrator',
    });
    assert.equal(contactWithRoleOverride.status, 400);
    assert.equal(memoryStore.adminUsers.some((user) => user.email === GM_EMAIL), false);

    const contactEmailThroughAdminFlow = await postJson('/api/admin/invite', {
      email: CONTACT_APPROVER_EMAIL,
      role: 'Administrator',
    });
    assert.equal(contactEmailThroughAdminFlow.status, 409);

    const promoteLinkedAccount = await fetch(
      `${baseUrl}/api/admin/users/${memoryStore.adminUsers.find((user) => user.email === CONTACT_APPROVER_EMAIL)!.id}/role`,
      {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ role: 'Administrator' }),
      }
    );
    assert.equal(promoteLinkedAccount.status, 400);
    assert.equal(
      memoryStore.adminUsers.find((user) => user.email === CONTACT_APPROVER_EMAIL)?.role,
      'Approving Manager'
    );

    const approverCreatesAdmin = await postJson(
      '/api/admin/invite',
      { email: NEW_ADMIN_EMAIL, role: 'Administrator' },
      APPROVER_EMAIL,
      'Approving Manager'
    );
    assert.equal(approverCreatesAdmin.status, 403);
    assert.equal(memoryStore.adminUsers.some((user) => user.email === NEW_ADMIN_EMAIL), false);
  });

  it('rejects inactive, ineligible, and branch-unassigned contacts on the server', async () => {
    const accounting = await postJson('/api/admin/invite-contact', {
      contactId: 'contact_invitation_test_accounting',
    });
    assert.equal(accounting.status, 403);

    const inactive = await postJson('/api/admin/invite-contact', {
      contactId: 'contact_invitation_test_inactive',
    });
    assert.equal(inactive.status, 404);

    const unassignedGm = await postJson('/api/admin/invite-contact', {
      contactId: 'contact_invitation_test_unassigned_gm',
    });
    assert.equal(unassignedGm.status, 400);
    assert.equal(memoryStore.adminUsers.some((user) => user.email === ACCOUNTING_EMAIL), false);
    assert.equal(memoryStore.adminUsers.some((user) => user.email === 'unassigned.gm@example.test'), false);
  });
});
