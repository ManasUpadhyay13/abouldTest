/**
 * Shared application error types.
 *
 * Responsibility:
 *  - Define a base AppError carrying an HTTP status code and a stable error code.
 *  - Provide domain-specific subclasses the error-handling middleware maps to
 *    HTTP responses.
 *
 * Planned exports:
 *  - AppError(message, statusCode, code)
 *  - ValidationError        -> 400 VALIDATION_ERROR
 *  - NotFoundError          -> 404 NOT_FOUND
 *  - InsufficientFundsError -> 422 INSUFFICIENT_FUNDS
 *  - ContestFullError       -> 409 CONTEST_FULL
 *  - AlreadyJoinedError     -> 409 ALREADY_JOINED
 */
