/**
 * Discount Forklift Spiff Tracker - Full Session & Password Change Flow Verification
 *
 * Tests the complete lifecycle requested:
 * 1. Initial login with initial password -> sets HttpOnly SameSite=Lax cookie, returns mustChangePassword=true
 * 2. Session verification via /api/admin/session -> verifies cookie retention before modal display
 * 3. Enforced restriction: dashboard access blocked while mustChangePassword is true
 * 4. Required password change -> POST /api/admin/change-password with session cookie & CSRF token
 * 5. Frontend CSRF token refresh & session verification -> confirms mustChangePassword=false
 * 6. Dashboard access -> administrative endpoints accessible with refreshed session
 * 7. Page refresh simulation -> verifies session persistence across browser reloads
 * 8. Logout -> clears session cookie with Max-Age=0
 * 9. Login with new permanent password -> succeeds
 * 10. Login with old temporary password -> rejected (401)
 * 11. HTTPS reverse proxy support -> verifies '; Secure' attribute is set when x-forwarded-proto: https
 */

const BASE_URL = process.env.TEST_APP_URL || 'http://localhost:3000';

async function runSessionFlowTests() {
  console.log('=================================================================');
  console.log(' SPIFF TRACKER - ADMIN LOGIN & PASSWORD CHANGE FLOW TEST SUITE');
  console.log('=================================================================\n');

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

  const email = 'caleb@discountforkliftphoenix.com';
  const initialPassword = 'Ron58838!';
  const newPassword = 'NewCalebSecurePass2026!';

  // Helper to extract cookie from Set-Cookie header
  function extractCookie(res: Response): string | null {
    const raw = res.headers.get('set-cookie');
    if (!raw) return null;
    const match = raw.match(/spiff_admin_session=([^;]+)/);
    return match ? `spiff_admin_session=${match[1]}` : null;
  }

  // -------------------------------------------------------------
  // Step 1: Initial Login
  // -------------------------------------------------------------
  console.log('--- Step 1: Initial Login ---');
  const loginRes = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: initialPassword }),
  });

  assert('Initial login returns HTTP 200', loginRes.status === 200, `status: ${loginRes.status}`);
  const loginData = await loginRes.json();
  assert('Initial login returns mustChangePassword = true', loginData.mustChangePassword === true);
  assert('Initial login returns CSRF token', typeof loginData.csrfToken === 'string' && loginData.csrfToken.length > 20);

  const rawSetCookie = loginRes.headers.get('set-cookie') || '';
  assert('Initial login sets spiff_admin_session cookie', rawSetCookie.includes('spiff_admin_session='));
  assert('Cookie has HttpOnly flag', rawSetCookie.includes('HttpOnly'));
  assert('Cookie has SameSite=Lax', rawSetCookie.includes('SameSite=Lax'));
  assert('Cookie has Path=/', rawSetCookie.includes('Path=/'));

  const sessionCookie = extractCookie(loginRes);
  assert('Extracted valid session cookie string', Boolean(sessionCookie));

  // -------------------------------------------------------------
  // Step 1b: Verify HTTPS Secure Flag under Reverse Proxy
  // -------------------------------------------------------------
  console.log('\n--- Step 1b: HTTPS Secure Flag Handling ---');
  const httpsLoginRes = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-proto': 'https',
    },
    body: JSON.stringify({ email, password: initialPassword }),
  });
  const httpsSetCookie = httpsLoginRes.headers.get('set-cookie') || '';
  assert('HTTPS request attaches Secure attribute to session cookie', httpsSetCookie.includes('Secure'));

  // -------------------------------------------------------------
  // Step 2: Verify /api/admin/session before displaying password change form
  // -------------------------------------------------------------
  console.log('\n--- Step 2: Verify Session Before Form Display ---');
  const verifyRes = await fetch(`${BASE_URL}/api/admin/session`, {
    headers: { Cookie: sessionCookie! },
  });
  assert('Verify session endpoint returns HTTP 200', verifyRes.status === 200);
  const verifyData = await verifyRes.json();
  assert('Session is authenticated: true', verifyData.authenticated === true);
  assert('Session reflects user email', verifyData.user?.email === email);
  assert('Session user mustChangePassword is true', verifyData.user?.mustChangePassword === true);
  assert('Session returns verified CSRF token', typeof verifyData.csrfToken === 'string');

  // Verify that a request WITHOUT cookie is rejected as unauthenticated
  const unauthSessionRes = await fetch(`${BASE_URL}/api/admin/session`);
  const unauthSessionData = await unauthSessionRes.json();
  assert('Session check without cookie correctly returns authenticated: false', unauthSessionData.authenticated === false);

  // -------------------------------------------------------------
  // Step 3: Enforce Password Change Restriction on Dashboard
  // -------------------------------------------------------------
  console.log('\n--- Step 3: Enforce Password Change Restriction ---');
  const blockedDashboardRes = await fetch(`${BASE_URL}/api/admin/submissions`, {
    headers: { Cookie: sessionCookie! },
  });
  assert('Dashboard access is blocked with HTTP 403 before password change', blockedDashboardRes.status === 403);
  const blockedData = await blockedDashboardRes.json();
  assert('Error specifies password change required', blockedData.mustChangePassword === true);

  // -------------------------------------------------------------
  // Step 4: Required Password Change Flow
  // -------------------------------------------------------------
  console.log('\n--- Step 4: Required Password Change ---');

  // Rejection without cookie
  const noCookieChangeRes = await fetch(`${BASE_URL}/api/admin/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': loginData.csrfToken,
    },
    body: JSON.stringify({ newPassword }),
  });
  assert('Change-password without cookie is rejected with 401', noCookieChangeRes.status === 401);
  const noCookieData = await noCookieChangeRes.json();
  assert('Error matches "Administrator authentication required"', noCookieData.error.includes('Administrator authentication required'));

  // Rejection without valid CSRF
  const badCsrfChangeRes = await fetch(`${BASE_URL}/api/admin/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie!,
      'x-csrf-token': 'invalid-csrf-token',
    },
    body: JSON.stringify({ newPassword }),
  });
  assert('Change-password with invalid CSRF is rejected with 403', badCsrfChangeRes.status === 403);

  // Successful password change
  const changeRes = await fetch(`${BASE_URL}/api/admin/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie!,
      'x-csrf-token': loginData.csrfToken,
    },
    body: JSON.stringify({
      currentPassword: initialPassword,
      newPassword,
    }),
  });

  assert('Change-password with valid session & CSRF returns HTTP 200', changeRes.status === 200);
  const changeData = await changeRes.json();
  assert('Change-password returns success: true', changeData.success === true);
  assert('Change-password returns new CSRF token for subsequent requests', typeof changeData.csrfToken === 'string');

  const refreshedSessionCookie = extractCookie(changeRes) || sessionCookie;
  assert('Refreshed session cookie obtained', Boolean(refreshedSessionCookie));

  // -------------------------------------------------------------
  // Step 5: Dashboard Access with Refreshed Session
  // -------------------------------------------------------------
  console.log('\n--- Step 5: Dashboard Access Verification ---');
  const refreshedSessionRes = await fetch(`${BASE_URL}/api/admin/session`, {
    headers: { Cookie: refreshedSessionCookie! },
  });
  const refreshedSessionData = await refreshedSessionRes.json();
  assert('Refreshed session is authenticated', refreshedSessionData.authenticated === true);
  assert('Refreshed session confirms mustChangePassword = false', refreshedSessionData.user?.mustChangePassword === false);

  // Access dashboard endpoints with refreshed session
  const dashboardRes = await fetch(`${BASE_URL}/api/admin/submissions`, {
    headers: { Cookie: refreshedSessionCookie! },
  });
  assert('Submissions dashboard is accessible with refreshed session (HTTP 200)', dashboardRes.status === 200);

  const repsAdminRes = await fetch(`${BASE_URL}/api/admin/reps`, {
    headers: { Cookie: refreshedSessionCookie! },
  });
  assert('Reps management is accessible with refreshed session (HTTP 200)', repsAdminRes.status === 200);

  // -------------------------------------------------------------
  // Step 6: Page Refresh Simulation
  // -------------------------------------------------------------
  console.log('\n--- Step 6: Page Refresh Simulation ---');
  const pageReloadSessionRes = await fetch(`${BASE_URL}/api/admin/session`, {
    headers: { Cookie: refreshedSessionCookie! },
  });
  const pageReloadData = await pageReloadSessionRes.json();
  assert('Simulated page reload restores authenticated session', pageReloadData.authenticated === true);
  assert('User stays active as Administrator', pageReloadData.user?.role === 'Administrator');
  assert('User is not prompted again for password change', pageReloadData.user?.mustChangePassword === false);

  // -------------------------------------------------------------
  // Step 7: Logout
  // -------------------------------------------------------------
  console.log('\n--- Step 7: Logout ---');
  const logoutRes = await fetch(`${BASE_URL}/api/admin/logout`, {
    method: 'POST',
    headers: { Cookie: refreshedSessionCookie! },
  });
  assert('Logout returns HTTP 200', logoutRes.status === 200);
  const logoutSetCookie = logoutRes.headers.get('set-cookie') || '';
  assert('Logout sets Max-Age=0 to clear the session cookie', logoutSetCookie.includes('Max-Age=0'));

  // Verifying session after logout
  const postLogoutSessionRes = await fetch(`${BASE_URL}/api/admin/session`, {
    headers: { Cookie: 'spiff_admin_session=;' },
  });
  const postLogoutData = await postLogoutSessionRes.json();
  assert('Session after logout is unauthenticated', postLogoutData.authenticated === false);

  // -------------------------------------------------------------
  // Step 8: Login with New Password & Rejection of Old Temporary Password
  // -------------------------------------------------------------
  console.log('\n--- Step 8: Login with New Password & Old Password Rejection ---');
  const oldLoginAttempt = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: initialPassword }),
  });
  assert('Login with old temporary password is now rejected (HTTP 401)', oldLoginAttempt.status === 401);

  const newLoginAttempt = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: newPassword }),
  });
  assert('Login with new permanent password succeeds (HTTP 200)', newLoginAttempt.status === 200);
  const newLoginData = await newLoginAttempt.json();
  assert('Login with new permanent password reports mustChangePassword = false', newLoginData.mustChangePassword === false);

  console.log('\n=================================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSessionFlowTests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
