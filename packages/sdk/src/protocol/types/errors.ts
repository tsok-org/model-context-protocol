/**
 * Protocol Errors
 *
 * Errors specific to protocol operations like handler execution,
 * request timeouts, and connection management.
 */

import { INTERNAL_ERROR, INVALID_PARAMS, INVALID_REQUEST, METHOD_NOT_FOUND, PARSE_ERROR } from "../schema";

// =============================================================================
// Base Protocol Error
// =============================================================================

export abstract class ProtocolError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "Error";
    this.code = code;
    this.data = data;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ProtocolError);
    }
  }
}

// =============================================================================
// Handler & Request Errors
// =============================================================================

/**
 * Error thrown when a message handler throws an error.
 */
export class HandlerError extends ProtocolError {
  constructor(
    message: string,
    public readonly method: string,
    public readonly originalError: Error,
    data?: unknown
  ) {
    super(INTERNAL_ERROR, message, {
      ...(data as object),
      method,
      originalError: originalError.message,
      stack: originalError.stack
    });
    this.name = "HandlerError";
  }
}

/**
 * Error thrown when a request times out.
 */
export class RequestTimeoutError extends ProtocolError {
  constructor(
    public readonly requestId: string,
    public readonly sessionId: string,
    public readonly timeoutMs: number
  ) {
    super(INTERNAL_ERROR, `Request ${requestId} in session ${sessionId} timed out after ${timeoutMs}ms`, {
      requestId,
      sessionId,
      timeoutMs
    });
    this.name = "RequestTimeoutError";
  }
}

/**
 * Error thrown when connection is closed unexpectedly.
 */
export class ConnectionClosedError extends ProtocolError {
  constructor(message = "Connection closed") {
    super(INTERNAL_ERROR, message);
    this.name = "ConnectionClosedError";
  }
}

// =============================================================================
// JSON-RPC Standard Errors
// =============================================================================

/**
 * Parse error (-32700).
 * Invalid JSON was received by the server.
 */
export class ParseError extends ProtocolError {
  constructor(message = "Parse error", data?: unknown) {
    super(PARSE_ERROR, message, data);
    this.name = "ParseError";
  }
}

/**
 * Invalid request error (-32600).
 * The JSON sent is not a valid Request object.
 */
export class InvalidRequestError extends ProtocolError {
  constructor(message = "Invalid request", data?: unknown) {
    super(INVALID_REQUEST, message, data);
    this.name = "InvalidRequestError";
  }
}

/**
 * Method not found error (-32601).
 * The method does not exist or is not available.
 */
export class MethodNotFoundError extends ProtocolError {
  constructor(method: string, data?: unknown) {
    super(METHOD_NOT_FOUND, `Method not found: ${method}`, data);
    this.name = "MethodNotFoundError";
  }
}

/**
 * Invalid params error (-32602).
 * Invalid method parameter(s).
 */
export class InvalidParamsError extends ProtocolError {
  constructor(message = "Invalid params", data?: unknown) {
    super(INVALID_PARAMS, message, data);
    this.name = "InvalidParamsError";
  }
}

/**
 * Internal error (-32603).
 * Internal JSON-RPC error.
 */
export class InternalError extends ProtocolError {
  constructor(message = "Internal error", data?: unknown) {
    super(INTERNAL_ERROR, message, data);
    this.name = "InternalError";
  }
}

/**
 * Validation error.
 * Schema validation failed.
 */
export class ValidationError extends ProtocolError {
  readonly validationErrors: readonly ValidationErrorDetail[];

  constructor(message: string, errors: readonly ValidationErrorDetail[]) {
    super(
      INVALID_PARAMS,
      message,
      errors.map((e) => e.toJSON())
    );
    this.name = "ValidationError";
    this.validationErrors = errors;
  }
}

/**
 * Validation error detail.
 */
export interface ValidationErrorDetail {
  readonly path: string;
  readonly message: string;
  readonly keyword?: string;
  readonly params?: Record<string, unknown>;
  toJSON(): Record<string, unknown>;
}

/**
 * Create a validation error detail.
 */
export function createValidationErrorDetail(
  path: string,
  message: string,
  keyword?: string,
  params?: Record<string, unknown>
): ValidationErrorDetail {
  return {
    path,
    message,
    keyword,
    params,
    toJSON() {
      return {
        path: this.path,
        message: this.message,
        ...(this.keyword !== undefined && { keyword: this.keyword }),
        ...(this.params !== undefined && { params: this.params })
      };
    }
  };
}

/**
 * Session error.
 * Session-related errors.
 */
export class SessionError extends ProtocolError {
  constructor(message: string, code = INTERNAL_ERROR, data?: unknown) {
    super(code, message, data);
    this.name = "SessionError";
  }
}

/**
 * Session not found error.
 */
export class SessionNotFoundError extends SessionError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`, INVALID_PARAMS);
    this.name = "SessionNotFoundError";
  }
}

/**
 * Session expired error.
 */
export class SessionExpiredError extends SessionError {
  constructor(sessionId: string) {
    super(`Session expired: ${sessionId}`, INVALID_PARAMS);
    this.name = "SessionExpiredError";
  }
}

/**
 * Transport error.
 * Transport-layer errors.
 */
export class TransportError extends ProtocolError {
  constructor(message: string, data?: unknown) {
    super(INTERNAL_ERROR, message, data);
    this.name = "TransportError";
  }
}

/**
 * Connection error.
 */
export class ConnectionError extends TransportError {
  constructor(message = "Connection error", data?: unknown) {
    super(message, data);
    this.name = "ConnectionError";
  }
}

/**
 * Timeout error.
 */
export class TimeoutError extends TransportError {
  constructor(message = "Request timeout", data?: unknown) {
    super(message, data);
    this.name = "TimeoutError";
  }
}
