/**
 * Lifecycle Management
 *
 * Handles MCP protocol lifecycle (initialize/initialized).
 */

import { SUPPORTED_PROTOCOL_VERSIONS } from "../protocol/constants";
import type { InitializedNotification, InitializeRequest, InitializeResult, EmptyResult, MessageContext } from "../protocol/types";
import { LATEST_PROTOCOL_VERSION } from "../protocol/types";
import type { Server } from "./server";
import type { ServerRequestHandler, ServerNotificationHandler } from "./types";

/**
 * Register handlers for MCP lifecycle messages.
 * These handlers are stateless - session state is stored in context.session.
 */
export const register = (server: Server): void => {
  // Handle initialize request
  const initializeHandler: ServerRequestHandler<InitializeRequest, InitializeResult> = async (_protocol, request, context, _info) => {
    return handleInitialize(server, request, context);
  };

  server.registerHandler("initialize", initializeHandler);

  // Handle initialized notification
  const initializedHandler: ServerNotificationHandler<InitializedNotification> = async (_protocol, _notification, context, _info) => {
    return handleInitialized(server, context);
  };

  server.registerHandler("notifications/initialized", initializedHandler);
};

/**
 * Handle the initialized notification.
 *
 * Per MCP spec:
 * - Client sends this after receiving InitializeResult
 * - Session is now fully ready for operations
 */
const handleInitialized = async (server: Server, context: MessageContext<object>): Promise<EmptyResult> => {
  const session = context.session;

  // Mark session as ready
  if (session) {
    session.setValue("ready", true);
    session.setValue("readyAt", new Date().toISOString());
  }

  // Call user callback
  if (server.serverOptions?.onReady) {
    await server.serverOptions.onReady(session);
  }

  return {};
};

/**
 * Handle the initialize request.
 *
 * Per MCP spec:
 * - Negotiate protocol version
 * - Exchange capabilities
 * - Return server info
 *
 * Session state (if available) is stored in context.session.
 */
const handleInitialize = async (server: Server, request: InitializeRequest, context: MessageContext<object>): Promise<InitializeResult> => {
  // Validate request
  if (!request.params) {
    throw new Error("Initialize request missing params");
  }

  const { protocolVersion, capabilities, clientInfo } = request.params;

  if (!protocolVersion) {
    throw new Error("Initialize request missing protocolVersion");
  }
  if (!capabilities) {
    throw new Error("Initialize request missing capabilities");
  }
  if (!clientInfo) {
    throw new Error("Initialize request missing clientInfo");
  }

  // Negotiate protocol version
  const negotiatedVersion = negotiateProtocolVersion(protocolVersion);

  // Store in session if available (transport provides session)
  const session = context.session;
  if (session) {
    session.setValue("protocolVersion", negotiatedVersion);
    session.setValue("clientInfo", clientInfo);
    session.setValue("clientCapabilities", capabilities);
    session.setValue("initialized", true);
  }

  // Call user callback
  if (server.serverOptions?.onInitialize) {
    await server.serverOptions.onInitialize(
      {
        protocolVersion: negotiatedVersion,
        clientInfo,
        clientCapabilities: capabilities
      },
      session
    );
  }

  // Build response (capabilities and serverInfo are guaranteed when serverOptions is set)
  const result: InitializeResult = {
    protocolVersion: negotiatedVersion,
    capabilities: server.serverOptions?.capabilities ?? {},
    serverInfo: server.serverOptions?.serverInfo ?? {
      name: "unknown",
      version: "0.0.0"
    }
  };

  if (server.serverOptions?.instructions) {
    result.instructions = server.serverOptions.instructions;
  }

  // Return the result - the protocol will wrap it in JSON-RPC response
  return result;
};

/**
 * Type for supported protocol versions.
 */
export type SupportedProtocolVersion = (typeof SUPPORTED_PROTOCOL_VERSIONS)[number];

/**
 * Check if a protocol version is supported.
 */
export function isProtocolVersionSupported(version: string): boolean {
  return SUPPORTED_PROTOCOL_VERSIONS.includes(version as SupportedProtocolVersion);
}

/**
 * Negotiate protocol version.
 * Returns the client's version if supported, otherwise returns the latest version.
 *
 * Per MCP spec: If the server does not support the requested protocolVersion,
 * it SHOULD respond with the closest version it does support.
 */
export function negotiateProtocolVersion(clientVersion: string): string {
  if (isProtocolVersionSupported(clientVersion)) {
    return clientVersion;
  }
  return LATEST_PROTOCOL_VERSION;
}
