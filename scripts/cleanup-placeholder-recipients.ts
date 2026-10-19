import 'dotenv/config';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, isNeonConfigured, pool, schema } from '../src/db/index';
import {
  BLOCKED_NOTIFICATION_RECIPIENT_EMAILS,
  isBlockedNotificationRecipient,
} from '../src/lib/recipientPolicy';

async function main() {
  if (!isNeonConfigured || !db) {
    throw new Error(
      'DATABASE_URL is not configured. No database records were changed.'
    );
  }

  const result = await db.transaction(async (tx) => {
    const matchingContacts = await tx
      .select({ id: schema.notificationContacts.id })
      .from(schema.notificationContacts)
      .where(
        inArray(
          sql`lower(${schema.notificationContacts.email})`,
          [...BLOCKED_NOTIFICATION_RECIPIENT_EMAILS]
        )
      );

    const now = new Date();
    if (matchingContacts.length > 0) {
      await tx
        .update(schema.notificationContacts)
        .set({ isActive: false, updatedAt: now })
        .where(
          inArray(
            schema.notificationContacts.id,
            matchingContacts.map((contact) => contact.id)
          )
        );
    }

    const contactIds = new Set(matchingContacts.map((contact) => contact.id));
    const reps = await tx
      .select({
        id: schema.salesReps.id,
        assignedGmIds: schema.salesReps.assignedGmIds,
      })
      .from(schema.salesReps);
    let repsUpdated = 0;

    for (const rep of reps) {
      if (!rep.assignedGmIds) continue;
      let assignedIds: string[];
      try {
        const parsed: unknown = JSON.parse(rep.assignedGmIds);
        assignedIds = Array.isArray(parsed)
          ? parsed.filter((id): id is string => typeof id === 'string')
          : rep.assignedGmIds.split(',');
      } catch {
        assignedIds = rep.assignedGmIds.split(',');
      }
      assignedIds = assignedIds.map((id) => id.trim()).filter(Boolean);
      const remainingIds = assignedIds.filter((id) => !contactIds.has(id));
      if (remainingIds.length === assignedIds.length) continue;

      await tx
        .update(schema.salesReps)
        .set({ assignedGmIds: remainingIds.length > 0 ? remainingIds.join(',') : null, updatedAt: now })
        .where(sql`${schema.salesReps.id} = ${rep.id}`);
      repsUpdated++;
    }

    const cancelledJobs = await tx
      .update(schema.emailNotificationJobs)
      .set({
        status: 'cancelled',
        errorMessage: 'Cancelled because this recipient address is no longer eligible for notifications.',
        nextRetryAt: null,
        lockedAt: null,
        lockedBy: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where(
        and(
          inArray(
            sql`lower(${schema.emailNotificationJobs.recipientEmail})`,
            [...BLOCKED_NOTIFICATION_RECIPIENT_EMAILS]
          ),
          inArray(schema.emailNotificationJobs.status, ['queued', 'failed', 'processing'])
        )
      )
      .returning({ id: schema.emailNotificationJobs.id });

    const recipientSetting = await tx
      .select({ value: schema.appSettings.value })
      .from(schema.appSettings)
      .where(eq(schema.appSettings.key, 'notification_recipient_email'))
      .limit(1);
    const routingSettingCleared =
      recipientSetting.length > 0 &&
      isBlockedNotificationRecipient(recipientSetting[0].value);
    if (routingSettingCleared) {
      await tx
        .update(schema.appSettings)
        .set({ value: '', updatedAt: now, updatedBy: 'Recipient cleanup' })
        .where(eq(schema.appSettings.key, 'notification_recipient_email'));
    }

    return {
      contactsDeactivated: matchingContacts.length,
      routingSettingCleared,
      repAssignmentsUpdated: repsUpdated,
      notificationJobsCancelled: cancelledJobs.length,
    };
  });

  console.log('Placeholder-recipient cleanup completed:', result);
}

main()
  .catch((error: unknown) => {
    console.error(
      'Placeholder-recipient cleanup failed. No partial transaction changes were committed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool?.end();
  });
