/**
 * @human4.ai/distributed-streamable-http-server-transport
 *
 * Distributed Streamable HTTP Server Transport for Model Context Protocol (MCP).
 *
 * ## Overview
 *
 * This library provides a production-ready HTTP transport that implements the
 * MCP Streamable HTTP specification with EventBroker-based message routing
 * for horizontal scaling across multiple server instances.
 *
 * ## MCP Streamable HTTP Specification
 *
 * The transport exposes a single HTTP endpoint (default `/mcp`) supporting:
 *
 * - **POST**: Client sends JSON-RPC messages, server responds with JSON or SSE
 * - **GET**: Background SSE channel for server-initiated messages
 * - **DELETE**: Session termination
 *
 * ## Distributed Architecture
 *
 * Messages are routed through an EventBroker (NATS JetStream, Kafka, etc.)
 * rather than in-memory, enabling:
 *
 * - Horizontal scaling across multiple transport instances
 * - Load balancing of request processing via worker queue groups
 * - Fault tolerance through message persistence
 * - SSE resumability via broker sequence IDs
 *
 * ## Quick Start
 *
 * ```typescript
 * import {
 *   DistributedStreamableHttpServerTransport,
 *   EventBroker
 * } from '@human4.ai/distributed-streamable-http-server-transport';
 *
 * const transport = new DistributedStreamableHttpServerTransport({
 *   httpServer: { port: 3000, endpoint: '/mcp' },
 *   eventBroker: myNatsEventBroker,
 *   sessions: myRedisSessionManager,
 * });
 *
 * await transport.start();
 * ```
 *
 * @module distributed-streamable-http-server-transport
 */

// ============================================================================
// Transport
// ============================================================================

export { DistributedStreamableHttpServerTransport, type DistributedStreamableHttpServerTransportOptions } from "./transport.js";

// ============================================================================
// Core Interfaces
// ============================================================================

export {
  // Transport types
  type Transport,
  type TransportSendOptions,
  type MessageHandler,

  // Session management
  type SessionManager,
  type Session,
  type SessionRequest,

  // JSON-RPC types (re-exported from SDK for convenience)
  type JSONRPCMessage,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type JSONRPCError,
  type JSONRPCNotification,

  // EventBroker abstraction
  type EventBroker,
  type Subscription,
  type SubscriptionOptions,
  type BrokerMessage,
  type Topic,
  type StreamKey,
  type EventId,
  type MessageMeta,

  // HTTP server types
  type Middleware,
  type ErrorMiddleware,
  type HttpServerOptions,

  // Streamable HTTP types
  type StreamableHttpOptions,
  type ResponseMode,
  type ResponseModeStrategy,
  type MessageKind,

  // Legacy error code re-export
  ErrorCode
} from "./interfaces.js";

// ============================================================================
// Topics
// ============================================================================

export {
  // Request-scoped topics (for client requests)
  RequestInbound,
  RequestOutbound,

  // Session-scoped topics (for background channel)
  BackgroundOutbound,
  BackgroundInbound,

  // Utility topics
  SessionWildcard,

  // Parameter types
  type RequestScopeParams,
  type SessionScopeParams
} from "./topics.js";
