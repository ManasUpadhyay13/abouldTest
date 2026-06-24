# Tests (planned)

This folder will hold the Jest + Supertest suite. The tests that *prove the
core guarantees* (not just happy paths):

| Test file | What it proves |
|---|---|
| `wallet/wallet.service.test.ts` | Concurrent deducts never drive balance negative; idempotency-key retry charges exactly once; overdraw is rejected. |
| `wallet/wallet.routes.test.ts` | HTTP add-funds/deduct/history; 422 on overdraw; keyset pagination. |
| `contest/contest.service.test.ts` | N concurrent joins on a contest with M < N spots fill **exactly M**; no double-join; fee deducted atomically. |
| `contest/contest.routes.test.ts` | HTTP join + 404 on unknown contest. |
| `leaderboard/leaderboard.service.test.ts` | ZSET ranking order + pagination + rebuild-from-DB on cache loss. |
| `leaderboard/leaderboard.routes.test.ts` | HTTP score submission returns a correctly ranked page. |
| `notification/notification.service.test.ts` | deliver() persists + is idempotent on dedupeKey; relayOnce() drains the outbox. |
| `health.test.ts` | App boots and `/health` returns 200. |

`tests/setup.ts` will truncate all tables and flush Redis between tests so each
case is isolated. The suite requires Postgres + Redis running (see `docker-compose.yml`).
