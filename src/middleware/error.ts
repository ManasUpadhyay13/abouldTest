/**
 * Express error-handling middleware.
 *
 * Responsibility:
 *  - Catch errors thrown by route handlers.
 *  - Map AppError instances to their status code + { error: { code, message } }.
 *  - Map any unexpected error to a generic 500 (and log it).
 *
 * Planned exports:
 *  - errorHandler(err, req, res, next)
 */
