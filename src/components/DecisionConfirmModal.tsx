import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  X,
  Mail,
  Search,
  Shield,
  Lock,
  AlertCircle,
  Loader2,
  Users,
  Check,
} from 'lucide-react';
import { SpiffSubmission, SalesRep, NotificationContact } from '../lib/repository';
import { formatDollars } from '../lib/formatters';

interface RecipientItem {
  id: string;
  name: string;
  email: string;
  role: string;
  isLocked?: boolean; // True for submitting sales rep
}

interface DecisionConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  submission: SpiffSubmission | null;
  decision: 'approve' | 'deny';
  repRecord: SalesRep | null;
  allContacts: NotificationContact[];
  onConfirm: (
    submissionId: string,
    decision: 'approve' | 'deny',
    reasonOrMessage: string,
    selectedRecipients: Array<{ email: string; name: string; role: string }>
  ) => Promise<void>;
}

export const DecisionConfirmModal: React.FC<DecisionConfirmModalProps> = ({
  isOpen,
  onClose,
  submission,
  decision,
  repRecord,
  allContacts,
  onConfirm,
}) => {
  const [reasonOrMessage, setReasonOrMessage] = useState('');
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<Set<string>>(new Set());
  const [contactSearch, setContactSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isApprove = decision === 'approve';

  // Submitting Rep Recipient Object (Always required and locked)
  const repRecipient: RecipientItem | null = useMemo(() => {
    if (!submission) return null;
    const email = submission.snapshotRepEmail || repRecord?.email || '';
    return {
      id: `rep_${submission.repId}`,
      name: submission.snapshotRepName,
      email: email || 'No email configured',
      role: 'Submitting Sales Rep',
      isLocked: true,
    };
  }, [submission, repRecord]);

  // Initialize preselected recipients whenever modal opens
  useEffect(() => {
    if (!isOpen || !submission) return;

    setReasonOrMessage('');
    setError(null);
    setContactSearch('');

    const initialIds = new Set<string>();

    // 1. Rep is always selected
    if (repRecipient) {
      initialIds.add(repRecipient.id);
    }

    // 2. Preselect rep's assigned General Managers or branch General Manager
    if (repRecord?.assignedGmIds) {
      const assignedIds = repRecord.assignedGmIds.split(',').map((id) => id.trim());
      for (const gmId of assignedIds) {
        const contact = allContacts.find((c) => c.id === gmId && c.isActive);
        if (contact) {
          initialIds.add(contact.id);
        }
      }
    }

    if (repRecord?.branch) {
      const branchLower = repRecord.branch.toLowerCase().trim();
      const branchGm = allContacts.find(
        (c) =>
          c.isActive &&
          c.role === 'General Manager' &&
          c.branch &&
          (c.branch.toLowerCase().includes(branchLower) || branchLower.includes(c.branch.toLowerCase()))
      );
      if (branchGm) {
        initialIds.add(branchGm.id);
      }
    }

    // 3. Preselect default accounting recipients
    for (const c of allContacts) {
      if (c.isActive && c.isDefaultAccounting) {
        initialIds.add(c.id);
      }
    }

    setSelectedRecipientIds(initialIds);
  }, [isOpen, submission, repRecord, allContacts, repRecipient]);

  if (!isOpen || !submission) return null;

  // Filter available contacts for search
  const filteredContacts = allContacts
    .filter((c) => c.isActive)
    .filter((c) => {
      if (!contactSearch.trim()) return true;
      const q = contactSearch.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q) ||
        (c.branch && c.branch.toLowerCase().includes(q))
      );
    });

  const toggleContact = (id: string) => {
    if (repRecipient && id === repRecipient.id) return; // Cannot deselect submitting rep
    const next = new Set(selectedRecipientIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedRecipientIds(next);
  };

  const handleExecuteDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isApprove && !reasonOrMessage.trim()) {
      setError('A reason is required when denying a request.');
      return;
    }

    if (!repRecipient || !repRecipient.email || !repRecipient.email.includes('@')) {
      setError('Cannot dispatch decision: The submitting sales rep is missing a valid email address snapshot.');
      return;
    }

    // Assemble final recipient list
    const finalList: Array<{ email: string; name: string; role: string }> = [];

    // Always include submitting rep
    finalList.push({
      email: repRecipient.email,
      name: repRecipient.name,
      role: repRecipient.role,
    });

    // Add selected contacts
    for (const contactId of selectedRecipientIds) {
      if (repRecipient && contactId === repRecipient.id) continue;
      const contact = allContacts.find((c) => c.id === contactId);
      if (contact && contact.email) {
        finalList.push({
          email: contact.email,
          name: contact.name,
          role: contact.role,
        });
      }
    }

    setIsSubmitting(true);
    try {
      await onConfirm(submission.id, decision, reasonOrMessage.trim(), finalList);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save decision.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Count active selected recipients
  const totalRecipientsCount = selectedRecipientIds.size;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-gray-100">
        {/* Header */}
        <div
          className={`flex items-center justify-between p-5 border-b text-white ${
            isApprove ? 'bg-emerald-950/90 border-[#383838]' : 'bg-rose-950/90 border-[#383838]'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            {isApprove ? (
              <CheckCircle2 className="w-6 h-6 text-[#95EA00]" />
            ) : (
              <XCircle className="w-6 h-6 text-rose-400" />
            )}
            <div>
              <h3 className="font-bold text-base tracking-tight">
                {isApprove ? 'Confirm Spiff Approval' : 'Confirm Spiff Denial'}
              </h3>
              <p className="text-xs text-gray-300">
                Decision will be permanently saved and emailed to selected recipients.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-white p-1 rounded hover:bg-black/30 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleExecuteDecision} className="p-6 overflow-y-auto flex-1 space-y-5">
          {error && (
            <div className="p-3 bg-rose-950/50 border border-rose-800 rounded-lg text-xs text-rose-200 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Request Snapshot Highlights (Rep, Lift, Spiff, Amount) */}
          <div className="bg-[#242424] border border-[#444444] rounded-lg p-4 space-y-2 text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#95EA00] block">
              Target Request Overview
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div>
                <span className="text-gray-400 block text-[11px]">Sales Rep</span>
                <span className="font-bold text-white truncate block">{submission.snapshotRepName}</span>
                <span className="text-[10px] text-gray-400 truncate block">{submission.snapshotRepEmail || repRecord?.email || 'No email'}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Forklift Model</span>
                <span className="font-semibold text-white truncate block">{submission.liftName}</span>
                <span className="font-mono text-[10px] text-gray-300 block">SN: {submission.serialSuffix}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Spiff Program</span>
                <span className="font-semibold text-white truncate block">{submission.snapshotSpiffName}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Spiff Amount</span>
                <span className="font-extrabold text-[#95EA00] text-sm block">
                  {formatDollars(submission.snapshotAmountCents)}
                </span>
              </div>
            </div>
          </div>

          {/* Reason or Message Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-white">
                {isApprove ? (
                  <span>Congratulatory Note / Manager Message <span className="text-gray-400 font-normal">(Optional)</span></span>
                ) : (
                  <span>Reason for Denial <span className="text-rose-400 font-bold">* Required</span></span>
                )}
              </label>
            </div>
            <textarea
              rows={3}
              placeholder={
                isApprove
                  ? 'Add an optional note to include in the approval notification email (e.g. Great job closing the cushion package!)...'
                  : 'Explain clearly why this spiff is being denied (e.g. Serial suffix did not match delivery inspection, unit was canceled)...'
              }
              value={reasonOrMessage}
              onChange={(e) => setReasonOrMessage(e.target.value)}
              className={`w-full bg-[#1e1e1e] border rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-2 ${
                isApprove
                  ? 'border-[#444444] focus:ring-[#95EA00] focus:border-[#95EA00]'
                  : 'border-rose-700 focus:ring-rose-500 bg-rose-950/20'
              }`}
              required={!isApprove}
            />
          </div>

          {/* Notification Recipients Selection Section */}
          <div className="space-y-3 pt-2 border-t border-[#383838]">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <Mail className="w-3.5 h-3.5 text-[#95EA00]" />
                  <span>Automatic Result Email Recipients</span>
                </h4>
                <p className="text-[11px] text-gray-400">
                  Preselected from rep, assigned general manager(s), and accounting. Search to add or adjust.
                </p>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#1e1e1e] border border-[#444444] text-[#95EA00]">
                {totalRecipientsCount} recipient{totalRecipientsCount === 1 ? '' : 's'}
              </span>
            </div>

            {/* Recipient Selection Search Bar */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search contacts by name, email, role, or branch..."
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#1e1e1e] border border-[#444444] rounded-lg text-white placeholder-gray-500 focus:bg-[#181818] focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
              />
            </div>

            {/* Recipient Cards Multi-Select List */}
            <div className="border border-[#444444] rounded-lg max-h-48 overflow-y-auto divide-y divide-[#383838] text-xs bg-[#242424]">
              {/* Always Show Submitting Rep First (Locked) */}
              {repRecipient && (
                <div className="p-2.5 flex items-center justify-between bg-[#1e1e1e]">
                  <div className="flex items-center space-x-2.5 overflow-hidden">
                    <div className="w-4 h-4 rounded bg-[#333333] flex items-center justify-center text-[#95EA00] flex-shrink-0">
                      <Lock className="w-2.5 h-2.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white truncate">{repRecipient.name}</span>
                        <span className="text-[10px] bg-[#A559BD]/30 text-purple-200 border border-[#A559BD]/50 px-1.5 py-0.2 rounded font-medium">
                          Submitting Rep (Required)
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-400 truncate block">{repRecipient.email}</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-400 italic">Always included</span>
                </div>
              )}

              {/* Other Active Contacts */}
              {filteredContacts.map((contact) => {
                const isSelected = selectedRecipientIds.has(contact.id);
                const isGM = contact.role === 'General Manager';
                const isAcct = contact.role === 'Accounting';

                return (
                  <div
                    key={contact.id}
                    onClick={() => toggleContact(contact.id)}
                    className={`p-2.5 flex items-center justify-between cursor-pointer hover:bg-[#2f2f2f] transition-colors ${
                      isSelected ? 'bg-[#35303a]' : ''
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 overflow-hidden">
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-[#A559BD] border-[#A559BD] text-white'
                            : 'border-[#555555] bg-[#1e1e1e]'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-white truncate">{contact.name}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                              isGM
                                ? 'bg-blue-950/80 text-blue-300 border border-blue-800'
                                : isAcct
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                                : 'bg-[#1e1e1e] text-gray-300 border border-[#444444]'
                            }`}
                          >
                            {contact.role}
                          </span>
                          {contact.branch && (
                            <span className="text-[10px] text-gray-400">· {contact.branch}</span>
                          )}
                        </div>
                        <span className="text-[11px] text-gray-400 truncate block">{contact.email}</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredContacts.length === 0 && (
                <div className="p-4 text-center text-gray-400 text-xs">
                  No additional contacts match your search query.
                </div>
              )}
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div className="pt-3 border-t border-[#383838] flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-gray-300 border border-[#444444] rounded-lg bg-[#1e1e1e] hover:bg-[#383838] hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`inline-flex items-center space-x-1.5 px-5 py-2 text-xs font-bold rounded-lg shadow-md transition-colors ${
                isApprove
                  ? 'bg-[#95EA00] hover:bg-[#83cc00] text-black disabled:bg-[#95EA00]/50'
                  : 'bg-rose-600 hover:bg-rose-700 text-white disabled:bg-rose-400'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing Decision & Dispatching Emails...</span>
                </>
              ) : isApprove ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirm Approval & Send Emails</span>
                </>
              ) : (
                <>
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Confirm Denial & Send Emails</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
