import React, { useState, useEffect } from 'react';
import { Truck, CheckCircle, AlertTriangle, ShieldCheck, Info, Loader2, ArrowRight } from 'lucide-react';
import { SalePhotoUpload } from './SalePhotoUpload';
import { formatDollars, validateSerialSuffix } from '../lib/formatters';
import { getPhoenixTodayString } from '../lib/timezone';
import { SalesRep, Spiff, SpiffSubmission } from '../lib/repository';

interface RepSubmissionFormProps {
  onSubmissionSuccess: (submission: SpiffSubmission) => void;
  onAdminLoginClick: () => void;
}

export const RepSubmissionForm: React.FC<RepSubmissionFormProps> = ({
  onSubmissionSuccess,
  onAdminLoginClick,
}) => {
  const [reps, setReps] = useState<SalesRep[]>([]);
  const [spiffs, setSpiffs] = useState<Spiff[]>([]);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  // Form Fields
  const [selectedRepId, setSelectedRepId] = useState('');
  const [liftName, setLiftName] = useState('');
  const [serialSuffix, setSerialSuffix] = useState('');
  const [saleDate, setSaleDate] = useState(getPhoenixTodayString());
  const [selectedSpiffId, setSelectedSpiffId] = useState('');
  const [notes, setNotes] = useState('');
  const [attachmentId, setAttachmentId] = useState<string | null>(null);

  // Submission States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => `idem_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);

  // Fetch active reps & spiffs
  const loadConfig = async () => {
    setIsLoadingConfig(true);
    try {
      const [repsRes, spiffsRes] = await Promise.all([
        fetch('/api/reps').then((r) => r.json()),
        fetch('/api/spiffs').then((r) => r.json()),
      ]);
      setReps(repsRes.reps || []);
      setSpiffs(spiffsRes.spiffs || []);
    } catch (err) {
      console.error('Failed to load reps or spiffs configuration:', err);
    } finally {
      setIsLoadingConfig(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const selectedSpiff = spiffs.find((s) => s.id === selectedSpiffId);
  const selectedRep = reps.find((r) => r.id === selectedRepId);

  // Serial input handler: force uppercase, max 4 chars
  const handleSerialChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    setSerialSuffix(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Client-side quick checks
    if (!selectedRepId) {
      setFormError('Please select your sales representative name.');
      return;
    }
    if (selectedRep && (!selectedRep.email || !selectedRep.email.trim())) {
      setFormError(
        `Sales rep "${selectedRep.name}" is missing a configured notification email address. An administrator must configure an email in Rep Management before requests can be submitted.`
      );
      return;
    }
    if (!liftName.trim()) {
      setFormError('Please enter the sold forklift model / lift name.');
      return;
    }
    const serialCheck = validateSerialSuffix(serialSuffix);
    if (!serialCheck.isValid) {
      setFormError(serialCheck.error || 'Serial suffix must be exactly 4 characters.');
      return;
    }
    if (!saleDate) {
      setFormError('Please select the sale date.');
      return;
    }
    if (!selectedSpiffId) {
      setFormError('Please select the eligible spiff program.');
      return;
    }
    if (!attachmentId) {
      setFormError('Please attach a sale photo before submitting your spiff request.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repId: selectedRepId,
          spiffId: selectedSpiffId,
          liftName: liftName.trim(),
          serialSuffix: serialCheck.normalized,
          saleDate,
          notes: notes.trim() || undefined,
          attachmentId: attachmentId || undefined,
          idempotencyKey,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Server rejected submission.');
      }

      // Confirm the photo has uploaded successfully, passed validation, and been linked to the saved request
      if (!data.submission || !data.submission.attachment) {
        throw new Error('Photo attachment was not successfully verified and linked to the saved request.');
      }

      // Generate a new idempotency key for any next submission attempt
      setIdempotencyKey(`idem_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
      onSubmissionSuccess(data.submission);
    } catch (err: any) {
      console.error('Submission failed:', err);
      setFormError(err.message || 'Submission failed. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingConfig) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#95EA00] mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-300">Loading sales spiff program options...</p>
      </div>
    );
  }

  // Requirement: "If no reps or spiffs have been configured, show a helpful message rather than an unusable form."
  if (reps.length === 0 || spiffs.length === 0) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-lg text-center">
        <div className="w-12 h-12 bg-amber-950/60 text-amber-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-800">
          <Info className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">Setup Required by Administrator</h2>
        <p className="text-sm text-gray-300 mb-6 leading-relaxed">
          {reps.length === 0 && spiffs.length === 0
            ? 'No sales representatives or spiff programs have been added to the system yet.'
            : reps.length === 0
            ? 'No active sales representatives are currently configured.'
            : 'No active spiff programs are currently available for submission.'}
          <br />
          Please log in as an administrator to configure active reps and spiff programs.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onAdminLoginClick}
            className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-5 py-2.5 bg-[#A559BD] hover:bg-[#934da9] text-white font-bold text-sm rounded-lg shadow-sm transition-colors"
          >
            <ShieldCheck className="w-4 h-4 text-[#95EA00]" />
            <span>Admin Portal Login</span>
          </button>
          <button
            onClick={loadConfig}
            className="w-full sm:w-auto px-4 py-2.5 border border-[#444444] hover:bg-[#383838] text-gray-200 font-medium text-sm rounded-lg transition-colors"
          >
            Refresh Form
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6">
      <div className="mb-6">
        <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#95EA00] mb-1">
          <span>Discount Forklift</span>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white">
          Sales Spiff Request Form
        </h1>
        <p className="text-sm text-gray-300 mt-1">
          Submit your closed forklift sale for manager review and cash spiff payroll authorization.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-xl p-6 space-y-6">
        {/* Form Error Banner */}
        {formError && (
          <div className="flex items-start space-x-3 p-3.5 bg-rose-950/50 border border-rose-800 rounded-lg text-rose-200 text-sm">
            <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-xs uppercase tracking-wider text-rose-300">Please Review</p>
              <p className="text-xs text-rose-200 mt-0.5">{formError}</p>
            </div>
          </div>
        )}

        {/* 1. Sales Rep Name */}
        <div>
          <label htmlFor="repSelect" className="block text-sm font-semibold text-white mb-1.5">
            Sales Representative <span className="text-rose-400">*</span>
          </label>
          <select
            id="repSelect"
            value={selectedRepId}
            onChange={(e) => {
              setSelectedRepId(e.target.value);
              setFormError(null);
            }}
            className="w-full bg-[#1e1e1e] border border-[#444444] rounded-lg px-3.5 py-2.5 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#95EA00] focus:border-[#95EA00] transition-colors shadow-inner"
            required
          >
            <option value="" className="text-gray-400">Select your name...</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id} className="bg-[#1e1e1e] text-white">
                {r.name} {r.branch ? `(${r.branch})` : ''} {!r.email ? '— [Email Required]' : ''}
              </option>
            ))}
          </select>

          {/* Submitting rep email status display */}
          {selectedRep && (
            <div className="mt-2 text-xs">
              {selectedRep.email ? (
                <div className="flex items-center space-x-1.5 text-gray-300 bg-[#242424] border border-[#444444] px-3 py-1.5 rounded-lg">
                  <span className="font-semibold text-gray-200">Notification Email:</span>
                  <span className="font-mono text-[#95EA00]">{selectedRep.email}</span>
                  <span className="text-[11px] text-gray-400 italic">(Locked / Managed by office)</span>
                </div>
              ) : (
                <div className="p-3 bg-rose-950/50 border border-rose-800 rounded-lg text-xs text-rose-200 flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block text-rose-300">Email Address Required:</span>
                    <span>
                      {selectedRep.name} does not have an email address configured. An office administrator must configure a notification email in Rep Management before requests can be submitted.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2. Forklift Model / Lift Name */}
        <div>
          <label htmlFor="liftName" className="block text-sm font-semibold text-white mb-1.5">
            Forklift Model / Lift Name <span className="text-rose-400">*</span>
          </label>
          <input
            id="liftName"
            type="text"
            placeholder="e.g. Toyota 8FGU25 5,000lb Cushion or Cat 2C5000"
            value={liftName}
            onChange={(e) => setLiftName(e.target.value)}
            className="w-full bg-[#1e1e1e] border border-[#444444] rounded-lg px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#95EA00] focus:border-[#95EA00] shadow-inner"
            required
          />
        </div>

        {/* 3. Serial Suffix and Sale Date in 2 columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="serialSuffix" className="block text-sm font-semibold text-white">
                Serial Number Suffix <span className="text-rose-400">*</span>
              </label>
              <span className="text-[11px] text-[#95EA00] font-mono">Last 4 chars</span>
            </div>
            <div className="relative">
              <input
                id="serialSuffix"
                type="text"
                placeholder="0042"
                maxLength={4}
                value={serialSuffix}
                onChange={handleSerialChange}
                className="w-full font-mono uppercase text-base tracking-widest bg-[#1e1e1e] border border-[#444444] rounded-lg px-3.5 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#95EA00] focus:border-[#95EA00] shadow-inner"
                required
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Exact 4 letters/numbers. Preserves leading zeros (e.g. 0042, 9A12).
            </p>
          </div>

          <div>
            <label htmlFor="saleDate" className="block text-sm font-semibold text-white mb-1.5">
              Sale Date <span className="text-rose-400">*</span>
            </label>
            <input
              id="saleDate"
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              className="w-full bg-[#1e1e1e] border border-[#444444] rounded-lg px-3.5 py-2.5 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#95EA00] focus:border-[#95EA00] shadow-inner"
              required
            />
            <p className="text-[11px] text-gray-400 mt-1">America/Phoenix date closed.</p>
          </div>
        </div>

        {/* 4. Eligible Spiff Program Selection */}
        <div>
          <label htmlFor="spiffSelect" className="block text-sm font-semibold text-white mb-1.5">
            Eligible Spiff Program <span className="text-rose-400">*</span>
          </label>
          <select
            id="spiffSelect"
            value={selectedSpiffId}
            onChange={(e) => setSelectedSpiffId(e.target.value)}
            className="w-full bg-[#1e1e1e] border border-[#444444] rounded-lg px-3.5 py-2.5 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#95EA00] focus:border-[#95EA00] shadow-inner"
            required
          >
            <option value="" className="text-gray-400">Select qualifying spiff program...</option>
            {spiffs.map((s) => (
              <option key={s.id} value={s.id} className="bg-[#1e1e1e] text-white">
                {s.name} ({formatDollars(s.amountCents)})
              </option>
            ))}
          </select>

          {/* Show selected spiff description, requirements, and amount before submission */}
          {selectedSpiff && (
            <div className="mt-3 p-4 bg-[#242424] border border-[#444444] rounded-lg space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white">{selectedSpiff.name}</span>
                <span className="text-base font-extrabold text-[#95EA00] bg-[#1e1e1e] px-2.5 py-0.5 rounded border border-[#444444] shadow-xs">
                  {formatDollars(selectedSpiff.amountCents)}
                </span>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                {selectedSpiff.description}
              </p>
              <div className="pt-2 border-t border-[#383838]">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#95EA00]">
                  Eligibility Requirements:
                </p>
                <p className="text-xs text-gray-300 mt-0.5 italic">
                  {selectedSpiff.eligibilityRequirements}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 5. Sale Photo Attachment */}
        <SalePhotoUpload
          repId={selectedRepId}
          onAttachmentSuccess={(attId) => setAttachmentId(attId)}
          onAttachmentRemoved={() => setAttachmentId(null)}
          initialAttachmentId={attachmentId}
        />

        {/* 6. Notes */}
        <div>
          <label htmlFor="notes" className="block text-sm font-semibold text-white mb-1.5">
            Notes <span className="text-gray-400 font-normal text-xs">(Optional)</span>
          </label>
          <textarea
            id="notes"
            rows={3}
            placeholder="Add delivery info, customer invoice number, or financing partner notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-[#1e1e1e] border border-[#444444] rounded-lg px-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#95EA00] focus:border-[#95EA00] shadow-inner"
          />
        </div>

        {/* Submit Button */}
        <div className="pt-3 border-t border-[#383838] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-400 order-2 sm:order-1">
            Submission triggers an automated manager notification email.
          </p>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto order-1 sm:order-2 inline-flex items-center justify-center space-x-2 px-6 py-3 bg-[#A559BD] hover:bg-[#934da9] active:bg-[#7e3895] text-white font-bold text-sm rounded-lg shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Validating & Submitting...</span>
              </>
            ) : (
              <>
                <span>Submit Spiff Request</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>

      {/* Discreet footer admin link */}
      <div className="mt-8 text-center">
        <button
          onClick={onAdminLoginClick}
          className="text-xs text-gray-400 hover:text-[#95EA00] underline transition-colors"
        >
          Administrator / Office Manager Login
        </button>
      </div>
    </div>
  );
};
