/**
 * Client
 *
 * MCP Client implementation that communicates with servers.
 */

import {
  ServerRequest,
  ServerNotification,
  ClientRequest,
  ClientNotification,
  PingRequest,
  InitializeRequest,
  InitializeResult,
  ListResourcesRequest,
  ListResourcesResult,
  ListResourceTemplatesRequest,
  ListResourceTemplatesResult,
  ReadResourceRequest,
  ReadResourceResult,
  SubscribeRequest,
  UnsubscribeRequest,
  ListPromptsRequest,
  ListPromptsResult,
  GetPromptRequest,
  GetPromptResult,
  ListToolsRequest,
  ListToolsResult,
  CallToolRequest,
  CallToolResult,
  SetLevelRequest,
  CompleteRequest,
  CompleteResult,
  Result,
  Context,
  RequestOptions,
  JSONRPC_VERSION
} from "../protocol/types";
import { Protocol } from "../protocol/protocol.js";
import type { Transport, IncomingMessageContext, IncomingMessageInfo } from "../protocol/transport.js";
import type { ClientOptions, ClientConnection, ClientResponse, ServerResponse } from "./types.js";
import { PingFeature } from "./features/ping.js";

// =============================================================================
// Request/Response Pairs
// =============================================================================

/**
 * Pairs of client requests and their corresponding results.
 */
export type ClientRequestResponsePairs =
  | [InitializeRequest, InitializeResult]
  | [PingRequest, Result]
  | [ListResourcesRequest, ListResourcesResult]
  | [ListResourceTemplatesRequest, ListResourceTemplatesResult]
  | [ReadResourceRequest, ReadResourceResult]
  | [SubscribeRequest, Result]
  | [UnsubscribeRequest, Result]
  | [ListPromptsRequest, ListPromptsResult]
  | [GetPromptRequest, GetPromptResult]
  | [ListToolsRequest, ListToolsResult]
  | [CallToolRequest, CallToolResult]
  | [SetLevelRequest, Result]
  | [CompleteRequest, CompleteResult];

/**
 * Helper type to infer the result type from a request type using the pairs.
 */
export type InferResult<Req, Pairs extends [unknown, unknown]> = Pairs extends [infer R, infer Res] ? (Req extends R ? Res : never) : never;

// =============================================================================
// Client Class
// =============================================================================

/**
 * MCP Client class.
 *
 * Connects to servers and sends requests/notifications.
 *
 * Note: The type parameters follow the Protocol convention:
 * - Incoming = messages FROM server TO client (ServerRequest, ServerNotification, ServerResponse)
 * - Outgoing = messages FROM client TO server (ClientRequest, ClientNotification, ClientResponse)
 */
export class Client extends Protocol<
  ServerRequest,
  ServerNotification,
  ServerResponse,
  ClientRequest,
  ClientNotification,
  ClientResponse,
  Context
> {
  private _connection?: ClientConnection;

  constructor(options?: ClientOptions) {
    super(options);
    // Register built-in ping feature
    this.addFeature(new PingFeature());
  }

  /**
   * Connects to the server via the given transport.
   */
  override async connect(
    transport: Transport<
      ServerRequest | ServerNotification | ServerResponse,
      IncomingMessageContext<Context>,
      IncomingMessageInfo,
      ClientRequest | ClientNotification | ClientResponse
    >
  ): Promise<ClientConnection> {
    this._connection = await super.connect(transport);
    return this._connection;
  }

  /**
   * Sends a request to the connected server.
   * Returns the unwrapped result (not the full JSON-RPC response).
   */
  async request<Request extends ClientRequest>(
    request: Omit<Request, "id" | "jsonrpc">,
    options: RequestOptions
  ): Promise<InferResult<Request, ClientRequestResponsePairs>> {
    if (!this._connection) {
      throw new Error("Client not connected");
    }
    const fullRequest = {
      jsonrpc: JSONRPC_VERSION,
      id: this.id.generate({ prefix: "request" }) as string | number,
      ...request
    } as ClientRequest;

    // send() returns the wrapped JSONRPCResultResponse, but we extract the result
    const response = await this.send(this._connection, fullRequest, options);
    if (response && "result" in response) {
      return response.result as InferResult<Request, ClientRequestResponsePairs>;
    }
    // For notifications or void responses
    return {} as InferResult<Request, ClientRequestResponsePairs>;
  }

  /**
   * Sends a notification to the connected server.
   */
  async notification(notification: Omit<ClientNotification, "jsonrpc">, options: RequestOptions): Promise<void> {
    if (!this._connection) {
      throw new Error("Client not connected");
    }
    const fullNotification = {
      jsonrpc: JSONRPC_VERSION,
      ...notification
    } as ClientNotification;

    await this.send(this._connection, fullNotification, options);
  }

  /**
   * Sends a ping request to the server.
   */
  async ping(options: RequestOptions): Promise<void> {
    await this.request<PingRequest>(
      {
        method: "ping",
        params: {}
      },
      options
    );
  }
}
