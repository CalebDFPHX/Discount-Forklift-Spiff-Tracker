/**
 * Timezone helpers for America/Phoenix (MST, UTC-7, No Daylight Saving Time).
 */

export const TIMEZONE = 'America/Phoenix';

/**
 * Format a Date or ISO timestamp into America/Phoenix human-readable string.
 * Example: "Oct 7, 2026, 4:02 PM MST"
 */
export function formatPhoenixDateTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '—';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '—';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

/**
 * Format a Date or date string into America/Phoenix date only.
 * Example: "Oct 7, 2026"
 */
export function formatPhoenixDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '—';
  // If input is YYYY-MM-DD from an input or SQL date, parse carefully without local timezone offset skew
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [year, month, day] = dateInput.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d);
  }

  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '—';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

/**
 * Get current date in America/Phoenix as YYYY-MM-DD for form default values.
 */
export function getPhoenixTodayString(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

/**
 * Check if a given UTC date falls within a start/end date range defined in America/Phoenix.
 */
export function isWithinPhoenixDateRange(
  targetDate: string | Date | null | undefined,
  startDateStr?: string, // YYYY-MM-DD
  endDateStr?: string    // YYYY-MM-DD
): boolean {
  if (!targetDate) return false;
  const d = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
  if (isNaN(d.getTime())) return false;

  const targetPhoenixDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

  if (startDateStr && targetPhoenixDateStr < startDateStr) return false;
  if (endDateStr && targetPhoenixDateStr > endDateStr) return false;
  return true;
}

/**
 * Computes exact UTC Date boundaries for a date or date range in America/Phoenix (UTC-7).
 * The end boundary is exclusive to ensure all timestamps on the selected end date are included.
 */
export function getPhoenixDateRangeUtcBounds(
  startDateStr?: string, // YYYY-MM-DD
  endDateStr?: string    // YYYY-MM-DD
): { startUtc: Date | null; endExclusiveUtc: Date | null } {
  let startUtc: Date | null = null;
  let endExclusiveUtc: Date | null = null;

  if (startDateStr && /^\d{4}-\d{2}-\d{2}$/.test(startDateStr)) {
    const [y, m, d] = startDateStr.split('-').map(Number);
    // 00:00:00 Phoenix is 07:00:00 UTC
    startUtc = new Date(Date.UTC(y, m - 1, d, 7, 0, 0));
  }

  if (endDateStr && /^\d{4}-\d{2}-\d{2}$/.test(endDateStr)) {
    const [y, m, d] = endDateStr.split('-').map(Number);
    // Start of the day after in Phoenix: 00:00:00 Phoenix (+1 day) = 07:00:00 UTC (+1 day)
    endExclusiveUtc = new Date(Date.UTC(y, m - 1, d + 1, 7, 0, 0));
  }

  return { startUtc, endExclusiveUtc };
}

