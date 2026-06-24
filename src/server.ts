/**
 * API server entrypoint.
 *
 * Responsibility:
 *  - Create the app via createApp() and listen on env.port.
 *  - This is the stateless, horizontally-scalable HTTP process (runs behind the
 *    ALB; many replicas).
 */
