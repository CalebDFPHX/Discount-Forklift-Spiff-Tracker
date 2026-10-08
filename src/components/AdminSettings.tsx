import React, { useState, useEffect } from 'react';
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Database,
  Cloud,
  Shield,
  Server,
  KeyRound,
  Sparkles,
  Clock,
  ChevronDown,
  ChevronsUpDown,
  ExternalLink,
} from 'lucide-react';
import { EmailJob } from '../lib/repository';
import { formatPhoenixDateTime } from '../lib/timezone';
import { AdminUsersManager } from './AdminUsersManager';
import { AdminEmailTemplatesManager } from './AdminEmailTemplatesManager';
import { adminFetch } from '../lib/api';

interface AdminSettingsProps {
  adminUser: string;
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({ adminUser }) => {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailJobs, setEmailJobs] = useState<EmailJob[]>([]);
  const [statusInfo, setStatusInfo] = useState<any>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);

  // Collapsible sections state
  // Default: sections open for immediate access, fully collapsible on demand
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    infrastructure: true,
    userLogins: true,
    recipientEmail: true,
    templates: true,
    dispatchLog: true,
    cronEndpoints: true,
  });

  const toggleSection = (sectionKey: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const handleExpandAll = () => {
    setOpenSections({
      infrastructure: true,
      userLogins: true,
      recipientEmail: true,
      templates: true,
      dispatchLog: true,
      cronEndpoints: true,
    });
  };

  const handleCollapseAll = () => {
    setOpenSections({
      infrastructure: false,
      userLogins: false,
      recipientEmail: false,
      templates: false,
      dispatchLog: false,
      cronEndpoints: false,
    });
  };

  const allExpanded = Object.values(openSections).every(Boolean);

  const loadData = async () => {
    try {
      const [settingsRes, jobsRes, statusRes] = await Promise.all([
        adminFetch('/api/admin/settings').then((r) => r.json()),
        adminFetch('/api/admin/email-jobs').then((r) => r.json()),
        adminFetch('/api/admin/status').then((r) => r.json()),
      ]);

      setRecipientEmail(settingsRes.notificationRecipientEmail || 'caleb@discountforkliftphoenix.com');
      setEmailJobs(jobsRes.jobs || []);
      setStatusInfo(statusRes || null);
    } catch (err) {
      console.error('Failed to load settings data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [adminUser]);

  const handleSaveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setSaveSuccess(false);

    try {
      const res = await adminFetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notificationRecipientEmail: recipientEmail.trim(),
        }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to update recipient email:', err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    setRetryingJobId(jobId);
    try {
      const res = await adminFetch(`/api/admin/email-jobs/${jobId}/retry`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        loadData();
      } else {
        alert(data.error || 'Failed to retry notification.');
      }
    } catch (err) {
      console.error('Error retrying job:', err);
    } finally {
      setRetryingJobId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'delivered':
        return (
          <span className="text-[#95EA00] bg-[#95EA00]/15 border border-[#95EA00]/30 px-2 py-0.5 rounded text-[11px] font-bold">
            delivered
          </span>
        );
      case 'accepted':
        return (
          <span className="text-emerald-300 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded text-[11px] font-semibold">
            accepted (provider)
          </span>
        );
      case 'processing':
        return (
          <span className="text-blue-300 bg-blue-950/60 border border-blue-800 px-2 py-0.5 rounded text-[11px] font-semibold animate-pulse">
            processing lease
          </span>
        );
      case 'simulated':
        return (
          <span className="text-purple-300 bg-purple-950/60 border border-purple-800 px-2 py-0.5 rounded text-[11px] font-semibold">
            simulated (preview)
          </span>
        );
      case 'bounced':
        return (
          <span className="text-orange-300 bg-orange-950/60 border border-orange-800 px-2 py-0.5 rounded text-[11px] font-semibold">
            bounced
          </span>
        );
      case 'failed':
        return (
          <span className="text-rose-300 bg-rose-950/60 border border-rose-800 px-2 py-0.5 rounded text-[11px] font-semibold">
            failed
          </span>
        );
      default:
        return (
          <span className="text-amber-300 bg-amber-950/60 border border-amber-800 px-2 py-0.5 rounded text-[11px] font-semibold">
            queued
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Global Collapse/Expand Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#383838]">
        <div>
          <h2 className="text-lg font-bold text-white">Office Notifications & Infrastructure</h2>
          <p className="text-xs text-gray-300 mt-0.5">
            Configure notification dispatch, manage administrator & approving manager logins, customize email templates, and monitor job queues.
          </p>
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0">
          <button
            type="button"
            onClick={allExpanded ? handleCollapseAll : handleExpandAll}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#1e1e1e] hover:bg-[#333333] border border-[#444444] rounded-lg text-xs font-semibold text-gray-200 hover:text-white transition-colors"
            title={allExpanded ? 'Collapse all sections' : 'Expand all sections'}
          >
            <ChevronsUpDown className="w-3.5 h-3.5 text-[#95EA00]" />
            <span>{allExpanded ? 'Collapse All Sections' : 'Expand All Sections'}</span>
          </button>
        </div>
      </div>

      {/* ==================================================== */}
      {/* SECTION 1: System & Cloud Infrastructure Status     */}
      {/* ==================================================== */}
      <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-sm overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => toggleSection('infrastructure')}
          className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-[#343434] transition-colors focus:outline-none"
          aria-expanded={openSections.infrastructure}
        >
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-[#95EA00]/15 border border-[#95EA00]/30 flex items-center justify-center text-[#95EA00] flex-shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white">System & Cloud Infrastructure Status</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#1e1e1e] border border-[#444444] text-gray-300">
                  {statusInfo?.isNeonConfigured ? 'Live Neon Instance' : 'Preview Memory Mode'}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                PostgreSQL database, Resend email dispatches, and private Vercel Blob storage states
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="hidden md:flex items-center space-x-1.5 text-[11px] font-mono text-gray-300">
              <span className={`w-2 h-2 rounded-full ${statusInfo?.isNeonConfigured ? 'bg-[#95EA00]' : 'bg-amber-400'}`} />
              <span>Neon</span>
              <span className="text-gray-500">•</span>
              <span className={`w-2 h-2 rounded-full ${statusInfo?.isResendConfigured ? 'bg-[#95EA00]' : 'bg-[#A559BD]'}`} />
              <span>Resend</span>
              <span className="text-gray-500">•</span>
              <span className={`w-2 h-2 rounded-full ${statusInfo?.isBlobConfigured ? 'bg-[#95EA00]' : 'bg-purple-400'}`} />
              <span>Blob</span>
            </div>
            <div
              className={`p-1 rounded text-gray-400 transition-transform duration-200 ${
                openSections.infrastructure ? 'rotate-180 text-white' : ''
              }`}
            >
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </button>

        {openSections.infrastructure && (
          <div className="p-5 sm:p-6 border-t border-[#383838] bg-[#242424]/60">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Neon Database */}
              <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl p-4 shadow-sm">
                <div className="flex items-center space-x-2 text-white font-semibold text-xs mb-1">
                  <Database className={`w-4 h-4 ${statusInfo?.isNeonConfigured ? 'text-[#95EA00]' : 'text-amber-400'}`} />
                  <span>Neon PostgreSQL Database</span>
                </div>
                <p className="text-xs text-gray-300 mb-2">
                  {statusInfo?.isNeonConfigured
                    ? 'Connected & actively persisting via Drizzle ORM.'
                    : 'DATABASE_URL not detected. Running in preview memory mode.'}
                </p>
                <div className="text-[11px] font-mono bg-[#1e1e1e] border border-[#444444] p-1.5 rounded text-gray-300 truncate">
                  {statusInfo?.isNeonConfigured ? 'Live Neon Instance Connected' : 'Preview Mode (Local Memory)'}
                </div>
              </div>

              {/* Resend Email */}
              <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl p-4 shadow-sm">
                <div className="flex items-center space-x-2 text-white font-semibold text-xs mb-1">
                  <Mail className={`w-4 h-4 ${statusInfo?.isResendConfigured ? 'text-[#95EA00]' : 'text-[#A559BD]'}`} />
                  <span>Resend Email API</span>
                </div>
                <p className="text-xs text-gray-300 mb-2">
                  {statusInfo?.isResendConfigured
                    ? 'Live Resend API key active for office notifications.'
                    : 'RESEND_API_KEY not configured. Dispatches are safely simulated in preview.'}
                </p>
                <div className="text-[11px] font-mono bg-[#1e1e1e] border border-[#444444] p-1.5 rounded text-gray-300 truncate">
                  {statusInfo?.isResendConfigured ? 'Resend Live Active' : 'Simulation Mode'}
                </div>
              </div>

              {/* Vercel Blob */}
              <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl p-4 shadow-sm">
                <div className="flex items-center space-x-2 text-white font-semibold text-xs mb-1">
                  <Cloud className={`w-4 h-4 ${statusInfo?.isBlobConfigured ? 'text-[#95EA00]' : 'text-purple-400'}`} />
                  <span>Private Vercel Blob Storage</span>
                </div>
                <p className="text-xs text-gray-300 mb-2">
                  {statusInfo?.isBlobConfigured
                    ? 'Private photo storage connected.'
                    : 'BLOB_READ_WRITE_TOKEN not set. Secure simulated blob storage active.'}
                </p>
                <div className="text-[11px] font-mono bg-[#1e1e1e] border border-[#444444] p-1.5 rounded text-gray-300 truncate">
                  {statusInfo?.isBlobConfigured ? 'Vercel Blob Active' : 'Simulated Private Storage'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==================================================== */}
      {/* SECTION 2: Administrator & Approving Manager Logins */}
      {/* ==================================================== */}
      <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-sm overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => toggleSection('userLogins')}
          className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-[#343434] transition-colors focus:outline-none"
          aria-expanded={openSections.userLogins}
        >
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-[#A559BD]/20 border border-[#A559BD]/40 flex items-center justify-center text-[#d8a3e8] flex-shrink-0">
              <KeyRound className="w-4 h-4 text-[#95EA00]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white">Administrator & Approving Manager Logins</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-950/70 border border-purple-800 text-purple-200">
                  Role & Password Management
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Manage login accounts, salted password credentials, and roles (Administrator & Approving Manager)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <span className="hidden sm:inline-block text-[11px] text-gray-300 bg-[#1e1e1e] border border-[#444444] px-2 py-0.5 rounded">
              Salted Scrypt Hashing
            </span>
            <div
              className={`p-1 rounded text-gray-400 transition-transform duration-200 ${
                openSections.userLogins ? 'rotate-180 text-white' : ''
              }`}
            >
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </button>

        {openSections.userLogins && (
          <div className="p-5 sm:p-6 border-t border-[#383838]">
            <AdminUsersManager adminUser={adminUser} embedded />
          </div>
        )}
      </div>

      {/* ==================================================== */}
      {/* SECTION 3: Notification Recipient Address          */}
      {/* ==================================================== */}
      <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-sm overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => toggleSection('recipientEmail')}
          className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-[#343434] transition-colors focus:outline-none"
          aria-expanded={openSections.recipientEmail}
        >
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-[#95EA00]/15 border border-[#95EA00]/30 flex items-center justify-center text-[#95EA00] flex-shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white">Manager Notification Recipient Address</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#1e1e1e] border border-[#444444] font-mono text-[#95EA00]">
                  {recipientEmail || 'caleb@discountforkliftphoenix.com'}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Destination email for immediate office alerts when a sales rep submits a new spiff claim
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div
              className={`p-1 rounded text-gray-400 transition-transform duration-200 ${
                openSections.recipientEmail ? 'rotate-180 text-white' : ''
              }`}
            >
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </button>

        {openSections.recipientEmail && (
          <div className="p-5 sm:p-6 border-t border-[#383838] space-y-4">
            <p className="text-xs text-gray-300">
              The primary manager email address that receives instant notifications whenever a sales representative submits a spiff request.
            </p>

            <form onSubmit={handleSaveEmail} className="max-w-xl space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1.5">
                  Choose Recipient / Routing Mode:
                </label>
                <select
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'dallas_approver') {
                      setRecipientEmail('dallas.manager@discountforkliftphoenix.com');
                    } else if (val === 'phoenix_approver') {
                      setRecipientEmail('marcus.vance@discountforkliftphoenix.com');
                    } else if (val === 'dallas_gm') {
                      setRecipientEmail('carlos.morales@discountforkliftphoenix.com');
                    } else if (val === 'phoenix_gm') {
                      setRecipientEmail('sarah.connor@discountforkliftphoenix.com');
                    } else if (val === 'corporate_admin') {
                      setRecipientEmail('caleb@discountforkliftphoenix.com');
                    }
                  }}
                  className="w-full bg-[#1e1e1e] border border-[#555555] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                >
                  <option value="branch_approver">
                    Branch Approving Manager (Auto-routed: Dallas Rep ➔ Dallas Approving Manager, Phoenix ➔ Phoenix)
                  </option>
                  <option value="dallas_approver">
                    Dallas Approving Manager (Alex Rivera — dallas.manager@discountforkliftphoenix.com)
                  </option>
                  <option value="phoenix_approver">
                    Phoenix Approving Manager (Marcus Vance — marcus.vance@discountforkliftphoenix.com)
                  </option>
                  <option value="dallas_gm">
                    Dallas General Manager (Carlos Morales — carlos.morales@discountforkliftphoenix.com)
                  </option>
                  <option value="phoenix_gm">
                    Phoenix General Manager (Sarah Connor — sarah.connor@discountforkliftphoenix.com)
                  </option>
                  <option value="corporate_admin">
                    Corporate Office Administrator (caleb@discountforkliftphoenix.com)
                  </option>
                  <option value="custom">
                    Custom Email Address
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1">
                  Manager Notification Email
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#444444] rounded-lg px-3 py-2 text-xs text-white font-mono focus:bg-[#181818] focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                  required
                />
              </div>

              <div className="flex items-center space-x-3 pt-1">
                <button
                  type="submit"
                  disabled={isSavingSettings}
                  className="px-4 py-2 bg-[#A559BD] hover:bg-[#934da9] text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
                >
                  {isSavingSettings ? 'Saving...' : 'Update Recipient Email'}
                </button>
                {saveSuccess && (
                  <span className="flex items-center space-x-1 text-xs text-[#95EA00] font-semibold animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Recipient address updated successfully</span>
                  </span>
                )}
              </div>
            </form>

            {/* Workflow Info Box */}
            <div className="bg-[#1e1e1e] border border-[#383838] rounded-lg p-3 text-xs text-gray-300 space-y-1">
              <span className="font-semibold text-white text-[11px] uppercase tracking-wide flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-[#95EA00]" />
                <span>Multi-Step Notification Routing Policy:</span>
              </span>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                When a sales rep (e.g. from Dallas) submits a spiff claim, the first notification is routed to the <strong>Approving Manager</strong>. Once approved or denied, completion emails are automatically dispatched to the <strong>sales rep</strong>, the <strong>location general manager</strong>, and <strong>accounting</strong>.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ==================================================== */}
      {/* SECTION 4: Editable Email Templates                 */}
      {/* ==================================================== */}
      <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-sm overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => toggleSection('templates')}
          className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-[#343434] transition-colors focus:outline-none"
          aria-expanded={openSections.templates}
        >
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-[#A559BD]/20 border border-[#A559BD]/40 flex items-center justify-center text-[#d8a3e8] flex-shrink-0">
              <Sparkles className="w-4 h-4 text-[#A559BD]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white">Editable Email Templates</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#95EA00]/15 text-[#95EA00] border border-[#95EA00]/30">
                  Resend Powered
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Customize subjects, HTML bodies, dynamic placeholders, test emails, and audit version history
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <span className="hidden sm:inline-block text-[11px] text-purple-200 bg-purple-950/60 border border-purple-800 px-2 py-0.5 rounded">
              3 Templates Active
            </span>
            <div
              className={`p-1 rounded text-gray-400 transition-transform duration-200 ${
                openSections.templates ? 'rotate-180 text-white' : ''
              }`}
            >
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </button>

        {openSections.templates && (
          <div className="p-5 sm:p-6 border-t border-[#383838]">
            <AdminEmailTemplatesManager adminUser={adminUser} embedded />
          </div>
        )}
      </div>

      {/* ==================================================== */}
      {/* SECTION 5: Email Notification Dispatch Log         */}
      {/* ==================================================== */}
      <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-sm overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => toggleSection('dispatchLog')}
          className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-[#343434] transition-colors focus:outline-none"
          aria-expanded={openSections.dispatchLog}
        >
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-[#95EA00]/15 border border-[#95EA00]/30 flex items-center justify-center text-[#95EA00] flex-shrink-0">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white">Email Notification Dispatch Log</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#1e1e1e] border border-[#444444] text-gray-300">
                  {emailJobs.length} {emailJobs.length === 1 ? 'Job' : 'Jobs'} Recorded
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Persistent dispatch queue with idempotency keys, delivery status, and retry controls
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                loadData();
              }}
              className="p-1.5 text-gray-400 hover:text-white rounded border border-[#444444] bg-[#1e1e1e] hover:bg-[#383838] transition-colors"
              title="Refresh dispatch log"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <div
              className={`p-1 rounded text-gray-400 transition-transform duration-200 ${
                openSections.dispatchLog ? 'rotate-180 text-white' : ''
              }`}
            >
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </button>

        {openSections.dispatchLog && (
          <div className="p-5 sm:p-6 border-t border-[#383838]">
            <p className="text-xs text-gray-300 mb-4">
              Persistent jobs created during spiff submission transactions. Failed dispatches can be retried without duplicate submissions.
            </p>

            {emailJobs.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs bg-[#1e1e1e] rounded-lg border border-dashed border-[#444444]">
                No notification jobs recorded yet. Submit a spiff from the rep form to generate a notification job.
              </div>
            ) : (
              <div className="border border-[#444444] rounded-lg overflow-x-auto bg-[#242424]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#1e1e1e] border-b border-[#444444] text-gray-300 uppercase text-[10px] font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Request ID</th>
                      <th className="py-2.5 px-3">Recipient</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Attempts</th>
                      <th className="py-2.5 px-3">Schedule / Last Attempt</th>
                      <th className="py-2.5 px-3">Error / Provider ID</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#383838] text-gray-200">
                    {emailJobs.map((job) => (
                      <tr key={job.id} className="hover:bg-[#353535] transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-[#95EA00] whitespace-nowrap">
                          {job.submissionId}
                        </td>
                        <td className="py-2.5 px-3 truncate max-w-[150px]">{job.recipientEmail}</td>
                        <td className="py-2.5 px-3 whitespace-nowrap">{getStatusBadge(job.status)}</td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">{job.attemptCount} / 5</td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-gray-400 text-[11px]">
                          {job.nextRetryAt && (job.status === 'failed' || job.status === 'queued') && job.attemptCount < 5 ? (
                            <span className="text-amber-300 font-medium">
                              Retry: {formatPhoenixDateTime(job.nextRetryAt)}
                            </span>
                          ) : (
                            formatPhoenixDateTime(job.lastAttemptAt || job.createdAt)
                          )}
                        </td>
                        <td className="py-2.5 px-3 max-w-[200px] truncate text-gray-400 text-[11px]" title={job.errorMessage || job.providerMessageId || ''}>
                          {job.errorMessage ? (
                            <span className="text-rose-300 font-medium">{job.errorMessage}</span>
                          ) : job.providerMessageId ? (
                            <span className="font-mono text-gray-300">ID: {job.providerMessageId}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          {job.status === 'processing' ? (
                            <span className="text-[10px] text-blue-300 uppercase tracking-wider font-bold">Lease Active</span>
                          ) : (job.status === 'failed' || (job.status === 'queued' && job.attemptCount > 0)) && job.attemptCount < 5 ? (
                            <button
                              type="button"
                              onClick={() => handleRetryJob(job.id)}
                              disabled={retryingJobId === job.id}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-purple-200 bg-[#A559BD]/20 hover:bg-[#A559BD]/30 border border-[#A559BD]/50 rounded transition-colors"
                            >
                              <RefreshCw className={`w-3 h-3 ${retryingJobId === job.id ? 'animate-spin' : ''}`} />
                              <span>Retry</span>
                            </button>
                          ) : job.attemptCount >= 5 ? (
                            <span className="text-[10px] text-gray-500 font-semibold uppercase">Max Attempts (5/5)</span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ==================================================== */}
      {/* SECTION 6: Vercel Cron & Scheduled Endpoints        */}
      {/* ==================================================== */}
      <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-sm overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => toggleSection('cronEndpoints')}
          className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-[#343434] transition-colors focus:outline-none"
          aria-expanded={openSections.cronEndpoints}
        >
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-[#A559BD]/20 border border-[#A559BD]/40 flex items-center justify-center text-[#d8a3e8] flex-shrink-0">
              <Clock className="w-4 h-4 text-[#95EA00]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white">Vercel Cron & Scheduled Endpoints</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#1e1e1e] border border-[#444444] text-[#95EA00]">
                  Automated Jobs
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Automated retries of queued notifications and cleanup of unattached storage uploads
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <span className="hidden sm:inline-block text-[11px] text-gray-300 bg-[#1e1e1e] border border-[#444444] px-2 py-0.5 rounded font-mono">
              vercel.json
            </span>
            <div
              className={`p-1 rounded text-gray-400 transition-transform duration-200 ${
                openSections.cronEndpoints ? 'rotate-180 text-white' : ''
              }`}
            >
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </button>

        {openSections.cronEndpoints && (
          <div className="p-5 sm:p-6 border-t border-[#383838] bg-[#242424]/60 text-xs text-gray-300 space-y-3">
            <p>
              In production on Vercel, the following endpoints are configured via <code className="bg-[#1e1e1e] border border-[#444444] px-1 py-0.5 rounded font-mono text-[10px] text-gray-200">vercel.json</code> to automatically run serverless maintenance jobs:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-gray-300">
              <li>
                <div className="space-y-0.5">
                  <div>
                    <code className="bg-[#1e1e1e] border border-[#444444] px-1.5 py-0.5 rounded font-mono text-[#95EA00]">
                      /api/cron/retry-notifications
                    </code>
                    <span className="ml-2 text-gray-400">— Every 10 minutes</span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Retries failed email notifications in Neon using database idempotency keys and immutable snapshots.
                  </p>
                </div>
              </li>
              <li>
                <div className="space-y-0.5">
                  <div>
                    <code className="bg-[#1e1e1e] border border-[#444444] px-1.5 py-0.5 rounded font-mono text-[#95EA00]">
                      /api/cron/cleanup-uploads
                    </code>
                    <span className="ml-2 text-gray-400">— Every 2 hours</span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Automatically cleans up abandoned unlinked photos older than 2 hours from private Vercel Blob storage.
                  </p>
                </div>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
