export const SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = ["2025-11-25"];

// =============================================================================
// Timeouts
// =============================================================================

/**
 * Default timeout for requests in milliseconds.
 * Requests that don't complete within this time will be rejected.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 60000; // 60 seconds

/**
 * Default keep-alive interval in milliseconds.
 */
export const DEFAULT_KEEP_ALIVE_INTERVAL_MS = 15000; // 15 seconds

/**
 * Default maximum message size in bytes.
 */
export const DEFAULT_MAX_MESSAGE_SIZE = 4194304; // 4MB

/**
 * Default session TTL in milliseconds.
 */
export const DEFAULT_SESSION_TTL_MS = 3600000; // 1 hour
