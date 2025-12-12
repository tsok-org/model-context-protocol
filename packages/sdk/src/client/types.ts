/**
 * Client Types
 *
 * Type definitions specific to MCP Client implementations.
 *
 * Naming convention:
 * - "Incoming" = messages FROM server TO client
 * - "Outgoing" = messages FROM client TO server
 */

import type {
  ServerRequest,
  ServerNotification,
  ClientResult,
  ClientRequest,
  ClientNotification,
  ServerResult,
  ServerCapabilities,
  ClientCapabilities,
  Implementation,
  JSONRPCResultResponse,
  Context,
  MessageContext,
  MessageInfo,
  ProtocolConnection,
  MessageHandler,
  EmptyResult
} from "../protocol/types";
import type { Feature, FeatureContext } from "../protocol/feature";
import type { ProtocolOptions } from "../protocol/protocol";
import type { Connection } from "../protocol/connection";

// =============================================================================
// Re-exports for convenience
// =============================================================================

export type { ServerRequest, ServerNotification, ClientRequest, ClientNotification };

// =============================================================================
// Response Types
// =============================================================================

/**
 * JSON-RPC response wrapper for client results (client -> server responses).
 * Used when client responds to server requests (e.g., sampling/createMessage).
 */
export type ClientResponse = JSONRPCResultResponse<ClientResult>;

/**
 * JSON-RPC response wrapper for server results (server -> client responses).
 * Used when server responds to client requests (e.g., tools/list).
 */
export type ServerResponse = JSONRPCResultResponse<ServerResult>;

// =============================================================================
// Connection Types
// =============================================================================

/**
 * A client-side connection with typed message parameters.
 *
 * Type parameters follow Protocol convention:
 * - Incoming: ServerRequest, ServerNotification, ServerResponse
 * - Outgoing: ClientRequest, ClientNotification, ClientResponse
 */
export type ClientConnection<TContext extends Context = Context> = Connection<
  ServerRequest,
  ServerNotification,
  ServerResponse,
  ClientRequest,
  ClientNotification,
  ClientResponse,
  TContext
>;

/**
 * Protocol connection interface for sending messages to servers.
 */
export type ClientProtocolConnection = ProtocolConnection<ClientRequest, ClientNotification, ClientResponse>;

// =============================================================================
// Client Feature Types
// =============================================================================

/**
 * A feature that can be registered with a Client.
 * Features encapsulate related functionality and handlers.
 *
 * @typeParam TContext - Handler context type (defaults to object for maximum compatibility)
 * @typeParam TRequestMetadata - Transport-specific request metadata
 */
export type ClientFeature<TContext extends object = object, TRequestMetadata extends object = object> = Feature<
  ServerRequest,
  ServerNotification,
  ServerResponse,
  ClientRequest,
  ClientNotification,
  ClientResponse,
  TContext,
  TRequestMetadata
>;

/**
 * Context provided to features during initialization.
 * Used to register handlers for specific methods.
 *
 * @typeParam TContext - Handler context type (defaults to object for maximum compatibility)
 * @typeParam TRequestMetadata - Transport-specific request metadata
 */
export type ClientFeatureContext<TContext extends object = object, TRequestMetadata extends object = object> = FeatureContext<
  ServerRequest,
  ServerNotification,
  ServerResponse,
  ClientRequest,
  ClientNotification,
  ClientResponse,
  TContext,
  TRequestMetadata
>;

// =============================================================================
// Handler Context Types
// =============================================================================

/**
 * Context passed to client message handlers.
 * Provides access to session, logger, and ID generator.
 */
export type ClientMessageContext<TContext extends object = object> = MessageContext<TContext>;

/**
 * Metadata about the incoming message.
 * Contains method name, session ID, and transport-specific metadata.
 */
export type ClientMessageInfo<TRequestMetadata extends object = object> = MessageInfo<TRequestMetadata>;

// =============================================================================
// Handler Types
// =============================================================================

/**
 * Handler function for client requests (server -> client).
 *
 * @typeParam TRequest - The specific request type being handled (from ServerRequest)
 * @typeParam TResult - The result type returned by the handler (goes into ClientResult)
 * @typeParam TContext - Handler context type (defaults to object)
 * @typeParam TRequestMetadata - Transport-specific request metadata
 */
export type ClientRequestHandler<
  TRequest extends ServerRequest,
  TResult extends ClientResult,
  TContext extends object = object,
  TRequestMetadata extends object = object
> = (
  protocol: ClientProtocolConnection,
  request: TRequest,
  context: ClientMessageContext<TContext>,
  info: ClientMessageInfo<TRequestMetadata>
) => Promise<TResult>;

/**
 * Handler function for client notifications (server -> client).
 *
 * @typeParam TNotification - The specific notification type being handled (from ServerNotification)
 * @typeParam TContext - Handler context type (defaults to object)
 * @typeParam TRequestMetadata - Transport-specific request metadata
 */
export type ClientNotificationHandler<
  TNotification extends ServerNotification,
  TContext extends object = object,
  TRequestMetadata extends object = object
> = (
  protocol: ClientProtocolConnection,
  notification: TNotification,
  context: ClientMessageContext<TContext>,
  info: ClientMessageInfo<TRequestMetadata>
) => Promise<EmptyResult>;

/**
 * Convenience type for creating client message handlers compatible with FeatureContext.
 * Use this when registering handlers via ClientFeatureContext.registerHandler().
 */
export type ClientMessageHandler<
  TMessage extends ServerRequest | ServerNotification,
  TContext extends object = object,
  TRequestMetadata extends object = object
> = MessageHandler<TMessage, ServerResponse, ClientRequest, ClientNotification, ClientResponse, TContext, TRequestMetadata>;

// =============================================================================
// Client Options
// =============================================================================

/**
 * Configuration options for the Client.
 *
 * @typeParam TContext - Custom context type that extends base Context
 */
export type ClientOptions<TContext extends Context = Context> = ProtocolOptions<TContext> & {
  /**
   * Client implementation information.
   * Sent to servers during initialization.
   */
  readonly clientInfo: Implementation;

  /**
   * Client capabilities to advertise.
   * Defines what features this client supports.
   */
  readonly capabilities: ClientCapabilities;
};

// =============================================================================
// Callback Types
// =============================================================================

/**
 * Data passed to onInitialize callback when server responds.
 */
export interface ClientInitializeResponseData {
  /** Negotiated protocol version */
  readonly protocolVersion: string;
  /** Server implementation info */
  readonly serverInfo: Implementation;
  /** Server capabilities */
  readonly serverCapabilities: ServerCapabilities;
  /** Optional instructions from server */
  readonly instructions?: string;
}
