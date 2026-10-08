import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { RepSubmissionForm } from './components/RepSubmissionForm';
import { SubmissionSuccessModal } from './components/SubmissionSuccessModal';
import { AdminLoginModal } from './components/AdminLoginModal';
import { PasswordChangeModal } from './components/PasswordChangeModal';
import { AdminLedger } from './components/AdminLedger';
import { AdminSpiffManager } from './components/AdminSpiffManager';
import { AdminRepManager } from './components/AdminRepManager';
import { AdminContactsManager } from './components/AdminContactsManager';
import { AdminBranchManager } from './components/AdminBranchManager';
import { AdminSettings } from './components/AdminSettings';
import { AdminRequestDetailModal } from './components/AdminRequestDetailModal';
import { DecisionConfirmModal } from './components/DecisionConfirmModal';
import { PhotoPreviewModal } from './components/PhotoPreviewModal';
import { SpiffSubmission, SalesRep, Spiff, Attachment, NotificationContact, Branch } from './lib/repository';
import { adminFetch, setAdminSession, clearAdminSession, getAdminSession } from './lib/api';
import { FileText, Award, Users, Settings as SettingsIcon, Contact, Sparkles, Building2 } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState<'rep' | 'admin'>('rep');
  const [adminUser, setAdminUser] = useState<string | null>(null);
  const [adminRole, setAdminRole] = useState<string>('Administrator');
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Success submission modal
  const [lastSubmitted, setLastSubmitted] = useState<SpiffSubmission | null>(null);

  // Admin Ledger modal states
  const [activeDetailSubmission, setActiveDetailSubmission] = useState<SpiffSubmission | null>(null);
  const [activePhotoAttachment, setActivePhotoAttachment] = useState<Attachment | null>(null);
  const [activePhotoRequestId, setActivePhotoRequestId] = useState<string>('');

  // Decision Confirm Modal state
  const [decisionModalState, setDecisionModalState] = useState<{
    isOpen: boolean;
    submission: SpiffSubmission | null;
    decision: 'approve' | 'deny';
  }>({
    isOpen: false,
    submission: null,
    decision: 'approve',
  });

  // Admin tabs
  const [adminTab, setAdminTab] = useState<'ledger' | 'spiffs' | 'reps' | 'contacts' | 'branches' | 'settings'>('ledger');

  // Shared reps, contacts, spiffs, branches data
  const [reps, setReps] = useState<SalesRep[]>([]);
  const [contacts, setContacts] = useState<NotificationContact[]>([]);
  const [spiffs, setSpiffs] = useState<Spiff[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isNeonConnected, setIsNeonConnected] = useState(false);
  const [ledgerRefreshTrigger, setLedgerRefreshTrigger] = useState(0);
  const [initialSetupToken, setInitialSetupToken] = useState<string | null>(null);

  // Check URL for setup/reset tokens on load
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('setup_token') || urlParams.get('token') || urlParams.get('reset_token');
      if (token) {
        setInitialSetupToken(token);
        setIsAdminLoginOpen(true);
      }
    } catch {}
  }, []);

  // Check existing administrator session on load
  useEffect(() => {
    adminFetch('/api/admin/session')
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setAdminUser(data.user.email);
          setAdminRole(data.user.role || 'Administrator');
          if (data.user.mustChangePassword) {
            setMustChangePassword(true);
          }
          if (data.csrfToken) {
            setAdminSession({
              email: data.user.email,
              name: data.user.name,
              role: data.user.role,
              csrfToken: data.csrfToken,
            });
          }
        } else {
          clearAdminSession();
          setAdminUser(null);
          setMustChangePassword(false);
        }
      })
      .catch(() => {});
  }, []);

  // Load configuration & data
  const refreshConfig = async () => {
    try {
      const [repsRes, spiffsRes, contactsRes, branchesRes, statusRes] = await Promise.all([
        (adminUser ? adminFetch('/api/admin/reps') : fetch('/api/reps')).then((r) => r.json()),
        (adminUser ? adminFetch('/api/admin/spiffs') : fetch('/api/spiffs')).then((r) => r.json()),
        (adminUser ? adminFetch('/api/admin/contacts') : Promise.resolve({ contacts: [] }))
          .then((r: any) => r.json ? r.json() : r)
          .catch(() => ({ contacts: [] })),
        (adminUser ? adminFetch('/api/admin/branches') : fetch('/api/branches'))
          .then((r) => r.json())
          .catch(() => ({ branches: [] })),
        (adminUser ? adminFetch('/api/admin/status') : Promise.resolve({ isNeonConfigured: false }))
          .then((r: any) => r.json ? r.json() : r)
          .catch(() => ({ isNeonConfigured: false })),
      ]);

      setReps(repsRes.reps || []);
      setSpiffs(spiffsRes.spiffs || []);
      setContacts(contactsRes.contacts || []);
      setBranches(branchesRes.branches || []);
      setIsNeonConnected(Boolean(statusRes?.isNeonConfigured));
    } catch (err) {
      console.error('Error fetching config:', err);
    }
  };

  useEffect(() => {
    refreshConfig();
  }, [adminUser]);

  const handleSubmissionSuccess = (submission: SpiffSubmission) => {
    setLastSubmitted(submission);
  };

  const handleAdminLogin = (
    email: string,
    role?: string,
    _sessionToken?: string,
    csrfToken?: string,
    mustChange?: boolean
  ) => {
    if (csrfToken) {
      setAdminSession({
        email,
        role: role || 'Administrator',
        csrfToken,
      });
    }
    setAdminUser(email);
    setAdminRole(role || 'Administrator');
    if (mustChange) {
      setMustChangePassword(true);
    }
    setCurrentView('admin');
  };

  const handleAdminLogout = () => {
    fetch('/api/admin/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    clearAdminSession();
    setAdminUser(null);
    setAdminRole('Administrator');
    setMustChangePassword(false);
    setCurrentView('rep');
  };

  // Open the decision modal for approving or denying
  const handleOpenDecision = (submission: SpiffSubmission, decision: 'approve' | 'deny') => {
    setDecisionModalState({
      isOpen: true,
      submission,
      decision,
    });
  };

  // Execute decision with automatic emails and selectable recipients
  const handleConfirmDecision = async (
    submissionId: string,
    decision: 'approve' | 'deny',
    reasonOrMessage: string,
    selectedRecipients: Array<{ email: string; name: string; role: string }>
  ) => {
    const res = await adminFetch(`/api/admin/submissions/${submissionId}/decide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        decision,
        reasonOrMessage,
        recipients: selectedRecipients,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Update active detail drawer if open
    if (activeDetailSubmission && activeDetailSubmission.id === submissionId) {
      setActiveDetailSubmission(data.submission);
    }

    // Immediately trigger ledger table refresh
    setLedgerRefreshTrigger((prev) => prev + 1);
    refreshConfig();
  };

  const handleMarkPaidRequest = async (id: string) => {
    const res = await adminFetch(`/api/admin/submissions/${id}/pay`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setActiveDetailSubmission(data.submission);
    setLedgerRefreshTrigger((prev) => prev + 1);
    refreshConfig();
  };

  const handleCorrectRequest = async (id: string, updates: any, explanation: string) => {
    const res = await adminFetch(`/api/admin/submissions/${id}/correct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...updates, explanation }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setActiveDetailSubmission(data.submission);
    setLedgerRefreshTrigger((prev) => prev + 1);
    refreshConfig();
  };

  const handleOpenPhoto = (submission: SpiffSubmission) => {
    if (submission.attachment) {
      setActivePhotoAttachment(submission.attachment);
      setActivePhotoRequestId(submission.id);
    }
  };

  const handleLoadPresets = async () => {
    try {
      const res = await adminFetch('/api/admin/presets', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setLedgerRefreshTrigger((prev) => prev + 1);
        refreshConfig();
      }
    } catch (err) {
      console.error('Failed to load presets:', err);
    }
  };

  // Find rep record for decision modal preselection
  const selectedRepRecord = decisionModalState.submission
    ? reps.find((r) => r.id === decisionModalState.submission?.repId) || null
    : null;

  return (
    <div className="min-h-screen bg-[#242424] text-gray-100 flex flex-col font-sans">
      <Header
        currentView={currentView}
        onNavigate={(v) => setCurrentView(v)}
        adminUser={adminUser}
        adminRole={adminRole}
        onAdminLoginClick={() => setIsAdminLoginOpen(true)}
        onAdminLogout={handleAdminLogout}
        isNeonConnected={isNeonConnected}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentView === 'rep' ? (
          <div>
            <RepSubmissionForm
              onSubmissionSuccess={handleSubmissionSuccess}
              onAdminLoginClick={() => setIsAdminLoginOpen(true)}
            />
          </div>
        ) : (
          /* Admin Portal View */
          <div className="space-y-6">
            {/* Top Admin Navigation Tabs */}
            <div className="border-b border-[#444444] bg-[#2d2d2d] rounded-t-xl px-4 pt-2 shadow-sm">
              <div className="flex space-x-6 overflow-x-auto">
                <button
                  onClick={() => setAdminTab('ledger')}
                  className={`flex items-center space-x-2 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                    adminTab === 'ledger'
                      ? 'border-[#95EA00] text-[#95EA00]'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>Submissions Ledger</span>
                </button>

                <button
                  onClick={() => setAdminTab('spiffs')}
                  className={`flex items-center space-x-2 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                    adminTab === 'spiffs'
                      ? 'border-[#95EA00] text-[#95EA00]'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Award className="w-4 h-4" />
                  <span>Spiff Programs ({spiffs.length})</span>
                </button>

                <button
                  onClick={() => setAdminTab('reps')}
                  className={`flex items-center space-x-2 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                    adminTab === 'reps'
                      ? 'border-[#95EA00] text-[#95EA00]'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Sales Reps ({reps.length})</span>
                </button>

                <button
                  onClick={() => setAdminTab('contacts')}
                  className={`flex items-center space-x-2 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                    adminTab === 'contacts'
                      ? 'border-[#95EA00] text-[#95EA00]'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Contact className="w-4 h-4" />
                  <span>Notification Contacts ({contacts.length})</span>
                </button>

                <button
                  onClick={() => setAdminTab('branches')}
                  className={`flex items-center space-x-2 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                    adminTab === 'branches'
                      ? 'border-[#95EA00] text-[#95EA00]'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  <span>Branches ({branches.length})</span>
                </button>

                <button
                  onClick={() => setAdminTab('settings')}
                  className={`flex items-center space-x-2 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                    adminTab === 'settings'
                      ? 'border-[#95EA00] text-[#95EA00]'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <SettingsIcon className="w-4 h-4" />
                  <span>Notifications & Infrastructure</span>
                </button>
              </div>
            </div>

            {/* Tab Panels */}
            {adminTab === 'ledger' && (
              <AdminLedger
                adminUser={adminUser || 'caleb@discountforkliftphoenix.com'}
                onOpenDetail={(sub) => setActiveDetailSubmission(sub)}
                onViewPhoto={handleOpenPhoto}
                onApproveClick={(sub) => handleOpenDecision(sub, 'approve')}
                onDenyClick={(sub) => handleOpenDecision(sub, 'deny')}
                reps={reps}
                refreshTrigger={ledgerRefreshTrigger}
              />
            )}

            {adminTab === 'spiffs' && (
              <AdminSpiffManager
                spiffs={spiffs}
                adminUser={adminUser || 'caleb@discountforkliftphoenix.com'}
                onRefresh={refreshConfig}
                onLoadPresets={handleLoadPresets}
              />
            )}

            {adminTab === 'reps' && (
              <AdminRepManager
                reps={reps}
                contacts={contacts}
                branches={branches}
                adminUser={adminUser || 'caleb@discountforkliftphoenix.com'}
                onRefresh={refreshConfig}
                onLoadPresets={handleLoadPresets}
                onNavigateToBranches={() => setAdminTab('branches')}
              />
            )}

            {adminTab === 'contacts' && (
              <AdminContactsManager
                contacts={contacts}
                branches={branches}
                adminUser={adminUser || 'caleb@discountforkliftphoenix.com'}
                onRefresh={refreshConfig}
                onLoadPresets={handleLoadPresets}
                onNavigateToBranches={() => setAdminTab('branches')}
              />
            )}

            {adminTab === 'branches' && (
              <AdminBranchManager
                branches={branches}
                reps={reps}
                contacts={contacts}
                adminUser={adminUser || 'caleb@discountforkliftphoenix.com'}
                onRefresh={refreshConfig}
              />
            )}

            {adminTab === 'settings' && (
              <AdminSettings adminUser={adminUser || 'caleb@discountforkliftphoenix.com'} />
            )}
          </div>
        )}
      </main>

      {/* Decision Confirmation Modal (Approve / Deny with recipient selection) */}
      {decisionModalState.isOpen && (
        <DecisionConfirmModal
          isOpen={decisionModalState.isOpen}
          onClose={() => setDecisionModalState({ isOpen: false, submission: null, decision: 'approve' })}
          submission={decisionModalState.submission}
          decision={decisionModalState.decision}
          repRecord={selectedRepRecord}
          allContacts={contacts}
          onConfirm={handleConfirmDecision}
        />
      )}

      {/* Submission Success Confirmation Modal */}
      {lastSubmitted && (
        <SubmissionSuccessModal
          submission={lastSubmitted}
          onReset={() => {
            setLastSubmitted(null);
            refreshConfig();
          }}
        />
      )}

      {/* Admin Login Modal */}
      <AdminLoginModal
        isOpen={isAdminLoginOpen}
        onClose={() => {
          setIsAdminLoginOpen(false);
          setInitialSetupToken(null);
        }}
        onLoginSuccess={handleAdminLogin}
        initialToken={initialSetupToken}
      />

      {/* Password Change Modal (Required for First-Time Logins) */}
      <PasswordChangeModal
        isOpen={mustChangePassword && Boolean(adminUser)}
        userEmail={adminUser || ''}
        onSuccess={(newCsrfToken) => {
          if (newCsrfToken && adminUser) {
            setAdminSession({
              email: adminUser,
              role: adminRole,
              csrfToken: newCsrfToken,
            });
          }
          setMustChangePassword(false);
          refreshConfig();
          setLedgerRefreshTrigger((prev) => prev + 1);
        }}
        onLogout={handleAdminLogout}
      />


      {/* Admin Request Detail Drawer/Modal */}
      {activeDetailSubmission && (
        <AdminRequestDetailModal
          submission={activeDetailSubmission}
          isOpen={Boolean(activeDetailSubmission)}
          onClose={() => setActiveDetailSubmission(null)}
          adminUser={adminUser || 'caleb@discountforkliftphoenix.com'}
          onOpenDecisionModal={handleOpenDecision}
          onMarkPaid={handleMarkPaidRequest}
          onCorrect={handleCorrectRequest}
          onViewPhoto={handleOpenPhoto}
        />
      )}

      {/* Photo Preview Modal */}
      {activePhotoAttachment && (
        <PhotoPreviewModal
          isOpen={Boolean(activePhotoAttachment)}
          onClose={() => setActivePhotoAttachment(null)}
          attachment={activePhotoAttachment}
          requestId={activePhotoRequestId}
          adminUser={adminUser || 'caleb@discountforkliftphoenix.com'}
        />
      )}
    </div>
  );
}
