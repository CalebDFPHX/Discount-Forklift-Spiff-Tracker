import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Download,
  ArrowUpDown,
  Image as ImageIcon,
  CheckCircle,
  Clock,
  AlertTriangle,
  RotateCcw,
  Eye,
  CheckCircle2,
  XCircle,
  DollarSign,
  ChevronRight,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  Trash2,
} from 'lucide-react';
import { SpiffSubmission, SalesRep } from '../lib/repository';
import { formatDollars } from '../lib/formatters';
import { formatPhoenixDate, formatPhoenixDateTime } from '../lib/timezone';
import { adminFetch } from '../lib/api';
import { getSubmissionPhotos } from '../lib/photoAttachments';

interface AdminLedgerProps {
  adminUser: string;
  adminRole: string;
  onOpenDetail: (submission: SpiffSubmission) => void;
  onViewPhoto: (submission: SpiffSubmission) => void;
  onApproveClick: (submission: SpiffSubmission) => void;
  onDenyClick: (submission: SpiffSubmission) => void;
  onMarkPaid: (submissionId: string) => Promise<void>;
  reps: SalesRep[];
  refreshTrigger?: number;
}

interface LedgerMarkPaidActionProps {
  submission: SpiffSubmission;
  adminRole: string;
  onMarkPaid: (submissionId: string) => Promise<void>;
}

export const LedgerMarkPaidAction: React.FC<LedgerMarkPaidActionProps> = ({
  submission,
  adminRole,
  onMarkPaid,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (adminRole !== 'General Manager' || submission.status !== 'Approved' || isPaid) {
    return null;
  }

  const handleMarkPaid = async () => {
    if (!window.confirm('Mark this approved spiff as paid? This action cannot be undone.')) return;

    setActionError(null);
    setIsProcessing(true);
    try {
      await onMarkPaid(submission.id);
      setIsPaid(true);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'Failed to mark as paid.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleMarkPaid}
        disabled={isProcessing}
        className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-bold text-white bg-[#A559BD] hover:bg-[#934da9] rounded shadow-sm transition-colors disabled:opacity-60"
        title="Mark approved spiff as paid"
      >
        {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DollarSign className="w-3.5 h-3.5" />}
        <span>{isProcessing ? 'Marking Paid...' : 'Mark as Paid'}</span>
      </button>
      {actionError && (
        <span className="text-[10px] text-rose-300" role="alert">
          {actionError}
        </span>
      )}
    </>
  );
};

export const AdminLedger: React.FC<AdminLedgerProps> = ({
  adminUser,
  adminRole,
  onOpenDetail,
  onViewPhoto,
  onApproveClick,
  onDenyClick,
  onMarkPaid,
  reps,
  refreshTrigger,
}) => {
  const [submissions, setSubmissions] = useState<SpiffSubmission[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 50 | 100>(10);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [gmRepOptions, setGmRepOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [summary, setSummary] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingSubmissionId, setDeletingSubmissionId] = useState<string | null>(null);

  // Filter & Search states
  const [selectedRep, setSelectedRep] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [dateFilterType, setDateFilterType] = useState<'submission' | 'approval' | 'sale'>('submission');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'submittedAt' | 'approvedAt' | 'rep' | 'amount'>('submittedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const fetchLedger = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedRep && selectedRep !== 'all') params.append('repId', selectedRep);
      if (selectedStatus && selectedStatus !== 'all') params.append('status', selectedStatus);
      params.append('dateFilterType', dateFilterType);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);
      params.append('page', String(page));
      params.append('pageSize', String(pageSize));

      const res = await adminFetch(`/api/admin/submissions?${params.toString()}`);
      const data = await res.json();
      setSubmissions(data.submissions || []);
      setPage(data.pagination?.page || page);
      setTotalCount(data.pagination?.totalCount || 0);
      setTotalPages(data.pagination?.totalPages || 1);
      if (adminRole === 'General Manager') {
        setGmRepOptions(data.availableReps || []);
      }
      setSummary(data.summary || null);
    } catch (err) {
      console.error('Failed to load submissions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, [selectedRep, selectedStatus, dateFilterType, startDate, endDate, searchQuery, sortBy, sortOrder, page, pageSize, refreshTrigger]);

  const handleSort = (field: 'submittedAt' | 'approvedAt' | 'rep' | 'amount') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleResetFilters = () => {
    setPage(1);
    setSelectedRep('all');
    setSelectedStatus('all');
    setDateFilterType('submission');
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
    setSortBy('submittedAt');
    setSortOrder('desc');
  };

  const handleDeleteSubmission = async (submission: SpiffSubmission) => {
    const confirmation = window.prompt(
      `PERMANENT DELETE: This removes the submission, its photo, audit history, and email records. This cannot be undone, regardless of its status.\n\nType DELETE ${submission.id} to continue.`
    );
    if (confirmation !== `DELETE ${submission.id}`) return;

    setDeletingSubmissionId(submission.id);
    try {
      const response = await adminFetch(`/api/admin/submissions/${submission.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete submission.');
      if (data.photoCleanupWarning) window.alert(data.photoCleanupWarning);
      await fetchLedger();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to delete submission.');
    } finally {
      setDeletingSubmissionId(null);
    }
  };

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (selectedRep && selectedRep !== 'all') params.append('repId', selectedRep);
    if (selectedStatus && selectedStatus !== 'all') params.append('status', selectedStatus);
    params.append('dateFilterType', dateFilterType);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (searchQuery.trim()) params.append('search', searchQuery.trim());
    params.append('sortBy', sortBy);
    params.append('sortOrder', sortOrder);

    window.location.href = `/api/admin/export/csv?${params.toString()}`;
  };

  const isGeneralManager = adminRole === 'General Manager';
  const repOptions = isGeneralManager ? gmRepOptions : reps;
  const firstItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalCount);
  const pageNumbers: Array<number | 'ellipsis-before' | 'ellipsis-after'> =
    totalPages <= 7
      ? Array.from({ length: totalPages }, (_, index) => index + 1)
      : page <= 4
        ? [1, 2, 3, 4, 5, 'ellipsis-after', totalPages]
        : page >= totalPages - 3
          ? [1, 'ellipsis-before', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
          : [1, 'ellipsis-before', page - 1, page, page + 1, 'ellipsis-after', totalPages];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending':
        return (
          <span className="inline-flex items-center space-x-1.5 text-amber-300 bg-amber-950/60 border border-amber-700/60 px-2 py-0.5 rounded text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            <span>Pending</span>
          </span>
        );
      case 'Approved':
        return (
          <span className="inline-flex items-center space-x-1.5 text-[#95EA00] bg-[#95EA00]/15 border border-[#95EA00]/30 px-2 py-0.5 rounded text-[11px] font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#95EA00]"></span>
            <span>Approved</span>
          </span>
        );
      case 'Paid':
        return (
          <span className="inline-flex items-center space-x-1.5 text-purple-300 bg-purple-950/60 border border-purple-700/60 px-2 py-0.5 rounded text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
            <span>Paid</span>
          </span>
        );
      case 'Rejected':
        return (
          <span className="inline-flex items-center space-x-1.5 text-rose-300 bg-rose-950/60 border border-rose-700/60 px-2 py-0.5 rounded text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
            <span>Denied</span>
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Pending */}
          <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
              <span>Pending Review</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className="text-2xl font-bold text-white">{summary.pendingDollarsFormatted}</span>
              <span className="text-xs text-amber-400 font-medium">({summary.pendingCount} req)</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Filtered by: Current search & date criteria
            </p>
          </div>

          {/* 2. Approved Unpaid */}
          <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
              <span>Approved (Ready to Pay)</span>
              <CheckCircle2 className="w-4 h-4 text-[#95EA00]" />
            </div>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className="text-2xl font-bold text-[#95EA00]">
                {summary.approvedUnpaidDollarsFormatted}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Ready for payroll cash distribution
            </p>
          </div>

          {/* 3. Paid Dollars */}
          <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
              <span>Paid in Full</span>
              <DollarSign className="w-4 h-4 text-purple-400" />
            </div>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className="text-2xl font-bold text-purple-300">{summary.paidDollarsFormatted}</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Cumulative completed cash disbursements
            </p>
          </div>

          {/* 4. Rep Approved Breakdown */}
          <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
              <span>Approved by Rep</span>
              <Filter className="w-4 h-4 text-[#A559BD]" />
            </div>
            <div className="mt-2 overflow-y-auto max-h-12 text-xs divide-y divide-[#383838]">
              {summary.repApprovalTotals && summary.repApprovalTotals.length > 0 ? (
                summary.repApprovalTotals.slice(0, 2).map((item: any, i: number) => (
                  <div key={i} className="flex justify-between py-0.5">
                    <span className="text-gray-300 truncate max-w-[110px]">{item.repName}</span>
                    <span className="font-bold text-[#95EA00]">{formatDollars(item.totalCents)}</span>
                  </div>
                ))
              ) : (
                <span className="text-gray-400 text-[11px]">No approved spiffs yet</span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Includes requests subsequently marked Paid
            </p>
          </div>
        </div>
      )}

      {/* Filter and Search Controls Bar */}
      <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search lift model, serial suffix (0042), or ID..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#1e1e1e] border border-[#444444] rounded-lg text-white placeholder-gray-500 focus:bg-[#181818] focus:outline-none focus:ring-1 focus:ring-[#95EA00] focus:border-[#95EA00]"
            />
          </div>

          {/* Rep filter */}
          <div>
            <select
              value={selectedRep}
              onChange={(e) => {
                setSelectedRep(e.target.value);
                setPage(1);
              }}
              className="w-full py-1.5 px-2.5 text-xs bg-[#1e1e1e] border border-[#444444] rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
            >
              <option value="all">All Sales Reps</option>
              {repOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="w-full py-1.5 px-2.5 text-xs bg-[#1e1e1e] border border-[#444444] rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
            >
              <option value="all">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Paid">Paid</option>
              <option value="Rejected">Denied</option>
            </select>
          </div>

          {/* CSV Export & Reset Actions */}
          <div className="flex items-center space-x-2">
            {!isGeneralManager && (
              <button
                onClick={handleExportCsv}
                className="flex-1 inline-flex items-center justify-center space-x-1.5 py-1.5 px-3 bg-[#A559BD] hover:bg-[#934da9] text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            )}
            <button
              onClick={handleResetFilters}
              title="Reset Filters"
              className="p-1.5 text-gray-400 hover:text-white rounded-lg border border-[#444444] bg-[#1e1e1e] hover:bg-[#383838] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Date Range Sub-Bar */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#383838] text-xs text-gray-300">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-gray-200">Date Filter:</span>
            <select
              value={dateFilterType}
              onChange={(e) => {
                setDateFilterType(e.target.value as any);
                setPage(1);
              }}
              className="py-1 px-2 text-xs bg-[#1e1e1e] border border-[#444444] rounded text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
            >
              <option value="submission">Submission Date Range (America/Phoenix)</option>
              <option value="approval">Approval Date Range (America/Phoenix)</option>
              <option value="sale">Sale Date Range (America/Phoenix)</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-gray-400">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="py-1 px-2 text-xs bg-[#1e1e1e] border border-[#444444] text-white rounded focus:ring-1 focus:ring-[#95EA00]"
            />
            <span className="text-gray-400">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="py-1 px-2 text-xs bg-[#1e1e1e] border border-[#444444] text-white rounded focus:ring-1 focus:ring-[#95EA00]"
            />
          </div>

          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setPage(1);
              }}
              className="text-[#95EA00] hover:underline text-[11px]"
            >
              Clear dates
            </button>
          )}
        </div>
      </div>


      {/* Ledger Table */}
      <div className="bg-[#2d2d2d] border border-[#444444] rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#1e1e1e] border-b border-[#444444] text-gray-300 uppercase font-semibold text-[10px] tracking-wider select-none">
              <tr>
                <th className="py-3 px-3">Request ID</th>
                <th
                  onClick={() => handleSort('rep')}
                  className="py-3 px-3 cursor-pointer hover:text-white"
                >
                  <div className="flex items-center space-x-1">
                    <span>Sales Rep</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th className="py-3 px-3">Branch</th>
                <th className="py-3 px-3">Forklift Model</th>
                <th className="py-3 px-3">Serial (Last 4)</th>
                <th className="py-3 px-3">Spiff Program</th>
                <th
                  onClick={() => handleSort('amount')}
                  className="py-3 px-3 cursor-pointer hover:text-white"
                >
                  <div className="flex items-center space-x-1">
                    <span>Amount</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th className="py-3 px-3">Sale Date</th>
                <th
                  onClick={() => handleSort('submittedAt')}
                  className="py-3 px-3 cursor-pointer hover:text-white"
                >
                  <div className="flex items-center space-x-1">
                    <span>Submitted (Phoenix)</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th className="py-3 px-3">Status</th>
                <th
                  onClick={() => handleSort('approvedAt')}
                  className="py-3 px-3 cursor-pointer hover:text-white"
                >
                  <div className="flex items-center space-x-1">
                    <span>Approved At / By</span>
                    <ArrowUpDown className="w-3 h-3 text-gray-400" />
                  </div>
                </th>
                <th className="py-3 px-3">Paid At / By</th>
                <th className="py-3 px-3 text-center">Photo</th>
                <th className="py-3 px-3">Notes</th>
                <th className="py-3 px-3 text-right">Decisions & Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#383838] text-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={15} className="py-12 text-center text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#95EA00]" />
                    <span>Loading ledger records...</span>
                  </td>
                </tr>
              ) : submissions.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-12 text-center text-gray-400">
                    <p className="font-semibold text-sm text-gray-200">No matching spiff requests found</p>
                    <p className="text-xs text-gray-400 mt-1">Try clearing filters or submit a new spiff from the rep form.</p>
                  </td>
                </tr>
              ) : (
                submissions.map((sub) => (
                  <tr
                    key={sub.id}
                    className={`hover:bg-[#353535] transition-colors ${
                      sub.isPotentialDuplicate ? 'bg-amber-950/20' : ''
                    }`}
                  >
                    {/* Request ID */}
                    <td className="py-3 px-3 font-mono font-bold text-white whitespace-nowrap">
                      <div className="flex items-center space-x-1">
                        <span className="text-[#95EA00]">{sub.id}</span>
                        {sub.isPotentialDuplicate && (
                          <span
                            title={sub.duplicateReason || 'Potential duplicate flag'}
                            className="text-amber-400 cursor-help"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Rep Name */}
                    <td className="py-3 px-3 font-medium text-white whitespace-nowrap">
                      <div>
                        <span>{sub.snapshotRepName}</span>
                        {sub.snapshotRepEmail && (
                          <span className="block text-[10px] text-gray-400 font-mono truncate max-w-[130px]">
                            {sub.snapshotRepEmail}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Branch */}
                    <td className="py-3 px-3 whitespace-nowrap text-gray-300">
                      {sub.snapshotBranchName || '—'}
                    </td>

                    {/* Lift Name */}
                    <td className="py-3 px-3 max-w-[140px] truncate text-gray-200" title={sub.liftName}>
                      {sub.liftName}
                    </td>

                    {/* Last 4 serial characters */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="font-mono text-xs font-bold bg-[#1e1e1e] text-gray-100 px-1.5 py-0.5 rounded border border-[#444444]">
                        {sub.serialSuffix}
                      </span>
                    </td>

                    {/* Spiff Name */}
                    <td className="py-3 px-3 max-w-[130px] truncate text-gray-200" title={sub.snapshotSpiffName}>
                      {sub.snapshotSpiffName}
                    </td>

                    {/* Spiff Amount */}
                    <td className="py-3 px-3 font-bold text-white whitespace-nowrap">
                      <div>{formatDollars(sub.snapshotAmountCents)}</div>
                      <div className="mt-1 text-[10px] font-medium text-gray-400">
                        Half spiff: {sub.isHalfSpiffAmount ? 'Yes' : 'No'}
                      </div>
                    </td>

                    {/* Sale Date */}
                    <td className="py-3 px-3 whitespace-nowrap text-gray-300">
                      {formatPhoenixDate(sub.saleDate)}
                    </td>

                    {/* Submitted At */}
                    <td className="py-3 px-3 whitespace-nowrap text-gray-400 text-[11px]">
                      {formatPhoenixDateTime(sub.submittedAt)}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {getStatusBadge(sub.status)}
                    </td>

                    {/* Approved Date / By */}
                    <td className="py-3 px-3 whitespace-nowrap text-[11px]">
                      {sub.approvedAt ? (
                        <div>
                          <div className="font-medium text-[#95EA00]">{formatPhoenixDate(sub.approvedAt)}</div>
                          <div className="text-[10px] text-gray-400">{sub.approvedBy}</div>
                        </div>
                      ) : sub.rejectedAt ? (
                        <div className="text-rose-300">
                          <div className="font-medium">Denied</div>
                          <div className="text-[10px] text-gray-400">{sub.rejectedBy}</div>
                        </div>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>

                    {/* Paid Date / By */}
                    <td className="py-3 px-3 whitespace-nowrap text-[11px]">
                      {sub.paidAt ? (
                        <div>
                          <div className="font-medium text-purple-300">{formatPhoenixDate(sub.paidAt)}</div>
                          <div className="text-[10px] text-gray-400">{sub.paidBy}</div>
                        </div>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>

                    {/* Photo column */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {getSubmissionPhotos(sub).length > 0 ? (
                        <button
                          onClick={() => onViewPhoto(sub)}
                          className="inline-flex items-center space-x-1 text-[#95EA00] hover:text-[#83cc00] font-semibold text-[11px] hover:underline"
                          aria-label={`View photos (${getSubmissionPhotos(sub).length}) for ${sub.id}`}
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>View photos ({getSubmissionPhotos(sub).length})</span>
                        </button>
                      ) : (
                        <span className="text-gray-400 text-[11px]">No photo</span>
                      )}
                    </td>

                    {/* Notes */}
                    <td className="py-3 px-3 max-w-[110px] truncate text-gray-400" title={sub.notes || ''}>
                      {sub.notes || '—'}
                    </td>

                    {/* Decisions & Actions Column */}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end space-x-1.5">
                        {sub.status === 'Pending' && !isGeneralManager ? (
                          <>
                            {/* APPROVE BUTTON: Distinct label + icon */}
                            <button
                              onClick={() => onApproveClick(sub)}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-bold text-black bg-[#95EA00] hover:bg-[#83cc00] rounded shadow-sm transition-colors"
                              title="Approve spiff and notify recipients"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </button>

                            {/* DENY BUTTON: Distinct label + icon */}
                            <button
                              onClick={() => onDenyClick(sub)}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded shadow-sm transition-colors"
                              title="Deny spiff with required reason and notify recipients"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Deny</span>
                            </button>

                            {/* Review */}
                            <button
                              onClick={() => onOpenDetail(sub)}
                              className="p-1 text-gray-300 hover:text-white hover:bg-[#383838] rounded border border-[#444444]"
                              title="View full request details"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </>
                        ) : sub.status === 'Approved' && isGeneralManager ? (
                          <>
                            <LedgerMarkPaidAction
                              submission={sub}
                              adminRole={adminRole}
                              onMarkPaid={onMarkPaid}
                            />
                            <button
                              onClick={() => onOpenDetail(sub)}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-gray-200 bg-[#1e1e1e] hover:bg-[#383838] border border-[#444444] rounded transition-colors"
                            >
                              <span>Review</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => onOpenDetail(sub)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-gray-200 bg-[#1e1e1e] hover:bg-[#383838] border border-[#444444] rounded transition-colors"
                          >
                            <span>Review</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                        {adminRole === 'Administrator' && (
                          <button
                            onClick={() => handleDeleteSubmission(sub)}
                            disabled={deletingSubmissionId === sub.id}
                            className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors disabled:opacity-50"
                            title="Permanently delete submission"
                            aria-label={`Permanently delete submission ${sub.id}`}
                          >
                            {deletingSubmissionId === sub.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Trash2 className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#444444] px-4 py-3 text-xs">
          <div className="flex items-center gap-2 text-gray-300">
            <label htmlFor="spiffs-per-page" className="font-medium">Spiffs per page</label>
            <select
              id="spiffs-per-page"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value) as 10 | 50 | 100);
                setPage(1);
              }}
              className="rounded border border-[#444444] bg-[#1e1e1e] px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
            >
              <option value={10}>10</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="ml-2" aria-live="polite">
              Showing {firstItem}–{lastItem} of {totalCount} spiffs
            </span>
          </div>
          <nav className="flex items-center gap-1" aria-label="Ledger pagination">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || isLoading}
              className="rounded border border-[#444444] px-2.5 py-1 text-gray-200 hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            {pageNumbers.map((pageNumber) =>
              typeof pageNumber === 'number' ? (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => setPage(pageNumber)}
                  aria-current={pageNumber === page ? 'page' : undefined}
                  className={`min-w-8 rounded border px-2 py-1 ${
                    pageNumber === page
                      ? 'border-[#95EA00] bg-[#95EA00]/15 text-[#95EA00]'
                      : 'border-[#444444] text-gray-200 hover:bg-[#383838]'
                  }`}
                >
                  {pageNumber}
                </button>
              ) : (
                <span key={pageNumber} className="px-1 text-gray-500" aria-hidden="true">…</span>
              )
            )}
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages || isLoading}
              className="rounded border border-[#444444] px-2.5 py-1 text-gray-200 hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
};
