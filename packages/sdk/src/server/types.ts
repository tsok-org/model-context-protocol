/**
 * Server Types
 *
 * Type definitions specific to MCP Server implementations.
 * These types extend and specialize the protocol types for server-side use.
 */

import type {
  ClientRequest,
  ClientNotification,
  ServerResult,
  ServerRequest,
  ServerNotification,
  ClientResult,
  ServerCapabilities,
  ClientCapabilities,
  Implementation,
  JSONRPCResultResponse,
  EmptyResult,
  Context,
  Session,
  MessageContext,
  MessageInfo,
  ProtocolConnection,
  MessageHandler
} from "../protocol/types";
import type { Connection } from "../protocol/connection.js";
import type { Feature, FeatureContext } from "../protocol/feature";
import type { ProtocolOptions } from "../protocol/protocol";

// =============================================================================
// Re-exports for convenience
// =============================================================================

export type { ServerRequest, ServerNotification, ClientRequest, ClientNotification };

// =============================================================================
// Response Types
// =============================================================================

/**
 * JSON-RPC response wrapper for server results.
 */
export type ServerResponse = JSONRPCResultResponse<ServerResult>;

/**
 * JSON-RPC response wrapper for client results.
 */
export type ClientResponse = JSONRPCResultResponse<ClientResult>;

// =============================================================================
// Connection Types
// =============================================================================

/**
 * A server-side connection with typed message parameters.
 */
export type ServerConnection<TContext extends Context = Context> = Connection<
  ClientRequest,
  ClientNotification,
  ServerResponse,
  ServerRequest,
  ServerNotification,
  ClientResponse,
  TContext
>;

/**
 * Protocol connection interface for sending messages to clients.
 */
export type ServerProtocolConnection = ProtocolConnection<ServerRequest, ServerNotification, ClientResponse>;

// =============================================================================
// Server Feature Types
// =============================================================================

/**
 * A feature that can be registered with a Server.
 * Features encapsulate related functionality and handlers.
 *
 * @typeParam TContext - Handler context type (defaults to object for maximum compatibility)
 * @typeParam TRequestMetadata - Transport-specific request metadata
 */
export type ServerFeature<TContext extends object = object, TRequestMetadata extends object = object> = Feature<
  ClientRequest,
  ClientNotification,
  ServerResponse,
  ServerRequest,
  ServerNotification,
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
export type ServerFeatureContext<TContext extends object = object, TRequestMetadata extends object = object> = FeatureContext<
  ClientRequest,
  ClientNotification,
  ServerResponse,
  ServerRequest,
  ServerNotification,
  ClientResponse,
  TContext,
  TRequestMetadata
>;

// =============================================================================
// Handler Context Types
// =============================================================================

/**
 * Context passed to server message handlers.
 * Provides access to session, logger, and ID generator.
 */
export type ServerMessageContext<TContext extends object = object> = MessageContext<TContext>;

/**
 * Metadata about the incoming message.
 * Contains method name, session ID, and transport-specific metadata.
 */
export type ServerMessageInfo<TRequestMetadata extends object = object> = MessageInfo<TRequestMetadata>;

// =============================================================================
// Handler Types
// =============================================================================

/**
 * Handler function for server requests.
 *
 * @typeParam TRequest - The specific request type being handled
 * @typeParam TResult - The result type returned by the handler
 * @typeParam TContext - Handler context type (defaults to object)
 * @typeParam TRequestMetadata - Transport-specific request metadata
 *
 * @remarks
 * Handlers receive the protocol connection, the request message, context, and info.
 * They return a Promise resolving to the result type.
 *
 * Note: The protocol wraps this result in a JSONRPCResultResponse before sending.
 */
export type ServerRequestHandler<
  TRequest extends ClientRequest,
  TResult extends ServerResult,
  TContext extends object = object,
  TRequestMetadata extends object = object
> = (
  protocol: ServerProtocolConnection,
  request: TRequest,
  context: ServerMessageContext<TContext>,
  info: ServerMessageInfo<TRequestMetadata>
) => Promise<TResult>;

/**
 * Handler function for server notifications.
 *
 * @typeParam TNotification - The specific notification type being handled
 * @typeParam TContext - Handler context type (defaults to object)
 * @typeParam TRequestMetadata - Transport-specific request metadata
 */
export type ServerNotificationHandler<
  TNotification extends ClientNotification,
  TContext extends object = object,
  TRequestMetadata extends object = object
> = (
  protocol: ServerProtocolConnection,
  notification: TNotification,
  context: ServerMessageContext<TContext>,
  info: ServerMessageInfo<TRequestMetadata>
) => Promise<EmptyResult>;

/**
 * Convenience type for creating server message handlers compatible with FeatureContext.
 * Use this when registering handlers via ServerFeatureContext.registerHandler().
 */
export type ServerMessageHandler<
  TMessage extends ClientRequest | ClientNotification,
  TContext extends object = object,
  TRequestMetadata extends object = object
> = MessageHandler<TMessage, ServerResponse, ServerRequest, ServerNotification, ClientResponse, TContext, TRequestMetadata>;

// =============================================================================
// Server Options
// =============================================================================

/**
 * Configuration options for the Server.
 *
 * @typeParam TContext - Custom context type that extends base Context
 */
export type ServerOptions<TContext extends Context = Context> = ProtocolOptions<TContext> & {
  /**
   * Server implementation information.
   * Sent to clients during initialization.
   */
  readonly serverInfo: Implementation;

  /**
   * Server capabilities to advertise.
   * Defines what features this server supports.
   */
  readonly capabilities: ServerCapabilities;

  /**
   * Optional instructions for the LLM using this server.
   * Included in the initialize response.
   */
  readonly instructions?: string;

  /**
   * Callback invoked when a client initializes a session.
   */
  readonly onInitialize?: (data: InitializeCallbackData, session?: Session) => Promise<void> | void;

  /**
   * Callback invoked when a session becomes ready (after initialized notification).
   */
  readonly onReady?: (session?: Session) => Promise<void> | void;
};

/**
 * Data provided to the onInitialize callback.
 */
export interface InitializeCallbackData {
  /** Negotiated protocol version */
  readonly protocolVersion: string;
  /** Client implementation info */
  readonly clientInfo: Implementation;
  /** Client capabilities */
  readonly clientCapabilities: ClientCapabilities;
}
