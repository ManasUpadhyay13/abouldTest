/**
 * Express application factory.
 *
 * Responsibility:
 *  - Build the Express app: JSON body parsing, GET /health, mount the module
 *    routers (/wallets, /contests, /leaderboards), and register the error
 *    handler LAST.
 *
 * Planned exports:
 *  - createApp(): express.Express
 */
