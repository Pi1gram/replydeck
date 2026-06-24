/**
 * BullMQ queue names for the Microsoft Graph integration.
 *
 * Kept in a tiny shared file so the controller, processors, and module
 * registration all reference the same constants — typos here become
 * runtime "queue not found" errors that are painful to debug.
 */

/** Per-user inbox sync triggered by Graph push notifications. */
export const GRAPH_SYNC_QUEUE = "graph-sync";

/** Cron queue that PATCHes subscriptions due to expire soon. */
export const SUBSCRIPTION_RENEWAL_QUEUE = "subscription-renewal";

/**
 * Stable jobId for the recurring renewal cron job. Reusing the same id
 * lets us add the repeatable cleanly (BullMQ dedups repeatables by jobId
 * + cron pattern).
 */
export const SUBSCRIPTION_RENEWAL_CRON_JOB_ID = "subscription-renewal-cron";
