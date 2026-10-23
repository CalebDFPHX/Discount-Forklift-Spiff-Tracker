import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { Attachment } from '../src/lib/repository.js';

process.env.NODE_ENV = 'test';
process.env.AUTH_SECRET = 'unit-test-only-photo-secret';
process.env.DATABASE_URL = '';
delete process.env.BLOB_READ_WRITE_TOKEN;

const { Repository, memoryStore } = await import('../src/lib/repository.js');
const { createSessionToken } = await import('../src/lib/sessionAuth.js');
const { deleteBlobPhoto } = await import('../src/lib/blob.js');
const { getRepsForBranch, retainRepForBranch } = await import('../src/lib/branchAssignments.js');
const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { PhotoPreviewModal } = await import('../src/components/PhotoPreviewModal.js');
const {
  addPhoto,
  canAddPhoto,
  getPhotoCountError,
  getSubmissionPhotos,
  MAX_SUBMISSION_PHOTOS,
  removePhoto,
} = await import('../src/lib/photoAttachments.js');
const { default: app } = await import('../src/server/app.js');

const testRepId = 'photo_test_rep';
const testSpiffId = 'photo_test_spiff';
const testApproverId = 'photo_test_approver';
const testBranchId = 'br_photo_test';
const testSubmissionIds = new Set<string>();
const testAttachmentIds = new Set<string>();
const testStorageKeys = new Set<string>();
let originalDispatchJob: typeof Repository.dispatchJob;
let attachmentSequence = 0;

const jpegBytes = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);

function resetFixtures() {
  const now = new Date().toISOString();
  memoryStore.reps = memoryStore.reps.filter((rep) => rep.id !== testRepId);
  memoryStore.branches = memoryStore.branches.filter((branch) => branch.id !== testBranchId);
  memoryStore.reps.push({
    id: testRepId,
    name: 'Photo Test Rep',
    email: 'photo-rep@example.test',
    branch: 'Photo Test Branch',
    isActive: true,
    displayOrder: 999,
    createdAt: now,
    updatedAt: now,
  });
  memoryStore.branches = memoryStore.branches.filter((branch) => branch.id !== testBranchId);
  memoryStore.branches.push({
    id: testBranchId,
    name: 'Photo Test Branch',
    isActive: true,
    displayOrder: 999,
    createdAt: now,
    updatedAt: now,
  });
  memoryStore.spiffs = memoryStore.spiffs.filter((spiff) => spiff.id !== testSpiffId);
  memoryStore.spiffs.push({
    id: testSpiffId,
    name: 'Photo Test Spiff',
    description: 'Test-only spiff',
    eligibilityRequirements: 'Test-only requirements',
    amountCents: 10000,
    isActive: true,
    displayOrder: 999,
    createdAt: now,
    updatedAt: now,
  });
  memoryStore.contacts = memoryStore.contacts.filter((contact) => contact.id !== testApproverId);
  memoryStore.contacts.push({
    id: testApproverId,
    name: 'Photo Test Approver',
    email: 'photo-approver@example.test',
    role: 'Approving Manager',
    branch: 'Photo Test Branch',
    isDefaultAccounting: false,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  originalDispatchJob = Repository.dispatchJob;
  Repository.dispatchJob = async (jobId) => {
    const job = memoryStore.emailJobs.find((candidate) => candidate.id === jobId);
    if (!job) throw new Error('Expected a test-only notification job.');
    return job;
  };
  attachmentSequence = 0;
}

async function uploadTestPhoto(baseUrl: string): Promise<string> {
  attachmentSequence += 1;
  const response = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-upload-token': 'test-only-upload-token',
    },
    body: JSON.stringify({
      filename: `photo-${attachmentSequence}.jpg`,
      contentType: 'image/jpeg',
      fileBase64: jpegBytes.toString('base64'),
      uploadToken: 'test-only-upload-token',
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  testAttachmentIds.add(body.attachmentId);
  const attachment = await Repository.getAttachment(body.attachmentId);
  assert.ok(attachment);
  testStorageKeys.add(attachment.storageKey);
  return body.attachmentId;
}

function submissionInput(attachmentIds: string[]) {
  return {
    repId: testRepId,
    branchId: testBranchId,
    spiffId: testSpiffId,
    liftName: 'Unit Test Lift',
    serialSuffix: 'XY99',
    saleDate: '2026-10-23',
    attachmentIds,
    idempotencyKey: `photo-test-${Date.now()}-${Math.random()}`,
    appUrl: 'https://photo-test.example',
  };
}

async function withServer<T>(callback: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

beforeEach(resetFixtures);

afterEach(async () => {
  Repository.dispatchJob = originalDispatchJob;
  memoryStore.reps = memoryStore.reps.filter((rep) => rep.id !== testRepId);
  memoryStore.spiffs = memoryStore.spiffs.filter((spiff) => spiff.id !== testSpiffId);
  memoryStore.contacts = memoryStore.contacts.filter((contact) => contact.id !== testApproverId);
  memoryStore.attachments = memoryStore.attachments.filter((attachment) => !testAttachmentIds.has(attachment.id));
  memoryStore.submissions = memoryStore.submissions.filter((submission) => !testSubmissionIds.has(submission.id));
  memoryStore.emailJobs = memoryStore.emailJobs.filter((job) => !testSubmissionIds.has(job.submissionId));
  await Promise.all([...testStorageKeys].map((storageKey) => deleteBlobPhoto(storageKey)));
  testAttachmentIds.clear();
  testSubmissionIds.clear();
  testStorageKeys.clear();
});

describe('photo attachment limits and form state', () => {
  it('filters active reps by the selected active branch and clears an ineligible rep on branch change', () => {
    const testRep = memoryStore.reps.find((rep) => rep.id === testRepId)!;
    const otherRep = {
      ...testRep,
      id: 'photo_test_other_branch_rep',
      branch: 'Tucson Branch',
    };
    const inactiveRep = { ...testRep, id: 'photo_test_inactive_rep', isActive: false };
    const branches = memoryStore.branches;
    assert.deepEqual(
      getRepsForBranch([testRep, otherRep, inactiveRep], branches, testBranchId).map((rep) => rep.id),
      [testRepId]
    );
    assert.equal(retainRepForBranch(testRepId, testBranchId, [testRep], branches), testRepId);
    assert.equal(retainRepForBranch(testRepId, 'br_tucson', [testRep], branches), '');
  });

  it('requires at least one photo, allows five, and blocks a sixth addition', () => {
    assert.match(getPhotoCountError(0) || '', /attach a sale photo/i);
    assert.equal(getPhotoCountError(1), null);
    assert.equal(getPhotoCountError(5), null);
    assert.match(getPhotoCountError(6) || '', /maximum of 5/i);

    let photos: Array<{ key: string }> = [];
    for (let index = 0; index < 6; index += 1) {
      photos = addPhoto(photos, { key: `photo-${index}` });
    }
    assert.equal(photos.length, MAX_SUBMISSION_PHOTOS);
    assert.equal(canAddPhoto(photos.length), false);
    photos = removePhoto(photos, 'photo-2');
    assert.equal(photos.some((photo) => photo.key === 'photo-2'), false);
    assert.equal(canAddPhoto(photos.length), true);
  });

  it('uses the legacy single attachment when a submission has no attachment list', () => {
    const legacyAttachment: Attachment = {
      id: 'legacy-photo-id',
      submissionId: 'SPF-LEGACY',
      storageKey: 'legacy-photo-storage',
      originalFilename: 'legacy-sale.jpg',
      contentType: 'image/jpeg',
      fileSizeBytes: jpegBytes.length,
      uploadStatus: 'linked',
      uploadedAt: new Date().toISOString(),
    };
    assert.deepEqual(getSubmissionPhotos({ attachment: legacyAttachment }), [legacyAttachment]);
    assert.deepEqual(getSubmissionPhotos({ attachments: [legacyAttachment], attachment: null }), [legacyAttachment]);

    const markup = renderToStaticMarkup(createElement(PhotoPreviewModal, {
      isOpen: true,
      onClose: () => {},
      attachment: legacyAttachment,
      requestId: 'SPF-LEGACY',
      adminUser: 'admin@example.test',
    }));
    assert.match(markup, /Sale Photos \(1\)/);
    assert.match(markup, /\/api\/admin\/attachments\/legacy-photo-id\/view/);
    assert.match(markup, /legacy-sale\.jpg/);
  });
});

describe('photo submission and reviewer access', () => {
  it('rejects a submission when the rep is assigned to a different branch', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...submissionInput(['not-uploaded-test-photo']),
          branchId: 'br_tucson',
        }),
      });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /not assigned to the selected branch/i);
    });
  });

  it('rejects no-photo submissions and submits one selected photo', async () => {
    await assert.rejects(
      Repository.createSubmission(submissionInput([])),
      /attach a sale photo/i
    );
    await withServer(async (baseUrl) => {
      const noPhotoResponse = await fetch(`${baseUrl}/api/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionInput([])),
      });
      assert.equal(noPhotoResponse.status, 400);
      assert.match((await noPhotoResponse.json()).error, /attach a sale photo/i);

      const attachmentId = await uploadTestPhoto(baseUrl);
      const response = await fetch(`${baseUrl}/api/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionInput([attachmentId])),
      });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.equal(body.submission.branchId, testBranchId);
      assert.equal(body.submission.snapshotBranchName, 'Photo Test Branch');
      assert.equal(body.submission.attachments.length, 1);
      assert.equal(body.submission.attachment.id, attachmentId);
      assert.equal(body.submission.attachments[0].submissionId, body.submission.id);
      testSubmissionIds.add(body.submission.id);
    });
  });

  it('accepts five photos, blocks a sixth server-side, links all five, and limits reviewer access', async () => {
    const allAssertionsPassed = await withServer(async (baseUrl) => {
      const sixAttachmentIds = await Promise.all(
        Array.from({ length: 6 }, () => uploadTestPhoto(baseUrl))
      );
      const sixthPhotoResponse = await fetch(`${baseUrl}/api/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionInput(sixAttachmentIds)),
      });
      assert.equal(sixthPhotoResponse.status, 400);
      assert.match((await sixthPhotoResponse.json()).error, /maximum of 5/i);

      const submissionResponse = await fetch(`${baseUrl}/api/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionInput(sixAttachmentIds.slice(0, 5))),
      });
      const submissionBody = await submissionResponse.json();
      assert.equal(submissionResponse.status, 200, JSON.stringify(submissionBody));
      const submissionId = submissionBody.submission.id as string;
      testSubmissionIds.add(submissionId);

      const saved = await Repository.getSubmissionById(submissionId);
      assert.deepEqual(saved?.attachments?.map((attachment) => attachment.id), sixAttachmentIds.slice(0, 5));
      assert.ok(saved?.attachments?.every((attachment) => (
        attachment.submissionId === submissionId && attachment.uploadStatus === 'linked'
      )));

      const adminToken = createSessionToken('caleb@discountforkliftphoenix.com', 'Photo Test Admin', 'Administrator');
      const authHeaders = { Authorization: `Bearer ${adminToken}` };
      const detailsResponse = await fetch(`${baseUrl}/api/admin/submissions/${submissionId}`, {
        headers: authHeaders,
      });
      assert.equal(detailsResponse.status, 200);
      const detailsBody = await detailsResponse.json();
      assert.equal(detailsBody.submission.snapshotBranchName, 'Photo Test Branch');
      assert.deepEqual(detailsBody.submission.attachments.map((attachment: { id: string }) => attachment.id), sixAttachmentIds.slice(0, 5));

      const ledgerResponse = await fetch(`${baseUrl}/api/admin/submissions`, {
        headers: authHeaders,
      });
      assert.equal(ledgerResponse.status, 200);
      const ledgerBody = await ledgerResponse.json();
      const ledgerSubmission = ledgerBody.submissions.find(
        (submission: { id: string }) => submission.id === submissionId
      );
      assert.equal(ledgerSubmission.snapshotBranchName, 'Photo Test Branch');
      assert.deepEqual(
        ledgerSubmission.attachments.map((attachment: { id: string }) => attachment.id),
        sixAttachmentIds.slice(0, 5)
      );

      const gallery = renderToStaticMarkup(createElement(PhotoPreviewModal, {
        isOpen: true,
        onClose: () => {},
        attachments: ledgerSubmission.attachments,
        requestId: submissionId,
        adminUser: 'caleb@discountforkliftphoenix.com',
      }));
      for (const attachmentId of sixAttachmentIds.slice(0, 5)) {
        assert.ok(gallery.includes(`/api/admin/attachments/${attachmentId}/view`));
      }
      assert.equal((gallery.match(/<img /g) || []).length, 5);

      for (const attachmentId of sixAttachmentIds.slice(0, 5)) {
        const unauthorized = await fetch(`${baseUrl}/api/admin/attachments/${attachmentId}/view`);
        assert.equal(unauthorized.status, 401);

        const viewResponse = await fetch(`${baseUrl}/api/admin/attachments/${attachmentId}/view`, {
          headers: authHeaders,
        });
        assert.equal(viewResponse.status, 200);
        assert.deepEqual(Buffer.from(await viewResponse.arrayBuffer()), jpegBytes);
      }
      return true;
    });
    assert.equal(allAssertionsPassed, true);
  });
});
