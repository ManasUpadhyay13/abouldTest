/**
 * Wallet HTTP routes (mounted at /wallets).
 *
 * Responsibility:
 *  - Expose the wallet service over HTTP, validating input with Zod.
 *
 * Planned routes:
 *  - POST /wallets/:userId/add-funds   body { amount, idempotencyKey } -> 201 txn
 *  - POST /wallets/:userId/deduct      body { amount, idempotencyKey } -> 201 txn
 *  - GET  /wallets/:userId/history?limit=&cursor=  -> { items, nextCursor }
 */
