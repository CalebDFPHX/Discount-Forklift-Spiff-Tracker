/**
 * Currency and string formatting helpers
 */

/**
 * Format integer cents into a USD currency string.
 * Example: 5000 -> "$50.00", 12500 -> "$125.00"
 */
export function formatDollars(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || isNaN(cents)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

/**
 * Parse a dollar input (e.g. "125.50" or "$125") into integer cents (12550).
 */
export function parseDollarsToCents(val: string | number): number {
  if (typeof val === 'number') return Math.round(val * 100);
  const clean = val.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(clean);
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

/**
 * Format file size in bytes to human-readable string (KB / MB).
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Validate serial number suffix: exactly 4 alphanumeric characters, preserves leading zeros.
 */
export function validateSerialSuffix(val: string): { isValid: boolean; normalized: string; error?: string } {
  const trimmed = (val || '').trim().toUpperCase();
  if (trimmed.length !== 4) {
    return {
      isValid: false,
      normalized: trimmed,
      error: 'Serial suffix must be exactly 4 characters (e.g. 0042, 9X12).',
    };
  }
  if (!/^[A-Z0-9]{4}$/.test(trimmed)) {
    return {
      isValid: false,
      normalized: trimmed,
      error: 'Serial suffix can only contain letters and numbers.',
    };
  }
  return { isValid: true, normalized: trimmed };
}
