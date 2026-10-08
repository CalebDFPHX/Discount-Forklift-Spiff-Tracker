import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  DollarSign,
  AlertTriangle,
  History,
  Edit3,
  Image as ImageIcon,
  Clock,
  Shield,
  Loader2,
  Mail,
} from 'lucide-react';
import { SpiffSubmission } from '../lib/repository';
import { formatDollars, parseDollarsToCents, validateSerialSuffix } from '../lib/formatters';
import { formatPhoenixDate, formatPhoenixDateTime } from '../lib/timezone';

interface AdminRequestDetailModalProps {
  submission: SpiffSubmission | null;
  isOpen: boolean;
  onClose: () => void;
  adminUser: string;
  onOpenDecisionModal: (submission: SpiffSubmission, decision: 'approve' | 'deny') => void;
  onMarkPaid: (id: string) => Promise<void>;
  onCorrect: (id: string, updates: any, explanation: string) => Promise<void>;
  onViewPhoto: (submission: SpiffSubmission) => void;
}

export const AdminRequestDetailModal: React.FC<AdminRequestDetailModalProps> = ({
  submission,
  isOpen,
  onClose,
  adminUser,
  onOpenDecisionModal,
  onMarkPaid,
  onCorrect,
  onViewPhoto,
}) => {
  // Correction mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editLiftName, setEditLiftName] = useState('');
  const [editSerialSuffix, setEditSerialSuffix] = useState('');
  const [editSaleDate, setEditSaleDate] = useState('');
  const [editAmountDollars, setEditAmountDollars] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editExplanation, setEditExplanation] = useState('');

  const [actionError, setActionError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen || !submission) return null;

  const startEditing = () => {
    setEditLiftName(submission.liftName);
    setEditSerialSuffix(submission.serialSuffix);
    setEditSaleDate(submission.saleDate);
    setEditAmountDollars((submission.snapshotAmountCents / 100).toFixed(2));
    setEditNotes(submission.notes || '');
    setEditExplanation('');
    setActionError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setActionError(null);
  };

  const handleMarkPaid = async () => {
    setActionError(null);
    setIsProcessing(true);
    try {
      await onMarkPaid(submission.id);
    } catch (err: any) {
      setActionError(err.message || 'Failed to mark as paid.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    if (!editExplanation.trim()) {
      setActionError('A required explanation must be provided for all administrator corrections.');
      return;
    }

    const serialValidation = validateSerialSuffix(editSerialSuffix);
    if (!serialValidation.isValid) {
      setActionError(serialValidation.error || 'Invalid serial suffix.');
      return;
    }

    const newAmountCents = parseDollarsToCents(editAmountDollars);
    if (newAmountCents <= 0) {
      setActionError('Amount must be greater than $0.00.');
      return;
    }

    setIsProcessing(true);
    try {
      await onCorrect(
        submission.id,
        {
          liftName: editLiftName.trim(),
          serialSuffix: serialValidation.normalized,
          saleDate: editSaleDate,
          amountCents: newAmountCents,
          notes: editNotes.trim(),
        },
        editExplanation.trim()
      );
      setIsEditing(false);
    } catch (err: any) {
      setActionError(err.message || 'Failed to save correction.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending':
        return (
          <span className="text-amber-300 bg-amber-950/60 border border-amber-700/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            Pending Review
          </span>
        );
      case 'Approved':
        return (
          <span className="text-[#95EA00] bg-[#95EA00]/15 border border-[#95EA00]/30 px-2.5 py-0.5 rounded text-xs font-bold">
            Approved (Unpaid)
          </span>
        );
      case 'Paid':
        return (
          <span className="text-purple-300 bg-purple-950/60 border border-purple-700/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            Paid in Full
          </span>
        );
      case 'Rejected':
        return (
          <span className="text-rose-300 bg-rose-950/60 border border-rose-700/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            Denied
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-gray-100">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#383838] bg-[#1e1e1e] text-white">
          <div className="flex items-center space-x-3">
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono font-bold text-base text-[#95EA00]">
                  {submission.id}
                </span>
                <span className="text-gray-500">·</span>
                <span className="font-semibold text-sm">{submission.snapshotRepName}</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Submitted {formatPhoenixDateTime(submission.submittedAt)} (America/Phoenix)
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {getStatusBadge(submission.status)}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1 rounded hover:bg-[#383838] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Action Error */}
          {actionError && (
            <div className="p-3 bg-rose-950/50 border border-rose-800 rounded-lg text-xs text-rose-200 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Potential Duplicate Banner */}
          {submission.isPotentialDuplicate && (
            <div className="p-3.5 bg-amber-950/40 border border-amber-800 rounded-lg text-xs text-amber-200 space-y-1">
              <div className="flex items-center space-x-2 font-bold text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Potential Duplicate Submission Alert</span>
              </div>
              <p className="text-amber-200 leading-relaxed">{submission.duplicateReason}</p>
              <p className="text-[11px] text-amber-400 italic">
                Note: The last four serial characters do not uniquely identify a forklift, but are flagged for admin verification.
              </p>
            </div>
          )}

          {/* If Editing Mode */}
          {isEditing ? (
            <form onSubmit={handleSaveCorrection} className="p-4 bg-[#242424] border border-amber-700/60 rounded-lg space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-amber-800">
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  Administrator Correction Mode
                </span>
                <span className="text-[11px] text-amber-400">All modifications are permanently logged to audit history</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-200 mb-1">Forklift Model / Lift Name</label>
                  <input
                    type="text"
                    value={editLiftName}
                    onChange={(e) => setEditLiftName(e.target.value)}
                    className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-200 mb-1">Serial Suffix (Last 4)</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={editSerialSuffix}
                    onChange={(e) => setEditSerialSuffix(e.target.value.toUpperCase())}
                    className="w-full font-mono bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-200 mb-1">Sale Date</label>
                  <input
                    type="date"
                    value={editSaleDate}
                    onChange={(e) => setEditSaleDate(e.target.value)}
                    className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-200 mb-1">Spiff Amount ($)</label>
                  <input
                    type="text"
                    value={editAmountDollars}
                    onChange={(e) => setEditAmountDollars(e.target.value)}
                    className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs font-bold text-[#95EA00]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded px-3 py-1.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-rose-300 mb-1">
                  Required Explanation for Correction <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Explain why this correction is being made (e.g. Sales rep typo on serial suffix, verified with yard invoice #9921)..."
                  value={editExplanation}
                  onChange={(e) => setEditExplanation(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-rose-700 rounded px-3 py-1.5 text-xs text-white focus:ring-1 focus:ring-rose-500"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={isProcessing}
                  className="px-3 py-1.5 border border-[#444444] text-xs font-medium rounded hover:bg-[#383838] text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-1.5 bg-[#A559BD] hover:bg-[#934da9] text-white text-xs font-bold rounded"
                >
                  {isProcessing ? 'Saving Correction...' : 'Save Correction & Log Audit'}
                </button>
              </div>
            </form>
          ) : (
            /* Standard Details Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3 bg-[#242424] p-4 rounded-lg border border-[#444444]">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Forklift & Sale Data</h4>
                <div className="text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Lift Model:</span>
                    <span className="font-semibold text-white">{submission.liftName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Serial Suffix:</span>
                    <span className="font-mono font-bold text-white bg-[#1e1e1e] px-1.5 py-0.5 rounded border border-[#444444]">
                      {submission.serialSuffix}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Sale Date:</span>
                    <span className="font-medium text-white">{formatPhoenixDate(submission.saleDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Sales Rep:</span>
                    <span className="font-semibold text-white">{submission.snapshotRepName}</span>
                  </div>
                  {submission.snapshotRepEmail && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Rep Email:</span>
                      <span className="font-mono text-[#95EA00]">{submission.snapshotRepEmail}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3 bg-[#242424] p-4 rounded-lg border border-[#444444]">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Spiff Cash Program</h4>
                  <span className="text-base font-extrabold text-[#95EA00]">
                    {formatDollars(submission.snapshotAmountCents)}
                  </span>
                </div>
                <div className="text-xs space-y-1.5">
                  <div className="font-semibold text-white">{submission.snapshotSpiffName}</div>
                  <p className="text-gray-300 text-[11px] leading-relaxed">
                    {submission.snapshotEligibilityRequirements}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Notes & Photo Attachment Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-[#242424] border border-[#444444] rounded-lg">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Rep Notes</h4>
              <p className="text-xs text-gray-300 italic">
                {submission.notes ? `“${submission.notes}”` : 'No notes provided by sales rep.'}
              </p>
            </div>

            <div className="p-4 bg-[#242424] border border-[#444444] rounded-lg flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Attached Sale Photo</h4>
                <p className="text-xs text-gray-300">
                  {submission.attachment ? (
                    <span className="text-[#95EA00] font-medium">Photo attached ({submission.attachment.originalFilename})</span>
                  ) : (
                    <span className="text-gray-400">No photo</span>
                  )}
                </p>
              </div>

              {submission.attachment && (
                <button
                  type="button"
                  onClick={() => onViewPhoto(submission)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-purple-200 bg-[#A559BD]/20 hover:bg-[#A559BD]/30 border border-[#A559BD]/50 rounded transition-colors"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>View Photo</span>
                </button>
              )}
            </div>
          </div>

          {/* Lifecycle & Status Details */}
          <div className="p-4 bg-[#242424] rounded-lg border border-[#444444] text-xs space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Audit & Timestamps (America/Phoenix)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <span className="text-gray-400 block text-[11px]">Submitted</span>
                <span className="font-medium text-white">{formatPhoenixDateTime(submission.submittedAt)}</span>
              </div>

              <div>
                <span className="text-gray-400 block text-[11px]">Approved</span>
                <span className="font-medium text-white">
                  {submission.approvedAt ? `${formatPhoenixDateTime(submission.approvedAt)} (${submission.approvedBy})` : '—'}
                </span>
              </div>

              <div>
                <span className="text-gray-400 block text-[11px]">Paid</span>
                <span className="font-medium text-white">
                  {submission.paidAt ? `${formatPhoenixDateTime(submission.paidAt)} (${submission.paidBy})` : '—'}
                </span>
              </div>
            </div>

            {submission.rejectedAt && (
              <div className="mt-2 pt-2 border-t border-[#383838] text-rose-300">
                <span className="font-semibold">Denied on {formatPhoenixDateTime(submission.rejectedAt)} by {submission.rejectedBy}:</span>
                <p className="mt-0.5 italic">{submission.rejectionReason || submission.decisionMessage}</p>
              </div>
            )}

            {submission.approvedAt && submission.decisionMessage && (
              <div className="mt-2 pt-2 border-t border-[#383838] text-[#95EA00]">
                <span className="font-semibold">Approval Manager Note:</span>
                <p className="mt-0.5 italic text-gray-200">{submission.decisionMessage}</p>
              </div>
            )}
          </div>

          {/* Audit History Timeline */}
          {submission.auditEvents && submission.auditEvents.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-gray-300">
                <History className="w-3.5 h-3.5 text-[#95EA00]" />
                <span>Audit Log ({submission.auditEvents.length} events)</span>
              </div>
              <div className="border border-[#444444] rounded-lg divide-y divide-[#383838] max-h-48 overflow-y-auto text-xs bg-[#1e1e1e]">
                {submission.auditEvents.map((evt) => (
                  <div key={evt.id} className="p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white uppercase text-[10px] tracking-wider">
                        {evt.action.replace('_', ' ')}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {formatPhoenixDateTime(evt.timestamp)}
                      </span>
                    </div>
                    <p className="text-gray-300 mt-0.5">{evt.explanation}</p>
                    {evt.oldValue && (
                      <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                        {evt.fieldChanged}: {evt.oldValue} → {evt.newValue}
                      </p>
                    )}
                    <span className="text-[10px] text-gray-500 block mt-0.5">By: {evt.performedBy}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Controls Footer */}
        <div className="p-4 bg-[#1e1e1e] border-t border-[#383838] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            {!isEditing && (
              <button
                type="button"
                onClick={startEditing}
                disabled={isProcessing}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-gray-200 bg-[#2d2d2d] border border-[#444444] rounded hover:bg-[#383838] hover:text-white transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Correct Details</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {/* Status-specific primary actions */}
            {submission.status === 'Pending' && (
              <>
                {/* DENY BUTTON: Distinct label + icon */}
                <button
                  type="button"
                  onClick={() => onOpenDecisionModal(submission, 'deny')}
                  disabled={isProcessing}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded shadow-xs transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Deny Request</span>
                </button>

                {/* APPROVE BUTTON: Distinct label + icon */}
                <button
                  type="button"
                  onClick={() => onOpenDecisionModal(submission, 'approve')}
                  disabled={isProcessing}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-black bg-[#95EA00] hover:bg-[#83cc00] rounded shadow-xs transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Approve Request</span>
                </button>
              </>
            )}

            {submission.status === 'Approved' && (
              <button
                type="button"
                onClick={handleMarkPaid}
                disabled={isProcessing}
                className="inline-flex items-center space-x-1 px-4 py-2 text-xs font-bold text-white bg-[#A559BD] hover:bg-[#934da9] rounded shadow-xs transition-colors"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                <span>Mark as Paid (Preserves Approval Date)</span>
              </button>
            )}

            {submission.status === 'Paid' && (
              <div className="text-xs text-purple-300 font-semibold bg-purple-950/60 px-3 py-1.5 rounded border border-purple-800">
                Payment completed on {formatPhoenixDate(submission.paidAt)} by {submission.paidBy}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
