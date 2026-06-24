/**
 * Notification worker — BullMQ consumer.
 *
 * Responsibility:
 *  - Boot a BullMQ Worker on the "notifications" queue that runs deliver() per job.
 *  - Configure resilience: attempts = 5 with exponential backoff; jobs that
 *    exhaust their retries remain in the failed set, which acts as the
 *    dead-letter queue (DLQ) for inspection/replay.
 *  - Log failures for observability.
 *
 * Planned exports:
 *  - startWorker(): Worker
 */
