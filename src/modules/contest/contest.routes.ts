/**
 * Contest HTTP routes (mounted at /contests).
 *
 * Responsibility:
 *  - Expose contest join + lookup over HTTP, validating input with Zod.
 *
 * Planned routes:
 *  - POST /contests/:contestId/join  body { userId, idempotencyKey } -> 201 entry
 *  - GET  /contests/:contestId       -> contest row (404 if missing)
 */
