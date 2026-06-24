/**
 * Worker process entrypoint.
 *
 * Responsibility:
 *  - Start the notification BullMQ worker (startWorker()) and the outbox relay
 *    loop (startRelay()).
 *  - This is the SEPARATE async process from the API — it scales independently
 *    (e.g. on queue depth) so bursty notification/scoring work never degrades
 *    API latency.
 */
