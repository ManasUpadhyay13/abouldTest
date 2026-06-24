/**
 * Wallet service — atomic balance operations with a double-entry ledger.
 *
 * Responsibility:
 *  - Manage wallet balance changes with strict integrity guarantees.
 *  - Prevent double-spending via:
 *      1. Atomic conditional UPDATE: `SET balance = balance - amount
 *         WHERE id = :id AND balance >= amount` (the precondition lives in the
 *         WHERE clause, so concurrent deducts are serialized by the row lock and
 *         cannot drive the balance negative).
 *      2. UNIQUE idempotency_key on the ledger — retries become no-ops.
 *      3. An immutable wallet_transactions row written in the SAME transaction.
 *  - Expose composable primitives (creditTx/debitTx) that run inside a caller's
 *    transaction so the Contest service can deduct an entry fee atomically with
 *    a join.
 *
 * Planned exports:
 *  - getOrCreateWallet(userId): Promise<{ id; balance }>
 *  - creditTx(tx, { walletId, amount, referenceType, referenceId?, idempotencyKey }): Promise<WalletTransaction>
 *  - debitTx(tx, { walletId, amount, referenceType, referenceId?, idempotencyKey }): Promise<WalletTransaction>
 *      // throws InsufficientFundsError when balance < amount
 *  - addFunds({ userId, amount, idempotencyKey }): Promise<WalletTransaction>
 *  - deduct({ userId, amount, idempotencyKey, referenceType?, referenceId? }): Promise<WalletTransaction>
 *  - history(userId, { limit?, cursor? }): Promise<{ items; nextCursor }>  // keyset pagination
 */
