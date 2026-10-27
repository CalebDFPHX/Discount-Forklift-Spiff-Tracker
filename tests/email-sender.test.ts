import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatFromHeader,
  inspectSmtpRecipientAcceptance,
} from '../src/lib/resend.js';

describe('configured provider From headers', () => {
  it('uses the branded display name without changing each provider sender address', () => {
    const senderAddresses = [
      ['Gmail', 'sales@gmail.com'],
      ['Outlook', 'notifications@outlook.com'],
      ['Resend', 'notifications@discountforkliftphoenix.com'],
    ] as const;

    for (const [provider, senderAddress] of senderAddresses) {
      assert.equal(
        formatFromHeader(senderAddress),
        `"Discount Forklift Spiff Tracker" <${senderAddress}>`,
        `${provider} From header`
      );
    }
  });

  it('labels SMTP recipient failures with the configured provider', () => {
    const result = inspectSmtpRecipientAcceptance(
      'recipient@example.test',
      [],
      ['recipient@example.test'],
      'outlook_smtp'
    );

    assert.match(result.error || '', /^Outlook SMTP did not accept/);
    assert.match(result.providerResponse, /"provider":"outlook_smtp"/);
  });
});
