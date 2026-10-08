/**
 * Discount Forklift Spiff Tracker - Authenticated API Client
 * Uses secure, HttpOnly SameSite cookies for session management.
 * Does NOT store session tokens in localStorage.
 * Automatically attaches CSRF tokens on state-changing administrative requests.
 */

interface AdminProfile {
  email: string;
  name?: string | null;
  role: string;
  csrfToken?: string;
}

let activeProfile: AdminProfile | null = null;

export function getAdminSession(): AdminProfile | null {
  return activeProfile;
}

export function setAdminSession(profile: AdminProfile | null) {
  activeProfile = profile;
}

export function clearAdminSession() {
  activeProfile = null;
}

/**
 * Perform an authenticated API request with HttpOnly session cookies and CSRF token protection.
 * Session credentials are never stored in or read from localStorage.
 */
export async function adminFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);

  const method = (init?.method || 'GET').toUpperCase();
  const mutationMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (mutationMethods.includes(method) && activeProfile?.csrfToken) {
    headers.set('x-csrf-token', activeProfile.csrfToken);
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: 'include', // Ensure HttpOnly session cookies are transmitted
  });

  // Automatically clear local profile state if server rejects with 401 or 403
  if (response.status === 401 || response.status === 403) {
    if (response.status === 401) {
      clearAdminSession();
    }
  }

  return response;
}
