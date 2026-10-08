import React, { useState } from 'react';
import { Plus, Edit2, Users, CheckCircle2, XCircle, Sparkles, Mail, AlertTriangle, Building, ShieldCheck } from 'lucide-react';
import { SalesRep, NotificationContact, Branch } from '../lib/repository';
import { adminFetch } from '../lib/api';

interface AdminRepManagerProps {
  reps: SalesRep[];
  contacts: NotificationContact[];
  branches?: Branch[];
  adminUser: string;
  onRefresh: () => void;
  onLoadPresets?: () => void;
  onNavigateToBranches?: () => void;
}

export const AdminRepManager: React.FC<AdminRepManagerProps> = ({
  reps,
  contacts,
  branches = [],
  adminUser,
  onRefresh,
  onLoadPresets,
  onNavigateToBranches,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRep, setEditingRep] = useState<SalesRep | null>(null);

  // Form Fields
  const [repName, setRepName] = useState('');
  const [repEmail, setRepEmail] = useState('');
  const [branch, setBranch] = useState('');
  const [selectedGmIds, setSelectedGmIds] = useState<string[]>([]);
  const [displayOrder, setDisplayOrder] = useState('1');

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // General Managers available in contacts
  const generalManagers = contacts.filter((c) => c.role === 'General Manager' && c.isActive);

  // Reps missing email
  const repsMissingEmail = reps.filter((r) => !r.email || !r.email.trim());

  const openAddModal = () => {
    setEditingRep(null);
    setRepName('');
    setRepEmail('');
    setBranch('Phoenix - Main Yard');
    setSelectedGmIds(generalManagers.length > 0 ? [generalManagers[0].id] : []);
    setDisplayOrder(String(reps.length + 1));
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (r: SalesRep) => {
    setEditingRep(r);
    setRepName(r.name);
    setRepEmail(r.email || '');
    setBranch(r.branch || '');
    const gms = r.assignedGmIds ? r.assignedGmIds.split(',').map((id) => id.trim()).filter(Boolean) : [];
    setSelectedGmIds(gms);
    setDisplayOrder(String(r.displayOrder));
    setError(null);
    setIsModalOpen(true);
  };

  const toggleGmId = (id: string) => {
    if (selectedGmIds.includes(id)) {
      setSelectedGmIds(selectedGmIds.filter((x) => x !== id));
    } else {
      setSelectedGmIds([...selectedGmIds, id]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!repName.trim()) {
      setError('Sales rep name is required.');
      return;
    }
    if (!repEmail.trim() || !repEmail.includes('@')) {
      setError('A valid rep email address is required so the rep can submit spiffs and receive result notifications.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: repName.trim(),
        email: repEmail.trim().toLowerCase(),
        branch: branch.trim() || null,
        assignedGmIds: selectedGmIds.join(','),
        displayOrder: parseInt(displayOrder) || 0,
      };

      if (editingRep) {
        const res = await adminFetch(`/api/admin/reps/${editingRep.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to update rep.');
      } else {
        const res = await adminFetch('/api/admin/reps', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to add rep.');
      }

      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Error saving rep.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (r: SalesRep) => {
    try {
      await adminFetch(`/api/admin/reps/${r.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: !r.isActive }),
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to toggle rep status:', err);
    }
  };

  // Helper to format assigned GMs
  const formatAssignedGms = (assignedGmIds?: string | null) => {
    if (!assignedGmIds) return <span className="text-gray-500">None assigned</span>;
    const ids = assignedGmIds.split(',').map((id) => id.trim());
    const names = ids
      .map((id) => contacts.find((c) => c.id === id)?.name)
      .filter(Boolean);
    if (names.length === 0) return <span className="text-gray-500">None assigned</span>;
    return names.join(', ');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">Sales Representatives Roster</h2>
          <p className="text-xs text-gray-300 mt-0.5">
            Configure sales reps, notification emails, branch assignments, and assigned General Managers. Reps require a valid email before submitting spiffs.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {reps.length === 0 && onLoadPresets && (
            <button
              onClick={onLoadPresets}
              className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-purple-200 bg-[#A559BD]/20 hover:bg-[#A559BD]/30 border border-[#A559BD]/50 rounded-lg transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#95EA00]" />
              <span>Load Sales Team Roster</span>
            </button>
          )}
          <button
            onClick={openAddModal}
            className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-white bg-[#A559BD] hover:bg-[#934da9] rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Sales Rep</span>
          </button>
        </div>
      </div>

      {/* Setup guidance banner if any rep is missing an email address */}
      {repsMissingEmail.length > 0 && (
        <div className="p-4 bg-amber-950/40 border border-amber-800 rounded-xl flex items-start space-x-3 text-xs text-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold text-amber-300 block text-sm">
              Setup Guidance: {repsMissingEmail.length} Rep{repsMissingEmail.length === 1 ? '' : 's'} Missing Email Address
            </span>
            <p className="text-amber-200 mt-1 leading-relaxed">
              Sales reps must have a valid notification email configured in order to submit new spiff requests and receive automatic approval/denial results.
              Click <strong>Edit</strong> on: {repsMissingEmail.map((r) => r.name).join(', ')}.
            </p>
          </div>
        </div>
      )}

      {reps.length === 0 ? (
        <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl p-8 text-center">
          <Users className="w-10 h-10 text-gray-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No Sales Reps Configured</h3>
          <p className="text-xs text-gray-300 max-w-md mx-auto mt-1 mb-6 leading-relaxed">
            Add your sales office team members to populate the rep dropdown on the submission form and configure automated result routing.
          </p>
          <div className="flex justify-center space-x-3">
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-[#A559BD] hover:bg-[#934da9] text-white text-xs font-bold rounded-lg shadow-sm"
            >
              Add First Sales Rep
            </button>
            {onLoadPresets && (
              <button
                onClick={onLoadPresets}
                className="px-4 py-2 border border-[#444444] bg-[#1e1e1e] text-gray-200 text-xs font-medium rounded-lg hover:bg-[#383838]"
              >
                Load Starter Roster
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#1e1e1e] border-b border-[#444444] text-gray-300 uppercase font-semibold text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Order</th>
                <th className="py-3 px-4">Sales Rep Name</th>
                <th className="py-3 px-4">Email Address</th>
                <th className="py-3 px-4">Branch / Yard</th>
                <th className="py-3 px-4">Assigned General Manager(s)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#383838] text-gray-200">
              {reps.map((r) => {
                const hasEmail = Boolean(r.email && r.email.trim());

                return (
                  <tr key={r.id} className="hover:bg-[#353535] transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-gray-400">{r.displayOrder}</td>
                    <td className="py-3 px-4 font-semibold text-white">{r.name}</td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      {hasEmail ? (
                        <span className="text-[#95EA00]">{r.email}</span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-rose-300 font-semibold bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Missing Email</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-300">{r.branch || '—'}</td>
                    <td className="py-3 px-4 text-gray-200 font-medium">{formatAssignedGms(r.assignedGmIds)}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleToggleActive(r)}
                        className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                          r.isActive
                            ? 'bg-[#95EA00]/15 text-[#95EA00] border-[#95EA00]/30 hover:bg-[#95EA00]/25'
                            : 'bg-[#1e1e1e] text-gray-400 border-[#444444] hover:bg-[#383838]'
                        }`}
                      >
                        {r.isActive ? (
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
                        onClick={() => openEditModal(r)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 border border-[#444444] bg-[#1e1e1e] hover:bg-[#383838] rounded text-gray-200 font-medium text-xs transition-colors"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Rep Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in text-gray-100">
            <h3 className="text-base font-bold text-white mb-1">
              {editingRep ? 'Edit Sales Rep & Assignments' : 'Add New Sales Rep'}
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Enter sales rep details, email address, and assigned General Managers.
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
                  placeholder="e.g. Travis Miller"
                  value={repName}
                  onChange={(e) => setRepName(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Rep Email Address <span className="text-rose-400">* (Required for submissions)</span>
                </label>
                <input
                  type="email"
                  placeholder="travis.miller@discountforkliftphoenix.com"
                  value={repEmail}
                  onChange={(e) => setRepEmail(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-[#95EA00] font-mono focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                  required
                />
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Determined automatically upon submission; public form users cannot modify it.
                </p>
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

              {/* Assigned General Managers */}
              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Assigned General Manager(s)
                </label>
                {generalManagers.length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic p-2 bg-[#1e1e1e] rounded border border-[#444444]">
                    No active General Managers configured in Contacts. Add them under the "Notification Contacts" tab first.
                  </p>
                ) : (
                  <div className="border border-[#444444] rounded p-2.5 max-h-32 overflow-y-auto space-y-1.5 bg-[#1e1e1e]">
                    {generalManagers.map((gm) => (
                      <label key={gm.id} className="flex items-center space-x-2 text-xs text-gray-200 cursor-pointer hover:text-white">
                        <input
                          type="checkbox"
                          checked={selectedGmIds.includes(gm.id)}
                          onChange={() => toggleGmId(gm.id)}
                          className="rounded border-[#555555] bg-[#2a2a2a] text-[#A559BD] focus:ring-[#95EA00]"
                        />
                        <span className="font-medium text-white">{gm.name}</span>
                        <span className="text-[11px] text-gray-400">({gm.email})</span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Preselected automatically on spiff decision notifications for this rep.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Display Order
                </label>
                <input
                  type="number"
                  value={displayOrder}
                  onChange={(e) => setDisplayOrder(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                />
              </div>

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
                  {isSaving ? 'Saving...' : 'Save Sales Rep'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
