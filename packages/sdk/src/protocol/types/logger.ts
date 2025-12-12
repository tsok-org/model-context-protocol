/**
 * Base structured metadata for log entries.
 * Provides common fields for distributed systems logging.
 * Extend this interface to add application-specific fields.
 *
 * @example
 * ```typescript
 * // Extend for your application
 * interface MyAppContext extends BaseLogContext {
 *   userId: string;
 *   tenantId: string;
 *   featureFlags: Record<string, boolean>;
 * }
 * ```
 */
export interface BaseLogContext {
  // ─────────────────────────────────────────────────────────────────────────────
  // Tracing & Correlation (OpenTelemetry compatible)
  // ─────────────────────────────────────────────────────────────────────────────
  /** Correlation ID for distributed tracing */
  correlationId?: string;
  /** Request ID for request-scoped logging */
  requestId?: string;
  /** Session ID for session-scoped logging */
  sessionId?: string;
  /** OpenTelemetry trace ID */
  traceId?: string;
  /** OpenTelemetry span ID */
  spanId?: string;
  /** Parent span ID for nested traces */
  parentSpanId?: string;

  // ─────────────────────────────────────────────────────────────────────────────
  // Identity & Multi-tenancy
  // ─────────────────────────────────────────────────────────────────────────────
  /** User ID performing the action */
  userId?: string;
  /** Tenant ID for multi-tenant systems */
  tenantId?: string;
  /** Organization ID */
  organizationId?: string;

  // ─────────────────────────────────────────────────────────────────────────────
  // Service Context
  // ─────────────────────────────────────────────────────────────────────────────
  /** Service or application name */
  service?: string;
  /** Component or module name */
  component?: string;
  /** Operation being performed */
  operation?: string;
  /** Service version */
  version?: string;
  /** Runtime environment */
  environment?: "development" | "staging" | "production" | string;
  /** Hostname or pod name */
  hostname?: string;
  /** Process ID */
  pid?: number;

  // ─────────────────────────────────────────────────────────────────────────────
  // Request Context (HTTP/RPC)
  // ─────────────────────────────────────────────────────────────────────────────
  /** HTTP method or RPC method name */
  method?: string;
  /** URL path or RPC endpoint */
  path?: string;
  /** HTTP status code */
  statusCode?: number;
  /** Client IP address */
  clientIp?: string;
  /** User agent string */
  userAgent?: string;

  // ─────────────────────────────────────────────────────────────────────────────
  // Performance Metrics
  // ─────────────────────────────────────────────────────────────────────────────
  /** Duration in milliseconds */
  durationMs?: number;
  /** Timestamp of the event (ISO 8601) */
  timestamp?: string;

  // ─────────────────────────────────────────────────────────────────────────────
  // Classification & Search
  // ─────────────────────────────────────────────────────────────────────────────
  /** Searchable tags/labels */
  tags?: string[];
  /** Event category for filtering */
  category?: string;
}

/**
 * Extended log context with index signature for dynamic fields.
 * Use this when you need to add arbitrary fields not defined in BaseLogContext.
 */
export interface LogContext extends BaseLogContext {
  /** Additional typed metadata (escape hatch for dynamic fields) */
  [key: string]: string | number | boolean | string[] | null | undefined;
}

/**
 * Base error context for structured error logging.
 * Extends BaseLogContext with error-specific fields.
 */
export interface BaseErrorContext extends BaseLogContext {
  /** Error object for stack trace extraction */
  error?: Error;
  /** Error code for categorization */
  errorCode?: string;
  /** Error name/type */
  errorName?: string;
  /** Whether the error is recoverable */
  recoverable?: boolean;
  /** Number of retry attempts made */
  retryAttempt?: number;
  /** Maximum retry attempts allowed */
  maxRetries?: number;
  /** Original error if this is a wrapped error */
  cause?: Error;
}

/**
 * Extended error context with index signature for dynamic fields.
 */
export interface ErrorContext extends BaseErrorContext {
  /** Additional typed metadata (escape hatch for dynamic fields) */
  [key: string]: string | number | boolean | string[] | Error | null | undefined;
}

/**
 * Generic logger interface for the MCP SDK.
 * Strongly typed with support for structured logging and custom context extensions.
 *
 * @typeParam TContext - Custom log context type (extends BaseLogContext)
 * @typeParam TErrorContext - Custom error context type (extends BaseErrorContext)
 *
 * Implementations can adapt any logging library (Winston, Pino, Bunyan, etc.)
 * to this interface.
 *
 * @example
 * ```typescript
 * // Basic usage with default context
 * const logger: Logger = createLogger();
 * logger.info("Server started", { port: 3000, component: "server" });
 *
 * // Error logging with context
 * logger.error("Connection failed", {
 *   error: err,
 *   errorCode: "CONN_REFUSED",
 *   component: "transport",
 *   recoverable: true
 * });
 *
 * // Custom context for your application
 * interface MyAppContext extends BaseLogContext {
 *   userId: string;
 *   tenantId: string;
 *   feature: string;
 * }
 *
 * interface MyErrorContext extends BaseErrorContext {
 *   userId: string;
 *   tenantId: string;
 * }
 *
 * const appLogger: Logger<MyAppContext, MyErrorContext> = createLogger();
 * appLogger.info("User action", {
 *   userId: "user_123",
 *   tenantId: "tenant_abc",
 *   feature: "checkout"
 * });
 *
 * // Adapt Winston logger
 * const logger: Logger = {
 *   debug: (message, context) => winston.debug(message, context),
 *   info: (message, context) => winston.info(message, context),
 *   warn: (message, context) => winston.warn(message, context),
 *   error: (message, context) => winston.error(message, context)
 * };
 * ```
 */
export interface Logger<TContext extends BaseLogContext = LogContext, TErrorContext extends BaseErrorContext = ErrorContext> {
  /**
   * Log a debug message.
   * Use for detailed diagnostic information during development.
   * @param message The message to log
   * @param context Optional structured context/metadata
   */
  debug(message: string, context?: TContext): void;

  /**
   * Log an informational message.
   * Use for general operational information.
   * @param message The message to log
   * @param context Optional structured context/metadata
   */
  info(message: string, context?: TContext): void;

  /**
   * Log a warning message.
   * Use for potentially harmful situations that don't prevent operation.
   * @param message The message to log
   * @param context Optional structured context/metadata
   */
  warn(message: string, context?: TContext): void;

  /**
   * Log an error message.
   * Use for error events that might still allow the application to continue.
   * @param message The message to log
   * @param context Optional error context with error object
   */
  error(message: string, error: Error, context?: TErrorContext): void;
}
