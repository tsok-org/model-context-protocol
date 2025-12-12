/**
 * @fileoverview Type Definitions for Distributed Streamable HTTP Transport
 *
 * This module defines the TypeScript interfaces for the transport layer, including:
 * - JSON-RPC message types (re-exported from SDK)
 * - Transport interface and options
 * - EventBroker abstraction for distributed messaging
 * - Session management interfaces
 * - HTTP middleware types
 *
 * @module interfaces
 */

import { IncomingMessage, ServerResponse } from "http";

// Import core types from the SDK
import type { JSONRPCRequest, JSONRPCResponse, JSONRPCErrorResponse, JSONRPCNotification, JSONRPCMessage } from "model-context-protocol-sdk";

// Re-export for backward compatibility
export type { JSONRPCRequest, JSONRPCResponse, JSONRPCErrorResponse as JSONRPCError, JSONRPCNotification, JSONRPCMessage };

// Standard JSON-RPC error codes (re-export from SDK)
import { PARSE_ERROR, INVALID_REQUEST, METHOD_NOT_FOUND, INVALID_PARAMS, INTERNAL_ERROR } from "model-context-protocol-sdk";

/** JSON-RPC error codes enum for backward compatibility */
export const ErrorCode = {
  ParseError: PARSE_ERROR,
  InvalidRequest: INVALID_REQUEST,
  MethodNotFound: METHOD_NOT_FOUND,
  InvalidParams: INVALID_PARAMS,
  InternalError: INTERNAL_ERROR
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ============================================================================
// Transport Interface
// ============================================================================

/**
 * Options for sending messages through the transport.
 */
export interface TransportSendOptions {
  /** Target session ID (required for routing) */
  readonly sessionId?: string;
  /** Request ID if this message is a response to a specific request */
  readonly requestId?: string | number;
  /** Abort signal for cancellation */
  readonly signal?: AbortSignal;
}

/**
 * Handler function for processing incoming messages.
 * Called for each JSON-RPC message received via POST.
 */
export type MessageHandler = (message: JSONRPCMessage, extra?: { session?: Session }) => Promise<void> | void;

/**
 * Transport interface for sending and receiving JSON-RPC messages.
 *
 * Implementations handle the wire protocol (HTTP, WebSocket, etc.)
 * and route messages through the EventBroker for distribution.
 */
export interface Transport {
  /** Send a message to a specific session */
  send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void>;

  /** Set the handler for incoming messages */
  setMessageHandler(handler: MessageHandler): void;

  /** Remove the message handler */
  removeMessageHandler(): void;

  /** Start the transport (begin accepting connections) */
  start(): Promise<void>;

  /** Stop the transport (close all connections) */
  stop(): Promise<void>;

  /** Connect the transport - alias for start() (SDK compatibility) */
  connect(): Promise<void>;

  /** Disconnect the transport - alias for stop() (SDK compatibility) */
  disconnect(): Promise<void>;

  /** Check if the transport is actively accepting connections */
  isConnected(): boolean;

  /** Callback when transport is closed */
  onClose?: () => void;

  /** Callback when an error occurs */
  onError?: (error: Error) => void;

  /** Callback for each received message (in addition to handler) */
  onMessage?: (message: JSONRPCMessage, extra?: { session?: Session }) => void;
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Session interface for storing request-scoped data.
 *
 * Sessions are identified by the `Mcp-Session-Id` header and can store
 * arbitrary key-value data for the duration of the session.
 */
export interface Session {
  /** Unique session identifier */
  readonly id: string;

  /** Get a value from session storage */
  getValue<T = unknown>(key: string): T | undefined;

  /** Set a value in session storage */
  setValue<T = unknown>(key: string, value: T): void;

  /** Delete a value from session storage */
  deleteValue(key: string): void;
}

/**
 * Transport-level request information (e.g., HTTP headers).
 * Passed to SessionManager for session creation/validation.
 */
export interface TransportRequest {
  readonly headers: Record<string, string | readonly string[] | undefined>;
}

/**
 * Information required to create or retrieve a session.
 */
export type SessionRequest = {
  readonly request?: TransportRequest;
};

/**
 * Manager for creating and managing sessions.
 *
 * Implementations may use in-memory storage, Redis, database, etc.
 */
export interface SessionManager {
  /** Create a new session */
  create(request: SessionRequest): Session;

  /** Get an existing session by ID (undefined if not found or expired) */
  get(sessionId: string, request: SessionRequest): Session | undefined;

  /** Delete a session */
  delete(sessionId: string, request: SessionRequest): void;
}

/** Event/message identifier from the broker */
export type EventId = string;

// ============================================================================
// EventBroker Abstraction
// ============================================================================

/**
 * Defines the logical routing key for a message stream.
 *
 * Used internally for topic subject generation.
 */
export interface StreamKey {
  /** Session identifier */
  sessionId: string;
  /** Request identifier (optional - undefined for background channel) */
  requestId?: string;
}

/**
 * A typed definition for a messaging topic/channel.
 *
 * Topics use TypeScript's structural typing to enforce type safety
 * at compile time for both parameters and payload types.
 *
 * @template TParams - Parameters required to construct the subject string
 * @template TData - The TypeScript type of the message payload
 *
 * @example
 * ```typescript
 * const RequestInbound: Topic<{ sessionId: string, requestId: string }, JSONRPCMessage> = {
 *   subject: (p) => `mcp.${p.sessionId}.${p.requestId}.inbound`
 * };
 * ```
 */
export interface Topic<TParams, TData> {
  /**
   * Generate the broker subject string from parameters.
   * For NATS: `mcp.session1.req1.inbound`
   * For Kafka: Used as topic name with sessionId as partition key
   */
  subject(params: TParams): string;

  /**
   * Phantom property for compile-time type checking.
   * Ensures Topic<A, string> is incompatible with Topic<A, number>.
   */
  readonly _types?: {
    params: TParams;
    data: TData;
  };
}

/**
 * Metadata attached to each broker message.
 */
export interface MessageMeta {
  /** Unix timestamp when message was published */
  timestamp: number;
  /** The actual subject/topic string this message arrived on */
  subject: string;
  /** Number of times this message has been delivered (for retry tracking) */
  deliveryAttempt: number;
}

/**
 * Wrapper for messages received from the broker.
 *
 * Includes the payload, metadata, and acknowledgment methods.
 *
 * @template TData - Type of the message payload
 */
export interface BrokerMessage<TData = unknown> {
  /**
   * Broker sequence ID (used for SSE resumability via Last-Event-ID).
   * Format depends on broker implementation (e.g., NATS sequence number).
   */
  id: EventId;

  /** The message payload */
  data: TData;

  /** System metadata (timestamp, subject, delivery count) */
  meta: MessageMeta;

  /**
   * Acknowledge successful processing.
   * For workers: marks task as complete, won't be redelivered.
   * For transport: confirms delivery (optional but recommended).
   */
  ack(): Promise<void>;

  /**
   * Negative acknowledge - request redelivery.
   * @param delayMs - Optional delay before redelivery
   */
  nack(delayMs?: number): Promise<void>;
}

/**
 * Options for subscribing to a topic.
 */
export interface SubscriptionOptions {
  /**
   * Start replaying from this sequence ID.
   * Used for SSE resumability (Last-Event-ID header).
   */
  fromEventId?: EventId;

  /**
   * Queue group name for load-balanced consumption.
   * Messages are distributed among subscribers with the same group name.
   * Used for worker pools processing requests.
   */
  queueGroup?: string;
}

/**
 * A subscription to a topic, providing async iteration over messages.
 *
 * @template TData - Type of message payloads
 */
export interface Subscription<TData> extends AsyncIterable<BrokerMessage<TData>> {
  /** Unsubscribe and clean up resources */
  unsubscribe(): Promise<void>;

  /**
   * Wait for the subscription to be ready to receive messages.
   * This is optional - implementations may return immediately if the subscription
   * is already ready, or wait for the underlying consumer to be created.
   */
  ready?(): Promise<void>;
}

/**
 * EventBroker interface for distributed message routing.
 *
 * Abstracts the underlying messaging system (NATS JetStream, Kafka, Redis, etc.)
 * to provide typed publish/subscribe operations.
 *
 * ## Implementation Notes
 *
 * - **NATS JetStream**: Use streams with subject-based routing
 * - **Kafka**: Use topic per message type, partition by sessionId
 * - **Redis Streams**: Use XADD/XREAD with consumer groups
 *
 * @example
 * ```typescript
 * // Publishing a request
 * await broker.publish(RequestInbound, { sessionId, requestId }, jsonRpcRequest);
 *
 * // Subscribing to responses (worker pool)
 * const sub = broker.subscribe(RequestInbound, { sessionId: "*", requestId: "*" }, {
 *   queueGroup: "mcp-workers"
 * });
 *
 * for await (const msg of sub) {
 *   await processRequest(msg.data);
 *   await msg.ack();
 * }
 * ```
 */
export interface EventBroker {
  /**
   * Publish a message to a topic.
   * @returns The event ID assigned by the broker
   */
  publish<TParams, TData>(topic: Topic<TParams, TData>, params: TParams, data: TData): Promise<EventId>;

  /**
   * Subscribe to a topic.
   * Returns an async iterable of messages.
   */
  subscribe<TParams, TData>(topic: Topic<TParams, TData>, params: TParams, options?: SubscriptionOptions): Subscription<TData>;

  /**
   * Close the broker connection and clean up resources.
   */
  close(): Promise<void>;
}

// ============================================================================
// HTTP Server & Middleware
// ============================================================================

/** Middleware next function */
export type Next = (err?: unknown) => void | Promise<void>;

/** Standard middleware (req, res, next) */
export type Middleware = (req: IncomingMessage, res: ServerResponse, next: Next) => void | Promise<void>;

/** Error middleware (err, req, res, next) */
export type ErrorMiddleware = (err: unknown, req: IncomingMessage, res: ServerResponse, next: Next) => void | Promise<void>;

/**
 * HTTP server configuration options.
 */
export interface HttpServerOptions {
  /** Port to listen on */
  port: number;

  /** Host to bind to (default: 0.0.0.0) */
  host?: string;

  /**
   * The endpoint path for Streamable HTTP.
   * Per MCP spec, server exposes exactly ONE HTTP path that supports POST and GET.
   * @default '/mcp'
   */
  endpoint?: string;

  /** Middleware chain (CORS, auth, logging, etc.) */
  middlewares?: Array<Middleware | ErrorMiddleware>;
}

// ============================================================================
// Streamable HTTP Response Modes
// ============================================================================

/**
 * Response mode for POST requests containing JSON-RPC requests.
 *
 * - **json**: Return responses as a single JSON body
 * - **sse**: Stream responses and progress as SSE events
 */
export type ResponseMode = "json" | "sse";

/**
 * Strategy function to determine response mode for a POST request.
 *
 * Called when a POST contains at least one JSON-RPC request (not just notifications).
 * The server can choose based on:
 * - Request method (e.g., tools/call typically needs streaming)
 * - Presence of progressToken in _meta
 * - Session state or client preferences
 *
 * @param messages - The parsed JSON-RPC messages from the POST body
 * @param session - The session context (if available)
 * @returns The response mode to use
 */
export type ResponseModeStrategy = (messages: JSONRPCMessage[], session?: Session) => ResponseMode;

/**
 * Options specific to Streamable HTTP transport behavior.
 */
export interface StreamableHttpOptions {
  /**
   * Timeout for waiting on JSON responses (ms).
   * If response not received within this time, returns timeout error.
   * Only applies to ResponseMode 'json'.
   * @default 30000
   */
  responseTimeoutMs?: number;

  /**
   * Strategy to determine response mode for requests.
   *
   * Default strategy uses SSE for:
   * - `tools/call`, `sampling/createMessage`, `prompts/get`
   * - Any request with `_meta.progressToken`
   */
  responseModeStrategy?: ResponseModeStrategy;

  /**
   * Enable GET background channel for server-initiated messages.
   * If false, GET requests return 405 Method Not Allowed.
   * @default true
   */
  enableBackgroundChannel?: boolean;

  /**
   * Enable client-initiated session termination via DELETE.
   * If false, DELETE requests return 405 Method Not Allowed.
   * @default true
   */
  enableSessionTermination?: boolean;
}

/**
 * Categorizes message intent for filtering/routing.
 * Maps to the message type in JSON-RPC.
 */
export type MessageKind =
  | "request" // JSON-RPC Request (expects a response)
  | "response" // JSON-RPC Response (resolves a request)
  | "notification" // JSON-RPC Notification (one-way)
  | "error" // JSON-RPC Error or transport error
  | "control"; // Internal control signals (e.g., keep-alive)
