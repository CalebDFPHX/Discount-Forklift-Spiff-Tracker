# Discount Forklift Spiff Tracker

A production-grade web application built for the **Discount Forklift** sales office in Phoenix, Arizona.

Sales representatives submit cash spiff requests after closing a forklift sale. Office administrators review requests, approve or reject them, disburse payments, manage spiff incentive programs and sales rep rosters, inspect audit histories, view private sale photos, and monitor email notifications.

---

## Architecture & Technology Stack

- **Framework**: React SPA with TypeScript & Tailwind CSS served via production Express/Node.js runtime.
- **Persistent Database**: [Neon PostgreSQL](https://neon.tech) utilizing serverless pooling (`@neondatabase/serverless`).
- **ORM & Migrations**: [Drizzle ORM](https://orm.drizzle.team) with version-controlled migrations (`drizzle/`).
- **Administrator Authentication**: Secure email-and-password authentication with cryptographic salted scrypt hashing, expiring single-use invite and reset tokens, HttpOnly SameSite session cookies, and explicit database allowlist enforcement in Neon. No Google OAuth or client-side credentials.
- **Shared Rate Limiting**: Multi-instance persistent rate limiting backed by Neon (`rate_limits` table) with trusted platform IP detection.
- **Email Notifications**: [Resend](https://resend.com) transactional emails with database job queues and retry idempotency.
- **Photo Storage**: Private [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) storage accessed strictly via administrator-authenticated server endpoints with magic-byte verification.
- **Timezone**: All ledger timestamps, daily filters (Submission Date, Approval Date, Sale Date), and exported records are formatted in `America/Phoenix` (MST, UTC-7).
- **Deployment Target**: Vercel / serverless runtime connected to GitHub.

---

## Step-by-Step Deployment & Operations Guide

### 1. Creating the Neon PostgreSQL Database
1. Go to [Neon.tech](https://neon.tech) and create a free account or sign in.
2. Create a new project (e.g., `discount-forklift-spiffs`).
3. Select your cloud provider region (e.g., `US West / Oregon` or `US East / Ohio`).
4. In the Neon Console Dashboard, locate **Connection Details**.
5. Switch the dropdown from **Direct Connection** to **Pooled Connection**.
6. Copy the connection string. It will look like:
   ```
   postgresql://[user]:[password]@[neon-hostname]-pooler.[region].aws.neon.tech/[dbname]?sslmode=require
   ```
7. Keep this connection string safe for your `.env` file and production environment settings.

---

### 2. Applying Database Migrations
This application uses version-controlled Drizzle migrations. To run migrations against your Neon database:

1. Create a local `.env` file containing your Neon connection string:
   ```bash
   cp .env.example .env
   # Edit .env and paste your DATABASE_URL
   ```
2. Apply the migration directly using `drizzle-kit`:
   ```bash
   npm run db:migrate
   ```
   *Alternative manual execution*: Open the Neon Console SQL Editor, paste the contents of the migration files in `drizzle/`, and click **Run**. This provisions all tables and performance indexes without running destructive scripts during builds.

---

### 3. Creating the Initial Administrator & First-Login Password Change
Authentication requires an explicitly authorized administrator record in the Neon `admin_users` table.

#### Implemented Code:
1. **Automated Server-Side Seed**: On startup, the server automatically inspects `INITIAL_ADMIN_PASSWORD` (and optional `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_NAME`).
   - If the account does not exist or has an uninitialized placeholder password, it cryptographically hashes the supplied password with salted `scrypt` (`salt:hash`, 16-byte random salt), sets `role = 'Administrator'`, and flags `must_change_password = true`.
   - If the account already exists with a set password, it guarantees `role = 'Administrator'` and `is_authorized = true` without modifying the existing password or creating duplicates.
2. **First-Login Password Change Enforcement**:
   - The user must change their temporary password upon their first successful login.
   - All protected administrative actions (ledger, approvals, denials, spiff management, rosters, attachments, settings, exports) are strictly rejected with HTTP `403` on the server until the password is changed.
   - The UI displays a dedicated `PasswordChangeModal` prompting the user to establish a permanent password (minimum 8 characters, letters and numbers, different from temporary password).
   - Once submitted to `POST /api/admin/change-password`, `must_change_password` is set to `false`, a new session is issued, and full access is granted.

#### Executed Steps in Current Environment:
- Migration `0003_add_must_change_password.sql` generated and applied to local schema.
- Password change enforcement and server-side seeding implemented and tested against 63/63 test cases in `scripts/verify-repairs.ts`.
- `INITIAL_ADMIN_PASSWORD` configured in local server environment `.env` (git-ignored).

#### Setup Steps for Deployed Neon Database:
When connecting a production Neon database to Vercel or cloud hosting:
1. Set the following environment variables in your Vercel Project Settings > Environment Variables:
   ```env
   INITIAL_ADMIN_EMAIL="caleb@discountforkliftphoenix.com"
   INITIAL_ADMIN_NAME="Caleb Vance"
   INITIAL_ADMIN_PASSWORD="YourInitialSecurePassword!"
   AUTH_SECRET="your-32-byte-random-session-signing-key"
   DATABASE_URL="postgresql://...neon.tech/dbname?sslmode=require"
   ```
2. Apply database migrations to Neon:
   ```bash
   npm run db:migrate
   ```
3. When the server boots up in production, it will automatically run the seed process, provision the persistent administrator in Neon, and enforce password change on first login.
4. Alternatively, run the CLI utility directly against your deployed database:
   ```bash
   DATABASE_URL="your-neon-url" npm run setup:admin caleb@discountforkliftphoenix.com "Caleb Vance" "Ron58838!"
   ```

---

### 4. Administrator Invitations & Password Reset
1. **Inviting Additional Administrators**:
   - Authorized administrators log in and navigate to the **User Management** tab.
   - Click **Add / Invite Admin**, enter their email, name, and role (`Administrator` or `Approving Manager`).
   - Choose **Single-Use Invite Link** to generate a cryptographic, single-use token valid for 24 hours.
   - Deliver the setup link to the manager. Once they choose a password, the token is consumed atomically and cannot be reused.
2. **Self-Service Password Reset**:
   - On the login screen, click **Forgot password?** and submit your administrator email.
   - To prevent account enumeration attacks, the system returns an identical confirmation message regardless of whether the email exists.
   - If an active administrator account exists, an expiring single-use reset link (valid for 1 hour) is dispatched via Resend email.
   - Consuming the reset token atomically updates the password hash, records `password_changed_at`, and invalidates all prior sessions.
3. **Session Revocation & Deactivation**:
   - Any administrator account toggled to Deactivated immediately loses all dashboard access on their next request.
   - When a password is reset or updated, all sessions issued before the change timestamp are immediately revoked (HTTP 401).

---

### 5. Configuring Resend and Verifying a Sender
1. Go to [Resend.com](https://resend.com) and create an API Key with "Full access".
2. Under **Domains**, click **Add Domain** (e.g. `discountforkliftphoenix.com`).
3. Add the DNS records (DKIM and SPF) provided by Resend to your domain registrar.
4. Set your environment variables:
   ```env
   RESEND_API_KEY="re_..."
   RESEND_FROM_EMAIL="notifications@discountforkliftphoenix.com"
   NOTIFICATION_RECIPIENT_EMAIL="caleb@discountforkliftphoenix.com"
   ```
   *(During initial testing before domain verification is complete, Resend allows sending to your account email using `onboarding@resend.dev` as the sender).*

---

### 6. Configuring Private Vercel Blob Storage
1. In your Vercel Dashboard, select your project.
2. Go to the **Storage** tab and click **Create Database > Blob**.
3. Choose a store name (e.g., `spiff-sale-photos`) and set access to **Private**.
4. Vercel automatically generates `BLOB_READ_WRITE_TOKEN`.
5. Uploaded photos are stored in private Blob storage. Reps upload files up to 10 MB with server-validated magic bytes. Viewing or downloading photos is restricted to administrator sessions via `/api/admin/attachments/:id/view`.

---

### 7. Pushing the Project to GitHub
1. Initialize git and commit:
   ```bash
   git init
   git add .
   git commit -m "feat: complete Discount Forklift Spiff Tracker"
   ```
2. Create a private repository on GitHub (e.g. `discount-forklift-spiff-tracker`).
3. Add the remote and push:
   ```bash
   git remote add origin https://github.com/[your-organization]/discount-forklift-spiff-tracker.git
   git branch -M main
   git push -u origin main
   ```

---

### 8. Importing into Vercel
1. Log in to [Vercel](https://vercel.com).
2. Click **Add New... > Project**.
3. Select your GitHub repository.
4. Build Command: `npm run build`.

---

### 9. Setting Vercel Environment Variables
In your Vercel project's **Settings > Environment Variables**, add the following:

| Variable | Value Description |
|---|---|
| `DATABASE_URL` | Pooled Neon PostgreSQL connection string |
| `AUTH_SECRET` | 32-byte secret generated via `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | `true` |
| `INITIAL_ADMIN_EMAIL` | `caleb@discountforkliftphoenix.com` |
| `RESEND_API_KEY` | Resend API key (`re_...`) |
| `RESEND_FROM_EMAIL` | Verified sender (e.g. `notifications@discountforkliftphoenix.com`) |
| `NOTIFICATION_RECIPIENT_EMAIL` | Office manager email receiving alerts |
| `BLOB_READ_WRITE_TOKEN` | Generated automatically by Vercel Blob |
| `APP_URL` | Canonical app URL (e.g. `https://spiffs.discountforklift.com`) |
| `CRON_SECRET` | Random hex key for securing scheduled cron endpoints |

---

### 10. Ledger Date Filters & Timezone Handling
The Submissions Ledger provides separate, clearly labeled date filter options:
- **Submission Date Range (America/Phoenix)**: Filters by the exact timestamp when the rep submitted the request.
- **Approval Date Range (America/Phoenix)**: Filters by the date the request was approved.
- **Sale Date Range (America/Phoenix)**: Filters by the reported transaction date.

All date bounds use America/Phoenix (MST, UTC-7) boundaries with inclusive starts and exclusive upper bounds (`Date.UTC(y, m-1, d+1, 7, 0, 0)`) ensuring every second of the selected day is accounted for. Approved totals by rep include all requests subsequently marked `Paid`.
