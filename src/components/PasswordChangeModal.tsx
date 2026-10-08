import React, { useState } from 'react';
import { ShieldCheck, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, LogOut, ExternalLink } from 'lucide-react';
import { adminFetch, getAdminSession, setAdminSession } from '../lib/api';

interface PasswordChangeModalProps {
  isOpen: boolean;
  userEmail: string;
  onSuccess: (newCsrfToken?: string) => void;
  onLogout: () => void;
}

export const PasswordChangeModal: React.FC<PasswordChangeModalProps> = ({
  isOpen,
  userEmail,
  onSuccess,
  onLogout,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCookieError, setIsCookieError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsCookieError(false);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('New password must contain both letters and numbers.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please verify and try again.');
      return;
    }
    if (currentPassword && currentPassword === newPassword) {
      setError('New password must be different from your temporary initial password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await adminFetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: currentPassword || undefined,
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401 || data.error?.toLowerCase().includes('authentication required')) {
          setIsCookieError(true);
        }
        throw new Error(data.error || 'Failed to update password.');
      }

      // 1. Immediately update stored CSRF token from the change-password response
      if (data.csrfToken) {
        const currentProfile = getAdminSession();
        if (currentProfile) {
          setAdminSession({
            ...currentProfile,
            csrfToken: data.csrfToken,
          });
        }
      }

      // 2. Verify that the refreshed session can access the dashboard (mustChangePassword is now false)
      const verifyRes = await adminFetch('/api/admin/session');
      const verifyData = await verifyRes.json();
      if (!verifyData.authenticated || verifyData.user?.mustChangePassword) {
        throw new Error(
          verifyData.error ||
          'Session verification failed after password change. Please sign in again.'
        );
      }

      // Update stored profile with verified session data
      setAdminSession({
        email: verifyData.user.email,
        name: verifyData.user.name,
        role: verifyData.user.role,
        csrfToken: verifyData.csrfToken || data.csrfToken,
      });

      onSuccess(verifyData.csrfToken || data.csrfToken);
    } catch (err: any) {
      setError(err.message || 'Error updating password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#2d2d2d] border border-[#A559BD]/50 rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150 text-gray-100">
        <div className="flex items-center space-x-3 pb-3 border-b border-[#383838]">
          <div className="p-2 bg-[#95EA00]/10 rounded-lg border border-[#95EA00]/30">
            <ShieldCheck className="w-6 h-6 text-[#95EA00]" />
          </div>
          <div>
            <h3 className="font-bold text-base text-white">Password Change Required</h3>
            <p className="text-xs text-gray-400">First-time administrator security requirement</p>
          </div>
        </div>

        <div className="mt-3 p-3 bg-purple-950/40 border border-purple-800/60 rounded-lg text-xs text-purple-200">
          <p className="leading-relaxed">
            Welcome, <strong className="text-white">{userEmail}</strong>. You are currently signed in with a temporary initial password. For security, you must establish a permanent password before accessing administrative features.
          </p>
        </div>

        {isCookieError && (
          <div className="mt-3 p-3.5 bg-amber-950/70 border border-amber-500/80 rounded-lg text-xs text-amber-100 space-y-2.5">
            <div className="flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-200">Session Cookie Not Retained</p>
                <p className="mt-1 text-amber-200/90 leading-relaxed text-[11px]">
                  The server did not receive your login session cookie. In an embedded preview, browser privacy restrictions block cookies inside iframes. Please open the app in a standalone tab to save your new password.
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
              <button
                type="button"
                onClick={onLogout}
                className="text-[11px] text-amber-300 hover:underline"
              >
                Sign in again
              </button>
            </div>
          </div>
        )}

        {error && !isCookieError && (
          <div className="mt-3 p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-200 flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-gray-200 mb-1">
              Current / Temporary Password <span className="text-gray-400 font-normal">(Optional if already authenticated)</span>
            </label>
            <div className="relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-[#1e1e1e] border border-[#444444] rounded-lg px-3 py-2 pr-10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#95EA00] focus:border-[#95EA00]"
                placeholder="Enter current temporary password"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-1"
                tabIndex={-1}
              >
                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-200 mb-1">
              New Permanent Password
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-[#1e1e1e] border border-[#444444] rounded-lg px-3 py-2 pr-10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#95EA00] focus:border-[#95EA00]"
                placeholder="At least 8 chars with letters & numbers"
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-1"
                tabIndex={-1}
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
              className="w-full bg-[#1e1e1e] border border-[#444444] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#95EA00] focus:border-[#95EA00]"
              placeholder="Re-enter new password"
              required
            />
          </div>

          <div className="p-2.5 bg-[#1e1e1e] border border-[#383838] rounded-lg text-[11px] text-gray-300 space-y-1">
            <div className="flex items-center space-x-1.5">
              <CheckCircle2
                className={`w-3.5 h-3.5 ${newPassword.length >= 8 ? 'text-[#95EA00]' : 'text-gray-500'}`}
              />
              <span>At least 8 characters in length</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <CheckCircle2
                className={`w-3.5 h-3.5 ${/[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword) ? 'text-[#95EA00]' : 'text-gray-500'}`}
              />
              <span>Contains both letters and numbers</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <CheckCircle2
                className={`w-3.5 h-3.5 ${confirmPassword && newPassword === confirmPassword ? 'text-[#95EA00]' : 'text-gray-500'}`}
              />
              <span>Passwords match</span>
            </div>
          </div>

          <div className="pt-2 space-y-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center space-x-2 py-2.5 bg-[#A559BD] hover:bg-[#934da9] text-white font-bold text-sm rounded-lg shadow-md transition-colors disabled:opacity-50"
            >
              <Lock className="w-4 h-4" />
              <span>{isSubmitting ? 'Updating Password...' : 'Save Password & Access Dashboard'}</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="w-full inline-flex items-center justify-center space-x-2 py-2 text-xs text-gray-400 hover:text-white transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log out instead</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
