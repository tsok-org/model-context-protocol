/**
 * @fileoverview EventBroker Topic Definitions for Streamable HTTP Transport
 *
 * This module defines the typed topic structure for routing MCP messages through
 * an EventBroker (NATS JetStream, Kafka, etc.) in a distributed deployment.
 *
 * ## Topic Naming Convention
 *
 * All topics follow the pattern: `mcp.{sessionId}.{scope}.{direction}`
 *
 * - **sessionId**: Unique identifier for the client session
 * - **scope**: Either a specific `requestId` or `bg` (background)
 * - **direction**: `inbound` (to workers) or `outbound` (to client)
 *
 * ## Topic Categories
 *
 * ### Request-Scoped Topics (for client requests)
 *
 * ```
 * mcp.{sessionId}.{requestId}.inbound   ← Workers consume (queue group)
 * mcp.{sessionId}.{requestId}.outbound  ← Transport subscribes for response
 * ```
 *
 * ### Session-Scoped Topics (for background channel)
 *
 * ```
 * mcp.{sessionId}.bg.outbound           ← Server notifications to client
 * mcp.{sessionId}.bg.inbound            ← Server requests to client
 * ```
 *
 * ## Message Flow Examples
 *
 * ### Client Request (tools/call)
 *
 * ```
 * 1. Client POST → Transport receives request
 * 2. Transport publishes to mcp.session1.req1.inbound
 * 3. Worker (queue group) consumes from inbound
 * 4. Worker processes and publishes to mcp.session1.req1.outbound
 * 5. Transport subscribes to outbound, receives response
 * 6. Transport sends response to client (JSON or SSE)
 * ```
 *
 * ### Server Notification (tools/list_changed)
 *
 * ```
 * 1. Server publishes to mcp.session1.bg.outbound
 * 2. Transport (GET /mcp) subscribes to bg.outbound
 * 3. Transport streams notification via SSE
 * ```
 *
 * @module topics
 */

import { Topic, JSONRPCMessage } from "./interfaces";

// ============================================================================
// Topic Parameter Types
// ============================================================================

/**
 * Parameters for request-scoped topics.
 * Used for messages tied to a specific client request (has a response).
 */
export interface RequestScopeParams {
  /** Session identifier from Mcp-Session-Id header */
  sessionId: string;
  /** Request identifier from JSON-RPC id field */
  requestId: string;
}

/**
 * Parameters for session-scoped topics.
 * Used for background channel messages not tied to any specific request.
 */
export interface SessionScopeParams {
  /** Session identifier from Mcp-Session-Id header */
  sessionId: string;
}

// ============================================================================
// Topic Factory Helpers
// ============================================================================

/**
 * Create a request-scoped topic (includes requestId in subject).
 */
const createRequestScopedTopic = <D>(
  suffix: string
): Topic<RequestScopeParams, D> => ({
  subject: (p: RequestScopeParams) =>
    `mcp.${p.sessionId}.${p.requestId}.${suffix}`
});

/**
 * Create a session-scoped topic (uses "bg" segment, no requestId).
 */
const createSessionScopedTopic = <D>(
  suffix: string
): Topic<SessionScopeParams, D> => ({
  subject: (p: SessionScopeParams) => `mcp.${p.sessionId}.bg.${suffix}`
});

// ============================================================================
// Request-Scoped Topics
// ============================================================================

/**
 * Topic for client requests that require a response.
 *
 * Workers subscribe to this with a **queue group** for load balancing.
 * Only one worker in the group receives each message.
 *
 * ## Flow
 *
 * ```
 * Client POST → Transport publishes here → Worker (queue) consumes
 *                                          → Worker publishes response to RequestOutbound
 * ```
 *
 * ## Subject Pattern
 *
 * `mcp.{sessionId}.{requestId}.inbound`
 *
 * @example
 * ```typescript
 * // Transport publishes client request
 * await broker.publish(RequestInbound, { sessionId, requestId }, jsonRpcRequest);
 *
 * // Worker subscribes with queue group for load balancing
 * const sub = broker.subscribe(RequestInbound, { sessionId: "*", requestId: "*" }, {
 *   queueGroup: "mcp-workers"
 * });
 * ```
 */
export const RequestInbound: Topic<RequestScopeParams, JSONRPCMessage> =
  createRequestScopedTopic("inbound");

/**
 * Topic for responses and progress notifications to a specific request.
 *
 * The transport instance that received the original POST subscribes here
 * to receive the response and forward it to the client.
 *
 * ## Flow
 *
 * ```
 * Worker publishes response → Transport subscribes → Transport sends to client
 * ```
 *
 * Progress notifications (if any) are also published here for SSE streaming.
 *
 * ## Subject Pattern
 *
 * `mcp.{sessionId}.{requestId}.outbound`
 *
 * @example
 * ```typescript
 * // Transport subscribes to receive response
 * const sub = broker.subscribe(RequestOutbound, { sessionId, requestId });
 * for await (const msg of sub) {
 *   // Forward to client via JSON response or SSE stream
 * }
 *
 * // Worker publishes response
 * await broker.publish(RequestOutbound, { sessionId, requestId }, jsonRpcResponse);
 * ```
 */
export const RequestOutbound: Topic<RequestScopeParams, JSONRPCMessage> =
  createRequestScopedTopic("outbound");

// ============================================================================
// Session-Scoped Topics (Background Channel)
// ============================================================================

/**
 * Topic for server-initiated notifications on the background channel.
 *
 * These are NOT responses to client requests - they are server-initiated
 * messages pushed to connected clients via the GET SSE stream.
 *
 * ## Use Cases
 *
 * - `notifications/tools/list_changed` - Tool availability changed
 * - `notifications/resources/updated` - Resource content changed
 * - `notifications/prompts/list_changed` - Prompts changed
 * - Custom server notifications
 *
 * ## Flow
 *
 * ```
 * Server publishes → Transport (GET /mcp) subscribes → SSE to client
 * ```
 *
 * ## Subject Pattern
 *
 * `mcp.{sessionId}.bg.outbound`
 *
 * @example
 * ```typescript
 * // Server publishes notification
 * await broker.publish(BackgroundOutbound, { sessionId }, {
 *   jsonrpc: "2.0",
 *   method: "notifications/tools/list_changed"
 * });
 *
 * // Transport (GET handler) subscribes
 * const sub = broker.subscribe(BackgroundOutbound, { sessionId });
 * for await (const msg of sub) {
 *   res.write(`event: message\ndata: ${JSON.stringify(msg.data)}\n\n`);
 * }
 * ```
 */
export const BackgroundOutbound: Topic<SessionScopeParams, JSONRPCMessage> =
  createSessionScopedTopic("outbound");

/**
 * Topic for server-initiated requests on the background channel.
 *
 * Used when the server needs to ask the client for something.
 * The client responds via POST, creating a new request chain.
 *
 * ## Use Cases
 *
 * - `sampling/createMessage` - Server asks client to sample from LLM
 * - `roots/list` - Server asks client for filesystem roots
 *
 * ## Flow
 *
 * ```
 * Server publishes request → Transport (GET /mcp) subscribes → SSE to client
 *                                                            → Client POSTs response
 * ```
 *
 * ## Subject Pattern
 *
 * `mcp.{sessionId}.bg.inbound`
 *
 * @example
 * ```typescript
 * // Server requests sampling from client
 * await broker.publish(BackgroundInbound, { sessionId }, {
 *   jsonrpc: "2.0",
 *   id: "server-req-1",
 *   method: "sampling/createMessage",
 *   params: { messages: [...] }
 * });
 * ```
 */
export const BackgroundInbound: Topic<SessionScopeParams, JSONRPCMessage> =
  createSessionScopedTopic("inbound");

// ============================================================================
// Utility Topics
// ============================================================================

/**
 * Wildcard subscription for all messages in a session.
 *
 * Useful for debugging, monitoring, or session-wide message logging.
 * Should NOT be used in production message processing.
 *
 * ## Subject Pattern
 *
 * `mcp.{sessionId}.>` (NATS wildcard)
 *
 * @example
 * ```typescript
 * // Monitor all messages for a session (debugging)
 * const sub = broker.subscribe(SessionWildcard, { sessionId });
 * for await (const msg of sub) {
 *   console.log(`[${msg.meta.subject}]`, msg.data);
 * }
 * ```
 */
export const SessionWildcard: Topic<SessionScopeParams, JSONRPCMessage> = {
  subject: (p) => `mcp.${p.sessionId}.>`
};
