import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_EMAIL_TEMPLATES,
  renderEmailTemplate,
  SAMPLE_TEMPLATE_DATA,
} from '../src/lib/emailTemplates.js';

const payoutTemplates = [
  'new_submission',
  'spiff_approved',
  'spiff_denied',
  'spiff_approved_paid_receipt',
] as const;

describe('spiff amount template rendering', () => {
  for (const isHalfSpiffAmount of [false, true]) {
    it(`shows the saved ${isHalfSpiffAmount ? 'half' : 'full'} payout and indicator in all templates`, () => {
      const amount = isHalfSpiffAmount ? '$12.51' : '$25.01';
      const data = {
        ...SAMPLE_TEMPLATE_DATA,
        spiff_amount: amount,
        half_spiff_amount: isHalfSpiffAmount ? 'Yes' : 'No',
      };

      for (const templateId of payoutTemplates) {
        const rendered = renderEmailTemplate(
          DEFAULT_EMAIL_TEMPLATES[templateId],
          data,
          true
        );
        assert.ok(rendered.bodyHtml.includes(amount), `${templateId} payout amount`);
        assert.match(
          rendered.bodyHtml,
          new RegExp(`Half Spiff Amount<\\/td>\\s*<td[^>]*>${data.half_spiff_amount}<\\/td>`),
          `${templateId} half-spiff indicator`
        );
      }
    });
  }

  it('adds payout values when rendering a saved template without the new indicator placeholder', () => {
    const rendered = renderEmailTemplate(
      {
        id: 'spiff_approved',
        subject: 'Approved {{spiff_amount}}',
        bodyHtml: '<p>Approved payout: {{spiff_amount}}</p>',
      },
      {
        ...SAMPLE_TEMPLATE_DATA,
        spiff_amount: '$12.51',
        half_spiff_amount: 'Yes',
      },
      false
    );

    assert.ok(rendered.bodyHtml.includes('$12.51'));
    assert.match(rendered.bodyHtml, /Half Spiff Amount[\s\S]*Yes/);
  });
});
