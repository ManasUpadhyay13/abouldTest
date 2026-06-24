/**
 * Contest service — race-free contest joins.
 *
 * Responsibility:
 *  - Join a contest inside a SINGLE database transaction performing three
 *    guarded steps; any failure rolls back all of them:
 *      1. Atomic capacity claim:
 *         `UPDATE contests SET filled_spots = filled_spots + 1
 *          WHERE id = :id AND status = 'upcoming' AND filled_spots < max_spots`
 *         -> 0 rows affected means the contest is full/closed (ContestFullError).
 *      2. Deduct the entry fee by composing wallet.debitTx(tx, ...) in the same
 *         transaction (referenceType = contest_entry).
 *      3. Insert the contest_entries row; UNIQUE(contest_id, user_id) rejects a
 *         double join (AlreadyJoinedError).
 *  - After commit, write an Outbox row (event_type "contest.joined") so the
 *    notification pipeline can react reliably.
 *
 * Planned exports:
 *  - join({ contestId, userId, idempotencyKey }): Promise<ContestEntry>
 */
