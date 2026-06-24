# Fantasy Sports Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable TypeScript reference backend for a Fantasy Sports platform demonstrating an atomic wallet, race-free contest joins, and a Redis-backed leaderboard, plus a resilient notification worker.

**Architecture:** Modular monolith (Express) with a separate queue worker process. Postgres (via Prisma) is the source of truth; Redis (via ioredis) serves leaderboards and backs the BullMQ notification queue. Correctness comes from atomic conditional SQL updates, UNIQUE idempotency keys, and an append-only ledger — not application-level locking.

**Tech Stack:** Node.js + TypeScript, Express, Prisma (PostgreSQL), ioredis, BullMQ, Zod, Jest + Supertest, Docker Compose.

## Global Constraints

- **Language:** TypeScript, strict mode (`"strict": true`).
- **Money:** stored and handled as integer **minor units** in `BIGINT` / JS `bigint`. Never floats.
- **Node:** version floor 20.
- **Concurrency correctness:** every wallet mutation is idempotency-key guarded (UNIQUE constraint) and uses atomic conditional `UPDATE`. No `SELECT ... FOR UPDATE`, no read-then-write.
- **Ledger:** `wallet_transactions` is append-only — never UPDATE or DELETE.
- **Tests require infra:** Postgres + Redis from `docker-compose.yml` must be running; tests use a dedicated test database via `DATABASE_URL`.
- **Commits:** one commit per task, conventional-commit style.

---

### Task 1: Project scaffolding & tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `docker-compose.yml`, `jest.config.js`, `.env.example`, `.env`

**Interfaces:**
- Consumes: nothing.
- Produces: npm scripts `dev`, `build`, `worker`, `test`, `prisma:migrate`, `seed`; running Postgres on `5433`, Redis on `6380`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "fantasy-sports-backend",
  "version": "1.0.0",
  "private": true,
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "worker": "tsx watch src/worker.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy",
    "seed": "tsx prisma/seed.ts",
    "test": "jest --runInBand"
  },
  "dependencies": {
    "@prisma/client": "^5.18.0",
    "bullmq": "^5.12.0",
    "express": "^4.19.2",
    "ioredis": "^5.4.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.14.0",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "prisma": "^5.18.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src", "prisma", "tests"]
}
```

- [ ] **Step 3: Create `docker-compose.yml`** (non-default ports to avoid clashes)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5433:5432"]
    environment:
      POSTGRES_USER: fantasy
      POSTGRES_PASSWORD: fantasy
      POSTGRES_DB: fantasy
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U fantasy"]
      interval: 5s
      timeout: 3s
      retries: 10
  redis:
    image: redis:7-alpine
    ports: ["6380:6379"]
```

- [ ] **Step 4: Create `jest.config.js`**

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  testTimeout: 20000,
};
```

- [ ] **Step 5: Create `.env.example` and `.env`** (same content)

```
DATABASE_URL="postgresql://fantasy:fantasy@localhost:5433/fantasy?schema=public"
REDIS_URL="redis://localhost:6380"
PORT=3000
```

- [ ] **Step 6: Install and start infra**

Run: `npm install && docker compose up -d`
Expected: dependencies install; `docker compose ps` shows postgres + redis healthy/running.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold project, tooling, and docker-compose infra"
```

---

### Task 2: Config & clients

**Files:**
- Create: `src/config/env.ts`, `src/config/prisma.ts`, `src/config/redis.ts`

**Interfaces:**
- Produces:
  - `env: { databaseUrl: string; redisUrl: string; port: number }`
  - `prisma: PrismaClient` (default export of `prisma.ts`) — with global `BigInt.prototype.toJSON` patched to emit strings.
  - `redis: Redis` (default ioredis connection), `createRedis(): Redis` factory for BullMQ.

- [ ] **Step 1: Create `src/config/env.ts`**

```ts
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6380',
  port: Number(process.env.PORT ?? 3000),
};
```

- [ ] **Step 2: Create `src/config/prisma.ts`** (includes BigInt JSON safety)

```ts
import { PrismaClient } from '@prisma/client';

// BigInt is not JSON-serializable by default; emit as string everywhere.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

const prisma = new PrismaClient();
export default prisma;
```

- [ ] **Step 3: Create `src/config/redis.ts`**

```ts
import Redis from 'ioredis';
import { env } from './env';

// BullMQ requires maxRetriesPerRequest: null on its connections.
export function createRedis(): Redis {
  return new Redis(env.redisUrl, { maxRetriesPerRequest: null });
}

const redis = createRedis();
export default redis;
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors (Prisma client types resolve after Task 3 generates them; if run now, `@prisma/client` may error — that is expected and resolved in Task 3).

- [ ] **Step 5: Commit**

```bash
git add src/config
git commit -m "feat: add env, prisma, and redis client config"
```

---

### Task 3: Prisma schema, migration & client generation

**Files:**
- Create: `prisma/schema.prisma`

**Interfaces:**
- Produces: generated Prisma client with models `User`, `Wallet`, `WalletTransaction`, `Contest`, `ContestEntry`, `LeaderboardEntry`, `AvatarItem`, `UserInventory`, `Notification`, `Outbox`. Enums `TxnType` (`credit|debit`), `TxnReference` (`deposit|withdrawal|contest_entry|payout|refund`), `ContestStatus` (`upcoming|live|completed|cancelled`), `NotifChannel` (`push|in_app`).

- [ ] **Step 1: Create `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum TxnType { credit debit }
enum TxnReference { deposit withdrawal contest_entry payout refund }
enum ContestStatus { upcoming live completed cancelled }
enum NotifChannel { push in_app }

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  username     String   @unique
  passwordHash String   @map("password_hash")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  wallet       Wallet?
  entries      ContestEntry[]
  inventory    UserInventory[]
  notifications Notification[]
  @@map("users")
}

model Wallet {
  id           String   @id @default(uuid())
  userId       String   @unique @map("user_id")
  user         User     @relation(fields: [userId], references: [id])
  balance      BigInt   @default(0)
  currency     String   @default("INR")
  version      Int      @default(0)
  updatedAt    DateTime @updatedAt @map("updated_at")
  transactions WalletTransaction[]
  @@map("wallets")
}

model WalletTransaction {
  id             String       @id @default(uuid())
  walletId       String       @map("wallet_id")
  wallet         Wallet       @relation(fields: [walletId], references: [id])
  type           TxnType
  amount         BigInt
  balanceAfter   BigInt       @map("balance_after")
  referenceType  TxnReference @map("reference_type")
  referenceId    String?      @map("reference_id")
  idempotencyKey String       @unique @map("idempotency_key")
  createdAt      DateTime     @default(now()) @map("created_at")
  @@index([walletId, createdAt(sort: Desc)])
  @@map("wallet_transactions")
}

model Contest {
  id          String        @id @default(uuid())
  name        String
  entryFee    BigInt        @map("entry_fee")
  maxSpots    Int           @map("max_spots")
  filledSpots Int           @default(0) @map("filled_spots")
  prizePool   BigInt        @default(0) @map("prize_pool")
  status      ContestStatus @default(upcoming)
  startTime   DateTime      @map("start_time")
  endTime     DateTime      @map("end_time")
  createdAt   DateTime      @default(now()) @map("created_at")
  entries     ContestEntry[]
  @@index([status, startTime])
  @@map("contests")
}

model ContestEntry {
  id         String   @id @default(uuid())
  contestId  String   @map("contest_id")
  contest    Contest  @relation(fields: [contestId], references: [id])
  userId     String   @map("user_id")
  user       User     @relation(fields: [userId], references: [id])
  entryTxnId String?  @map("entry_txn_id")
  joinedAt   DateTime @default(now()) @map("joined_at")
  @@unique([contestId, userId])
  @@index([userId])
  @@map("contest_entries")
}

model LeaderboardEntry {
  id        String   @id @default(uuid())
  contestId String   @map("contest_id")
  userId    String   @map("user_id")
  score     Float    @default(0)
  updatedAt DateTime @updatedAt @map("updated_at")
  @@unique([contestId, userId])
  @@map("leaderboard_entries")
}

model AvatarItem {
  id       String  @id @default(uuid())
  name     String
  category String
  price    BigInt
  rarity   String  @default("common")
  assetUrl String  @map("asset_url")
  isActive Boolean @default(true) @map("is_active")
  owners   UserInventory[]
  @@map("avatar_items")
}

model UserInventory {
  id         String   @id @default(uuid())
  userId     String   @map("user_id")
  user       User     @relation(fields: [userId], references: [id])
  itemId     String   @map("item_id")
  item       AvatarItem @relation(fields: [itemId], references: [id])
  equipped   Boolean  @default(false)
  acquiredAt DateTime @default(now()) @map("acquired_at")
  @@unique([userId, itemId])
  @@map("user_inventory")
}

model Notification {
  id        String       @id @default(uuid())
  userId    String       @map("user_id")
  user      User         @relation(fields: [userId], references: [id])
  type      String
  title     String
  body      String
  data      Json         @default("{}")
  channel   NotifChannel
  dedupeKey String       @unique @map("dedupe_key")
  readAt    DateTime?    @map("read_at")
  createdAt DateTime     @default(now()) @map("created_at")
  @@index([userId, createdAt(sort: Desc)])
  @@map("notifications")
}

model Outbox {
  id            String    @id @default(uuid())
  aggregateType String    @map("aggregate_type")
  aggregateId   String    @map("aggregate_id")
  eventType     String    @map("event_type")
  payload       Json
  createdAt     DateTime  @default(now()) @map("created_at")
  processedAt   DateTime? @map("processed_at")
  @@map("outbox")
}
```

- [ ] **Step 2: Create the migration and generate the client**

Run: `npx prisma migrate dev --name init`
Expected: migration `init` created and applied; "Generated Prisma Client" printed.

- [ ] **Step 3: Add a partial index Prisma cannot express, via raw migration edit**

Prisma can't declare partial indexes. Create one manually:

Run: `npx prisma migrate dev --create-only --name partial_indexes`

Then open the new `prisma/migrations/*_partial_indexes/migration.sql` and replace its contents with:

```sql
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX outbox_unprocessed_idx ON outbox (created_at) WHERE processed_at IS NULL;
```

Run: `npx prisma migrate dev`
Expected: `partial_indexes` migration applied.

- [ ] **Step 4: Verify config compiles now**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma
git commit -m "feat: add Prisma schema, migrations, and partial indexes"
```

---

### Task 4: Shared errors, middleware & app skeleton

**Files:**
- Create: `src/shared/errors.ts`, `src/middleware/error.ts`, `src/middleware/validate.ts`, `src/app.ts`, `src/server.ts`
- Test: `tests/setup.ts`, `tests/health.test.ts`

**Interfaces:**
- Produces:
  - `AppError(message, statusCode, code)`; subclasses `NotFoundError`, `InsufficientFundsError`, `ContestFullError`, `AlreadyJoinedError`, `ValidationError`.
  - `errorHandler` Express middleware.
  - `validate(schema: ZodSchema)` middleware reading `req.body`.
  - `createApp(): express.Express` — registers JSON parsing, routes, error handler. Mounts `GET /health`.
  - `tests/setup.ts` exports nothing but truncates all tables in `beforeEach` and disconnects in `afterAll`.

- [ ] **Step 1: Write the failing test `tests/health.test.ts`**

```ts
import request from 'supertest';
import { createApp } from '../src/app';

describe('GET /health', () => {
  it('returns 200 and ok status', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 2: Create `tests/setup.ts`**

```ts
import prisma from '../src/config/prisma';
import redis from '../src/config/redis';

beforeEach(async () => {
  // Order-independent truncate of all app tables.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      wallet_transactions, contest_entries, leaderboard_entries,
      user_inventory, notifications, outbox, wallets, contests,
      avatar_items, users
    RESTART IDENTITY CASCADE;
  `);
  await redis.flushdb();
});

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- tests/health.test.ts`
Expected: FAIL — `Cannot find module '../src/app'`.

- [ ] **Step 4: Create `src/shared/errors.ts`**

```ts
export class AppError extends Error {
  constructor(message: string, public statusCode: number, public code: string) {
    super(message);
  }
}
export class ValidationError extends AppError {
  constructor(message: string) { super(message, 400, 'VALIDATION_ERROR'); }
}
export class NotFoundError extends AppError {
  constructor(resource: string) { super(`${resource} not found`, 404, 'NOT_FOUND'); }
}
export class InsufficientFundsError extends AppError {
  constructor() { super('Insufficient wallet balance', 422, 'INSUFFICIENT_FUNDS'); }
}
export class ContestFullError extends AppError {
  constructor() { super('Contest is full or not joinable', 409, 'CONTEST_FULL'); }
}
export class AlreadyJoinedError extends AppError {
  constructor() { super('User already joined this contest', 409, 'ALREADY_JOINED'); }
}
```

- [ ] **Step 5: Create `src/middleware/error.ts`**

```ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/errors';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
}
```

- [ ] **Step 6: Create `src/middleware/validate.ts`**

```ts
import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { ValidationError } from '../shared/errors';

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(new ValidationError(result.error.issues.map((i) => i.message).join('; ')));
    }
    req.body = result.data;
    next();
  };
}
```

- [ ] **Step 7: Create `src/app.ts`**

```ts
import express from 'express';
import { errorHandler } from './middleware/error';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  // Module routers mounted in later tasks.
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 8: Create `src/server.ts`**

```ts
import { createApp } from './app';
import { env } from './config/env';

createApp().listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on :${env.port}`);
});
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm test -- tests/health.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src tests
git commit -m "feat: add errors, middleware, app skeleton, and health check"
```

---

### Task 5: Wallet service — credit/debit core (atomicity + idempotency)

**Files:**
- Create: `src/modules/wallet/wallet.service.ts`
- Test: `tests/wallet/wallet.service.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), error classes (Task 4).
- Produces (exact signatures used by Tasks 6 & 7):
  ```ts
  type Tx = Prisma.TransactionClient;
  function getOrCreateWallet(userId: string): Promise<{ id: string; balance: bigint }>;
  // Internal composable primitives operating inside a caller's transaction:
  function debitTx(tx: Tx, args: { walletId: string; amount: bigint; referenceType: TxnReference; referenceId?: string; idempotencyKey: string }): Promise<WalletTransaction>;
  function creditTx(tx: Tx, args: { walletId: string; amount: bigint; referenceType: TxnReference; referenceId?: string; idempotencyKey: string }): Promise<WalletTransaction>;
  // Public wrappers:
  function addFunds(args: { userId: string; amount: bigint; idempotencyKey: string }): Promise<WalletTransaction>;
  function deduct(args: { userId: string; amount: bigint; idempotencyKey: string; referenceType?: TxnReference; referenceId?: string }): Promise<WalletTransaction>;
  ```
  `debitTx` throws `InsufficientFundsError` when balance < amount; both primitives return the existing transaction (idempotent) when `idempotencyKey` already exists.

- [ ] **Step 1: Write the failing test `tests/wallet/wallet.service.test.ts`**

```ts
import prisma from '../../src/config/prisma';
import * as wallet from '../../src/modules/wallet/wallet.service';
import { InsufficientFundsError } from '../../src/shared/errors';

async function makeUser(suffix: string) {
  const u = await prisma.user.create({
    data: { email: `u${suffix}@x.io`, username: `u${suffix}`, passwordHash: 'x' },
  });
  await wallet.getOrCreateWallet(u.id);
  return u.id;
}

describe('wallet.service', () => {
  it('addFunds increases balance and writes a credit ledger row', async () => {
    const userId = await makeUser('a');
    await wallet.addFunds({ userId, amount: 1000n, idempotencyKey: 'add-1' });
    const w = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
    expect(w.balance).toBe(1000n);
  });

  it('deduct decreases balance and records balanceAfter', async () => {
    const userId = await makeUser('b');
    await wallet.addFunds({ userId, amount: 1000n, idempotencyKey: 'add-b' });
    const txn = await wallet.deduct({ userId, amount: 300n, idempotencyKey: 'ded-b' });
    expect(txn.balanceAfter).toBe(700n);
  });

  it('deduct rejects when funds are insufficient', async () => {
    const userId = await makeUser('c');
    await wallet.addFunds({ userId, amount: 100n, idempotencyKey: 'add-c' });
    await expect(
      wallet.deduct({ userId, amount: 500n, idempotencyKey: 'ded-c' }),
    ).rejects.toBeInstanceOf(InsufficientFundsError);
  });

  it('is idempotent: same idempotencyKey charges only once', async () => {
    const userId = await makeUser('d');
    await wallet.addFunds({ userId, amount: 1000n, idempotencyKey: 'add-d' });
    await wallet.deduct({ userId, amount: 200n, idempotencyKey: 'dupe' });
    await wallet.deduct({ userId, amount: 200n, idempotencyKey: 'dupe' });
    const w = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
    expect(w.balance).toBe(800n);
  });

  it('never goes negative under concurrent deducts', async () => {
    const userId = await makeUser('e');
    await wallet.addFunds({ userId, amount: 1000n, idempotencyKey: 'add-e' });
    // 20 concurrent deducts of 100 against a 1000 balance: exactly 10 succeed.
    const attempts = Array.from({ length: 20 }, (_, i) =>
      wallet.deduct({ userId, amount: 100n, idempotencyKey: `c-${i}` }).then(
        () => 'ok' as const,
        () => 'fail' as const,
      ),
    );
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r === 'ok')).toHaveLength(10);
    const w = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
    expect(w.balance).toBe(0n);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/wallet/wallet.service.test.ts`
Expected: FAIL — cannot find module `wallet.service`.

- [ ] **Step 3: Implement `src/modules/wallet/wallet.service.ts`**

```ts
import { Prisma, TxnReference, WalletTransaction } from '@prisma/client';
import prisma from '../../config/prisma';
import { InsufficientFundsError, NotFoundError } from '../../shared/errors';

type Tx = Prisma.TransactionClient;

export async function getOrCreateWallet(userId: string) {
  return prisma.wallet.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true, balance: true },
  });
}

// Returns the existing txn if the idempotency key was already used.
async function findExisting(tx: Tx, idempotencyKey: string) {
  return tx.walletTransaction.findUnique({ where: { idempotencyKey } });
}

export async function creditTx(
  tx: Tx,
  args: { walletId: string; amount: bigint; referenceType: TxnReference; referenceId?: string; idempotencyKey: string },
): Promise<WalletTransaction> {
  const existing = await findExisting(tx, args.idempotencyKey);
  if (existing) return existing;

  await tx.$executeRaw`
    UPDATE wallets SET balance = balance + ${args.amount}, version = version + 1, updated_at = now()
    WHERE id = ${args.walletId}::uuid`;
  const w = await tx.wallet.findUniqueOrThrow({ where: { id: args.walletId } });
  return insertLedger(tx, 'credit', w.balance, args);
}

export async function debitTx(
  tx: Tx,
  args: { walletId: string; amount: bigint; referenceType: TxnReference; referenceId?: string; idempotencyKey: string },
): Promise<WalletTransaction> {
  const existing = await findExisting(tx, args.idempotencyKey);
  if (existing) return existing;

  // Atomic conditional update: the balance check lives in the WHERE clause.
  const affected = await tx.$executeRaw`
    UPDATE wallets SET balance = balance - ${args.amount}, version = version + 1, updated_at = now()
    WHERE id = ${args.walletId}::uuid AND balance >= ${args.amount}`;
  if (affected === 0) throw new InsufficientFundsError();

  const w = await tx.wallet.findUniqueOrThrow({ where: { id: args.walletId } });
  return insertLedger(tx, 'debit', w.balance, args);
}

async function insertLedger(
  tx: Tx,
  type: 'credit' | 'debit',
  balanceAfter: bigint,
  args: { walletId: string; amount: bigint; referenceType: TxnReference; referenceId?: string; idempotencyKey: string },
): Promise<WalletTransaction> {
  try {
    return await tx.walletTransaction.create({
      data: {
        walletId: args.walletId,
        type,
        amount: args.amount,
        balanceAfter,
        referenceType: args.referenceType,
        referenceId: args.referenceId,
        idempotencyKey: args.idempotencyKey,
      },
    });
  } catch (e) {
    // Concurrent duplicate idempotency key: the constraint is the real guard.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return tx.walletTransaction.findUniqueOrThrow({ where: { idempotencyKey: args.idempotencyKey } });
    }
    throw e;
  }
}

export async function addFunds(args: { userId: string; amount: bigint; idempotencyKey: string }) {
  const w = await prisma.wallet.findUnique({ where: { userId: args.userId } });
  if (!w) throw new NotFoundError('wallet');
  return prisma.$transaction((tx) =>
    creditTx(tx, { walletId: w.id, amount: args.amount, referenceType: 'deposit', idempotencyKey: args.idempotencyKey }),
  );
}

export async function deduct(args: {
  userId: string; amount: bigint; idempotencyKey: string; referenceType?: TxnReference; referenceId?: string;
}) {
  const w = await prisma.wallet.findUnique({ where: { userId: args.userId } });
  if (!w) throw new NotFoundError('wallet');
  return prisma.$transaction((tx) =>
    debitTx(tx, {
      walletId: w.id,
      amount: args.amount,
      referenceType: args.referenceType ?? 'withdrawal',
      referenceId: args.referenceId,
      idempotencyKey: args.idempotencyKey,
    }),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/wallet/wallet.service.test.ts`
Expected: PASS (all 5 tests, including the concurrency test: exactly 10 succeed, balance 0).

- [ ] **Step 5: Commit**

```bash
git add src/modules/wallet/wallet.service.ts tests/wallet/wallet.service.test.ts
git commit -m "feat(wallet): atomic credit/debit with idempotency and ledger"
```

---

### Task 6: Wallet history & HTTP routes

**Files:**
- Create: `src/modules/wallet/wallet.routes.ts`
- Modify: `src/app.ts` (mount router)
- Test: `tests/wallet/wallet.routes.test.ts`

**Interfaces:**
- Consumes: `wallet.service` (Task 5), `validate` (Task 4).
- Produces: router mounted at `/wallets`, plus `history(userId, opts)`:
  - `POST /wallets/:userId/add-funds` body `{ amount: number, idempotencyKey: string }` → 201 txn.
  - `POST /wallets/:userId/deduct` body `{ amount: number, idempotencyKey: string }` → 201 txn.
  - `GET /wallets/:userId/history?limit=&cursor=` → `{ items: WalletTransaction[], nextCursor: string | null }`. Keyset pagination on `(createdAt, id)`.

- [ ] **Step 1: Write the failing test `tests/wallet/wallet.routes.test.ts`**

```ts
import request from 'supertest';
import prisma from '../../src/config/prisma';
import { createApp } from '../../src/app';
import * as wallet from '../../src/modules/wallet/wallet.service';

const app = createApp();

async function seedUser() {
  const u = await prisma.user.create({ data: { email: 'r@x.io', username: 'r', passwordHash: 'x' } });
  await wallet.getOrCreateWallet(u.id);
  return u.id;
}

describe('wallet routes', () => {
  it('adds funds via HTTP', async () => {
    const userId = await seedUser();
    const res = await request(app)
      .post(`/wallets/${userId}/add-funds`)
      .send({ amount: 500, idempotencyKey: 'http-add' });
    expect(res.status).toBe(201);
    expect(res.body.balanceAfter).toBe('500');
  });

  it('returns 422 on overdraw', async () => {
    const userId = await seedUser();
    const res = await request(app)
      .post(`/wallets/${userId}/deduct`)
      .send({ amount: 999, idempotencyKey: 'http-ded' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('paginates history newest-first', async () => {
    const userId = await seedUser();
    await wallet.addFunds({ userId, amount: 100n, idempotencyKey: 'h1' });
    await wallet.addFunds({ userId, amount: 200n, idempotencyKey: 'h2' });
    const res = await request(app).get(`/wallets/${userId}/history?limit=1`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.nextCursor).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/wallet/wallet.routes.test.ts`
Expected: FAIL — routes return 404 (router not mounted).

- [ ] **Step 3: Add `history` to `src/modules/wallet/wallet.service.ts`**

Append:

```ts
export async function history(userId: string, opts: { limit?: number; cursor?: string }) {
  const w = await prisma.wallet.findUnique({ where: { userId } });
  if (!w) throw new NotFoundError('wallet');
  const limit = Math.min(opts.limit ?? 20, 100);
  const items = await prisma.walletTransaction.findMany({
    where: { walletId: w.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
}
```

- [ ] **Step 4: Create `src/modules/wallet/wallet.routes.ts`**

```ts
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate';
import * as wallet from './wallet.service';

const router = Router();
const amountBody = z.object({
  amount: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
});

router.post('/:userId/add-funds', validate(amountBody), async (req, res, next) => {
  try {
    const txn = await wallet.addFunds({
      userId: req.params.userId,
      amount: BigInt(req.body.amount),
      idempotencyKey: req.body.idempotencyKey,
    });
    res.status(201).json(txn);
  } catch (e) { next(e); }
});

router.post('/:userId/deduct', validate(amountBody), async (req, res, next) => {
  try {
    const txn = await wallet.deduct({
      userId: req.params.userId,
      amount: BigInt(req.body.amount),
      idempotencyKey: req.body.idempotencyKey,
    });
    res.status(201).json(txn);
  } catch (e) { next(e); }
});

router.get('/:userId/history', async (req, res, next) => {
  try {
    const result = await wallet.history(req.params.userId, {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
    });
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
```

- [ ] **Step 5: Mount the router in `src/app.ts`**

Add the import and `app.use` (before `errorHandler`):

```ts
import walletRoutes from './modules/wallet/wallet.routes';
// ...
  app.use('/wallets', walletRoutes);
  app.use(errorHandler);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- tests/wallet/wallet.routes.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat(wallet): history endpoint and HTTP routes"
```

---

### Task 7: Contest join service (capacity + entry-fee race)

**Files:**
- Create: `src/modules/contest/contest.service.ts`
- Test: `tests/contest/contest.service.test.ts`

**Interfaces:**
- Consumes: `prisma`, `wallet.debitTx` (Task 5), error classes (Task 4).
- Produces:
  ```ts
  function join(args: { contestId: string; userId: string; idempotencyKey: string }): Promise<ContestEntry>;
  ```
  Single transaction: atomic capacity claim → wallet debit of `entryFee` (referenceType `contest_entry`) → entry insert. Throws `ContestFullError`, `InsufficientFundsError`, or `AlreadyJoinedError`. After commit, writes an `Outbox` row (`event_type: "contest.joined"`).

- [ ] **Step 1: Write the failing test `tests/contest/contest.service.test.ts`**

```ts
import prisma from '../../src/config/prisma';
import * as wallet from '../../src/modules/wallet/wallet.service';
import * as contest from '../../src/modules/contest/contest.service';
import { ContestFullError, AlreadyJoinedError } from '../../src/shared/errors';

async function makeFundedUser(s: string, funds: bigint) {
  const u = await prisma.user.create({ data: { email: `${s}@x.io`, username: s, passwordHash: 'x' } });
  await wallet.getOrCreateWallet(u.id);
  if (funds > 0n) await wallet.addFunds({ userId: u.id, amount: funds, idempotencyKey: `fund-${s}` });
  return u.id;
}

async function makeContest(maxSpots: number, entryFee: bigint) {
  return prisma.contest.create({
    data: {
      name: 'C', entryFee, maxSpots, prizePool: 0n, status: 'upcoming',
      startTime: new Date(Date.now() + 3600_000), endTime: new Date(Date.now() + 7200_000),
    },
  });
}

describe('contest.join', () => {
  it('deducts fee and creates an entry', async () => {
    const userId = await makeFundedUser('cj1', 1000n);
    const c = await makeContest(10, 100n);
    await contest.join({ contestId: c.id, userId, idempotencyKey: 'j1' });
    const w = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
    expect(w.balance).toBe(900n);
    expect(await prisma.contestEntry.count({ where: { contestId: c.id } })).toBe(1);
  });

  it('rejects double join by the same user', async () => {
    const userId = await makeFundedUser('cj2', 1000n);
    const c = await makeContest(10, 100n);
    await contest.join({ contestId: c.id, userId, idempotencyKey: 'j2a' });
    await expect(
      contest.join({ contestId: c.id, userId, idempotencyKey: 'j2b' }),
    ).rejects.toBeInstanceOf(AlreadyJoinedError);
  });

  it('fills exactly maxSpots under concurrent joins', async () => {
    const c = await makeContest(3, 100n);
    const userIds = await Promise.all(
      Array.from({ length: 10 }, (_, i) => makeFundedUser(`race${i}`, 1000n)),
    );
    const results = await Promise.all(
      userIds.map((uid, i) =>
        contest.join({ contestId: c.id, userId: uid, idempotencyKey: `r-${i}` }).then(
          () => 'ok' as const,
          (e) => (e instanceof ContestFullError ? 'full' : 'err'),
        ),
      ),
    );
    expect(results.filter((r) => r === 'ok')).toHaveLength(3);
    const fresh = await prisma.contest.findUniqueOrThrow({ where: { id: c.id } });
    expect(fresh.filledSpots).toBe(3);
    expect(await prisma.contestEntry.count({ where: { contestId: c.id } })).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/contest/contest.service.test.ts`
Expected: FAIL — cannot find module `contest.service`.

- [ ] **Step 3: Implement `src/modules/contest/contest.service.ts`**

```ts
import { Prisma, ContestEntry } from '@prisma/client';
import prisma from '../../config/prisma';
import { debitTx } from '../wallet/wallet.service';
import { ContestFullError, AlreadyJoinedError, NotFoundError } from '../../shared/errors';

export async function join(args: {
  contestId: string; userId: string; idempotencyKey: string;
}): Promise<ContestEntry> {
  const entry = await prisma.$transaction(async (tx) => {
    const contest = await tx.contest.findUnique({ where: { id: args.contestId } });
    if (!contest) throw new NotFoundError('contest');
    const wallet = await tx.wallet.findUnique({ where: { userId: args.userId } });
    if (!wallet) throw new NotFoundError('wallet');

    // 1. Atomic capacity claim.
    const claimed = await tx.$executeRaw`
      UPDATE contests SET filled_spots = filled_spots + 1
      WHERE id = ${args.contestId}::uuid AND status = 'upcoming' AND filled_spots < max_spots`;
    if (claimed === 0) throw new ContestFullError();

    // 2. Deduct entry fee (composes the wallet primitive in the same transaction).
    const txn = await debitTx(tx, {
      walletId: wallet.id,
      amount: contest.entryFee,
      referenceType: 'contest_entry',
      referenceId: args.contestId,
      idempotencyKey: args.idempotencyKey,
    });

    // 3. Insert entry; UNIQUE(contest_id,user_id) guards double join.
    try {
      return await tx.contestEntry.create({
        data: { contestId: args.contestId, userId: args.userId, entryTxnId: txn.id },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new AlreadyJoinedError();
      }
      throw e;
    }
  });

  // After commit: reliable event emission via outbox.
  await prisma.outbox.create({
    data: {
      aggregateType: 'contest_entry',
      aggregateId: entry.id,
      eventType: 'contest.joined',
      payload: { contestId: args.contestId, userId: args.userId },
    },
  });

  return entry;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/contest/contest.service.test.ts`
Expected: PASS — concurrent test fills exactly 3, balance correct, no double joins.

- [ ] **Step 5: Commit**

```bash
git add src/modules/contest/contest.service.ts tests/contest/contest.service.test.ts
git commit -m "feat(contest): race-free join with atomic capacity and fee deduction"
```

---

### Task 8: Contest HTTP routes

**Files:**
- Create: `src/modules/contest/contest.routes.ts`
- Modify: `src/app.ts`
- Test: `tests/contest/contest.routes.test.ts`

**Interfaces:**
- Consumes: `contest.service` (Task 7), `validate` (Task 4).
- Produces: router at `/contests`:
  - `POST /contests/:contestId/join` body `{ userId: string, idempotencyKey: string }` → 201 entry.
  - `GET /contests/:contestId` → contest row (404 if missing).

- [ ] **Step 1: Write the failing test `tests/contest/contest.routes.test.ts`**

```ts
import request from 'supertest';
import prisma from '../../src/config/prisma';
import { createApp } from '../../src/app';
import * as wallet from '../../src/modules/wallet/wallet.service';

const app = createApp();

describe('contest routes', () => {
  it('joins a contest over HTTP', async () => {
    const u = await prisma.user.create({ data: { email: 'ch@x.io', username: 'ch', passwordHash: 'x' } });
    await wallet.getOrCreateWallet(u.id);
    await wallet.addFunds({ userId: u.id, amount: 1000n, idempotencyKey: 'chf' });
    const c = await prisma.contest.create({
      data: { name: 'H', entryFee: 100n, maxSpots: 5, prizePool: 0n, status: 'upcoming',
        startTime: new Date(Date.now() + 3600_000), endTime: new Date(Date.now() + 7200_000) },
    });
    const res = await request(app)
      .post(`/contests/${c.id}/join`)
      .send({ userId: u.id, idempotencyKey: 'http-join' });
    expect(res.status).toBe(201);
    expect(res.body.contestId).toBe(c.id);
  });

  it('returns 404 for an unknown contest', async () => {
    const res = await request(app).get('/contests/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/contest/contest.routes.test.ts`
Expected: FAIL — 404 on join (router not mounted).

- [ ] **Step 3: Create `src/modules/contest/contest.routes.ts`**

```ts
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate';
import prisma from '../../config/prisma';
import { NotFoundError } from '../../shared/errors';
import * as contest from './contest.service';

const router = Router();
const joinBody = z.object({ userId: z.string().uuid(), idempotencyKey: z.string().min(1) });

router.post('/:contestId/join', validate(joinBody), async (req, res, next) => {
  try {
    const entry = await contest.join({
      contestId: req.params.contestId,
      userId: req.body.userId,
      idempotencyKey: req.body.idempotencyKey,
    });
    res.status(201).json(entry);
  } catch (e) { next(e); }
});

router.get('/:contestId', async (req, res, next) => {
  try {
    const c = await prisma.contest.findUnique({ where: { id: req.params.contestId } });
    if (!c) throw new NotFoundError('contest');
    res.json(c);
  } catch (e) { next(e); }
});

export default router;
```

- [ ] **Step 4: Mount in `src/app.ts`**

```ts
import contestRoutes from './modules/contest/contest.routes';
// ...
  app.use('/contests', contestRoutes);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/contest/contest.routes.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(contest): join and detail HTTP routes"
```

---

### Task 9: Leaderboard service (Redis ZSET + DB source of truth)

**Files:**
- Create: `src/modules/leaderboard/leaderboard.service.ts`
- Test: `tests/leaderboard/leaderboard.service.test.ts`

**Interfaces:**
- Consumes: `prisma`, `redis` (Task 2).
- Produces:
  ```ts
  function key(contestId: string): string;            // `lb:${contestId}`
  function submitScore(contestId: string, userId: string, score: number): Promise<void>;
  function getPage(contestId: string, page: number, size: number): Promise<{ entries: { userId: string; score: number; rank: number }[]; page: number; size: number }>;
  function getUserRank(contestId: string, userId: string): Promise<{ rank: number | null; score: number | null }>;
  function rebuildFromDb(contestId: string): Promise<void>;
  ```
  `submitScore` upserts `leaderboard_entries` AND `ZADD`s Redis. `getPage` uses `ZREVRANGE` by index (rank-based, never SQL OFFSET); on an empty/missing key it calls `rebuildFromDb` first.

- [ ] **Step 1: Write the failing test `tests/leaderboard/leaderboard.service.test.ts`**

```ts
import prisma from '../../src/config/prisma';
import redis from '../../src/config/redis';
import * as lb from '../../src/modules/leaderboard/leaderboard.service';

async function user(s: string) {
  const u = await prisma.user.create({ data: { email: `${s}@x.io`, username: s, passwordHash: 'x' } });
  return u.id;
}

describe('leaderboard.service', () => {
  it('ranks users highest-score-first with pagination', async () => {
    const c = 'contest-1';
    const a = await user('lba'); const b = await user('lbb'); const d = await user('lbd');
    await lb.submitScore(c, a, 50);
    await lb.submitScore(c, b, 90);
    await lb.submitScore(c, d, 70);
    const p1 = await lb.getPage(c, 1, 2);
    expect(p1.entries.map((e) => e.userId)).toEqual([b, d]);
    expect(p1.entries[0].rank).toBe(1);
    const p2 = await lb.getPage(c, 2, 2);
    expect(p2.entries.map((e) => e.userId)).toEqual([a]);
    expect(p2.entries[0].rank).toBe(3);
  });

  it('reports a user own rank', async () => {
    const c = 'contest-2';
    const a = await user('rka'); const b = await user('rkb');
    await lb.submitScore(c, a, 10);
    await lb.submitScore(c, b, 20);
    expect((await lb.getUserRank(c, a)).rank).toBe(2);
  });

  it('rebuilds the ZSET from Postgres when the key is missing', async () => {
    const c = 'contest-3';
    const a = await user('rba');
    await lb.submitScore(c, a, 42);
    await redis.del(lb.key(c)); // simulate cache loss
    const page = await lb.getPage(c, 1, 10);
    expect(page.entries[0]).toMatchObject({ userId: a, score: 42, rank: 1 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/leaderboard/leaderboard.service.test.ts`
Expected: FAIL — cannot find module `leaderboard.service`.

- [ ] **Step 3: Implement `src/modules/leaderboard/leaderboard.service.ts`**

```ts
import prisma from '../../config/prisma';
import redis from '../../config/redis';

export function key(contestId: string) {
  return `lb:${contestId}`;
}

export async function submitScore(contestId: string, userId: string, score: number) {
  await prisma.leaderboardEntry.upsert({
    where: { contestId_userId: { contestId, userId } },
    create: { contestId, userId, score },
    update: { score },
  });
  await redis.zadd(key(contestId), score, userId);
}

export async function rebuildFromDb(contestId: string) {
  const rows = await prisma.leaderboardEntry.findMany({ where: { contestId } });
  if (rows.length === 0) return;
  const args: (string | number)[] = [];
  for (const r of rows) args.push(r.score, r.userId);
  await redis.zadd(key(contestId), ...(args as [number, string]));
}

export async function getPage(contestId: string, page: number, size: number) {
  const k = key(contestId);
  if ((await redis.exists(k)) === 0) await rebuildFromDb(contestId);
  const start = (page - 1) * size;
  const stop = start + size - 1;
  // ZREVRANGE is index/rank-based — O(log N + page), never a SQL OFFSET scan.
  const flat = await redis.zrevrange(k, start, stop, 'WITHSCORES');
  const entries: { userId: string; score: number; rank: number }[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    entries.push({ userId: flat[i], score: Number(flat[i + 1]), rank: start + i / 2 + 1 });
  }
  return { entries, page, size };
}

export async function getUserRank(contestId: string, userId: string) {
  const k = key(contestId);
  if ((await redis.exists(k)) === 0) await rebuildFromDb(contestId);
  const rank = await redis.zrevrank(k, userId);
  const score = await redis.zscore(k, userId);
  return { rank: rank === null ? null : rank + 1, score: score === null ? null : Number(score) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/leaderboard/leaderboard.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/leaderboard/leaderboard.service.ts tests/leaderboard/leaderboard.service.test.ts
git commit -m "feat(leaderboard): Redis ZSET ranking with DB-backed rebuild"
```

---

### Task 10: Leaderboard HTTP routes

**Files:**
- Create: `src/modules/leaderboard/leaderboard.routes.ts`
- Modify: `src/app.ts`
- Test: `tests/leaderboard/leaderboard.routes.test.ts`

**Interfaces:**
- Consumes: `leaderboard.service` (Task 9), `validate` (Task 4).
- Produces: router at `/leaderboards`:
  - `POST /leaderboards/:contestId/scores` body `{ userId: string, score: number }` → 204.
  - `GET /leaderboards/:contestId?page=&size=` → page object.
  - `GET /leaderboards/:contestId/rank/:userId` → `{ rank, score }`.

- [ ] **Step 1: Write the failing test `tests/leaderboard/leaderboard.routes.test.ts`**

```ts
import request from 'supertest';
import prisma from '../../src/config/prisma';
import { createApp } from '../../src/app';

const app = createApp();

async function user(s: string) {
  const u = await prisma.user.create({ data: { email: `${s}@x.io`, username: s, passwordHash: 'x' } });
  return u.id;
}

describe('leaderboard routes', () => {
  it('submits scores and returns a ranked page', async () => {
    const a = await user('lra'); const b = await user('lrb');
    await request(app).post('/leaderboards/ct/scores').send({ userId: a, score: 30 }).expect(204);
    await request(app).post('/leaderboards/ct/scores').send({ userId: b, score: 80 }).expect(204);
    const res = await request(app).get('/leaderboards/ct?page=1&size=10');
    expect(res.status).toBe(200);
    expect(res.body.entries[0]).toMatchObject({ userId: b, rank: 1 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/leaderboard/leaderboard.routes.test.ts`
Expected: FAIL — 404 (router not mounted).

- [ ] **Step 3: Create `src/modules/leaderboard/leaderboard.routes.ts`**

```ts
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate';
import * as lb from './leaderboard.service';

const router = Router();
const scoreBody = z.object({ userId: z.string().uuid(), score: z.number() });

router.post('/:contestId/scores', validate(scoreBody), async (req, res, next) => {
  try {
    await lb.submitScore(req.params.contestId, req.body.userId, req.body.score);
    res.status(204).send();
  } catch (e) { next(e); }
});

router.get('/:contestId', async (req, res, next) => {
  try {
    const page = req.query.page ? Number(req.query.page) : 1;
    const size = Math.min(req.query.size ? Number(req.query.size) : 20, 100);
    res.json(await lb.getPage(req.params.contestId, page, size));
  } catch (e) { next(e); }
});

router.get('/:contestId/rank/:userId', async (req, res, next) => {
  try {
    res.json(await lb.getUserRank(req.params.contestId, req.params.userId));
  } catch (e) { next(e); }
});

export default router;
```

- [ ] **Step 4: Mount in `src/app.ts`**

```ts
import leaderboardRoutes from './modules/leaderboard/leaderboard.routes';
// ...
  app.use('/leaderboards', leaderboardRoutes);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/leaderboard/leaderboard.routes.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(leaderboard): HTTP routes for scores, page, and rank"
```

---

### Task 11: Notification system — outbox relay + BullMQ worker

**Files:**
- Create: `src/modules/notification/notification.service.ts`, `src/modules/notification/notification.worker.ts`, `src/modules/notification/outbox.relay.ts`, `src/worker.ts`
- Test: `tests/notification/notification.service.test.ts`

**Interfaces:**
- Consumes: `prisma`, `createRedis` (Task 2), `Outbox` rows written by Task 7.
- Produces:
  - `notificationQueue` (BullMQ `Queue` named `notifications`).
  - `deliver(job: { userId: string; type: string; title: string; body: string; data?: object; dedupeKey: string }): Promise<void>` — persists an in-app `Notification` (idempotent via `dedupeKey`), publishes to Redis channel `notif:{userId}` (in-app/SSE), and calls `sendPush` (mocked). Catches the `P2002` duplicate so retries don't double-persist.
  - `relayOnce(): Promise<number>` — claims unprocessed `Outbox` rows, enqueues a `deliver` job each, marks them `processedAt`, returns count.
  - `startWorker()` — boots a BullMQ `Worker` with `attempts: 5`, exponential backoff, and a DLQ (`removeOnFail: false`); `src/worker.ts` starts the relay loop + worker.

- [ ] **Step 1: Write the failing test `tests/notification/notification.service.test.ts`**

```ts
import prisma from '../../src/config/prisma';
import * as notif from '../../src/modules/notification/notification.service';

async function user(s: string) {
  const u = await prisma.user.create({ data: { email: `${s}@x.io`, username: s, passwordHash: 'x' } });
  return u.id;
}

describe('notification.service', () => {
  it('deliver persists an in-app notification', async () => {
    const userId = await user('na');
    await notif.deliver({ userId, type: 'contest.joined', title: 'Joined', body: 'You joined', dedupeKey: 'd1' });
    const rows = await prisma.notification.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Joined');
  });

  it('deliver is idempotent on dedupeKey', async () => {
    const userId = await user('nb');
    await notif.deliver({ userId, type: 't', title: 'T', body: 'B', dedupeKey: 'dupe-d' });
    await notif.deliver({ userId, type: 't', title: 'T', body: 'B', dedupeKey: 'dupe-d' });
    expect(await prisma.notification.count({ where: { userId } })).toBe(1);
  });

  it('relayOnce drains unprocessed outbox rows and marks them processed', async () => {
    const userId = await user('nc');
    await prisma.outbox.create({
      data: { aggregateType: 'contest_entry', aggregateId: 'x', eventType: 'contest.joined',
        payload: { userId, contestId: 'cc' } },
    });
    const count = await notif.relayOnce();
    expect(count).toBe(1);
    const remaining = await prisma.outbox.count({ where: { processedAt: null } });
    expect(remaining).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/notification/notification.service.test.ts`
Expected: FAIL — cannot find module `notification.service`.

- [ ] **Step 3: Create `src/modules/notification/notification.service.ts`**

```ts
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import prisma from '../../config/prisma';
import redis, { createRedis } from '../../config/redis';

export const QUEUE_NAME = 'notifications';
export const notificationQueue = new Queue(QUEUE_NAME, { connection: createRedis() });

export interface DeliverJob {
  userId: string; type: string; title: string; body: string;
  data?: Record<string, unknown>; dedupeKey: string;
}

// Mocked external push provider (FCM/APNs). Real impl would call the SDK here.
async function sendPush(job: DeliverJob): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[push] -> ${job.userId}: ${job.title}`);
}

export async function deliver(job: DeliverJob): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: job.userId, type: job.type, title: job.title, body: job.body,
        data: (job.data ?? {}) as Prisma.InputJsonValue, channel: 'in_app', dedupeKey: job.dedupeKey,
      },
    });
  } catch (e) {
    // Duplicate delivery on retry: already persisted, treat as success.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
  }
  // In-app realtime fan-out via pub/sub (SSE subscribers listen on this channel).
  await redis.publish(`notif:${job.userId}`, JSON.stringify({ title: job.title, body: job.body }));
  await sendPush(job);
}

// Claims a batch of unprocessed outbox rows, enqueues a delivery job each, marks processed.
export async function relayOnce(batchSize = 100): Promise<number> {
  const rows = await prisma.outbox.findMany({
    where: { processedAt: null }, orderBy: { createdAt: 'asc' }, take: batchSize,
  });
  for (const row of rows) {
    const payload = row.payload as { userId: string; contestId?: string };
    await notificationQueue.add(
      'deliver',
      {
        userId: payload.userId,
        type: row.eventType,
        title: 'Contest joined',
        body: `You joined contest ${payload.contestId ?? ''}`.trim(),
        data: payload,
        dedupeKey: `outbox:${row.id}`,
      } satisfies DeliverJob,
      { attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnFail: false },
    );
    await prisma.outbox.update({ where: { id: row.id }, data: { processedAt: new Date() } });
  }
  return rows.length;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/notification/notification.service.test.ts`
Expected: PASS (all 3). The relay test enqueues to a real Redis queue (running via docker-compose); no worker is needed for the relay assertion.

- [ ] **Step 5: Create `src/modules/notification/notification.worker.ts`**

```ts
import { Worker, Job } from 'bullmq';
import { createRedis } from '../../config/redis';
import { QUEUE_NAME, deliver, DeliverJob } from './notification.service';

export function startWorker(): Worker {
  const worker = new Worker<DeliverJob>(
    QUEUE_NAME,
    async (job: Job<DeliverJob>) => deliver(job.data),
    { connection: createRedis() },
  );
  worker.on('failed', (job, err) => {
    // After `attempts` are exhausted the job stays in the failed set (our DLQ).
    // eslint-disable-next-line no-console
    console.error(`[notif] job ${job?.id} failed: ${err.message}`);
  });
  return worker;
}
```

- [ ] **Step 6: Create `src/modules/notification/outbox.relay.ts`**

```ts
import { relayOnce } from './notification.service';

// Poll loop: drains the outbox every `intervalMs`. Returns a stop function.
export function startRelay(intervalMs = 1000): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try { await relayOnce(); } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[relay] error', e);
    }
    if (!stopped) setTimeout(tick, intervalMs);
  };
  void tick();
  return () => { stopped = true; };
}
```

- [ ] **Step 7: Create `src/worker.ts`**

```ts
import { startWorker } from './modules/notification/notification.worker';
import { startRelay } from './modules/notification/outbox.relay';

startWorker();
startRelay();
// eslint-disable-next-line no-console
console.log('Worker + outbox relay started');
```

- [ ] **Step 8: Verify everything still compiles and the full suite passes**

Run: `npx tsc --noEmit && npm test`
Expected: typecheck clean; all test files PASS.

- [ ] **Step 9: Commit**

```bash
git add src/modules/notification src/worker.ts tests/notification
git commit -m "feat(notification): outbox relay, BullMQ worker, idempotent delivery"
```

---

### Task 12: Seed script

**Files:**
- Create: `prisma/seed.ts`

**Interfaces:**
- Consumes: `prisma`, `wallet.getOrCreateWallet`, `wallet.addFunds` (Task 5).
- Produces: idempotent seed (uses fixed emails via `upsert`) — 3 users each with a funded wallet, 1 upcoming contest, 3 avatar items.

- [ ] **Step 1: Create `prisma/seed.ts`**

```ts
import prisma from '../src/config/prisma';
import * as wallet from '../src/modules/wallet/wallet.service';

async function main() {
  const users = await Promise.all(
    ['alice', 'bob', 'carol'].map((name) =>
      prisma.user.upsert({
        where: { email: `${name}@fantasy.io` },
        create: { email: `${name}@fantasy.io`, username: name, passwordHash: 'seed' },
        update: {},
      }),
    ),
  );

  for (const u of users) {
    await wallet.getOrCreateWallet(u.id);
    await wallet.addFunds({ userId: u.id, amount: 100_000n, idempotencyKey: `seed-fund-${u.id}` });
  }

  await prisma.contest.create({
    data: {
      name: 'Sunday Mega Contest', entryFee: 5_000n, maxSpots: 1000, prizePool: 1_000_000n,
      status: 'upcoming', startTime: new Date(Date.now() + 86_400_000), endTime: new Date(Date.now() + 90_000_000),
    },
  });

  await prisma.avatarItem.createMany({
    data: [
      { name: 'Bronze Helm', category: 'headgear', price: 1_000n, rarity: 'common', assetUrl: 's3://items/helm.png' },
      { name: 'Silver Cape', category: 'cape', price: 5_000n, rarity: 'rare', assetUrl: 's3://items/cape.png' },
      { name: 'Gold Crown', category: 'headgear', price: 25_000n, rarity: 'legendary', assetUrl: 's3://items/crown.png' },
    ],
  });

  // eslint-disable-next-line no-console
  console.log('Seed complete:', users.length, 'users');
}

main().then(() => prisma.$disconnect()).catch(async (e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
```

- [ ] **Step 2: Run the seed against the dev database**

Run: `npm run seed`
Expected: prints "Seed complete: 3 users"; re-running does not error (upserts).

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: idempotent seed with users, wallets, contest, avatar items"
```

---

### Task 13: README & final integration verification

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything.
- Produces: run instructions + a map from each guarantee to where it is enforced in code; a final green test run.

- [ ] **Step 1: Create `README.md`**

````markdown
# Fantasy Sports Backend (Reference Implementation)

TypeScript + Express + Prisma (PostgreSQL) + Redis (ioredis/BullMQ).
Companion to `docs/superpowers/specs/2026-06-24-fantasy-sports-backend-design.md`.

## Run

```bash
docker compose up -d           # Postgres :5433, Redis :6380
npm install
npm run prisma:migrate         # apply migrations
npm run seed                   # optional sample data
npm run dev                    # API on :3000
npm run worker                 # notification worker + outbox relay (separate terminal)
```

## Test

```bash
docker compose up -d
npm run prisma:deploy
npm test
```

## How each guarantee is enforced

| Guarantee | Where |
|---|---|
| No double-spend | `wallet.service.ts` — atomic `UPDATE ... WHERE balance >= amount` + UNIQUE `idempotency_key` |
| Append-only ledger | `wallet_transactions` never updated/deleted |
| Contest capacity race | `contest.service.ts` — atomic `UPDATE ... WHERE filled_spots < max_spots` |
| No double-join | UNIQUE `(contest_id, user_id)` |
| Leaderboard at scale | `leaderboard.service.ts` — Redis ZSET, rank-based pagination, DB rebuild on miss |
| Reliable events | `outbox` table written in the join transaction; relay → BullMQ |
| Notification retries | BullMQ `attempts: 5` + exponential backoff; failed set = DLQ |

## Key endpoints

- `POST /wallets/:userId/add-funds` · `POST /wallets/:userId/deduct` · `GET /wallets/:userId/history`
- `POST /contests/:contestId/join` · `GET /contests/:contestId`
- `POST /leaderboards/:contestId/scores` · `GET /leaderboards/:contestId` · `GET /leaderboards/:contestId/rank/:userId`
````

- [ ] **Step 2: Run the full suite one final time**

Run: `docker compose up -d && npm run prisma:deploy && npm test`
Expected: all test files PASS (wallet, contest, leaderboard, notification, health).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with run instructions and guarantee map"
```

---

## Self-Review

**Spec coverage check:**
- §1 Overview → Tasks 1–3 (scaffold, schema). ✓
- §2 Architecture (monolith + worker, outbox, failure handling) → Tasks 4, 7, 11. ✓
- §3 Schema (9 tables + outbox, indexes, partial indexes) → Task 3. ✓
- §4.1 Wallet (addFunds/deduct/history, atomicity, idempotency) → Tasks 5, 6. ✓
- §4.2 Contest join (capacity + fee race) → Tasks 7, 8. ✓
- §4.3 Leaderboard (ZSET, pagination, rebuild) → Tasks 9, 10. ✓
- §5 Performance/scaling answers → documented in spec §6 (no code; covered by design doc). ✓
- §6 / §7 Notifications (outbox, BullMQ, retry, DLQ, in-app pub/sub) → Task 11. ✓
- §8 Project layout → realized across all tasks. ✓
- §9 Non-goals (auth/payments/sports-feed mocked) → respected (push mocked, scores submitted directly). ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code; the only intentional mock (`sendPush`) is labelled as a documented non-goal.

**Type consistency:** `debitTx`/`creditTx` signatures in Task 5 match their consumption in Task 7; `deliver`/`relayOnce`/`DeliverJob` in Task 11 are consistent across worker/relay/tests; `key()`/`getPage()`/`getUserRank()` consistent between Tasks 9 and 10. ✓

No gaps found.
