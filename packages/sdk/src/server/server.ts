/**
 * Server
 *
 * MCP Server implementation that handles client requests.
 *
 * The Server class:
 * - Extends Protocol with MCP-specific message types
 * - Automatically handles lifecycle (initialize/initialized)
 * - Is stateless at the protocol level - session state is per-connection
 * - Can handle multiple simultaneous client sessions
 *
 * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
 */

import {
  ClientRequest,
  ClientNotification,
  ServerRequest,
  ServerNotification,
  Implementation,
  ServerCapabilities,
  Context,
  RequestOptions,
  JSONRPC_VERSION
} from "../protocol/types";
import { Protocol } from "../protocol/protocol.js";
import type { ServerOptions, ServerResponse, ClientResponse, ServerConnection } from "./types.js";
import { PingFeature } from "./features/ping.js";
import * as lifecycle from "./lifecycle.js";

// =============================================================================
// Server Class
// =============================================================================

/**
 * MCP Server class.
 *
 * Handles client requests and manages server-side features.
 * Automatically handles the MCP lifecycle (initialize/initialized) when
 * constructed with ServerOptions.
 *
 * @example
 * ```typescript
 * // Basic server with lifecycle handling
 * const server = new Server({
 *   serverInfo: { name: "my-server", version: "1.0.0" },
 *   capabilities: { tools: { listChanged: true } },
 *   instructions: "This server provides...",
 *   onReady: (session) => console.log("Session ready:", session?.id)
 * });
 *
 * // Add features
 * server.addFeature(new ToolsFeature({ ... }));
 *
 * // Connect to transport
 * await server.connect(transport);
 * ```
 */
export class Server extends Protocol<
  ClientRequest,
  ClientNotification,
  ServerResponse,
  ServerRequest,
  ServerNotification,
  ClientResponse,
  Context
> {
  /**
   * Server implementation info (if configured with ServerOptions).
   */
  readonly serverInfo?: Implementation;

  /**
   * Server capabilities (if configured with ServerOptions).
   */
  readonly capabilities?: ServerCapabilities;

  /**
   * Optional LLM instructions (if configured with ServerOptions).
   */
  readonly instructions?: string;

  /**
   * Server options.
   */
  readonly serverOptions?: ServerOptions<Context>;

  constructor(options?: ServerOptions<Context>) {
    super(options);

    this.serverOptions = options;
    this.serverInfo = options?.serverInfo;
    this.capabilities = options?.capabilities;
    this.instructions = options?.instructions;

    // Register built-in ping feature
    this.addFeature(new PingFeature());

    // Register lifecycle handlers
    lifecycle.register(this);
  }

  /**
   * Sends a ping request to the client.
   * @param connection The connection to send the ping on
   * @param options Request options including route
   */
  async ping(connection: ServerConnection<Context>, options: RequestOptions): Promise<void> {
    const request: ServerRequest = {
      jsonrpc: JSONRPC_VERSION,
      method: "ping",
      params: {},
      id: this.id.generate({ prefix: "ping" }) as string | number
    };
    await this.send(connection, request, options);
  }
}
