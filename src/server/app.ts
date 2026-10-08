import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Repository } from '../lib/repository.js';
import {
  validateImageMagicBytes,
  uploadPrivatePhoto,
  retrievePhotoImage,
  generateUploadToken,
  MAX_FILE_SIZE_BYTES,
  isBlobConfigured,
} from '../lib/blob';
import {
  createSessionToken,
  verifySessionToken,
  createCsrfToken,
  verifyCsrfToken,
  verifyAdminPermissions,
} from '../lib/sessionAuth';
import {
  createAdminAuthToken,
  verifyAdminAuthToken,
  consumeAdminAuthToken,
} from '../lib/authTokens';
import { validatePasswordStrength, verifyPassword } from '../lib/auth';
import { createPersistentRateLimiter } from '../lib/rateLimiter';
import { isNeonConfigured } from '../db/index';
import { isResendConfigured, sendRenderedEmail } from '../lib/resend';
import { formatDollars } from '../lib/formatters';
import { formatPhoenixDate, formatPhoenixDateTime } from '../lib/timezone';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust reverse proxy (e.g. Google Cloud Run, Cloudflare, Vercel edge proxy)
// Ensures req.secure, req.protocol, and client IP headers are accurately recognized
app.set('trust proxy', 1);

// Canonical Application URL - Never construct trusted notification links from arbitrary request headers
const CANONICAL_APP_URL =
  process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://discountforkliftphoenix.com';

// Middleware for parsing JSON with 12MB limit for direct photo buffers
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

/**
 * Sets or clears the spiff_admin_session HttpOnly cookie with secure attributes.
 */
function setAdminSessionCookie(res: express.Response, req: express.Request, token: string | null) {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';
  const secureFlag = isHttps ? '; Secure' : '';

  if (token) {
    res.setHeader(
      'Set-Cookie',
      `spiff_admin_session=${encodeURIComponent(
        token
      )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secureFlag}`
    );
  } else {
    res.setHeader(
      'Set-Cookie',
      `spiff_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`
    );
  }
}

/**
 * SECURE ADMIN AUTHORIZATION GUARD
 */
async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  let token: string | null = null;

  // 1. Extract session token from Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  // 2. Or extract from secure httpOnly session cookie
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';');
    for (const c of cookies) {
      const [k, v] = c.trim().split('=');
      if (k === 'spiff_admin_session' && v) {
        token = decodeURIComponent(v);
        break;
      }
    }
  }

  if (!token) {
    return res.status(401).json({
      error: 'Administrator authentication required. Please sign in to access this resource.',
    });
  }

  const payload = verifySessionToken(token);
  if (!payload || !payload.email) {
    return res.status(401).json({
      error: 'Invalid or expired administrator session. Please sign in again.',
    });
  }

  // 3. Verify against explicit administrator allowlist in Neon
  const permCheck = await verifyAdminPermissions(payload.email, payload.iat);
  if (!permCheck.isAuthorized) {
    const isRevoked = permCheck.error?.toLowerCase().includes('revoked');
    return res.status(isRevoked ? 401 : 403).json({
      error: permCheck.error || 'Access denied: You are not authorized as an active administrator.',
    });
  }

  // 3b. Force password change if account is marked with mustChangePassword
  if (
    permCheck.user?.mustChangePassword &&
    req.path !== '/api/admin/change-password' &&
    req.path !== '/api/admin/logout'
  ) {
    return res.status(403).json({
      error: 'First-time login: Password change is required before accessing administrative features.',
      mustChangePassword: true,
    });
  }

  // 4. CSRF Protection for state-changing mutations
  const mutationMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (mutationMethods.includes(req.method.toUpperCase())) {
    const csrfToken =
      (req.headers['x-csrf-token'] as string) ||
      (req.body && req.body._csrf) ||
      (req.query && (req.query.csrf as string));

    if (!csrfToken || !verifyCsrfToken(csrfToken, payload.email)) {
      return res.status(403).json({
        error: 'Invalid or missing CSRF token. Request rejected for security.',
      });
    }
  }

  (req as any).adminUser = payload.email;
  (req as any).adminRole = permCheck.user?.role || payload.role || 'Administrator';
  next();
}

// ----------------------------------------------------
// Public Endpoints
// ----------------------------------------------------

// 1. Get active sales reps for submission form
app.get('/api/reps', async (req, res) => {
  try {
    const reps = await Repository.getActiveReps();
    res.json({ reps });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get active spiffs for submission form
app.get('/api/spiffs', async (req, res) => {
  try {
    const spiffs = await Repository.getActiveSpiffs();
    res.json({ spiffs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2b. Get active branches
app.get('/api/branches', async (req, res) => {
  try {
    const branches = await Repository.getActiveBranches();
    res.json({ branches });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2c. Administrator login
app.post(
  '/api/admin/login',
  createPersistentRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000, prefix: 'login_att' }),
  async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Please enter both administrator email and password.' });
      }
      const authResult = await Repository.authenticateAdmin(email, password);
      if (!authResult.success || !authResult.user) {
        return res.status(401).json({ error: authResult.error || 'Invalid credentials' });
      }

      const sessionToken = createSessionToken(
        authResult.user.email,
        authResult.user.name,
        authResult.user.role || 'Administrator'
      );
      const csrfToken = createCsrfToken(authResult.user.email);
      setAdminSessionCookie(res, req, sessionToken);

      res.json({
        success: true,
        email: authResult.user.email,
        name: authResult.user.name,
        role: authResult.user.role || 'Administrator',
        mustChangePassword: Boolean(authResult.user.mustChangePassword),
        csrfToken,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// 2d. Check current administrator session status
app.get('/api/admin/session', async (req, res) => {
  let token: string | null = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';');
    for (const c of cookies) {
      const [k, v] = c.trim().split('=');
      if (k === 'spiff_admin_session' && v) {
        token = decodeURIComponent(v);
        break;
      }
    }
  }

  if (!token) {
    return res.json({ authenticated: false });
  }

  const payload = verifySessionToken(token);
  if (!payload || !payload.email) {
    return res.json({ authenticated: false });
  }

  const permCheck = await verifyAdminPermissions(payload.email, payload.iat);
  if (!permCheck.isAuthorized) {
    return res.json({ authenticated: false, error: permCheck.error });
  }

  const csrfToken = createCsrfToken(payload.email);
  res.json({
    authenticated: true,
    user: {
      email: payload.email,
      name: payload.name || permCheck.user?.name,
      role: permCheck.user?.role || payload.role,
      mustChangePassword: Boolean(permCheck.user?.mustChangePassword),
    },
    csrfToken,
  });
});

// 2e. Administrator logout
app.post('/api/admin/logout', (req, res) => {
  setAdminSessionCookie(res, req, null);
  res.json({ success: true });
});

// 2f. Request password reset link
app.post(
  '/api/admin/forgot-password',
  createPersistentRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000, prefix: 'forgot_pwd' }),
  async (req, res) => {
    try {
      const { email } = req.body;
      if (email && typeof email === 'string') {
        const cleanEmail = email.trim().toLowerCase();
        const user = await Repository.getAdminUserByEmail(cleanEmail);
        if (user && user.isAuthorized) {
          const { rawToken } = await createAdminAuthToken({
            adminId: user.id,
            tokenType: 'password_reset',
            createdBy: 'Self-Service Password Reset',
          });
          const resetUrl = `${CANONICAL_APP_URL}/?setup_token=${rawToken}`;

          if (isResendConfigured) {
            try {
              await sendRenderedEmail({
                to: cleanEmail,
                subject: 'Discount Forklift Spiff Tracker — Administrator Password Reset',
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; background: #1e1e1e; color: #f3f4f6; border-radius: 8px;">
                    <h2 style="color: #95EA00; margin-bottom: 16px;">Password Reset Request</h2>
                    <p style="color: #d1d5db; line-height: 1.5;">An administrator password reset was requested for your account (<strong>${cleanEmail}</strong>).</p>
                    <p style="color: #d1d5db; line-height: 1.5;">Click below to set a new secure password. This single-use link expires in 1 hour:</p>
                    <div style="margin: 24px 0;">
                      <a href="${resetUrl}" style="background-color: #A559BD; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Reset Password</a>
                    </div>
                    <p style="color: #9ca3af; font-size: 12px; margin-top: 24px; border-top: 1px solid #374151; padding-top: 12px;">If you did not request this, please disregard this email. Your existing credentials remain safe.</p>
                  </div>
                `,
                idempotencyKey: `pwd_reset_${user.id}_${Date.now()}`,
              });
            } catch (err: any) {
              console.error('[ForgotPassword] Failed to dispatch reset email:', err);
            }
          } else {
            console.log(`[ForgotPassword] Generated dev/preview reset link for ${cleanEmail}: ${resetUrl}`);
          }
        }
      }

      return res.json({
        success: true,
        message: 'If an active administrator account exists with this email, a password reset link has been dispatched.',
      });
    } catch {
      return res.json({
        success: true,
        message: 'If an active administrator account exists with this email, a password reset link has been dispatched.',
      });
    }
  }
);

// 2g. Verify password setup / reset token
app.get('/api/admin/setup-password/verify', async (req, res) => {
  try {
    const token = req.query.token as string;
    if (!token) {
      return res.status(400).json({ valid: false, error: 'Setup token is required.' });
    }
    const check = await verifyAdminAuthToken(token);
    if (!check.isValid || !check.tokenRecord || !check.adminUser) {
      return res.status(400).json({ valid: false, error: check.error || 'Invalid or expired setup token.' });
    }
    res.json({
      valid: true,
      email: check.adminUser.email,
      name: check.adminUser.name,
      tokenType: check.tokenRecord.tokenType,
    });
  } catch (err: any) {
    res.status(500).json({ valid: false, error: err.message });
  }
});

// 2h. Complete password setup / reset using single-use token
app.post(
  '/api/admin/setup-password/complete',
  createPersistentRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000, prefix: 'setup_pwd' }),
  async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ error: 'Token and new password are required.' });
      }
      const result = await consumeAdminAuthToken(token, password);
      if (!result.success || !result.user) {
        return res.status(400).json({ error: result.error || 'Failed to update administrator password.' });
      }
      res.json({
        success: true,
        message: 'Administrator password established successfully. You may now sign in.',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// 2h-2. Authenticated administrator change-password endpoint
app.post(
  '/api/admin/change-password',
  createPersistentRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000, prefix: 'chg_pwd' }),
  requireAdmin,
  async (req, res) => {
    try {
      const email = (req as any).adminUser;
      const { currentPassword, newPassword } = req.body;

      if (!newPassword) {
        return res.status(400).json({ error: 'New password is required.' });
      }

      const strength = validatePasswordStrength(newPassword);
      if (!strength.isValid) {
        return res.status(400).json({ error: strength.error });
      }

      const user = await Repository.getAdminUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: 'Administrator account not found.' });
      }

      if (currentPassword && user.passwordHash) {
        const matches = verifyPassword(currentPassword, user.passwordHash);
        if (!matches) {
          return res.status(401).json({ error: 'Current password is incorrect.' });
        }
      }

      if (user.passwordHash && verifyPassword(newPassword, user.passwordHash)) {
        return res.status(400).json({
          error: 'New password must be different from your current or temporary password.',
        });
      }

      await Repository.updateAdminPassword(user.id, newPassword);

      const sessionToken = createSessionToken(
        user.email,
        user.name,
        user.role || 'Administrator'
      );
      const csrfToken = createCsrfToken(user.email);
      setAdminSessionCookie(res, req, sessionToken);

      res.json({
        success: true,
        message: 'Administrator password changed successfully.',
        csrfToken,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// 2i. Initial administrator setup bootstrap endpoint
app.post('/api/admin/initial-setup', async (req, res) => {
  try {
    const { email, name, password, secret } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Administrator email and password are required.' });
    }

    const hasConfiguredAdmin = await Repository.hasAnyAdminWithPassword();
    const envSecret = process.env.INITIAL_ADMIN_SECRET;

    if (hasConfiguredAdmin && (!envSecret || secret !== envSecret)) {
      return res.status(403).json({
        error: 'Initial setup is disabled because an administrator account already exists. Please sign in or use password reset.',
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const strength = validatePasswordStrength(password);
    if (!strength.isValid) {
      return res.status(400).json({ error: strength.error });
    }

    const existing = await Repository.getAdminUserByEmail(cleanEmail);
    if (existing) {
      await Repository.updateAdminPassword(existing.id, password);
    } else {
      await Repository.createAdminUser({
        email: cleanEmail,
        name: name || undefined,
        role: 'Administrator',
        password,
      });
    }

    res.json({
      success: true,
      message: 'Initial administrator account established successfully.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Short-lived upload authorization
app.post(
  '/api/upload/authorize',
  createPersistentRateLimiter({ limit: 30, windowMs: 60000, prefix: 'upload_auth' }),
  (req, res) => {
    const { repId } = req.body;
    const tokenData = generateUploadToken(repId);
    res.json({ success: true, ...tokenData });
  }
);

// 4. Upload photo
app.post(
  '/api/upload',
  createPersistentRateLimiter({ limit: 15, windowMs: 60000, prefix: 'upload_file' }),
  async (req, res) => {
    try {
      const { filename, fileBase64, contentType } = req.body;

      if (!filename || !fileBase64 || !contentType) {
        return res.status(400).json({ error: 'Missing required file data.' });
      }

      const buffer = Buffer.from(fileBase64, 'base64');

      if (buffer.length > MAX_FILE_SIZE_BYTES) {
        return res.status(400).json({
          error: `File size exceeds the 10 MB limit (${(buffer.length / (1024 * 1024)).toFixed(2)} MB uploaded).`,
        });
      }

      const magicCheck = validateImageMagicBytes(buffer);
      if (!magicCheck.isValid) {
        return res.status(400).json({ error: magicCheck.error });
      }

      const validContentType = magicCheck.detectedMime || contentType;
      const blobResult = await uploadPrivatePhoto(filename, buffer, validContentType);

      const attachmentId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const record = await Repository.createAttachment({
        id: attachmentId,
        originalFilename: filename,
        contentType: validContentType,
        fileSizeBytes: buffer.length,
        storageKey: blobResult.storageKey,
      });

      res.json({
        success: true,
        attachmentId: record.id,
        filename: record.originalFilename,
        sizeBytes: record.fileSizeBytes,
      });
    } catch (err: any) {
      console.error('Upload error:', err);
      res.status(500).json({ error: err.message || 'Failed to upload photo.' });
    }
  }
);

// 5. Submit spiff request
app.post(
  '/api/submissions',
  createPersistentRateLimiter({ limit: 20, windowMs: 60000, prefix: 'sub_create' }),
  async (req, res) => {
    try {
      const {
        repId,
        spiffId,
        liftName,
        serialSuffix,
        saleDate,
        notes,
        attachmentId,
        idempotencyKey,
      } = req.body;

      if (!attachmentId) {
        return res.status(400).json({ error: 'Please attach a sale photo before submitting your spiff request.' });
      }

      const result = await Repository.createSubmission({
        repId,
        spiffId,
        liftName,
        serialSuffix,
        saleDate,
        notes,
        attachmentId,
        idempotencyKey,
        appUrl: CANONICAL_APP_URL,
      });

      res.json({
        success: true,
        submission: result.submission,
        isDuplicateAttempt: result.isDuplicateAttempt,
        isLiveNeonPersisted: Repository.isLiveDatabaseConnected(),
      });
    } catch (err: any) {
      console.error('Submission error:', err);
      res.status(400).json({ error: err.message });
    }
  }
);

// ----------------------------------------------------
// Protected Administrator Endpoints
// ----------------------------------------------------

// System status & health
app.get('/api/admin/status', requireAdmin, async (req, res) => {
  res.json({
    isNeonConfigured: Repository.isLiveDatabaseConnected(),
    isResendConfigured,
    isBlobConfigured,
    adminEmail: (req as any).adminUser,
    adminRole: (req as any).adminRole,
    appUrl: CANONICAL_APP_URL,
  });
});

// Get ledger submissions
app.get('/api/admin/submissions', requireAdmin, async (req, res) => {
  try {
    const {
      repId,
      status,
      startDate,
      endDate,
      dateFilterType,
      submissionStartDate,
      submissionEndDate,
      approvalStartDate,
      approvalEndDate,
      saleStartDate,
      saleEndDate,
      search,
      sortBy,
      sortOrder,
    } = req.query as any;

    const submissions = await Repository.getSubmissions({
      repId,
      status,
      startDate,
      endDate,
      dateFilterType,
      submissionStartDate,
      submissionEndDate,
      approvalStartDate,
      approvalEndDate,
      saleStartDate,
      saleEndDate,
      search,
      sortBy,
      sortOrder,
    });

    const pendingList = submissions.filter((s) => s.status === 'Pending');
    const pendingCount = pendingList.length;
    const pendingDollarsCents = pendingList.reduce((acc, s) => acc + s.snapshotAmountCents, 0);

    const approvedUnpaidList = submissions.filter((s) => s.status === 'Approved');
    const approvedUnpaidDollarsCents = approvedUnpaidList.reduce(
      (acc, s) => acc + s.snapshotAmountCents,
      0
    );

    const paidList = submissions.filter((s) => s.status === 'Paid');
    const paidDollarsCents = paidList.reduce((acc, s) => acc + s.snapshotAmountCents, 0);

    const repApprovalTotals: Record<string, { repName: string; totalCents: number; count: number }> =
      {};
    for (const sub of submissions) {
      if (sub.status === 'Approved' || sub.status === 'Paid') {
        const key = sub.repId;
        if (!repApprovalTotals[key]) {
          repApprovalTotals[key] = {
            repName: sub.snapshotRepName,
            totalCents: 0,
            count: 0,
          };
        }
        repApprovalTotals[key].totalCents += sub.snapshotAmountCents;
        repApprovalTotals[key].count += 1;
      }
    }

    res.json({
      submissions,
      summary: {
        pendingCount,
        pendingDollarsFormatted: formatDollars(pendingDollarsCents),
        pendingDollarsCents,
        approvedUnpaidDollarsFormatted: formatDollars(approvedUnpaidDollarsCents),
        approvedUnpaidDollarsCents,
        paidDollarsFormatted: formatDollars(paidDollarsCents),
        paidDollarsCents,
        repApprovalTotals: Object.values(repApprovalTotals),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Single request detail
app.get('/api/admin/submissions/:id', requireAdmin, async (req, res) => {
  try {
    const sub = await Repository.getSubmissionById(req.params.id);
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    res.json({ submission: sub });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Approve / Deny submission
app.post('/api/admin/submissions/:id/decide', requireAdmin, async (req, res) => {
  try {
    const adminUser = (req as any).adminUser;
    const { decision, reasonOrMessage, recipients } = req.body;
    const updated = await Repository.decideSubmission(req.params.id, adminUser, {
      decision,
      reasonOrMessage,
      recipients: recipients || [],
      appUrl: CANONICAL_APP_URL,
    });
    res.json({ success: true, submission: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Approve submission
app.post('/api/admin/submissions/:id/approve', requireAdmin, async (req, res) => {
  try {
    const adminUser = (req as any).adminUser;
    const updated = await Repository.approveSubmission(req.params.id, adminUser);
    res.json({ success: true, submission: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Reject submission
app.post('/api/admin/submissions/:id/reject', requireAdmin, async (req, res) => {
  try {
    const adminUser = (req as any).adminUser;
    const { reason } = req.body;
    const updated = await Repository.rejectSubmission(req.params.id, adminUser, reason);
    res.json({ success: true, submission: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Mark submission as Paid
app.post('/api/admin/submissions/:id/pay', requireAdmin, async (req, res) => {
  try {
    const adminUser = (req as any).adminUser;
    const updated = await Repository.markPaidSubmission(req.params.id, adminUser);
    res.json({ success: true, submission: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Correct submission details
app.post('/api/admin/submissions/:id/correct', requireAdmin, async (req, res) => {
  try {
    const adminUser = (req as any).adminUser;
    const { liftName, serialSuffix, saleDate, notes, amountCents, explanation } = req.body;
    const updated = await Repository.correctSubmission(
      req.params.id,
      adminUser,
      { liftName, serialSuffix, saleDate, notes, amountCents },
      explanation
    );
    res.json({ success: true, submission: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// View attached photo
app.get('/api/admin/attachments/:id/view', requireAdmin, async (req, res) => {
  try {
    const attachment = await Repository.getAttachment(req.params.id);
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found.' });
    }

    const photoData = await retrievePhotoImage(attachment.storageKey);
    if (photoData) {
      res.setHeader('Content-Type', photoData.contentType || attachment.contentType || 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return res.send(photoData.buffer);
    }

    if (attachment.storageKey.startsWith('http')) {
      return res.redirect(attachment.storageKey);
    }

    return res.status(404).json({ error: 'Photo data could not be retrieved from storage.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Download attached photo
app.get('/api/admin/attachments/:id/download', requireAdmin, async (req, res) => {
  try {
    const attachment = await Repository.getAttachment(req.params.id);
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found.' });
    }

    const photoData = await retrievePhotoImage(attachment.storageKey);
    if (photoData) {
      res.setHeader('Content-Type', photoData.contentType || attachment.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalFilename || 'sale-photo.jpg'}"`);
      return res.send(photoData.buffer);
    }

    if (attachment.storageKey.startsWith('http')) {
      return res.redirect(attachment.storageKey);
    }

    return res.status(404).json({ error: 'Photo data could not be retrieved from storage.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CSV Export
app.get('/api/admin/export/csv', requireAdmin, async (req, res) => {
  try {
    const {
      repId,
      status,
      startDate,
      endDate,
      dateFilterType,
      submissionStartDate,
      submissionEndDate,
      approvalStartDate,
      approvalEndDate,
      saleStartDate,
      saleEndDate,
      search,
      sortBy,
      sortOrder,
    } = req.query as any;
    const submissions = await Repository.getSubmissions({
      repId,
      status,
      startDate,
      endDate,
      dateFilterType,
      submissionStartDate,
      submissionEndDate,
      approvalStartDate,
      approvalEndDate,
      saleStartDate,
      saleEndDate,
      search,
      sortBy,
      sortOrder,
    });

    const headers = [
      'Request ID',
      'Sales Rep',
      'Forklift Model',
      'Serial Suffix',
      'Spiff Program',
      'Spiff Amount',
      'Sale Date',
      'Submitted At (Phoenix)',
      'Status',
      'Approved At (Phoenix)',
      'Approved By',
      'Paid At (Phoenix)',
      'Paid By',
      'Photo Link',
      'Notes',
    ];

    const rows = submissions.map((s) => [
      s.id,
      `"${s.snapshotRepName.replace(/"/g, '""')}"`,
      `"${s.liftName.replace(/"/g, '""')}"`,
      `'${s.serialSuffix}`,
      `"${s.snapshotSpiffName.replace(/"/g, '""')}"`,
      (s.snapshotAmountCents / 100).toFixed(2),
      formatPhoenixDate(s.saleDate),
      formatPhoenixDateTime(s.submittedAt),
      s.status,
      formatPhoenixDateTime(s.approvedAt),
      s.approvedBy || '',
      formatPhoenixDateTime(s.paidAt),
      s.paidBy || '',
      s.attachment
        ? `${CANONICAL_APP_URL}/api/admin/attachments/${s.attachment.id}/view`
        : 'No photo',
      `"${(s.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="discount-forklift-spiffs-${Date.now()}.csv"`
    );
    res.send(csvContent);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Reps CRUD
app.get('/api/admin/reps', requireAdmin, async (req, res) => {
  try {
    const reps = await Repository.getAllReps();
    res.json({ reps });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/reps', requireAdmin, async (req, res) => {
  try {
    const { name, email, branch, assignedGmIds, displayOrder } = req.body;
    const rep = await Repository.createRep({ name, email, branch, assignedGmIds, displayOrder });
    res.json({ success: true, rep });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/admin/reps/:id', requireAdmin, async (req, res) => {
  try {
    const { name, email, branch, assignedGmIds, isActive, displayOrder } = req.body;
    const rep = await Repository.updateRep(req.params.id, {
      name,
      email,
      branch,
      assignedGmIds,
      isActive,
      displayOrder,
    });
    res.json({ success: true, rep });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Notification Contacts CRUD
app.get('/api/admin/contacts', requireAdmin, async (req, res) => {
  try {
    const contacts = await Repository.getAllContacts();
    res.json({ contacts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/contacts', requireAdmin, async (req, res) => {
  try {
    const { name, email, role, branch, isDefaultAccounting } = req.body;
    const contact = await Repository.createContact({
      name,
      email,
      role,
      branch,
      isDefaultAccounting,
    });
    res.json({ success: true, contact });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/admin/contacts/:id', requireAdmin, async (req, res) => {
  try {
    const { name, email, role, branch, isDefaultAccounting, isActive } = req.body;
    const contact = await Repository.updateContact(req.params.id, {
      name,
      email,
      role,
      branch,
      isDefaultAccounting,
      isActive,
    });
    res.json({ success: true, contact });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Branches CRUD
app.get('/api/admin/branches', requireAdmin, async (req, res) => {
  try {
    const branches = await Repository.getAllBranches();
    res.json({ branches });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/branches', requireAdmin, async (req, res) => {
  try {
    const { name, code, address, displayOrder } = req.body;
    const branch = await Repository.createBranch({ name, code, address, displayOrder });
    res.json({ success: true, branch });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/admin/branches/:id', requireAdmin, async (req, res) => {
  try {
    const { name, code, address, isActive, displayOrder } = req.body;
    const branch = await Repository.updateBranch(req.params.id, {
      name,
      code,
      address,
      isActive,
      displayOrder,
    });
    res.json({ success: true, branch });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/admin/branches/:id', requireAdmin, async (req, res) => {
  try {
    const success = await Repository.deleteBranch(req.params.id);
    res.json({ success });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Spiffs CRUD
app.get('/api/admin/spiffs', requireAdmin, async (req, res) => {
  try {
    const spiffs = await Repository.getAllSpiffs();
    res.json({ spiffs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/spiffs', requireAdmin, async (req, res) => {
  try {
    const { name, description, eligibilityRequirements, amountCents, displayOrder } = req.body;
    const spiff = await Repository.createSpiff({
      name,
      description,
      eligibilityRequirements,
      amountCents,
      displayOrder,
    });
    res.json({ success: true, spiff });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/admin/spiffs/:id', requireAdmin, async (req, res) => {
  try {
    const { name, description, eligibilityRequirements, amountCents, isActive, displayOrder } =
      req.body;
    const spiff = await Repository.updateSpiff(req.params.id, {
      name,
      description,
      eligibilityRequirements,
      amountCents,
      isActive,
      displayOrder,
    });
    res.json({ success: true, spiff });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// App Settings & Email Notification Jobs
app.get('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const recipientEmail = await Repository.getSetting(
      'notification_recipient_email',
      'caleb@discountforkliftphoenix.com'
    );
    res.json({ notificationRecipientEmail: recipientEmail });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const adminUser = (req as any).adminUser;
    const { notificationRecipientEmail } = req.body;
    if (notificationRecipientEmail) {
      await Repository.setSetting(
        'notification_recipient_email',
        notificationRecipientEmail.trim(),
        adminUser
      );
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/admin/email-jobs', requireAdmin, async (req, res) => {
  try {
    const jobs = await Repository.getEmailJobs();
    res.json({ jobs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/email-jobs/:id/retry', requireAdmin, async (req, res) => {
  try {
    const job = await Repository.retryNotification(req.params.id, CANONICAL_APP_URL);
    res.json({ success: true, job });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Editable Email Templates API
app.get('/api/admin/email-templates', requireAdmin, async (req, res) => {
  try {
    const templates = await Repository.getAllEmailTemplates();
    res.json({ templates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/email-templates/:id', requireAdmin, async (req, res) => {
  try {
    const template = await Repository.getEmailTemplate(req.params.id);
    res.json({ template });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

app.get('/api/admin/email-templates/:id/versions', requireAdmin, async (req, res) => {
  try {
    const versions = await Repository.getEmailTemplateVersions(req.params.id);
    res.json({ versions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/email-templates/:id', requireAdmin, async (req, res) => {
  try {
    const adminUser = (req as any).adminUser;
    const { subject, bodyHtml, changeSummary } = req.body;
    const updated = await Repository.updateEmailTemplate(
      req.params.id,
      { subject, bodyHtml, changeSummary },
      adminUser
    );
    res.json({ success: true, template: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/email-templates/:id/restore-default', requireAdmin, async (req, res) => {
  try {
    const adminUser = (req as any).adminUser;
    const restored = await Repository.restoreDefaultEmailTemplate(req.params.id, adminUser);
    res.json({ success: true, template: restored });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post(
  '/api/admin/email-templates/:id/test-send',
  requireAdmin,
  createPersistentRateLimiter({ limit: 10, windowMs: 60000, prefix: 'email_test' }),
  async (req, res) => {
    try {
      const adminUser = (req as any).adminUser;
      const { testEmail, subject, bodyHtml } = req.body;
      const result = await Repository.sendTestEmailTemplate({
        templateId: req.params.id,
        testEmail,
        customSubject: subject,
        customBodyHtml: bodyHtml,
        adminUser,
      });
      res.json({ ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// Quick-start loader for initial setup
app.post('/api/admin/presets', requireAdmin, async (req, res) => {
  try {
    const result = Repository.loadQuickStartPresets();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Users Management
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await Repository.getAllAdminUsers();
    res.json({ users });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { email, name, role, password } = req.body;
    const user = await Repository.createAdminUser({ email, name, role, password });
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/admin/users/:id/password', requireAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    await Repository.updateAdminPassword(req.params.id, password);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/admin/users/:id/status', requireAdmin, async (req, res) => {
  try {
    const { isAuthorized } = req.body;
    await Repository.toggleAdminStatus(req.params.id, Boolean(isAuthorized));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    await Repository.updateAdminRole(req.params.id, role);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const adminUser = (req as any).adminUser;
    const success = await Repository.deleteAdminUser(req.params.id, adminUser);
    res.json({ success });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Invite a new administrator
app.post('/api/admin/invite', requireAdmin, async (req, res) => {
  try {
    const { email, name, role } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Administrator email is required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const existing = await Repository.getAdminUserByEmail(cleanEmail);
    let targetAdminId: string;

    if (existing) {
      targetAdminId = existing.id;
    } else {
      const newUser = await Repository.createAdminUser({
        email: cleanEmail,
        name: name ? name.trim() : undefined,
        role: role || 'Approving Manager',
      });
      targetAdminId = newUser.id;
    }

    const { rawToken, expiresAt } = await createAdminAuthToken({
      adminId: targetAdminId,
      tokenType: 'invite',
      createdBy: (req as any).adminUser,
    });

    const inviteUrl = `${CANONICAL_APP_URL}/?setup_token=${rawToken}`;
    res.json({
      success: true,
      inviteUrl,
      expiresAt,
      token: rawToken,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Password reset link generator
app.post('/api/admin/users/:id/reset-link', requireAdmin, async (req, res) => {
  try {
    const user = await Repository.getAdminUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Administrator not found.' });
    }

    const { rawToken, expiresAt } = await createAdminAuthToken({
      adminId: user.id,
      tokenType: 'password_reset',
      createdBy: (req as any).adminUser,
    });

    const resetUrl = `${CANONICAL_APP_URL}/?setup_token=${rawToken}`;
    res.json({
      success: true,
      resetUrl,
      expiresAt,
      token: rawToken,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Scheduled Cron Endpoints (Vercel Cron compatible)
app.all('/api/cron/retry-notifications', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret || !authHeader || authHeader !== `Bearer ${expectedSecret}`) {
    return res.status(401).json({
      error: 'Unauthorized cron request: Authorization header with Bearer CRON_SECRET is required.',
    });
  }

  try {
    const result = await Repository.processDueEmailJobs(CANONICAL_APP_URL);
    res.json({
      success: true,
      processedCount: result.processedCount,
      jobs: result.results,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Resend Provider Webhooks
app.post('/api/webhooks/resend', async (req, res) => {
  try {
    const { type, data } = req.body || {};
    const emailId = data?.email_id || data?.id;
    if (emailId && type) {
      await Repository.recordWebhookEvent(emailId, type, data);
    }
    res.json({ received: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.all('/api/cron/cleanup-uploads', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret || !authHeader || authHeader !== `Bearer ${expectedSecret}`) {
    return res.status(401).json({
      error: 'Unauthorized cron request: Authorization header with Bearer CRON_SECRET is required.',
    });
  }

  try {
    const cleanupResult = await Repository.cleanupAbandonedUploads();
    const count = typeof cleanupResult === 'number' ? cleanupResult : cleanupResult?.cleanedCount ?? 0;
    res.json({ success: true, cleanedCount: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Explicit Catch-All for unknown API paths -> JSON 404
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

/**
 * Secure Server-Side Seed Process
 */
export async function ensureInitialAdminFromEnv() {
  const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase() || 'caleb@discountforkliftphoenix.com';
  const name = process.env.INITIAL_ADMIN_NAME || 'Caleb Vance';

  if (!initialPassword) {
    return;
  }

  try {
    const result = await Repository.seedOrUpdateInitialAdmin({
      email,
      name,
      initialPassword,
      role: 'Administrator',
    });

    if (result.action === 'created' || result.action === 'password_set') {
      console.log(`[Admin Seed] Securely provisioned initial administrator (${email}) from server environment.`);
    } else if (result.action === 'granted_role') {
      console.log(`[Admin Seed] Verified existing administrator account (${email}). Granted Administrator role; existing password preserved.`);
    }
  } catch (err: any) {
    console.error('[Admin Seed] Error establishing initial administrator from environment:', err.message);
  }
}

export { app };
export default app;
