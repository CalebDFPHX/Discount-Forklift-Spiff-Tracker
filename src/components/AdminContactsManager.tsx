import React, { useState } from 'react';
import { Plus, Edit2, Users, CheckCircle2, XCircle, Mail, Building, Sparkles, Star } from 'lucide-react';
import { NotificationContact, Branch } from '../lib/repository';
import { adminFetch } from '../lib/api';

interface AdminContactsManagerProps {
  contacts: NotificationContact[];
  branches?: Branch[];
  adminUser: string;
  onRefresh: () => void;
  onLoadPresets?: () => void;
  onNavigateToBranches?: () => void;
}

export const AdminContactsManager: React.FC<AdminContactsManagerProps> = ({
  contacts,
  branches = [],
  adminUser,
  onRefresh,
  onLoadPresets,
  onNavigateToBranches,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<NotificationContact | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'Accounting' | 'General Manager' | 'Approving Manager' | 'Other'>('Approving Manager');
  const [branch, setBranch] = useState('');
  const [isDefaultAccounting, setIsDefaultAccounting] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openAddModal = () => {
    setEditingContact(null);
    setName('');
    setEmail('');
    setRole('Approving Manager');
    setBranch('Phoenix - Main Yard');
    setIsDefaultAccounting(false);
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (contact: NotificationContact) => {
    setEditingContact(contact);
    setName(contact.name);
    setEmail(contact.email);
    setRole(contact.role);
    setBranch(contact.branch || '');
    setIsDefaultAccounting(contact.isDefaultAccounting);
    setError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Contact name is required.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('A valid email address is required.');
      return;
    }

    setIsSaving(true);
    try {
      if (editingContact) {
        const res = await adminFetch(`/api/admin/contacts/${editingContact.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            role,
            branch: branch.trim() || null,
            isDefaultAccounting: role === 'Accounting' ? isDefaultAccounting : false,
          }),
        });
        if (!res.ok) throw new Error('Failed to update contact.');
      } else {
        const res = await adminFetch('/api/admin/contacts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            role,
            branch: branch.trim() || null,
            isDefaultAccounting: role === 'Accounting' ? isDefaultAccounting : false,
          }),
        });
        if (!res.ok) throw new Error('Failed to create contact.');
      }

      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Error saving contact.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (contact: NotificationContact) => {
    try {
      await adminFetch(`/api/admin/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: !contact.isActive }),
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to toggle contact status:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">Notification Contacts Management</h2>
          <p className="text-xs text-gray-300 mt-0.5">
            Configure General Managers, Accounting recipients, and branch managers who receive automated spiff approval and denial emails.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {contacts.length === 0 && onLoadPresets && (
            <button
              onClick={onLoadPresets}
              className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-purple-200 bg-[#A559BD]/20 hover:bg-[#A559BD]/30 border border-[#A559BD]/50 rounded-lg transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#95EA00]" />
              <span>Load Office Contacts</span>
            </button>
          )}
          <button
            onClick={openAddModal}
            className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-white bg-[#A559BD] hover:bg-[#934da9] rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Contact</span>
          </button>
        </div>
      </div>

      {contacts.length === 0 ? (
        <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl p-8 text-center">
          <Mail className="w-10 h-10 text-gray-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No Notification Contacts Configured</h3>
          <p className="text-xs text-gray-300 max-w-md mx-auto mt-1 mb-6 leading-relaxed">
            Add your office General Managers and Accounting team members so they can be assigned to reps and preselected on spiff decisions.
          </p>
          <div className="flex justify-center space-x-3">
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-[#A559BD] hover:bg-[#934da9] text-white text-xs font-bold rounded-lg shadow-sm"
            >
              Add First Contact
            </button>
            {onLoadPresets && (
              <button
                onClick={onLoadPresets}
                className="px-4 py-2 border border-[#444444] bg-[#1e1e1e] text-gray-200 text-xs font-medium rounded-lg hover:bg-[#383838]"
              >
                Load Starter Contacts
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#1e1e1e] border-b border-[#444444] text-gray-300 uppercase font-semibold text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Office / Branch</th>
                <th className="py-3 px-4">Default Accounting</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#383838] text-gray-200">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-[#353535] transition-colors">
                  <td className="py-3 px-4 font-semibold text-white">{c.name}</td>
                  <td className="py-3 px-4 text-gray-300 font-mono text-[11px]">{c.email}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                        c.role === 'Approving Manager'
                          ? 'bg-purple-950/80 text-purple-300 border border-purple-800'
                          : c.role === 'General Manager'
                          ? 'bg-blue-950/80 text-blue-300 border border-blue-800'
                          : c.role === 'Accounting'
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                          : 'bg-[#1e1e1e] text-gray-300 border border-[#444444]'
                      }`}
                    >
                      {c.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-300">{c.branch || '—'}</td>
                  <td className="py-3 px-4">
                    {c.isDefaultAccounting ? (
                      <span className="inline-flex items-center space-x-1 text-[#95EA00] text-[11px] font-semibold">
                        <Star className="w-3.5 h-3.5 text-[#95EA00] fill-[#95EA00]" />
                        <span>Preselected</span>
                      </span>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => handleToggleActive(c)}
                      className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                        c.isActive
                          ? 'bg-[#95EA00]/15 text-[#95EA00] border-[#95EA00]/30 hover:bg-[#95EA00]/25'
                          : 'bg-[#1e1e1e] text-gray-400 border-[#444444] hover:bg-[#383838]'
                      }`}
                    >
                      {c.isActive ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-[#95EA00]" />
                          <span>Active</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3 text-gray-500" />
                          <span>Inactive</span>
                        </>
                      )}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => openEditModal(c)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 border border-[#444444] bg-[#1e1e1e] hover:bg-[#383838] rounded text-gray-200 font-medium text-xs transition-colors"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Contact Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in text-gray-100">
            <h3 className="text-base font-bold text-white mb-1">
              {editingContact ? 'Edit Notification Contact' : 'Add Notification Contact'}
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Enter contact information for automated spiff decision email notifications.
            </p>

            {error && (
              <div className="mb-4 p-2.5 bg-rose-950/50 border border-rose-800 rounded text-xs text-rose-200">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Full Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Johnathan Davis"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Email Address <span className="text-rose-400">*</span>
                </label>
                <input
                  type="email"
                  placeholder="jdavis@discountforkliftphoenix.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Role <span className="text-rose-400">*</span>
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                >
                  <option value="Approving Manager">Approving Manager (Spiff Decisions & Review)</option>
                  <option value="General Manager">General Manager (Branch Office Oversight)</option>
                  <option value="Accounting">Accounting (Payroll / Cash Disbursement)</option>
                  <option value="Other">Other Office Contact</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-200">
                    Office or Branch Location
                  </label>
                  {onNavigateToBranches && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsModalOpen(false);
                        onNavigateToBranches();
                      }}
                      className="text-[11px] text-[#95EA00] hover:underline"
                    >
                      Manage Branches →
                    </button>
                  )}
                </div>
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                >
                  <option value="">— Select Branch / Unassigned —</option>
                  {branch && !branches.some((b) => b.name === branch) && (
                    <option value={branch}>{branch} (Current)</option>
                  )}
                  {branches.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name} {b.code ? `(${b.code})` : ''} {!b.isActive ? '(Inactive)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Select from available branch yards and offices.
                </p>
              </div>

              {role === 'Accounting' && (
                <div className="pt-1">
                  <label className="flex items-center space-x-2 text-xs text-gray-200 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={isDefaultAccounting}
                      onChange={(e) => setIsDefaultAccounting(e.target.checked)}
                      className="rounded border-[#555555] bg-[#1e1e1e] text-[#A559BD] focus:ring-[#95EA00]"
                    />
                    <span className="font-semibold text-white">Default Accounting Recipient</span>
                  </label>
                  <p className="text-[11px] text-gray-400 mt-0.5 pl-5">
                    Preselected automatically on all spiff approval and denial decision dialogs.
                  </p>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-3 border-t border-[#383838]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                  className="px-3 py-1.5 border border-[#444444] bg-[#1e1e1e] text-xs font-medium rounded hover:bg-[#383838] text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 bg-[#A559BD] hover:bg-[#934da9] text-white text-xs font-bold rounded shadow-sm"
                >
                  {isSaving ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
