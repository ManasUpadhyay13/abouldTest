/**
 * Notification service — delivery logic + outbox relay.
 *
 * Responsibility:
 *  - Own the BullMQ "notifications" queue.
 *  - deliver(): persist an in-app notification row (idempotent via dedupeKey),
 *    publish to the per-user Redis pub/sub channel (for SSE/WebSocket in-app
 *    delivery), and invoke the push provider (FCM/APNs — mocked here).
 *  - relayOnce(): the transactional-outbox relay — claim unprocessed Outbox rows,
 *    enqueue a delivery job for each, and mark them processed. This guarantees an
 *    event committed in a business transaction is never lost.
 *
 * Planned exports:
 *  - QUEUE_NAME: string
 *  - notificationQueue: Queue
 *  - deliver(job: { userId, type, title, body, data?, dedupeKey }): Promise<void>
 *  - relayOnce(batchSize?): Promise<number>   // returns number of rows relayed
 */
