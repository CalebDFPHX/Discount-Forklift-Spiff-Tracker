import crypto from 'crypto';

const EMAIL_DECISION_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface EmailDecisionTokenPayload {
  submissionId: string;
  decision: 'approve' | 'deny' | 'paid';
  approverEmail: string;
  expiresAt: number;
  nonce: string;
}

function getSigningSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret?.trim()) {
    throw new Error('AUTH_SECRET must be configured to create email decision links.');
  }
  return secret.trim();
}

function sign(payload: string): Buffer {
  return crypto.createHmac('sha256', getSigningSecret()).update(payload).digest();
}

export function createEmailDecisionToken(
  submissionId: string,
  decision: EmailDecisionTokenPayload['decision'],
  approverEmail: string
): string {
  const payload: EmailDecisionTokenPayload = {
    submissionId,
    decision,
    approverEmail: approverEmail.trim().toLowerCase(),
    expiresAt: Math.floor(Date.now() / 1000) + EMAIL_DECISION_TOKEN_TTL_SECONDS,
    nonce: crypto.randomBytes(16).toString('hex'),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(encodedPayload).toString('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifyEmailDecisionToken(token: string): EmailDecisionTokenPayload | null {
  try {
    const [encodedPayload, encodedSignature, extra] = token.split('.');
    if (!encodedPayload || !encodedSignature || extra) return null;

    const providedSignature = Buffer.from(encodedSignature, 'base64url');
    const expectedSignature = sign(encodedPayload);
    if (
      providedSignature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(providedSignature, expectedSignature)
    ) {
      return null;
    }

    const payload: unknown = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    );
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('submissionId' in payload) ||
      typeof payload.submissionId !== 'string' ||
      payload.submissionId.length === 0 ||
      payload.submissionId.length > 64 ||
      !('decision' in payload) ||
      (payload.decision !== 'approve' && payload.decision !== 'deny' && payload.decision !== 'paid') ||
      !('approverEmail' in payload) ||
      typeof payload.approverEmail !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.approverEmail) ||
      !('expiresAt' in payload) ||
      typeof payload.expiresAt !== 'number' ||
      payload.expiresAt <= Math.floor(Date.now() / 1000) ||
      !('nonce' in payload) ||
      typeof payload.nonce !== 'string' ||
      !/^[a-f0-9]{32}$/.test(payload.nonce)
    ) {
      return null;
    }

    return payload as EmailDecisionTokenPayload;
  } catch {
    return null;
  }
}
