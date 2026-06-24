/**
 * Prisma client singleton.
 *
 * Responsibility:
 *  - Instantiate and export one shared PrismaClient for the whole process.
 *  - Patch BigInt JSON serialization (BigInt.prototype.toJSON -> string) so
 *    money values (stored as BigInt) can be returned in JSON responses.
 *
 * Planned exports:
 *  - default: PrismaClient
 */
