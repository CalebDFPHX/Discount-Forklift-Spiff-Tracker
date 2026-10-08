import React, { useState } from 'react';
import { Plus, Edit2, Trash2, MapPin, CheckCircle2, XCircle, Sparkles, Building2, Users } from 'lucide-react';
import { Branch, SalesRep, NotificationContact } from '../lib/repository';
import { adminFetch } from '../lib/api';

interface AdminBranchManagerProps {
  branches: Branch[];
  reps: SalesRep[];
  contacts: NotificationContact[];
  adminUser: string;
  onRefresh: () => void;
}

export const AdminBranchManager: React.FC<AdminBranchManagerProps> = ({
  branches,
  reps,
  contacts,
  adminUser,
  onRefresh,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [displayOrder, setDisplayOrder] = useState<number>(1);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const openAddModal = () => {
    setEditingBranch(null);
    setName('');
    setCode('');
    setAddress('');
    setDisplayOrder(branches.length + 1);
    setIsActive(true);
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (b: Branch) => {
    setEditingBranch(b);
    setName(b.name);
    setCode(b.code || '');
    setAddress(b.address || '');
    setDisplayOrder(b.displayOrder);
    setIsActive(b.isActive);
    setError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Branch name is required.');
      return;
    }

    setIsSaving(true);
    try {
      const url = editingBranch
        ? `/api/admin/branches/${editingBranch.id}`
        : '/api/admin/branches';
      const method = editingBranch ? 'PATCH' : 'POST';

      const res = await adminFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim().toUpperCase() || null,
          address: address.trim() || null,
          displayOrder,
          isActive,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save branch.');
      }

      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Error saving branch location.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (b: Branch) => {
    try {
      await adminFetch(`/api/admin/branches/${b.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: !b.isActive }),
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to toggle branch status:', err);
    }
  };

  const handleDelete = async (b: Branch) => {
    const assignedRepsCount = reps.filter((r) => r.branch === b.name).length;
    const assignedContactsCount = contacts.filter((c) => c.branch === b.name).length;
    const countTotal = assignedRepsCount + assignedContactsCount;

    const message = countTotal > 0
      ? `"${b.name}" currently has ${countTotal} associated rep(s)/contact(s). Are you sure you want to remove this branch from the available options?`
      : `Are you sure you want to delete the "${b.name}" branch?`;

    if (!window.confirm(message)) return;

    try {
      const res = await adminFetch(`/api/admin/branches/${b.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to delete branch:', err);
    }
  };

  const handleLoadDefaults = async () => {
    const defaultBranches = [
      { name: 'Phoenix - Main Yard', code: 'PHX', address: '2625 W Baseline Rd, Phoenix, AZ 85041' },
      { name: 'Tucson Branch', code: 'TUC', address: '3855 E 37th St, Tucson, AZ 85713' },
      { name: 'Denver Branch', code: 'DEN', address: '4990 Monaco St, Commerce City, CO 80022' },
      { name: 'Las Vegas Branch', code: 'LAS', address: 'North Las Vegas, NV' },
      { name: 'Dallas Branch', code: 'DFW', address: 'Dallas-Fort Worth, TX' },
    ];

    for (let i = 0; i < defaultBranches.length; i++) {
      const item = defaultBranches[i];
      try {
        await adminFetch('/api/admin/branches', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...item,
            displayOrder: i + 1,
            isActive: true,
          }),
        });
      } catch (err) {
        console.error('Error adding default branch:', err);
      }
    }
    onRefresh();
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">Office & Branch Locations</h2>
          <p className="text-xs text-gray-300 mt-0.5">
            Configure dealership offices and branch yards selectable in sales rep and contact profiles.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {branches.length === 0 && (
            <button
              onClick={handleLoadDefaults}
              className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-purple-200 bg-[#A559BD]/20 hover:bg-[#A559BD]/30 border border-[#A559BD]/50 rounded-lg transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#95EA00]" />
              <span>Load Default Branches</span>
            </button>
          )}
          <button
            onClick={openAddModal}
            className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-white bg-[#A559BD] hover:bg-[#934da9] rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Branch</span>
          </button>
        </div>
      </div>

      {/* Branches List Table */}
      {branches.length === 0 ? (
        <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl p-8 text-center">
          <Building2 className="w-10 h-10 text-gray-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No Branches Configured</h3>
          <p className="text-xs text-gray-300 max-w-md mx-auto mt-1 mb-6 leading-relaxed">
            Add your primary sales offices or yard locations to allow sales representatives and managers to be categorized by branch.
          </p>
          <button
            onClick={openAddModal}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-[#A559BD] hover:bg-[#934da9] text-white text-xs font-bold rounded-lg shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Branch</span>
          </button>
        </div>
      ) : (
        <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-200">
              <thead className="bg-[#242424] text-gray-400 font-semibold border-b border-[#444444]">
                <tr>
                  <th className="py-3 px-4">Branch / Yard</th>
                  <th className="py-3 px-4">Short Code</th>
                  <th className="py-3 px-4">Physical Address / Notes</th>
                  <th className="py-3 px-4">Assigned Personnel</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#383838]">
                {branches.map((b) => {
                  const assignedReps = reps.filter((r) => r.branch === b.name);
                  const assignedContacts = contacts.filter((c) => c.branch === b.name);

                  return (
                    <tr key={b.id} className="hover:bg-[#333333] transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <Building2 className="w-4 h-4 text-[#95EA00] flex-shrink-0" />
                          <span className="font-bold text-white text-sm">{b.name}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {b.code ? (
                          <span className="inline-block px-2 py-0.5 rounded bg-[#1e1e1e] border border-[#444444] font-mono text-[11px] font-bold text-[#95EA00]">
                            {b.code}
                          </span>
                        ) : (
                          <span className="text-gray-500 italic">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-gray-300 max-w-xs truncate">
                        {b.address ? (
                          <div className="flex items-center space-x-1">
                            <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="truncate">{b.address}</span>
                          </div>
                        ) : (
                          <span className="text-gray-500 italic">No address specified</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <span className="inline-flex items-center space-x-1 text-xs text-gray-200">
                            <Users className="w-3.5 h-3.5 text-gray-400" />
                            <span>
                              {assignedReps.length} rep{assignedReps.length === 1 ? '' : 's'}
                            </span>
                          </span>
                          {assignedContacts.length > 0 && (
                            <span className="text-[11px] text-gray-400">
                              · {assignedContacts.length} contact{assignedContacts.length === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleToggleActive(b)}
                          className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                            b.isActive
                              ? 'bg-emerald-950/70 text-[#95EA00] border border-emerald-800 hover:bg-emerald-900/80'
                              : 'bg-rose-950/70 text-rose-300 border border-rose-800 hover:bg-rose-900/80'
                          }`}
                        >
                          {b.isActive ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-[#95EA00]" />
                              <span>Active</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3 text-rose-400" />
                              <span>Inactive</span>
                            </>
                          )}
                        </button>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center space-x-1">
                          <button
                            onClick={() => openEditModal(b)}
                            className="p-1.5 text-gray-300 hover:text-white hover:bg-[#3d3d3d] rounded transition-colors"
                            title="Edit branch details"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(b)}
                            className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors"
                            title="Delete branch"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Branch Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-2xl max-w-md w-full p-6 text-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-white mb-1">
              {editingBranch ? 'Edit Branch Location' : 'Add New Branch Location'}
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Available branch options show up automatically in sales rep and contact dropdowns.
            </p>

            {error && (
              <div className="mb-4 p-2.5 bg-rose-950/50 border border-rose-800 rounded text-xs text-rose-200">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Branch Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Phoenix - Main Yard, Tucson Branch"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Short Code (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. PHX, TUC, DEN"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  maxLength={10}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-[#95EA00] font-mono focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                />
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Convenient abbreviation used for quick branch references.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Physical Address / Notes
                </label>
                <textarea
                  placeholder="e.g. 2625 W Baseline Rd, Phoenix, AZ 85041"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                />
              </div>

              <div className="flex items-center space-x-4 pt-1">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-200 mb-1">
                    Display Order
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={displayOrder}
                    onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 1)}
                    className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                  />
                </div>

                <div className="pt-5">
                  <label className="flex items-center space-x-2 text-xs text-gray-200 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="rounded border-[#555555] bg-[#1e1e1e] text-[#A559BD] focus:ring-[#95EA00]"
                    />
                    <span className="font-semibold text-white">Active in Dropdowns</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-[#444444]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white hover:bg-[#383838] rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#A559BD] hover:bg-[#934da9] rounded shadow-sm transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : editingBranch ? 'Save Changes' : 'Create Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
