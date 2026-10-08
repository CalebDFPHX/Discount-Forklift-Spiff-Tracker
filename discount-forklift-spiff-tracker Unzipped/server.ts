import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { app, ensureInitialAdminFromEnv } from './src/server/app';
import { isNeonConfigured } from './src/db/index';
import { isResendConfigured } from './src/lib/resend';
import { isBlobConfigured } from './src/lib/blob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const CANONICAL_APP_URL =
  process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://discountforkliftphoenix.com';

async function startServer() {
  // Run server-side seed before accepting traffic
  await ensureInitialAdminFromEnv();

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Discount Forklift Spiff Tracker] Server running on port ${PORT}`);
    console.log(`[Database] Neon PostgreSQL configured: ${isNeonConfigured}`);
    console.log(`[Email] Resend configured: ${isResendConfigured}`);
    console.log(`[Storage] Vercel Blob configured: ${isBlobConfigured}`);
    console.log(`[App URL] Canonical: ${CANONICAL_APP_URL}`);
  });
}

startServer();
