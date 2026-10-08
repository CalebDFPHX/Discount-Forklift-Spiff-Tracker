import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, ArrowRight, X } from 'lucide-react';
import { SpiffSubmission } from '../lib/repository';
import { formatDollars } from '../lib/formatters';
import { formatPhoenixDate, formatPhoenixDateTime } from '../lib/timezone';

interface SubmissionSuccessModalProps {
  submission: SpiffSubmission;
  onReset: () => void;
}

export const SubmissionSuccessModal: React.FC<SubmissionSuccessModalProps> = ({
  submission,
  onReset,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onReset();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onReset]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onReset();
      }}
    >
      <div className="relative bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-2xl max-w-lg w-full p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-150 text-gray-100">
        {/* Top-left small close X button */}
        <button
          type="button"
          onClick={onReset}
          className="absolute top-4 left-4 p-1.5 text-gray-400 hover:text-white hover:bg-[#383838] rounded-lg transition-colors focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
          title="Close"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-12 h-12 bg-[#95EA00]/15 text-[#95EA00] rounded-full flex items-center justify-center mx-auto mb-4 border border-[#95EA00]/30">
          <CheckCircle2 className="w-7 h-7" />
        </div>

        <h2 className="text-xl font-bold text-center text-white">
          Spiff Request Submitted!
        </h2>
        <p className="text-xs text-center text-gray-400 mt-1 mb-5">
          Your request is recorded and queued for manager review.
        </p>

        {/* Potential Duplicate Warning if flagged */}
        {submission.isPotentialDuplicate && (
          <div className="mb-4 p-3 bg-amber-950/40 border border-amber-800 rounded-lg text-xs text-amber-200 flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block text-amber-300">Flagged for Manager Review:</span>
              <span>{submission.duplicateReason}</span>
            </div>
          </div>
        )}

        {/* Snapshot Details Summary */}
        <div className="border border-[#444444] rounded-lg divide-y divide-[#383838] text-xs text-gray-200 mb-6 bg-[#242424]">
          <div className="flex justify-between py-2.5 px-3">
            <span className="text-gray-400">Request ID</span>
            <span className="font-mono font-bold text-[#95EA00]">{submission.id}</span>
          </div>
          <div className="flex justify-between py-2.5 px-3">
            <span className="text-gray-400">Sales Representative</span>
            <span className="font-medium text-white">{submission.snapshotRepName}</span>
          </div>
          <div className="flex justify-between py-2.5 px-3">
            <span className="text-gray-400">Forklift / Model</span>
            <span className="font-medium text-white">{submission.liftName}</span>
          </div>
          <div className="flex justify-between py-2.5 px-3">
            <span className="text-gray-400">Serial Suffix</span>
            <span className="font-mono font-bold text-[#95EA00]">{submission.serialSuffix}</span>
          </div>
          <div className="flex justify-between py-2.5 px-3">
            <span className="text-gray-400">Program</span>
            <span className="font-medium text-white">{submission.snapshotSpiffName}</span>
          </div>
          <div className="flex justify-between py-2.5 px-3 bg-[#2d2433]">
            <span className="font-semibold text-purple-200">Spiff Cash Amount</span>
            <span className="font-extrabold text-[#95EA00] text-sm">
              {formatDollars(submission.snapshotAmountCents)}
            </span>
          </div>
          <div className="flex justify-between py-2.5 px-3">
            <span className="text-gray-400">Sale Date</span>
            <span className="font-medium text-white">{formatPhoenixDate(submission.saleDate)}</span>
          </div>
          <div className="flex justify-between py-2.5 px-3">
            <span className="text-gray-400">Submitted (Phoenix)</span>
            <span className="text-gray-300">{formatPhoenixDateTime(submission.submittedAt)}</span>
          </div>
          <div className="flex justify-between py-2.5 px-3">
            <span className="text-gray-400">Photo Attachment</span>
            <span className="font-semibold text-[#95EA00]">
              {submission.attachment ? `Verified & Attached (${submission.attachment.originalFilename})` : 'None'}
            </span>
          </div>
        </div>

        <button
          onClick={onReset}
          className="w-full inline-flex items-center justify-center space-x-2 py-3 bg-[#A559BD] hover:bg-[#934da9] text-white font-bold text-sm rounded-lg shadow-md transition-colors"
        >
          <span>Submit Another Forklift Spiff</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
