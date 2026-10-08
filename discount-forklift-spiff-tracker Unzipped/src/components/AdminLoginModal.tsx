import React, { useState } from 'react';
import {
  ShieldCheck,
  X,
  AlertCircle,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  ExternalLink,
} from 'lucide-react';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (
    email: string,
    role?: string,
    sessionToken?: string,
    csrfToken?: string,
    mustChangePassword?: boolean
  ) => void;
  initialToken?: string | null;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  initialToken = null,
}) => {
  const [mode, setMode] = useState<'login' | 'forgot' | 'setup'>(initialToken ? 'setup' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [iframeWarning, setIframeWarning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;

  // Setup / Reset token state
  const [tokenInput, setTokenInput] = useState(initialToken || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [tokenVerifiedEmail, setTokenVerifiedEmail] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIframeWarning(false);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Please enter your administrator email address.');
      return;
    }
    if (!password) {
      setError('Please enter your administrator password.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Explicit credentials: 'include' for administrator login
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: cleanEmail,
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed. Please verify your credentials.');
      }

      // 2. Explicitly verify /api/admin/session with credentials: 'include'
      // Confirms the browser actually retained and transmitted the HttpOnly session cookie
      const verifyRes = await fetch('/api/admin/session', {
        credentials: 'include',
      });
      const verifyData = await verifyRes.json();

      if (!verifyData.authenticated) {
        // The browser blocked or rejected the HttpOnly session cookie.
        // This occurs in cross-origin / embedded iframe previews where browsers block third-party cookies.
        setIframeWarning(true);
        setError(
          'Browser Cookie Restrictions: Your login credentials succeeded, but your browser blocked the session cookie inside this preview frame. Please open the app in a standalone browser tab to sign in and establish your password.'
        );
        return;
      }

      // 3. Session confirmed active and retained by browser!
      onLoginSuccess(
        verifyData.user?.email || data.email || cleanEmail,
        verifyData.user?.role || data.role || 'Administrator',
        undefined,
        verifyData.csrfToken || data.csrfToken,
        Boolean(verifyData.user?.mustChangePassword ?? data.mustChangePassword)
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify your credentials and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Please enter your administrator email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email: cleanEmail }),
      });

      const data = await res.json();
      setSuccessMessage(
        data.message ||
          'If an active administrator account exists with this email, a password reset link has been dispatched.'
      );
    } catch (err: any) {
      setError(err.message || 'Error processing password reset request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyToken = async () => {
    if (!tokenInput.trim()) {
      setError('Please provide a setup or reset token.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/setup-password/verify?token=${encodeURIComponent(tokenInput.trim())}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        throw new Error(data.error || 'Invalid or expired setup token.');
      }
      setTokenVerifiedEmail(data.email);
    } catch (err: any) {
      setError(err.message || 'Failed to verify setup token.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!tokenInput.trim()) {
      setError('Setup token is required.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Password must contain both letters and numbers.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please verify.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/admin/setup-password/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          token: tokenInput.trim(),
          password: newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to establish password.');
      }

      setSuccessMessage('Password established successfully! You can now sign in with your new password.');
      setPassword(newPassword);
      if (tokenVerifiedEmail) {
        setEmail(tokenVerifiedEmail);
      }
      setMode('login');
    } catch (err: any) {
      setError(err.message || 'Failed to complete password setup.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150 text-gray-100">
        <div className="flex items-center justify-between pb-3 border-b border-[#383838]">
          <div className="flex items-center space-x-2 text-white">
            <ShieldCheck className="w-5 h-5 text-[#95EA00]" />
            <h3 className="font-bold text-base">
              {mode === 'login' && 'Office Administrator Login'}
              {mode === 'forgot' && 'Reset Administrator Password'}
              {mode === 'setup' && 'Establish Administrator Password'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-[#383838] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {iframeWarning && (
          <div className="mt-3 p-3.5 bg-amber-950/70 border border-amber-500/80 rounded-lg text-xs text-amber-100 space-y-2.5">
            <div className="flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-200">Browser Cookie Restrictions Detected</p>
                <p className="mt-1 text-amber-200/90 leading-relaxed text-[11px]">
                  Your password was verified by the server, but your browser blocked the session cookie inside this preview frame.
                  To complete your login and mandatory password change, please open the app in a standalone tab.
                </p>
              </div>
            </div>
            <div className="pt-1 flex items-center justify-between">
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#A559BD] hover:bg-[#934da9] text-white font-semibold text-xs rounded-md shadow transition-colors"
              >
                <span>Open in Standalone Tab</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <span className="text-[11px] text-amber-300/80">Opens in full browser window</span>
            </div>
          </div>
        )}

        {error && !iframeWarning && (
          <div className="mt-3 p-3 bg-rose-950/50 border border-rose-800 rounded-lg text-xs text-rose-200 flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {isEmbedded && !iframeWarning && (
          <div className="mt-3 p-2 bg-blue-950/30 border border-blue-800/40 rounded-lg text-[11px] text-blue-200 flex items-center justify-between">
            <span className="text-gray-300">Embedded preview detected</span>
            <a
              href={window.location.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#95EA00] hover:underline font-semibold inline-flex items-center space-x-1"
            >
              <span>Open Standalone Tab</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {successMessage && (
          <div className="mt-3 p-3 bg-[#95EA00]/15 border border-[#95EA00]/40 rounded-lg text-xs text-white flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-[#95EA00] flex-shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* 1. LOGIN MODE */}
        {mode === 'login' && (
          <>
            <p className="text-xs text-gray-300 mt-3 mb-4 leading-relaxed">
              Authorized administrator access only. Accounts are strictly validated against the Neon database allowlist.
            </p>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Administrator Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#95EA00] focus:border-[#95EA00]"
                  placeholder="e.g. administrator@discountforkliftphoenix.com"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-200">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setSuccessMessage(null);
                      setMode('forgot');
                    }}
                    className="text-[11px] text-[#A559BD] hover:text-[#c479dc] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[#1e1e1e] border border-[#444444] rounded-lg px-3 py-2 pr-10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#95EA00] focus:border-[#95EA00]"
                    placeholder="Enter password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-1"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full inline-flex items-center justify-center space-x-2 py-2.5 bg-[#A559BD] hover:bg-[#934da9] text-white font-bold text-sm rounded-lg shadow-md transition-colors disabled:opacity-50"
                >
                  <Lock className="w-4 h-4" />
                  <span>{isSubmitting ? 'Verifying Session...' : 'Sign In as Administrator'}</span>
                </button>
              </div>

              <div className="pt-3 border-t border-[#383838] flex items-center justify-between text-[11px] text-gray-400">
                <span>Have an invite or setup link?</span>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMessage(null);
                    setMode('setup');
                  }}
                  className="text-[#95EA00] hover:underline font-medium"
                >
                  Enter Setup Token
                </button>
              </div>
            </form>
          </>
        )}

        {/* 2. FORGOT PASSWORD MODE */}
        {mode === 'forgot' && (
          <>
            <p className="text-xs text-gray-300 mt-3 mb-4 leading-relaxed">
              Enter your registered administrator email address. If an active account exists, an expiring single-use reset link will be dispatched.
            </p>

            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Administrator Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#95EA00] focus:border-[#95EA00]"
                  placeholder="e.g. administrator@discountforkliftphoenix.com"
                  required
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full inline-flex items-center justify-center space-x-2 py-2.5 bg-[#A559BD] hover:bg-[#934da9] text-white font-bold text-sm rounded-lg shadow-md transition-colors disabled:opacity-50"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{isSubmitting ? 'Sending Request...' : 'Send Password Reset Link'}</span>
                </button>
              </div>

              <div className="pt-3 border-t border-[#383838] text-center">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode('login');
                  }}
                  className="inline-flex items-center space-x-1 text-xs text-gray-300 hover:text-white"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Return to Sign In</span>
                </button>
              </div>
            </form>
          </>
        )}

        {/* 3. SETUP / TOKEN MODE */}
        {mode === 'setup' && (
          <>
            <p className="text-xs text-gray-300 mt-3 mb-4 leading-relaxed">
              Use your expiring, single-use invite or reset token to establish your password.
            </p>

            <form onSubmit={handleCompleteSetup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Setup / Reset Token
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={tokenInput}
                    onChange={(e) => {
                      setTokenInput(e.target.value);
                      setTokenVerifiedEmail(null);
                    }}
                    className="flex-1 bg-[#1e1e1e] border border-[#444444] rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-[#95EA00]"
                    placeholder="Enter raw token"
                    required
                  />
                  <button
                    type="button"
                    onClick={handleVerifyToken}
                    disabled={isSubmitting || !tokenInput.trim()}
                    className="px-3 py-2 bg-[#383838] hover:bg-[#484848] text-xs font-semibold rounded-lg text-white disabled:opacity-50"
                  >
                    Verify
                  </button>
                </div>
                {tokenVerifiedEmail && (
                  <p className="text-[11px] text-[#95EA00] mt-1 flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Verified for {tokenVerifiedEmail}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  New Password (min. 8 characters, letters & numbers)
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-[#1e1e1e] border border-[#444444] rounded-lg px-3 py-2 pr-10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#95EA00]"
                    placeholder="Enter new password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-1"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#95EA00]"
                  placeholder="Repeat new password"
                  required
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full inline-flex items-center justify-center space-x-2 py-2.5 bg-[#95EA00] hover:bg-[#84d000] text-black font-bold text-sm rounded-lg shadow-md transition-colors disabled:opacity-50"
                >
                  <Lock className="w-4 h-4" />
                  <span>{isSubmitting ? 'Establishing Password...' : 'Save Password & Enable Account'}</span>
                </button>
              </div>

              <div className="pt-3 border-t border-[#383838] text-center">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode('login');
                  }}
                  className="inline-flex items-center space-x-1 text-xs text-gray-300 hover:text-white"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Return to Sign In</span>
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
