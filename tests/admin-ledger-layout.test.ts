import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SpiffSubmission } from '../src/lib/repository.js';
import { LedgerSubmissionRow } from '../src/components/AdminLedger.js';

const longName = 'Alexandria-Cassandra Sales Representative With A Long Name';
const longEmail = 'alexandria.cassandra.sales.representative@example.test';
const longBranch = 'North Phoenix and Scottsdale Regional Distribution Location';
const longNotes = 'Customer requested coordinated delivery across multiple sites; confirm timing with the entire sales team before finalizing paperwork.';

const submission: SpiffSubmission = {
  id: 'SPF-2026-RESPONSIVE-001',
  repId: 'rep_responsive',
  branchId: 'branch_responsive',
  spiffId: 'spiff_responsive',
  liftName: 'Long-Reach Electric Counterbalance Forklift Model XZ-9400',
  serialSuffix: '9876',
  saleDate: '2026-10-18',
  notes: longNotes,
  status: 'Approved',
  snapshotRepName: longName,
  snapshotRepEmail: longEmail,
  snapshotBranchName: longBranch,
  snapshotSpiffName: 'Quarterly High-Capacity Electric Forklift Incentive Program',
  snapshotEligibilityRequirements: '',
  snapshotAmountCents: 125000,
  isHalfSpiffAmount: true,
  pandadocsSigned: true,
  isPotentialDuplicate: false,
  submittedAt: '2026-10-19T12:00:00.000Z',
  approvedAt: '2026-10-20T12:00:00.000Z',
  approvedBy: 'Approving Manager',
  paidAt: null,
  paidBy: null,
  attachments: [{
    id: 'photo-1',
    submissionId: 'SPF-2026-RESPONSIVE-001',
    storageKey: 'photos/responsive-test.jpg',
    originalFilename: 'responsive-test.jpg',
    contentType: 'image/jpeg',
    fileSizeBytes: 1024,
    uploadStatus: 'linked',
    uploadedAt: '2026-10-19T12:00:00.000Z',
  }],
};

function renderRow(adminRole = 'General Manager') {
  return renderToStaticMarkup(
    React.createElement(LedgerSubmissionRow, {
      submission,
      adminRole,
      onOpenDetail: () => undefined,
      onViewPhoto: () => undefined,
      onApproveClick: () => undefined,
      onDenyClick: () => undefined,
      onMarkPaid: async () => undefined,
      onDeleteSubmission: () => undefined,
      isDeleting: false,
    })
  );
}

describe('responsive ledger layout', () => {
  it('keeps every submission field visible in wrapped desktop columns and labeled mobile cards', () => {
    const markup = renderRow();

    for (const value of [
      longName,
      longEmail,
      longBranch,
      submission.liftName,
      submission.serialSuffix,
      submission.snapshotSpiffName,
      '$1,250.00',
      'Half spiff: Yes',
      'Pandadocs signed: Yes',
      'Sale:',
      'Submitted:',
      'Approved:',
      'Approving Manager',
      'Paid: —',
      longNotes,
      'View photos (1)',
    ]) {
      assert.ok(markup.includes(value), `Expected ledger row to include ${value}`);
    }

    for (const label of [
      'Request / Payment',
      'Sales Rep / Branch',
      'Forklift / Serial',
      'Spiff Details',
      'Sale / Submitted',
      'Status',
      'Approval / Payment',
      'Notes / Photos / Actions',
    ]) {
      assert.ok(markup.includes(label), `Expected mobile card to label ${label}`);
    }

    assert.match(markup, /lg:table-row/);
    assert.match(markup, /lg:table-cell/);
    assert.match(markup, /overflow-wrap:anywhere/);
    assert.equal((markup.match(/<td /g) ?? []).length, 8);
    assert.doesNotMatch(markup, /truncate/);
    assert.match(markup, /Mark as Paid/);
    assert.match(markup, />Review</);
  });

  it('keeps approval decisions available to administrators in the responsive row', () => {
    const pendingSubmission: SpiffSubmission = { ...submission, status: 'Pending', approvedAt: null };
    const markup = renderToStaticMarkup(
      React.createElement(LedgerSubmissionRow, {
        submission: pendingSubmission,
        adminRole: 'Administrator',
        onOpenDetail: () => undefined,
        onViewPhoto: () => undefined,
        onApproveClick: () => undefined,
        onDenyClick: () => undefined,
        onMarkPaid: async () => undefined,
        onDeleteSubmission: () => undefined,
        isDeleting: false,
      })
    );

    assert.match(markup, />Approve</);
    assert.match(markup, />Deny</);
    assert.match(markup, /Permanently delete submission/);
  });
});
