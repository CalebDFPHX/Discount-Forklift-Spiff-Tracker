const VERCEL_DEPLOYMENT_HOST =
  /-[a-z0-9]{8,12}-[^.]+(?:-projects)?\.vercel\.app$/i;

function normalizeAppUrl(name: string, value: string, isProduction: boolean): URL {
  let url: URL;
  try {
    url = new URL(value.includes('://') ? value : `https://${value}`);
  } catch {
    throw new Error(`${name} must be a valid application URL.`);
  }

  if (
    (url.protocol !== 'https:' && (isProduction || url.protocol !== 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error(`${name} must be an HTTPS application origin without credentials or a path.`);
  }

  return url;
}

export function resolveCanonicalAppUrl(
  env: NodeJS.ProcessEnv = process.env
): string {
  const isProduction = env.NODE_ENV === 'production';
  const candidates = [
    ['APP_URL', env.APP_URL],
    ['VERCEL_PROJECT_PRODUCTION_URL', env.VERCEL_PROJECT_PRODUCTION_URL],
    ['NEXTAUTH_URL', env.NEXTAUTH_URL],
  ] as const;

  for (const [name, value] of candidates) {
    if (!value?.trim()) continue;

    const url = normalizeAppUrl(name, value.trim(), isProduction);
    if (VERCEL_DEPLOYMENT_HOST.test(url.hostname)) {
      console.warn(
        `[App URL] Ignoring deployment-specific Vercel URL from ${name}; notification action links must use the stable Production domain.`
      );
      continue;
    }

    return url.origin;
  }

  if (isProduction) {
    throw new Error(
      'Configure APP_URL or VERCEL_PROJECT_PRODUCTION_URL with the stable Production domain before generating notification action links.'
    );
  }

  return 'http://localhost:3000';
}
