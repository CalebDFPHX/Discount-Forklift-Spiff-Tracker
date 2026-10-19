export const BLOCKED_NOTIFICATION_RECIPIENT_EMAILS = [
  'dallas.manager@discountforkliftphoenix.com',
  'sarah.connor@discountforkliftphoenix.com',
  'carlos.morales@discountforkliftphoenix.com',
  'marcus.vance@discountforkliftphoenix.com',
] as const;

const blockedNotificationRecipientEmails = new Set<string>(
  BLOCKED_NOTIFICATION_RECIPIENT_EMAILS
);

export function isBlockedNotificationRecipient(email: string): boolean {
  return blockedNotificationRecipientEmails.has(email.trim().toLowerCase());
}
