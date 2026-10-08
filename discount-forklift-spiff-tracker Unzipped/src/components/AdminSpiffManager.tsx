import React, { useState } from 'react';
import { Plus, Edit2, CheckCircle2, XCircle, ArrowUp, ArrowDown, DollarSign, Loader2, Sparkles } from 'lucide-react';
import { Spiff } from '../lib/repository';
import { formatDollars, parseDollarsToCents } from '../lib/formatters';
import { adminFetch } from '../lib/api';

interface AdminSpiffManagerProps {
  spiffs: Spiff[];
  adminUser: string;
  onRefresh: () => void;
  onLoadPresets?: () => void;
}

export const AdminSpiffManager: React.FC<AdminSpiffManagerProps> = ({
  spiffs,
  adminUser,
  onRefresh,
  onLoadPresets,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSpiff, setEditingSpiff] = useState<Spiff | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [eligibilityRequirements, setEligibilityRequirements] = useState('');
  const [amountDollars, setAmountDollars] = useState('');
  const [displayOrder, setDisplayOrder] = useState('1');

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openAddModal = () => {
    setEditingSpiff(null);
    setName('');
    setDescription('');
    setEligibilityRequirements('');
    setAmountDollars('150.00');
    setDisplayOrder(String(spiffs.length + 1));
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (s: Spiff) => {
    setEditingSpiff(s);
    setName(s.name);
    setDescription(s.description);
    setEligibilityRequirements(s.eligibilityRequirements);
    setAmountDollars((s.amountCents / 100).toFixed(2));
    setDisplayOrder(String(s.displayOrder));
    setError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cents = parseDollarsToCents(amountDollars);
    if (cents <= 0) {
      setError('Please enter a valid dollar amount greater than $0.');
      return;
    }

    setIsSaving(true);
    try {
      if (editingSpiff) {
        const res = await adminFetch(`/api/admin/spiffs/${editingSpiff.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            eligibilityRequirements: eligibilityRequirements.trim(),
            amountCents: cents,
            displayOrder: parseInt(displayOrder) || 0,
          }),
        });
        if (!res.ok) throw new Error('Failed to update spiff.');
      } else {
        const res = await adminFetch('/api/admin/spiffs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            eligibilityRequirements: eligibilityRequirements.trim(),
            amountCents: cents,
            displayOrder: parseInt(displayOrder) || 0,
          }),
        });
        if (!res.ok) throw new Error('Failed to create spiff.');
      }

      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Error saving spiff program.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (s: Spiff) => {
    try {
      await adminFetch(`/api/admin/spiffs/${s.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: !s.isActive }),
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to toggle spiff status:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">Spiff Programs Management</h2>
          <p className="text-xs text-gray-300 mt-0.5">
            Configure active spiff programs and payouts. Changes to dollar amounts apply only to future submissions; past requests preserve their snapshot.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {spiffs.length === 0 && onLoadPresets && (
            <button
              onClick={onLoadPresets}
              className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-purple-200 bg-[#A559BD]/20 hover:bg-[#A559BD]/30 border border-[#A559BD]/50 rounded-lg transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#95EA00]" />
              <span>Load Common Forklift Programs</span>
            </button>
          )}
          <button
            onClick={openAddModal}
            className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-white bg-[#A559BD] hover:bg-[#934da9] rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Spiff Program</span>
          </button>
        </div>
      </div>

      {spiffs.length === 0 ? (
        <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl p-8 text-center">
          <DollarSign className="w-10 h-10 text-gray-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No Spiff Programs Created Yet</h3>
          <p className="text-xs text-gray-300 max-w-md mx-auto mt-1 mb-6 leading-relaxed">
            Create spiff programs for your sales office (e.g. Electric Cushion closed deal bonus, Lithium Battery upgrade spiff, or Aged Inventory move bonus).
          </p>
          <div className="flex justify-center space-x-3">
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-[#A559BD] hover:bg-[#934da9] text-white text-xs font-bold rounded-lg shadow-sm"
            >
              Add First Spiff Program
            </button>
            {onLoadPresets && (
              <button
                onClick={onLoadPresets}
                className="px-4 py-2 border border-[#444444] bg-[#1e1e1e] text-gray-200 text-xs font-medium rounded-lg hover:bg-[#383838]"
              >
                Load Starter Template
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
                <th className="py-3 px-4">Program Name</th>
                <th className="py-3 px-4">Cash Amount</th>
                <th className="py-3 px-4">Description & Requirements</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#383838] text-gray-200">
              {spiffs.map((s) => (
                <tr key={s.id} className="hover:bg-[#353535] transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-gray-400">{s.displayOrder}</td>
                  <td className="py-3 px-4 font-semibold text-white">{s.name}</td>
                  <td className="py-3 px-4 font-extrabold text-[#95EA00] text-sm">
                    {formatDollars(s.amountCents)}
                  </td>
                  <td className="py-3 px-4 max-w-sm">
                    <p className="text-gray-200">{s.description}</p>
                    <p className="text-[11px] text-gray-400 italic mt-0.5">
                      Req: {s.eligibilityRequirements}
                    </p>
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => handleToggleActive(s)}
                      className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                        s.isActive
                          ? 'bg-[#95EA00]/15 text-[#95EA00] border-[#95EA00]/30 hover:bg-[#95EA00]/25'
                          : 'bg-[#1e1e1e] text-gray-400 border-[#444444] hover:bg-[#383838]'
                      }`}
                    >
                      {s.isActive ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-[#95EA00]" />
                          <span>Active on Form</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3 text-gray-500" />
                          <span>Deactivated</span>
                        </>
                      )}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => openEditModal(s)}
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

      {/* Add / Edit Spiff Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in text-gray-100">
            <h3 className="text-base font-bold text-white mb-1">
              {editingSpiff ? 'Edit Spiff Program' : 'New Spiff Program'}
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Enter program specifications and payroll dollar amount.
            </p>

            {error && (
              <div className="mb-4 p-2.5 bg-rose-950/50 border border-rose-800 rounded text-xs text-rose-200">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Program Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Electric Cushion Closed Sale"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Cash Amount ($ USD) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="150.00"
                  value={amountDollars}
                  onChange={(e) => setAmountDollars(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-[#95EA00] font-bold focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                  required
                />
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Stored as integer cents in database snapshot.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Description <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Summary shown to sales reps on the submission form..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Eligibility Requirements <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Specific rules (e.g. closed delivery within calendar month, signed lease)..."
                  value={eligibilityRequirements}
                  onChange={(e) => setEligibilityRequirements(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                  required
                />
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
                  {isSaving ? 'Saving...' : 'Save Spiff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
