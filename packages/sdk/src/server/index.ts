/**
 * Server Module Index
 *
 * Re-exports server components.
 *
 * The Server class automatically handles MCP lifecycle (initialize/initialized)
 * when constructed with ServerOptions. Session state is stored per-connection
 * via context.session, allowing the server to handle multiple simultaneous clients.
 *
 * @example
 * ```typescript
 * import { Server, Feature, Options, Connection, RequestHandler } from "@mcp/sdk/server";
 * ```
 */

// Server class
export { Server } from "./server.js";

// Server types
export type {
  ServerFeature as Feature,
  ServerFeatureContext as FeatureContext,
  ServerMessageContext as MessageContext,
  ServerMessageInfo as MessageInfo,
  ServerProtocolConnection as ProtocolConnection,
  ServerRequestHandler as RequestHandler,
  ServerNotificationHandler as NotificationHandler,
  ServerOptions as Options,
  ServerConnection as Connection,
  ServerResponse as Response,
  ClientResponse as IncomingResponse,
  InitializeCallbackData
} from "./types.js";

// Re-export message types
export type { ServerRequest, ServerNotification, ClientRequest, ClientNotification } from "./types.js";

// Server features (tools, resources, prompts, etc.)
export {
  PingFeature,
  ToolsFeature,
  type ToolCallback,
  PromptsFeature,
  type PromptCallback,
  ResourcesFeature,
  type ResourceCallback,
  CompletionFeature,
  type CompletionCallback,
  type Completion,
  type Logging
} from "./features/index.js";
