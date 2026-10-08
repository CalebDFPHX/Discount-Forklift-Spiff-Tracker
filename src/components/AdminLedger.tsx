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
} from 'lucide-react';
import { SpiffSubmission, SalesRep } from '../lib/repository';
import { formatDollars } from '../lib/formatters';
import { formatPhoenixDate, formatPhoenixDateTime } from '../lib/timezone';
import { adminFetch } from '../lib/api';

interface AdminLedgerProps {
  adminUser: string;
  onOpenDetail: (submission: SpiffSubmission) => void;
  onViewPhoto: (submission: SpiffSubmission) => void;
  onApproveClick: (submission: SpiffSubmission) => void;
  onDenyClick: (submission: SpiffSubmission) => void;
  reps: SalesRep[];
  refreshTrigger?: number;
}

export const AdminLedger: React.FC<AdminLedgerProps> = ({
  adminUser,
  onOpenDetail,
  onViewPhoto,
  onApproveClick,
  onDenyClick,
  reps,
  refreshTrigger,
}) => {
  const [submissions, setSubmissions] = useState<SpiffSubmission[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

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

      const res = await adminFetch(`/api/admin/submissions?${params.toString()}`);
      const data = await res.json();
      setSubmissions(data.submissions || []);
      setSummary(data.summary || null);
    } catch (err) {
      console.error('Failed to load submissions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, [selectedRep, selectedStatus, dateFilterType, startDate, endDate, searchQuery, sortBy, sortOrder, refreshTrigger]);

  const handleSort = (field: 'submittedAt' | 'approvedAt' | 'rep' | 'amount') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleResetFilters = () => {
    setSelectedRep('all');
    setSelectedStatus('all');
    setDateFilterType('submission');
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
    setSortBy('submittedAt');
    setSortOrder('desc');
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
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#1e1e1e] border border-[#444444] rounded-lg text-white placeholder-gray-500 focus:bg-[#181818] focus:outline-none focus:ring-1 focus:ring-[#95EA00] focus:border-[#95EA00]"
            />
          </div>

          {/* Rep filter */}
          <div>
            <select
              value={selectedRep}
              onChange={(e) => setSelectedRep(e.target.value)}
              className="w-full py-1.5 px-2.5 text-xs bg-[#1e1e1e] border border-[#444444] rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-[#95EA00]"
            >
              <option value="all">All Sales Reps</option>
              {reps.map((r) => (
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
              onChange={(e) => setSelectedStatus(e.target.value)}
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
            <button
              onClick={handleExportCsv}
              className="flex-1 inline-flex items-center justify-center space-x-1.5 py-1.5 px-3 bg-[#A559BD] hover:bg-[#934da9] text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
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
              onChange={(e) => setDateFilterType(e.target.value as any)}
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
              onChange={(e) => setStartDate(e.target.value)}
              className="py-1 px-2 text-xs bg-[#1e1e1e] border border-[#444444] text-white rounded focus:ring-1 focus:ring-[#95EA00]"
            />
            <span className="text-gray-400">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="py-1 px-2 text-xs bg-[#1e1e1e] border border-[#444444] text-white rounded focus:ring-1 focus:ring-[#95EA00]"
            />
          </div>

          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
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
                  <td colSpan={14} className="py-12 text-center text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#95EA00]" />
                    <span>Loading ledger records...</span>
                  </td>
                </tr>
              ) : submissions.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-gray-400">
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
                      {formatDollars(sub.snapshotAmountCents)}
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
                      {sub.attachment ? (
                        <button
                          onClick={() => onViewPhoto(sub)}
                          className="inline-flex items-center space-x-1 text-[#95EA00] hover:text-[#83cc00] font-semibold text-[11px] hover:underline"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>View Photo</span>
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
                        {sub.status === 'Pending' ? (
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
                        ) : (
                          <button
                            onClick={() => onOpenDetail(sub)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-gray-200 bg-[#1e1e1e] hover:bg-[#383838] border border-[#444444] rounded transition-colors"
                          >
                            <span>Review</span>
                            <ChevronRight className="w-3 h-3" />
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
      </div>
    </div>
  );
};
