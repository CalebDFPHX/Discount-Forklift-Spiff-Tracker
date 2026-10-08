/**
 * Discount Forklift Spiff Tracker - Security Sanitizer
 * Parser-based HTML sanitizer using 'sanitize-html' with a restrictive allowlist.
 * Completely eliminates <script>, event handlers (onerror, onload, onclick, etc.),
 * malformed executable attributes (e.g. <img src="x"/onerror=...>), javascript: schemes,
 * iframes, and executable objects.
 */

import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'b', 'strong', 'i', 'em', 'u', 's', 'strike',
  'br', 'hr',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'ul', 'ol', 'li',
  'a', 'img', 'blockquote', 'code', 'pre'
];

/**
 * Validates that an href or src URL uses safe protocols (http, https, mailto).
 * Rejects javascript:, vbscript:, data:, and relative executable schemes after decoding.
 */
export function isSafeUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;

  let decoded = url.trim();
  try {
    decoded = decodeURIComponent(url.trim());
  } catch {
    // If percent-decoding fails, use trimmed
  }

  const normalized = decoded.replace(/[\x00-\x20\s]+/g, '').toLowerCase();

  // Explicitly block executable schemes and protocols
  if (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('file:') ||
    normalized.includes('javascript:')
  ) {
    return false;
  }

  const clean = url.trim();
  return (
    clean.startsWith('https://') ||
    clean.startsWith('http://') ||
    clean.startsWith('mailto:') ||
    clean.startsWith('/') ||
    clean.startsWith('#')
  );
}

/**
 * Strict parser-based sanitizer for email templates, previews, and user content.
 * Parses the DOM tree to strip scripts, event handlers, and unsafe URL schemes.
 */
export function sanitizeEmailHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return '';

  return sanitizeHtml(rawHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      '*': ['style', 'class', 'align', 'valign', 'dir'],
      'a': ['href', 'title', 'target', 'rel'],
      'img': ['src', 'alt', 'title', 'width', 'height', 'border'],
      'table': ['width', 'height', 'cellpadding', 'cellspacing', 'border', 'bgcolor'],
      'td': ['width', 'height', 'colspan', 'rowspan', 'bgcolor'],
      'th': ['width', 'height', 'colspan', 'rowspan', 'bgcolor'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      a: ['http', 'https', 'mailto'],
      img: ['http', 'https'],
    },
    disallowedTagsMode: 'discard',
    transformTags: {
      'a': (tagName, attribs) => {
        const href = attribs.href || '';
        if (!isSafeUrl(href)) {
          return {
            tagName: 'span',
            attribs: { class: 'unsafe-url-neutralized' } as Record<string, string>,
          };
        }
        const updatedAttribs: Record<string, string> = {
          ...attribs,
          rel: 'noopener noreferrer',
          target: '_blank',
        };
        return {
          tagName: 'a',
          attribs: updatedAttribs,
        };
      },
      'img': (tagName, attribs) => {
        const src = attribs.src || '';
        if (!isSafeUrl(src)) {
          return {
            tagName: 'span',
            attribs: { class: 'unsafe-img-neutralized' } as Record<string, string>,
          };
        }
        return {
          tagName: 'img',
          attribs: attribs as Record<string, string>,
        };
      },
    },
  });
}
