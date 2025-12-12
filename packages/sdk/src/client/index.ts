/**
 * Client Module Index
 *
 * Re-exports client components.
 *
 * @example
 * ```typescript
 * import { Client, Feature, Options, Connection, RequestHandler } from "@mcp/sdk/client";
 * ```
 */

// Client class
export { Client, type ClientRequestResponsePairs, type InferResult } from "./client.js";

// Client types
export type {
  ClientFeature as Feature,
  ClientFeatureContext as FeatureContext,
  ClientMessageContext as MessageContext,
  ClientMessageInfo as MessageInfo,
  ClientProtocolConnection as ProtocolConnection,
  ClientRequestHandler as RequestHandler,
  ClientNotificationHandler as NotificationHandler,
  ClientOptions as Options,
  ClientConnection as Connection,
  ClientResponse as Response,
  ServerResponse as IncomingResponse,
  ClientInitializeResponseData as InitializeResponseData
} from "./types.js";

// Re-export message types
export type { ServerRequest, ServerNotification, ClientRequest, ClientNotification } from "./types.js";

// Client features
export { PingFeature } from "./features/index.js";
