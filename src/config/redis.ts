/**
 * Redis client configuration.
 *
 * Responsibility:
 *  - Provide ioredis connections for two uses: leaderboard/cache operations
 *    and the BullMQ notification queue.
 *  - BullMQ connections require `maxRetriesPerRequest: null`.
 *
 * Planned exports:
 *  - createRedis(): Redis   // factory, used by BullMQ Queue/Worker
 *  - default: Redis         // shared connection for leaderboard + pub/sub
 */
