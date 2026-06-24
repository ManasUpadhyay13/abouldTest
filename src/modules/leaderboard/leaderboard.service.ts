/**
 * Leaderboard service — Redis sorted set ranking with a Postgres source of truth.
 *
 * Responsibility:
 *  - Serve real-time rankings from a Redis sorted set (ZSET) keyed `lb:{contestId}`,
 *    member = userId, score = points. Reads are O(log N + page) and never touch
 *    Postgres on the hot path.
 *  - Keep leaderboard_entries in Postgres as the durable source of truth so the
 *    ZSET can be rebuilt after cache loss.
 *  - Use rank-based pagination (ZREVRANGE by index), never SQL OFFSET.
 *
 * Planned exports:
 *  - key(contestId): string                       // `lb:${contestId}`
 *  - submitScore(contestId, userId, score): Promise<void>   // upsert DB + ZADD
 *  - getPage(contestId, page, size): Promise<{ entries: { userId, score, rank }[], page, size }>
 *  - getUserRank(contestId, userId): Promise<{ rank: number|null, score: number|null }>
 *  - rebuildFromDb(contestId): Promise<void>       // repopulate ZSET on cache miss
 */
