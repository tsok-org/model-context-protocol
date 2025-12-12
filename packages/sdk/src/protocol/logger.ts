// =============================================================================
// Logger Interface - Strongly Typed with Generic Extensions
// =============================================================================

import { ErrorContext, LogContext, Logger } from "./types";

/**
 * No-op logger implementation that discards all log messages.
 * This is the default logger to avoid interfering with stdio transport.
 *
 * If you need logging, provide your own Logger implementation via ProtocolOptions.
 */
export class NoopLogger implements Logger {
  debug(_message: string, _context?: LogContext): void {
    // No-op
  }

  info(_message: string, _context?: LogContext): void {
    // No-op
  }

  warn(_message: string, _context?: LogContext): void {
    // No-op
  }

  error(_message: string, _error?: Error, _context?: ErrorContext): void {
    // No-op
  }
}

/**
 * Console-based logger implementation.
 * Logs to console with timestamps and context.
 *
 * WARNING: Do not use with stdio transport as it will corrupt the message stream.
 * Only use for debugging with SSE or other non-stdio transports.
 */
export class ConsoleLogger implements Logger {
  constructor(private readonly prefix = "[MCP]") {}

  debug(message: string, context?: LogContext): void {
    console.debug(`${this.prefix} [DEBUG] ${message}`, context);
  }

  info(message: string, context?: LogContext): void {
    console.info(`${this.prefix} [INFO] ${message}`, context);
  }

  warn(message: string, context?: LogContext): void {
    console.warn(`${this.prefix} [WARN] ${message}`, context);
  }

  error(message: string, error?: Error, context?: ErrorContext): void {
    console.error(`${this.prefix} [ERROR] ${message}`, error, context);
  }
}
