import { createPrivateKey, createSign, randomUUID } from 'node:crypto';

export const MICROSOFT_GRAPH_SENDER_EMAIL = 'admin@discountforkliftphoenix.com';
export const MICROSOFT_GRAPH_SENDER_NAME = 'Discount Forklift Spiff Tracker';

type GraphEnvironment = Record<string, string | undefined>;

interface MicrosoftGraphConfiguration {
  tenantId: string;
  clientId: string;
  authMode: 'client_secret' | 'certificate';
  clientSecret?: string;
  privateKey?: string;
  certificateThumbprint?: string;
}

interface MicrosoftGraphMessage {
  to: string | string[];
  subject: string;
  html: string;
  idempotencyKey?: string;
  attachments?: Array<{ filename: string; content: string; contentType: string }>;
}

interface MicrosoftGraphEmailResult {
  success: boolean;
  status: 'accepted' | 'failed';
  acceptedByProvider?: boolean;
  providerResponse?: string;
  error?: string;
}

const GRAPH_CONFIGURATION_VARIABLES = [
  'GRAPH_TENANT_ID',
  'GRAPH_CLIENT_ID',
  'GRAPH_AUTH_MODE',
  'GRAPH_CLIENT_SECRET',
  'GRAPH_CERTIFICATE_PRIVATE_KEY',
  'GRAPH_CERTIFICATE_THUMBPRINT',
] as const;

function getTrimmedEnvironmentValue(environment: GraphEnvironment, name: string): string {
  return environment[name]?.trim() || '';
}

export function hasMicrosoftGraphConfiguration(
  environment: GraphEnvironment = process.env
): boolean {
  return GRAPH_CONFIGURATION_VARIABLES.some((name) =>
    Boolean(getTrimmedEnvironmentValue(environment, name))
  );
}

function normalizeCertificateThumbprint(value: string): string | null {
  if (/^[a-f\d]{40}$/i.test(value)) {
    return Buffer.from(value, 'hex').toString('base64url');
  }

  if (!/^[A-Za-z\d_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === 20 ? decoded.toString('base64url') : null;
}

export function resolveMicrosoftGraphConfiguration(
  environment: GraphEnvironment = process.env
): { configuration?: MicrosoftGraphConfiguration; error?: string } {
  const tenantId = getTrimmedEnvironmentValue(environment, 'GRAPH_TENANT_ID');
  const clientId = getTrimmedEnvironmentValue(environment, 'GRAPH_CLIENT_ID');
  const authMode = getTrimmedEnvironmentValue(environment, 'GRAPH_AUTH_MODE');

  if (!tenantId || !clientId || !authMode) {
    const missing = [
      !tenantId && 'GRAPH_TENANT_ID',
      !clientId && 'GRAPH_CLIENT_ID',
      !authMode && 'GRAPH_AUTH_MODE',
    ].filter(Boolean);
    return {
      error: `Microsoft Graph configuration is incomplete. Set ${missing.join(', ')}.`,
    };
  }
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(tenantId)) {
    return { error: 'GRAPH_TENANT_ID must be a Microsoft Entra tenant GUID.' };
  }
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(clientId)) {
    return { error: 'GRAPH_CLIENT_ID must be an application client GUID.' };
  }
  if (authMode !== 'client_secret' && authMode !== 'certificate') {
    return { error: 'GRAPH_AUTH_MODE must be "client_secret" or "certificate".' };
  }

  const clientSecret = getTrimmedEnvironmentValue(environment, 'GRAPH_CLIENT_SECRET');
  const privateKey = getTrimmedEnvironmentValue(environment, 'GRAPH_CERTIFICATE_PRIVATE_KEY')
    .replace(/\\n/g, '\n');
  const thumbprint = getTrimmedEnvironmentValue(environment, 'GRAPH_CERTIFICATE_THUMBPRINT');

  if (authMode === 'client_secret') {
    if (privateKey || thumbprint) {
      return {
        error: 'Remove certificate credentials when GRAPH_AUTH_MODE is "client_secret".',
      };
    }
    if (!clientSecret) {
      return {
        error: 'Microsoft Graph configuration is incomplete. Set GRAPH_CLIENT_SECRET.',
      };
    }
    return {
      configuration: { tenantId, clientId, authMode, clientSecret },
    };
  }

  if (clientSecret) {
    return {
      error: 'Remove GRAPH_CLIENT_SECRET when GRAPH_AUTH_MODE is "certificate".',
    };
  }
  if (!privateKey || !thumbprint) {
    const missing = [
      !privateKey && 'GRAPH_CERTIFICATE_PRIVATE_KEY',
      !thumbprint && 'GRAPH_CERTIFICATE_THUMBPRINT',
    ].filter(Boolean);
    return {
      error: `Microsoft Graph certificate configuration is incomplete. Set ${missing.join(', ')}.`,
    };
  }

  const certificateThumbprint = normalizeCertificateThumbprint(thumbprint);
  if (!certificateThumbprint) {
    return {
      error: 'GRAPH_CERTIFICATE_THUMBPRINT must be a 40-character SHA-1 hex thumbprint or Base64url value.',
    };
  }
  try {
    const key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== 'rsa') {
      return { error: 'GRAPH_CERTIFICATE_PRIVATE_KEY must be an RSA private key.' };
    }
  } catch {
    return {
      error: 'GRAPH_CERTIFICATE_PRIVATE_KEY must contain a valid, unencrypted RSA PEM private key.',
    };
  }

  return {
    configuration: {
      tenantId,
      clientId,
      authMode,
      privateKey,
      certificateThumbprint,
    },
  };
}

function encodeBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function createCertificateAssertion(
  configuration: MicrosoftGraphConfiguration,
  tokenUrl: string,
  now: number
): string {
  const header = encodeBase64Url(
    JSON.stringify({
      alg: 'RS256',
      typ: 'JWT',
      x5t: configuration.certificateThumbprint,
    })
  );
  const issuedAt = Math.floor(now / 1000);
  const claims = encodeBase64Url(
    JSON.stringify({
      aud: tokenUrl,
      iss: configuration.clientId,
      sub: configuration.clientId,
      jti: randomUUID(),
      nbf: issuedAt - 30,
      exp: issuedAt + 600,
    })
  );
  const unsignedAssertion = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsignedAssertion);
  signer.end();
  const signature = signer.sign(configuration.privateKey!).toString('base64url');
  return `${unsignedAssertion}.${signature}`;
}

function getProviderErrorCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('error' in body)) return null;
  const providerError = (body as { error?: unknown }).error;
  if (typeof providerError === 'string') {
    return providerError.replace(/[^\w.-]/g, '').slice(0, 80) || null;
  }
  if (typeof providerError !== 'object' || providerError === null || !('code' in providerError)) {
    return null;
  }
  const code = (providerError as { code?: unknown }).code;
  return typeof code === 'string' ? code.replace(/[^\w.-]/g, '').slice(0, 80) || null : null;
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function createMicrosoftGraphEmailProvider(options: {
  environment?: GraphEnvironment;
  fetcher?: typeof fetch;
  now?: () => number;
  logError?: (message: string) => void;
} = {}) {
  const environment = options.environment || process.env;
  const { configuration, error: configurationError } =
    resolveMicrosoftGraphConfiguration(environment);
  const fetcher = options.fetcher || globalThis.fetch;
  const now = options.now || Date.now;
  const logError = options.logError || ((message: string) => console.error(`[Email] ${message}`));
  let cachedToken: { value: string; expiresAt: number } | null = null;

  async function getAccessToken(): Promise<string> {
    if (!configuration) throw new Error(configurationError || 'Microsoft Graph is not configured.');
    if (cachedToken && cachedToken.expiresAt > now() + 60_000) {
      return cachedToken.value;
    }

    const tokenUrl =
      `https://login.microsoftonline.com/${configuration.tenantId}/oauth2/v2.0/token`;
    const form = new URLSearchParams({
      client_id: configuration.clientId,
      scope: 'https://graph.microsoft.com/.default',
    });
    if (configuration.authMode === 'client_secret') {
      form.set('grant_type', 'client_credentials');
      form.set('client_secret', configuration.clientSecret!);
    } else {
      form.set('grant_type', 'client_credentials');
      form.set('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
      form.set(
        'client_assertion',
        createCertificateAssertion(configuration, tokenUrl, now())
      );
    }

    const response = await fetcher(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      redirect: 'error',
    });
    const body = await readResponseJson(response);
    if (!response.ok) {
      const code = getProviderErrorCode(body);
      throw new Error(
        `Microsoft Graph authentication failed (HTTP ${response.status}${code ? `; ${code}` : ''}).`
      );
    }

    if (typeof body !== 'object' || body === null) {
      throw new Error('Microsoft Graph authentication returned an invalid response.');
    }
    const tokenBody = body as { access_token?: unknown; expires_in?: unknown };
    if (typeof tokenBody.access_token !== 'string' || !tokenBody.access_token) {
      throw new Error('Microsoft Graph authentication response did not contain an access token.');
    }
    const expiresIn =
      typeof tokenBody.expires_in === 'number' && Number.isFinite(tokenBody.expires_in)
        ? tokenBody.expires_in
        : 3600;
    cachedToken = {
      value: tokenBody.access_token,
      expiresAt: now() + Math.max(expiresIn, 0) * 1000,
    };
    return cachedToken.value;
  }

  return {
    isConfigured: Boolean(configuration),
    configurationError,
    async sendEmail(message: MicrosoftGraphMessage): Promise<MicrosoftGraphEmailResult> {
      if (!configuration) {
        const error = configurationError || 'Microsoft Graph is not configured.';
        logError(error);
        return { success: false, status: 'failed', error };
      }

      const recipients = Array.isArray(message.to) ? message.to : [message.to];
      try {
        const accessToken = await getAccessToken();
        const response = await fetcher(
          `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MICROSOFT_GRAPH_SENDER_EMAIL)}/sendMail`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${accessToken}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              message: {
                subject: message.subject,
                body: { contentType: 'HTML', content: message.html },
                from: {
                  emailAddress: {
                    name: MICROSOFT_GRAPH_SENDER_NAME,
                    address: MICROSOFT_GRAPH_SENDER_EMAIL,
                  },
                },
                toRecipients: recipients.map((address) => ({
                  emailAddress: { address },
                })),
                ...(message.attachments
                  ? {
                      attachments: message.attachments.map((attachment) => ({
                        '@odata.type': '#microsoft.graph.fileAttachment',
                        name: attachment.filename,
                        contentType: attachment.contentType,
                        contentBytes: Buffer.from(attachment.content, 'utf8').toString('base64'),
                      })),
                    }
                  : {}),
              },
              saveToSentItems: true,
            }),
            redirect: 'error',
          }
        );

        if (!response.ok) {
          const errorBody = await readResponseJson(response);
          const code = getProviderErrorCode(errorBody);
          throw new Error(
            `Microsoft Graph sendMail failed (HTTP ${response.status}${code ? `; ${code}` : ''}).`
          );
        }

        return {
          success: true,
          status: 'accepted',
          acceptedByProvider: true,
          providerResponse: JSON.stringify({
            provider: 'microsoft_graph',
            httpStatus: response.status,
            requestId: response.headers.get('request-id') || undefined,
            acceptedRecipients: recipients,
          }),
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error && error.message.startsWith('Microsoft Graph ')
            ? error.message
            : 'Microsoft Graph request failed due to a network or transport error.';
        logError(message);
        return { success: false, status: 'failed', error: message };
      }
    },
  };
}
