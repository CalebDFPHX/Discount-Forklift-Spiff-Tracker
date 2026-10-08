import React, { useState, useEffect, useRef } from 'react';
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Send,
  Eye,
  Code,
  History,
  Info,
  ChevronDown,
  Sparkles,
  Shield,
  Clock,
  User,
  Check,
  Copy,
  Users,
  Building2,
  ArrowRight,
} from 'lucide-react';
import {
  EmailTemplate,
  EmailTemplateVersion,
  SUPPORTED_PLACEHOLDERS,
  SAMPLE_TEMPLATE_DATA,
  PlaceholderDef,
  renderEmailTemplate,
} from '../lib/emailTemplates';
import { adminFetch } from '../lib/api';
import { formatPhoenixDateTime } from '../lib/timezone';

interface AdminEmailTemplatesManagerProps {
  adminUser: string;
  embedded?: boolean;
}

export const AdminEmailTemplatesManager: React.FC<AdminEmailTemplatesManagerProps> = ({ adminUser, embedded = false }) => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('new_submission');
  const [subject, setSubject] = useState<string>('');
  const [bodyHtml, setBodyHtml] = useState<string>('');
  const [changeSummary, setChangeSummary] = useState<string>('');
  const [versions, setVersions] = useState<EmailTemplateVersion[]>([]);
  const [showVersions, setShowVersions] = useState<boolean>(false);
  const [previewMode, setPreviewMode] = useState<'editor' | 'preview'>('editor');
  const [previewRole, setPreviewRole] = useState<'admin' | 'rep'>('admin');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [testEmail, setTestEmail] = useState<string>('caleb@discountforkliftphoenix.com');
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    status: string;
    message: string;
    providerMessageId?: string;
  } | null>(null);

  const [isInsertMenuOpen, setIsInsertMenuOpen] = useState<boolean>(false);
  const [copiedPlaceholder, setCopiedPlaceholder] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Recipient routing selection per template
  const [routingPreferences, setRoutingPreferences] = useState<Record<string, string>>({
    new_submission: 'approving_manager_branch',
    spiff_approved: 'rep_gm_accounting',
    spiff_denied: 'rep_gm_accounting',
  });
  const [contacts, setContacts] = useState<Array<{ id: string; name: string; email: string; role: string; branch?: string }>>([]);
  const [selectedTestContactKey, setSelectedTestContactKey] = useState<string>('dallas_approver');

  // Load all templates and contacts
  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const [tplRes, contactsRes] = await Promise.all([
        adminFetch('/api/admin/email-templates').then((r) => r.json()),
        adminFetch('/api/admin/contacts')
          .then((r) => r.json())
          .catch(() => ({ contacts: [] })),
      ]);

      if (contactsRes.contacts) {
        setContacts(contactsRes.contacts);
      }

      if (tplRes.templates) {
        setTemplates(tplRes.templates);
        const curr = tplRes.templates.find((t: EmailTemplate) => t.id === selectedTemplateId) || tplRes.templates[0];
        if (curr) {
          setSelectedTemplateId(curr.id);
          setSubject(curr.subject);
          setBodyHtml(curr.bodyHtml);
        }
      }
    } catch (err) {
      console.error('Failed to load email templates:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Load versions for selected template
  const loadVersions = async (templateId: string) => {
    try {
      const res = await adminFetch(`/api/admin/email-templates/${templateId}/versions`);
      const data = await res.json();
      if (res.ok && data.versions) {
        setVersions(data.versions);
      }
    } catch (err) {
      console.error('Failed to load template versions:', err);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [adminUser]);

  useEffect(() => {
    const curr = templates.find((t) => t.id === selectedTemplateId);
    if (curr) {
      setSubject(curr.subject);
      setBodyHtml(curr.bodyHtml);
      setChangeSummary('');
      setSaveError(null);
      setSaveSuccess(false);
      setTestResult(null);
      loadVersions(selectedTemplateId);
    }
  }, [selectedTemplateId]);

  const currentTemplate = templates.find((t) => t.id === selectedTemplateId);

  // Filter placeholders applicable to current template
  const applicablePlaceholders = SUPPORTED_PLACEHOLDERS.filter((p) =>
    p.applicableTemplates.includes(selectedTemplateId)
  );

  // Insert placeholder at cursor or append
  const handleInsertPlaceholder = (key: string) => {
    const token = `{{${key}}}`;
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newText = bodyHtml.substring(0, start) + token + bodyHtml.substring(end);
      setBodyHtml(newText);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + token.length, start + token.length);
      }, 50);
    } else {
      setBodyHtml((prev) => prev + token);
    }
    setIsInsertMenuOpen(false);
    setCopiedPlaceholder(key);
    setTimeout(() => setCopiedPlaceholder(null), 2000);
  };

  // Save new version
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const res = await adminFetch(`/api/admin/email-templates/${selectedTemplateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject,
          bodyHtml,
          changeSummary: changeSummary.trim() || undefined,
          expectedVersion: currentTemplate?.version,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || 'Failed to save email template revision.');
      } else {
        setSaveSuccess(true);
        setChangeSummary('');
        await loadTemplates();
        await loadVersions(selectedTemplateId);
        setTimeout(() => setSaveSuccess(false), 4000);
      }
    } catch (err: any) {
      setSaveError(err.message || 'Network error saving template.');
    } finally {
      setIsSaving(false);
    }
  };

  // Restore system defaults
  const handleRestoreDefaults = async () => {
    if (!window.confirm('Restore standard system default wording for this template? This will create a new version record.')) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await adminFetch(`/api/admin/email-templates/${selectedTemplateId}/restore-default`, {
        method: 'POST',
      });

      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || 'Failed to restore default template.');
      } else {
        setSubject(data.template.subject);
        setBodyHtml(data.template.bodyHtml);
        setSaveSuccess(true);
        await loadTemplates();
        await loadVersions(selectedTemplateId);
        setTimeout(() => setSaveSuccess(false), 4000);
      }
    } catch (err: any) {
      setSaveError(err.message || 'Error restoring default template.');
    } finally {
      setIsSaving(false);
    }
  };

  // Send Test Email
  const handleSendTestEmail = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      alert('Please enter a valid recipient email address for testing.');
      return;
    }

    setIsSendingTest(true);
    setTestResult(null);

    try {
      const res = await adminFetch(`/api/admin/email-templates/${selectedTemplateId}/test-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          testEmail: testEmail.trim(),
          subject,
          bodyHtml,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          status: data.status,
          message:
            data.status === 'simulated'
              ? 'Test email dispatched in local simulation mode (RESEND_API_KEY not configured in preview).'
              : `Dispatched via Resend API (Message ID: ${data.providerMessageId || 'accepted'}). Notice: Accepted by mail server; final mailbox delivery depends on recipient spam filters.`,
          providerMessageId: data.providerMessageId,
        });
      } else {
        setTestResult({
          success: false,
          status: 'failed',
          message: data.error || 'Failed to dispatch test email via Resend.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        status: 'failed',
        message: err.message || 'Error contacting test delivery endpoint.',
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  // Render Live Preview with sample data
  const renderPreview = () => {
    const sampleData = {
      ...SAMPLE_TEMPLATE_DATA,
      decision: selectedTemplateId === 'spiff_denied' ? 'Denied' : 'Approved',
    };
    const rendered = renderEmailTemplate(
      { subject, bodyHtml },
      sampleData,
      previewRole === 'admin'
    );
    return rendered;
  };

  const preview = renderPreview();

  return (
    <div className={embedded ? 'space-y-6' : 'bg-[#2d2d2d] border border-[#444444] rounded-xl p-6 shadow-sm space-y-6'}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#444444] pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <Mail className="w-5 h-5 text-[#95EA00]" />
            <h3 className="text-base font-bold text-white tracking-tight">
              Editable Email Templates
            </h3>
            <span className="bg-[#95EA00]/15 text-[#95EA00] border border-[#95EA00]/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
              Resend Powered
            </span>
          </div>
          <p className="text-xs text-gray-300 mt-1">
            Customize subjects and HTML message bodies for automated spiff notifications. Insert system placeholders, preview with sample data, and audit version history.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setShowVersions(!showVersions)}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#555] bg-[#1e1e1e] hover:bg-[#383838] text-gray-200 transition-colors"
          >
            <History className="w-3.5 h-3.5 text-[#A559BD]" />
            <span>Version History ({versions.length})</span>
          </button>
        </div>
      </div>

      {/* Template Tabs Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {templates.map((tpl) => {
          const isSelected = tpl.id === selectedTemplateId;
          return (
            <button
              key={tpl.id}
              onClick={() => setSelectedTemplateId(tpl.id)}
              className={`text-left p-3 rounded-lg border transition-all ${
                isSelected
                  ? 'bg-[#1e1e1e] border-[#95EA00] ring-1 ring-[#95EA00]/40'
                  : 'bg-[#242424] border-[#444444] hover:border-[#666666] text-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                  {tpl.name}
                </span>
                <span className="bg-[#333] text-gray-300 px-1.5 py-0.5 rounded text-[10px] font-mono">
                  v{tpl.version}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">
                {tpl.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Email Recipient Selection & Workflow Routing */}
      <div className="bg-[#1e1e1e] border border-[#444444] rounded-xl p-4 sm:p-5 shadow-inner space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#333333] pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#95EA00]/15 border border-[#95EA00]/30 flex items-center justify-center text-[#95EA00] shrink-0">
              <Users className="w-3.5 h-3.5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <span>Email Recipient Selection & Delivery Routing</span>
                <span className="text-[10px] normal-case bg-purple-950/70 text-purple-200 border border-purple-800 px-2 py-0.5 rounded font-mono">
                  Active Template: {currentTemplate?.name || selectedTemplateId}
                </span>
              </h4>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Choose the intended recipient for this email and view the automated workflow path.
              </p>
            </div>
          </div>
        </div>

        {/* Dropdown for Recipient Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-200">
            {selectedTemplateId === 'new_submission'
              ? 'Choose Recipient for Initial Spiff Submission Alert:'
              : selectedTemplateId === 'spiff_approved'
              ? 'Choose Recipients for Spiff Approved Result:'
              : 'Choose Recipients for Spiff Denied Result:'}
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <select
                value={routingPreferences[selectedTemplateId] || 'approving_manager_branch'}
                onChange={(e) =>
                  setRoutingPreferences((prev) => ({
                    ...prev,
                    [selectedTemplateId]: e.target.value,
                  }))
                }
                className="w-full bg-[#292929] border border-[#555555] rounded-lg px-3 py-2 text-xs text-white font-medium focus:outline-none focus:ring-2 focus:ring-[#95EA00] focus:border-[#95EA00]"
              >
                {selectedTemplateId === 'new_submission' ? (
                  <>
                    <option value="approving_manager_branch">
                      Approving Manager (Location-Based: e.g. Dallas Rep ➔ Dallas Approving Manager) [Recommended]
                    </option>
                    <option value="approving_manager_alex">
                      Approving Manager: Alex Rivera (Dallas Branch — dallas.manager@discountforkliftphoenix.com)
                    </option>
                    <option value="approving_manager_marcus">
                      Approving Manager: Marcus Vance (Phoenix Main Yard — marcus.vance@discountforkliftphoenix.com)
                    </option>
                    <option value="location_gm">
                      Location General Manager (Auto-routed by Sales Rep Branch)
                    </option>
                    <option value="admin_broadcast">
                      All Administrators & Approving Managers (Broadcast to All Managers)
                    </option>
                    <option value="custom_email">
                      Custom Office Recipient (Configured Notification Address)
                    </option>
                  </>
                ) : (
                  <>
                    <option value="rep_gm_accounting">
                      Sales Rep + Location General Manager + Accounting (Standard Complete Distribution) [Recommended]
                    </option>
                    <option value="rep_gm">
                      Sales Rep + Location General Manager (Branch Copy Only)
                    </option>
                    <option value="rep_accounting">
                      Sales Rep + Accounting Office (Direct Payroll Copy)
                    </option>
                    <option value="rep_only">
                      Submitting Sales Rep Only
                    </option>
                  </>
                )}
              </select>
            </div>

            {/* Visual Recipient Chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {selectedTemplateId === 'new_submission' ? (
                <>
                  <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-[#A559BD]/20 text-purple-200 border border-[#A559BD]/50">
                    <Shield className="w-3 h-3 text-[#A559BD]" />
                    <span>Approving Manager</span>
                  </span>
                  <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-[#95EA00]/15 text-[#95EA00] border border-[#95EA00]/30">
                    <Building2 className="w-3 h-3" />
                    <span>Branch Specific</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[#95EA00]/15 text-[#95EA00] border border-[#95EA00]/30">
                    <User className="w-2.5 h-2.5" />
                    <span>Sales Rep</span>
                  </span>
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[#A559BD]/20 text-purple-200 border border-[#A559BD]/50">
                    <Building2 className="w-2.5 h-2.5" />
                    <span>Location GM</span>
                  </span>
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[#333333] text-gray-200 border border-[#555555]">
                    <Users className="w-2.5 h-2.5" />
                    <span>Accounting</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Workflow Callout / Explanation Box with Example */}
        <div className="bg-[#242424] border border-[#383838] rounded-lg p-3 text-xs space-y-2">
          <div className="flex items-center space-x-2 font-bold text-white text-[11px] uppercase tracking-wide">
            <span className="w-2 h-2 rounded-full bg-[#95EA00]" />
            <span>Workflow Demonstration (e.g. Dallas Branch):</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-gray-300">
            <div className="bg-[#1e1e1e] p-2.5 rounded border border-[#383838] space-y-1">
              <div className="font-semibold text-purple-300 flex items-center space-x-1">
                <span>1. Spiff Submission Alert</span>
              </div>
              <p className="text-gray-400 text-[10px] leading-relaxed">
                When a <strong>Dallas sales rep</strong> submits a spiff request, the first email is sent directly to the <strong>Approving Manager</strong> (e.g. Alex Rivera, Dallas Branch Approving Manager) for verification.
              </p>
            </div>

            <div className="bg-[#1e1e1e] p-2.5 rounded border border-[#383838] space-y-1">
              <div className="font-semibold text-[#95EA00] flex items-center space-x-1">
                <span>2. Approval / Denial Result Dispatch</span>
              </div>
              <p className="text-gray-400 text-[10px] leading-relaxed">
                Once reviewed and decided, completion emails are automatically dispatched to:
                <br />• <strong>Sales Rep</strong> (decision & bonus summary)
                <br />• <strong>Location General Manager</strong> (Carlos Morales — Dallas GM)
                <br />• <strong>Accounting Department</strong> (payroll batch record)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Version History Drawer/Panel if open */}
      {showVersions && (
        <div className="bg-[#1e1e1e] border border-[#555555] rounded-xl p-4 text-xs space-y-3">
          <div className="flex items-center justify-between border-b border-[#383838] pb-2">
            <div className="flex items-center space-x-2 text-white font-bold">
              <History className="w-4 h-4 text-[#A559BD]" />
              <span>Revision History for {currentTemplate?.name}</span>
            </div>
            <button
              onClick={() => setShowVersions(false)}
              className="text-gray-400 hover:text-white text-xs px-2 py-0.5"
            >
              Close
            </button>
          </div>
          {versions.length === 0 ? (
            <p className="text-gray-400 py-2">No previous revisions recorded.</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="bg-[#242424] border border-[#383838] rounded-lg p-2.5 flex items-start justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-[#95EA00] text-xs">
                        v{v.version}
                      </span>
                      <span className="text-gray-200 font-semibold truncate max-w-xs">
                        {v.subject}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 italic">
                      "{v.changeSummary || 'Revision saved'}"
                    </p>
                    <div className="flex items-center space-x-3 text-[10px] text-gray-300 mt-1">
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span>{formatPhoenixDateTime(v.createdAt)}</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <User className="w-3 h-3 text-gray-400" />
                        <span>{v.createdBy}</span>
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Load content from version v${v.version} into editor?`)) {
                        setSubject(v.subject);
                        setBodyHtml(v.bodyHtml);
                        setChangeSummary(`Restored from v${v.version}`);
                      }
                    }}
                    className="px-2 py-1 bg-[#333] hover:bg-[#444] text-gray-200 text-[11px] font-semibold rounded border border-[#555] transition-colors whitespace-nowrap"
                  >
                    Load v{v.version}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mode Toggle: Editor vs Live Preview */}
      <div className="flex items-center justify-between border-b border-[#444444] pb-3">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setPreviewMode('editor')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              previewMode === 'editor'
                ? 'bg-[#A559BD] text-white shadow-sm'
                : 'bg-[#1e1e1e] text-gray-300 hover:text-white'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Template Editor</span>
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode('preview')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              previewMode === 'preview'
                ? 'bg-[#95EA00] text-[#1e1e1e] shadow-sm'
                : 'bg-[#1e1e1e] text-gray-300 hover:text-white'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Live Rendered Preview</span>
          </button>
        </div>

        {/* If Preview Mode: Recipient Perspective Selector */}
        {previewMode === 'preview' ? (
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-gray-400">Preview Perspective:</span>
            <button
              type="button"
              onClick={() => setPreviewRole('admin')}
              className={`px-2 py-1 rounded text-[11px] font-semibold border ${
                previewRole === 'admin'
                  ? 'bg-purple-900/60 border-[#A559BD] text-purple-200'
                  : 'bg-[#1e1e1e] border-[#444] text-gray-400'
              }`}
            >
              Office Manager / Admin
            </button>
            <button
              type="button"
              onClick={() => setPreviewRole('rep')}
              className={`px-2 py-1 rounded text-[11px] font-semibold border ${
                previewRole === 'rep'
                  ? 'bg-green-900/40 border-[#95EA00] text-[#95EA00]'
                  : 'bg-[#1e1e1e] border-[#444] text-gray-400'
              }`}
            >
              Sales Rep (Non-Admin)
            </button>
          </div>
        ) : (
          /* Insert Placeholder Menu in Editor mode */
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsInsertMenuOpen(!isInsertMenuOpen)}
              className="flex items-center space-x-1 px-3 py-1.5 bg-[#1e1e1e] hover:bg-[#383838] text-white border border-[#555] rounded-lg text-xs font-semibold transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#95EA00]" />
              <span>Insert Field</span>
              <ChevronDown className="w-3.5 h-3.5 ml-0.5 text-gray-400" />
            </button>

            {isInsertMenuOpen && (
              <div className="absolute right-0 mt-1 w-72 bg-[#1e1e1e] border border-[#555] rounded-xl shadow-xl z-30 p-2 text-xs divide-y divide-[#333] max-h-80 overflow-y-auto">
                <div className="p-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  Select Field to Insert
                </div>
                <div className="py-1">
                  {applicablePlaceholders.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => handleInsertPlaceholder(p.key)}
                      className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#333] transition-colors flex items-center justify-between group"
                    >
                      <div>
                        <div className="text-white font-mono font-semibold text-[11px]">
                          {'{{'}{p.key}{'}}'}
                        </div>
                        <div className="text-gray-400 text-[10px] truncate max-w-[200px]">
                          {p.description}
                        </div>
                      </div>
                      <span className="text-[10px] text-[#95EA00] opacity-0 group-hover:opacity-100 font-bold">
                        Insert
                      </span>
                    </button>
                  ))}
                </div>
                <div className="p-2 text-[10px] text-gray-400 leading-normal">
                  Conditional block: <code className="text-[#95EA00]">{'{{#if_admin}}...{{/if_admin}}'}</code> only shows enclosed HTML to manager recipients.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Editor View */}
      {previewMode === 'editor' && (
        <form onSubmit={handleSave} className="space-y-4">
          {/* Policy Notice Box */}
          <div className="bg-[#242424] border border-[#444444] rounded-lg p-3 text-xs text-gray-300 space-y-1">
            <div className="flex items-center space-x-1.5 text-white font-semibold text-[11px]">
              <span className="w-2 h-2 rounded-full bg-[#95EA00]" />
              <span>Fixed Outcome Status & Payment Wording Policy:</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Approval and Denial status wording is automatically rendered in a verified system banner outside the editable body: <strong className="text-white">“Approved — awaiting payment.”</strong> for approvals, and <strong className="text-white">“Denied”</strong> followed by the recorded denial reason for denials. Templates must not claim that payment has already occurred.
            </p>
          </div>

          {/* Email Subject */}
          <div>
            <label className="block text-xs font-semibold text-gray-200 mb-1">
              Email Subject Line
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-[#1e1e1e] border border-[#444444] rounded-lg px-3.5 py-2.5 text-xs text-white focus:bg-[#181818] focus:outline-none focus:ring-1 focus:ring-[#95EA00] font-medium"
              placeholder="e.g. Spiff Request [{{request_id}}] Approved - {{rep_name}}"
              required
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Supports placeholders like <code className="text-[#95EA00]">{'{{request_id}}'}</code>, <code className="text-[#95EA00]">{'{{rep_name}}'}</code>, <code className="text-[#95EA00]">{'{{spiff_amount}}'}</code>.
            </p>
          </div>

          {/* Email HTML Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-200">
                Email HTML Template Body
              </label>
              <span className="text-[11px] text-gray-400 font-mono">
                {bodyHtml.length} characters
              </span>
            </div>
            <textarea
              ref={textareaRef}
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              rows={16}
              className="w-full bg-[#1e1e1e] border border-[#444444] rounded-lg p-3 text-xs text-gray-200 font-mono focus:bg-[#181818] focus:outline-none focus:ring-1 focus:ring-[#95EA00] leading-relaxed resize-y"
              required
            />
          </div>

          {/* Change Summary & Version Audit */}
          <div className="bg-[#242424] border border-[#444444] rounded-lg p-3">
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Revision Summary Note (Optional)
            </label>
            <input
              type="text"
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              placeholder="e.g. Updated approval wording to clarify biweekly payroll distribution"
              className="w-full bg-[#1e1e1e] border border-[#444444] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
            />
          </div>

          {/* Error Message */}
          {saveError && (
            <div className="p-3 bg-rose-950/50 border border-rose-800 rounded-lg flex items-start space-x-2 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Success Message */}
          {saveSuccess && (
            <div className="p-3 bg-[#95EA00]/15 border border-[#95EA00]/40 rounded-lg flex items-center space-x-2 text-xs text-[#95EA00] font-semibold">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Template revision saved successfully! New version created and audited in Neon.</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center space-x-2">
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 bg-[#A559BD] hover:bg-[#934da9] text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center space-x-1.5"
              >
                {isSaving ? (
                  <span>Saving Revision...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Save New Version (v{(currentTemplate?.version || 1) + 1})</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleRestoreDefaults}
                disabled={isSaving}
                className="px-3.5 py-2.5 bg-[#1e1e1e] hover:bg-[#383838] text-gray-300 hover:text-white border border-[#555555] text-xs font-semibold rounded-lg transition-colors flex items-center space-x-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore Default Wording</span>
              </button>
            </div>

            <div className="text-[11px] text-gray-400 font-mono">
              Current: v{currentTemplate?.version} · Updated by {currentTemplate?.updatedBy}
            </div>
          </div>
        </form>
      )}

      {/* Live Preview View */}
      {previewMode === 'preview' && (
        <div className="space-y-4">
          <div className="bg-[#1e1e1e] border border-[#444444] rounded-lg p-3">
            <div className="text-[11px] font-mono text-gray-400 mb-1 uppercase tracking-wider font-semibold">
              Rendered Subject Line:
            </div>
            <div className="text-sm font-bold text-white tracking-tight">
              {preview.subject}
            </div>
          </div>

          <div className="bg-[#1e1e1e] border border-[#444444] rounded-lg p-3">
            <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 mb-2">
              <span className="uppercase tracking-wider font-semibold">
                Rendered HTML Output ({previewRole === 'admin' ? 'Manager View' : 'Sales Rep View'}):
              </span>
              <span className="text-xs text-[#95EA00]">
                {previewRole === 'admin' ? '✓ Includes Admin Review Link' : '✕ Admin Review Link Excluded'}
              </span>
            </div>
            <div className="bg-white rounded-lg p-2 shadow-inner">
              <iframe
                sandbox=""
                srcDoc={preview.bodyHtml}
                className="w-full min-h-[420px] bg-white rounded border-0"
                title="Sandboxed Email Preview"
              />
            </div>
          </div>
        </div>
      )}

      {/* Test Email Dispatch Section */}
      <div className="bg-[#242424] border border-[#444444] rounded-xl p-5 space-y-3">
        <div className="flex items-center space-x-2 text-white font-bold text-xs">
          <Send className="w-4 h-4 text-[#95EA00]" />
          <span>Send Test Email Dispatch</span>
        </div>
        <p className="text-[11px] text-gray-300">
          Sends an immediate test email rendered with sample spiff details to verify visual styling and delivery through the Resend API.
        </p>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-200">
            Select Test Recipient Contact or Enter Email:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <select
              value={selectedTestContactKey}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedTestContactKey(val);
                if (val === 'dallas_approver') {
                  setTestEmail('dallas.manager@discountforkliftphoenix.com');
                  setPreviewRole('admin');
                } else if (val === 'dallas_gm') {
                  setTestEmail('carlos.morales@discountforkliftphoenix.com');
                  setPreviewRole('admin');
                } else if (val === 'phoenix_approver') {
                  setTestEmail('marcus.vance@discountforkliftphoenix.com');
                  setPreviewRole('admin');
                } else if (val === 'phoenix_gm') {
                  setTestEmail('sarah.connor@discountforkliftphoenix.com');
                  setPreviewRole('admin');
                } else if (val === 'accounting') {
                  setTestEmail('accounting@discountforkliftphoenix.com');
                  setPreviewRole('admin');
                } else if (val === 'dallas_rep') {
                  setTestEmail('jake.thompson@discountforkliftphoenix.com');
                  setPreviewRole('rep');
                }
              }}
              className="bg-[#1e1e1e] border border-[#555555] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
            >
              <option value="dallas_approver">Dallas Approving Manager (Alex Rivera)</option>
              <option value="dallas_gm">Dallas General Manager (Carlos Morales)</option>
              <option value="phoenix_approver">Phoenix Approving Manager (Marcus Vance)</option>
              <option value="phoenix_gm">Phoenix General Manager (Sarah Connor)</option>
              <option value="accounting">Accounting Payroll Office</option>
              <option value="dallas_rep">Dallas Sales Rep (Jake Thompson)</option>
              <option value="custom">Custom Test Recipient Email</option>
            </select>

            <div className="sm:col-span-2 flex items-center gap-2">
              <input
                type="email"
                value={testEmail}
                onChange={(e) => {
                  setTestEmail(e.target.value);
                  setSelectedTestContactKey('custom');
                }}
                placeholder="test-recipient@discountforkliftphoenix.com"
                className="flex-1 bg-[#1e1e1e] border border-[#555555] rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
              />
              <button
                type="button"
                onClick={handleSendTestEmail}
                disabled={isSendingTest}
                className="px-4 py-2 bg-[#95EA00] hover:bg-[#85d300] text-[#1e1e1e] text-xs font-bold rounded-lg transition-colors flex items-center justify-center space-x-1.5 shadow-sm whitespace-nowrap"
              >
                {isSendingTest ? (
                  <span>Dispatching...</span>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Test Email</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {testResult && (
          <div
            className={`p-3 rounded-lg border text-xs ${
              testResult.success
                ? 'bg-[#95EA00]/15 border-[#95EA00]/30 text-gray-200'
                : 'bg-rose-950/50 border-rose-800 text-rose-200'
            }`}
          >
            <div className="flex items-start space-x-2">
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-[#95EA00] shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <span className="font-semibold text-white">
                  {testResult.success ? 'Dispatch Accepted' : 'Dispatch Failed'}
                </span>
                <p className="text-[11px] text-gray-300 leading-normal">{testResult.message}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Available Placeholders Reference Guide */}
      <div className="bg-[#242424] border border-[#444444] rounded-xl p-5 space-y-3">
        <div className="flex items-center space-x-2 text-white font-bold text-xs">
          <Info className="w-4 h-4 text-[#A559BD]" />
          <span>Supported Placeholders Reference Guide</span>
        </div>
        <p className="text-[11px] text-gray-300">
          Placeholders are safely escaped before email generation to prevent script injection. Unknown placeholders will cause validation errors upon save.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          {applicablePlaceholders.map((p) => (
            <div
              key={p.key}
              className="bg-[#1e1e1e] border border-[#383838] rounded-lg p-2.5 flex items-start justify-between"
            >
              <div>
                <div className="flex items-center space-x-2">
                  <code className="text-[#95EA00] font-mono font-bold text-[11px]">
                    {'{{'}{p.key}{'}}'}
                  </code>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase">
                    {p.label}
                  </span>
                </div>
                <p className="text-[11px] text-gray-300 mt-1">{p.description}</p>
                <div className="text-[10px] text-gray-300 mt-1">
                  Sample: <span className="font-mono text-gray-200">"{p.sample}"</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleInsertPlaceholder(p.key)}
                className="p-1 text-gray-400 hover:text-[#95EA00] rounded hover:bg-[#333]"
                title="Insert placeholder"
              >
                {copiedPlaceholder === p.key ? (
                  <Check className="w-3.5 h-3.5 text-[#95EA00]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
