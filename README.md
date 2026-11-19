# Discount Forklift Spiff Tracker

A production-grade web application built for the **Discount Forklift** sales office in Phoenix, Arizona.

Sales representatives submit cash spiff requests after closing a forklift sale. Office administrators review requests, approve or reject them, disburse payments, manage spiff incentive programs and sales rep rosters, inspect audit histories, view private sale photos, and monitor email notifications.

---

## Architecture & Technology Stack

- **Framework**: React SPA with TypeScript & Tailwind CSS served via production Express/Node.js runtime.
- **Persistent Database**: [Neon PostgreSQL](https://neon.tech) utilizing serverless pooling (`@neondatabase/serverless`).
- **ORM & Migrations**: [Drizzle ORM](https://orm.drizzle.team) with version-controlled migrations (`drizzle/`).
- **Manager Authentication**: Administrators, Approving Managers, and General Managers use secure email-and-password authentication with cryptographic salted scrypt hashing, expiring single-use invite and reset tokens, HttpOnly SameSite session cookies, and explicit database allowlist enforcement in Neon. No Google OAuth or client-side credentials.
- **Administrative Deletion**: Administrators can permanently delete ledger submissions and remove unused configuration records. Submission deletion removes its photo, audit history, and email jobs; sales reps and spiff programs with submission history must be deactivated instead of deleted.
- **Shared Rate Limiting**: Multi-instance persistent rate limiting backed by Neon (`rate_limits` table) with trusted platform IP detection.
- **Email Notifications**: Microsoft Graph app-only email delivery with database job queues and retry idempotency. SMTP and Resend remain available through the existing provider selection when Graph is not selected.
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
1. **Inviting Administrators and Notification Contacts**:
   - Authorized users open **Notifications & Infrastructure** and go to **Administrator & Approving Manager Logins**.
   - An Administrator can invite a new Administrator by email. For existing Notification Contacts, select an active, eligible **Approving Manager** or **General Manager** contact; the account role and email are taken from the contact record and cannot be changed in the invitation form.
   - Each invitation generates a cryptographic, single-use setup link valid for 24 hours. Deliver the link to the invitee so they can create their own password; the token is consumed atomically and cannot be reused.
   - A General Manager contact must be assigned directly to an active branch before invitation. General Managers see only the ledger and submissions for those explicitly assigned branches; rep-to-GM assignments do not grant branch access. They remain read-only in the app, while the secure **Mark as Paid** action in the paid-status email remains available without signing in.
2. **Self-Service Password Reset**:
   - On the login screen, click **Forgot password?** and submit your administrator email.
   - To prevent account enumeration attacks, the system returns an identical confirmation message regardless of whether the email exists.
   - If an active administrator account exists, an expiring single-use reset link (valid for 1 hour) is dispatched through the configured email provider.
   - Consuming the reset token atomically updates the password hash, records `password_changed_at`, and invalidates all prior sessions.
3. **Session Revocation & Deactivation**:
   - Any administrator account toggled to Deactivated immediately loses all dashboard access on their next request.
   - When a password is reset or updated, all sessions issued before the change timestamp are immediately revoked (HTTP 401).

---

### 5. Configuring Email Notifications

Production email delivery uses Microsoft Graph app-only authentication and sends through **Discount Forklift Spiff Tracker <admin@discountforkliftphoenix.com>**. The server-side provider routes submission alerts, approval/denial results, General Manager paid-receipt notices, weekly Accounting reports with CSV attachments, administrator test messages, and account invitation/reset messages through the same provider. A Graph `202 Accepted` response means Microsoft Graph accepted the request; it does not confirm final mailbox delivery. Existing queue idempotency, dispatch logs, and retry handling remain in place. Graph `sendMail` does not provide provider-level idempotency, so an ambiguous transport failure after Graph accepts a request can still result in a duplicate on retry.

#### Microsoft Graph (Production)
1. In Microsoft Entra ID, register an application in the tenant that owns `admin@discountforkliftphoenix.com`.
2. Grant the application the Microsoft Graph **Application** permission `Mail.Send` and grant tenant admin consent. Ensure the application is authorized to send from the specified mailbox.
3. In Vercel **Settings > Environment Variables**, set the following for the **Production** environment:
   ```env
   EMAIL_PROVIDER="microsoft_graph"
   GRAPH_TENANT_ID="00000000-0000-0000-0000-000000000000"
   GRAPH_CLIENT_ID="00000000-0000-0000-0000-000000000000"
   GRAPH_AUTH_MODE="client_secret"
   GRAPH_CLIENT_SECRET="your-Entra-application-client-secret"
   ```
   `GRAPH_AUTH_MODE` must be either `client_secret` or `certificate`. For certificate mode, replace `GRAPH_AUTH_MODE` and `GRAPH_CLIENT_SECRET` with:
   ```env
   GRAPH_AUTH_MODE="certificate"
   GRAPH_CERTIFICATE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...private key...\n-----END PRIVATE KEY-----"
   GRAPH_CERTIFICATE_THUMBPRINT="40-character-SHA-1-hex-thumbprint"
   ```
   The certificate's public key must also be registered on the Entra application. The thumbprint can alternatively be supplied in Base64url format. Encrypted PEM keys are not supported.
4. Keep all credentials in server-side Vercel environment variables (or the ignored local `.env` file); never use `VITE_` variables, commit credentials, or expose tokens to browser code. Do not configure both authentication modes together.
5. After IT has configured the Entra application and Vercel Production variables, redeploy the application and verify **Admin Settings > Infrastructure** reports **Microsoft Graph Active**. Use the existing administrator test-email workflow for a controlled delivery check.

`EMAIL_PROVIDER="microsoft_graph"` explicitly requires valid Graph settings. Any Graph settings also select Graph and incomplete/invalid settings fail clearly rather than falling through to SMTP or Resend. If all Graph variables and `EMAIL_PROVIDER` are omitted, the previous selection remains: Gmail is selected when both `GMAIL_USER` and `GMAIL_APP_PASSWORD` are set; otherwise Outlook is selected when both `OUTLOOK_USER` and `OUTLOOK_PASSWORD` are set; otherwise Resend is selected when `RESEND_API_KEY` is configured. Delivery errors do not trigger automatic provider failover. Legacy SMTP/Resend sender addresses remain as previously configured; Graph always uses the specified mailbox and display name.

#### Gmail SMTP (no sending domain required)
1. Use the Gmail account that should send app notifications and enable [2-Step Verification](https://myaccount.google.com/signinoptions/two-step-verification).
2. Open [Google App Passwords](https://myaccount.google.com/apppasswords) and create an app password for this app. Google may not offer App Passwords for some account types or managed accounts.
3. In the deployed Vercel project, open **Settings > Environment Variables** and add:
   ```env
   GMAIL_USER="youraddress@gmail.com"
   GMAIL_APP_PASSWORD="your-16-character-app-password"
   ```
   Keep the app password secret. Do not add it to source control or any browser-side setting. Spaces in the app password are ignored.
4. Redeploy the Vercel project. In **Admin Settings > Infrastructure**, confirm the email delivery status reads **Gmail SMTP Active**.
5. In **Admin Settings > Notification Routing**, set the recipient email, then send a test email from **Email Templates** to verify delivery.

For local development, use the same two variables in the ignored local `.env` file and restart the server. Gmail is intended for low-volume notifications and has sending limits; Google Workspace administrators may also restrict SMTP or App Password use.

#### Outlook SMTP
1. Configure an Outlook.com or Microsoft 365 mailbox for authenticated SMTP. Microsoft 365 tenants may need SMTP AUTH enabled for the mailbox.
2. Set these environment variables:
   ```env
   OUTLOOK_USER="youraddress@outlook.com"
   OUTLOOK_PASSWORD="your-mailbox-or-app-password"
   ```
   The sender address defaults to `OUTLOOK_USER`. To use a different address, set `OUTLOOK_FROM_EMAIL` only to an address authorized for that mailbox's Send As permission. Do not use the display name setting to disguise the sender address.
3. The default SMTP host is `smtp-mail.outlook.com` on port 587 with TLS. For Microsoft 365, set `OUTLOOK_SMTP_HOST="smtp.office365.com"` if required by your tenant.

The sender header for legacy Gmail uses `GMAIL_USER`; Outlook uses `OUTLOOK_FROM_EMAIL` (or `OUTLOOK_USER` when unset); and Resend uses `RESEND_FROM_EMAIL` (defaulting to `notifications@discountforkliftphoenix.com`). The Resend address must be verified by Resend.

Notification recipient menus are populated from active contacts configured in Neon. If no active contacts are configured, add them in **Notifications & Contacts**; the app will not substitute sample or fallback recipients.

To safely clean the retired placeholder recipients from an existing Neon database, configure `DATABASE_URL` in the local ignored `.env` file or the shell environment, then run:
```bash
npm run cleanup:placeholder-recipients
```
The script deactivates only contacts matching the four retired addresses, removes their IDs from sales-rep General Manager assignments, clears the notification-recipient setting if it matches, and cancels queued, failed, or processing email jobs to those addresses. It preserves historical submissions, audit records, and sent email jobs.

New-submission notification emails include **Approve** and **Deny** links for the routed approving manager. The links are signed with `AUTH_SECRET`, expire after 7 days, and work only while the request is pending; the first confirmed decision wins. Opening either link displays a confirmation page and does not change request status or send a result email. The action is recorded only after an explicit POST confirmation, and denial requires a reason. The linked contact must still be active and have the exact **Approving Manager** role. Treat these links as sensitive and do not forward them.

Administrators can reopen an incorrectly denied request as **Pending** from its detail view. Reopening requires a written explanation, preserves the original denial event in audit history, and sends no email. A later approval is a separate action and follows the normal approval and notification flow.

For the one-time repair of `SPF-2026-7UZ3FQ`, an Administrator can assign a branch only while both saved branch fields are NULL and the request remains Paid. The selected active branch must match Jeff Haworth’s current assignment. The confirmation requires an explanation and records the previous and new branch values in audit history without changing approval or payment details or sending email. This repair uses the existing audit schema and requires no migration.

The **Spiff Approved Result** goes to the submitting sales rep. Their assigned active General Manager(s) receive a separate **Spiff Approved Paid Receipt** with a **Mark as Paid** link; it requires no sign-in, expires after 7 days, and only works while the request is approved. Opening the link only displays a confirmation page; payment is recorded after an explicit POST confirmation. The linked contact must still be active and have the exact **General Manager** role. Anyone with access to that email link can confirm payment, so keep it private. The **Spiff Denied Result** continues to go to the rep and selected recipients.

#### Resend
1. Go to [Resend.com](https://resend.com) and create an API Key with "Full access".
2. Under **Domains**, click **Add Domain** (e.g. `discountforkliftphoenix.com`).
3. Add the DNS records (DKIM and SPF) provided by Resend to your domain registrar.
4. Set your environment variables:
   ```env
   RESEND_API_KEY="re_..."
   RESEND_FROM_EMAIL="notifications@discountforkliftphoenix.com"
   NOTIFICATION_RECIPIENT_EMAIL="caleb@discountforkliftphoenix.com"
   ```
   Resend requires a verified domain before it can send from your own address.

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
| `EMAIL_PROVIDER` | Set to `microsoft_graph` to explicitly require Graph rather than legacy providers |
| `GRAPH_TENANT_ID` | Microsoft Entra tenant GUID (server-only) |
| `GRAPH_CLIENT_ID` | Entra app registration client GUID (server-only) |
| `GRAPH_AUTH_MODE` | Required authentication mode: `client_secret` or `certificate` |
| `GRAPH_CLIENT_SECRET` | Entra application client secret for `client_secret` mode (server-only) |
| `GRAPH_CERTIFICATE_PRIVATE_KEY` | Unencrypted RSA PEM private key for `certificate` mode (server-only) |
| `GRAPH_CERTIFICATE_THUMBPRINT` | Certificate SHA-1 thumbprint in 40-character hex or Base64url format |
| `GMAIL_USER` | Legacy Gmail address (optional; use with `GMAIL_APP_PASSWORD`) |
| `GMAIL_APP_PASSWORD` | Legacy Google App Password |
| `OUTLOOK_USER` | Legacy Outlook SMTP login and default sender address |
| `OUTLOOK_PASSWORD` | Legacy Outlook mailbox or app password |
| `OUTLOOK_FROM_EMAIL` | Optional legacy Outlook sender authorized for the mailbox |
| `OUTLOOK_SMTP_HOST` | Optional legacy Outlook SMTP host (defaults to `smtp-mail.outlook.com`) |
| `RESEND_API_KEY` | Legacy Resend API key (`re_...`) |
| `RESEND_FROM_EMAIL` | Legacy verified Resend sender |
| `NOTIFICATION_RECIPIENT_EMAIL` | Office manager email receiving alerts |
| `BLOB_READ_WRITE_TOKEN` | Generated automatically by Vercel Blob |
| `APP_URL` | In Production, set to the verified stable Production domain from Vercel **Settings > Domains** (not a deployment-specific `*.vercel.app` URL). If unset, the app uses Vercel's `VERCEL_PROJECT_PRODUCTION_URL`. |
| `CRON_SECRET` | Random hex key for securing scheduled cron endpoints |

The weekly Spiff submission report is sent to active contacts with the `Accounting` role every Monday at 8:00 AM America/Phoenix. Its Vercel Cron schedule is `0 15 * * 1` UTC; the report covers the preceding Monday-to-Monday Phoenix calendar week and includes a CSV attachment. Apply the checked-in database migrations before enabling the job.

Administrators can preview the report in **Settings > Weekly Spiff Report** and send a test copy to a non-Accounting address. Test emails are prefixed with `TEST:` and recorded separately; they do not change the scheduled report’s delivery record.

---

### 10. Ledger Date Filters & Timezone Handling
The Submissions Ledger provides separate, clearly labeled date filter options:
- **Submission Date Range (America/Phoenix)**: Filters by the exact timestamp when the rep submitted the request.
- **Approval Date Range (America/Phoenix)**: Filters by the date the request was approved.
- **Sale Date Range (America/Phoenix)**: Filters by the reported transaction date.

All date bounds use America/Phoenix (MST, UTC-7) boundaries with inclusive starts and exclusive upper bounds (`Date.UTC(y, m-1, d+1, 7, 0, 0)`) ensuring every second of the selected day is accounted for. Approved totals by rep include all requests subsequently marked `Paid`.
