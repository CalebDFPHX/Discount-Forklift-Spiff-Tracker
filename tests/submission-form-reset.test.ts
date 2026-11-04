import assert from 'node:assert/strict';
import { after, it } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { getPhoenixTodayString } from '../src/lib/timezone.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
});
class MockFileReader {
  result: string | null = null;
  error: DOMException | null = null;
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;

  readAsDataURL(_file: Blob) {
    this.result = 'data:image/jpeg;base64,dGVzdA==';
    queueMicrotask(() => this.onload?.({} as ProgressEvent<FileReader>));
  }
}
const originalFetch = globalThis.fetch;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  File: { configurable: true, value: dom.window.File },
  FileReader: { configurable: true, value: MockFileReader },
  IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true, writable: true },
});
Object.defineProperty(URL, 'createObjectURL', {
  configurable: true,
  value: () => 'blob:http://localhost/test-photo',
});
Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });

const { createRoot } = await import('react-dom/client');
const { RepSubmissionExperience } = await import('../src/components/RepSubmissionExperience.js');

const savedSubmission = {
  id: 'SPF-SUBMIT-ANOTHER-TEST',
  repId: 'rep_reset_test',
  branchId: 'branch_reset_test',
  spiffId: 'spiff_reset_test',
  liftName: 'Previously Sold Forklift',
  serialSuffix: '6789',
  saleDate: '2026-11-01',
  notes: 'Keep this submitted record unchanged',
  status: 'Pending',
  snapshotRepName: 'Reset Test Rep',
  snapshotRepEmail: 'rep.reset@example.test',
  snapshotSpiffName: 'Reset Test Spiff',
  snapshotEligibilityRequirements: 'Test eligibility',
  snapshotAmountCents: 15000,
  isHalfSpiffAmount: false,
  isPotentialDuplicate: false,
  submittedAt: '2026-11-04T12:00:00.000Z',
  attachments: [{ id: 'attachment_reset_test', originalFilename: 'sale-photo.jpg' }],
  auditEvents: [],
};

const requests: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];
const savedLedgerRecords: Array<typeof savedSubmission> = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method || 'GET';
  const body =
    typeof init?.body === 'string'
      ? (JSON.parse(init.body) as Record<string, unknown>)
      : null;
  requests.push({ url, method, body });

  if (url === '/api/branches') {
    return jsonResponse({
      branches: [{ id: 'branch_reset_test', name: 'Reset Test Branch', isActive: true }],
    });
  }
  if (url === '/api/reps') {
    return jsonResponse({
      reps: [{
        id: 'rep_reset_test',
        name: 'Reset Test Rep',
        email: 'rep.reset@example.test',
        branch: 'Reset Test Branch',
        isActive: true,
      }],
    });
  }
  if (url === '/api/spiffs') {
    return jsonResponse({
      spiffs: [{
        id: 'spiff_reset_test',
        name: 'Reset Test Spiff',
        description: 'Test spiff',
        eligibilityRequirements: 'Test eligibility',
        amountCents: 15000,
        isActive: true,
      }],
    });
  }
  if (url === '/api/upload/authorize') {
    return jsonResponse({ token: 'test-upload-token' });
  }
  if (url === '/api/upload') {
    return jsonResponse({ attachmentId: 'attachment_reset_test' });
  }
  if (url === '/api/submissions') {
    savedLedgerRecords.push(structuredClone(savedSubmission));
    return jsonResponse({ submission: savedSubmission });
  }

  throw new Error(`Unexpected fetch request: ${method} ${url}`);
}) as typeof fetch;

function setValue(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const prototype =
    element.tagName === 'SELECT'
      ? dom.window.HTMLSelectElement.prototype
      : element.tagName === 'TEXTAREA'
        ? dom.window.HTMLTextAreaElement.prototype
        : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  assert.ok(setter, `Native value setter is available for ${element.tagName}.`);
  setter.call(element, value);
}

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(message);
}

after(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: originalCreateObjectURL,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: originalRevokeObjectURL,
  });
  dom.window.close();
});

it('clicking Submit Another opens a clean form and leaves the saved submission unchanged', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let refreshCount = 0;

  await act(async () => {
    root.render(
      React.createElement(RepSubmissionExperience, {
        onAdminLoginClick: () => undefined,
        onRefreshConfig: () => {
          refreshCount += 1;
        },
      })
    );
  });
  await act(async () => {
    await waitFor(
      () => Boolean(container.querySelector('#branchSelect')),
      `The form did not load. Text: ${container.textContent}; requests: ${JSON.stringify(requests)}`
    );
  });

  const change = async (selector: string, value: string) => {
    const element = container.querySelector(selector) as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
      | null;
    assert.ok(element, `Expected form control ${selector}.`);
    await act(async () => {
      setValue(element, value);
      element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
  };

  await change('#branchSelect', 'branch_reset_test');
  await change('#repSelect', 'rep_reset_test');
  await change('#liftName', 'Previously Sold Forklift');
  await change('#serialSuffix', '6789');
  await change('#saleDate', '2026-11-01');
  await change('#spiffSelect', 'spiff_reset_test');
  const halfSpiffCheckbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
  assert.ok(halfSpiffCheckbox);
  await act(async () => {
    halfSpiffCheckbox.click();
  });
  await change('#notes', 'Keep this submitted record unchanged');

  const photoInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  assert.ok(photoInput);
  const photo = new dom.window.File(['sale photo'], 'sale-photo.jpg', { type: 'image/jpeg' });
  Object.defineProperty(photoInput, 'files', { configurable: true, value: [photo] });
  await act(async () => {
    photoInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  await act(async () => {
    await waitFor(
      () => container.textContent?.includes('Upload verified & secured') ?? false,
      `The test photo upload did not finish. Text: ${container.textContent}; requests: ${JSON.stringify(requests)}`
    );
  });

  const submittedForm = container.querySelector('form');
  assert.ok(submittedForm);
  await act(async () => {
    submittedForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  });
  await act(async () => {
    await waitFor(
      () => container.textContent?.includes('Submit Another Forklift Spiff') ?? false,
      'The submission success popup did not open.'
    );
  });

  assert.equal(savedLedgerRecords.length, 1);
  const savedRecordBeforeReset = structuredClone(savedLedgerRecords[0]);
  const anotherButton = Array.from(container.querySelectorAll('button')).find((button) =>
    button.textContent?.includes('Submit Another Forklift Spiff')
  );
  assert.ok(anotherButton);
  await act(async () => {
    anotherButton.click();
  });
  await act(async () => {
    await waitFor(
      () => !container.textContent?.includes('Submit Another Forklift Spiff') &&
        (container.querySelector('#branchSelect') as HTMLSelectElement | null)?.value === '',
      'The success popup did not close or the form was not reset.'
    );
  });

  assert.equal((container.querySelector('#branchSelect') as HTMLSelectElement).value, '');
  assert.equal((container.querySelector('#repSelect') as HTMLSelectElement).value, '');
  assert.equal((container.querySelector('#liftName') as HTMLInputElement).value, '');
  assert.equal((container.querySelector('#serialSuffix') as HTMLInputElement).value, '');
  assert.equal(
    (container.querySelector('#saleDate') as HTMLInputElement).value,
    getPhoenixTodayString()
  );
  assert.equal((container.querySelector('#spiffSelect') as HTMLSelectElement).value, '');
  assert.equal((container.querySelector('input[type="checkbox"]') as HTMLInputElement).checked, false);
  assert.equal((container.querySelector('#notes') as HTMLTextAreaElement).value, '');
  assert.equal((container.querySelector('input[type="file"]') as HTMLInputElement).value, '');
  assert.match(container.textContent || '', /0\/5 photos/);
  assert.doesNotMatch(container.textContent || '', /Please Review|Upload Issue/);
  assert.equal(
    Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Submit Spiff Request')
    )?.disabled,
    false
  );
  assert.equal(refreshCount, 1);
  assert.equal(requests.filter((request) => request.url === '/api/submissions').length, 1);
  assert.equal(requests.some((request) => request.method === 'DELETE'), false);
  assert.deepEqual(savedLedgerRecords[0], savedRecordBeforeReset);

  await act(async () => root.unmount());
  container.remove();
});
