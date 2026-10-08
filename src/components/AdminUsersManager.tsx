import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  UserPlus,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Lock,
  RefreshCw,
  Copy,
  Link2,
  Shield,
  Send,
} from 'lucide-react';
import { formatPhoenixDateTime } from '../lib/timezone';
import { adminFetch } from '../lib/api';

export interface AdminUserRecord {
  id: string;
  email: string;
  name?: string | null;
  role?: 'Administrator' | 'Approving Manager' | string | null;
  isAuthorized: boolean;
  hasPassword?: boolean;
  passwordChangedAt?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

interface AdminUsersManagerProps {
  adminUser: string;
  embedded?: boolean;
}

export const AdminUsersManager: React.FC<AdminUsersManagerProps> = ({ adminUser, embedded = false }) => {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Add / Invite Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addMode, setAddMode] = useState<'invite' | 'direct'>('invite');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'Administrator' | 'Approving Manager'>('Approving Manager');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirmPassword, setNewConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Generated Link Modal (for invite or reset link)
  const [generatedLinkModal, setGeneratedLinkModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    url: string;
    expiresAt: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Change Password Modal State
  const [passwordModalUser, setPasswordModalUser] = useState<AdminUserRecord | null>(null);
  const [passwordValue, setPasswordValue] = useState('');
  const [confirmPasswordValue, setConfirmPasswordValue] = useState('');
  const [showPasswordValue, setShowPasswordValue] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const loadUsers = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const res = await adminFetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load administrator accounts.');
      setUsers(data.users || []);
    } catch (err: any) {
      console.error('Error fetching admin users:', err);
      setActionError(err.message || 'Error loading administrators.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [adminUser]);

  const showSuccessBanner = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 5000);
  };

  // Create User or Invite Link
  const handleCreateOrInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    const emailClean = newEmail.trim().toLowerCase();
    if (!emailClean) {
      setActionError('Email address is required.');
      return;
    }

    if (addMode === 'direct') {
      if (newPassword.length < 8) {
        setActionError('Password must be at least 8 characters long.');
        return;
      }
      if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        setActionError('Password must contain both letters and numbers.');
        return;
      }
      if (newPassword !== newConfirmPassword) {
        setActionError('Passwords do not match. Please verify.');
        return;
      }
    }

    setIsCreating(true);
    try {
      if (addMode === 'invite') {
        const res = await adminFetch('/api/admin/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newName.trim() || undefined,
            email: emailClean,
            role: newRole,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to generate invitation link.');

        setIsAddModalOpen(false);
        setNewName('');
        setNewEmail('');
        setNewPassword('');
        setNewConfirmPassword('');
        loadUsers();

        setGeneratedLinkModal({
          isOpen: true,
          title: 'Single-Use Invite Link Generated',
          description: `Deliver this single-use setup link to ${emailClean}. It expires in 24 hours:`,
          url: data.inviteUrl,
          expiresAt: data.expiresAt,
        });
      } else {
        const res = await adminFetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newName.trim() || undefined,
            email: emailClean,
            role: newRole,
            password: newPassword,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create user account.');

        setIsAddModalOpen(false);
        setNewName('');
        setNewEmail('');
        setNewPassword('');
        setNewConfirmPassword('');
        showSuccessBanner(`Created ${newRole} account for ${emailClean}.`);
        loadUsers();
      }
    } catch (err: any) {
      setActionError(err.message || 'Error processing administrator account.');
    } finally {
      setIsCreating(false);
    }
  };

  // Generate Reset Link for existing user
  const handleGenerateResetLink = async (user: AdminUserRecord) => {
    setActionError(null);
    try {
      const res = await adminFetch(`/api/admin/users/${user.id}/reset-link`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate reset link.');

      setGeneratedLinkModal({
        isOpen: true,
        title: 'Single-Use Password Reset Link',
        description: `Single-use password link generated for ${user.email}. It expires in 1 hour:`,
        url: data.resetUrl,
        expiresAt: data.expiresAt,
      });
    } catch (err: any) {
      setActionError(err.message || 'Error generating reset link.');
    }
  };

  // Update Role
  const handleUpdateRole = async (user: AdminUserRecord, updatedRole: string) => {
    setActionError(null);
    try {
      const res = await adminFetch(`/api/admin/users/${user.id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: updatedRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user role.');

      showSuccessBanner(`Updated role for ${user.email} to ${updatedRole}.`);
      loadUsers();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update user role.');
    }
  };

  // Change Password directly
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalUser) return;
    setActionError(null);

    if (passwordValue.length < 8) {
      setActionError('New password must be at least 8 characters long.');
      return;
    }
    if (!/[a-zA-Z]/.test(passwordValue) || !/[0-9]/.test(passwordValue)) {
      setActionError('Password must contain both letters and numbers.');
      return;
    }
    if (passwordValue !== confirmPasswordValue) {
      setActionError('Passwords do not match. Please verify.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const res = await adminFetch(`/api/admin/users/${passwordModalUser.id}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update administrator password.');

      setPasswordModalUser(null);
      setPasswordValue('');
      setConfirmPasswordValue('');
      showSuccessBanner(`Password updated successfully for ${passwordModalUser.email}. Prior sessions revoked.`);
      loadUsers();
    } catch (err: any) {
      setActionError(err.message || 'Error updating password.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // Toggle Authorization
  const handleToggleStatus = async (user: AdminUserRecord) => {
    setActionError(null);
    try {
      const res = await adminFetch(`/api/admin/users/${user.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAuthorized: !user.isAuthorized }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update authorization status.');

      showSuccessBanner(
        `Administrator ${user.email} is now ${!user.isAuthorized ? 'Authorized' : 'Deactivated'}.`
      );
      loadUsers();
    } catch (err: any) {
      setActionError(err.message || 'Failed to change administrator status.');
    }
  };

  // Delete User
  const handleDeleteUser = async (user: AdminUserRecord) => {
    if (user.email.toLowerCase() === adminUser.toLowerCase()) {
      alert('You cannot delete your own logged-in administrator account.');
      return;
    }

    if (!window.confirm(`Are you sure you want to remove administrator access for "${user.email}"?`)) {
      return;
    }

    setActionError(null);
    try {
      const res = await adminFetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete administrator account.');

      showSuccessBanner(`Deleted administrator account for ${user.email}.`);
      loadUsers();
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete administrator.');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  return (
    <div className={embedded ? 'space-y-5' : 'bg-[#2d2d2d] border border-[#444444] rounded-xl p-6 shadow-sm space-y-5'}>
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <KeyRound className="w-5 h-5 text-[#95EA00]" />
            <h3 className="text-base font-bold text-white">Administrator Accounts & Access Control</h3>
          </div>
          <p className="text-xs text-gray-300 mt-1">
            Explicitly allowlisted administrator accounts in Neon with salted scrypt hashing, expiring invite links, and session revocation.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={loadUsers}
            disabled={isLoading}
            className="p-2 text-gray-300 hover:text-white rounded border border-[#444444] bg-[#1e1e1e] hover:bg-[#383838] transition-colors"
            title="Refresh administrator logins"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setIsAddModalOpen(true);
              setActionError(null);
            }}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-[#A559BD] hover:bg-[#934da9] text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add / Invite Admin</span>
          </button>
        </div>
      </div>

      {/* Success Banner */}
      {actionSuccess && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-lg text-xs text-emerald-200 flex items-center space-x-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-[#95EA00] flex-shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Error Banner */}
      {actionError && (
        <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-200 flex items-center space-x-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Users Table */}
      <div className="border border-[#444444] rounded-lg overflow-x-auto bg-[#242424]">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#1e1e1e] border-b border-[#444444] text-gray-300 uppercase text-[10px] font-semibold">
            <tr>
              <th className="py-2.5 px-4">Account / Name</th>
              <th className="py-2.5 px-4">Administrator Email</th>
              <th className="py-2.5 px-4">Role</th>
              <th className="py-2.5 px-4">Authorization</th>
              <th className="py-2.5 px-4">Password Status</th>
              <th className="py-2.5 px-4">Last Login</th>
              <th className="py-2.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#383838] text-gray-200">
            {users.map((u) => {
              const isCurrent = u.email.toLowerCase() === adminUser.toLowerCase();

              return (
                <tr key={u.id} className="hover:bg-[#333333] transition-colors">
                  <td className="py-3 px-4 font-medium text-white">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full bg-[#A559BD]/30 border border-[#A559BD]/60 text-white flex items-center justify-center font-bold text-[10px]">
                        {(u.name || u.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span>{u.name || 'Administrator'}</span>
                        {isCurrent && (
                          <span className="ml-2 text-[10px] font-bold text-[#95EA00] bg-[#95EA00]/15 border border-[#95EA00]/30 px-1.5 py-0.5 rounded">
                            You (Current)
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-4 font-mono text-gray-300 text-xs">
                    {u.email}
                  </td>

                  <td className="py-3 px-4">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded text-[11px] font-semibold border ${
                          u.role === 'Approving Manager'
                            ? 'bg-[#A559BD]/20 text-purple-200 border-[#A559BD]/50'
                            : 'bg-[#95EA00]/15 text-[#95EA00] border-[#95EA00]/30'
                        }`}
                      >
                        {u.role === 'Approving Manager' ? (
                          <Shield className="w-3 h-3 text-[#A559BD]" />
                        ) : (
                          <ShieldCheck className="w-3 h-3 text-[#95EA00]" />
                        )}
                        <span>{u.role || 'Administrator'}</span>
                      </span>
                      {!isCurrent && (
                        <select
                          value={u.role || 'Administrator'}
                          onChange={(e) => handleUpdateRole(u, e.target.value)}
                          className="bg-[#1e1e1e] border border-[#444444] rounded px-1.5 py-0.5 text-[10px] text-gray-300 hover:text-white focus:outline-none focus:border-[#95EA00]"
                          title="Change account role"
                        >
                          <option value="Approving Manager">Approving Manager</option>
                          <option value="Administrator">Administrator</option>
                        </select>
                      )}
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${
                        u.isAuthorized
                          ? 'bg-emerald-950/70 text-[#95EA00] border-emerald-800'
                          : 'bg-rose-950/70 text-rose-300 border-rose-800'
                      }`}
                    >
                      {u.isAuthorized ? (
                        <>
                          <ShieldCheck className="w-3 h-3 text-[#95EA00]" />
                          <span>Authorized</span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="w-3 h-3 text-rose-400" />
                          <span>Deactivated</span>
                        </>
                      )}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    {u.hasPassword ? (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/50 text-emerald-300 border border-emerald-800/60">
                        <Lock className="w-3 h-3 text-[#95EA00]" />
                        <span>Active (Scrypt)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950/60 text-amber-300 border border-amber-800/60">
                        <AlertCircle className="w-3 h-3 text-amber-400" />
                        <span>Setup Required</span>
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-gray-400 text-[11px]">
                    {u.lastLoginAt ? formatPhoenixDateTime(u.lastLoginAt) : 'Never logged in'}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center space-x-1.5">
                      <button
                        onClick={() => handleGenerateResetLink(u)}
                        className="inline-flex items-center space-x-1 px-2 py-1 text-[11px] font-semibold text-gray-200 bg-[#333333] hover:bg-[#444444] border border-[#555555] rounded transition-colors"
                        title="Generate expiring single-use setup or reset link"
                      >
                        <Link2 className="w-3 h-3 text-[#95EA00]" />
                        <span>Link</span>
                      </button>

                      <button
                        onClick={() => {
                          setPasswordModalUser(u);
                          setPasswordValue('');
                          setConfirmPasswordValue('');
                          setActionError(null);
                        }}
                        className="inline-flex items-center space-x-1 px-2 py-1 text-[11px] font-semibold text-purple-200 bg-[#A559BD]/20 hover:bg-[#A559BD]/30 border border-[#A559BD]/50 rounded transition-colors"
                        title="Set password directly"
                      >
                        <KeyRound className="w-3 h-3 text-[#A559BD]" />
                        <span>Password</span>
                      </button>

                      {!isCurrent && (
                        <>
                          <button
                            onClick={() => handleToggleStatus(u)}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-[#383838] rounded transition-colors"
                            title={u.isAuthorized ? 'Deactivate access' : 'Activate access'}
                          >
                            {u.isAuthorized ? (
                              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                            ) : (
                              <ShieldCheck className="w-3.5 h-3.5 text-[#95EA00]" />
                            )}
                          </button>

                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors"
                            title="Delete administrator account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Generated Link Modal */}
      {generatedLinkModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-2xl max-w-lg w-full p-6 text-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-2 text-white pb-3 border-b border-[#383838]">
              <Link2 className="w-5 h-5 text-[#95EA00]" />
              <h3 className="font-bold text-base">{generatedLinkModal.title}</h3>
            </div>

            <p className="text-xs text-gray-300 mt-3 mb-2 leading-relaxed">
              {generatedLinkModal.description}
            </p>

            <div className="p-3 bg-[#1e1e1e] border border-[#444444] rounded-lg space-y-2">
              <input
                type="text"
                readOnly
                value={generatedLinkModal.url}
                className="w-full bg-transparent text-xs font-mono text-[#95EA00] focus:outline-none select-all"
              />
              <div className="flex items-center justify-between pt-2 border-t border-[#333333]">
                <span className="text-[10px] text-gray-400">
                  Expires: {formatPhoenixDateTime(generatedLinkModal.expiresAt)}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(generatedLinkModal.url)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1 bg-[#A559BD] hover:bg-[#934da9] text-white text-xs font-bold rounded transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
                </button>
              </div>
            </div>

            <p className="text-[11px] text-gray-400 mt-3">
              This link is single-use and will be invalidated immediately once consumed or expired.
            </p>

            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={() => setGeneratedLinkModal(null)}
                className="px-4 py-1.5 text-xs font-medium text-gray-300 hover:text-white bg-[#383838] hover:bg-[#484848] rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Invite User Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-2xl max-w-md w-full p-6 text-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#383838]">
              <div className="flex items-center space-x-2 text-white">
                <UserPlus className="w-5 h-5 text-[#95EA00]" />
                <h3 className="font-bold text-base">Add Administrator Account</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded"
              >
                ✕
              </button>
            </div>

            <div className="flex space-x-2 my-3">
              <button
                type="button"
                onClick={() => setAddMode('invite')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                  addMode === 'invite'
                    ? 'bg-[#A559BD]/20 border-[#A559BD] text-white'
                    : 'bg-[#1e1e1e] border-[#444444] text-gray-400'
                }`}
              >
                Single-Use Invite Link
              </button>
              <button
                type="button"
                onClick={() => setAddMode('direct')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                  addMode === 'direct'
                    ? 'bg-[#95EA00]/15 border-[#95EA00] text-white'
                    : 'bg-[#1e1e1e] border-[#444444] text-gray-400'
                }`}
              >
                Set Password Directly
              </button>
            </div>

            <form onSubmit={handleCreateOrInviteUser} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Full Name / Designation
                </label>
                <input
                  type="text"
                  placeholder="e.g. Caleb Vance"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Administrator Email <span className="text-rose-400">*</span>
                </label>
                <input
                  type="email"
                  placeholder="name@discountforkliftphoenix.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1.5">
                  Account Role <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewRole('Approving Manager')}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      newRole === 'Approving Manager'
                        ? 'bg-[#A559BD]/20 border-[#A559BD] text-white shadow-xs'
                        : 'bg-[#1e1e1e] border-[#444444] text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 font-bold text-xs text-purple-200 mb-0.5">
                      <Shield className="w-3.5 h-3.5 text-[#A559BD]" />
                      <span>Approving Manager</span>
                    </div>
                    <p className="text-[10px] text-gray-400 leading-tight">
                      Ledger, review & decision rights
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewRole('Administrator')}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      newRole === 'Administrator'
                        ? 'bg-[#95EA00]/15 border-[#95EA00] text-white shadow-xs'
                        : 'bg-[#1e1e1e] border-[#444444] text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 font-bold text-xs text-[#95EA00] mb-0.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#95EA00]" />
                      <span>Administrator</span>
                    </div>
                    <p className="text-[10px] text-gray-400 leading-tight">
                      Full system & user management
                    </p>
                  </button>
                </div>
              </div>

              {addMode === 'direct' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-200 mb-1">
                      Login Password (min. 8 characters, letters & numbers) <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        placeholder="Enter secure password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 pr-9 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-1"
                      >
                        {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-200 mb-1">
                      Confirm Password <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      placeholder="Repeat password"
                      value={newConfirmPassword}
                      onChange={(e) => setNewConfirmPassword(e.target.value)}
                      className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                      required
                    />
                  </div>
                </>
              )}

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-[#444444]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white hover:bg-[#383838] rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#A559BD] hover:bg-[#934da9] rounded shadow-sm transition-colors disabled:opacity-50"
                >
                  {isCreating
                    ? 'Processing...'
                    : addMode === 'invite'
                    ? 'Generate Single-Use Invite Link'
                    : 'Create Administrator'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Direct Change Password Modal */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-2xl max-w-md w-full p-6 text-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-2 mb-1">
              <KeyRound className="w-5 h-5 text-[#95EA00]" />
              <h3 className="text-base font-bold text-white">Update Administrator Password</h3>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Directly set a new password for <span className="font-semibold text-white">{passwordModalUser.email}</span>. Existing active sessions will be revoked.
            </p>

            <form onSubmit={handleUpdatePassword} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  New Password (min 8 chars, letters & numbers) <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPasswordValue ? 'text' : 'password'}
                    placeholder="Enter new secure password"
                    value={passwordValue}
                    onChange={(e) => setPasswordValue(e.target.value)}
                    className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 pr-9 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordValue(!showPasswordValue)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-1"
                  >
                    {showPasswordValue ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Confirm New Password <span className="text-rose-400">*</span>
                </label>
                <input
                  type={showPasswordValue ? 'text' : 'password'}
                  placeholder="Repeat new password"
                  value={confirmPasswordValue}
                  onChange={(e) => setConfirmPasswordValue(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                  required
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-[#444444]">
                <button
                  type="button"
                  onClick={() => setPasswordModalUser(null)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white hover:bg-[#383838] rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingPassword}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#A559BD] hover:bg-[#934da9] rounded shadow-sm transition-colors disabled:opacity-50"
                >
                  {isUpdatingPassword ? 'Saving Password...' : 'Save New Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
