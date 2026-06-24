/**
 * Request validation middleware.
 *
 * Responsibility:
 *  - Validate `req.body` against a Zod schema.
 *  - On failure, forward a ValidationError (400) to the error handler.
 *  - On success, replace req.body with the parsed/typed value.
 *
 * Planned exports:
 *  - validate(schema: ZodSchema): RequestHandler
 */
