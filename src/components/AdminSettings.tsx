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
  ChevronRight,
  Eye,
  Send,
} from 'lucide-react';
import { EmailJob } from '../lib/repository';
import { getEmailTemplateDisplayName } from '../lib/emailTemplates';
import { formatPhoenixDateTime } from '../lib/timezone';
import { AdminUsersManager } from './AdminUsersManager';
import { AdminEmailTemplatesManager } from './AdminEmailTemplatesManager';
import { adminFetch } from '../lib/api';

interface AdminSettingsProps {
  adminUser: string;
  adminRole: string;
}

interface WeeklyReportPreview {
  weekStart: string;
  weekEnd: string;
  subject: string;
  html: string;
  csv: string;
  filename: string;
  submissionCount: number;
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({ adminUser, adminRole }) => {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [contacts, setContacts] = useState<
    Array<{ id: string; name: string; email: string; role: string; branch?: string | null }>
  >([]);
  const [emailJobs, setEmailJobs] = useState<EmailJob[]>([]);
  const [statusInfo, setStatusInfo] = useState<any>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [templateFilter, setTemplateFilter] = useState('all');
  const [expandedJobIds, setExpandedJobIds] = useState<Record<string, boolean>>({});
  const [weeklyReportPreview, setWeeklyReportPreview] = useState<WeeklyReportPreview | null>(null);
  const [weeklyReportTestEmail, setWeeklyReportTestEmail] = useState('');
  const [weeklyReportMessage, setWeeklyReportMessage] = useState<string | null>(null);
  const [weeklyReportMessageIsError, setWeeklyReportMessageIsError] = useState(false);
  const [isPreviewingWeeklyReport, setIsPreviewingWeeklyReport] = useState(false);
  const [isSendingWeeklyReportTest, setIsSendingWeeklyReportTest] = useState(false);

  const getSavedTemplateLabel = (job: EmailJob) => {
    if (!job.templateId || typeof job.templateVersion !== 'number') {
      return 'Unknown / Legacy';
    }
    const name = getEmailTemplateDisplayName(job.templateId);
    return name ? `${name} — v${job.templateVersion}` : 'Unknown / Legacy';
  };

  const visibleEmailJobs = emailJobs.filter((job) => {
    if (templateFilter === 'all') return true;
    if (templateFilter === 'unknown') {
      return getSavedTemplateLabel(job) === 'Unknown / Legacy';
    }
    return job.templateId === templateFilter && typeof job.templateVersion === 'number';
  });

  // Collapsible sections state
  // Default: sections open for immediate access, fully collapsible on demand
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    infrastructure: true,
    userLogins: true,
    recipientEmail: true,
    weeklyReport: true,
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
      weeklyReport: true,
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
      weeklyReport: false,
      templates: false,
      dispatchLog: false,
      cronEndpoints: false,
    });
  };

  const allExpanded = Object.values(openSections).every(Boolean);

  const loadData = async () => {
    try {
      const [settingsRes, jobsRes, statusRes, contactsRes] = await Promise.all([
        adminFetch('/api/admin/settings').then((r) => r.json()),
        adminFetch('/api/admin/email-jobs').then((r) => r.json()),
        adminFetch('/api/admin/status').then((r) => r.json()),
        adminFetch('/api/admin/active-notification-contacts')
          .then((r) => r.json())
          .catch(() => ({ contacts: [] })),
      ]);

      const activeApprovers = (contactsRes.contacts || []).filter(
        (contact: { role: string }) => contact.role === 'Approving Manager'
      );
      const savedRecipient = settingsRes.notificationRecipientEmail || '';
      setRecipientEmail(
        activeApprovers.some(
          (contact: { email: string }) => contact.email.toLowerCase() === savedRecipient.toLowerCase()
        )
          ? savedRecipient
          : ''
      );
      setContacts(activeApprovers);
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

  const handlePreviewWeeklyReport = async () => {
    setIsPreviewingWeeklyReport(true);
    setWeeklyReportMessage(null);
    try {
      const res = await adminFetch('/api/admin/weekly-spiff-report/preview');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to preview the weekly report.');
      setWeeklyReportPreview(data);
    } catch (err) {
      setWeeklyReportMessage(err instanceof Error ? err.message : 'Failed to preview the weekly report.');
      setWeeklyReportMessageIsError(true);
    } finally {
      setIsPreviewingWeeklyReport(false);
    }
  };

  const handleSendWeeklyReportTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingWeeklyReportTest(true);
    setWeeklyReportMessage(null);
    try {
      const res = await adminFetch('/api/admin/weekly-spiff-report/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testEmail: weeklyReportTestEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send the test report.');
      }
      setWeeklyReportMessage(
        `TEST email accepted by the configured provider and recorded for ${weeklyReportTestEmail.trim()}.`
      );
      setWeeklyReportMessageIsError(false);
    } catch (err) {
      setWeeklyReportMessage(err instanceof Error ? err.message : 'Failed to send the test report.');
      setWeeklyReportMessageIsError(true);
    } finally {
      setIsSendingWeeklyReportTest(false);
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
            accepted by provider (not confirmed delivered)
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
      case 'cancelled':
        return (
          <span className="text-gray-300 bg-gray-800 border border-gray-600 px-2 py-0.5 rounded text-[11px] font-semibold">
            cancelled
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
            Configure email delivery, manage administrator & approving manager logins, customize email templates, and monitor job queues.
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
                PostgreSQL database, configured email dispatch, and private Vercel Blob storage states
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="hidden md:flex items-center space-x-1.5 text-[11px] font-mono text-gray-300">
              <span className={`w-2 h-2 rounded-full ${statusInfo?.isNeonConfigured ? 'bg-[#95EA00]' : 'bg-amber-400'}`} />
              <span>Neon</span>
              <span className="text-gray-500">•</span>
              <span className={`w-2 h-2 rounded-full ${statusInfo?.isEmailConfigured ? 'bg-[#95EA00]' : 'bg-[#A559BD]'}`} />
              <span>
                {statusInfo?.emailProvider === 'gmail'
                  ? 'Gmail'
                  : statusInfo?.emailProvider === 'outlook'
                    ? 'Outlook'
                    : statusInfo?.emailProvider === 'resend'
                      ? 'Resend'
                      : 'Email'}
              </span>
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

              {/* Email Delivery */}
              <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl p-4 shadow-sm">
                <div className="flex items-center space-x-2 text-white font-semibold text-xs mb-1">
                  <Mail className={`w-4 h-4 ${statusInfo?.isEmailConfigured ? 'text-[#95EA00]' : 'text-[#A559BD]'}`} />
                  <span>Email Delivery</span>
                </div>
                <p className="text-xs text-gray-300 mb-2">
                  {statusInfo?.emailProvider === 'gmail'
                    ? 'Gmail SMTP is active for app notifications.'
                    : statusInfo?.emailProvider === 'outlook'
                      ? 'Outlook SMTP is active for app notifications.'
                      : statusInfo?.emailProvider === 'resend'
                        ? 'Resend is active for app notifications.'
                        : statusInfo?.hasGmailConfiguration
                          ? 'Gmail SMTP setup is incomplete. Configure both Gmail environment variables.'
                          : statusInfo?.hasOutlookConfiguration
                            ? 'Outlook SMTP setup is incomplete. Configure both Outlook environment variables.'
                            : 'No email provider configured. Notifications are simulated in preview.'}
                </p>
                <div className="text-[11px] font-mono bg-[#1e1e1e] border border-[#444444] p-1.5 rounded text-gray-300 truncate">
                  {statusInfo?.emailProvider === 'gmail'
                    ? 'Gmail SMTP Active'
                    : statusInfo?.emailProvider === 'outlook'
                      ? 'Outlook SMTP Active'
                      : statusInfo?.emailProvider === 'resend'
                        ? 'Resend Live Active'
                        : 'Simulation Mode'}
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
                  {recipientEmail || 'No active contact selected'}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Active manager used as backup for branch-based submission alerts
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
              Choose the active Approving Manager used when no branch-specific manager contact is found. Submission alerts are otherwise routed to the matching branch.
            </p>

            <form onSubmit={handleSaveEmail} className="max-w-xl space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-200 mb-1.5">
                  Choose an Active Contact:
                </label>
                <select
                  value={contacts.some((contact) => contact.email.toLowerCase() === recipientEmail.toLowerCase())
                    ? recipientEmail
                    : ''}
                  onChange={(e) => {
                    setRecipientEmail(e.target.value);
                  }}
                  className="w-full bg-[#1e1e1e] border border-[#555555] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
                >
                  <option value="">Select an active Approving Manager</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.email}>
                      {contact.name} — {contact.role}{contact.branch ? ` (${contact.branch})` : ''}
                    </option>
                  ))}
                </select>
                {contacts.length === 0 && (
                  <p className="mt-2 text-xs text-amber-200">
                    No active Approving Manager contacts are configured in Neon. Add an active manager in Notifications &amp; Contacts to make one selectable here.
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-3 pt-1">
                <button
                  type="submit"
                  disabled={isSavingSettings || !recipientEmail}
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
                Submission alerts are sent to the active Approving Manager for the rep’s branch, using the selected active manager only when no branch match is configured. Decision results follow the recipient rules shown in the Email Templates section.
              </p>
            </div>
          </div>
        )}
      </div>

      {adminRole === 'Administrator' && (
        <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-sm overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => toggleSection('weeklyReport')}
            className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-[#343434] transition-colors focus:outline-none"
            aria-expanded={openSections.weeklyReport}
          >
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-[#95EA00]/15 border border-[#95EA00]/30 flex items-center justify-center text-[#95EA00] flex-shrink-0">
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Weekly Spiff Report</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Preview the previous Phoenix week or send a clearly labeled test report to a chosen address.
                </p>
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-gray-400 transition-transform ${
                openSections.weeklyReport ? 'rotate-180 text-white' : ''
              }`}
            />
          </button>

          {openSections.weeklyReport && (
            <div className="p-5 sm:p-6 border-t border-[#383838] space-y-5">
              <p className="text-xs text-gray-300">
                Preview does not send email. Test delivery goes only to the address entered below, is prefixed with TEST, and does not mark the scheduled report as sent.
              </p>
              <button
                type="button"
                onClick={handlePreviewWeeklyReport}
                disabled={isPreviewingWeeklyReport}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#1e1e1e] hover:bg-[#383838] border border-[#555555] text-white text-xs font-bold rounded-lg disabled:opacity-50"
              >
                <Eye className="w-4 h-4" />
                {isPreviewingWeeklyReport ? 'Loading Preview...' : 'Preview Report'}
              </button>

              {weeklyReportPreview && (
                <div className="space-y-3 rounded-lg border border-[#444444] bg-[#242424] p-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-300">
                      Reporting period: {weeklyReportPreview.weekStart} through {weeklyReportPreview.weekEnd} (America/Phoenix)
                    </p>
                    <p className="mt-1 text-sm font-bold text-white">{weeklyReportPreview.subject}</p>
                    <p className="text-xs text-gray-400">
                      {weeklyReportPreview.submissionCount} submissions · Attachment: {weeklyReportPreview.filename}
                    </p>
                  </div>
                  <iframe
                    title="Weekly Spiff report email preview"
                    sandbox=""
                    srcDoc={weeklyReportPreview.html}
                    className="w-full min-h-36 rounded border border-[#444444] bg-white"
                  />
                  <label className="block text-xs font-semibold text-gray-300">
                    CSV attachment preview
                    <textarea
                      readOnly
                      value={weeklyReportPreview.csv}
                      rows={10}
                      className="mt-1.5 w-full resize-y rounded border border-[#444444] bg-[#1e1e1e] p-3 font-mono text-[11px] text-gray-200"
                    />
                  </label>
                </div>
              )}

              <form onSubmit={handleSendWeeklyReportTest} className="max-w-xl space-y-3">
                <label className="block text-xs font-semibold text-gray-200">
                  Test recipient email
                  <input
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="email"
                    value={weeklyReportTestEmail}
                    onChange={(event) => setWeeklyReportTestEmail(event.target.value)}
                    placeholder="you@example.com"
                    className="mt-1.5 w-full rounded-lg border border-[#555555] bg-[#1e1e1e] px-3 py-2 text-sm text-white"
                  />
                </label>
                <button
                  type="submit"
                  disabled={isSendingWeeklyReportTest || !weeklyReportTestEmail.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#A559BD] hover:bg-[#934da9] text-white text-xs font-bold rounded-lg disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {isSendingWeeklyReportTest ? 'Sending TEST Email...' : 'Send TEST Email'}
                </button>
              </form>

              {weeklyReportMessage && (
                <p
                  role="status"
                  className={`text-xs ${weeklyReportMessageIsError ? 'text-rose-300' : 'text-[#95EA00]'}`}
                >
                  {weeklyReportMessage}
                </p>
              )}
            </div>
          )}
        </div>
      )}

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
                  Email Provider
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

            <div className="mb-4 flex flex-wrap items-center gap-2">
              <label htmlFor="email-job-template-filter" className="text-xs font-semibold text-gray-300">
                Filter by template
              </label>
              <select
                id="email-job-template-filter"
                value={templateFilter}
                onChange={(event) => setTemplateFilter(event.target.value)}
                className="rounded border border-[#444444] bg-[#1e1e1e] px-3 py-2 text-xs text-white focus:border-[#95EA00] focus:outline-none"
              >
                <option value="all">All templates</option>
                <option value="new_submission">New Spiff Submission</option>
                <option value="spiff_approved">Spiff Approved</option>
                <option value="spiff_denied">Spiff Denied</option>
                <option value="spiff_approved_paid_receipt">Spiff Approved Paid Receipt</option>
                <option value="unknown">Unknown / Legacy</option>
              </select>
              <span className="text-[11px] text-gray-500">
                Showing {visibleEmailJobs.length} of {emailJobs.length} jobs
              </span>
            </div>

            {emailJobs.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs bg-[#1e1e1e] rounded-lg border border-dashed border-[#444444]">
                No notification jobs recorded yet. Submit a spiff from the rep form to generate a notification job.
              </div>
            ) : visibleEmailJobs.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs bg-[#1e1e1e] rounded-lg border border-dashed border-[#444444]">
                No notification jobs match this template.
              </div>
            ) : (
              <div className="border border-[#444444] rounded-lg overflow-x-auto bg-[#242424]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#1e1e1e] border-b border-[#444444] text-gray-300 uppercase text-[10px] font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Request ID</th>
                      <th className="py-2.5 px-3">Recipient</th>
                      <th className="py-2.5 px-3">Template</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Attempts</th>
                      <th className="py-2.5 px-3">Schedule / Last Attempt</th>
                      <th className="py-2.5 px-3">Error / Provider ID</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#383838] text-gray-200">
                    {visibleEmailJobs.map((job) => (
                      <React.Fragment key={job.id}>
                        <tr className="hover:bg-[#353535] transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-[#95EA00] whitespace-nowrap">
                            {job.submissionId}
                          </td>
                          <td className="py-2.5 px-3 truncate max-w-[150px]">{job.recipientEmail}</td>
                          <td className="py-2.5 px-3 whitespace-nowrap">{getSavedTemplateLabel(job)}</td>
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
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedJobIds((previous) => ({
                                  ...previous,
                                  [job.id]: !previous[job.id],
                                }))
                              }
                              aria-expanded={Boolean(expandedJobIds[job.id])}
                              className="ml-2 inline-flex items-center gap-1 rounded border border-[#444444] px-2 py-1 text-[10px] text-gray-300 hover:text-white"
                            >
                              <ChevronRight
                                className={`h-3 w-3 transition-transform ${
                                  expandedJobIds[job.id] ? 'rotate-90' : ''
                                }`}
                              />
                              Details
                            </button>
                          </td>
                        </tr>
                        {expandedJobIds[job.id] && (
                          <tr className="bg-[#1e1e1e]">
                            <td colSpan={8} className="px-4 py-3">
                              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <div>
                                  <dt className="text-[10px] uppercase text-gray-500">Template ID</dt>
                                  <dd className="mt-1 font-mono text-gray-200">{job.templateId || 'Unknown / Legacy'}</dd>
                                </div>
                                <div>
                                  <dt className="text-[10px] uppercase text-gray-500">Template version</dt>
                                  <dd className="mt-1 text-gray-200">
                                    {typeof job.templateVersion === 'number'
                                      ? `v${job.templateVersion}`
                                      : 'Unknown / Legacy'}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-[10px] uppercase text-gray-500">Recipient</dt>
                                  <dd className="mt-1 break-all text-gray-200">{job.recipientEmail}</dd>
                                </div>
                                <div>
                                  <dt className="text-[10px] uppercase text-gray-500">Request ID</dt>
                                  <dd className="mt-1 font-mono text-gray-200">{job.submissionId}</dd>
                                </div>
                                <div>
                                  <dt className="text-[10px] uppercase text-gray-500">Status</dt>
                                  <dd className="mt-1 text-gray-200">{job.status}</dd>
                                </div>
                                <div>
                                  <dt className="text-[10px] uppercase text-gray-500">Attempt count</dt>
                                  <dd className="mt-1 text-gray-200">{job.attemptCount} / 5</dd>
                                </div>
                                <div>
                                  <dt className="text-[10px] uppercase text-gray-500">Created</dt>
                                  <dd className="mt-1 text-gray-200">{formatPhoenixDateTime(job.createdAt)}</dd>
                                </div>
                                <div>
                                  <dt className="text-[10px] uppercase text-gray-500">Last attempt</dt>
                                  <dd className="mt-1 text-gray-200">
                                    {job.lastAttemptAt ? formatPhoenixDateTime(job.lastAttemptAt) : '—'}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-[10px] uppercase text-gray-500">Delivered / accepted</dt>
                                  <dd className="mt-1 text-gray-200">
                                    {job.deliveredAt ? formatPhoenixDateTime(job.deliveredAt) : '—'}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-[10px] uppercase text-gray-500">Next retry</dt>
                                  <dd className="mt-1 text-gray-200">
                                    {job.nextRetryAt ? formatPhoenixDateTime(job.nextRetryAt) : '—'}
                                  </dd>
                                </div>
                                <div className="sm:col-span-2">
                                  <dt className="text-[10px] uppercase text-gray-500">Delivery error</dt>
                                  <dd className="mt-1 break-words text-rose-300">{job.errorMessage || '—'}</dd>
                                </div>
                                <div className="sm:col-span-2">
                                  <dt className="text-[10px] uppercase text-gray-500">
                                    Gmail accepted / rejected recipients
                                  </dt>
                                  <dd className="mt-1 break-words font-mono text-gray-300">
                                    {job.providerResponse || 'No recipient-level provider response recorded'}
                                  </dd>
                                </div>
                              </dl>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
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
