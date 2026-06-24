/**
 * Leaderboard HTTP routes (mounted at /leaderboards).
 *
 * Responsibility:
 *  - Expose score submission and ranking reads over HTTP, validating with Zod.
 *
 * Planned routes:
 *  - POST /leaderboards/:contestId/scores      body { userId, score } -> 204
 *  - GET  /leaderboards/:contestId?page=&size=  -> ranked page
 *  - GET  /leaderboards/:contestId/rank/:userId -> { rank, score }
 */
