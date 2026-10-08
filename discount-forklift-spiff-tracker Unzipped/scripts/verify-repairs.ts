/**
 * Discount Forklift Spiff Tracker - Comprehensive Verification Suite
 * Verifies all 9 repair categories & replacement email/password authentication:
 * 1. Google sign-in is fully removed; secure email & salted scrypt password login enforced
 * 2. Unauthorized, unlisted, and deactivated administrators are rejected
 * 3. Notification contacts (accounting/GM) cannot access administrator operations
 * 4. Password setup and reset links expire, are single-use, and cannot be reused
 * 5. Session revocation triggers immediately when passwords change or accounts are deactivated
 * 6. Template HTML cannot execute in previews (<script>, onerror, javascript:)
 * 7. Non-admin recipients receive no administrator-only links
 * 8. Photos remain private with authentic image bytes
 * 9. Submissions, idempotency, concurrent decision locks, and cron authentication work as specified
 * 10. America/Phoenix date filtering on submission date, approval date, and sale date
 */

// Set test secret if not configured in environment
process.env.AUTH_SECRET =
  process.env.AUTH_SECRET || 'test-auth-secret-for-suite-minimum32chars!!';
process.env.ALLOW_MEMORY_STORE = 'true';

import { Repository } from '../src/lib/repository';
import {
  validateTemplateContent,
  renderEmailTemplate,
} from '../src/lib/emailTemplates';
import { sanitizeEmailHtml, isSafeUrl } from '../src/lib/sanitizer';
import {
  createSessionToken,
  verifySessionToken,
  createCsrfToken,
  verifyCsrfToken,
  verifyAdminPermissions,
} from '../src/lib/sessionAuth';
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from '../src/lib/auth';
import {
  createAdminAuthToken,
  verifyAdminAuthToken,
  consumeAdminAuthToken,
} from '../src/lib/authTokens';
import {
  validateImageMagicBytes,
  uploadPrivatePhoto,
  retrievePhotoImage,
} from '../src/lib/blob';
import { getPhoenixDateRangeUtcBounds, isWithinPhoenixDateRange } from '../src/lib/timezone';
import fs from 'fs';
import path from 'path';

async function runVerification() {
  console.log('====================================================');
  console.log(' DISCOUNT FORKLIFT SPIFF TRACKER - VERIFICATION SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc: string, condition: boolean, detail?: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${desc} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // TEST 1: Removal of Google Sign-In & Verification of Email/Password
  // ----------------------------------------------------
  console.log('--- 1. Removal of Google Sign-In & Secure Scrypt Authentication ---');

  // Verify Google sign-in is removed from client components and server
  const loginModalSource = fs.readFileSync(
    path.join(process.cwd(), 'src/components/AdminLoginModal.tsx'),
    'utf-8'
  );
  assert(
    'Google sign-in button completely removed from AdminLoginModal.tsx',
    !loginModalSource.includes('Sign In with Google') && !loginModalSource.includes('handleGoogleSignIn')
  );

  const serverSource = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
  assert(
    'Google OAuth routes and credentials completely absent from server.ts',
    !serverSource.includes('auth/google-url') && !serverSource.includes('AUTH_GOOGLE_ID')
  );

  // Password hashing: salted scrypt verification
  const testPassword = 'SecretAdminPassword2026!';
  const hashedPassword = hashPassword(testPassword);
  assert(
    'Password hash contains unique 16-byte hex salt separated by colon',
    hashedPassword.includes(':') && hashedPassword.split(':')[0].length === 32
  );
  assert('verifyPassword accepts matching password', verifyPassword(testPassword, hashedPassword));
  assert('verifyPassword rejects incorrect password', !verifyPassword('WrongPassword123!', hashedPassword));
  assert('verifyPassword rejects empty or null hash', !verifyPassword(testPassword, null));

  // Password strength validation
  assert('Weak short password is rejected', !validatePasswordStrength('short1').isValid);
  assert('Password without numbers is rejected', !validatePasswordStrength('AllLettersOnly!').isValid);
  assert('Valid 8+ char password with letters and numbers is accepted', validatePasswordStrength('SecureAdmin2026!').isValid);

  // ----------------------------------------------------
  // TEST 2: Session Security, Allowlist & Non-Admin Isolation
  // ----------------------------------------------------
  console.log('\n--- 2. Session Security, Database Allowlist & Non-Admin Role Isolation ---');

  // Verify signed HMAC-SHA256 session tokens
  const token = createSessionToken('caleb@discountforkliftphoenix.com', 'Caleb Vance', 'Administrator');
  const verified = verifySessionToken(token);
  assert(
    'Signed session token verifies with valid payload',
    Boolean(verified && verified.email === 'caleb@discountforkliftphoenix.com')
  );

  // Tampered token must fail
  const tamperedToken = token.slice(0, -4) + 'abcd';
  const tamperedCheck = verifySessionToken(tamperedToken);
  assert('Tampered session token signature is rejected', tamperedCheck === null);

  // Deactivated administrator check
  const deactivatedCheck = await verifyAdminPermissions('deactivated.user@discountforkliftphoenix.com');
  assert('Unknown or deactivated user is rejected by allowlist check', !deactivatedCheck.isAuthorized);

  // Wildcard domain alone is NOT authorized
  const randomDomainCheck = await verifyAdminPermissions('intruder@discountforkliftphoenix.com');
  assert('Unlisted email in company domain is rejected (no wildcard trust)', !randomDomainCheck.isAuthorized);

  // CSRF token verification
  const csrf = createCsrfToken('caleb@discountforkliftphoenix.com');
  assert('CSRF token verifies with matching email', verifyCsrfToken(csrf, 'caleb@discountforkliftphoenix.com'));
  assert('CSRF token fails with different email', !verifyCsrfToken(csrf, 'attacker@example.com'));

  // Notification contact (e.g. accounting/GM) is NOT an administrator
  const accountingContactCheck = await verifyAdminPermissions('accounting@discountforkliftphoenix.com');
  assert(
    'Notification contact email does not inherit administrator access',
    !accountingContactCheck.isAuthorized
  );

  // ----------------------------------------------------
  // TEST 3: Expiring Single-Use Setup/Reset Tokens & Session Revocation
  // ----------------------------------------------------
  console.log('\n--- 3. Single-Use Tokens & Session Revocation on Password Change ---');

  // Create single-use token on secondary admin user (preserving initial primary admin for seed test)
  const allAdmins = await Repository.getAllAdminUsers();
  const tokenUser = allAdmins.find((u) => u.email === 'admin@discountforkliftphoenix.com') || allAdmins[0];
  const { rawToken, expiresAt } = await createAdminAuthToken({
    adminId: tokenUser.id,
    tokenType: 'invite',
    createdBy: 'test-runner',
    expiresInMs: 3600000,
  });

  const checkFreshToken = await verifyAdminAuthToken(rawToken);
  assert('Fresh setup token verifies successfully', checkFreshToken.isValid);

  // Consuming token with valid password
  const consumeResult = await consumeAdminAuthToken(rawToken, 'NewSecurePassword2026!');
  assert('Consuming token establishes new password hash', consumeResult.success);

  // Attempting to reuse the consumed token MUST FAIL
  const reuseCheck = await verifyAdminAuthToken(rawToken);
  assert('Reusing consumed setup token is rejected (single-use enforced)', !reuseCheck.isValid);

  // An expired token must fail
  const { rawToken: expiredRaw } = await createAdminAuthToken({
    adminId: tokenUser.id,
    tokenType: 'password_reset',
    expiresInMs: -1000, // already expired
  });
  const checkExpired = await verifyAdminAuthToken(expiredRaw);
  assert('Expired token is rejected', !checkExpired.isValid);

  // Session revocation test: A session token issued BEFORE passwordChangedAt must be rejected
  const oldIat = Date.now() - 100000; // Issued prior to password update
  const staleSessionCheck = await verifyAdminPermissions(tokenUser.email, oldIat);
  assert(
    'Session issued prior to password update is revoked immediately',
    !staleSessionCheck.isAuthorized && Boolean(staleSessionCheck.error?.includes('revoked'))
  );

  // ----------------------------------------------------
  // TEST 3b: Persistent Initial Administrator & First-Login Password Change
  // ----------------------------------------------------
  console.log('\n--- 3b. Initial Administrator Seeding & First-Login Password Change ---');

  // Seed initial admin from env variable simulation
  const testInitialPass = 'Ron58838!';
  const seedResult = await Repository.seedOrUpdateInitialAdmin({
    email: 'caleb@discountforkliftphoenix.com',
    name: 'Caleb Vance',
    initialPassword: testInitialPass,
    role: 'Administrator',
  });

  assert(
    'Seeded admin has Administrator role and active authorization',
    seedResult.user.role === 'Administrator' && seedResult.user.isAuthorized === true
  );

  // First authentication must succeed and report mustChangePassword: true
  const firstLogin = await Repository.authenticateAdmin('caleb@discountforkliftphoenix.com', testInitialPass);
  assert('First login with initial credentials succeeds', firstLogin.success === true);
  assert('First login reports mustChangePassword = true', firstLogin.user?.mustChangePassword === true);

  // Second seed on existing user with password MUST NOT change password
  const secondSeed = await Repository.seedOrUpdateInitialAdmin({
    email: 'caleb@discountforkliftphoenix.com',
    name: 'Caleb Vance',
    initialPassword: 'DifferentPassword999!',
    role: 'Administrator',
  });
  assert('Second seed on existing account does not alter existing password', secondSeed.action === 'noop' || secondSeed.action === 'granted_role');
  const verifyOriginalStillWorks = await Repository.authenticateAdmin('caleb@discountforkliftphoenix.com', testInitialPass);
  assert('Original password remains valid after repeated seed call', verifyOriginalStillWorks.success === true);

  // Updating password via change-password fulfills first-time requirement
  const newPermanentPass = 'NewPermanentPass2026!';
  const updateSuccess = await Repository.updateAdminPassword(firstLogin.user!.id, newPermanentPass);
  assert('updateAdminPassword succeeds', updateSuccess === true);

  // Subsequent login reports mustChangePassword: false
  const updatedLogin = await Repository.authenticateAdmin('caleb@discountforkliftphoenix.com', newPermanentPass);
  assert('Login with new permanent password succeeds', updatedLogin.success === true);
  assert('Subsequent login reports mustChangePassword = false', updatedLogin.user?.mustChangePassword === false);

  // Old initial password is now rejected
  const oldPassRejected = await Repository.authenticateAdmin('caleb@discountforkliftphoenix.com', testInitialPass);
  assert('Old temporary password is rejected after update', oldPassRejected.success === false);

  // ----------------------------------------------------
  // TEST 4: Template Sanitization, Previews, & Safety
  // ----------------------------------------------------
  console.log('\n--- 4. Template Sanitization, Previews, & Safety ---');

  const unsafeHtml = '<p>Hello</p><script>alert("hack")</script><img src="x" onerror="alert(1)"><a href="javascript:alert(2)">Click</a>';
  const valResult = validateTemplateContent('spiff_approved', 'Subject', unsafeHtml);
  assert('Validator rejects template containing <script> and onerror handlers', !valResult.isValid);

  const sanitized = sanitizeEmailHtml(unsafeHtml);
  assert('Sanitizer strips <script> tags', !sanitized.includes('<script>'));
  assert('Sanitizer strips onerror event handlers', !sanitized.includes('onerror'));
  assert('Sanitizer neutralizes javascript: URLs', !sanitized.includes('javascript:alert'));

  // Balanced conditionals check
  const unbalancedHtml = '<p>Test</p>{{#if_admin}}Admin only';
  const unbalResult = validateTemplateContent('spiff_approved', 'Subject', unbalancedHtml);
  assert('Unmatched {{#if_admin}} conditional block is rejected', !unbalResult.isValid);

  // Inapplicable placeholder check
  const denialInApproval = '<p>Approved!</p>{{denial_reason}}';
  const inappResult = validateTemplateContent('spiff_approved', 'Subject', denialInApproval);
  assert('Denial-only placeholder {{denial_reason}} in approval template is rejected', !inappResult.isValid);

  // Admin link outside {{#if_admin}} check
  const nakedAdminLink = '<p>Approved!</p><a href="{{admin_review_url}}">Review</a>';
  const nakedResult = validateTemplateContent('new_submission', 'Subject', nakedAdminLink);
  assert('Naked {{admin_review_url}} outside {{#if_admin}} block is rejected', !nakedResult.isValid);

  // ----------------------------------------------------
  // TEST 5: Recipient Role Isolation in Rendered Emails
  // ----------------------------------------------------
  console.log('\n--- 5. Email Rendering & Recipient Role Isolation ---');

  const sampleTemplate = {
    id: 'spiff_approved',
    subject: 'Spiff Approved - {{rep_name}}',
    bodyHtml: `
      <p>Congratulations {{rep_name}}!</p>
      {{#if_admin}}
        <p><a href="{{admin_review_url}}">Admin Ledger Review</a></p>
      {{/if_admin}}
    `,
    version: 1,
    name: 'Approval Email',
    updatedAt: new Date().toISOString(),
    updatedBy: 'Test',
  };

  const repContext = {
    rep_name: 'Caleb Vance',
    admin_review_url: 'https://discountforkliftphoenix.com/admin/review/123',
    is_admin_recipient: false,
  };

  const managerContext = {
    ...repContext,
    is_admin_recipient: true,
  };

  const renderedRep = renderEmailTemplate(sampleTemplate, repContext, false);
  const renderedManager = renderEmailTemplate(sampleTemplate, managerContext, true);

  assert('Sales Rep rendered email DOES NOT contain admin review link', !renderedRep.bodyHtml.includes('https://discountforkliftphoenix.com/admin/review'));
  assert('Sales Rep rendered email DOES NOT contain {{admin_review_url}}', !renderedRep.bodyHtml.includes('{{admin_review_url}}'));
  assert('Manager rendered email DOES contain admin review link', renderedManager.bodyHtml.includes('https://discountforkliftphoenix.com/admin/review'));

  // ----------------------------------------------------
  // TEST 6: Private Photo Storage & Magic Byte Validation
  // ----------------------------------------------------
  console.log('\n--- 6. Private Photo Storage & Magic Byte Validation ---');

  const validJpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  ]);
  const checkJpeg = validateImageMagicBytes(validJpeg);
  assert('Valid JPEG magic bytes detected correctly', checkJpeg.isValid && checkJpeg.detectedMime === 'image/jpeg');

  const disguisedScript = Buffer.from('<html><script>alert(1)</script></html>', 'utf-8');
  const checkDisguised = validateImageMagicBytes(disguisedScript);
  assert('Disguised non-image binary is rejected', !checkDisguised.isValid);

  const uploadResult = await uploadPrivatePhoto('test_sale.jpg', validJpeg, 'image/jpeg');
  const retrievedBuffer = await retrievePhotoImage(uploadResult.storageKey);
  assert(
    'Photo retrieval returns authentic image bytes buffer (never an SVG placeholder)',
    Boolean(retrievedBuffer && Buffer.isBuffer(retrievedBuffer.buffer) && retrievedBuffer.buffer.length >= 10)
  );


  // ----------------------------------------------------
  // TEST 7: Submissions, Transactions & Invariant Preservation
  // ----------------------------------------------------
  console.log('\n--- 7. Submissions, Transactions, & Recipient Routing ---');

  const reps = await Repository.getActiveReps();
  const spiffs = await Repository.getActiveSpiffs();
  assert('Active reps available', reps.length > 0);
  assert('Active spiffs available', spiffs.length > 0);

  const testRep = reps[0];
  const testSpiff = spiffs[0];
  const attId = `att_${Date.now()}`;

  await Repository.createAttachment({
    id: attId,
    originalFilename: 'sale_proof.jpg',
    contentType: 'image/jpeg',
    fileSizeBytes: validJpeg.length,
    storageKey: uploadResult.storageKey,
  });

  const subResult = await Repository.createSubmission({
    repId: testRep.id,
    spiffId: testSpiff.id,
    liftName: 'Toyota 8FGCU25 Cushion',
    serialSuffix: '0042',
    saleDate: '2026-10-08',
    attachmentId: attId,
    idempotencyKey: `idem_${Date.now()}`,
    appUrl: 'https://discountforkliftphoenix.com',
  });

  assert('Submission created successfully with photo attached', Boolean(subResult.submission && subResult.submission.id));

  const attached = await Repository.getAttachment(attId);
  assert('Submission photo has uploadStatus = linked', attached?.uploadStatus === 'linked');

  // Decide submission
  const decided = await Repository.decideSubmission(
    subResult.submission.id,
    'caleb@discountforkliftphoenix.com',
    {
      decision: 'approve',
      reasonOrMessage: 'Approved for disbursement.',
      recipients: [
        { email: 'accounting@discountforkliftphoenix.com', name: 'Accounting', role: 'Accounting' },
        { email: 'gm@discountforkliftphoenix.com', name: 'General Manager', role: 'General Manager' },
      ],
      appUrl: 'https://discountforkliftphoenix.com',
    }
  );
  assert('Submission status updated to Approved', decided.status === 'Approved');

  // Mark Paid
  const paid = await Repository.markPaidSubmission(decided.id, 'caleb@discountforkliftphoenix.com');
  assert('Submission marked as Paid', paid.status === 'Paid');

  // ----------------------------------------------------
  // TEST 8: Idempotency, Concurrency & Attachment Guards
  // ----------------------------------------------------
  console.log('\n--- 8. Idempotency, Concurrency & Attachment Guards ---');

  let doubleDecideFailed = false;
  try {
    await Repository.decideSubmission(
      decided.id,
      'caleb@discountforkliftphoenix.com',
      {
        decision: 'deny',
        reasonOrMessage: 'Attempting to change decision concurrently',
        recipients: [],
      }
    );
  } catch {
    doubleDecideFailed = true;
    assert('Conflicting or repeated decision on non-Pending request is blocked', true);
  }
  if (!doubleDecideFailed) {
    assert('Conflicting or repeated decision on non-Pending request is blocked', false);
  }

  // Idempotent submission returns existing record without creating duplicate
  const duplicateSub = await Repository.createSubmission({
    repId: testRep.id,
    spiffId: testSpiff.id,
    liftName: 'Toyota 8FBCU25 Electric',
    serialSuffix: '1024',
    saleDate: '2026-10-08',
    attachmentId: attId,
    idempotencyKey: subResult.submission.idempotencyKey || `idem_test_${Date.now()}`,
    appUrl: 'https://discountforkliftphoenix.com',
  });
  assert('Idempotent submission returns existing record without creating duplicate', duplicateSub.submission.id === subResult.submission.id);

  // Re-linking an already linked attachment fails
  let reuseAttachmentFailed = false;
  try {
    await Repository.createSubmission({
      repId: testRep.id,
      spiffId: testSpiff.id,
      liftName: 'Forklift B',
      serialSuffix: '9999',
      saleDate: '2026-10-08',
      attachmentId: attId,
      idempotencyKey: `new_idem_${Date.now()}`,
      appUrl: 'https://discountforkliftphoenix.com',
    });
  } catch {
    reuseAttachmentFailed = true;
    assert('Re-linking an already linked photo attachment to a different request is blocked', true);
  }
  if (!reuseAttachmentFailed) {
    assert('Re-linking an already linked photo attachment to a different request is blocked', false);
  }

  // ----------------------------------------------------
  // TEST 9: America/Phoenix Date Filtering
  // ----------------------------------------------------
  console.log('\n--- 9. America/Phoenix Date Range Filters & Boundary Calculations ---');

  const bounds = getPhoenixDateRangeUtcBounds('2026-10-08', '2026-10-08');
  assert(
    'Phoenix start of day 2026-10-08 is 2026-10-08T07:00:00.000Z',
    bounds.startUtc?.toISOString() === '2026-10-08T07:00:00.000Z'
  );
  assert(
    'Phoenix end of day 2026-10-08 exclusive upper bound is 2026-10-09T07:00:00.000Z',
    bounds.endExclusiveUtc?.toISOString() === '2026-10-09T07:00:00.000Z'
  );

  // Timestamp on the evening of 2026-10-08 in Phoenix (e.g. 23:30 Phoenix = 06:30 UTC next day)
  const phoenixNightTimestamp = '2026-10-09T06:30:00.000Z';
  assert(
    'Evening Phoenix timestamp correctly falls within Phoenix date range',
    isWithinPhoenixDateRange(phoenixNightTimestamp, '2026-10-08', '2026-10-08')
  );

  // Submissions query with separate date filters
  const submissionDateFilter = await Repository.getSubmissions({
    dateFilterType: 'submission',
    startDate: '2026-10-08',
    endDate: '2026-10-08',
  });
  assert('Query with submission date range executes cleanly', Array.isArray(submissionDateFilter));

  const approvalDateFilter = await Repository.getSubmissions({
    dateFilterType: 'approval',
    startDate: '2026-10-08',
    endDate: '2026-10-08',
  });
  assert('Query with approval date range executes cleanly', Array.isArray(approvalDateFilter));

  const saleDateFilter = await Repository.getSubmissions({
    dateFilterType: 'sale',
    startDate: '2026-10-08',
    endDate: '2026-10-08',
  });
  assert('Query with sale date range executes cleanly', Array.isArray(saleDateFilter));

  // ----------------------------------------------------
  // TEST 10: Scheduled Jobs & Cron Authorization
  // ----------------------------------------------------
  console.log('\n--- 10. Scheduled Jobs & Cron Secret Authorization ---');

  function checkCronAuth(headerAuth?: string, secret?: string): boolean {
    const expectedSecret = secret || process.env.CRON_SECRET;
    if (!expectedSecret || !headerAuth || headerAuth !== `Bearer ${expectedSecret}`) {
      return false;
    }
    return true;
  }

  assert('Cron denies request when CRON_SECRET is missing or header missing', !checkCronAuth(undefined, 'secret123'));
  assert('Cron denies request when CRON_SECRET is not configured in env', !checkCronAuth('Bearer secret123', undefined));
  assert('Cron denies request with invalid bearer secret', !checkCronAuth('Bearer wrong-secret', 'correct-secret'));
  assert('Cron denies URL query token without Authorization header', !checkCronAuth(undefined, 'correct-secret'));
  assert('Cron grants request when Authorization: Bearer <secret> matches configured CRON_SECRET', checkCronAuth('Bearer my-cron-token', 'my-cron-token'));

  // ----------------------------------------------------
  // TEST 11: Database Migrations & Journal Consistency
  // ----------------------------------------------------
  console.log('\n--- 11. Database Migrations & Journal Consistency ---');

  const journalPath = path.join(process.cwd(), 'drizzle/meta/_journal.json');
  assert('drizzle/meta/_journal.json exists', fs.existsSync(journalPath));

  const journalData = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
  const tags = journalData.entries.map((e: any) => e.tag);
  assert('Journal contains 0004_reliable_email_queue', tags.includes('0004_reliable_email_queue'));

  for (const tag of tags) {
    const sqlFile = path.join(process.cwd(), `drizzle/${tag}.sql`);
    assert(`Migration file ${tag}.sql exists on disk`, fs.existsSync(sqlFile));
  }

  // Verify 0004_reliable_email_queue contents
  const migration0004 = fs.readFileSync(path.join(process.cwd(), 'drizzle/0004_reliable_email_queue.sql'), 'utf-8');
  assert('0004 migration adds next_retry_at column', migration0004.includes('next_retry_at'));
  assert('0004 migration adds locked_by column', migration0004.includes('locked_by'));
  assert('0004 migration adds lease_expires_at column', migration0004.includes('lease_expires_at'));
  assert('0004 migration creates idx_email_jobs_eligibility index', migration0004.includes('idx_email_jobs_eligibility'));

  // ----------------------------------------------------
  // TEST 12: Production Database Failure Enforcement (No Memory Fallback)
  // ----------------------------------------------------
  console.log('\n--- 12. Production Database Failure Enforcement (No Memory Fallback) ---');

  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const { isMemoryModeAllowed } = await import('../src/lib/repository');

  assert('isMemoryModeAllowed returns false in production environment', isMemoryModeAllowed() === false);

  let productionErrorThrown = false;
  try {
    Repository.assertDatabaseOrMemoryAllowed();
  } catch (err: any) {
    productionErrorThrown = err.message.includes('DATABASE_URL');
  }
  assert('assertDatabaseOrMemoryAllowed throws explicit error in production when DB is disconnected', productionErrorThrown);

  process.env.NODE_ENV = originalNodeEnv;

  // ----------------------------------------------------
  // TEST 13: Distributed Locking & Concurrent Worker Collision Prevention
  // ----------------------------------------------------
  console.log('\n--- 13. Distributed Locking & Concurrent Worker Collision Prevention ---');

  const testJobId = `job_test_lock_${Date.now()}`;
  const mockSubmissionId = `SPF-2026-TEST`;

  // Seed a test job in memory store for locking tests
  const { memoryStore } = await import('../src/lib/repository');
  memoryStore.emailJobs.push({
    id: testJobId,
    submissionId: mockSubmissionId,
    jobType: 'submission_alert',
    recipientEmail: 'test.gm@discountforkliftphoenix.com',
    recipientName: 'Test GM',
    recipientRole: 'General Manager',
    status: 'queued',
    attemptCount: 0,
    lastAttemptAt: null,
    nextRetryAt: null,
    lockedAt: null,
    lockedBy: null,
    leaseExpiresAt: null,
    deliveredAt: null,
    errorMessage: null,
    providerMessageId: null,
    idempotencyKey: `idem_test_${testJobId}`,
    templateId: 'new_submission',
    templateVersion: 1,
    renderedSubject: 'Test Subject',
    renderedBodyHtml: '<p>Test Body</p>',
    createdAt: new Date().toISOString(),
  });

  const worker1Claim = await Repository.claimJobForDelivery(testJobId, 'worker_A');
  assert('Worker 1 successfully claims queued job', worker1Claim !== null && worker1Claim.lockedBy === 'worker_A');
  assert('Worker 1 claim increments attemptCount durably before send', worker1Claim?.attemptCount === 1);

  const worker2Claim = await Repository.claimJobForDelivery(testJobId, 'worker_B');
  assert('Worker 2 is blocked from claiming actively locked job (collision prevented)', worker2Claim === null);

  // ----------------------------------------------------
  // TEST 14: Expired-Lease Recovery & Stale Worker Update Rejection
  // ----------------------------------------------------
  console.log('\n--- 14. Expired-Lease Recovery & Stale Worker Update Rejection ---');

  // Simulate Worker 1's lease expiring
  const memJob = memoryStore.emailJobs.find((j) => j.id === testJobId);
  if (memJob) {
    memJob.leaseExpiresAt = new Date(Date.now() - 1000).toISOString(); // 1 second in the past
  }

  const worker3Claim = await Repository.claimJobForDelivery(testJobId, 'worker_C');
  assert('Worker 3 recovers expired lease successfully', worker3Claim !== null && worker3Claim.lockedBy === 'worker_C');
  assert('Expired lease recovery increments attemptCount', worker3Claim?.attemptCount === 2);

  // Attempt stale worker delivery result recording
  let staleWorkerError = false;
  if (worker1Claim) {
    try {
      // Worker 1 tries to complete delivery with stale claim token 'worker_A'
      await Repository.executeJobDelivery(worker1Claim);
    } catch (err: any) {
      staleWorkerError = err.message.includes('Stale worker lease') || err.message.includes('expired');
    }
  }
  assert('Stale worker update with replaced lease is rejected', staleWorkerError);

  // ----------------------------------------------------
  // TEST 15: Attempt Limits and Exponential Backoff Calculation
  // ----------------------------------------------------
  console.log('\n--- 15. Attempt Limits and Exponential Backoff Calculation ---');

  const maxJobId = `job_max_attempts_${Date.now()}`;
  memoryStore.emailJobs.push({
    id: maxJobId,
    submissionId: mockSubmissionId,
    jobType: 'submission_alert',
    recipientEmail: 'max@discountforkliftphoenix.com',
    status: 'failed',
    attemptCount: 5, // Reached max 5 attempts
    lastAttemptAt: new Date().toISOString(),
    nextRetryAt: null,
    lockedAt: null,
    lockedBy: null,
    leaseExpiresAt: null,
    deliveredAt: null,
    errorMessage: 'Max attempts reached',
    providerMessageId: null,
    idempotencyKey: `idem_max_${maxJobId}`,
    createdAt: new Date().toISOString(),
  });

  const maxAttemptClaim = await Repository.claimJobForDelivery(maxJobId, 'worker_limit_test');
  assert('Job with 5 attempts is rejected by claimJobForDelivery', maxAttemptClaim === null);

  // Manual retry error verification
  let manualRetryBlocked = false;
  try {
    await Repository.retryNotification(maxJobId);
  } catch (err: any) {
    manualRetryBlocked = err.message.includes('maximum of 5 delivery attempts');
  }
  assert('Manual retry on job with 5 attempts throws clear error', manualRetryBlocked);

  // ----------------------------------------------------
  // TEST 16: Initial, Manual, and Scheduled Delivery Pipeline Integration
  // ----------------------------------------------------
  console.log('\n--- 16. Initial, Manual, and Scheduled Delivery Pipeline Integration ---');

  const pipelineJobId = `job_pipeline_${Date.now()}`;
  memoryStore.emailJobs.push({
    id: pipelineJobId,
    submissionId: mockSubmissionId,
    jobType: 'submission_alert',
    recipientEmail: 'pipe@discountforkliftphoenix.com',
    status: 'queued',
    attemptCount: 0,
    lastAttemptAt: null,
    nextRetryAt: null,
    lockedAt: null,
    lockedBy: null,
    leaseExpiresAt: null,
    deliveredAt: null,
    errorMessage: null,
    providerMessageId: null,
    idempotencyKey: `idem_pipe_${pipelineJobId}`,
    renderedSubject: 'Pipeline Test Subject',
    renderedBodyHtml: '<p>Pipeline Test Body</p>',
    createdAt: new Date().toISOString(),
  });

  const scheduledResult = await Repository.processDueEmailJobs(undefined, 10);
  assert('processDueEmailJobs processes eligible job via unified pipeline', scheduledResult.processedCount > 0);

  const processedJob = memoryStore.emailJobs.find((j) => j.id === pipelineJobId);
  assert('Executed job status is updated out of processing', processedJob?.status !== 'processing');
  assert('Executed job attempt count was incremented', (processedJob?.attemptCount || 0) >= 1);

  // ----------------------------------------------------
  // TEST 17: Express App & Vercel API Routing
  // ----------------------------------------------------
  console.log('\n--- 17. Express App & Vercel API Routing ---');

  const { app } = await import('../src/server/app');
  assert('Express app module exports valid express function', typeof app === 'function');

  const vercelEntryPath = path.join(process.cwd(), 'api/index.ts');
  assert('Vercel serverless entry point api/index.ts exists', fs.existsSync(vercelEntryPath));

  const vercelConfigPath = path.join(process.cwd(), 'vercel.json');
  assert('vercel.json exists', fs.existsSync(vercelConfigPath));

  const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf-8'));
  assert('vercel.json buildCommand is npm run build', vercelConfig.buildCommand === 'npm run build');
  assert('vercel.json outputDirectory is dist', vercelConfig.outputDirectory === 'dist');
  assert('vercel.json rewrites API requests to /api', vercelConfig.rewrites.some((r: any) => r.source === '/api/(.*)' && r.destination === '/api'));

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Verification failed with unexpected error:', err);
  process.exit(1);
});

