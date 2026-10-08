import { app, ensureInitialAdminFromEnv } from '../src/server/app';

let isInitialized = false;

export default async function handler(req: any, res: any) {
  if (!isInitialized) {
    if (process.env.INITIAL_ADMIN_PASSWORD) {
      await ensureInitialAdminFromEnv().catch((err) =>
        console.error('[Vercel Serverless] Seed initialization error:', err)
      );
    }
    isInitialized = true;
  }
  return app(req, res);
}
