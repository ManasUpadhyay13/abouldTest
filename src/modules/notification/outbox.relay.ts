/**
 * Outbox relay loop.
 *
 * Responsibility:
 *  - Periodically call notification.service.relayOnce() to drain the outbox
 *    table into the notification queue.
 *  - Run as a simple poll loop (interval configurable); errors are logged and
 *    the loop continues.
 *
 * Planned exports:
 *  - startRelay(intervalMs?): () => void   // returns a stop function
 *
 * Note: a production deployment may replace polling with Postgres LISTEN/NOTIFY
 * or logical decoding (CDC) for lower latency.
 */
