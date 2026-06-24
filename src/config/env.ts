/**
 * Environment configuration loader.
 *
 * Responsibility:
 *  - Read and validate required environment variables at startup.
 *  - Fail fast (throw) if a required variable is missing.
 *  - Export a typed `env` object consumed by the rest of the app.
 *
 * Planned exports:
 *  - env: { databaseUrl: string; redisUrl: string; port: number }
 *
 * Reads: DATABASE_URL, REDIS_URL, PORT
 */
